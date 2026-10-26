import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {usableModels} from '../../src/lib/realWorld.ts';
import {validatePreviewPNG} from './preview-image.mjs';

const DECODER_FILES = [
  'decoders/draco/draco_wasm_wrapper.js',
  'decoders/draco/draco_decoder.wasm',
  'decoders/basis/basis_transcoder.js',
  'decoders/basis/basis_transcoder.wasm',
];
const KTX2_MAGIC = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function ensure(condition, message) {
  if (!condition) throw new Error(`模型校验失败：${message}`);
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function bytes(value, label) {
  ensure(value instanceof Uint8Array, `${label} 缺少本地文件`);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
function parseJSON(data, label) {
  try { return JSON.parse(data.toString('utf8').replace(/[\u0000\s]+$/g, '')); }
  catch { throw new Error(`模型校验失败：${label} JSON 无效`); }
}
function pathKey(key) {
  ensure(typeof key === 'string' && key.length > 0 && !/[\\?#%\u0000]/.test(key) && !key.startsWith('/') && !/^[a-z]+:/i.test(key), `文件路径无效：${key}`);
  ensure(path.posix.normalize(key) === key && !key.split('/').some(part => part === '..' || part === '.' || part === ''), `文件路径逃逸或未规范化：${key}`);
  return key;
}
function reference(owner, uri, modelId) {
  ensure(typeof uri === 'string' && uri.length > 0, `${owner} 引用路径为空`);
  ensure(!/^[a-z][a-z0-9+.-]*:/i.test(uri) && !uri.startsWith('//') && !/[\\?#\u0000]/.test(uri), `${owner} 含远程或非法引用：${uri}`);
  let decoded;
  try { decoded = decodeURIComponent(uri); } catch { throw new Error(`模型校验失败：${owner} 引用编码无效`); }
  ensure(!/[\\?#%\u0000]/.test(decoded) && !/^[a-z][a-z0-9+.-]*:/i.test(decoded), `${owner} 引用编码后无效：${uri}`);
  const next = decoded.startsWith('/models/') ? decoded.slice('/models/'.length) : decoded.startsWith('/') ? null : path.posix.normalize(path.posix.join(path.posix.dirname(owner), decoded));
  ensure(next !== null && next.startsWith(`${modelId}/`), `${owner} 引用路径逃出模型目录：${uri}`);
  return pathKey(next);
}

/** Parse a complete GLB, including optional B3DM padding after its declared end. */
export function parseGLB(data, label = 'GLB', { allowOuterPadding = false } = {}) {
  const input = bytes(data, label);
  ensure(input.length >= 20 && input.toString('ascii', 0, 4) === 'glTF', `${label} GLB 魔术头无效`);
  ensure(input.readUInt32LE(4) === 2, `${label} GLB 必须为版本 2`);
  const length = input.readUInt32LE(8);
  ensure(length >= 20 && length <= input.length, `${label} GLB 声明长度越界`);
  const padding = input.subarray(length);
  ensure(padding.length === 0 || (allowOuterPadding && padding.length <= 7 && [...padding].every(value => value === 0 || value === 32)), `${label} GLB 长度与内容不符`);
  let offset = 12, json = null, binary = null;
  while (offset < length) {
    ensure(offset + 8 <= length, `${label} GLB 分块头越界`);
    const chunkLength = input.readUInt32LE(offset), chunkType = input.readUInt32LE(offset + 4);
    ensure(chunkLength % 4 === 0 && offset + 8 + chunkLength <= length, `${label} GLB 分块长度越界`);
    const chunk = input.subarray(offset + 8, offset + 8 + chunkLength);
    if (offset === 12) ensure(chunkType === JSON_CHUNK, `${label} GLB 首块必须为 JSON`);
    if (chunkType === JSON_CHUNK) {
      ensure(json === null, `${label} GLB 含重复 JSON 块`);
      json = parseJSON(chunk, label);
    } else if (chunkType === BIN_CHUNK) {
      ensure(binary === null, `${label} GLB 含重复 BIN 块`);
      binary = chunk;
    }
    offset += 8 + chunkLength;
  }
  ensure(offset === length && object(json), `${label} GLB JSON 结构无效`);
  return { json, binary };
}

export function parseB3DM(data, label = 'B3DM') {
  const input = bytes(data, label);
  ensure(input.length >= 28 && input.toString('ascii', 0, 4) === 'b3dm', `${label} B3DM 魔术头无效`);
  ensure(input.readUInt32LE(4) === 1, `${label} B3DM 必须为版本 1`);
  ensure(input.readUInt32LE(8) === input.length, `${label} B3DM 声明长度与文件大小不符`);
  const tableLengths = [12, 16, 20, 24].map(offset => input.readUInt32LE(offset));
  const glbOffset = 28 + tableLengths.reduce((sum, length) => sum + length, 0);
  ensure(glbOffset + 20 <= input.length, `${label} B3DM 表长度越界`);
  if (tableLengths[0]) ensure(object(parseJSON(input.subarray(28, 28 + tableLengths[0]), `${label} feature table`)), `${label} feature table 无效`);
  const batchStart = 28 + tableLengths[0] + tableLengths[1];
  if (tableLengths[2]) ensure(object(parseJSON(input.subarray(batchStart, batchStart + tableLengths[2]), `${label} batch table`)), `${label} batch table 无效`);
  return parseGLB(input.subarray(glbOffset), `${label} 嵌入`, { allowOuterPadding: true });
}

function dataURI(uri, label) {
  const match = /^data:[^,]*;base64,([a-z0-9+/=\s]*)$/i.exec(uri);
  ensure(match !== null, `${label} 内联资源必须为 base64 data URI`);
  return Buffer.from(match[1], 'base64');
}

/** The complete-scene base is two triangles covering the declared rectangle, without a hole. */
export function validateContinuousSurface({json,binary}, surface, axis='Y') {
  ensure(surface?.continuous === true && surface.bounds?.length === 4 && surface.bounds.every(Number.isFinite) && Number.isFinite(surface.groundZ), '连续地表字段无效');
  const [west,south,east,north]=surface.bounds;
  ensure(east>west&&north>south,'连续地表范围无效');
  const node=json.nodes?.find(n=>n.name==='ground');
  ensure(node&&Number.isInteger(node.mesh)&&!node.matrix&&!node.translation&&!node.rotation&&!node.scale,'缺少未变换的连续地表节点');
  const primitive=json.meshes?.[node.mesh]?.primitives?.[0];
  ensure(primitive&&(primitive.mode??4)===4,'地表三角网缺失');
  function accessor(index, components) {
    const a=json.accessors?.[index], view=json.bufferViews?.[a?.bufferView];
    const size={5123:2,5125:4,5126:4}[a?.componentType];
    ensure(a&&view&&view.buffer===0&&size&&a.type===(components===3?'VEC3':'SCALAR')&&!a.sparse,'地表访问器无效');
    const start=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??size*components;
    ensure(start>=0&&stride>=size*components&&start+(a.count-1)*stride+size*components<=binary.length,'地表访问器越界');
    return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>{
      const offset=start+i*stride+j*size;
      return a.componentType===5126?binary.readFloatLE(offset):a.componentType===5125?binary.readUInt32LE(offset):binary.readUInt16LE(offset);
    }));
  }
  const positions=accessor(primitive.attributes?.POSITION,3).map(p=>axis==='Z'?p:[p[0],-p[2],p[1]]);
  const indices=accessor(primitive.indices,1).flat();
  ensure(indices.length===6,'连续地表必须包含完整的两个三角面');
  const corners=[[west,south],[east,south],[east,north],[west,north]], edges=new Map(), unique=new Set();
  for(let i=0;i<6;i+=3){
    const ids=indices.slice(i,i+3).map(index=>{
      const p=positions[index];ensure(p&&p.every(Number.isFinite)&&Math.abs(p[2]-surface.groundZ)<.05,'地表高度或坐标无效');
      const corner=corners.findIndex(c=>Math.abs(p[0]-c[0])<.05&&Math.abs(p[1]-c[1])<.05);
      ensure(corner>=0,'地表角点与声明范围不符');return corner;
    });
    ensure(new Set(ids).size===3,'地表包含退化三角面');
    unique.add([...ids].sort().join(','));
    const [a,b,c]=ids.map(i=>corners[i]);
    ensure((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0,'地表面朝向错误');
    for(let j=0;j<3;j++){const k=[ids[j],ids[(j+1)%3]].sort().join(',');edges.set(k,(edges.get(k)??0)+1);}
  }
  ensure(unique.size===2&&['0,1','1,2','2,3','0,3'].every(e=>edges.get(e)===1)&&[...edges].filter(([,n])=>n===2).length===1,'地表存在重复、重叠或缺口');
  ensure(json.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorTexture,'连续地表缺少本地影像纹理');
}

export function validateSceneRoot(tileset) {
  const root=tileset.root;
  ensure(Number.isFinite(root?.geometricError)&&root.geometricError>0&&root.children?.length>0,'复合场景根层误差必须大于零');
  ensure(root.children.every(c=>Number.isFinite(c.geometricError)&&c.geometricError<root.geometricError),'复合场景根层必须大于子层误差，避免摄影瓦片下载但不显示');
}

/** Extension declaration checks also apply to nested materials, primitives and textures. */
export function validateGLTF(json, binary, label = 'glTF', resolveResource = () => { throw new Error(`模型校验失败：${label} 含未提供的外部资源`); }) {
  ensure(object(json) && json.asset?.version === '2.0', `${label} glTF asset.version 必须为 2.0`);
  const used = json.extensionsUsed ?? [], required = json.extensionsRequired ?? [];
  ensure(Array.isArray(used) && used.every(value => typeof value === 'string') && new Set(used).size === used.length, `${label} extensionsUsed 无效`);
  ensure(Array.isArray(required) && required.every(value => used.includes(value)), `${label} extensionsRequired 未包含于 extensionsUsed`);
  function walk(value) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!object(value)) return;
    if (object(value.extensions)) for (const name of Object.keys(value.extensions)) ensure(used.includes(name), `${label} 扩展 ${name} 未声明于 extensionsUsed`);
    Object.values(value).forEach(walk);
  }
  walk(json);
  const buffers = (json.buffers ?? []).map((buffer, index) => {
    ensure(object(buffer) && Number.isInteger(buffer.byteLength) && buffer.byteLength >= 0, `${label} buffer ${index} 长度无效`);
    const content = buffer.uri ? (buffer.uri.startsWith('data:') ? dataURI(buffer.uri, label) : resolveResource(buffer.uri)) : (index === 0 ? binary : null);
    const input = bytes(content, `${label} buffer ${index}`);
    ensure(input.length >= buffer.byteLength && (buffer.uri || input.length - buffer.byteLength <= 3), `${label} buffer ${index} 长度与内容不符`);
    return input.subarray(0, buffer.byteLength);
  });
  const views = (json.bufferViews ?? []).map((view, index) => {
    const offset = view.byteOffset ?? 0;
    ensure(object(view) && Number.isInteger(view.buffer) && buffers[view.buffer] && Number.isInteger(offset) && offset >= 0 && Number.isInteger(view.byteLength) && view.byteLength >= 0 && offset + view.byteLength <= buffers[view.buffer].length, `${label} bufferView ${index} 越界`);
    return buffers[view.buffer].subarray(offset, offset + view.byteLength);
  });
  const ktxImages = new Set();
  (json.images ?? []).forEach((image, index) => {
    ensure(object(image), `${label} image ${index} 无效`);
    let content;
    if (image.uri) content = image.uri.startsWith('data:') ? dataURI(image.uri, label) : resolveResource(image.uri);
    else { ensure(Number.isInteger(image.bufferView) && views[image.bufferView], `${label} image ${index} 缺少有效 bufferView`); content = views[image.bufferView]; }
    const input = bytes(content, `${label} image ${index}`), isKTX = input.subarray(0, 12).equals(KTX2_MAGIC);
    if (image.mimeType === 'image/ktx2' || isKTX) {
      ensure(isKTX && input.length >= 80, `${label} image ${index} KTX2 文件头无效`);
      ensure(used.includes('KHR_texture_basisu'), `${label} KTX2 未声明 KHR_texture_basisu`);
      ktxImages.add(index);
    }
  });
  (json.textures ?? []).forEach((texture, index) => {
    const basis = texture.extensions?.KHR_texture_basisu;
    if (basis) ensure(Number.isInteger(basis.source) && ktxImages.has(basis.source), `${label} texture ${index} KHR_texture_basisu.source 无效`);
    if (Number.isInteger(texture.source)) ensure(!ktxImages.has(texture.source), `${label} KTX2 必须通过 KHR_texture_basisu.source 引用`);
  });
  return { extensions: [...used], imageCount: (json.images ?? []).length };
}

/** Pure validation: the caller supplies bytes, so fixtures require no disk writes. */
export function validateModelResources({ manifest, catalog, files }) {
  ensure(object(manifest) && typeof manifest.version === 'string' && manifest.version.length > 0 && Array.isArray(manifest.models) && manifest.models.length > 0 && object(manifest.files), '模型清单顶层字段不完整');
  ensure(object(catalog) && Array.isArray(catalog.profiles) && Array.isArray(catalog.regions), '城市 catalog 无效');
  const contents = files instanceof Map ? files : new Map(Object.entries(files ?? {}));
  const profileIds = new Set(catalog.profiles.map(profile => profile.id));
  const regionCityIds = new Set(catalog.regions.flatMap(region => region.memberCityIds ?? []));
  const ids = new Set(), visited = new Set(), allExtensions = new Set();
  for (const [key, record] of Object.entries(manifest.files)) {
    pathKey(key);
    ensure(object(record) && Number.isSafeInteger(record.bytes) && record.bytes > 0 && /^[a-f0-9]{64}$/.test(record.sha256), `${key} 大小或哈希字段不完整`);
    const input = bytes(contents.get(key), key);
    ensure(input.length === record.bytes, `${key} 文件大小不符`);
    ensure(createHash('sha256').update(input).digest('hex') === record.sha256, `${key} SHA256 不符`);
  }
  for (const key of contents.keys()) ensure(Object.hasOwn(manifest.files, pathKey(key)), `${key} 未记录于文件清单`);
  for (const decoder of DECODER_FILES) ensure(Object.hasOwn(manifest.files, decoder), `缺少解码器字段：${decoder}`);
  for (const decoder of DECODER_FILES.filter(key => key.endsWith('.wasm'))) {
    const input = bytes(contents.get(decoder), decoder);
    ensure(input.length >= 8 && input.readUInt32LE(0) === 0x6d736100 && input.readUInt32LE(4) === 1, `${decoder} WASM 文件头无效`);
  }
  function read(key) {
    ensure(Object.hasOwn(manifest.files, key), `${key} 引用文件未记录或缺失`);
    visited.add(key);
    return bytes(contents.get(key), key);
  }
  const modelSummaries = [];
  for (const model of manifest.models) {
    ensure(object(model) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(model.id) && !ids.has(model.id), '模型 ID 无效或重复');
    ids.add(model.id);
    ensure(/^\d{6}$/.test(model.cityId) && profileIds.has(model.cityId) && regionCityIds.has(model.cityId), `${model.id} 城市 ID 未接入 catalog：${model.cityId}`);
    ensure(model.url === `/models/${model.id}/tileset.json`, `${model.id} 本地 URL 与模型 ID 不匹配`);
    ensure(['photogrammetry', 'building-mass', 'landmark', 'reconstruction'].includes(model.kind), `${model.id} 模型类型无效`);
    for (const field of ['city', 'name', 'coverage', 'qualityNote', 'sourceName', 'captureDate']) ensure(typeof model[field] === 'string' && model[field].trim().length > 0, `${model.id} ${field} 缺失`);
    for (const field of ['sourceUrl', 'exampleUrl']) ensure(typeof model[field] === 'string' && /^https:\/\//.test(model[field]), `${model.id} ${field} 缺失`);
    const ownKeys = Object.keys(manifest.files).filter(key => key.startsWith(`${model.id}/`));
    const size = ownKeys.reduce((sum, key) => sum + manifest.files[key].bytes, 0);
    const tileCount = ownKeys.filter(key => /\.(b3dm|glb|gltf)$/i.test(key)).length;
    ensure(Number.isSafeInteger(model.bytes) && model.bytes === size, `${model.id} 总大小不符`);
    ensure(Number.isInteger(model.tileCount) && model.tileCount > 0 && model.tileCount === tileCount, `${model.id} 模型瓦片数不符`);
    const completed = new Set(), stack = new Set();
    function inspect(key) {
      if (completed.has(key)) return;
      ensure(!stack.has(key), `${key} 含循环 tileset 引用`);
      stack.add(key);
      const input = read(key), extension = path.posix.extname(key).toLowerCase();
      const resolveResource = uri => read(reference(key, uri, model.id));
      if (extension === '.json') {
        const tileset = parseJSON(input, key);
        ensure(tileset.asset?.version === '1.0' && object(tileset.root), `${key} 必须为兼容的 3D Tiles 1.0 tileset`);
        function walk(tile) {
          ensure(object(tile) && object(tile.boundingVolume), `${key} tile 缺少范围`);
          const volumeKinds = Object.keys(tile.boundingVolume);
          ensure(volumeKinds.length === 1 && ['box', 'sphere', 'region'].includes(volumeKinds[0]), `${key} boundingVolume 类型无效`);
          const volume = tile.boundingVolume[volumeKinds[0]], expectedLength = { box: 12, sphere: 4, region: 6 }[volumeKinds[0]];
          ensure(Array.isArray(volume) && volume.length === expectedLength && volume.every(Number.isFinite), `${key} boundingVolume 长度或数字无效`);
          if (volumeKinds[0] === 'sphere') ensure(volume[3] > 0, `${key} 球半径无效`);
          if (tile.transform) ensure(Array.isArray(tile.transform) && tile.transform.length === 16 && tile.transform.every(Number.isFinite), `${key} transform 无效`);
          const content = tile.content ? [tile.content] : [];
          if (tile.contents) { ensure(Array.isArray(tile.contents), `${key} contents 无效`); content.push(...tile.contents); }
          for (const item of content) {
            ensure(object(item), `${key} content 无效`);
            const uri = item.uri ?? item.url;
            const next = reference(key, uri, model.id);
            ensure(/\.(json|b3dm|glb|gltf)$/i.test(next), `${key} content 类型未纳入当前校验：${uri}`);
            inspect(next);
          }
          if (tile.children) { ensure(Array.isArray(tile.children), `${key} children 无效`); tile.children.forEach(walk); }
          ensure(!tile.implicitTiling && !tile.extensions?.['3DTILES_implicit_tiling'], `${key} 当前未准入隐式 tileset`);
        }
        walk(tileset.root);
      } else if (extension === '.b3dm' || extension === '.glb' || extension === '.gltf') {
        const gltf = extension === '.b3dm' ? parseB3DM(input, key) : extension === '.glb' ? parseGLB(input, key) : { json: parseJSON(input, key), binary: null };
        const result = validateGLTF(gltf.json, gltf.binary, key, resolveResource);
        result.extensions.forEach(name => allExtensions.add(name));
      } else throw new Error(`模型校验失败：${key} 模型内容类型不支持`);
      stack.delete(key);
      completed.add(key);
    }
    inspect(`${model.id}/tileset.json`);
    if(model.surface){
      ensure(model.surface.contextUrl===`/models/${model.id}/context.b3dm`,'连续地表入口不一致');
      const root=parseJSON(read(`${model.id}/tileset.json`),model.id);validateSceneRoot(root);
      validateContinuousSurface(parseB3DM(read(`${model.id}/context.b3dm`)),model.surface,root.asset.gltfUpAxis??'Y');
      ensure(Array.isArray(model.cameraDirection)&&model.cameraDirection.length===3&&model.cameraDirection.every(Number.isFinite)&&Math.hypot(...model.cameraDirection)>0,'场景取景方向无效');
      ensure(model.landmarks?.length>0,'场景缺少可选近景');
      for(const point of model.landmarks){
        const p=point.position,[w,s,e,n]=model.surface.bounds;
        ensure(typeof point.name==='string'&&p?.length===3&&p.every(Number.isFinite)&&p[0]>=w&&p[0]<=e&&p[1]>=s&&p[1]<=n&&point.height>0,'地标视点不在场景范围或字段无效');
      }
    }
    if (model.preview) validatePreviewPNG(read(reference(`${model.id}/tileset.json`, model.preview, model.id)));
    for (const key of ownKeys) ensure(visited.has(key), `${key} 未被当前本地模型引用`);
    modelSummaries.push({ id: model.id, cityId: model.cityId, files: ownKeys.length, tiles: tileCount, bytes: size });
  }
  for (const key of Object.keys(manifest.files)) ensure(key.startsWith('decoders/') || [...ids].some(id => key.startsWith(`${id}/`)), `${key} 不属于已接入模型或解码器`);
  return { models: modelSummaries, fileCount: contents.size, extensions: [...allExtensions].sort(), totalBytes: [...contents.values()].reduce((sum, input) => sum + input.byteLength, 0) };
}

export function loadModelResources(projectRoot = ROOT) {
  const modelRoot = path.resolve(projectRoot, 'public/models'), files = new Map();
  const manifest = JSON.parse(fs.readFileSync(path.join(modelRoot, 'manifest.json'), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/catalog.json'), 'utf8'));
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const key = prefix + entry.name, absolute = path.join(directory, entry.name);
      ensure(!entry.isSymbolicLink(), `${key} 不允许符号链接`);
      if (entry.isDirectory()) visit(absolute, `${key}/`);
      else if (entry.isFile() && key !== 'manifest.json') files.set(key, fs.readFileSync(absolute));
    }
  }
  visit(modelRoot);
  return { manifest, catalog, files };
}

export function validateLocalModels(projectRoot = ROOT) {
  const input=loadModelResources(projectRoot);usableModels(input.manifest,input.catalog.profiles.map(p=>p.id));
  for(const model of input.manifest.models){
    const ids=new Set();
    for(const owner of model.landmarkOwnership??[]){
      ensure(model.landmarks.some(p=>p.name===owner.name)&&/^\d+$/.test(owner.osmId)&&Array.isArray(owner.excludedOsmIds)&&owner.excludedOsmIds.includes(owner.osmId),'地标归属记录无效');
      for(const id of owner.excludedOsmIds){ensure(/^\d+$/.test(id)&&!ids.has(id),'同一建筑部件被重复归属');ids.add(id);}
    }
  }
  return validateModelResources(input);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = validateLocalModels(process.argv[2] ? path.resolve(process.argv[2]) : ROOT);
    console.log(`真实模型校验通过：${summary.models.length} 处模型、${summary.fileCount} 个本地文件、${(summary.totalBytes / 1024 ** 2).toFixed(1)} MiB。`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

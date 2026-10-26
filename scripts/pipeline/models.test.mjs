import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateModelResources, loadModelResources, parseB3DM, validateContinuousSurface, validateSceneRoot } from './validate-models.mjs';

function glb(json, binary = Buffer.alloc(0)) {
  const text = Buffer.from(JSON.stringify(json)), pad = Buffer.alloc((4 - text.length % 4) % 4, 32);
  const jsonData = Buffer.concat([text, pad]);
  const bin = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
  const result = Buffer.alloc(12 + 8 + jsonData.length + (bin.length ? 8 + bin.length : 0));
  result.write('glTF', 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonData.length, 12); result.writeUInt32LE(0x4e4f534a, 16); jsonData.copy(result, 20);
  if (bin.length) { const offset = 20 + jsonData.length; result.writeUInt32LE(bin.length, offset); result.writeUInt32LE(0x004e4942, offset + 4); bin.copy(result, offset + 8); }
  return result;
}
function b3dm(json, binary) {
  const payload = glb(json, binary), result = Buffer.alloc(28 + payload.length);
  result.write('b3dm', 0); result.writeUInt32LE(1, 4); result.writeUInt32LE(result.length, 8); payload.copy(result, 28);
  return result;
}
function fixture({ json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }, binary, uri = 'city.b3dm', cityId = '310000' } = {}) {
  const tile = { asset: { version: '1.0' }, root: { boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 0, content: { uri } } };
  const files = new Map([
    ['sample-city/tileset.json', Buffer.from(JSON.stringify(tile))],
    ['sample-city/city.b3dm', b3dm(json, binary)],
    ['decoders/draco/draco_wasm_wrapper.js', Buffer.from('/* fixture decoder */')],
    ['decoders/draco/draco_decoder.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
    ['decoders/basis/basis_transcoder.js', Buffer.from('/* fixture transcoder */')],
    ['decoders/basis/basis_transcoder.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
  ]);
  const records = Object.fromEntries([...files].map(([key, data]) => [key, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }]));
  return {
    files, catalog: { profiles: [{ id: '310000' }], regions: [{ id: 'yangtze', memberCityIds: ['310000'] }] },
    manifest: { version: 'fixture-v1', files: records, models: [{ id: 'sample-city', cityId, city: '上海', name: '测试地点', kind: 'landmark', url: '/models/sample-city/tileset.json', coverage: '局部地点', qualityNote: 'fixture', sourceName: '测试来源', captureDate: '未知', sourceUrl: 'https://example.org/source', exampleUrl: 'https://example.org/example', bytes: records['sample-city/tileset.json'].bytes + records['sample-city/city.b3dm'].bytes, tileCount: 1 }] },
  };
}

test('发布资源全部城市可路由，模型、嵌套引用、压缩与文件校验通过', () => {
  const input = loadModelResources(), result = validateModelResources(input);
  assert.equal(result.models.length, input.manifest.models.length);
  assert.ok(result.models.some(model => model.cityId === '310000'), '上海必须采用 catalog 现有 ID');
  assert.ok(result.extensions.includes('KHR_texture_basisu'));
  assert.ok(result.extensions.includes('KHR_materials_unlit'));
  assert.ok(result.fileCount > 100);
});

test('接受完整本地参考模型，不依赖真实资源生成 fixture', () => {
  const result = validateModelResources(fixture());
  assert.equal(result.models[0].tiles, 1);
  assert.equal(result.models[0].cityId, '310000');
});

test('拒绝真实上海曾误用的 310100 城市 ID', () => {
  assert.throws(() => validateModelResources(fixture({ cityId: '310100' })), /城市 ID 未接入 catalog/);
});

test('城市存在于 profiles 但不在任何地区时不可放行', () => {
  const input = fixture(); input.catalog.regions = [];
  assert.throws(() => validateModelResources(input), /城市 ID 未接入 catalog/);
});

test('拒绝缺失瓦片引用与远程回退', () => {
  assert.throws(() => validateModelResources(fixture({ uri: 'absent.b3dm' })), /引用文件未记录或缺失/);
  assert.throws(() => validateModelResources(fixture({ uri: 'https://example.org/city.b3dm' })), /远程或非法引用/);
});

test('拒绝相对路径与编码路径逃逸', () => {
  assert.throws(() => validateModelResources(fixture({ uri: '../outside.b3dm' })), /逃出模型目录/);
  assert.throws(() => validateModelResources(fixture({ uri: '%2e%2e/outside.b3dm' })), /逃出模型目录/);
});

test('文件被修改但清单未更新时，哈希校验失败', () => {
  const input = fixture(), data = Buffer.from(input.files.get('sample-city/city.b3dm'));
  data[data.length - 1] ^= 1; input.files.set('sample-city/city.b3dm', data);
  assert.throws(() => validateModelResources(input), /SHA256 不符/);
});

test('拒绝无声明的 KHR_materials_unlit，防止加载器忽略材质扩展', () => {
  const json = { asset: { version: '2.0' }, materials: [{ extensions: { KHR_materials_unlit: {} } }] };
  assert.throws(() => validateModelResources(fixture({ json })), /KHR_materials_unlit 未声明/);
});

test('KTX2 图片未声明 KHR_texture_basisu 时不可放行', () => {
  const binary = Buffer.alloc(80); Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(binary);
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: 80 }], bufferViews: [{ buffer: 0, byteLength: 80 }], images: [{ bufferView: 0, mimeType: 'image/ktx2' }] };
  assert.throws(() => validateModelResources(fixture({ json, binary })), /KTX2 未声明 KHR_texture_basisu/);
});

test('拒绝 KTX2 绕过 basisu 的普通 source 引用', () => {
  const binary = Buffer.alloc(80); Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(binary);
  const json = { asset: { version: '2.0' }, extensionsUsed: ['KHR_texture_basisu'], buffers: [{ byteLength: 80 }], bufferViews: [{ buffer: 0, byteLength: 80 }], images: [{ bufferView: 0, mimeType: 'image/ktx2' }], textures: [{ source: 0 }] };
  assert.throws(() => validateModelResources(fixture({ json, binary })), /KTX2 必须通过 KHR_texture_basisu/);
});

test('损坏 B3DM 与嵌入 GLB 长度都会被解析器拒绝', () => {
  const valid = b3dm({ asset: { version: '2.0' } });
  const brokenOuter = Buffer.from(valid); brokenOuter.writeUInt32LE(valid.length + 4, 8);
  assert.throws(() => parseB3DM(brokenOuter), /B3DM 声明长度/);
  const brokenInner = Buffer.from(valid); brokenInner.writeUInt32LE(valid.length, 28 + 8);
  assert.throws(() => parseB3DM(brokenInner), /GLB 声明长度越界/);
});

test('解码器文件清单字段缺失时，发布验证失败', () => {
  const input = fixture(); input.files.delete('decoders/basis/basis_transcoder.wasm'); delete input.manifest.files['decoders/basis/basis_transcoder.wasm'];
  assert.throws(() => validateModelResources(input), /缺少解码器字段/);
});

test('五处连续地表都以完整三角网覆盖声明范围，保留影像纹理与地标近景',()=>{
 const input=loadModelResources();assert.equal(input.manifest.models.length,5);
 for(const m of input.manifest.models){
  const root=JSON.parse(input.files.get(`${m.id}/tileset.json`));validateSceneRoot(root);
  const data=parseB3DM(input.files.get(`${m.id}/context.b3dm`));
  validateContinuousSurface(data,m.surface,root.asset.gltfUpAxis);
  const volume=root.root.boundingVolume.box,axis=root.asset.gltfUpAxis==='Z'?2:1;
  for(const mesh of data.json.meshes)for(const p of mesh.primitives){
   const a=data.json.accessors[p.attributes.POSITION];assert.ok(a.max[axis]<=volume[2]+volume[11],'bounding volume must include spire tube caps');
  }
  assert.ok(m.landmarks.length>0);
 }
});
function groundFixture(){
 const input=loadModelResources(),m=input.manifest.models.find(m=>m.cityId==='310000');
 return {data:parseB3DM(input.files.get(`${m.id}/context.b3dm`)),surface:m.surface};
}
test('拒绝地表丢失或只剩一个三角面，不能用文件齐全代替空间完整',()=>{
 const {data,surface}=groundFixture();const node=data.json.nodes.find(n=>n.name==='ground');
 const primitive=data.json.meshes[node.mesh].primitives[0];data.json.accessors[primitive.indices].count=3;
 assert.throws(()=>validateContinuousSurface(data,surface),/完整的两个/);
 node.name='removed';assert.throws(()=>validateContinuousSurface(data,surface),/地表节点/);
});
test('拒绝宣称更大范围或错误地面高度',()=>{
 const {data,surface}=groundFixture();assert.throws(()=>validateContinuousSurface(data,{...surface,bounds:[-1800,-1400,1700,1400]}),/角点/);
 assert.throws(()=>validateContinuousSurface(data,{...surface,groundZ:100}),/高度/);
});
test('拒绝重复地表三角面，防止面积合计掩盖一半缺口',()=>{
 const {data,surface}=groundFixture(),node=data.json.nodes.find(n=>n.name==='ground');
 const a=data.json.accessors[data.json.meshes[node.mesh].primitives[0].indices],view=data.json.bufferViews[a.bufferView];
 const offset=(view.byteOffset??0)+(a.byteOffset??0),size=a.componentType===5125?4:2;
 data.binary.copy(data.binary,offset+3*size,offset,offset+3*size);
 assert.throws(()=>validateContinuousSurface(data,surface),/重复、重叠或缺口/);
});
test('拒绝零误差复合根层及大于父层的摄影子树，防止下载成功却不显示',()=>{
 assert.throws(()=>validateSceneRoot({root:{geometricError:0,children:[{geometricError:400}]}}),/大于零/);
 assert.throws(()=>validateSceneRoot({root:{geometricError:100,children:[{geometricError:400}]}}),/大于子层/);
 validateSceneRoot({root:{geometricError:1000,children:[{geometricError:0},{geometricError:400}]}});
});

"""Publish complete finite-LOD local packs; do not alter statistical datasets or source snapshots."""
from pathlib import Path
import copy, hashlib, json, shutil, struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-data/v3.3-models/downloads'
OUT = ROOT / 'public/models'

def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def normalize_glb(glb):
    assert glb[:4] == b'glTF' and struct.unpack_from('<I', glb, 4)[0] == 2
    chunks=[];offset=12
    while offset+8<=len(glb):
        size,kind=struct.unpack_from('<II',glb,offset);chunks.append((kind,glb[offset+8:offset+8+size]));offset+=8+size
    doc=json.loads(chunks[0][1]);used=set(doc.get('extensionsUsed',[]));required=set(doc.get('extensionsRequired',[]))
    # Original photography exporters write a non-glTF sampler property and mark
    # image data as vertex buffers. Correct metadata only; preserve source bytes.
    for sampler in doc.get('samplers',[]):sampler.pop('wrapR',None)
    for image in doc.get('images',[]):
        if 'bufferView' in image:doc['bufferViews'][image['bufferView']].pop('target',None)
    for mesh in doc.get('meshes',[]):
        for primitive in mesh.get('primitives',[]):
            draco=primitive.get('extensions',{}).get('KHR_draco_mesh_compression')
            if draco:
                # A compressed stream is not an uncompressed index buffer.
                for aid in [primitive.get('indices'),*primitive.get('attributes',{}).values()]:
                    if aid is not None and doc['accessors'][aid].get('bufferView')==draco['bufferView']:
                        doc['accessors'][aid].pop('bufferView',None);doc['accessors'][aid].pop('byteOffset',None)
                doc['bufferViews'][draco['bufferView']].pop('target',None)
            else:
                for aid in primitive.get('attributes',{}).values():
                    if 'bufferView' in doc['accessors'][aid]:doc['bufferViews'][doc['accessors'][aid]['bufferView']]['target']=34962
                aid=primitive.get('indices')
                if aid is not None and 'bufferView' in doc['accessors'][aid]:doc['bufferViews'][doc['accessors'][aid]['bufferView']]['target']=34963
    for material in doc.get('materials',[]):
        if material.get('name','').startswith('Esri World Imagery'):
            material.setdefault('extensions',{})['KHR_materials_unlit']={}
    # Several public exporter outputs reference Unlit without declaring it, breaking compliant GLTFLoader.
    def scan(value):
        if isinstance(value,dict):
            used.update(value.get('extensions',{}).keys())
            for v in value.values():scan(v)
        elif isinstance(value,list):
            for v in value:scan(v)
    scan(doc)
    # Public photography texture atlases are KTX2 but some exporters omit their required Basis extension.
    for texture in doc.get('textures',[]):
        index=texture.get('source')
        if isinstance(index,int) and doc['images'][index].get('mimeType')=='image/ktx2':
            texture.setdefault('extensions',{})['KHR_texture_basisu']={'source':index};texture.pop('source')
            used.add('KHR_texture_basisu');required.add('KHR_texture_basisu')
    if used:doc['extensionsUsed']=sorted(used)
    if required:doc['extensionsRequired']=sorted(required)
    data=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf-8');data+=b' '*(-len(data)%4)
    chunks[0]=(chunks[0][0],data)
    payload=b''.join(struct.pack('<II',len(raw),kind)+raw for kind,raw in chunks)
    return struct.pack('<4sII',b'glTF',2,12+len(payload))+payload

def b3dm(glb):
    glb=normalize_glb(glb)
    assert glb[:4] == b'glTF' and struct.unpack_from('<I', glb, 4)[0] == 2
    assert struct.unpack_from('<I', glb, 8)[0] == len(glb)
    ft = b'{"BATCH_LENGTH":0}'
    ft += b' ' * (-(28 + len(ft)) % 8)
    payload = ft + glb
    payload += b'\0' * (-(28 + len(payload)) % 8)
    return struct.pack('<4s6I', b'b3dm', 1, 28 + len(payload), len(ft), 0, 0, 0) + payload

def prepare(model_id):
    source = SOURCE / model_id
    tileset = copy.deepcopy(json.loads((source / 'tileset.json').read_text(encoding='utf-8')))
    files = {}
    def walk(node,base):
        if 'content' in node:
            c = node['content']; uri = c.get('uri', c.get('url'))
            path = (base / uri).resolve()
            assert path.is_relative_to(source.resolve()) and path.is_file(), f'Missing or unsafe tile: {uri}'
            raw = path.read_bytes()
            if path.suffix=='.json':
                external=json.loads(raw);assert external['asset'].get('gltfUpAxis','Y')==tileset['asset'].get('gltfUpAxis','Y')
                walk(external['root'],path.parent);external['asset']['version']='1.0'
                files[str(path.relative_to(source.resolve())).replace('\\','/')]=encode(external)
                for child in node.get('children',[]):walk(child,base)
                return
            key=str(path.relative_to(source.resolve())).replace('\\','/')
            if path.suffix == '.glb':
                raw = b3dm(raw); uri = str(Path(uri).with_suffix('.b3dm')).replace('\\', '/')
                key=str(Path(key).with_suffix('.b3dm')).replace('\\','/')
            elif path.suffix=='.b3dm':
                header=struct.unpack_from('<4s6I',raw,0);start=28+sum(header[3:7]);end=start+struct.unpack_from('<I',raw,start+8)[0]
                glb=normalize_glb(raw[start:end]);raw=raw[:start]+glb;raw+=b'\0'*(-len(raw)%8)
                raw=raw[:8]+struct.pack('<I',len(raw))+raw[12:]
            assert raw[:4] == b'b3dm' and struct.unpack_from('<I', raw, 8)[0] == len(raw)
            c.pop('url', None); c['uri'] = uri; files[key] = raw
        for child in node.get('children', []): walk(child,base)
    walk(tileset['root'],source)
    # Repack 1.1 direct GLB payloads as 1.0 B3DM containers, preserving tree and all transforms.
    tileset['asset']['version'] = '1.0'
    files['tileset.json'] = encode(tileset)
    return files

def with_context(model_id, photographic=None):
    context=ROOT/'source-data/v3.5-render/derived'
    audit=json.loads((context/f'{model_id}.json').read_text('utf-8'))
    files={} if photographic is None else dict(photographic)
    old=json.loads(files['tileset.json']) if photographic else None
    left,south,right,north=audit['surfaceBounds'];ground=audit['groundZ']
    top=max([ground+180,*[v.get('heightM',0)+ground for v in audit['landmarks']]])
    if old:
        old['root'].pop('transform',None)
        box=old['root']['boundingVolume']['box'];top=max(top,box[2]+abs(box[11]))
    # Structural tubes extend slightly beyond nominal landmark heights; buffered
    # bridge decks can also extend past the image rectangle. Include their geometry.
    top+=2
    bounds={'box':[(left+right)/2,(south+north)/2,(top+ground-22)/2,(right-left)/2+8,0,0,0,(north-south)/2+8,0,0,0,(top-ground+22)/2]}
    children=[{'boundingVolume':bounds,'geometricError':0,'content':{'uri':'context.b3dm'}}]
    if old:children.append(old['root'])
    files['context.b3dm']=b3dm((context/f'{model_id}.glb').read_bytes())
    # A zero-error wrapper makes every photographic descendant unconditionally refine
    # in 3d-tiles-renderer, including leaves, so they download but never become visible.
    root_error=max(1000,old['root'].get('geometricError',0)*2) if old else 1
    files['tileset.json']=encode({'asset':{'version':'1.0','gltfUpAxis':'Z' if model_id.startswith('xian') else 'Y'},'geometricError':root_error,'root':{'boundingVolume':bounds,'geometricError':root_error,'refine':'ADD','children':children}})
    return files,audit

def main():
    descriptors = [
      dict(id='xian-dayan-pagoda',cityId='610100',city='西安',name='大雁塔景区',kind='photogrammetry',coverage='大雁塔及周边局部景区',qualityNote='公开摄影模型，远景轮廓与地表纹理可查看；贴近塔身的细节受公开源LOD限制，不代表厘米级扫描。',sourceUrl='https://data.mars3d.cn/3dtiles/qx-dyt/tileset.json',exampleUrl='https://github.com/marsgis/mars3d-vue-example/blob/master/public/config/config.json',sourceName='Mars3D 官方公开倾斜摄影示例'),
      dict(id='hefei-swan-lake',cityId='340100',city='合肥',name='天鹅湖周边',kind='photogrammetry',coverage='天鹅湖周边局部城区',qualityNote='地面与建筑纹理来自公开倾斜摄影；保留本地已获取LOD，边缘和遮挡位置可能有采集缺口。',sourceUrl='https://data.mars3d.cn/3dtiles/qx-teh/tileset.json',exampleUrl='https://github.com/marsgis/mars3d-vue-example/blob/master/public/config/config.json',sourceName='Mars3D 官方公开倾斜摄影示例'),
      dict(id='shanghai-lujiazui',cityId='310000',city='上海',name='陆家嘴地标群',kind='landmark',coverage='上海中心、东方明珠、金茂等地标组成的局部模型',qualityNote='真实地标的人工建模，采用原始网格与材质；是模型局部坐标视图，精确地理配准和建成时点未核实。',sourceUrl='https://a.amap.com/jsapi_demos/static/data3d/single.json',exampleUrl='https://lbs.amap.com/demo/javascript-api-v2/example/selflayer/3dtileslayer',sourceName='高德开放平台官方 3D Tiles 示例')
    ]
    descriptors[0].update(qualityNote='已补连续卫星地表及周边建筑，核心保留原倾斜摄影；大雁塔近景细节受原始摄影纹理限制。',coverage='大雁塔、大慈恩寺与南北广场周边')
    descriptors[1].update(qualityNote='按真实水体边界补全湖面、连续卫星地表和外围街区；核心建筑保留原倾斜摄影，图像与模型时点可能不同。',coverage='完整湖面、政务中心与周边街区')
    descriptors[2].update(kind='reconstruction',name='陆家嘴与黄浦江',coverage='黄浦江、陆家嘴及外滩侧街区',qualityNote='东方明珠依据塔柱轮廓重建，上海中心、金茂及环球保留地标网格；按照片区分幕墙与结构材质。地标为外观复原，普通街区立面概化，非逐栋摄影扫描。')
    descriptors.extend([
      dict(id='guangzhou-zhujiang',cityId='440100',city='广州',name='广州塔与花城广场',kind='reconstruction',coverage='广州塔、珠江、花城广场与东西塔',qualityNote='依据地理轮廓与建筑资料复原收腰网架和地标形态，卫星地表保留真实街区关系；不是倾斜摄影，幕墙细节为展示建模。',sourceUrl='https://www.openstreetmap.org/way/584204634',exampleUrl='https://www.kpf.com/project/ctf-finance-centre',sourceName='用户提供 OSM 分省数据、在线 OSM、Esri 影像与建筑方资料'),
      dict(id='shenzhen-futian',cityId='440300',city='深圳',name='市民中心与福田天际线',kind='reconstruction',coverage='市民中心、中央绿轴、平安金融中心与深交所',qualityNote='按地理位置与资料复原市民中心的大屋顶及平安金融中心轮廓，结合真实街区底图；不是摄影扫描，未知高度与立面不作测绘声明。',sourceUrl='https://www.openstreetmap.org/way/535860513',exampleUrl='https://www.kpf.com/project/ping-an-finance-centre',sourceName='用户提供 OSM 分省数据、在线 OSM、Esri 影像与建筑方资料')])
    directions={'xian-dayan-pagoda':[.6,1.15,1.5],'hefei-swan-lake':[.7,1.2,1.5],'shanghai-lujiazui':[-1.35,1.05,.9],'guangzhou-zhujiang':[.7,1.05,1.5],'shenzhen-futian':[.55,1.05,-1.5]}
    manifest = {'version':'shukan-realworld-v3.5-20261002','checkedOn':'2026-10-02','purpose':'local product experience','models':[],'files':{},'termsNote':'保留提供方署名；卫星影像 © Esri 及其数据提供方，地理要素 © OpenStreetMap contributors (ODbL)。本轮未部署或公开上传。'}
    for model in descriptors:
        files,audit=with_context(model['id'],prepare(model['id']) if model['kind']=='photogrammetry' else None)
        model.update(atmosphere=audit.get('atmosphere'),landmarkOwnership=audit.get('landmarkOwnership'),landmarks=audit['labels'],cameraDirection=directions[model['id']],surface={'bounds':audit['surfaceBounds'],'groundZ':audit['groundZ'],'contextUrl':f"/models/{model['id']}/context.b3dm",'continuous':True},contextNote='地表：Esri World Imagery；水体/道路/轮廓：用户提供 OSM 分省资料。周边高度取 OSM 标记；缺失时以 10 米展示，非实测。',buildingCount=audit['buildingCount'])
        directory = OUT / model['id']; directory.mkdir(parents=True, exist_ok=True)
        preview=directory/'preview.png'
        if preview.exists():files['preview.png']=preview.read_bytes()
        for name, raw in files.items():
            target = (directory / name).resolve(); assert target.is_relative_to(directory.resolve())
            target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
            manifest['files'][f"{model['id']}/{name}"] = {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
        model.update(url=f"/models/{model['id']}/tileset.json",captureDate='摄影及卫星影像拍摄时间未核实；场景整理于 2026-10-02',bytes=sum(map(len,files.values())),tileCount=sum(name.endswith('.b3dm') for name in files))
        model['offlineScope']='continuous local ground, mapped water, admitted context and archived finite photography LOD'
        model['preview']=f"/models/{model['id']}/preview.png" if 'preview.png' in files else None
        manifest['models'].append(model)
    for sub,source,names in [('draco','draco/gltf',['draco_wasm_wrapper.js','draco_decoder.wasm']),('basis','basis',['basis_transcoder.js','basis_transcoder.wasm'])]:
        decoder=ROOT/'node_modules/three/examples/jsm/libs'/source
        for name in names:
            target=OUT/'decoders'/sub/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(decoder/name,target)
            raw=target.read_bytes();manifest['files'][f'decoders/{sub}/{name}']={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    (OUT/'manifest.json').write_bytes(encode(manifest))
    print(json.dumps({'models':len(descriptors),'tileCounts':[m['tileCount'] for m in descriptors],'bytes':[m['bytes'] for m in descriptors]},ensure_ascii=False))

if __name__=='__main__': main()

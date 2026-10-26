import fs from 'node:fs';
import {BufferGeometry,BufferAttribute} from 'three';
import {computeMikkTSpaceTangents} from 'three/addons/utils/BufferGeometryUtils.js';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';
import {parseGLB} from './pipeline/validate-models.mjs';

// Offline preparation preserves the complete scene and bakes portable normal-map
// tangents with the same MikkTSpace convention as Three.js/glTF. No rendering.
const file=process.argv[2];
if(!file)throw Error('Provide a generated city GLB path');
const {json,binary}=parseGLB(fs.readFileSync(file));
await MikkTSpace.ready;
const data=json.bufferViews.map(v=>binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sizes={5123:2,5125:4,5126:4};
function attribute(id){
 const a=json.accessors[id],view=json.bufferViews[a.bufferView],n=components[a.type],size=sizes[a.componentType];
 if(!n||!size||a.sparse||a.normalized)throw Error('Unsupported generated accessor');
 const array=a.componentType===5126?new Float32Array(a.count*n):new Uint32Array(a.count*n);
 const start=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??n*size;
 for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){
  const offset=start+i*stride+j*size;
  array[i*n+j]=a.componentType===5126?binary.readFloatLE(offset):a.componentType===5123?binary.readUInt16LE(offset):binary.readUInt32LE(offset);
 }
 return new BufferAttribute(array,n);
}
function append(attr,position=false){
 const bytes=Buffer.from(attr.array.buffer,attr.array.byteOffset,attr.array.byteLength),view=json.bufferViews.length;
 json.bufferViews.push({buffer:0,byteLength:bytes.length,target:34962});data.push(bytes);
 const accessor={bufferView:view,componentType:5126,count:attr.count,type:['','SCALAR','VEC2','VEC3','VEC4'][attr.itemSize]};
 if(position){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<attr.count;i++)for(let c=0;c<3;c++){const x=attr.array[i*3+c];accessor.min[c]=Math.min(accessor.min[c],x);accessor.max[c]=Math.max(accessor.max[c],x);}}
 return json.accessors.push(accessor)-1;
}
for(const mesh of json.meshes)for(const primitive of mesh.primitives){
 if(!json.materials[primitive.material]?.normalTexture)continue;
 const g=new BufferGeometry(),a=primitive.attributes;
 g.setAttribute('position',attribute(a.POSITION));g.setAttribute('normal',attribute(a.NORMAL));g.setAttribute('uv',attribute(a.TEXCOORD_0));
 if(primitive.indices!==undefined)g.setIndex(attribute(primitive.indices));
 computeMikkTSpaceTangents(g,MikkTSpace);
 primitive.attributes={POSITION:append(g.getAttribute('position'),true),NORMAL:append(g.getAttribute('normal')),TEXCOORD_0:append(g.getAttribute('uv')),TANGENT:append(g.getAttribute('tangent'))};
 delete primitive.indices;g.dispose();
}
// Remove displaced vertex buffers instead of shipping both copies.
const usedAccessors=new Set();
for(const mesh of json.meshes)for(const p of mesh.primitives){for(const a of Object.values(p.attributes))usedAccessors.add(a);if(p.indices!==undefined)usedAccessors.add(p.indices);}
const remapAccessors=new Map([...usedAccessors].map((a,i)=>[a,i]));
json.accessors=[...usedAccessors].map(a=>json.accessors[a]);
for(const mesh of json.meshes)for(const p of mesh.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=remapAccessors.get(p.attributes[k]);if(p.indices!==undefined)p.indices=remapAccessors.get(p.indices);}
const usedViews=new Set([...json.accessors.map(a=>a.bufferView),...json.images.map(i=>i.bufferView)]),remapViews=new Map([...usedViews].map((v,i)=>[v,i]));
const chunks=[];let offset=0;
json.bufferViews=[...usedViews].map(v=>{const view={...json.bufferViews[v],byteOffset:offset};chunks.push(data[v],Buffer.alloc((4-data[v].length%4)%4));offset+=Math.ceil(data[v].length/4)*4;return view;});
for(const a of json.accessors)a.bufferView=remapViews.get(a.bufferView);
for(const i of json.images)i.bufferView=remapViews.get(i.bufferView);
json.buffers=[{byteLength:offset}];
const raw=Buffer.from(JSON.stringify(json)),doc=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bin=Buffer.concat(chunks);
const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+doc.length+bin.length,8);
jh.writeUInt32LE(doc.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(file,Buffer.concat([header,jh,doc,bh,bin]));MikkTSpace.dispose();

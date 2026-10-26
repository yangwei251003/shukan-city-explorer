import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseB3DM} from './validate-models.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),base=path.join(root,'public/models');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
async function localModule(js,wasm){
 const file=path.join(base,js),module={exports:{}};
 // Execute the vendored, hash-validated decoder bundle in a Node sandbox,
 // supplying local WASM bytes so no browser, worker or remote fetch is needed.
 for(const resource of [js,wasm])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(base,resource))).digest('hex'),manifest.files[resource].sha256);
 const sandbox={module,exports:module.exports,require:createRequire(import.meta.url),__dirname:path.dirname(file),console,process,Buffer,setTimeout,clearTimeout,TextDecoder,TextEncoder,WebAssembly,URL};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
 return await module.exports({wasmBinary:fs.readFileSync(path.join(base,wasm))});
}
const draco=await localModule('decoders/draco/draco_wasm_wrapper.js','decoders/draco/draco_decoder.wasm');
const basis=await localModule('decoders/basis/basis_transcoder.js','decoders/basis/basis_transcoder.wasm');basis.initializeBasis();
const report={checkedAt:new Date().toISOString(),manifest:manifest.version,scope:'CPU decode of published Draco geometry and every KTX2 mip level; no GPU execution',meshes:[],textures:[]};
for(const file of Object.keys(manifest.files).filter(f=>f.endsWith('.b3dm'))){
 const input=fs.readFileSync(path.join(base,file));assert.equal(createHash('sha256').update(input).digest('hex'),manifest.files[file].sha256);
 const {json,binary}=parseB3DM(input),slice=v=>binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 for(const mesh of json.meshes??[])for(const p of mesh.primitives){
  const ext=p.extensions?.KHR_draco_mesh_compression;if(!ext)continue;
  const bytes=slice(json.bufferViews[ext.bufferView]),decoder=new draco.Decoder(),geometry=new draco.Mesh();
  try{
   const status=decoder.DecodeArrayToMesh(bytes,bytes.length,geometry);assert.ok(status.ok(),`${file}: ${status.error_msg()}`);
   const count=geometry.num_points(),indices=geometry.num_faces()*3;assert.ok(count>0&&indices>0);
   assert.equal(json.accessors[p.indices].count,indices);const ptr=draco._malloc(indices*4);
   try{assert.ok(decoder.GetTrianglesUInt32Array(geometry,indices*4,ptr));for(const index of new Uint32Array(draco.HEAPF32.buffer,ptr,indices))assert.ok(index<count,`${file}: index out of bounds`);}finally{draco._free(ptr);}
   for(const [semantic,unique] of Object.entries(ext.attributes)){
    const attr=decoder.GetAttributeByUniqueId(geometry,unique),n=attr.num_components(),length=count*n,ptr=draco._malloc(length*4);
    try{assert.equal(count,json.accessors[p.attributes[semantic]].count);assert.ok(decoder.GetAttributeDataArrayForAllPoints(geometry,attr,draco.DT_FLOAT32,length*4,ptr));for(const value of new Float32Array(draco.HEAPF32.buffer,ptr,length))assert.ok(Number.isFinite(value),`${file}: non-finite ${semantic}`);}finally{draco._free(ptr);}
   }
   report.meshes.push({file,sha256:manifest.files[file].sha256,vertices:count,triangles:indices/3});
  }finally{draco.destroy(geometry);draco.destroy(decoder);}
 }
 for(const [index,image] of (json.images??[]).entries()){
  if(image.mimeType!=='image/ktx2')continue;
  const texture=new basis.KTX2File(new Uint8Array(slice(json.bufferViews[image.bufferView])));
  try{
   assert.ok(texture.isValid()&&texture.startTranscoding(),`${file}: KTX2 decoding failed`);
   const width=texture.getWidth(),height=texture.getHeight(),levels=texture.getLevels();assert.ok(width>0&&height>0&&levels>0);
   for(let level=0;level<levels;level++)for(let layer=0;layer<(texture.getLayers()||1);layer++)for(let face=0;face<texture.getFaces();face++){
    const size=texture.getImageTranscodedSizeInBytes(level,layer,0,13);assert.ok(size>0);
    const rgba=new Uint8Array(size);assert.ok(texture.transcodeImage(rgba,level,layer,face,13,0,-1,-1),`${file}: KTX2 mip ${level} failed`);
   }
   report.textures.push({file,index,sha256:manifest.files[file].sha256,width,height,levels});
  }finally{texture.close();texture.delete();}
 }
}
fs.writeFileSync(path.join(root,'docs/v3.5-evidence/compression-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Local CPU decoding passed: ${report.meshes.length} Draco meshes; ${report.textures.length} KTX2 images with all mip levels.`);

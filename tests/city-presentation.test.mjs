import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseB3DM} from '../scripts/pipeline/validate-models.mjs';
import {routeSample,advanceAtmosphere} from '../src/lib/cityMotion.ts';
import {usableModels} from '../src/lib/realWorld.ts';
import {citySky} from '../src/lib/citySky.ts';
import {cityQuality} from '../src/lib/cityQuality.ts';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const audit=read('source-data/v3.5-render/derived/shanghai-lujiazui.json');

test('Oriental Pearl owns its original OSM building and all 56 mapped parts, none survive as context',()=>{
 const owner=audit.landmarkOwnership.find(p=>p.name==='东方明珠');
 assert.equal(owner.osmId,'40778038');assert.equal(owner.excludedOsmIds.length,57);
 for(const id of ['40778038','520990194','520990195','520990196','524270641','524195899'])assert.ok(owner.excludedOsmIds.includes(id));
 const context=new Set(audit.contextBuildings.map(b=>b.osmId));
 for(const id of owner.excludedOsmIds)assert.ok(!context.has(id),`Duplicate Pearl part ${id}`);
 assert.equal(audit.labels.filter(p=>p.name==='东方明珠').length,1);
 assert.ok(Math.hypot(audit.pearl.center[0]+308.32533,audit.pearl.center[1]-489.11481)<.02);
});

test('Published Pearl structural meshes sit at the corrected center; old offset has no tall duplicate',()=>{
 const {json,binary}=parseB3DM(readFileSync(new URL('../public/models/shanghai-lujiazui/context.b3dm',import.meta.url)));
 let pearlPoints=0,wrongHighPoints=0,top=0;
 for(const node of json.nodes){
  if(node.mesh===undefined)continue;
  for(const primitive of json.meshes[node.mesh].primitives){
   const a=json.accessors[primitive.attributes.POSITION],v=json.bufferViews[a.bufferView],stride=v.byteStride??12,start=(v.byteOffset??0)+(a.byteOffset??0);
   const isPearl=['pearlConcrete','pearlPanel','pearlRose','pearlDark'].includes(node.name);
   for(let i=0;i<a.count;i++){
    const p=[0,4,8].map(k=>binary.readFloatLE(start+i*stride+k));
    if(isPearl){pearlPoints++;top=Math.max(top,p[1]);assert.ok(Math.hypot(p[0]-audit.pearl.center[0],-p[2]-audit.pearl.center[1])<82);}
    if(p[1]>400&&Math.hypot(p[0]+163.90,-p[2]-446.95)<35)wrongHighPoints++;
   }
  }
 }
 assert.ok(pearlPoints>10000);assert.ok(Math.abs(top-468)<.1);assert.equal(wrongHighPoints,0);
 const pearlMaterials=json.materials.filter(m=>m.name.startsWith('Oriental Pearl /'));
 assert.equal(pearlMaterials.length,4);
 for(const name of ['Shanghai Tower /','Jin Mao /','SWFC /']){
  const m=json.materials.find(m=>m.name.startsWith(name));assert.ok(m?.pbrMetallicRoughness.baseColorTexture);assert.ok(m.normalTexture);assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
 }
});

test('Every excluded landmark part has exactly one owner and cannot also be a context building',()=>{
 const owners=new Set(),context=new Set(audit.contextBuildings.map(b=>b.osmId));
 for(const owner of audit.landmarkOwnership)for(const id of owner.excludedOsmIds){assert.ok(!owners.has(id));assert.ok(!context.has(id));owners.add(id);}
});

test('Atmosphere follows exact segments with constant distance, preserves corners and reverses at endpoints',()=>{
 const route=[[0,0,0],[10,0,0],[10,10,0]];
 assert.deepEqual(routeSample(route,5).position,[5,0,0]);assert.deepEqual(routeSample(route,15).position,[10,5,0]);
 assert.deepEqual(routeSample(route,25).position,[10,5,0]);assert.equal(routeSample(route,25).heading,Math.PI);
 assert.deepEqual(routeSample(route,40).position,[0,0,0]);assert.equal(routeSample([[0,0,0],[0,0,0]],3),null);
 assert.equal(routeSample(route,NaN),null);
});

test('Paused atmosphere does not advance; returning from a hidden tab cannot jump vehicles',()=>{
 assert.equal(advanceAtmosphere(12,10,false),12);assert.equal(advanceAtmosphere(12,10,true),12.1);assert.equal(advanceAtmosphere(12,-1,true),12);
});

test('Mood sky uses one finite sRGB pixel buffer with no browser canvas transfer',()=>{
 const sky=citySky(),data=sky.texture.image.data,initial=Uint8Array.from(data);
 assert.equal(data.byteLength,1024);for(let i=3;i<data.length;i+=4)assert.equal(data[i],255);
 sky.update('dusk');assert.equal(sky.texture.image.data,data);assert.notDeepEqual(data,initial);assert.equal(sky.texture.colorSpace,'srgb');
 sky.update('day');assert.deepEqual(data,initial);sky.texture.dispose();
});

test('Full facade texture resolution survives publication on all landmark curtain-wall channels',()=>{
 const {json,binary}=parseB3DM(readFileSync(new URL('../public/models/shanghai-lujiazui/context.b3dm',import.meta.url)));
 for(const prefix of ['Shanghai Tower /','Jin Mao /','SWFC /']){
  const m=json.materials.find(m=>m.name.startsWith(prefix));
  for(const channel of [m.pbrMetallicRoughness.baseColorTexture,m.pbrMetallicRoughness.metallicRoughnessTexture,m.normalTexture,m.emissiveTexture]){
   const img=json.images[json.textures[channel.index].source],v=json.bufferViews[img.bufferView],offset=v.byteOffset??0;
   assert.equal(binary.toString('hex',offset,offset+8),'89504e470d0a1a0a');
   assert.deepEqual([binary.readUInt32BE(offset+16),binary.readUInt32BE(offset+20)],[512,1024]);
  }
 }
});

test('Quality modes retain full material assets and change reflection, shadow and pixel budgets',()=>{
 for(const mobile of [false,true]){
  const full=cityQuality(true,mobile),light=cityQuality(false,mobile);
  assert.equal(full.reflectionSize,512);assert.equal(full.shadowSize,2048);
  assert.ok(full.pixelRatioLimit>light.pixelRatioLimit&&full.tileError<light.tileError);
  assert.ok(full.reflectionSize>light.reflectionSize&&full.shadowSize>light.shadowSize);
 }
});

test('Movement sources are local bounded road IDs and water corridors verified against shorelines',()=>{
 for(const id of ['shanghai-lujiazui','guangzhou-zhujiang','shenzhen-futian']){
  const a=read(`source-data/v3.5-render/derived/${id}.json`),[w,s,e,n]=a.surfaceBounds;
  assert.ok(a.atmosphere.roads.length>0);assert.ok(a.atmosphere.roads.length<=18);
  for(const road of a.atmosphere.roads){assert.match(road.osmId,/^\d+$/);assert.ok(road.points.length>=2);}
  for(const p of [...a.atmosphere.roads.flatMap(r=>r.points),...a.atmosphere.waterRoute])assert.ok(p.every(Number.isFinite)&&p[0]>=w&&p[0]<=e&&p[1]>=s&&p[1]<=n);
  if(a.atmosphere.waterRoute.length)assert.equal(a.atmosphere.waterCorridorVerified,true);
 }
});

test('Malformed movement coordinates and duplicated landmark labels fail before a WebGL scene is created',()=>{
 const manifest=read('public/models/manifest.json');
 const bad=structuredClone(manifest),sh=bad.models.find(m=>m.city==='上海');sh.atmosphere.roads[0].points[0][0]=Infinity;
 assert.throws(()=>usableModels(bad),/边界校验/);
 const outside=structuredClone(manifest);outside.models.find(m=>m.city==='上海').atmosphere.waterRoute[0][0]=100000;
 assert.throws(()=>usableModels(outside),/边界校验/);
 const duplicate=structuredClone(manifest);duplicate.models[2].landmarks.push(duplicate.models[2].landmarks[0]);
 assert.throws(()=>usableModels(duplicate),/地标名称重复/);
});

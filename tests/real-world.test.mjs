import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {populationReference} from '../src/lib/populationReference.ts';
import {usableModels,realWorldCityIds} from '../src/lib/realWorld.ts';
import {readRoute,routeHash} from '../src/router.ts';
import {studioEnvironment} from '../src/lib/studioEnvironment.ts';
import {DataUtils,CubeUVReflectionMapping} from 'three';
import {needsDrawableChildren} from '../src/lib/drawableGroups.ts';
import {isolateModelQueues} from '../src/lib/modelQueues.ts';
import {TilesRendererBase} from '3d-tiles-renderer/core';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=read('public/data/catalog.json'),manifest=read('public/models/manifest.json');

test('Nanchang 2025-start reference stays separate from 2025 year-end and never replaces known population',()=>{
 const record=populationReference({id:'360100',dataYear:2025,population:null});
 assert.equal(record.population,667.04);assert.equal(record.populationYear,2024);assert.equal(record.populationReferenceDate,'2024-12-31');
 assert.equal(populationReference({id:'360100',dataYear:2024,population:null}),null);
 assert.equal(populationReference({id:'360100',dataYear:2025,population:665}),null);
 assert.equal(populationReference({id:'340100',dataYear:2025,population:null}),null);
 const bytes=readFileSync(new URL('../'+record.snapshotPath,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
 assert.match(bytes.toString('utf8'),/667.04/);
 for(const d of catalog.datasets.filter(d=>d.year===2025)){
  const n=read('public'+d.url).find(c=>c.cityId==='360100');if(n)assert.equal(n.population,null);
 }
});
test('3D model selection uses admitted statistical IDs and deep links round-trip across regions',()=>{
 const models=usableModels(manifest,catalog.profiles.map(c=>c.id));
 assert.deepEqual(models.map(m=>m.cityId),[...realWorldCityIds]);
 for(const m of models){const r=catalog.regions.find(r=>r.memberCityIds.includes(m.cityId));
  const route={regionId:r.id,scene:'real3d',cityId:m.cityId,datasetId:r.defaultDatasetId};assert.deepEqual(readRoute(routeHash(route),catalog),route);
 }
 assert.equal(models.find(m=>m.city==='上海').kind,'reconstruction');
 assert.ok(models.filter(m=>m.kind==='photogrammetry').every(m=>m.captureDate.includes('拍摄时间未核实')));
});
test('Model list rejects unmatched cities, duplicate IDs and inconsistent local entry before rendering',()=>{
 const models=structuredClone(manifest);models.models[2].cityId='310100';
 assert.throws(()=>usableModels(models,catalog.profiles.map(c=>c.id)),/尚未接入/);
 assert.throws(()=>usableModels({models:[manifest.models[0],manifest.models[0]]}),/字段/);
 const wrong=structuredClone(manifest);wrong.models[0].url='/models/another/tileset.json';assert.throws(()=>usableModels(wrong),/不一致/);
});
test('Scene camera, focus distance and continuous bounds reject nonfinite or reversed values',()=>{
 for(const cameraDirection of [[0,0,0],[1,NaN,1],[1,2]]){
  const copy=structuredClone(manifest);copy.models[0].cameraDirection=cameraDirection;assert.throws(()=>usableModels(copy),/取景方向/);
 }
 const copy=structuredClone(manifest);copy.models[0].landmarks[0].viewDistance=-1;assert.throws(()=>usableModels(copy),/地标视角/);
 const bounds=structuredClone(manifest);bounds.models[0].surface.bounds=[1,1,-1,-1];assert.throws(()=>usableModels(bounds),/地表范围/);
});
test('Studio light atlas has complete padded faces at every roughness level within a mobile budget',()=>{
 const texture=studioEnvironment();assert.equal(texture.mapping,CubeUVReflectionMapping);assert.ok(texture.image.data.byteLength<350000);
 const {data,width}=texture.image;
 for(let mip=5;mip>=-2;mip--){const s=Math.max(16,2**mip),ox=Math.max(0,4-mip)*48,oy=4*(32-s);
  for(let face=0;face<6;face++)for(const x of [0,s-1])for(const y of [0,s-1]){
   const pixel=((oy+(face>2?s:0)+y)*width+ox+(face%3)*s+x)*4;assert.equal(DataUtils.fromHalfFloat(data[pixel+3]),1);assert.ok(DataUtils.fromHalfFloat(data[pixel])>0);
  }
 }
 assert.ok([...data].every(v=>Number.isFinite(DataUtils.fromHalfFloat(v))));texture.dispose();
});
test('Sparse model groups reach drawable children at distant phone views without forcing textured LOD refinement',()=>{
 assert.equal(needsDrawableChildren({children:[{}]}),true);
 assert.equal(needsDrawableChildren({content:{uri:'tile.b3dm'},children:[{}]}),false);
 assert.equal(needsDrawableChildren({contents:[{uri:'tile.b3dm'}],children:[{}]}),false);
 assert.equal(needsDrawableChildren({children:[]}),false);
});
test('A cancelled city worker cannot block the next city parser, and queue comparators remain valid',async()=>{
 const a=new TilesRendererBase(),b=new TilesRendererBase();isolateModelQueues(a);isolateModelQueues(b);
 for(const key of ['lruCache','parseQueue','downloadQueue','processNodeQueue'])assert.notEqual(a[key],b[key]);
 for(const key of ['parseQueue','downloadQueue','processNodeQueue'])assert.equal(typeof b[key].priorityCallback,'function');
 assert.equal(typeof b.lruCache.unloadPriorityCallback,'function');
 a.parseQueue.maxJobs=b.parseQueue.maxJobs=1;a.parseQueue.autoUpdate=b.parseQueue.autoUpdate=false;
 let release;const blocked=a.parseQueue.add({},()=>new Promise(resolve=>{release=resolve;}));a.parseQueue.tryRunJobs();
 const next=b.parseQueue.add({},()=>Promise.resolve('new-city-ready'));b.parseQueue.tryRunJobs();
 try{assert.equal(await next,'new-city-ready');assert.equal(a.parseQueue.running,true);}finally{release();await blocked;}
});

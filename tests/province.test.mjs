import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {provinceIndex,provinceOf,regionForCity} from '../src/lib/provinceSelection.ts';
const catalog=JSON.parse(readFileSync(new URL('../public/data/catalog.json',import.meta.url)));
const geo=JSON.parse(readFileSync(new URL('../public/data/nation/v3.1/china.geojson',import.meta.url)));
const index=provinceIndex(geo,catalog.profiles,catalog.regions);

test('Province selection partitions 41 admitted cities once across 34 areas',()=>{
 assert.equal(index.length,34);
 const ids=index.flatMap(p=>p.cityIds);assert.equal(ids.length,41);assert.equal(new Set(ids).size,41);
 for(const p of index)for(const id of p.cityIds)assert.equal(provinceOf(id),p.id);
 assert.equal(provinceOf(''),null);assert.equal(provinceOf('360100x'),null);
});
test('Guangdong keeps both relevant collections without double-counting cities',()=>{
 const p=index.find(p=>p.id==='440000');assert.equal(p.cityIds.length,21);assert.deepEqual(p.regionIds,['prd','guangdong']);
});
test('Jiangxi contains Nanchang only, not the full middle-Yangtze collection',()=>{
 const p=index.find(p=>p.id==='360000');assert.deepEqual(p.cityIds,['360100']);assert.deepEqual(p.regionIds,['middle-yangtze']);
 assert.equal(regionForCity('360100',catalog.regions).id,'middle-yangtze');
});
test('Cross-province collections stay navigable without importing other provinces into the selection',()=>{
 assert.equal(index.find(p=>p.id==='320000').cityIds.length,4);
 assert.equal(index.find(p=>p.id==='330000').cityIds.length,2);
 assert.deepEqual(index.find(p=>p.id==='310000').cityIds,['310000']);
 for(const id of ['320000','330000','310000','340000'])assert.deepEqual(index.find(p=>p.id===id).regionIds,['yangtze']);
});
test('Unadmitted provinces and unsupported territories have an explicit empty state',()=>{
 for(const id of ['630000','710000','810000','820000']){const p=index.find(p=>p.id===id);assert.deepEqual(p.cityIds,[]);assert.deepEqual(p.regionIds,[]);}
 assert.equal(regionForCity('999999',catalog.regions),undefined);
});
test('Duplicate or unadmitted profiles cannot increase coverage; valid preferred collection is respected',()=>{
 const withDuplicates=provinceIndex(geo,[...catalog.profiles,catalog.profiles[0],{id:'630100'}],catalog.regions);
 assert.equal(withDuplicates.flatMap(p=>p.cityIds).length,41);
 assert.equal(regionForCity('440100',catalog.regions,'guangdong').id,'guangdong');
 assert.equal(regionForCity('440100',catalog.regions,'yangtze').id,'prd');
});

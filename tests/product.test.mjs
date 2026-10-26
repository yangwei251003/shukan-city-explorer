import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {albers,atlasProjection,regionAnchor,regionSummary} from '../src/lib/nationalAtlas.ts';
import {nationalRows} from '../src/lib/nationalData.ts';

const base=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));
const catalog=read('public/data/catalog.json');
const geometry=read('public/data/nation/v3.1/china.geojson');

test('National loading rejects partial, duplicate and mismatched published data',()=>{
 const dataset=catalog.datasets.find(d=>d.id===catalog.regions[0].defaultDatasetId);
 const rows=read('public'+dataset.url);
 assert.equal(nationalRows(dataset,rows).length,dataset.cityIds.length);
 assert.throws(()=>nationalRows(dataset,[]),/数量/);
 assert.throws(()=>nationalRows(dataset,[...rows.slice(1),rows[1]]),/版本/);
 assert.throws(()=>nationalRows(dataset,rows.map((r,i)=>i===0?{...r,datasetVersion:'wrong'}:r)),/版本/);
});
test('National vector preserves 34 provinces, genuine line groups and the published source hash',()=>{
 const manifest=read('public/data/nation/v3.1/manifest.json');
 assert.equal(geometry.features.filter(f=>f.properties.kind==='province').length,34);
 assert.equal(geometry.features.filter(f=>f.properties.kind==='maritime-line')[0].geometry.coordinates.length,10);
 assert.equal(createHash('sha256').update(readFileSync(new URL('public/data/nation/v3.1/china.geojson',base))).digest('hex'),manifest.files.display.sha256);
 assert.ok(manifest.files.display.bytes<600000);assert.equal(manifest.crs.approximate,true);
});
test('National display projects all admitted city coordinates inside the main viewport',()=>{
 const view=atlasProjection([73,17.5,135.5,54],[4,25,870,565],16);
 for(const c of catalog.profiles){const [x,y]=view.project(c.coordinate);assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=0&&x<=900&&y>=0&&y<=630,c.name);}
 assert.ok(albers([115,35])[0]>albers([105,35])[0]);
 assert.ok(albers([105,40])[1]>albers([105,30])[1]);
});
test('SVG geometry preserves polygon holes and does not close boundary line groups',()=>{
 const p=atlasProjection([100,20,110,30],[0,0,500,500]);
 const polygon={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[100,20],[110,20],[110,30],[100,20]],[[103,23],[105,23],[104,25],[103,23]]]}};
 const path=p.path(polygon);assert.equal((path.match(/M/g)||[]).length,2);assert.equal((path.match(/Z/g)||[]).length,2);assert.doesNotMatch(path,/NaN|Infinity/);
 assert.doesNotMatch(p.path({...polygon,geometry:{type:'LineString',coordinates:[[100,20],[110,30]]}}),/Z/);
 for(const f of geometry.features)assert.doesNotMatch(p.path(f),/NaN|Infinity/);
});
test('Region previews use only selected members and incomplete populations remain unknown',()=>{
 const cities=[{id:'a',coordinate:[100,20],gdp:200,population:10},{id:'b',coordinate:[110,30],gdp:100,population:5},{id:'c',coordinate:[150,50],gdp:999,population:90}];
 assert.deepEqual(regionAnchor({memberCityIds:['a','b']},cities),[105,25]);
 assert.equal(regionAnchor({memberCityIds:['missing']},cities),null);
 assert.deepEqual(regionSummary(cities.slice(0,2)),{gdp:300,population:15,perCapita:200000});
 assert.equal(regionSummary([{...cities[0],population:null},cities[1]]).population,null);
});

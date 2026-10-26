import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCatalog,validatePublication,pointInGeometry,validateNationalVector} from './validate.mjs';
import {createHash} from 'node:crypto';

const square={type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,3],[0,0]]]};

test('National publication blocks modified geometry, missing sources and incomplete maps',()=>{
 const base=resolve(dirname(fileURLToPath(import.meta.url)),'../../public/data/nation/v3.1');
 const bytes=readFileSync(resolve(base,'china.geojson')),geo=JSON.parse(bytes),manifest=JSON.parse(readFileSync(resolve(base,'manifest.json')));
 assert.equal(validateNationalVector(geo,manifest,bytes).provinces,34);
 assert.throws(()=>validateNationalVector(geo,manifest,Buffer.from('changed')),/hash/);
 assert.throws(()=>validateNationalVector(geo,{...manifest,source:{}},bytes),/provenance/);
 assert.throws(()=>validateNationalVector({...geo,features:geo.features.slice(1)},manifest,bytes),/42/);
 const broken=structuredClone(geo);broken.features.find(f=>f.properties.kind==='province').geometry={type:'Polygon',coordinates:[[[1,2],[2,3],[3,4]]]};
 const changed=Buffer.from(JSON.stringify(broken)),metadata=structuredClone(manifest);metadata.files.display={...metadata.files.display,bytes:changed.length,sha256:createHash('sha256').update(changed).digest('hex')};
 assert.throws(()=>validateNationalVector(broken,metadata,changed),/invalid province/);
});
function fixture(){
 const row={cityId:'110000',dataYear:2025,statPeriod:'2025全年',gdp:100,industries:[10,30,60],growth:4,
 currency:'CNY',amountUnit:'亿元',priceBasis:'现价金额；增长率按不变价格计算',sourceId:'test',sourceName:'官方统计局',
 sourceUrl:'https://example.gov.cn/a',publishedAt:'2026-01-01',fetchedAt:'2026-09-27',revisionStatus:'初步核算',
 datasetVersion:'test-r2',population:2,populationSourceName:'官方统计局',populationSourceUrl:'https://example.gov.cn/a',populationPublishedAt:'2026-01-01',
 populationStatPeriod:'2025年末',gdpPerCapita:500000,gdpPerCapitaBasis:'按年末常住人口计算',history:[{year:2025,gdp:100,growth:4,sourceUrl:'https://example.gov.cn/a',
 sourceName:'官方统计局',publishedAt:'2026-01-01',revisionStatus:'初步核算',priceBasis:'现价金额；增长率按不变价格计算'}]};
 const catalog={version:'test',profiles:[{id:'110000',name:'测试城',coordinate:[1,1]}],
 datasets:[{id:'test-r2',year:2025,cityIds:['110000'],url:'/data/dataset.json'}],
 regions:[{id:'test',memberCityIds:['110000'],datasetIds:['test-r2'],defaultDatasetId:'test-r2',
 map:{bbox:[0,0,3,3],boundaryUrl:'/data/boundary.json',landUrl:'/data/land.json',regionLandUrl:'/data/land.json',manifestUrl:'/data/map-manifest.json'}}]};
 const boundary={type:'FeatureCollection',features:[{type:'Feature',properties:{id:'110000'},geometry:structuredClone(square)}]};
 return {catalog,rows:{'test-r2':[row]},boundary};
}
test('T26 schema accepts explicit null population and missing historical years',()=>{
 const {catalog,rows}=fixture();rows['test-r2'][0].population=null;rows['test-r2'][0].gdpPerCapita=null;
 assert.equal(validateCatalog(catalog,rows).valid,true);
});
test('Population and history validation also protects r3 and future revisions',()=>{
 for(const revision of [3,10]){
  const f=fixture(),id=`test-r${revision}`;
  f.catalog.datasets[0].id=id;f.catalog.regions[0].datasetIds=[id];f.catalog.regions[0].defaultDatasetId=id;
  const row=f.rows['test-r2'][0];row.datasetVersion=id;row.population=0;
  assert.throws(()=>validateCatalog(f.catalog,{[id]:[row]}),/population/);
 }
});
for(const [label,mutate,pattern] of [
 ['city-count mismatch',f=>f.rows['test-r2'].push(structuredClone(f.rows['test-r2'][0])),/city count/],
 ['industry rounding outside tolerance',f=>f.rows['test-r2'][0].industries[2]=61,/rounding/],
 ['missing provenance date',f=>f.rows['test-r2'][0].publishedAt='',/provenance/],
 ['missing population source name',f=>f.rows['test-r2'][0].populationSourceName='',/population provenance/],
 ['zero population',f=>f.rows['test-r2'][0].population=0,/population/],
 ['fabricated per-capita value',f=>f.rows['test-r2'][0].gdpPerCapita=1,/per capita/],
 ['future historical year',f=>f.rows['test-r2'][0].history[0].year=2026,/historical/],
 ['missing historical source',f=>f.rows['test-r2'][0].history[0].sourceUrl='',/historical/],
 ['point outside bbox',f=>f.catalog.profiles[0].coordinate=[5,5],/bbox/],
 ['dataset missing region member',f=>f.catalog.datasets[0].cityIds=[],/does not cover/],
 ['point outside administrative polygon',f=>f.catalog.profiles[0].coordinate=[2,2],/polygon/],
 ['open polygon ring',f=>f.boundary.features[0].geometry.coordinates[0].pop(),/geometry/]
]) test(`T26 schema rejects ${label}`,()=>{
 const f=fixture();
 if(label==='point outside administrative polygon')f.boundary.features[0].geometry.coordinates.push([[1.5,1.5],[2.5,1.5],[2.5,2.5],[1.5,2.5],[1.5,1.5]]);
 mutate(f);assert.throws(()=>validateCatalog(f.catalog,f.rows,()=>f.boundary),pattern);
});
test('T26 point containment respects holes and multipolygons',()=>{
 const withHole=structuredClone(square);withHole.coordinates.push([[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]]);
 assert.equal(pointInGeometry([1,1],withHole),false);
 assert.equal(pointInGeometry([2,2],withHole),true);
 assert.equal(pointInGeometry([1,1],{type:'MultiPolygon',coordinates:[square.coordinates]}),true);
});
test('T26 a failed publication cannot create or replace the last valid manifest',()=>{
 const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const base=resolve(workspace,'source-data/v3');const root=mkdtempSync(resolve(base,'.schema-test-'));const dir=resolve(root,'public/data');mkdirSync(dir,{recursive:true});
 try{
  const f=fixture();f.rows['test-r2'][0].sourceUrl='';
  writeFileSync(resolve(dir,'catalog.json'),JSON.stringify(f.catalog));writeFileSync(resolve(dir,'dataset.json'),JSON.stringify(f.rows['test-r2']));
  writeFileSync(resolve(dir,'boundary.json'),JSON.stringify(f.boundary));writeFileSync(resolve(dir,'land.json'),JSON.stringify(f.boundary));
  const dest=resolve(dir,'v3-manifest.json');writeFileSync(dest,'previous-valid-manifest');
  assert.throws(()=>validatePublication({root}),/provenance/);assert.equal(readFileSync(dest,'utf8'),'previous-valid-manifest');
 }finally{assert.ok(root.startsWith(base+'\\')||root.startsWith(base+'/'));rmSync(root,{recursive:true,force:true});}
});

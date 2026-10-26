import {readFileSync, writeFileSync, existsSync, renameSync} from 'node:fs';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const url = value => typeof value === 'string' && /^https?:\/\//.test(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));
const unique = values => new Set(values).size === values.length;
const same = (a,b) => [...a].sort().join('|') === [...b].sort().join('|');
function inRing(point, ring) {
  const [x,y] = point; let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [a,b]=ring[i], [c,d]=ring[j];
    const cross=(x-a)*(d-b)-(y-b)*(c-a);
    if(Math.abs(cross)<1e-10 && x>=Math.min(a,c)-1e-10 && x<=Math.max(a,c)+1e-10 && y>=Math.min(b,d)-1e-10 && y<=Math.max(b,d)+1e-10)return true;
    if(((b>y)!==(d>y)) && x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  } return inside;
}
export function pointInGeometry(point, geometry) {
  if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type))return false;
  const polygons = geometry.type==='Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(point,rings[0]) && !rings.slice(1).some(ring=>inRing(point,ring)));
}
function validGeometry(geometry) {
  if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type))return false;
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.length>0 && polygons.every(rings=>rings.length>0 && rings.every(ring=>ring.length>=4 && ring.every(p=>p.length>=2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0])<=180 && Math.abs(p[1])<=90) && ring[0][0]===ring.at(-1)[0] && ring[0][1]===ring.at(-1)[1]));
}
export function validateCatalog(catalog, datasetMap, readJson) {
  const errors=[]; const check=(condition,message)=>{if(!condition)errors.push(message);};
  check(Array.isArray(catalog.profiles)&&unique(catalog.profiles.map(p=>p.id)),'profiles must have unique city IDs');
  check(Array.isArray(catalog.datasets)&&unique(catalog.datasets.map(d=>d.id)),'datasets must have unique IDs');
  check(Array.isArray(catalog.regions)&&unique(catalog.regions.map(r=>r.id)),'regions must have unique IDs');
  const profiles=new Map(catalog.profiles.map(p=>[p.id,p]));
  for(const p of catalog.profiles)check(/^\d{6}$/.test(p.id)&&typeof p.name==='string'&&p.coordinate?.length===2&&p.coordinate.every(finite)&&Math.abs(p.coordinate[0])<=180&&Math.abs(p.coordinate[1])<=90,`invalid city profile ${p.id}`);
  for(const d of catalog.datasets){
    const rows=datasetMap[d.id];check(Array.isArray(rows),`missing dataset ${d.id}`);if(!Array.isArray(rows))continue;
    check(rows.length===d.cityIds.length&&same(rows.map(r=>r.cityId),d.cityIds)&&unique(rows.map(r=>r.cityId)),`city count/IDs mismatch ${d.id}`);
    for(const r of rows){
      const key=`${d.id}/${r.cityId}`;
      check(profiles.has(r.cityId),`unknown city ${key}`);
      check(r.dataYear===d.year&&r.statPeriod===`${d.year}全年`&&r.currency==='CNY'&&r.amountUnit==='亿元',`annual period/currency/unit mismatch ${key}`);
      check(finite(r.gdp)&&r.gdp>0&&finite(r.growth)&&Array.isArray(r.industries)&&r.industries.length===3&&r.industries.every(n=>finite(n)&&n>=0),`invalid numeric fields ${key}`);
      if(Array.isArray(r.industries))check(Math.abs(r.industries.reduce((a,b)=>a+b,0)-r.gdp)<=0.211,`industry rounding difference exceeds 0.21亿元 ${key}`);
      check(['sourceId','sourceName','revisionStatus','priceBasis'].every(k=>typeof r[k]==='string'&&r[k].length>0)&&url(r.sourceUrl)&&date(r.publishedAt)&&date(r.fetchedAt)&&r.datasetVersion===d.id,`incomplete provenance ${key}`);
      if(Number(d.id.match(/-r(\d+)$/)?.[1]??0)>=2){
        check(r.population===null||(finite(r.population)&&r.population>0),`population must be positive or null ${key}`);
        check(r.population===null?r.gdpPerCapita===null:finite(r.gdpPerCapita)&&Math.abs(r.gdpPerCapita-r.gdp/r.population*10000)<=0.51,`invalid derived GDP per capita ${key}`);
        check(r.population===null||(typeof r.populationSourceName==='string'&&r.populationSourceName.trim().length>0&&url(r.populationSourceUrl)&&date(r.populationPublishedAt)&&r.populationStatPeriod===`${d.year}年末`),`incomplete population provenance ${key}`);
        check(typeof r.gdpPerCapitaBasis==='string'&&r.gdpPerCapitaBasis.includes('按年末常住人口计算'),`missing per-capita calculation basis ${key}`);
        check(Array.isArray(r.history)&&unique(r.history.map(h=>h.year)),`invalid or repeated history years ${key}`);
        for(const h of r.history??[])check(Number.isInteger(h.year)&&h.year>=2019&&h.year<=d.year&&finite(h.gdp)&&h.gdp>0&&(h.growth==null||finite(h.growth))&&url(h.sourceUrl)&&date(h.publishedAt)&&['sourceName','revisionStatus','priceBasis'].every(k=>typeof h[k]==='string'&&h[k].length>0),`invalid historical observation ${key}/${h.year}`);
      }
    }
  }
  for(const r of catalog.regions){
    check(r.memberCityIds.length>0&&unique(r.memberCityIds)&&r.memberCityIds.every(id=>profiles.has(id)),`invalid region members ${r.id}`);
    check(r.datasetIds.includes(r.defaultDatasetId),`default dataset not registered in region ${r.id}`);
    for(const did of r.datasetIds){const d=catalog.datasets.find(d=>d.id===did);check(d&&r.memberCityIds.every(id=>d.cityIds.includes(id)),`dataset does not cover region ${r.id}/${did}`);}
    const bbox=r.map?.bbox;check(bbox?.length===4&&bbox.every(finite)&&bbox[0]<bbox[2]&&bbox[1]<bbox[3],`invalid bbox ${r.id}`);
    for(const id of r.memberCityIds){const point=profiles.get(id)?.coordinate;check(point&&bbox&&point[0]>=bbox[0]&&point[0]<=bbox[2]&&point[1]>=bbox[1]&&point[1]<=bbox[3],`representative point outside bbox ${r.id}/${id}`);}
    if(readJson){
      let boundary;try{boundary=readJson(r.map.boundaryUrl);}catch(e){errors.push(`cannot read boundary ${r.id}: ${e.message}`);continue;}
      check(boundary.type==='FeatureCollection'&&Array.isArray(boundary.features)&&same(boundary.features.map(f=>f.properties.id),r.memberCityIds),`map city count/IDs mismatch ${r.id}`);
      for(const f of boundary.features??[]){const id=f.properties.id;check(validGeometry(f.geometry),`invalid geometry ${r.id}/${id}`);const p=profiles.get(id);check(p&&pointInGeometry(p.coordinate,f.geometry),`representative point outside polygon ${r.id}/${id}`);}
      for(const asset of [r.map.landUrl,r.map.regionLandUrl]){try{const geo=readJson(asset);check(geo.type==='FeatureCollection'&&geo.features?.length>0&&geo.features.every(f=>validGeometry(f.geometry)),`invalid derived land geometry ${asset}`);}catch(e){errors.push(`cannot read land ${asset}: ${e.message}`);}}
    }
  }
  if(errors.length)throw new Error(`Dataset schema validation failed (${errors.length}):\n${errors.join('\n')}`);
  return {valid:true,profiles:catalog.profiles.length,datasets:catalog.datasets.length,regions:catalog.regions.length,observations:Object.values(datasetMap).reduce((n,rows)=>n+rows.length,0)};
}
export function validateNationalVector(geo,manifest,bytes){
 const fail=message=>{throw new Error(`National vector validation failed: ${message}`);};
 if(geo?.type!=='FeatureCollection'||!Array.isArray(geo.features)||geo.features.length!==42)fail('expected 42 geographic features');
 if(!manifest.crs?.source||!manifest.crs?.output||typeof manifest.crs.approximate!=='boolean'||!url(manifest.source?.url))fail('source and coordinate provenance missing');
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.files?.display?.sha256||bytes.length!==manifest.files.display.bytes)fail('geometry hash/size mismatch');
 const provinces=geo.features.filter(f=>f.properties.kind==='province');
 if(provinces.length!==34||!unique(geo.features.map(f=>f.properties.id)))fail('province count or duplicate IDs');
 const validLine=points=>Array.isArray(points)&&points.length>=2&&points.every(p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
 for(const f of geo.features){
  if(!f.properties.name)fail('feature name missing');
  if(f.properties.kind==='province'){if(!validGeometry(f.geometry))fail(`invalid province ${f.properties.id}`);}
  else {const g=f.geometry;if(!['LineString','MultiLineString'].includes(g.type)||(g.type==='LineString'?!validLine(g.coordinates):!g.coordinates.every(validLine)))fail(`invalid boundary ${f.properties.id}`);}
 }
 return {features:geo.features.length,provinces:provinces.length,sha256:manifest.files.display.sha256,sourceCRS:manifest.crs.source,approximate:manifest.crs.approximate};
}
export function validatePublication({root=defaultRoot,catalogPath,writeManifest=true}={}){
  const dataRoot=resolve(root,'public/data');const catalogFile=catalogPath?resolve(root,catalogPath):resolve(dataRoot,'catalog.json');
  const readJson=u=>JSON.parse(readFileSync(resolve(root,'public',u.replace(/^\//,'')),'utf8'));
  const catalog=JSON.parse(readFileSync(catalogFile,'utf8'));const datasets=Object.fromEntries(catalog.datasets.map(d=>[d.id,readJson(d.url)]));
  const result=validateCatalog(catalog,datasets,readJson);
  let nationalVector=null;
  if(catalog.nationalMap){
    const config=catalog.nationalMap,metadata=readJson(config.manifestUrl);
    const bytes=readFileSync(resolve(root,'public',config.geometryUrl.replace(/^\//,'')));
    if(metadata.files?.display?.url!==config.geometryUrl)throw new Error('National vector URL differs from catalog');
    nationalVector=validateNationalVector(JSON.parse(bytes.toString('utf8')),metadata,bytes);
  }
  const urls=[...catalog.datasets.map(d=>d.url),...catalog.regions.flatMap(r=>[r.map.boundaryUrl,r.map.landUrl,r.map.regionLandUrl,r.map.manifestUrl]),...(catalog.nationalMap?[catalog.nationalMap.manifestUrl,catalog.nationalMap.geometryUrl]:[])];
  const files=[...new Set(urls)].map(u=>{const p=resolve(root,'public',u.replace(/^\//,''));const bytes=readFileSync(p);return {url:u,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
  const manifest={schemaVersion:3,catalogVersion:catalog.version,catalogSha256:createHash('sha256').update(readFileSync(catalogFile)).digest('hex'),checkedAt:new Date().toISOString(),...result,nationalVector,validation:['unique IDs and city counts','annual CNY current-price observations','industry rounding tolerance ≤0.21亿元','source names, URLs, dates and versions','population null semantics and derived GDP per capita','explicit source for each historical year; no interpolation','representative points in WGS84 bbox and administrative polygon','valid finite and closed polygon coordinates','regional land assets'],files};
  // Nothing is written until every dataset and map has passed. Atomic replace keeps prior valid manifests on failures.
  if(writeManifest){const dest=resolve(dataRoot,'v3-manifest.json');writeFileSync(dest+'.tmp',JSON.stringify(manifest,null,2));renameSync(dest+'.tmp',dest);}
  return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const manifest=validatePublication({catalogPath:process.argv.find(x=>x.startsWith('--catalog='))?.slice(10),writeManifest:!process.argv.includes('--check-only')});console.log(`Validated ${manifest.profiles} cities, ${manifest.datasets} datasets and ${manifest.regions} regions.`);}catch(e){console.error(e.message);process.exitCode=1;}
}

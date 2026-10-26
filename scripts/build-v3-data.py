"""Reproducible V3 admission from archived primary sources. Never rewrites V1/V2 data.

Run without flags to stage r2 files/maps and a candidate catalog. --publish validates
the entire candidate before atomically switching catalog; validation failure leaves
the current catalog and manifest unchanged. No network requests occur in this step.
"""
import argparse, copy, hashlib, json, re, subprocess
from datetime import datetime, timezone
from pathlib import Path
from bs4 import BeautifulSoup
from shapely.geometry import shape, mapping, Point, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'public/data'; EVID=ROOT/'source-data/v3'
NOW=datetime.now(timezone.utc).isoformat(); BASIS='现价金额；增长率按不变价格计算'
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--publish',action='store_true');args=parser.parse_args()
def read(p): return json.loads(p.read_text('utf-8-sig'))
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
freeze=EVID/'frozen-r2-publication.json'
if freeze.exists():
 record=read(freeze)
 assert all(sha(ROOT/name)==expected for name,expected in record['files'].items()),'Frozen r2 differs from recorded hashes; restore or publish a new dataset version.'
 print('r2 is frozen. All recorded file hashes match; no files were rewritten. Use a new dataset version for later changes.',flush=True)
 raise SystemExit(0)
def evidence_text(p):
 if p.suffix=='.pdf':
  import pymupdf
  with pymupdf.open(p) as pdf:text='\n'.join(page.get_text() for page in pdf)
 elif p.suffix=='.doc':text=p.read_bytes().decode('utf-16le',errors='ignore')
 else:text=p.read_text('utf-8-sig')
 if p.suffix=='.html': text=BeautifulSoup(text,'html.parser').get_text(' ',strip=True)
 # Tool snapshots preserve escaped line breaks as JSON. Decode once before checking.
 if p.suffix=='.json':
  value=json.loads(text)
  text=value if isinstance(value,str) else json.dumps(value,ensure_ascii=False)
 text=text.replace('\\n',' ').replace(',', '')
 return text+'\n'+re.sub(r'\s+','',text)
def verify_numbers(path,values):
 text=evidence_text(path)
 for n in values:
  token=format(n,'.12g')
  trailing=r'0*' if '.' in token else r'(?:\.0+)?'
  assert re.search(r'(?<![\d.])'+re.escape(token)+trailing+r'(?![\d.])',text),f'{path.name}: missing exact reviewed value {n}'
def historical(row,year=None,gdp=None,growth=None,status=None):
 return {'year':year or row['dataYear'],'gdp':row['gdp'] if gdp is None else gdp,
  'growth':row['growth'] if growth is None else growth,'sourceUrl':row['sourceUrl'],
  'sourceName':row['sourceName'],'publishedAt':row['publishedAt'],
  'revisionStatus':status or row['revisionStatus'],'priceBasis':BASIS}

backup=EVID/'catalog-v2-before.json'
if not backup.exists():
 original=read(DATA/'catalog.json');assert original['schemaVersion']==2,'original V2 catalog required'
 backup.write_bytes((DATA/'catalog.json').read_bytes())
catalog=read(backup)
original_paths=[DATA/'cities.json',*[DATA/d['url'].removeprefix('/data/') for d in catalog['datasets']]]
original_hashes={str(p.relative_to(ROOT)):sha(p) for p in original_paths}
supp=read(EVID/'backend-research/supplemental-observations.json')
for optional in ['gd-population-supplement.json','new-region-population-history.json','final-population-supplement.json']:
 if (EVID/'backend-research'/optional).exists():
  extra=read(EVID/'backend-research'/optional)
  supp['population']+=extra if isinstance(extra,list) else extra.get('population',[])
  if isinstance(extra,dict):supp.setdefault('history',[]).extend(extra.get('history',[]))
if (EVID/'additional-population.json').exists():supp['population']+=read(EVID/'additional-population.json')['population']
candidates=read(EVID/'candidate-observations.json')
for item in supp['gdp']:
 r=copy.deepcopy(item);r['en']={'510100':'Chengdu','340100':'Hefei'}[r['cityId']]
 if r['cityId']=='340100':r['revisionStatus']='全年统一核算（页面未标明最终核实）'
 r['evidenceFile']='source-data/v3/backend-research/'+r['snapshot'];r['rawFile']=r['evidenceFile'];r['population']=None
 assert sha(ROOT/r['evidenceFile'])==r['snapshotSha256'];candidates.append(r)
weather={x['cityId']:x for x in read(EVID/'weather-admission.json')}
features=[];admissions=[];new_rows=[]
for item in candidates:
 cid=item['cityId'];path=ROOT/item['evidenceFile']
 verify_numbers(path,[item['gdp'],*item['industries'],item['growth']])
 assert abs(sum(item['industries'])-item['gdp'])<=.211
 raw=read(EVID/f'osm-{cid}.json')
 administrative=next(x for x in raw if x['osm_type']=='relation' and x['type']=='administrative')
 center=next((x for x in raw if x['osm_type']=='node'),administrative)
 point=[float(center['lon']),float(center['lat'])];geometry=shape(administrative['geojson'])
 assert geometry.is_valid and geometry.covers(Point(point)),cid
 assert weather[cid]['available'] and weather[cid]['coordinateInsideBoundary'] and weather[cid]['coordinate']==point,cid
 p={'id':cid,'name':item['name'],'fullName':item['name']+'市','en':item['en'],
  'aliases':[item['name']+'市',item['en']], 'coordinate':point,'color':'#9ce4c9',
  'tag':'精选城市','description':'以官方全年数据观察经济规模与产业结构；精选集合不代表完整城市群。'}
 catalog['profiles'].append(p)
 features.append({'type':'Feature','properties':{'id':cid,'name':p['name'],'fullName':p['fullName'],
  'center':point,'osmRelationId':administrative['osm_id'],'sourceUrl':f"https://www.openstreetmap.org/relation/{administrative['osm_id']}",
  'coordinateSystem':'WGS84','license':'ODbL-1.0','adminLevel':administrative.get('extratags',{}).get('admin_level')},'geometry':administrative['geojson']})
 row={'cityId':cid,'dataYear':2025,'statPeriod':'2025全年','gdp':item['gdp'],'industries':item['industries'],
  'growth':item['growth'],'currency':'CNY','amountUnit':'亿元','priceBasis':BASIS,'sourceId':f'{cid}-2025',
  'sourceName':item['sourceName'],'sourceUrl':item['sourceUrl'],'publishedAt':item['publishedAt'],
  'fetchedAt':item.get('fetchedAt',datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat()),'revisionStatus':item.get('revisionStatus','初步核算'),'datasetVersion':'selected-annual-2025-r2'}
 new_rows.append(row)
 admissions.append({'cityId':cid,'name':p['name'],'admitted':True,'gdp':row['gdp'],'industries':row['industries'],'growth':row['growth'],
  'gates':{'officialAnnualData':True,'osmBoundaryAndPoint':True,'weatherLiveRequest':True},
  'evidenceFile':str(path.relative_to(ROOT)),'evidenceSha256':sha(path),'rawFile':item.get('rawFile'),
  'sourceUrl':row['sourceUrl'],'publishedAt':row['publishedAt'],'retrieval':item['retrieval'],
  'roundingDifference':round(sum(row['industries'])-row['gdp'],8),'coordinate':point,
  'osmRelationId':administrative['osm_id'],'osmSnapshotSha256':sha(EVID/f'osm-{cid}.json'),
  'coordinateSource':f"OSM {center['osm_type']}/{center['osm_id']}",'weather':weather[cid]})

gd=read(DATA/'datasets/gd-annual-2025-r1.json')
selected=read(DATA/'datasets/selected-annual-2025-r1.json')+new_rows
rows=gd+selected;byid={r['cityId']:r for r in rows}
population={}
for c in candidates:
 if c.get('population') is not None:
  verify_numbers(ROOT/c['evidenceFile'],[c['population']])
  population[c['cityId']]={'population':c['population'],'populationStatPeriod':'2025年末',
   'populationSourceUrl':c['sourceUrl'],'populationSourceName':c['sourceName'],
   'populationPublishedAt':c['publishedAt'],'evidenceFile':c['evidenceFile']}
for cid,value,evidence,pop_url,pop_date in [
 ('310000',2485.41,'source-data/v3/population-web-search.json',None,None),
 ('320500',1304.77,'source-data/v3/population-web-search.json','https://www.suzhou.gov.cn/szsrmzf/ndgmjjhshfztjsjfb/202605/0543af82405748cd9ffa4cfc81aecccd.shtml','2026-05-22'),
 ('120000',1363,'source-data/v2/120000-2025.txt',None,None),
 ('130100',1124.69,'source-data/v2/130100-2025.txt',None,None)]:
 verify_numbers(ROOT/evidence,[value]);r=byid[cid]
 population[cid]={'population':value,'populationStatPeriod':'2025年末','populationSourceUrl':pop_url or r['sourceUrl'],
  'populationSourceName':r['sourceName'],'populationPublishedAt':pop_date or r['publishedAt'],'evidenceFile':evidence}
for p in supp['population']:
 path=ROOT/p['evidenceFile'] if p.get('evidenceFile') else EVID/'backend-research'/p['snapshot'];assert sha(path)==p['snapshotSha256']
 if p['cityId']=='440400':
  review=next(x for x in read(EVID/'reviewed-pdf-populations.json') if x['cityId']==p['cityId'])
  assert review['snapshotSha256']==sha(path) and review['population']==p['population'] and review['populationStatPeriod']==p['populationStatPeriod']
  assert sha(ROOT/review['reviewImage'])==review['reviewImageSha256']
 else:verify_numbers(path,[p['population']])
 population[p['cityId']]={**p,'evidenceFile':str(path.relative_to(ROOT))}
for r in rows:
 r['datasetVersion']='gd-annual-2025-r2' if r['cityId'].startswith('44') else 'selected-annual-2025-r2'
 p=population.get(r['cityId'])
 r.update({k:p[k] if p else (None if k=='population' else '') for k in ['population','populationStatPeriod','populationSourceUrl','populationSourceName','populationPublishedAt']})
 r['populationUnit']='万人';r['gdpPerCapita']=round(r['gdp']/r['population']*10000) if p else None
 r['gdpPerCapitaBasis']='按年末常住人口计算（全年现价GDP÷年末常住人口），不等同官方按年平均人口计算的人均GDP'
 r['populationNote']='' if p else '同年官方常住人口来源尚未完成逐项核验，暂缺；不以0补齐。'
 if r['cityId']=='130100':r['populationNote']='公报地区生产总值和常住人口均含辛集市；地图为OSM石家庄行政边界，两者范围差异在来源说明中保留。'
 r['history']=[historical(r)]
for c in read(DATA/'gdp-2024-table.json'):
 cid=next(p['id'] for p in catalog['profiles'] if p['fullName']==c['fullName'])
 byid[cid]['history'].insert(0,{'year':2024,'gdp':c['gdp'],'growth':c['growth'],
  'sourceUrl':'https://stats.gd.gov.cn/fsjdgnsczz/content/post_4666332.html','sourceName':'广东省统计局',
  'publishedAt':'2025-02-10','revisionStatus':'初步核算（2024年原始发布口径，未以其他年份回填）','priceBasis':BASIS})
for cid,value,growth in [('500000',32046.73,5.6),('370200',16719.39,5.7)]:
 r=byid[cid];c=next(c for c in candidates if c['cityId']==cid);verify_numbers(ROOT/c['evidenceFile'],[value,growth])
 r['history'].insert(0,historical(r,2024,value,growth,'最终核实（2025统计公报附注）'))
for c in supp['gdp']:
 byid[c['cityId']]['history']=c.get('history',[])+byid[c['cityId']]['history']
# Official PDF graph 1, page 2: values separately visually checked against archived PNG.
for year,value,growth in [(2021,11222.22,4.7),(2022,12092.27,4.6),(2023,12756.21,5.8),(2024,13369.14,4.5)]:
 byid['610100']['history'].append(historical(byid['610100'],year,value,growth,'2025统计公报图1所载历史实际值'))
for item in supp.get('history',[]):
 cid=item['cityId'];assert sha(EVID/'backend-research'/item['snapshot'])==item['snapshotSha256']
 for h in item['history']:byid[cid]['history']=[x for x in byid[cid]['history'] if x['year']!=h['year']]+[h]
historical_tables=EVID/'backend-research/gd-history-2019-2023.json'
if historical_tables.exists():
 old=read(historical_tables);assert old['rowCount']==105 and len(old['history'])==21
 for table in old['sourceTables']:
  original=EVID/'backend-research'/table['snapshot'];assert sha(original)==table['snapshotSha256']
  if table.get('attachmentSnapshot'):assert sha(EVID/'backend-research'/table['attachmentSnapshot'])==table['attachmentSha256']
  else:
   parsed={}
   for tr in BeautifulSoup(original.read_text('utf-8-sig'),'html.parser').select('tr'):
    cells=[td.get_text('',strip=True) for td in tr.select('td')]
    if cells and cells[0].endswith('市'):parsed[cells[0]]=(float(cells[1]),float(cells[5]))
   assert len(parsed)==21
   for city in old['history']:
    h=next(h for h in city['history'] if h['year']==table['year'])
    assert parsed[city['name']+'市']==(h['originalAmount'],h['growth'])
 for city in old['history']:
  for h in city['history']:
   assert abs(h['gdp']-h['originalAmount']/(1 if h['originalUnit']=='亿元' else 10000))<1e-8
   clean={k:h[k] for k in ['year','gdp','growth','sourceUrl','sourceName','publishedAt','revisionStatus','priceBasis']}
   byid[city['cityId']]['history'].append(clean)
for r in rows:r['history'].sort(key=lambda h:h['year'])
for did,entries in [('gd-annual-2025-r2',gd),('selected-annual-2025-r2',selected)]:
 write(DATA/f'datasets/{did}.json',entries)
 catalog['datasets'].append({'id':did,'year':2025,'label':'2025 全年 · 人口与历史扩展','cityIds':[r['cityId'] for r in entries],'url':f'/data/datasets/{did}.json'})
for r in catalog['regions']:
 did='gd-annual-2025-r2' if r['id'] in ['prd','guangdong'] else 'selected-annual-2025-r2'
 r['datasetIds'].insert(0,did);r['defaultDatasetId']=did

definitions=[
 ('yangtze','长三角精选','长三角精选8城',['310000','320500','320100','330100','330200','340100','320200','320400'],['长三角','沪苏浙皖'],'上海黄浦江'),
 ('chengyu','成渝双城','成渝双城',['510100','500000'],['成渝','成渝双城'],'重庆两江'),
 ('middle-yangtze','长江中游精选','长江中游精选3城',['420100','430100','360100'],['长江中游','武汉长沙南昌'],'武汉长江'),
 ('guanzhong','关中精选','关中精选1城',['610100'],['关中','关中平原'],'西安城墙'),
 ('central','中原精选','中原精选1城',['410100'],['中原','中原城市群'],'郑州城市'),
 ('shandong','山东半岛精选','山东半岛精选2城',['370100','370200'],['山东半岛','山东'],'青岛海滨')]
features+=read(DATA/'maps/yangtze/boundaries.geojson')['features']
land_all=unary_union([shape(f['geometry']) for f in read(ROOT/'source-data/natural-earth-ne_10m_land.source.geojson')['features']])
map_audit=[]
for rid,name,label,ids,aliases,scene in definitions:
 fs=[f for f in features if f['properties']['id'] in ids];assert len(fs)==len(ids)
 w,s,e,n=unary_union([shape(f['geometry']) for f in fs]).bounds;bbox=[w-.1,s-.1,e+.1,n+.1]
 mask=land_all.intersection(box(*bbox)).simplify(.00025,preserve_topology=True)
 derived=[];exceptions=[]
 for f in fs:
  geom=shape(f['geometry']);clipped=geom.intersection(mask);assert clipped.is_valid and not clipped.is_empty
  point=next(p['coordinate'] for p in catalog['profiles'] if p['id']==f['properties']['id'])
  if not clipped.covers(Point(point)):exceptions.append({'cityId':f['properties']['id'],'coordinate':point,'note':'OSM原行政面内；Natural Earth低分辨率陆地外，未移动代表点或虚构陆地。'})
  derived.append({**f,'geometry':mapping(clipped)})
 folderid='yangtze-v3' if rid=='yangtze' else rid;folder=DATA/f'maps/{folderid}'
 write(folder/'boundaries.geojson',{'type':'FeatureCollection','features':fs})
 write(folder/'region-land.geojson',{'type':'FeatureCollection','features':derived})
 write(folder/'land.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':mapping(mask)}]})
 audit={'id':rid,'bbox':bbox,'crs':'WGS84','cityIds':ids,'allGeometriesValid':True,
  'allRepresentativePointsInsideAdministrativeBoundary':True,'coarseLandPointExceptions':exceptions,
  'landSource':'Natural Earth ne_10m_land (1:10 million; public domain)','landSimplificationDegrees':.00025,
  'osmAttribution':'© OpenStreetMap contributors · ODbL','sourceDate':NOW,
  'files':[{'url':f'/data/maps/{folderid}/{p.name}','sha256':sha(p),'bytes':p.stat().st_size} for p in folder.glob('*.geojson')]}
 write(folder/'manifest.json',audit);map_audit.append(audit)
 region={'id':rid,'name':name,'coverageLabel':label,'memberCityIds':ids,'datasetIds':['selected-annual-2025-r2'],
  'defaultDatasetId':'selected-annual-2025-r2','aliases':aliases,
  'map':{'boundaryUrl':f'/data/maps/{folderid}/boundaries.geojson','landUrl':f'/data/maps/{folderid}/land.geojson',
   'regionLandUrl':f'/data/maps/{folderid}/region-land.geojson','bbox':bbox,'manifestUrl':f'/data/maps/{folderid}/manifest.json'},
  'theme':{'id':rid,'accent':'#8db7df','sceneUrl':f'/scenes/{rid}.webp','sceneAlt':f'{scene}单城视角，AI 场景示意','focalPoint':'70% 50%'}}
 index=next((i for i,r in enumerate(catalog['regions']) if r['id']==rid),None)
 if index is None:catalog['regions'].append(region)
 else:catalog['regions'][index]=region
catalog['schemaVersion']=3;catalog['version']='zhuliu-v3-20260927-r2'
candidate=EVID/'catalog-v3-candidate.json';write(candidate,catalog)
assert all(sha(ROOT/p)==value for p,value in original_hashes.items()),'V1/V2 bytes unexpectedly changed'
write(EVID/'v3-publication-audit.json',{'verifiedAt':NOW,'newCities':admissions,'maps':map_audit,
 'cityCount':len(catalog['profiles']),'populationCovered':len(population),'populationMissing':[p['name'] for p in catalog['profiles'] if p['id'] not in population],
 'historyYears':{r['cityId']:[h['year'] for h in r['history']] for r in rows},
 'populationEvidence':population,'originalFileHashes':original_hashes,'originalFilesUnchanged':True})
subprocess.run(['node','scripts/pipeline/validate.mjs','--catalog=source-data/v3/catalog-v3-candidate.json','--check-only'],cwd=ROOT,check=True)
if args.publish:
 tmp=DATA/'catalog.json.tmp';tmp.write_bytes(candidate.read_bytes());tmp.replace(DATA/'catalog.json')
 subprocess.run(['node','scripts/pipeline/validate.mjs'],cwd=ROOT,check=True)
 print('Published V3 catalog.',flush=True)
print(f'Validated {len(rows)} cities; {len(population)} populations; original files unchanged.',flush=True)

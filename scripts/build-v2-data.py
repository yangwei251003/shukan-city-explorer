"""Publish verified annual observations and bounded regional map assets."""
import json, re, hashlib
from pathlib import Path
from datetime import datetime,timezone
from shapely.geometry import shape,mapping,Point,box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'public/data'; EVID=ROOT/'source-data/v2'
NOW=datetime.now(timezone.utc).isoformat()
def read(p):return json.loads(p.read_text('utf-8'))
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
old=read(DATA/'cities.json'); old_hash=sha(DATA/'cities.json')
gd=read(DATA/'guangdong.geojson'); profiles=[]
english=['Guangzhou','Shaoguan','Shenzhen','Zhuhai','Shantou','Foshan','Jiangmen','Zhanjiang','Maoming','Zhaoqing','Huizhou','Meizhou','Shanwei','Heyuan','Yangjiang','Qingyuan','Dongguan','Zhongshan','Chaozhou','Jieyang','Yunfu']
for f,en in zip(sorted(gd['features'],key=lambda x:x['properties']['id']),english):
 p=f['properties']; id=p['id']; name=p['name'].removesuffix('市'); existing=next((c for c in old if c['id']==id),{})
 profiles.append({'id':id,'name':name,'fullName':name+'市','en':en,'aliases':[name+'市',en], 'coordinate':existing.get('coordinate',p['center']),'color':existing.get('color','#9ce4c9'),'tag':existing.get('tag','城市观察'),'description':existing.get('description','从统一年度的经济规模与产业结构，观察这座城市。')})

extras=[
 ('310000','上海','Shanghai',56708.71,[99.39,11650.62,44958.70],5.4,'2026-03-30','https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html'),
 ('320500','苏州','Suzhou',27695.1,[208.9,12844.4,14641.8],5.4,'2026-04-30','https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml'),
 ('320100','南京','Nanjing',19428.78,[338.50,5873.07,13217.21],5.2,'2026-02-03','https://tjj.nanjing.gov.cn/gzdt/202602/t20260203_5785885.html'),
 ('110000','北京','Beijing',52073.4,[109.2,7187.4,44776.9],5.4,'2026-03-25','https://www.beijing.gov.cn/zhengce/zhengcefagui/202603/t20260325_4565678.html'),
 ('120000','天津','Tianjin',18539.82,[293.55,6154.46,12091.81],4.8,'2026-03-27','https://www.tj.gov.cn/sq/tjgb/202603/t20260327_7271193.html'),
 ('130100','石家庄','Shijiazhuang',8651.7,[573.6,2406.2,5671.9],6.0,'2026-05-26','https://tjj.sjz.gov.cn/columns/940d701f-5e56-4f5d-9ece-7968f6354993/202605/26/f062dca8-ce95-46f8-b1c9-33f507db5a29.html')]
extra_features=[]; extra_audit=[]
for id,name,en,gdp,industries,growth,published,url in extras:
 raw=read(EVID/f'osm-{id}.json')
 candidate=next(x for x in raw if x['name']==name+'市' and x['osm_type']=='relation' and x['type']=='administrative')
 center=next((x for x in raw if x['name']==name+'市' and x['osm_type']=='node'),candidate)
 coordinate=[float(center['lon']),float(center['lat'])]
 geom=shape(candidate['geojson']);assert geom.is_valid and geom.covers(Point(coordinate)),name
 feature={'type':'Feature','properties':{'id':id,'name':name,'fullName':name+'市','center':coordinate,'osmRelationId':candidate['osm_id'],'sourceUrl':f"https://www.openstreetmap.org/relation/{candidate['osm_id']}",'coordinateSystem':'WGS84','license':'ODbL-1.0','adminLevel':candidate['extratags'].get('admin_level')},'geometry':candidate['geojson']}
 extra_features.append(feature)
 profiles.append({'id':id,'name':name,'fullName':name+'市','en':en,'aliases':[name+'市',en],'coordinate':coordinate,'color':'#9ce4c9','tag':'精选城市','description':'在精选城市范围内，比较同一年度的经济与产业数据。'})
 evidence=EVID/f'{id}-web-evidence.json'
 if not evidence.exists():evidence=EVID/f'{id}-2025.txt'
 text=evidence.read_text('utf-8')
 for n in [gdp,*industries,growth]: assert re.search(re.escape(str(n).rstrip('0').rstrip('.') if '.' in str(n) else str(n)),text), (name,n)
 assert abs(sum(industries)-gdp)<=.21,name
 extra_audit.append({'cityId':id,'valuesVerified':True,'sourceUrl':url,'publishedAt':published,'evidenceFile':str(evidence.relative_to(ROOT)),'evidenceSha256':sha(evidence),'coordinateSource':f"OSM {center['osm_type']}/{center['osm_id']}",'coordinateInsideBoundary':True,'osmAdminLevel':candidate['extratags'].get('admin_level')})

def obs(profile,values,year,version,url,published,sourceName,status='初步核算'):
 gdp,industries,growth=values
 return {'cityId':profile['id'],'dataYear':year,'statPeriod':f'{year}全年','gdp':gdp,'industries':industries,'growth':growth,'currency':'CNY','amountUnit':'亿元','priceBasis':'现价金额；增长率按不变价格计算','sourceId':f"{profile['id']}-{year}",'sourceName':sourceName,'sourceUrl':url,'publishedAt':published,'fetchedAt':NOW,'revisionStatus':status,'datasetVersion':version}
gd25=[]
for row in read(EVID/'gd-2025-row-audit.json'):
 profile=next(p for p in profiles if p['fullName']==row['city']);v=row['values']
 gd25.append(obs(profile,(v[0],v[1:4],v[4]),2025,'gd-annual-2025-r1','https://stats.gd.gov.cn/fsjdgnsczz/content/post_4854894.html','2026-02-08','广东省统计局'))
# Preserve the original nine-city 2024 bytes and expose their exact observations as an archive.
gd24=[obs(c,(c['gdp'],c['industries'],c['growth']),2024,'prd-annual-2024-archive',c['sourceUrl'],'2025-02-10','广东省统计局','V1原始存档，未以新版回填') for c in old]
other=[obs(next(p for p in profiles if p['id']==id),(gdp,inds,growth),2025,'selected-annual-2025-r1',url,date,name+'统计部门') for id,name,en,gdp,inds,growth,date,url in extras]
datasets=[]
for id,year,rows,label in [('gd-annual-2025-r1',2025,gd25,'2025 全年 · 初步核算'),('prd-annual-2024-archive',2024,gd24,'2024 全年 · 原版存档'),('selected-annual-2025-r1',2025,other,'2025 全年 · 官方发布')]:
 write(DATA/f'datasets/{id}.json',rows);datasets.append({'id':id,'year':year,'label':label,'cityIds':[r['cityId'] for r in rows],'url':f'/data/datasets/{id}.json'})

land_source=read(ROOT/'source-data/natural-earth-ne_10m_land.source.geojson')
land_all=unary_union([shape(f['geometry']) for f in land_source['features']])
regions=[]; map_audit=[]
definitions=[('prd','珠三角','珠三角九市', [c['id'] for c in old],['gd-annual-2025-r1','prd-annual-2024-archive'],['珠三角','珠江三角洲','九市'],'gd'),('guangdong','广东','广东21市',[p['id'] for p in profiles if p['id'].startswith('44')],['gd-annual-2025-r1'],['广东省','广东'],'gd'),('yangtze','长三角精选','长三角精选3城',['310000','320500','320100'],['selected-annual-2025-r1'],['长三角','沪苏宁'],'yangtze'),('jingjinji','京津冀精选','京津冀精选3城',['110000','120000','130100'],['selected-annual-2025-r1'],['京津冀','京津石'],'jingjinji')]
for rid,name,label,ids,dids,aliases,theme in definitions:
 features=[f for f in gd['features']+extra_features if f['properties']['id'] in ids]
 envelope=unary_union([shape(f['geometry']) for f in features]).bounds
 w,s,e,n=envelope; bbox=[w-.1,s-.1,e+.1,n+.1]
 mask=land_all.intersection(box(*bbox)).simplify(.00025,preserve_topology=True)
 derived=[]; coarse_land_point_exceptions=[]
 for f in features:
  geom=shape(f['geometry']); clipped=geom.intersection(mask)
  assert geom.is_valid and clipped.is_valid and not clipped.is_empty
  p=next(p for p in profiles if p['id']==f['properties']['id'])
  assert geom.covers(Point(p['coordinate'])),p['name']
  if not clipped.covers(Point(p['coordinate'])):
   coarse_land_point_exceptions.append({'cityId':p['id'],'name':p['name'],'coordinate':p['coordinate'],'note':'Representative point lies inside original OSM administrative boundary but outside low-resolution Natural Earth land; no coordinate shifting or invented land applied.','distanceDegrees':clipped.distance(Point(p['coordinate']))})
  derived.append({**f,'geometry':mapping(clipped)})
 folder=DATA/f'maps/{rid}'
 write(folder/'boundaries.geojson',{'type':'FeatureCollection','features':features})
 write(folder/'region-land.geojson',{'type':'FeatureCollection','features':derived})
 write(folder/'land.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':mapping(mask)}]})
 audit={'id':rid,'bbox':bbox,'crs':'WGS84','cityIds':ids,'allGeometriesValid':True,'allRepresentativePointsInsideAdministrativeBoundary':True,'coarseLandPointExceptions':coarse_land_point_exceptions,'landSource':'Natural Earth ne_10m_land (1:10 million; public domain)','landSimplificationDegrees':.00025,'osmAttribution':'© OpenStreetMap contributors · ODbL','sourceDate':NOW,'files':[{'url':f'/data/maps/{rid}/{p.name}','sha256':sha(p),'bytes':p.stat().st_size} for p in folder.glob('*.geojson')]}
 write(folder/'manifest.json',audit);map_audit.append(audit)
 regions.append({'id':rid,'name':name,'coverageLabel':label,'memberCityIds':ids,'datasetIds':dids,'defaultDatasetId':dids[0],'aliases':aliases,'map':{'boundaryUrl':f'/data/maps/{rid}/boundaries.geojson','landUrl':f'/data/maps/{rid}/land.geojson','regionLandUrl':f'/data/maps/{rid}/region-land.geojson','bbox':bbox,'manifestUrl':f'/data/maps/{rid}/manifest.json'},'theme':{'id':theme,'accent':{'gd':'#8ce9c7','yangtze':'#8db7df','jingjinji':'#d8b985'}[theme],'sceneUrl':f'/scenes/{theme}.webp','sceneAlt':{'gd':'广州珠江滨水建筑意象，AI 生成场景示意','yangtze':'上海黄浦江滨水建筑意象，AI 生成场景示意','jingjinji':'北京中轴屋顶与对称街巷意象，AI 生成场景示意'}[theme],'focalPoint':'70% 50%'}})
write(DATA/'catalog.json',{'schemaVersion':2,'version':'zhuliu-v2-20260927-r1','defaultRegionId':'prd','profiles':profiles,'datasets':datasets,'regions':regions})
write(EVID/'v2-publication-audit.json',{'verifiedAt':NOW,'officialExtraCities':extra_audit,'maps':map_audit,'original2024SnapshotSha256':old_hash,'originalSnapshotUnchanged':sha(DATA/'cities.json')==old_hash})
print('Published',len(profiles),'profiles;',[(r['id'],len(r['memberCityIds'])) for r in regions],flush=True)

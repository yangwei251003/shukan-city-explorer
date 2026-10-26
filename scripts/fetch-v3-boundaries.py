"""One-time bounded, identified, cached OSM queries for V3 candidate cities."""
from pathlib import Path
from datetime import datetime, timezone
import json,time,requests,hashlib
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'source-data/v3'; OUT.mkdir(exist_ok=True)
names=[('330100','杭州市'),('330200','宁波市'),('340100','合肥市'),('320200','无锡市'),('320400','常州市'),('510100','成都市'),('500000','重庆市'),('420100','武汉市'),('430100','长沙市'),('360100','南昌市'),('610100','西安市'),('410100','郑州市'),('370100','济南市'),('370200','青岛市')]
audit=[]
for code,name in names:
 path=OUT/f'osm-{code}.json'
 record={'cityId':code,'name':name,'fetchedAt':datetime.now(timezone.utc).isoformat()}
 try:
  if not path.exists():
   time.sleep(1.3)
   r=requests.get('https://nominatim.openstreetmap.org/search',params={'q':name+', 中国','countrycodes':'cn','format':'jsonv2','polygon_geojson':1,'polygon_threshold':0.0008,'extratags':1,'limit':3},headers={'User-Agent':'Shukan-Student-Project/0.3 (14 named municipal boundaries; one-time cached research)'},timeout=35)
   record['queryUrl']=r.url;r.raise_for_status();path.write_text(r.text,encoding='utf-8')
  data=json.loads(path.read_text('utf-8'))
  record.update(file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),candidates=[{k:x.get(k) for k in ['name','osm_type','osm_id','type','lat','lon']} for x in data])
  print(code,record['candidates'],flush=True)
 except Exception as e: record['error']=str(e);print(code,'FAILED',str(e),flush=True)
 audit.append(record)
 (OUT/'osm-fetch-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')

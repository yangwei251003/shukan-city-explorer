"""Six named cities only: cached, identified, one request at a time, >=1.2s spacing."""
from pathlib import Path
from datetime import datetime, timezone
import json,time,requests
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'source-data/v2'; OUT.mkdir(exist_ok=True)
names=[('310000','上海市'),('320500','苏州市'),('320100','南京市'),('110000','北京市'),('120000','天津市'),('130100','石家庄市')]
for code,name in names:
 path=OUT/f'osm-{code}.json'
 try:
  if not path.exists():
   time.sleep(1.3)
   r=requests.get('https://nominatim.openstreetmap.org/search',params={'q':name+', 中国','countrycodes':'cn','format':'jsonv2','polygon_geojson':1,'polygon_threshold':0.0008,'extratags':1,'limit':3},headers={'User-Agent':'Zhuliu-Student-Project/0.2 (six named municipal boundaries; cached one-time research)'},timeout=35)
   r.raise_for_status();path.write_text(r.text,encoding='utf-8')
  data=json.loads(path.read_text('utf-8'))
  print(code,[(x.get('name'),x.get('osm_type'),x.get('osm_id'),x.get('type'),x.get('addresstype'),x.get('extratags',{}).get('admin_level'),x.get('geojson',{}).get('type'),x.get('lat'),x.get('lon')) for x in data],flush=True)
 except Exception as e: print(code,'FAILED',str(e),flush=True)

"""Admission check against the real Open-Meteo API; no synthetic weather."""
import json,requests,math
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import shape,Point
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'source-data/v3'
def check(path):
 rows=json.loads(path.read_text('utf-8'));boundary=next(x for x in rows if x['osm_type']=='relation' and x['type']=='administrative');center=next((x for x in rows if x['osm_type']=='node'),boundary)
 xy=[float(center['lon']),float(center['lat'])];gid=path.stem.replace('osm-','');record={'cityId':gid,'coordinate':xy,'coordinateInsideBoundary':shape(boundary['geojson']).covers(Point(xy)),'checkedAt':datetime.now(timezone.utc).isoformat()}
 try:
  url='https://api.open-meteo.com/v1/forecast';params={'latitude':xy[1],'longitude':xy[0],'current':'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code','hourly':'temperature_2m,precipitation_probability','forecast_days':2,'timezone':'Asia/Shanghai'}
  cache=OUT/f'weather-{gid}.json'
  if cache.exists():
   data=json.loads(cache.read_text('utf-8'));source=requests.Request('GET',url,params=params).prepare().url;record['checkedAt']=datetime.fromtimestamp(cache.stat().st_mtime,timezone.utc).isoformat()
  else:
   r=requests.get(url,params=params,timeout=25);r.raise_for_status();data=r.json();source=r.url
   cache.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
  current=data.get('current',{});hourly=data.get('hourly',{});hours=len(hourly.get('time',[]))
  numeric=lambda value:isinstance(value,(int,float)) and math.isfinite(value)
  available=bool(current.get('time') and all(numeric(current.get(k)) for k in ['temperature_2m','relative_humidity_2m','wind_speed_10m','weather_code']) and hours>=24 and all(len(hourly.get(k,[]))==hours and all(numeric(n) for n in hourly[k]) for k in ['temperature_2m','precipitation_probability']))
  record.update(available=available,sourceUrl=source,validTime=current.get('time'),hours=hours)
 except Exception as e:record.update(available=False,error=str(e))
 print(gid,record.get('available'),record.get('error',''),flush=True);return record
rows=list(ThreadPoolExecutor(max_workers=3).map(check,OUT.glob('osm-??????.json')))
(OUT/'weather-admission.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

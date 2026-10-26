"""Archive bounded public geographic/reference inputs for the five local scenes."""
from pathlib import Path
import concurrent.futures, hashlib, io, json, math, time
import requests
from PIL import Image
from pyproj import Transformer

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'source-data/v3.4-context'; OUT.mkdir(exist_ok=True)
to_ll=Transformer.from_crs(4978,4979,always_xy=True)
to_m=Transformer.from_crs(4326,3857,always_xy=True)
to_geo=Transformer.from_crs(3857,4326,always_xy=True)
sites={
 'shanghai-lujiazui':dict(center=[121.4985,31.2375],size=[3400,2800]),
 'guangzhou-zhujiang':dict(center=[113.3205,23.1158],size=[2900,3200]),
 'shenzhen-futian':dict(center=[114.0555,22.5426],size=[2900,3100]),
}
for name,size in [('hefei-swan-lake',[2000,2700]),('xian-dayan-pagoda',[720,950])]:
 source=json.loads((ROOT/'source-data/v3.3-models/downloads'/name/'tileset.json').read_text('utf8'))
 lon,lat,alt=to_ll.transform(*source['root']['transform'][12:15])
 sites[name]=dict(center=[lon,lat],size=size,rootAltitude=alt)

def get(url,params=None):
 r=requests.get(url,params=params,timeout=55,headers={'User-Agent':'Shukan-local-research/0.3.4'})
 r.raise_for_status(); return r

def one(name,s):
 d=OUT/name;d.mkdir(exist_ok=True)
 lon,lat=s['center']; w,h=s['size'];cx,cy=to_m.transform(lon,lat);scale=1/math.cos(math.radians(lat))
 extent=[cx-w*scale/2,cy-h*scale/2,cx+w*scale/2,cy+h*scale/2]
 west,south=to_geo.transform(*extent[:2]);east,north=to_geo.transform(*extent[2:]);s['bbox']=[west,south,east,north];s['mercatorExtent']=extent
 records=[]
 if not (d/'imagery.jpg').exists():
  params=dict(bbox=','.join(map(str,extent)),bboxSR=3857,imageSR=3857,size=f'2048,{round(2048*h/w)}',format='jpg',f='json')
  try:
   r=get('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export',params)
   meta=r.json();assert 'href' in meta,meta
   (d/'imagery-export.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
   image=get(meta['href']);Image.open(io.BytesIO(image.content)).verify();(d/'imagery.jpg').write_bytes(image.content)
   records.append(dict(kind='imagery',url=r.url,imageUrl=meta['href'],bytes=len(image.content),sha256=hashlib.sha256(image.content).hexdigest(),extent=meta['extent']))
  except Exception as e: records.append(dict(kind='imagery',error=str(e)))
 if not (d/'osm.json').exists():
  bbox=f'{south},{west},{north},{east}'
  query=f'[out:json][timeout:35];(way[building]({bbox});way["building:part"]({bbox});way[natural=water]({bbox});relation[natural=water]({bbox});way[waterway=riverbank]({bbox});way[highway]({bbox});way[leisure=park]({bbox}););out tags geom;'
  (d/'osm-query.txt').write_text(query,encoding='utf8')
  for endpoint in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']:
   try:
    r=get(endpoint,{'data':query});v=r.json();assert isinstance(v.get('elements'),list)
    (d/'osm.json').write_bytes(r.content);records.append(dict(kind='osm',url=r.url,elements=len(v['elements']),bytes=len(r.content),sha256=hashlib.sha256(r.content).hexdigest()));break
   except Exception as e: records.append(dict(kind='osm',endpoint=endpoint,error=str(e)))
 (d/'acquisition.json').write_text(json.dumps({'site':s,'retrievedOn':'2026-10-02','records':records},ensure_ascii=False,indent=2),encoding='utf8')
 return dict(site=name,records=[{k:v for k,v in r.items() if k not in ['url','imageUrl']} for r in records])

(OUT/'sites.json').write_text(json.dumps(sites,ensure_ascii=False,indent=2),encoding='utf8')
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for result in pool.map(lambda x:one(*x),sites.items()):print(json.dumps(result,ensure_ascii=False),flush=True)
(OUT/'sites.json').write_text(json.dumps(sites,ensure_ascii=False,indent=2),encoding='utf8')

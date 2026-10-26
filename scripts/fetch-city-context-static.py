"""Bounded cached imagery and OSM map extracts after export/Overpass failure."""
from pathlib import Path
import concurrent.futures,hashlib,io,json,math,time,xml.etree.ElementTree as ET
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'source-data/v3.4-context'
sites=json.loads((OUT/'sites.json').read_text('utf8')); R=6378137; MAX=math.pi*R
def get(url):
 r=requests.get(url,timeout=(6,25));r.raise_for_status();return r
def one(name,s):
 d=OUT/name; d.mkdir(exist_ok=True);records=[]
 lon,lat=s['center'];w,h=s['size'];scale=1/math.cos(math.radians(lat));cx=R*math.radians(lon);cy=R*math.asinh(math.tan(math.radians(lat)))
 extent=[cx-w*scale/2,cy-h*scale/2,cx+w*scale/2,cy+h*scale/2];s['mercatorExtent']=extent
 ll=lambda x,y:[math.degrees(x/R),math.degrees(math.atan(math.sinh(y/R)))]
 s['bbox']=ll(*extent[:2])+ll(*extent[2:]);west,south,east,north=s['bbox']
 z=18 if name.startswith('xian') else 17;n=2**z;step=2*MAX/n
 x0=int((extent[0]+MAX)/step);x1=int((extent[2]+MAX)/step);y0=int((MAX-extent[3])/step);y1=int((MAX-extent[1])/step)
 tile_dir=d/'imagery-tiles';tile_dir.mkdir(exist_ok=True)
 def tile(coord):
  x,y=coord;file=tile_dir/f'{z}-{y}-{x}.jpg';url=f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  if not file.exists():
   for attempt in range(2):
    try:r=get(url);Image.open(io.BytesIO(r.content)).verify();file.write_bytes(r.content);break
    except Exception:
     if attempt:raise
  raw=file.read_bytes();return x,y,file,dict(url=url,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
 canvas=Image.new('RGB',((x1-x0+1)*256,(y1-y0+1)*256));tiles=[]
 with concurrent.futures.ThreadPoolExecutor(4) as pool:
  for x,y,file,rec in pool.map(tile,[(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)]):
   canvas.paste(Image.open(file),((x-x0)*256,(y-y0)*256));tiles.append(rec)
 left=(extent[0]-(-MAX+x0*step))/step*256;top=((MAX-y0*step)-extent[3])/step*256
 rect=(left,top,left+(extent[2]-extent[0])/step*256,top+(extent[3]-extent[1])/step*256)
 canvas=canvas.transform((2048,round(2048*h/w)),Image.Transform.EXTENT,rect,Image.Resampling.BICUBIC);canvas.save(d/'imagery.jpg',quality=94)
 records.append(dict(kind='imagery',zoom=z,tileCount=len(tiles),tiles=tiles,extent=extent,size=canvas.size,sha256=hashlib.sha256((d/'imagery.jpg').read_bytes()).hexdigest()))
 file=d/'osm-map.xml';url=f'https://api.openstreetmap.org/api/0.6/map?bbox={west:.7f},{south:.7f},{east:.7f},{north:.7f}'
 if not file.exists():r=get(url);ET.fromstring(r.content);file.write_bytes(r.content)
 xml=ET.fromstring(file.read_bytes());nodes={e.attrib['id']:{'lat':float(e.attrib['lat']),'lon':float(e.attrib['lon'])} for e in xml.findall('node')};ways={};elements=[]
 for way in xml.findall('way'):
  tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')};ids=[n.attrib['ref'] for n in way.findall('nd')]
  geom=[nodes[i] for i in ids if i in nodes]
  if len(geom)!=len(ids):continue
  e=dict(type='way',id=int(way.attrib['id']),tags=tags,geometry=geom);ways[way.attrib['id']]=e;elements.append(e)
 for rel in xml.findall('relation'):
  tags={t.attrib['k']:t.attrib['v'] for t in rel.findall('tag')}
  if tags.get('natural')!='water' and tags.get('waterway')!='riverbank':continue
  members=[]
  for m in rel.findall('member'):
   a=m.attrib;way=ways.get(a['ref']) if a['type']=='way' else None
   if way:members.append(dict(type='way',ref=int(a['ref']),role=a['role'],geometry=way['geometry']))
  elements.append(dict(type='relation',id=int(rel.attrib['id']),tags=tags,members=members))
 for node in xml.findall('node'):
  tags={t.attrib['k']:t.attrib['v'] for t in node.findall('tag')}
  if tags:elements.append(dict(type='node',id=int(node.attrib['id']),tags=tags,**nodes[node.attrib['id']]))
 (d/'osm.json').write_text(json.dumps({'elements':elements},ensure_ascii=False),encoding='utf8')
 records.append(dict(kind='osm',url=url,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),elements=len(elements)))
 (d/'static-acquisition.json').write_text(json.dumps(dict(site=s,retrievedOn='2026-10-02',records=records),ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps(dict(site=name,imageryTiles=len(tiles),osmElements=len(elements)),ensure_ascii=False),flush=True)
for name,s in sites.items():one(name,s)
(OUT/'sites.json').write_text(json.dumps(sites,ensure_ascii=False,indent=2),encoding='utf8')

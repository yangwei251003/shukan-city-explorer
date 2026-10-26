"""Build continuous georeferenced scene surfaces and recognizable landmark reconstructions.

Coordinates are local east/north/up metres. Survey accuracy is not claimed. The user's
GDB provides real footprints/water; OSM height tags and cited landmark dimensions are
kept distinct from explicit low-rise context defaults. All meshes/materials are local.
"""
from pathlib import Path
import json,math,re,hashlib,subprocess
from collections import defaultdict
import numpy as np
import trimesh
from PIL import Image,ImageDraw
from shapely.geometry import shape,Polygon,Point,box,LineString
from shapely.geometry.polygon import orient
from shapely.ops import transform,triangulate,unary_union
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals
from city_materials import make_facades

ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'source-data/v3.4-context';OUT=ROOT/'source-data/v3.5-render/derived';OUT.mkdir(parents=True,exist_ok=True)
SITES=json.loads((SOURCE/'sites.json').read_text('utf8'));TAU=2*math.pi

def mat(name,color,metal=0,rough=.75,image=None):
 # glTF color factors are linear, while palette values are display sRGB.
 c=np.asarray(color,dtype=float)/255;c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
 return PBRMaterial(name=name,baseColorFactor=[*c,1.0],metallicFactor=metal,roughnessFactor=rough,baseColorTexture=image,doubleSided=False)
def facade_texture():
 im=Image.new('RGB',(128,256),(109,139,151));d=ImageDraw.Draw(im)
 for x in range(0,128,16):
  for y in range(0,256,16):
   v=(((x//16)*17+(y//16)*7)%9)-4;d.rectangle((x+2,y+2,x+14,y+13),fill=(102+v,133+v,145+v))
  d.line((x,0,x,256),fill=(168,180,179),width=2)
 for y in range(0,256,16):d.line((0,y,128,y),fill=(141,159,161),width=1)
 return im
MATS={'glass':mat('blue-grey facade / illustrative',(195,213,216),.28,.36,facade_texture()),
 'silver':mat('warm aluminium',(180,190,188),.4,.36),'stone':mat('limestone',(176,174,153)),
 'roof':mat('roof',(120,139,137),.08,.8),'white':mat('pearl enamel',(220,224,214),.25,.4),
 'water':mat('water / display material',(42,85,91),.05,.72),'base':mat('terrain section',(48,65,63)),
 'red':mat('civic red',(173,64,48)),'gold':mat('civic gold',(204,161,54),.2,.55),
 'green':mat('mapped tree canopy',(63,102,68)), 'trunk':mat('tree trunk',(91,76,55)),
 'blueRoof':mat('civic roof',(137,175,185),.35,.38),'road':mat('bridge deck',(147,145,131)),
 'pearl':mat('oriental pearl',(169,104,122),.3,.35)}

MATS.update(make_facades())
MATS['pearlRose']=mat('Oriental Pearl / rose glass',(164,48,104),.62,.2)
MATS['pearlConcrete']=mat('Oriental Pearl / pale concrete',(202,201,189),.03,.78)
MATS['pearlPanel']=mat('Oriental Pearl / silver panels',(199,211,215),.62,.28)
MATS['pearlDark']=mat('Oriental Pearl / observation glazing',(45,72,86),.5,.17)

def make_mesh(vertices,faces,material,uv=None):
 m=trimesh.Trimesh(np.asarray(vertices,dtype=np.float32),np.asarray(faces,dtype=np.uint32),process=False)
 m.visual=TextureVisuals(uv=np.asarray(uv,dtype=float) if uv is not None else np.zeros((len(vertices),2)),material=material)
 return m
def polygons(geom):
 if geom.is_empty:return []
 if geom.geom_type=='Polygon':return [geom]
 return [p for g in getattr(geom,'geoms',[]) for p in polygons(g)]

class Builder:
 def __init__(self,name):
  self.name=name;self.site=SITES[name];self.w,self.h=self.site['size'];self.lon,self.lat=self.site['center'];self.base={'hefei-swan-lake':-150,'xian-dayan-pagoda':403}.get(name,0)
  self.batch=defaultdict(list);self.audit={'site':name,'landmarks':[],'buildingCount':0,'heightSources':defaultdict(int),'waterAreaM2':0,'treeCount':0};self.labels=[]
  self.elements=json.loads((SOURCE/name/'osm.json').read_text('utf8'))['elements'];self.ways={str(e['id']):e for e in self.elements if e['type']=='way'}
  self.boundary=box(-self.w/2,-self.h/2,self.w/2,self.h/2);self.skip=[];self.owned={}
  self.audit.update(landmarkOwnership=[],excludedBuildingParts=[],contextBuildings=[])
 def xy(self,lon,lat):
  # Local tangent display projection; the same approximation maps source Mercator pixels.
  return (math.radians(lon-self.lon)*6378137*math.cos(math.radians(self.lat)), math.radians(lat-self.lat)*6378137)
 def project(self,g):return transform(lambda x,y,z=None:self.xy(np.asarray(x),np.asarray(y)),g)
 def geom(self,g):
  return transform(lambda x,y,z=None:((np.asarray(x)-self.lon)*math.pi/180*6378137*math.cos(math.radians(self.lat)),(np.asarray(y)-self.lat)*math.pi/180*6378137),g)
 def add(self,m,key):self.batch[key].append(m)
 def surface(self,p,z,key,texture=False):
  verts=[];faces=[];uv=[]
  for poly in polygons(p):
   for t in triangulate(poly):
    if not poly.covers(t):continue
    coords=list(orient(t,1).exterior.coords)[:3];start=len(verts)
    for x,y in coords:verts.append([x,y,z]);uv.append([x/self.w+.5,y/self.h+.5])
    faces.append([start,start+1,start+2])
  if verts:self.add(make_mesh(verts,faces,self.ground if texture else MATS[key],uv if texture else [[v[0]/32,v[1]/32] for v in verts]),'ground' if texture else key)
 def extrude(self,p,z,height,key='glass',roof=True):
  verts=[];faces=[];uv=[]
  for poly in polygons(p):
   poly=orient(poly,1)
   for ring in [poly.exterior,*poly.interiors]:
    coords=list(ring.coords);run=0
    for (x1,y1),(x2,y2) in zip(coords,coords[1:]):
     length=math.hypot(x2-x1,y2-y1);i=len(verts);verts.extend([[x1,y1,z],[x2,y2,z],[x2,y2,z+height],[x1,y1,z+height]])
     faces.extend([[i,i+1,i+2],[i,i+2,i+3]]);uv.extend([[run/32,0],[(run+length)/32,0],[(run+length)/32,height/64],[run/32,height/64]]);run+=length
  if verts:self.add(make_mesh(verts,faces,MATS[key],uv),key)
  if roof:self.surface(p,z+height,'roof')
 def block(self,center,size,key='glass',z=None):
  x,y=center;w,h,high=size;self.extrude(box(x-w/2,y-h/2,x+w/2,y+h/2),self.base if z is None else z,high,key)
 def tube(self,points,r,key='silver',sections=6):
  points=np.asarray(points);vertices=[];faces=[]
  for i,p in enumerate(points):
   direction=points[min(i+1,len(points)-1)]-points[max(0,i-1)];direction=direction/np.linalg.norm(direction)
   up=np.array([0,0,1.]);right=np.cross(direction,up)
   if np.linalg.norm(right)<.01:right=np.cross(direction,[0,1,0])
   right/=np.linalg.norm(right);up=np.cross(right,direction)
   for a in np.arange(sections)*TAU/sections:vertices.append(p+r*(math.cos(a)*right+math.sin(a)*up))
   if i:
    for j in range(sections):a=(i-1)*sections+j;b=(i-1)*sections+(j+1)%sections;c=i*sections+j;d=i*sections+(j+1)%sections;faces.extend([[a,b,d],[a,d,c]])
  if len(points)>1:self.add(make_mesh(vertices,faces,MATS[key]),key)
 def loft(self,center,rings,key='glass',angle=0):
  # rings contain (height, polygon XY); all share the same vertex count.
  x,y=center;n=len(rings[0][1]);v=[];uv=[];faces=[];co,si=math.cos(angle),math.sin(angle)
  for height,pts in rings:
   run=0
   for j,(px,py) in enumerate(pts):
    if j:run+=math.dist(pts[j-1],pts[j])
    v.append([x+px*co-py*si,y+px*si+py*co,self.base+height]);uv.append([run/32,height/64])
  for k in range(len(rings)-1):
   for j in range(n):a=k*n+j;b=k*n+(j+1)%n;c=a+n;d=b+n;faces.extend([[a,b,d],[a,d,c]])
  for j in range(1,n-1):faces.append([(len(rings)-1)*n,(len(rings)-1)*n+j,(len(rings)-1)*n+j+1])
  self.add(make_mesh(v,faces,MATS[key],uv),key)
 def ellipse(self,rx,ry,n=48,rot=0):return [(rx*math.cos(a+rot),ry*math.sin(a+rot)) for a in np.arange(n)*TAU/n]
 def rect(self,w,h,chamfer=0):
  a=w/2;b=h/2;c=chamfer
  return [(-a+c,-b),(a-c,-b),(a,-b+c),(a,b-c),(a-c,b),(-a+c,b),(-a,b-c),(-a,-b+c)]
 def osm_poly(self,osm_id):
  e=self.ways[str(osm_id)];return self.geom(Polygon([(p['lon'],p['lat']) for p in e['geometry']])).buffer(0)
 def anchor(self,osm_id):return self.osm_poly(osm_id).centroid.coords[0]
 def landmark(self,name,center,height,source,exclude=65):
  self.skip.append(Point(center).buffer(exclude));self.labels.append(dict(name=name,position=[*center,self.base+height],height=height));self.audit['landmarks'].append(dict(name=name,center=list(center),heightM=height,source=source))
 def own_footprint(self,oid,name):
  footprint=self.osm_poly(oid).buffer(9);self.skip.append(footprint)
  related=[]
  for key,e in self.ways.items():
   t=e.get('tags',{})
   if (t.get('building') or t.get('building:part')) and len(e.get('geometry',[]))>=4:
    part=self.osm_poly(key)
    if key==str(oid) or (t.get('building:part') and footprint.covers(part.representative_point())):
     self.owned[key]=name;related.append(key)
  self.audit['landmarkOwnership'].append(dict(name=name,osmId=str(oid),excludedOsmIds=related))
 def terrain(self):
  image=Image.open(SOURCE/self.name/'imagery.jpg').convert('RGB');self.ground=mat('Esri World Imagery / original observed imagery',(255,255,255),0,1,image)
  self.surface(self.boundary,self.base,'ground',True);self.extrude(self.boundary,self.base-22,22,'base',False)
  water=json.loads((SOURCE/self.name/'local-water.geojson').read_text('utf8'))['features'];self.water=unary_union([self.geom(shape(f['geometry'])).intersection(self.boundary) for f in water]).buffer(0)
  water_z=self.base+.35
  if self.name=='hefei-swan-lake':
   lake=unary_union([p for p in polygons(self.water) if p.area>200000])
   # An explicit display-level overlay covers noisy reconstructed water triangles.
   # This is a visual repair within the mapped shoreline, not a measured lake elevation.
   self.surface(lake,-118,'water');self.surface(self.water.difference(lake),water_z,'water')
   self.audit['waterRepair']='Mapped main-lake surface at local display Z=-118 m, above noisy photography water; not measured hydrology.'
  else:self.surface(self.water,water_z,'water')
  self.audit['waterAreaM2']=round(self.water.area,1)
  # Keep mapped bridges above water, rather than flooding their image with the water surface.
  roads=json.loads((SOURCE/self.name/'local-roads.geojson').read_text('utf8'))['features']
  for f in roads:
   if str(f['properties'].get('bridge','')).lower() not in ['t','yes','true','1']:continue
   g=self.geom(shape(f['geometry'])).intersection(self.boundary)
   if not g.intersects(self.water):continue
   width=4 if f['properties'].get('fclass') in ['footway','path','cycleway'] else 13
   self.surface(g.buffer(width/2,cap_style=2),water_z+6,'road')
 def context_buildings(self):
  features=json.loads((SOURCE/self.name/'local-buildings.geojson').read_text('utf8'))['features'];exclusion=unary_union(self.skip) if self.skip else Polygon()
  # Avoid replacing photographed buildings or layering an approximate extrusion over them.
  if self.name=='hefei-swan-lake':exclusion=exclusion.union(box(-840,-1150,840,1150))
  if self.name=='xian-dayan-pagoda':exclusion=exclusion.union(box(-180,-235,180,235))
  seen=set()
  def put(p,osm_id,tags):
   if osm_id in self.owned:
    self.audit['excludedBuildingParts'].append(dict(osmId=osm_id,owner=self.owned[osm_id]));return
   if not p.is_valid:p=p.buffer(0)
   p=p.intersection(self.boundary)
   if p.is_empty or p.area<12 or p.centroid.within(exclusion) or p.intersection(self.water).area>p.area*.25:return
   if tags.get('location')=='underground' or tags.get('building:levels')=='0' or str(tags.get('layer',''))=='-1':return
   def num(s):
    try:return float(re.search(r'[\d.]+',str(s))[0])
    except:return None
   height=num(tags.get('height'));level=num(tags.get('building:levels'));origin='OSM height'
   if not height:
    height=level*3.2 if level else 10;origin='OSM levels × 3.2 m' if level else 'illustrative 10 m context; height unknown'
   height=min(650,max(2,height));low=num(tags.get('min_height')) or 0
   if height<=low:return
   seed=int(osm_id or '0')
   key=['glass','glassSilver','glassTeal','glassWarm'][seed%4] if height>35 else ('brick' if seed%9==0 else 'residential')
   self.extrude(p,self.base+low,height-low,key);self.audit['buildingCount']+=1;self.audit['heightSources'][origin]+=1
   self.audit['contextBuildings'].append(dict(osmId=osm_id,heightM=height,center=list(p.centroid.coords[0]),material=key))
  for f in features:
   oid=str(f['properties'].get('osm_id',''));tags=self.ways.get(oid,{}).get('tags',{})
   put(self.geom(shape(f['geometry'])),oid,tags);seen.add(oid)
  for oid,e in self.ways.items():
   t=e.get('tags',{})
   if oid in seen or not(t.get('building') or t.get('building:part')) or len(e.get('geometry',[]))<4:continue
   if t.get('building:part') and not(t.get('height') or t.get('building:levels')):continue
   p=self.osm_poly(oid)
   put(p,oid,t)
  # Only explicitly mapped trees are elevated; generic parks remain observed imagery.
  for e in self.elements:
   if e['type']!='node' or e.get('tags',{}).get('natural')!='tree':continue
   x,y=self.xy(e['lon'],e['lat']);p=Point(x,y)
   if not self.boundary.contains(p) or p.within(exclusion) or p.within(self.water):continue
   crown=trimesh.creation.icosphere(subdivisions=1,radius=3.8);crown.apply_translation([x,y,self.base+7]);crown.visual=TextureVisuals(material=MATS['green']);self.add(crown,'green');self.audit['treeCount']+=1
 def canton(self):
  c=self.anchor(584204634);cx,cy=c
  self.landmark('广州塔',c,600,'https://www.arup.com/globalassets/downloads/insights/a/arups-innovation-legacy/arup-innovation-legacy.pdf',75)
  base=self.ellipse(40,30,24);top=self.ellipse(27,23,24,math.radians(135))
  def ring(t):return np.array(base)*(1-t)+np.array(top)*t
  for i in range(24):
   points=[[cx+ring(t)[i,0],cy+ring(t)[i,1],self.base+t*450] for t in np.linspace(0,1,30)]
   self.tube(points,1.1,'white',7)
  for j,t in enumerate(np.linspace(.01,1,46)):
   pts=ring(t);self.tube([[cx+x,cy+y,self.base+t*450] for x,y in [*pts,pts[0]]],.65,'white',6)
   if j<45:
    nextpts=ring(t+(.99/45))
    for i in range(24):self.tube([[cx+pts[i,0],cy+pts[i,1],self.base+t*450],[cx+nextpts[(i+1)%24,0],cy+nextpts[(i+1)%24,1],self.base+(t+.99/45)*450]],.28,'silver',4)
  self.loft(c,[(0,self.ellipse(8,9)),(435,self.ellipse(8,9))],'glass')
  for lo,hi,rx in [(28,77,23),(165,185,10),(335,350,16),(370,438,22)]:self.loft(c,[(lo,self.ellipse(rx,rx*.8)),(hi,self.ellipse(rx,rx*.8))],'glass')
  self.loft(c,[(450,self.ellipse(5.5,5.5,24)),(515,self.ellipse(4,4,24)),(540,self.ellipse(2.2,2.2,24)),(585,self.ellipse(1.7,1.7,24)),(600,self.ellipse(.3,.3,24))],'white')
  for a in np.arange(16)*TAU/16:
   sphere=trimesh.creation.uv_sphere(radius=2.6,count=[8,12]);sphere.apply_translation([cx+25*math.cos(a),cy+21*math.sin(a),self.base+450]);sphere.visual=TextureVisuals(material=MATS['silver']);self.add(sphere,'silver')
 def guangzhou(self):
  self.canton()
  c=self.anchor(511404889);self.landmark('周大福金融中心',c,530,'https://www.kpf.com/project/ctf-finance-centre',72)
  self.loft(c,[(0,self.rect(74,78,3)),(260,self.rect(74,78,3)),(267,self.rect(62,70,3)),(375,self.rect(62,70,3)),(382,self.rect(48,57,3)),(485,self.rect(48,57,3)),(530,self.rect(38,48,2))],'glass')
  for x in np.arange(-34,35,5):self.tube([[c[0]+x,c[1]-40,self.base],[c[0]+x,c[1]-40,self.base+258]],.55,'white',4)
  c=self.anchor(184738716);self.landmark('广州国际金融中心',c,440.2,'OSM way/184738716',64)
  rings=[]
  for h,s in [(0,1),(35,1.03),(280,.89),(420,.65),(440.2,.6)]:
   pts=[((36*math.cos(a)+8*math.cos(2*a))*s,(36*math.sin(a)-8*math.sin(2*a))*s) for a in np.arange(72)*TAU/72];rings.append((h,pts))
  self.loft(c,rings,'glass')
  for i in range(18):
   pts=[]
   for h in np.linspace(5,435,45):
    a=TAU*i/18+h*.008;s=np.interp(h,[0,35,280,420,440.2],[1,1.03,.89,.65,.6]);pts.append([c[0]+(36*math.cos(a)+8*math.cos(2*a))*s,c[1]+(36*math.sin(a)-8*math.sin(2*a))*s,self.base+h])
   self.tube(pts,.4,'silver',4)
  # The twin boulder roof follows the actual OSM footprint; triangulated facets reproduce its silhouette.
  for oid in [240896444,240896443]:
   if str(oid) not in self.ways:continue
   p=self.osm_poly(oid);c=p.centroid.coords[0];self.skip.append(p.buffer(5));self.audit['landmarks'].append(dict(name='广州大剧院折面屋顶',osmId=oid,source='https://www.zaha-hadid.com/wp-content/uploads/2019/12/guangzhouoperahouse.pdf',detail='silhouette reconstruction'))
   coords=list(p.simplify(4).convex_hull.exterior.coords)[:-1];v=[[x,y,self.base+3] for x,y in coords];v.append([c[0]+10,c[1]+7,self.base+42]);faces=[[i,(i+1)%len(coords),len(coords)] for i in range(len(coords))];self.add(make_mesh(v,faces,MATS['stone']),'stone')
  p=self.osm_poly(240896442);c=p.centroid.coords[0];self.skip.append(p.buffer(3));self.extrude(p,self.base+10,30,'red');self.block(c,[42,45,10],'stone')
 def shenzhen(self):
  c=self.anchor(535860513);self.landmark('平安金融中心',c,599.1,'https://www.kpf.com/project/ping-an-finance-centre',65)
  rings=[(0,self.rect(63,63,11)),(430,self.rect(62,62,11)),(510,self.rect(45,45,9)),(565,self.rect(28,28,6)),(585,self.rect(16,16,4)),(599.1,self.rect(3,3,.8))];self.loft(c,rings,'glass')
  for j in range(8):self.tube([[c[0]+pts[j][0],c[1]+pts[j][1],self.base+h] for h,pts in rings],1.2,'silver',7)
  for h in np.arange(12,550,12):
   width=float(np.interp(h,[0,430,510,565],[63,62,45,28]));pts=self.rect(width,width,8);self.tube([[c[0]+x,c[1]+y,self.base+h] for x,y in [*pts,pts[0]]],.25,'silver',4)
  # The previous point was the SOUTH EDGE, not the roof center. Anchor the whole
  # reconstruction to the actual mapped civic footprint and suppress its duplicate extrusion.
  civic=next(f for f in json.loads((SOURCE/self.name/'local-buildings.geojson').read_text('utf8'))['features'] if f['properties'].get('osm_id')=='10837975')
  civic_shape=self.geom(shape(civic['geometry']));c=civic_shape.centroid.coords[0]
  self.landmark('深圳市民中心',c,84,'https://www.sznews.com/photo/content/mb/2018-05/28/content_19206231_2.htm',0)
  self.skip.append(civic_shape.buffer(25));self.block((c[0]-128,c[1]),[183,110,25],'glass');self.block((c[0]+128,c[1]),[183,110,25],'glass')
  for x in [-128,128]:
   for h in [4,8,12,16,20,24]:self.block((c[0]+x,c[1]),[185,112,.8],'white',self.base+h)
  verts=[];faces=[];nx,ny=100,16
  for i in range(nx+1):
   x=-243+486*i/nx;z=33+20*math.exp(-(x/65)**2)+14*(abs(x)/243)**4
   for j in range(ny+1):
    y=-77+154*j/ny;verts.append([c[0]+x,c[1]+y,self.base+z+5*(y/77)**2])
  for i in range(nx):
   for j in range(ny):
    x=-243+486*(i+.5)/nx;y=-77+154*(j+.5)/ny
    if (100<abs(x)<123 or 169<abs(x)<190) and abs(y)<28:continue
    a=i*(ny+1)+j;faces.extend([[a,a+ny+1,a+ny+2],[a,a+ny+2,a+1]])
  roof=make_mesh(verts,faces,MATS['blueRoof']);roof.remove_unreferenced_vertices();roof.fix_normals();self.add(roof,'blueRoof')
  # Viewed from the north, the red square is on the left (east) and gold cylinder right.
  self.block((c[0]+57,c[1]+8),[39,42,84],'red');self.loft((c[0]-57,c[1]+8),[(0,self.ellipse(22,22)),(84,self.ellipse(22,22))],'gold')
  for x in np.arange(-228,230,28):self.tube([[c[0]+x,c[1]-65,self.base],[c[0]+x,c[1]-65,self.base+34]],1.1,'white',6)
  c=self.anchor(923157986);self.landmark('深圳证券交易所',c,245.8,'https://front.global/project/shenzhen-stock-exchange/',80)
  self.block(c,[49,62,245.8],'glass');self.block(c,[145,102,30],'silver',self.base+36)
 def pearl(self):
  columns=[self.anchor(oid) for oid in [520990194,520990195,520990196]]
  c=np.mean(columns,axis=0);cx,cy=c
  self.landmark('东方明珠',c,468,'OSM way/40778038 + three structural column footprints + exterior photo reference',0)
  self.own_footprint(40778038,'东方明珠')
  self.extrude(self.osm_poly(40778038),self.base,4,'pearlPanel')
  def sphere(center,radius):
   # Latitudinal silver caps, rose triangular glazing and a dark observation belt.
   x,y,z=center;segments=64;rows=32
   for row in range(rows):
    a0=-math.pi/2+math.pi*row/rows;a1=-math.pi/2+math.pi*(row+1)/rows
    mid=math.sin((a0+a1)/2);key='pearlRose' if abs(mid)<.61 else 'pearlPanel'
    if -.08<mid<.04:key='pearlDark'
    rings=[(z+radius*math.sin(a),self.ellipse(radius*max(.0001,math.cos(a)),radius*max(.0001,math.cos(a)),segments)) for a in [a0,a1]]
    # Avoid caps on each ring; they would intersect and obscure the sphere inside.
    verts=[[x+px,y+py,self.base+h] for h,pts in rings for px,py in pts];faces=[]
    for j in range(segments):k=(j+1)%segments;faces.extend([[j,k,k+segments],[j,k+segments,j+segments]])
    mesh=make_mesh(verts,faces,MATS[key]);norm=np.array(verts)-[x,y,self.base+z];norm/=np.linalg.norm(norm,axis=1,keepdims=True);mesh.vertex_normals=norm;self.add(mesh,key)
   for latitude in [-.61,-.3,.04,.33,.61]:
    r=radius*math.sqrt(1-latitude*latitude)
    self.tube([[x+r*math.cos(a),y+r*math.sin(a),self.base+z+radius*latitude] for a in np.linspace(0,TAU,97)],.10,'pearlPanel',4)
   # A fine triangular lattice is geometry, so it remains visible in oblique close-ups.
   for row,(a,b) in enumerate(zip([-.61,-.3,.04,.33],[-.3,.04,.33,.61])):
    for j in range(48):
     u=TAU*(j+(row%2)*.5)/48
     for delta in [-.5,.5]:
      pts=[]
      for t in np.linspace(0,1,5):
       lat=a*(1-t)+b*t;angle=u+TAU*delta/48*t;r=(radius+.10)*math.sqrt(1-lat*lat)
       pts.append([x+r*math.cos(angle),y+r*math.sin(angle),self.base+z+radius*lat])
      self.tube(pts,.105,'pearlPanel',4)
  for col in columns:
   dx,dy=np.array(col)-c;length=math.hypot(dx,dy);foot=c+np.array([dx,dy])/length*54
   self.tube([[*col,self.base],[*col,self.base+275]],4.5,'pearlConcrete',32)
   self.tube([[*foot,self.base+7],[col[0],col[1],self.base+91]],3.5,'pearlConcrete',24)
   sphere([*foot,9],7)
   for h in np.arange(12,275,6):
    self.tube([[col[0]+4.52*math.cos(a),col[1]+4.52*math.sin(a),self.base+h] for a in np.linspace(0,TAU,33)],.04,'silver',4)
  sphere([cx,cy,96.5],25);sphere([cx,cy,275],22.5);sphere([cx,cy,347.7],8.8)
  for h in [132,155,178,201,224]:sphere([cx,cy,h],7)
  self.loft(c,[(297.5,self.ellipse(4.5,4.5,32)),(343,self.ellipse(3.8,3.8,32)),(406,self.ellipse(2.4,2.4,32)),(448,self.ellipse(1.1,1.1,32)),(468,self.ellipse(.22,.22,32))],'pearlPanel')
  self.audit['pearl']=dict(count=1,anchorOsmIds=['520990194','520990195','520990196'],center=list(c),heightM=468,materials=['pearlConcrete','pearlPanel','pearlRose','pearlDark'],replacementOf='40778038',replacedIncorrectCenter=[121.496778,31.241515])
 def shanghai(self):
  original=trimesh.load(ROOT/'source-data/v3.3-models/downloads/amap-shanghai/city-derived.glb',force='scene')
  items=[]
  for name in original.graph.nodes_geometry:
   matrix,geom=original.graph[name];g=original.geometry[geom]
   # Geometry is reused, original giant texture images are not copied per node.
   m=trimesh.Trimesh(vertices=g.vertices.copy(),faces=g.faces.copy(),process=False);m.apply_transform(matrix);b=m.bounds;c=b.mean(axis=0);size=b[1]-b[0];items.append((name,m,c,size))
  self.pearl()
  specs=[('东方明珠',[-234,-262],None,468),('上海中心',[445,367],None,632),('金茂大厦',[371,203],None,420.5),('环球金融中心',[619,272],None,492)]
  ids=[None,165792123,376075961,10691100]
  for idx,(name,origin,ll,height) in enumerate(specs):
   if idx==0:continue
   self.own_footprint(ids[idx],name)
   c=self.xy(*ll) if ll else self.anchor(ids[idx]);self.landmark(name,c,height,'OSM footprint + AMap source geometry; height independently corrected',75)
   selected=[]
   for node,m,center,size in items:
    nearest=min(range(4),key=lambda j:math.hypot(center[0]-specs[j][1][0],center[2]-specs[j][1][1]))
    if nearest==idx and math.hypot(center[0]-origin[0],center[2]-origin[1])<115 and size[0]<270 and size[2]<270:selected.append(m)
   bounds=np.array([m.bounds for m in selected]);lo=bounds[:,0,:].min(axis=0);hi=bounds[:,1,:].max(axis=0);scale=height/(hi[1]-lo[1]);angle=math.radians(-13)
   for m in selected:
    v=m.vertices.copy();east=(v[:,0]-origin[0])*scale;north=-(v[:,2]-origin[1])*scale
    m.vertices=np.column_stack((c[0]+east*math.cos(angle)-north*math.sin(angle),c[1]+east*math.sin(angle)+north*math.cos(angle),self.base+(v[:,1]-lo[1])*scale))
    key={1:'towerGlass',2:'jinmaoGlass',3:'swfcGlass'}[idx]
    # Cylindrical U keeps the twisting tower's curtain wall continuous. Planar
    # towers are unwrapped face by face, so side walls cannot collapse to one pixel.
    vv=m.vertices;faces=m.faces;norm=m.face_normals
    uv=np.zeros((len(faces)*3,2));verts=vv[faces].reshape(-1,3)
    if idx==1:
     u=np.arctan2(vv[:,1]-c[1],vv[:,0]-c[0])*55/32
     uv[:,0]=u[faces].reshape(-1)
    else:
     for j,face in enumerate(faces):
      axis=1 if abs(norm[j,0])>abs(norm[j,1]) else 0
      uv[j*3:j*3+3,0]=vv[face,axis]/32
    uv[:,1]=verts[:,2]/64
    mesh=make_mesh(verts,np.arange(len(verts)).reshape(-1,3),MATS[key],uv)
    # Preserve smooth source normals rather than faceting every curved triangle.
    mesh.vertex_normals=m.vertex_normals[faces].reshape(-1,3)
    self.add(mesh,key)
  self.audit['shanghaiCorrection']='Oriental Pearl rebuilt from its three OSM column centers; all owned parts excluded. Other three source landmarks independently positioned at OSM footprints, rescaled to real heights, with explicit approximate -13 degree orientation. The unregistered surrounding AMap buildings are replaced by actual mapped footprints.'
 def finish(self):
  self.terrain()
  if self.name=='xian-dayan-pagoda':
   c=self.anchor(92223044);self.labels.append(dict(name='大雁塔',position=[*c,484],height=64.1,viewDistance=360))
  if self.name=='hefei-swan-lake':
   c=self.xy(117.2217664,31.8227739);self.labels.append(dict(name='政务中心',position=[*c,-20],height=110,viewDistance=1200))
  if self.name=='guangzhou-zhujiang':self.guangzhou()
  if self.name=='shenzhen-futian':self.shenzhen()
  if self.name=='shenzhen-futian':
   for label in self.labels:
    if label['name']=='深圳市民中心':label['viewDistance']=780
  if self.name=='shanghai-lujiazui':self.shanghai()
  self.context_buildings();self.atmosphere();scene=trimesh.Scene();transform_y=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]])
  for key,meshes in self.batch.items():
   vertices=[];faces=[];uv=[];normals=[];offset=0
   for part in meshes:
    vertices.append(part.vertices);normals.append(part.vertex_normals);faces.append(part.faces+offset);offset+=len(part.vertices)
    tex=getattr(part.visual,'uv',None);uv.append(tex if tex is not None else np.zeros((len(part.vertices),2)))
   m=make_mesh(np.concatenate(vertices),np.concatenate(faces),self.ground if key=='ground' else MATS[key],np.concatenate(uv))
   m.vertex_normals=np.concatenate(normals)
   if self.name!='xian-dayan-pagoda':m.apply_transform(transform_y)
   scene.add_geometry(m,node_name=key,geom_name=key)
  file=OUT/(self.name+'.glb');file.write_bytes(scene.export(file_type='glb'))
  subprocess.run(['node',str(ROOT/'scripts/prepare-city-glb.mjs'),str(file)],check=True)
  self.audit.update(bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),surfaceBounds=[-self.w/2,-self.h/2,self.w/2,self.h/2],groundZ=self.base,fullContinuousSurface=True,triangles=sum(len(g.faces) for g in scene.geometry.values()),labels=self.labels,materialBatches=len(scene.geometry))
  (OUT/(self.name+'.json')).write_text(json.dumps(self.audit,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:self.audit[k] for k in ['site','bytes','triangles','buildingCount','materialBatches']},ensure_ascii=False),flush=True)
 def atmosphere(self):
  self.audit['atmosphere']={'roads':[],'waterRoute':[],'meaning':'Illustrative movement along mapped geometry, not live traffic or vessel positions.'}
  if self.name not in ['shanghai-lujiazui','guangzhou-zhujiang','shenzhen-futian']:return
  candidates=[]
  for e in self.elements:
   t=e.get('tags',{});g=e.get('geometry',[])
   if e['type']!='way' or t.get('highway') not in ['primary','secondary','tertiary'] or len(g)<2 or t.get('tunnel')=='yes' or t.get('bridge')=='yes':continue
   line=self.geom(LineString([(p['lon'],p['lat']) for p in g])).intersection(self.boundary.buffer(-15))
   if line.geom_type!='LineString' or line.length<180 or line.intersects(self.water):continue
   candidates.append((line.distance(Point(0,0)),str(e['id']),line))
  for _,oid,line in sorted(candidates)[:18]:
   coords=list(line.simplify(.75).coords)
   self.audit['atmosphere']['roads'].append(dict(osmId=oid,points=[[round(x,2),round(y,2),self.base+.55] for x,y in coords]))
  # A conservative water-only route: every segment plus a 9 m vessel corridor must
  # stay inside the archived shoreline. It is scenery, not a ferry itinerary.
  if self.water.area<200000:return
  import heapq
  safe=self.water.buffer(-25);step=65;points={}
  for ix,x in enumerate(np.arange(-self.w/2+35,self.w/2-35,step)):
   for iy,y in enumerate(np.arange(-self.h/2+35,self.h/2-35,step)):
    if safe.contains(Point(x,y)):points[(ix,iy)]=(float(x),float(y))
  if not points:return
  def farthest(start):
   dist={start:0};prev={};queue=[(0,start)]
   while queue:
    d,p=heapq.heappop(queue)
    if d!=dist[p]:continue
    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,1),(-1,1),(1,-1)]:
     q=(p[0]+dx,p[1]+dy)
     if q not in points:continue
     weight=math.hypot(dx,dy)*step
     if d+weight>=dist.get(q,float('inf')) or not self.water.covers(LineString([points[p],points[q]]).buffer(9)):continue
     dist[q]=d+weight;prev[q]=p;heapq.heappush(queue,(d+weight,q))
   return max(dist,key=dist.get),prev
  start,_=farthest(next(iter(points)));end,prev=farthest(start);route=[end]
  while route[-1]!=start:route.append(prev[route[-1]])
  line=LineString([points[p] for p in route]);simple=line.simplify(20)
  if self.water.covers(simple.buffer(9)):line=simple
  self.audit['atmosphere']['waterRoute']=[[round(x,2),round(y,2),self.base+1] for x,y in line.coords]
  self.audit['atmosphere']['waterCorridorVerified']=self.water.covers(line.buffer(9))
if __name__=='__main__':
 import sys
 names=sys.argv[1:] or list(SITES)
 for name in names:
  if name not in SITES:raise SystemExit('Unknown bounded scene: '+name)
  Builder(name).finish()

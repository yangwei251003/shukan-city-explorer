"""Read the user's province archives in place; publish only bounded scene extracts."""
from pathlib import Path
import hashlib,json,zipfile,os
import pyogrio
from shapely.geometry import box

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'source-data/v3.4-context'
SOURCE=Path(os.environ['SHUKAN_OSM_ARCHIVE_DIR'])
sites=json.loads((OUT/'sites.json').read_text('utf8'))
provinces={'shanghai-lujiazui':'上海','guangzhou-zhujiang':'广东','shenzhen-futian':'广东','hefei-swan-lake':'安徽','xian-dayan-pagoda':'陕西'}
layers={'buildings':'gis_osm_buildings_a_free','water':'gis_osm_water_a_free','roads':'gis_osm_roads_free','landuse':'gis_osm_landuse_a_free'}
records=[];hashes={}
for name,province in provinces.items():
 file=SOURCE/f'{province}.gdb.zip'
 if province not in hashes:
  with file.open('rb') as stream:hashes[province]=hashlib.file_digest(stream,'sha256').hexdigest()
 with zipfile.ZipFile(file) as z:gdb=next(n.split('.gdb')[0]+'.gdb' for n in z.namelist() if '.gdb' in n)
 vsi=f'/vsizip/{file.as_posix()}/{gdb}';site=sites[name];boundary=box(*site['bbox'])
 for kind,layer in layers.items():
  info=pyogrio.read_info(vsi,layer=layer)
  columns=[v for v in ['osm_id','name','fclass','type','bridge','tunnel'] if v in info['fields']]
  frame=pyogrio.read_dataframe(vsi,layer=layer,bbox=tuple(site['bbox']),columns=columns)
  # The archive explicitly declares longitude/latitude WGS84 (OGC CRS84).
  frame=frame.to_crs('EPSG:4326');frame['geometry']=frame.geometry.make_valid().intersection(boundary);frame=frame[~frame.geometry.is_empty]
  target=OUT/name/f'local-{kind}.geojson';target.write_text(frame.to_json(drop_id=True,ensure_ascii=False),encoding='utf8')
  record=dict(site=name,province=province,archive=file.name,archiveSHA256=hashes[province],layer=layer,crs=info['crs'],fields=info['fields'].tolist(),bbox=site['bbox'],features=len(frame),output=target.relative_to(ROOT).as_posix(),sha256=hashlib.sha256(target.read_bytes()).hexdigest())
  records.append(record);print(json.dumps(dict(site=name,layer=kind,features=len(frame)),ensure_ascii=False),flush=True)
(OUT/'local-gdb-extraction.json').write_text(json.dumps(dict(sourceDirectory=str(SOURCE),readOnly=True,toolVersions=dict(pyogrio=pyogrio.__version__,gdal=pyogrio.__gdal_version_string__),note='目录日期 20260922 来自用户文件名；不独立证明所有要素更新时间。建筑图层不包含 height 或 levels，需用在线 OSM 标签和地标资料补充。',records=records),ensure_ascii=False,indent=2),encoding='utf8')

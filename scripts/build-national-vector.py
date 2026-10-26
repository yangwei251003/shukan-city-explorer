"""Build the local Shukan national vector from pinned public source snapshots.
No network request, package installation, catalog change, or source overwrite.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import shapely
from shapely.geometry import MultiPolygon, Point, mapping, shape
from shapely.ops import transform
from pyproj.transformer import TransformerGroup

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'source-data/v3.1-nation'
OUT = ROOT / 'public/data/nation/v3.1'
SOURCE = SOURCE_DIR / 'geojson-tiandi-0.3.0.json'
SOURCE_SHA = '0f868c3c9c4466b61548512ce0a49b24b75b87ac3481c856400e6cb3f18c3ad2'
VERSION = 'shukan-nation-20260928-r1'
TOLERANCE = 0.016
# Preserve small islands/parts exactly, not merely their centroids or a fake symbol.
PRESERVE_SMALL_PART_AREA = 0.01


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def part_stats(geometry):
    parts = list(geometry.geoms) if hasattr(geometry, 'geoms') else [geometry]
    return {'components': len(parts), 'holes': sum(len(p.interiors) for p in parts if p.geom_type == 'Polygon')}


def positions(value):
    if value and isinstance(value[0], (float, int)):
        yield value
    else:
        for child in value:
            yield from positions(child)


def simplify_geometry(geometry, tolerance):
    if geometry.geom_type == 'MultiPolygon':
        return MultiPolygon([part if part.area < PRESERVE_SMALL_PART_AREA else part.simplify(tolerance, preserve_topology=True) for part in geometry.geoms])
    if geometry.geom_type == 'Polygon' and geometry.area < PRESERVE_SMALL_PART_AREA:
        return geometry
    return geometry.simplify(tolerance, preserve_topology=True)


def build():
    raw = SOURCE.read_bytes()
    assert digest(raw) == SOURCE_SHA, 'Pinned source changed; review as a new version instead of silently replacing it.'
    source = json.loads(raw)
    assert source['crs']['properties']['name'] == 'urn:ogc:def:crs:EPSG::4490'
    assert len(source['features']) == 42
    transformer = TransformerGroup('EPSG:4490', 'EPSG:4326', always_xy=True).transformers[0]
    # PROJ currently offers only a ballpark/no-op geographic datum relation.
    # Never label this as original WGS84 or a surveyed high-accuracy conversion.
    full_features, simplified_features, checks = [], [], []
    protected_original = protected_output = 0
    for index, source_feature in enumerate(source['features']):
        properties = source_feature['properties']
        original = shape(source_feature['geometry'])
        assert original.is_valid and not original.is_empty, f'Invalid source geometry at {index}'
        geographic = transform(transformer.transform, original)
        assert geographic.is_valid
        province = original.geom_type in ('Polygon', 'MultiPolygon')
        code = str(properties.get('code', ''))
        maritime = not province and index == 40
        if province:
            assert len(code) == 6 and code.isdigit()
            ident, kind, name = code, 'province', properties['name']
        else:
            ident = 'boundary-' + str(index - 33)
            kind = 'maritime-line' if maritime else 'boundary-line'
            name = '海上分段线（10段）' if maritime else properties['name']
        if maritime:
            assert len(original.geoms) == 10 and original.bounds[1] < 4 and original.bounds[3] > 24
        props = {'id': ident, 'name': name, 'kind': kind, 'sourceName': properties['name']}
        if province:
            props['adcode'] = code
        else:
            props['sourceFeatureIndex'] = index
        common = {'type': 'Feature', 'id': ident, 'properties': props}
        full_features.append({**common, 'geometry': mapping(geographic)})
        tolerance = TOLERANCE
        while True:
            display = simplify_geometry(geographic, tolerance)
            if display.is_valid and not display.is_empty and part_stats(display) == part_stats(geographic):
                break
            tolerance /= 2
            assert tolerance > 0.00001, f'Could not safely simplify {ident}'
        if province:
            source_parts = list(geographic.geoms) if hasattr(geographic, 'geoms') else [geographic]
            output_parts = list(display.geoms) if hasattr(display, 'geoms') else [display]
            for before, after in zip(source_parts, output_parts):
                if before.area < PRESERVE_SMALL_PART_AREA:
                    protected_original += 1
                    assert before.equals_exact(after, 0), f'Protected island/part changed for {ident}'
                    protected_output += 1
        coords = mapping(display)['coordinates']
        assert all(len(p) == 2 and all(math.isfinite(n) for n in p) and -180 <= p[0] <= 180 and -90 <= p[1] <= 90 for p in positions(coords))
        simplified_features.append({**common, 'geometry': mapping(display)})
        checks.append({'id': ident, 'name': name, 'kind': kind, 'sourceValid': original.is_valid,
                       'outputValid': display.is_valid, 'sourceParts': part_stats(original),
                       'outputParts': part_stats(display), 'simplificationToleranceDegrees': tolerance,
                       'sourceVertices': sum(1 for _ in positions(source_feature['geometry']['coordinates'])),
                       'outputVertices': sum(1 for _ in positions(coords)),
                       'hausdorffDistanceDegrees': geographic.hausdorff_distance(display),
                       'areaChangePercent': (display.area / geographic.area - 1) * 100 if geographic.area else None})
    assert sum(f['properties']['kind'] == 'province' for f in full_features) == 34
    assert protected_original == protected_output
    expected_codes = {f['properties']['adcode'] for f in full_features if f['properties']['kind'] == 'province'}
    assert {'460000', '710000', '810000', '820000'}.issubset(expected_codes)
    province_shapes = {f['properties']['adcode']: shape(f['geometry']) for f in simplified_features if f['properties']['kind'] == 'province'}
    catalog = json.loads((ROOT / 'public/data/catalog.json').read_text(encoding='utf-8-sig'))
    city_checks = []
    for city in catalog['profiles']:
        code = city['id'][:2] + '0000'
        point = Point(city['coordinate'])
        inside = province_shapes[code].covers(point)
        assert inside, f"Published city outside its province: {city['name']}"
        city_checks.append({'id': city['id'], 'name': city['name'], 'province': code, 'coordinate': city['coordinate'], 'insideProvince': inside})
    all_bounds = [shape(f['geometry']).bounds for f in full_features]
    bbox = [min(b[0] for b in all_bounds), min(b[1] for b in all_bounds), max(b[2] for b in all_bounds), max(b[3] for b in all_bounds)]
    meta = {'version': VERSION, 'sourceCRS': 'EPSG:4490', 'displayCRS': 'WGS84-compatible longitude/latitude (approximate)',
            'crsNote': '源 CGCS2000；PROJ 近似同位转换供 WGS84 兼容显示，非原生 WGS84 或精密坐标变换。',
            'attribution': '天地图来源 · GeoJSON.CN 整理', 'sourceVersion': '0.3.0'}
    full = {'type': 'FeatureCollection', 'bbox': bbox, 'features': full_features, 'meta': {**meta, 'simplified': False}}
    display = {'type': 'FeatureCollection', 'bbox': bbox, 'features': simplified_features, 'meta': {**meta, 'simplified': True}}
    full_raw, display_raw = encoded(full), encoded(display)
    assert len(display_raw) <= 500000, 'Display vector exceeds agreed 500KB local product budget.'
    validation = {'valid': True, 'featureCount': 42, 'provinceCount': 34, 'boundaryGroupCount': 8, 'maritimeSegmentCount': 10,
                  'protectedSmallParts': protected_output, 'allSourceAndOutputGeometriesValid': True,
                  'partAndHoleCountsUnchanged': True, 'sourceCoverageValid': bool(shapely.coverage_is_valid([shape(f['geometry']) for f in full_features if f['properties']['kind'] == 'province'])),
                  'coverageNote': '上游并非严格无缝拓扑覆盖；本次不擅自融合/改画边界。逐要素保拓扑简化不保证相邻省界节点完全一致，仅用于全国参考展示。',
                  'cityCount': len(city_checks), 'cityRepresentativePoints': city_checks, 'features': checks}
    manifest = {'schemaVersion': 1, 'version': VERSION, 'status': 'local-vector-reference',
                'source': {'provider': 'GeoJSON.CN', 'upstream': '天地图', 'version': '0.3.0',
                           'url': 'https://geojson.cn/api/tiandi/0.3.0/100000.json',
                           'documentation': 'https://geojson.cn/data/atlas/tiandi',
                           'sourceDate': source.get('meta', {}).get('date'), 'originalFile': 'source-data/v3.1-nation/geojson-tiandi-0.3.0.json',
                           'bytes': len(raw), 'sha256': digest(raw)},
                'crs': {'source': 'EPSG:4490 CGCS2000', 'output': 'EPSG:4326-compatible display',
                        'approximate': True, 'transformation': transformer.description,
                        'projDefinition': transformer.definition, 'accuracyMetres': None if transformer.accuracy < 0 else transformer.accuracy,
                        'note': meta['crsNote']},
                'files': {'display': {'url': '/data/nation/v3.1/china.geojson', 'bytes': len(display_raw), 'sha256': digest(display_raw)},
                          'full': {'url': '/data/nation/v3.1/china.full.geojson', 'bytes': len(full_raw), 'sha256': digest(full_raw)}},
                'bbox': bbox, 'features': 42, 'provinces': 34, 'boundaryGroups': 8, 'maritimeSegments': 10,
                'simplification': {'toleranceDegrees': TOLERANCE, 'method': 'Shapely preserve_topology per polygon; whole small polygon parts untouched',
                                   'protectedPartAreaBelowSquareDegrees': PRESERVE_SMALL_PART_AREA, 'protectedParts': protected_output,
                                   'partAndHoleCountsPreserved': True, 'coordinateRounding': 'none',
                                   'budget300000BytesMet': len(display_raw) <= 300000, 'budget500000BytesMet': len(display_raw) <= 500000},
                'recommendedView': {'projection': 'Albers Equal Area', 'standardParallels': [25, 47], 'centralMeridian': 105,
                                    'mainBounds': [73, 18, 135.2, 53.7], 'southChinaSeaInsetBounds': [105, 2.5, 125.5, 25.5],
                                    'note': '城市代表点同投影；南海附图使用同源真实坐标，不复制像素轮廓或伪造分段线；Polygon 内环采用 evenodd。'},
                'usage': {'attribution': meta['attribution'],
                          'terms': 'GeoJSON.CN 文档公开提供免费的全国及省级数据接口，保留其版权与天地图来源；未将免费接口称为独立开放数据许可。',
                          'oldReviewNumberTransferred': False,
                          'standardRasterReference': '/data/nation/china-standard-map.jpg'},
                'validationFile': '/data/nation/v3.1/validation.json', 'documentation': 'docs/V3.1-全国矢量地图.md'}
    return {'china.geojson': display_raw, 'china.full.geojson': full_raw, 'manifest.json': encoded(manifest), 'validation.json': encoded(validation)}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    outputs = build()  # All source, geometry, point and size gates run before writes.
    if args.check_only:
        for name, expected in outputs.items():
            assert (OUT / name).read_bytes() == expected, f'Generated file differs: {name}'
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, contents in outputs.items():
            (OUT / name).write_bytes(contents)
    print(json.dumps({'valid': True, 'mode': 'check' if args.check_only else 'build', 'files': {name: len(data) for name, data in outputs.items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()

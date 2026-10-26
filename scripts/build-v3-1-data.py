"""Prepare/populate immutable r3 data from reviewed source snapshots.

Default: stage r3 files and a candidate catalog, never replace the active catalog.
--publish: validate the candidate, then switch catalog and freeze r3 once.
Once frozen, every invocation only checks hashes; corrections need a new revision.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'source-data/v3.1-population'
CATALOG = ROOT / 'public/data/catalog.json'
BASE_CATALOG = EVIDENCE / 'catalog-r2-snapshot.json'
CANDIDATE = EVIDENCE / 'catalog-r3-candidate.json'
FREEZE = EVIDENCE / 'frozen-r3-publication.json'
R2_FREEZE = ROOT / 'source-data/v3/frozen-r2-publication.json'
VERSION = 'zhuliu-v3.1-20260928-r3'
ALLOWED_CITY_IDS = {'441200', '441400', '441800', '445100', '445200', '340100', '360100'}
REVISIONS = {'gd-annual-2025-r2': 'gd-annual-2025-r3',
             'selected-annual-2025-r2': 'selected-annual-2025-r3'}
SOURCES = [EVIDENCE / 'gd-verified-observations.json',
           EVIDENCE / 'research-hf-nc/population-evidence.json',
           EVIDENCE / 'research-qy/population-evidence.json',
           EVIDENCE / 'meizhou-verified-observation.json']


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def validate_artifacts(value):
    """Verify every declared raw snapshot, including reproduced official images."""
    if isinstance(value, dict):
        if 'snapshotPath' in value and 'sha256' in value:
            path = (ROOT / value['snapshotPath']).resolve()
            assert path.is_relative_to(EVIDENCE), f'Out-of-scope evidence path: {path}'
            assert sha(path) == value['sha256'], f'Changed evidence: {path}'
        if 'publicationSnapshotPath' in value and 'publicationSha256' in value:
            path = (ROOT / value['publicationSnapshotPath']).resolve()
            assert path.is_relative_to(EVIDENCE), f'Out-of-scope publication path: {path}'
            assert sha(path) == value['publicationSha256'], f'Changed publication: {path}'
        for child in value.values():
            validate_artifacts(child)
    elif isinstance(value, list):
        for child in value:
            validate_artifacts(child)


def verify_r2():
    frozen = read(R2_FREEZE)
    for relative, expected in frozen['files'].items():
        path = BASE_CATALOG if relative == 'public/data/catalog.json' else ROOT / relative
        assert sha(path) == expected, f'Frozen r2 changed: {relative}'
    return sha(R2_FREEZE)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true', help='Switch to reviewed r3 after validation')
    args = parser.parse_args()
    if FREEZE.exists():
        frozen = read(FREEZE)
        for relative, expected in frozen['files'].items():
            assert sha(ROOT / relative) == expected, f'Frozen r3 changed: {relative}'
        for source in SOURCES:
            if source.exists():
                validate_artifacts(read(source))
        assert verify_r2() == frozen['r2FreezeSha256'], 'Original r2 freeze record changed'
        print(f"r3 frozen and verified: {frozen['populationCovered']}/{frozen['cityCount']} populations; no files changed.")
        return

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    expected_base = read(R2_FREEZE)['files']['public/data/catalog.json']
    if not BASE_CATALOG.exists():
        assert sha(CATALOG) == expected_base, 'Active catalog changed before preserving r2 snapshot'
        BASE_CATALOG.write_bytes(CATALOG.read_bytes())
    original_freeze_hash = verify_r2()
    observations = {}
    unresolved = []
    used_sources = []
    for path in SOURCES:
        if not path.exists():
            continue
        document = read(path)
        validate_artifacts(document)
        used_sources.append(path)
        unresolved.extend(document.get('unresolved', []))
        for row in document.get('observations', []):
            city = row['cityId']
            assert city in ALLOWED_CITY_IDS and city not in observations, f'Unexpected or duplicate city {city}'
            assert row['populationStatPeriod'] == '2025年末', f'Population period mismatch: {city}'
            assert row.get('populationUnit', row.get('unit')) == '万人', f'Population unit mismatch: {city}'
            assert isinstance(row['population'], (float, int)) and row['population'] > 0
            assert row['sourceUrl'].startswith(('http://', 'https://'))
            assert row['sourceName'] and len(row['publishedAt']) == 10
            datetime.fromisoformat(row['publishedAt'])
            assert row['snapshotPath'] and row['sha256']
            observations[city] = row

    catalog = copy.deepcopy(read(BASE_CATALOG))
    catalog['version'] = VERSION
    catalog['nationalMap'] = {'manifestUrl': '/data/nation/v3.1/manifest.json',
                              'geometryUrl': '/data/nation/v3.1/china.geojson'}
    all_rows = []
    paths = []
    applied = set()
    for old_id, new_id in REVISIONS.items():
        descriptor = copy.deepcopy(next(d for d in catalog['datasets'] if d['id'] == old_id))
        old_rows = read(ROOT / ('public' + descriptor['url']))
        rows = copy.deepcopy(old_rows)
        for row in rows:
            row['datasetVersion'] = new_id
            city = row['cityId']
            if city in observations:
                evidence = observations[city]
                assert row.get('population') is None, f'Refusing to overwrite verified r2 population: {city}'
                row.update(population=evidence['population'], populationStatPeriod='2025年末',
                           populationUnit='万人', populationSourceName=evidence['sourceName'],
                           populationSourceUrl=evidence['sourceUrl'], populationPublishedAt=evidence['publishedAt'],
                           populationFetchedAt=evidence['fetchedAt'],
                           populationNote=evidence.get('populationNote', ''))
                if city == '340100':
                    row['populationNote'] = '采用统计局2026-06-15原发布页面的公开转载截图，正文与表格均为1000.5万人；来源链接及发布日期记录2026-06-19正式报道载体，不冒称官网直取。'
                elif city == '441800':
                    row['populationNote'] = '官方月报2025年度对比表直接列出397.64万人；人口行未另印年末，与市统计公报公开全文转载的年末数核对一致，未使用人均GDP倒推。'
                per_capita = Decimal(str(row['gdp'])) / Decimal(str(row['population'])) * 10000
                row['gdpPerCapita'] = int(per_capita.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
                applied.add(city)
            if city == '360100' and city not in observations:
                row['populationNote'] = '截至本版核验，尚未找到可准入的2025年末常住人口精确值；不使用2024旧值、全省减其余地市倒推值或11月1日抽样时点代替。'
            if row.get('population') is None:
                assert row.get('gdpPerCapita') is None
            else:
                assert row['populationStatPeriod'] == '2025年末'
                assert abs(row['gdpPerCapita'] - row['gdp'] / row['population'] * 10000) <= .500001
            original = next(x for x in old_rows if x['cityId'] == city)
            mutable = {'datasetVersion', 'population', 'populationStatPeriod', 'populationUnit', 'populationSourceUrl', 'populationSourceName',
                       'populationPublishedAt', 'populationFetchedAt', 'populationNote', 'gdpPerCapita'}
            assert {k: v for k, v in row.items() if k not in mutable} == {k: v for k, v in original.items() if k not in mutable}, f'Unrelated data changed: {city}'
        descriptor.update(id=new_id, url=f'/data/datasets/{new_id}.json', label='2025 全年 · 人口更新')
        path = ROOT / ('public' + descriptor['url'])
        write(path, rows)
        paths.append(path)
        catalog['datasets'].append(descriptor)
        all_rows.extend(rows)
    assert applied == set(observations), 'Evidence city missing from dataset'
    assert len(all_rows) == 41 and len({r['cityId'] for r in all_rows}) == 41
    for region in catalog['regions']:
        old_default = region['defaultDatasetId']
        assert old_default in REVISIONS
        region['defaultDatasetId'] = REVISIONS[old_default]
        region['datasetIds'].insert(0, REVISIONS[old_default])
    write(CANDIDATE, catalog)
    subprocess.run(['node', 'scripts/pipeline/validate.mjs', f'--catalog={CANDIDATE}', '--check-only'], cwd=ROOT, check=True)
    verify_r2()
    assert sha(R2_FREEZE) == original_freeze_hash
    names = {c['id']: c['name'] for c in catalog['profiles']}
    summary = {'version': VERSION, 'cityCount': len(all_rows), 'newPopulationCities': [names[k] for k in sorted(applied)],
               'populationCovered': sum(r.get('population') is not None for r in all_rows),
               'populationMissing': [names[r['cityId']] for r in all_rows if r.get('population') is None],
               'r2FreezeSha256': original_freeze_hash,
               'r2Unchanged': True, 'validation': 'candidate schema, map, sources, evidence hashes, immutable r2 and population arithmetic passed',
               'files': {p.relative_to(ROOT).as_posix(): sha(p) for p in [BASE_CATALOG, CANDIDATE, *paths, *used_sources]}}
    write(EVIDENCE / 'r3-preparation-report.json', summary)
    if args.publish:
        assert sha(CATALOG) == expected_base, 'Active catalog changed; review before publishing'
        temporary_catalog = CATALOG.with_suffix('.json.tmp')
        temporary_catalog.write_bytes(CANDIDATE.read_bytes())
        os.replace(temporary_catalog, CATALOG)
        summary['frozenAt'] = datetime.now(timezone.utc).isoformat()
        summary['files']['public/data/catalog.json'] = sha(CATALOG)
        summary['rule'] = 'r3 is immutable; corrections require a later dataset revision. r2 files and original freeze remain unchanged.'
        write(FREEZE, summary)
        print('Published and frozen ' + json.dumps({k: v for k, v in summary.items() if k != 'files'}, ensure_ascii=False))
    else:
        print('Staged only; active catalog remains r2. ' + json.dumps({k: v for k, v in summary.items() if k != 'files'}, ensure_ascii=False))


if __name__ == '__main__':
    main()

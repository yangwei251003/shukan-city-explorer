"""Bounded official-source verification; keeps originals and never synthesizes observations."""
import csv, hashlib, json, re, time
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'source-data/v2'
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = [
 ('gd','https://stats.gd.gov.cn/fsjdgnsczz/content/post_4854894.html'),
 ('310000','https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html'),
 ('320500','https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml'),
 ('320100','https://tjj.nanjing.gov.cn/gzdt/202602/t20260203_5785885.html'),
 ('110000','https://www.beijing.gov.cn/zhengce/zhengcefagui/202603/t20260325_4565678.html'),
 ('120000','https://www.tj.gov.cn/sq/tjgb/202603/t20260327_7271193.html'),
 ('130100','https://tjj.sjz.gov.cn/columns/940d701f-5e56-4f5d-9ece-7968f6354993/202605/26/f062dca8-ce95-46f8-b1c9-33f507db5a29.html'),
]
def fetch_source(item):
 key,url=item
 path=OUT/f'{key}-2025.html'
 try:
  if not path.exists():
   r=requests.get(url,timeout=35);r.raise_for_status();path.write_bytes(r.content)
  raw=path.read_bytes()
  soup=BeautifulSoup(raw,'html.parser');text=soup.get_text(' ',strip=True)
  (OUT/f'{key}-2025.txt').write_text(text,encoding='utf-8')
  return {'id':key,'url':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'file':str(path.relative_to(ROOT)),'text':text}
 except Exception as e:
  if key=='gd':
   raw=(ROOT/'docs/V2审查与迭代方案/evidence/广东2025官方原表.html').read_bytes()
   assert hashlib.sha256(raw).hexdigest()=='293380712f2e2451d4e2f07ed36d35f107685c77f5b9c4a5a120cb84faa22575'
   path.write_bytes(raw)
   return {'id':key,'url':url,'fetchedAt':'2026-09-27','sha256':hashlib.sha256(raw).hexdigest(),'file':str(path.relative_to(ROOT)),'retrieval':'review-provided official HTML snapshot; live request unavailable','text':BeautifulSoup(raw,'html.parser').get_text(' ',strip=True)}
  return {'id':key,'url':url,'error':str(e)}

results=list(ThreadPoolExecutor(max_workers=3).map(fetch_source,SOURCES))
audit=[]
for item in results:
 text=item.pop('text',''); audit.append(item)
 print(item['id'],item.get('error','OK'),flush=True)
 for word in ['地区生产总值','不变价格','当年价格','现价','发布时间','初步核算']:
  at=text.find(word)
  if at>=0:print(word, text[max(0,at-40):at+260],flush=True)
(OUT/'official-fetch-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')

# Independently parse the original HTML table and compare every cell with the handoff CSV.
gd=next(x for x in audit if x['id']=='gd')
if 'error' not in gd:
 soup=BeautifulSoup((OUT/'gd-2025.html').read_bytes(),'html.parser')
 rows=[]
 for row in soup.select('table tr'):
  cells=[re.sub(r'\s+','',c.get_text()) for c in row.find_all(['td','th'])]
  if len(cells)==9 and cells[0].endswith('市'):rows.append(cells)
 handed=list(csv.DictReader((ROOT/'docs/V2审查与迭代方案/evidence/guangdong-2025-21cities.csv').open(encoding='utf-8-sig')))
 assert len(rows)==len(handed)==21
 by_name={list(r.values())[0]:list(r.values()) for r in handed}
 checks=[]
 for row in rows:
  expected=by_name[row[0]]
  assert [float(v) for v in row[1:]]==[float(v) for v in expected[1:]],row[0]
  assert abs(float(row[1])-sum(map(float,row[2:5])))<.011
  checks.append({'city':row[0],'allEightNumericCellsMatch':True,'values':list(map(float,row[1:]))})
 (OUT/'gd-2025-row-audit.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
 print('GD 21 rows / 168 numeric cells independently matched; GDP sum',sum(float(r[1]) for r in rows),flush=True)

"""Fetch explicitly reviewed official source URLs, retaining original response and provenance."""
import json,hashlib,re
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'source-data/v3';OUT.mkdir(exist_ok=True)
SOURCES=[
('330100','https://hznews.hangzhou.com.cn/chengshi/content/2026-04/30/content_9214808.htm'),
('330200','https://zjzd.stats.gov.cn/gjtjjnbdcd/dcfb/art/2026/art_3ba436263a0e464492a2f784fd0faca2.html'),
('320200','https://tj.wuxi.gov.cn/doc/2026/05/09/4772420.shtml'),
('320400','https://www.changzhou.gov.cn/gi_news/680177805515409'),
('510100','https://cdstats.chengdu.gov.cn/cdstjj/c154795/2026-04/14/content_58dc076a80974f999828b691bfca027f.shtml'),
('500000','https://www.cq.gov.cn/zwgk/zfxxgkzl/fdzdgknr/tjxx/tjgb/202603/t20260326_15568523.html'),
('420100','https://tjj.wuhan.gov.cn/tjfw/tjgb/202604/t20260408_2750693.shtml'),
('430100','https://tjj.hunan.gov.cn/hntj/tjfx/tjgb/szgb/zss_1/202605/t20260512_33975356.html'),
('360100','https://www.nc.gov.cn/ncszf/tjfx1/202601/05e40bffc5dd429aac122f372223620f.shtml'),
('410100','https://tjj.zhengzhou.gov.cn/tjgb/10017864.jhtml'),
('370100','https://jntj.jinan.gov.cn/col/col18254/art/2026/art_7dc3135bb2209f961b3c65baa8ab3d2d.html'),
('370200','https://epaper.qingdaonews.com/qdrb/html/2026-04/08/content_144596_3316066.htm'),
('310000','https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html'),
('320500','https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml'),
('110000','https://www.beijing.gov.cn/zhengce/zhengcefagui/202603/t20260325_4565678.html'),
('wh-history','https://tjj.wuhan.gov.cn/tjfw/tjnj/202503/P020250307544556797246.pdf')]
def fetch(item):
 key,url=item; ext='pdf' if url.endswith('.pdf') else 'html';path=OUT/f'{key}-2025.{ext}';rec={'id':key,'url':url,'fetchedAt':datetime.now(timezone.utc).isoformat()}
 try:
  if not path.exists():
   r=requests.get(url,timeout=25);r.raise_for_status();path.write_bytes(r.content)
  raw=path.read_bytes();rec.update(file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
  if ext=='html':
   text=BeautifulSoup(raw.decode('utf-8',errors='replace'),'html.parser').get_text(' ',strip=True)
   (OUT/f'{key}-2025.txt').write_text(text,encoding='utf-8')
   rec['hasAnnualGDP']='2025' in text and bool(re.search('生产总值|GDP',text))
   snippets=[]
   for word in ['初步核算','第一产业增加值','常住人口','最终核实','2024年地区生产总值','公布日期','发布时间']:
    m=re.search(word,text)
    if m:snippets.append(text[max(0,m.start()-30):m.start()+260])
   print(key,json.dumps(snippets,ensure_ascii=False),flush=True)
  else:print(key,'PDF downloaded',len(raw),flush=True)
 except Exception as e:rec['error']=str(e);print(key,'FAILED',str(e),flush=True)
 return rec
audit=list(ThreadPoolExecutor(max_workers=4).map(fetch,SOURCES))
(OUT/'official-fetch-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')

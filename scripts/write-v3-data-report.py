"""Render the V3 evidence index from the admitted, versioned publication."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text('utf-8-sig'))
catalog=read('public/data/catalog.json');audit=read('source-data/v3/v3-publication-audit.json')
rows=read('public/data/datasets/gd-annual-2025-r2.json')+read('public/data/datasets/selected-annual-2025-r2.json')
profiles={p['id']:p for p in catalog['profiles']};byid={r['cityId']:r for r in rows}
out=['# V3 数据准入与发布记录','',f"核验记录时间：{audit['verifiedAt']}。数据版：`{catalog['version']}`。",'',
'## 已实施与已验证','',
f"- 9 个区域入口覆盖 {len(profiles)} 个去重城市；珠三角九市与广东21市有重叠，全国榜去重并标注“仅含已接入城市”，不生成全国合计。",
'- 长三角扩至8城（第8城采用常州）；成渝双城、长江中游精选3城、关中精选1城、中原精选1城、山东半岛精选2城均已有数据与本地地图。',
'- 新增14城逐项核对官方统计发布的2025全年 GDP、三次产业、实际增速；保留原件或网页工具返回的原文快照、来源URL、发布日期及SHA-256。',
'- 新增14城的OSM行政关系、城市代表点落面及实时天气API请求均已实测通过，原始响应及48小时字段保存在 `source-data/v3/`。天气是外部API运行状态核验，不是本项目自建气象传感器测量。',
f"- {audit['populationCovered']}/41 城具备经核验的2025年末常住人口；其余显示“暂缺”，不补0。",
'- GDP/产业金额为现价亿元；增速直接抄录官方不变价实际增速，未使用两年现价GDP相除计算实际增速。初核、终核、未标终核分别保留。',
'- 发布schema校验已通过，14项自动化正负例通过；坏字段、舍入超差、人数为0、缺来源、错误代表点、错误城市数等均阻断manifest写入。',
'- 原 `cities.json`、三个r1/2024存档文件的SHA-256与生成前相同；新增r2文件，不以新值回填老版本。','',
'## 新增城市逐行准入','',
'表中产业依次为第一、第二、第三产业，单位亿元；GDP为全年现价金额，增速为官方实际增速。OSM边界仅用于城市区域探索，不替代有审图号的全国标准地图。','',
'|城市|GDP|三次产业|实际增速|数据来源/发布时间|空间核验|天气|',
'|---|---:|---|---:|---|---|---|']
for a in audit['newCities']:
 r=byid[a['cityId']];out.append(f"|{a['name']}|{r['gdp']:g}|{' / '.join(f'{x:g}' for x in r['industries'])}|{r['growth']:g}%|[{r['sourceName']}]({r['sourceUrl']}) · {r['publishedAt']}|OSM relation {a['osmRelationId']}；点在面内|请求成功，{a['weather']['hours']}小时字段|")
out+=['','## 人口、人均GDP与历史覆盖','',
'派生公式：人均GDP（元）= 全年GDP（亿元）÷ 年末常住人口（万人）×10000，四舍五入到元。前端必须标注“按年末常住人口计算”；这与官方采用年平均人口的人均GDP不是同一个指标。人口数据来源可与GDP来源不同，但年期必须都是2025。','',
'|城市|2025年末人口（万人）|人口来源|已核验历史年份|',
'|---|---:|---|---|']
for r in rows:
 p=profiles[r['cityId']];pop='暂缺' if r['population'] is None else f"{r['population']:g}"
 src='待核验' if r['population'] is None else f"[{r['populationSourceName']}]({r['populationSourceUrl']}) · {r['populationPublishedAt']}"
 out.append(f"|{p['name']}|{pop}|{src}|{'、'.join(str(h['year']) for h in r['history'])}|")
out+=['','历史时间窗口是2019–2025，广东21城已覆盖完整七年；其他城市只有表中年份存在实际记录，其余年份均为空缺，不插值、不用增长率倒推。年份不足两点的城市只能显示单点，不能宣传已有完整七年曲线。各年使用对应原发布口径；官方修订年份在每条 `revisionStatus` 单列，跨年金额不能推导官方实际增长率。广东2019表为亿元、2020–2023表为万元（除10000保留原精度），2020“4季度”表是全年累计，已与官方全年运行报告交叉核验。明确说明：各年当时公布版本，未统一经济普查回溯修订。','',
'石家庄公报GDP及常住人口均含辛集市，而本地OSM图为石家庄行政关系；原有统计范围与地图范围差异保留在人口说明，不通过移动点或修改边界掩盖。','',
'## 原始材料与取数限制','',
'1. 官网页面能够直接取得时，保存HTML/PDF/DOC原件；解析文本只作复核辅助，不替代原件。西安PDF第2页、南昌公报扫描第2页历史图另经目视复核。',
'2. 部分官网对本机返回403/412/521或TLS失败。能通过网页工具读到原文时，保存工具返回原始文本快照并记录该取数方式；不把失败HTML/挑战脚本当数值证据。',
'3. 杭州、宁波、青岛、成都及合肥部分来源为统计部门署名/政府发布原稿由官方媒体完整刊载；来源名和URL均写明真实刊载者。宁波GDP/人口为宁波发布公报在宁波广电刊载，成都人口为成都日报锦观新闻官方账号刊载，佛山/茂名人口为官方媒体刊载署名公报，惠州人口为“惠州统计”刊载的署名公报文本；不伪称它们是原统计局域名HTML。',
'4. 合肥人口本轮仅取得第三方资料，未准入；南昌本轮尚未找到2025人口段落，未将2024人口代用。广东其余缺人口城市为未完成来源核验，不能表述成官方未发布。',
'5. 个别统计公布数存在舍入差（如郑州三次产业合计比GDP少0.1亿元）；按原值保留，schema容差0.21亿元。',
'6. 港澳未完成币种/产业分类准入，未接入；南通不是当前8城成员，不以备选名单冒充已接入。','',
'证据索引：','',
'- `source-data/v3/v3-publication-audit.json`：逐城三关、来源和快照散列、人口证据、历史覆盖、旧文件散列。',
'- `source-data/v3/weather-admission.json`、`weather-*.json`：请求地址、取数时间、有效时间与真实API响应。',
'- `source-data/v3/osm-*.json`：Nominatim原始响应、关系多边形与代表点。',
'- `source-data/v3/backend-research/*.json`：补充人口/历史的出处与原件散列。',
'- `public/data/maps/*/manifest.json`：各区域WGS84边界、Natural Earth陆地掩膜、许可、散列与低分辨率例外。',
'- `public/data/v3-manifest.json`：所有版本化数据、区域地图文件和catalog的SHA-256；仅通过schema后写入。','',
'## 复现与尚待验证','',
'```text',
'python scripts/build-v3-data.py          # 冻结后仅核对散列，不重写r2',
'python scripts/build-v3-data.py --publish # 仅未冻结版本可生成并切换catalog',
'node scripts/pipeline/validate.mjs --check-only',
'node --test scripts/pipeline/validate.test.mjs',
'python scripts/write-v3-data-report.py',
'```','',
'发布步骤依赖本机Python的requests/BeautifulSoup/shapely/PyMuPDF（取数、PDF核验和地图构建脚本）及Node；运行产品不依赖Python，不引入数据库。重新请求天气或OSM使用单独采集脚本，默认发布仅使用已归档证据。最终r2通过 `source-data/v3/frozen-r2-publication.json` 冻结，后续来源更新应创建新版本，不能原地改r2。','',
'数据/schema检验不等于界面验收。桌面/移动端、离线流程与控制台结果见总验收记录；5人真实观众测试仍为“待验证”，本记录未声称执行该测试。','']
(ROOT/'docs/V3-数据准入.md').write_text('\n'.join(out),encoding='utf-8')
print(f'Wrote data admission report for {len(rows)} cities.')

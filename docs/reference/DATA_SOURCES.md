> 原比赛工程的历史参考记录；其中真实数据、影像、模型与影片未包含在本公开快照。现有文件路径可能指向未公开原件，当前开源范围与验证以根目录 README 为准。

# 数瞰 V 0.3.5 · 数据来源与口径

V3.5（2026-10-02）未改动统计 r3。东方明珠按 OSM 主轮廓及三根塔柱定位，完整替代主建筑与 56 个部件；其他三座上海核心地标保留原网格。新增程序化 PBR 立面、展示光照、水面反射和沿真实几何的示意动效。立面纹理不是实拍采样，车辆/船只不是实时位置，日景/暮色不是天文日照模拟。逐项出处与取舍见 [改进记录](docs/V3.5-改进记录.md)，当前结果及待验证项见 [V3.5 验收](docs/V3.5-交付与验收.md)。原始快照不改，派生兼容修复单独记录。

V3.4 历史（2026-10-02）实际读取用户提供的上海、广东、安徽、陕西 OSM GDB ZIP，按五处范围抽取建筑、水体、道路和用地，并结合在线 OSM 标签、Esri 影像与建筑方地标资料，补全地表及新增广州/深圳场景。压缩包只读，原始出处、字段、范围、散列、失败记录与建模边界见 [V3.4 资源说明](docs/V3.4-资源与建模说明.md)。实际运行模型清单见 [manifest](public/models/manifest.json)，该版验收见 [V3.4](docs/V3.4-交付与验收.md)。本轮没有更改冻结 r3 统计数据。

V3.3 历史记录（2026-10-02）新增独立历史人口参考与三处本地城市模型，统计数据仍为冻结 r3，40/41 城有同年人口。南昌 667.04 万经官方原文核实为 **2024 年末／2025 年初**，只作单列参考，不写入 2025 排名或人均 GDP。该版验证见 [V3.3 交付](docs/V3.3-交付与验收.md)。

V3.2 历史说明（2026-10-02）仅新增地图交互，没有新增统计值或改变全国几何。省面成员按 catalog 中已准入城市的行政区划代码归属，明示只含已接入城市；合计不冒充全省统计。南昌补查尚无合格原表，见 [补查记录](source-data/v3.2/research/nanchang-followup.json)。第三方项目仅用于交互研究，没有引入其源码或模型；参考快照见 [调研清单](source-data/v3.2/research/retrieval.json)。当前地图功能见 [交互能力记录](public/data/nation/interaction-v3.2.json)，旧冻结 manifest 保持原貌。

当前发布数据版为 **`zhuliu-v3.1-20260928-r3`**，默认统计期为 **2025 全年**，覆盖 **9 个范围、41 个去重城市、40 城年末常住人口**。运行入口是 [catalog.json](public/data/catalog.json)，发布散列见 [manifest](public/data/v3-manifest.json)，本轮人口原件、逐行核验与冻结记录见 [V3.1 数据补齐](docs/V3.1-数据补齐.md)。

V3.1 在 r2 基础上新增 6 城人口及其派生人均 GDP，没有改动已有 GDP、产业、实际增速、历史或区域边界。r1、r2 和 2024 存档均保留，不能把新版补证回写成旧版已经具备的数据。下方折叠区是 V1/V2 原文，旧版“当前”等措辞只对应归档时点；V3 状态见 [V3 历史准入记录](docs/V3-数据准入.md) 与 [V3 历史验收](docs/V3-交付与验收.md)。

## 覆盖与计算口径

范围为珠三角九市、广东 21 市、长三角精选 8 城、京津冀精选 3 城、成渝双城、长江中游精选 3 城、关中精选 1 城、中原精选 1 城、山东半岛精选 2 城。珠三角与广东重叠，全国榜按城市 ID 去重，标注“仅含已接入城市”，不生成全国合计。长三角第 8 城为常州；南通未接入。港澳未完成统计币种及分类准入，地图地理表达不等于经济数据准入。

| 类别 | 来源与单位 | 展示及限制 |
|---|---|---|
| GDP、三次产业 | 广东省统计局及各城市统计部门年度发布，人民币现价亿元 | 2025 全年，保留核算/修订状态；不混入半年数据，不为凑总额改写产业原值 |
| 经济增速 | 官方直接公布的实际增速，% | 不用现价 GDP 比值推算，不以城市增速平均冒充区域 GDP 增速 |
| 常住人口 | 经核验的 2025 年末常住人口，万人 | **40/41 城有值，仅南昌暂缺**；缺失为 null，不补 0 或上年值 |
| 派生人均 GDP | GDP（亿元）÷ 年末常住人口（万人）× 10000，四舍五入为元 | 标注“按年末常住人口计算”；不同于按年平均人口公布的官方指标 |
| 历史 GDP | 各年官方原发布金额，统一为亿元 | 2019–2025 窗口，缺年留空，不插值；未统一经济普查回溯修订 |
| 区域边界 | OSM 行政关系，本地 WGS84 GeoJSON | 经度在前、纬度在后；社区空间参考，不作为权威边界认证 |
| 全国矢量 | GeoJSON.CN 天地图 0.3.0，原 CRS 为 CGCS2000 | 近似 WGS84 兼容显示，非原生/测绘 WGS84；34 省级面、来源境界线与岛屿 |
| 天气 | Open-Meteo，城市代表点当前模式值及未来 24 小时预报 | 保留来源、请求/有效时间、失败/重试，不声称地面站或自建传感器实测 |
| 发展情景 | 本地按基年与用户假设逐城计算 | 固定基年价格近似路径，非官方预测；A/B 参数和溯源字段一并导出 |
| 场景视觉 | AI 辅助生成，本地 WebP | 标注“AI 场景示意”，不是摄影、地理或统计证据 |

GDP 广东主来源为 [2025 年全年各市地区生产总值](https://stats.gd.gov.cn/fsjdgnsczz/content/post_4854894.html)；2024 存档继续引用 [2024 年全年表](https://stats.gd.gov.cn/fsjdgnsczz/content/post_4666332.html)。其他城市的逐行金额、实际作者、刊载者、URL 与发布日期在 [V3 来源总表](docs/V3-数据准入.md)。官方统计、地图空间参考、天气模式、假设推演在来源弹窗中分开，并补充派生指标说明。

## V3.3 新增来源

- 南昌历史人口：市统计局署名、市人民政府官网直接原文，[2024 年南昌市常住人口增加 10.22 万人](https://www.nc.gov.cn/ncszf/sjfb/202502/4e66745eb31e4ca4bd6bbddc560c9567.shtml)，发布 2025-02-22，**2024 年末常住人口 667.04 万人**。原始 HTML、用户参考页、2025 公报全部 17 张原图与核验见 [本轮记录](source-data/v3.3-population/核验结论.md)，单列运行参考见 [JSON](public/data/population-reference-v3.3.json)。
- 西安大雁塔、合肥天鹅湖：Mars3D 官方公开倾斜摄影示例，[官方配置与示例](https://github.com/marsgis/mars3d-vue-example/blob/master/public/config/config.json)。只包含已归档有限层级与局部范围，采集日期未知。
- 上海陆家嘴：高德开放平台 [3D Tiles 官方示例](https://lbs.amap.com/demo/javascript-api-v2/example/selflayer/3dtileslayer)，真实地标人工模型，不是摄影；保留原始网格和材质，局部包围框根据实际节点重新计算，不声称精确地理配准。

模型清单与全部本地资源散列见 [manifest](public/models/manifest.json)。原始快照与运行兼容修复分开保存；修复 GLB/B3DM 容器和材质扩展不提高原始精度。模型显示光照为自研展示环境，不能作为现场照明证据；卡片预览来自本产品实际模型渲染。逐处覆盖与未接入城市见 [模型评估](docs/V3.3-模型来源与扩展评估.md)。

## r3 人口补证记录

| 城市 | 2025 年末人口（万人） | 实际证据载体与限制 |
|---|---:|---|
| 肇庆 | 411.74 | 统计局官网地址返回原始 DOCX，正文与表 1 同数；官网索引日期、正文署名月份与服务器修改日期分开记录 |
| 梅州 | 381.56 | 统计局公报官网 HTML 与完整真实渲染截图；原图片直取受限，不把截图说成原 PNG 下载 |
| 清远 | 397.64 | 清城区统计局月报第 13 页原图“2025年广东、清远及清城经济指标对比”；公报完整转载用于辅助核对“年末”口径 |
| 潮州 | 257.88 | 市政府统计公报原始扫描 PDF 第 2 页，逐字视觉复核；不误用户籍人口 272.24 |
| 揭阳 | 568.72 | 统计局公报 PDF 第 2 页，文字层与视觉复核一致；不误用户籍人口 709.90，记录实际可达 HTTP 来源 |
| 合肥 | 1000.5 | 统计局原页面的公开转载截图，正文及全市表格行同数；每日经济新闻正式报道交叉核验；未声称直接从统计局原站下载 |

逐项来源链接、发布时间、取数方式和完整快照在 [V3.1 补齐记录](docs/V3.1-数据补齐.md)。合肥原稿为 2026-06-15，实际转载与交叉报道为 2026-06-19，两者不混写。其年末人口为统计部门根据全国 1% 人口抽样调查发布的结果，不是项目自行估算。清远官方原表的该行未重复印“年末”，辅助口径证据与限制已保留在 `populationNote`。

**南昌暂缺。** 本轮未取得足以确认 2025 年末全市精确人口的公开证据，不能扩大为“官方从未发布”。667.04 万人是 2024 年值，656.82 万人是 2023 年值；665.21 万人是第三方倒推，均未接入。省级调查在 11 月 1 日的时点和全省总数也不等于南昌年末人口。人口及人均 GDP 保持 null，见 [合肥与南昌证据记录](docs/V3.1-人口合肥南昌证据.md)。集合任何成员人口缺失时，不补算该集合人口合计与人均 GDP。

## 历史、核算与范围差异

| 历史覆盖 | 城市 |
|---|---|
| 2019–2025 | 广东 21 城 |
| 2021–2025 | 西安、南昌 |
| 2024–2025 | 成都、重庆、青岛 |
| 仅 2025 | 其他已接入城市 |

广东 2019 年原表单位为亿元；2020–2023 年原表万元除以 10000，保留原精度。2020 年“4 季度”表是全年累计，已与全年运行报告交叉核验。历史不足两点只显示单点，集合历史只有成员当年均具备来源时才汇总。历史现价路径与固定基年价格情景含义不同，不称为模型回测。

石家庄公报 GDP 与人口包含辛集市，本地 OSM 图对应石家庄行政关系；统计与地图范围的差异保留在说明中，不挪点或改界掩盖。网页直连受限而取得公开转载、渲染快照或其他载体时，记录实际取得方式；不把错误页当来源，不将转载域名说成政府原站。

V3 已接入城市的年度经济数据、逐行复核、OSM 边界/代表点与天气接口准入记录继续有效；V3.1 人口补证不等于重新宣称完成全部城市的天气实测。天气接口可达验证也不等于自建传感器实测。

## 全国矢量与空间素材

全国运行来源是 [GeoJSON.CN 天地图 0.3.0 API](https://geojson.cn/api/tiandi/0.3.0/100000.json)，直接提供者为 GeoJSON.CN，上游天地图关系及 CGCS2000 说明见 [维护文档](https://geojson.cn/data/atlas/tiandi)。源文件声明 EPSG:4490，PROJ 对 EPSG:4326 提供近似同位变换，精度未知、坐标值未出现可见移动。因此准确表述是 **“源 CGCS2000，近似 WGS84 兼容显示”**，不声称原生 WGS84 或米级测绘精度。

首屏 [china.geojson](public/data/nation/v3.1/china.geojson) 为 **485,519 bytes**，含 34 个省级多面要素与 8 组源境界线；其中一组包含 10 段海上分段线，其余线不统称十段线。保留 557 个面组件、10 个内洞，500 个小组件逐坐标原样保留；台湾、海南与源中已有诸岛均保留，没有手画补线或按面积删岛。41 个真实城市代表点通过对应省级落点检查，光点来源是 catalog 坐标，不是区域框中心。

本地图满足本轮保留岛屿优先的 500KB 范围，未达到原 300KB 目标。简化前的 1.70MB 衍生文件不在首屏加载；11,371,479 bytes 的 GS(2023)2767号完整原始 JPG 仅保留参考入口，其审图号不移植到当前矢量。变换、简化误差、几何有效性、上游非严格无缝覆盖的限制、散列与使用条件见 [全国矢量记录](docs/V3.1-全国矢量地图.md)、[manifest](public/data/nation/v3.1/manifest.json) 和 [validation](public/data/nation/v3.1/validation.json)。旧原图来源留在 [V3 全国图记录](docs/V3-全国地图来源.md)。

区域图继续使用 OSM 与 Natural Earth 陆地显示参考，行政原面与显示衍生面分开，不按显示面积重分配统计金额。各地 OSM 关系、许可、代表点和 SHA-256 在 `public/data/maps/*/manifest.json`。保留 OSM ODbL 归因；Natural Earth 10m 是 1:1000 万比例尺，不是 10 米空间分辨率。

场景图见 [素材清单](public/scenes/manifest.json)，V3 新增 5 组原 PNG、提示词及打包记录在 `source-data/v3-scenes/`，桌面图 ≤250KB、手机图 ≤120KB。候选 DataV、geoBoundaries 及本轮未选矢量只在 `source-data/` 研究存档，不参与运行，不因保留原件就声明其可自由再分发。

## 版本、证据与发布门禁

| 路径 | 作用 |
|---|---|
| `public/data/catalog.json` | 当前 `zhuliu-v3.1-20260928-r3`，9 范围默认指向 r3，并保留旧版本 descriptor |
| `public/data/datasets/gd-annual-2025-r3.json`、`selected-annual-2025-r3.json` | 本轮人口补齐后的两份不可覆盖修订 |
| `public/data/v3-manifest.json` | 当前发布清单；文件名沿用，内容按 catalog 版本核对，包含全国图验证与散列 |
| `source-data/v3.1-population/frozen-r3-publication.json`、`r3-row-review.json` | r3 冻结散列、41 城逐行复核、40 条人均 GDP 计算检查 |
| `source-data/v3.1-population/catalog-r2-snapshot.json` | 原 r2 catalog 按字节保存；不是改写旧目录状态 |
| `source-data/v3/frozen-r2-publication.json` | 原 r2 冻结清单，所列旧文件逐一散列复核不变 |
| `source-data/v3.1-population/` | 本轮 DOCX、PDF、HTML、原图、真实渲染/转载截图与核验合同 |
| `source-data/v3/v3-publication-audit.json` 及同目录原件 | V3 经济、人口、历史、OSM 及天气准入历史证据 |
| `source-data/v3.1-nation/` | 全国矢量原始下载、候选、文档与处理核验；运行资产在 public 对应目录 |
| `source-data/v3-nation/` | 旧官方标准原图及其来源/使用说明历史 |

`npm run build` 前置发布校验：城市数量/唯一性、来源字段、统计期、现价金额/实际增速、人口空值语义与人均派生、历史来源、产业舍入差、代表点与区域几何，以及全国矢量完整性、CRS 说明、文件尺寸和 SHA-256。校验全部成功才更新 manifest；失败保留此前有效清单。产业舍入差上限 0.21 亿元，郑州 0.1 亿元差额保留官方原值。

```powershell
node scripts/pipeline/validate.mjs --check-only
python scripts/build-v3-1-data.py
python scripts/build-national-vector.py --check-only
```

r3 已发布并冻结，再运行人口脚本只校验散列与来源，不修改冻结数据；后续更正须另建修订。**不要重新运行旧 r2 发布脚本覆盖当前 catalog**，原 r2 状态已单独存档。生产运行不需要 Python。原始证据不由 Vite 公共目录流程发布。

数据与几何检查不等于浏览器、真实设备或现场网络验收。本轮实际测试结论见 [V3.1 交付与验收](docs/V3.1-交付与验收.md)，不把旧 V3 截图或既有测试结果替代本轮验证。

## V1/V2 来源历史归档

以下原文保留旧版本的取得方法、许可调查、坐标和精度限制；其版本状态不代表当前 V3.1。

<details>
<summary>展开 V1/V2 原始来源记录</summary>

# V2 数据入口

当前目录为 `public/data/catalog.json`，包含广东2025、珠三角2024存档和精选城市2025数据。来源审计见 `source-data/v2/`、各地区 `public/data/maps/*/manifest.json` 及 [V2交付说明](docs/V2-交付与验收.md)。以下为 V1 原始来源记录，继续保留。

# 数据来源与口径

本项目的城市经济数据使用 **2024 全年已公布数据**。地图边界是下载时的地图数据快照，边界版本与经济数据年份不是同一个概念。当前数据文件不包含实时 GDP、真实未来预测或城市级数字孪生传感器流。以下文件路径均相对于项目根；应用运行数据位于 `public/data/`，原始来源与学习回退位于不会被 Vite 自动复制的 `source-data/`。

## 已启用的统计数据

- 发布单位：广东省统计局。
- 页面：[2024年全年各市地区生产总值](https://stats.gd.gov.cn/fsjdgnsczz/content/post_4666332.html)，发布日期 2025-02-10。
- `public/data/cities.json` 中的 `gdp` 和 `industries` 单位均为 **亿元**，`industries` 顺序为第一、第二、第三产业；`growth` 是原表 GDP 增长百分数，例如 `5.8` 表示 `5.8%`。
- 从原表提取九市：广州、深圳、珠海、佛山、惠州、东莞、中山、江门、肇庆。原表全部 21 市另存 `public/data/gdp-2024-table.json`；抓取页面快照为 `source-data/gdp-2024.source.html`。
- 九市 GDP 总和为 **115365.15 亿元**。这一总和是本项目对九行公布值的简单相加，不是另行公布的区域核算值。不得将九市增长率的简单平均展示为珠三角 GDP 增速。
- 原表数值按两位小数公布，分产业加总和 GDP 的尾数可能相差 0.01 亿元；例如广州原表三次产业加总为 31032.51、公布 GDP 为 31032.50。本项目保留原表数值，未为使总数相等而修改。
- `tag`、`description`、配色为本项目的编辑性导览内容，不是统计局给出的城市评级或评价。
- 统计页面公开可读，事实数据保留来源归因；页面未展示用于本项目确认的开放数据许可，不将整页网页素材声明为本项目原创或自由许可素材。

## 已启用的地图边界

当前 `public/data/guangdong.geojson` 与 `public/data/prd.geojson` 使用 **OpenStreetMap 行政区关系的真实多边形**；前者包含广东 21 市，后者只筛选九市。`source-data/osm-boundary-queries.json` 保存每个城市的 OSM relation ID、精确查询 URL、抓取时间、缓存文件、SHA-256 与几何检查结果。

- 来源：[OpenStreetMap](https://www.openstreetmap.org/)；通过 Nominatim 获取已知城市名称的行政区多边形，保存后本地使用。
- 坐标系统：**WGS84，经度在前、纬度在后**。[OSM 坐标说明](https://wiki.openstreetmap.org/wiki/Converting_to_WGS84)。未使用 GCJ-02 反算或坐标偏移拟合。
- `properties.id` 和 Feature `id` 为六位行政代码字符串；`properties.name` 为短名，`fullName` 为全名。
- `properties.centroid` 是从当前 OSM 边界计算的平面几何质心。部分沿海市界包括海域，质心可能在海上，因此 `public/data/cities.json` 的 `coordinate` 使用 Nominatim 原始 `lon/lat` 城市代表点，与 `properties.center` 一致，供城市标签和天气查询定位；它不是本项目实测的市政府坐标。`labelPoint` 是落在几何内部的代表点。
- 原始外环、内环和岛屿均保留。部分市界可能包含行政海域，OSM 的边界表达与仅显示陆域的示意地图会不同。本项目未将海岸线或缺失几何手工补画成市界。
- 城市代表点已再与原始 Nominatim 缓存、各自行政多边形和各自陆地显示交集逐项复核，九市均通过，记录见 `source-data/city-coordinate-audit.json`。广州、佛山、中山的纬度依次为 `23.1288429`、`23.0239788`、`22.5197073`；中山实际在佛山南偏东，代表点间约62.41公里。若画面呈现相反顺序，应检查相机、投影和标签布局，不应倒置已核实坐标。
- OSM 为社区维护数据，不将它称为测绘主管部门的权威边界认证。下载时间不等于其全部边界要素的测绘年份。正式外部发布前仍须按发布场景核查数据覆盖、地图表达和质量。
- 许可：**Open Database License 1.0（ODbL）**，需署名并遵守衍生数据库的相同方式共享条件；这不表示应用程序本身必须更改为 ODbL。地图中保留：`© OpenStreetMap contributors · ODbL`，并链接 [版权页](https://www.openstreetmap.org/copyright)；分发几何数据时直接链接 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。

### 数据获取方式及限制

本次只对已知的 21 个城市做一次性小批查询，单机、单线程、带应用标识 User-Agent、请求之间至少间隔 1.2 秒，结果本地缓存。公共 Nominatim 的最大访问速率为每秒 1 次，禁止批量发现完整地名列表、自动补全和抓取详情页等用途；本项目不将公共服务做成通用地理搜索接口，不在应用运行时或定时任务中持续调用。参见 [Nominatim 使用政策](https://operations.osmfoundation.org/policies/nominatim/)。

`source-data/update_osm_boundaries.py` 为手动、缓存优先的更新工具；需要系统已有的 Python 与 Shapely。它校验结果名称、行政多边形类型与几何有效性，全部 21 市通过后才替换应用读取的文件。再次运行默认使用 `source-data/` 中的缓存，不会重复请求同一批数据；不要将它接入定时任务。更新工具不会把原始响应、HTML 或学习回退复制回 `public/`。

## 未启用的候选与本地学习回退

### DataV / 高德

最初下载了 [DataV 广东 21 市 areas_v3 GeoJSON](https://geo.datav.aliyun.com/areas_v3/bound/440000_full.json)，原件为 `source-data/guangdong.source.geojson`；`source-data/` 中带 `datav-learning` 的文件是最初规范化结果。它们现在只作本地学习过程留档，不是当前应用的数据源。

- [阿里云 GeoAtlas 官方说明](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/datav-geoatlas-widgets/)明确：数据来自高德开放平台，仅供学习和交流使用。未确认正式参赛提交、公开再分发或商业使用的授权，不将其标注为开源地理数据。
- [阿里云坐标说明](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-data-format-1)称地图组件主要使用 GCJ-02，但这份具体 JSON 没有 CRS 声明。记录为“文件 CRS 未声明、可能 GCJ-02”，没有据此盲目转换，也不与 OSM 瓦片声称精确对齐。
- **这些原件和学习回退已经移出 `public/`，位于 `source-data/`，不会由 Vite 的公共目录复制流程打包。若以后手动发布整个仓库或提交完整源码包，仍应排除学习专用文件，或先取得相应再分发许可。**

### geoBoundaries

核查了 [gbOpen CHN ADM2 API](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM2/)，元数据存为 `source-data/geoboundaries-chn-adm2.metadata.json`。该数据实际标注为 **2017 年 County Level，2391 单元**，不是所需的广东 21 个地级市边界；因此没有用于当前图层，也没有把 ADM2 名称直接解释为中国地级市。

## 验证范围

数据验证覆盖：21 市与九市数量、唯一 ID、九市匹配、原始统计表提取值、几何非空和有效性、经纬度有限值、与 OSM 原始多边形一致、文件哈希。结果为 `public/data/data-validation.json`；项目相对证据路径和当前哈希保存在 `public/data/manifest.json`。归档移动的逐文件源/目标与原哈希保存于 `source-data/archive-move-manifest.json`，33 份材料的移动前后哈希相同，没有删除来源材料。地图在浏览器的视觉检查由应用验证流程另外完成；这里不将文件验证等同于完整应用验收。

## 默认取景范围

九市完整 OSM 行政边界的范围为 `[111.3568124, 21.0322802, 115.4215540, 24.3922150]`，会同时纳入沿海行政海域和肇庆北部。九个城市代表点的范围为 `[112.4603629, 22.2737340, 114.4127007, 23.1288429]`。因此默认展示城市群时建议按代表点拟合、添加适当留白；完整边界适合作为单独的全域视角，避免海面占据默认画面的大部分区域。该建议只影响相机取景，不裁剪或篡改原始市界。

## 陆地显示掩膜与指标填色

为避免行政海域填色遮盖珠江口的海陆关系，新增两份**仅用于渲染**的派生数据：

- `public/data/land.geojson`：Natural Earth 陆地掩膜，裁剪范围 `[111.1, 20.8, 115.7, 24.65]`，包含源数据在此范围内的 52 个陆地/岛屿面。
- `public/data/prd-land.geojson`：九市原始 OSM 行政多边形与该掩膜的交集，保留九市 Feature `id`、`properties.id` 和其他业务属性。指标填色与抬升使用这份陆地区域，原始 `public/data/prd.geojson` 完全不变，可继续用于细虚线行政边界。
- 原始陆地数据来自 [Natural Earth 10m Land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/)，下载自作者维护的 [natural-earth-vector 项目](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_land.geojson)，保存在 `source-data/natural-earth-ne_10m_land.source.geojson`。源文件明确声明 `OGC:CRS84`，即 WGS84 的经度/纬度顺序。
- Natural Earth 官方将矢量和栅格数据置于 **Public Domain**，允许修改和使用；项目保留 `Made with Natural Earth` 归因便于追溯。[官方使用条款](https://www.naturalearthdata.com/about/terms-of-use/)。与 OSM 市界求交的 `prd-land.geojson` 仍须保留 OSM 的 ODbL 归因与相应数据许可条件。
- **10m 指 1:10,000,000（1:1000万）比例尺，不是10米空间分辨率。**这是区域示意海岸线，不能作为测绘、地籍、淹没分析或精细河网数据；珠江口主轮廓之外的窄河道、堤岸、填海地块及很小的岛屿，原数据可能省略或概化。本次没有补画缺失河道或岛屿。
- 显示几何采用 `0.00025°` 保拓扑简化容差（南北方向约28米）；保留来源中可见岛屿，不按面积删除小岛。简化后再次与原市界和共用陆地掩膜求交，避免指标进入相邻市或海域。
- GDP、增长率与产业值仍代表**整座行政城市**；在陆地上填色只是视觉编码，没有重新估算“陆地 GDP”或按面积摊分统计值。
- 构建脚本为 `source-data/build_land_mask.py`，只读本地来源并生成派生几何；参数、原始文件哈希、每市顶点数和验证结果保存在 `source-data/land-mask.metadata.json`。所有输出几何有效，九市 ID 一致，原始 `prd.geojson` 哈希未变。

</details>

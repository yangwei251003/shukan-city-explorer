> 原比赛工程的历史参考记录；其中真实数据、影像、模型与影片未包含在本公开快照。现有文件路径可能指向未公开原件，当前开源范围与验证以根目录 README 为准。

# 数瞰 V 0.3.5 · 第三方软件、字体、数据与 AI 素材

本记录对应当前 V3.5 产品；既有数据与素材说明继续保留。依赖版本以 `package-lock.json` 为准；下列为主要直接依赖的许可标识，完整条款以随包 LICENSE 为准。软件许可、外部服务条件、地图与统计资料的使用条件分别记录，不将引擎开源解释为所有数据可自由再分发。

## V3.5 材质、环境与校验工具

- 水面采用 [Three.js r186 Water](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/Water.js)，MIT；本地源码 `src/lib/vendor/CityWater.js` 仅新增释放与调整反射目标大小的方法，许可存于 `src/lib/vendor/THREE-LICENSE.txt`。波纹法线来自同版本 [示例纹理](https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/waternormals.jpg)，原 URL、字节与散列在 `source-data/v3.5-render/references/water-source.json`，文件在 `src/assets/waternormals.jpg`，随网页本地打包。
- 使用锁定 Three.js 附带 MikkTSpace 离线生成幕墙切线，没有增设在线建模服务。窗格、材质贴图、东方明珠复原、环境动画及质检整合由 AI 辅助实现。参考照片只作外观比较，来源记录在 `source-data/v3.5-render/references/sources.json`，不将其称为测绘或逐栋实拍材质。
- 新增开发依赖：Khronos `gltf-validator` **2.0.0-dev.3.10**（Apache-2.0）、`playwright-core` **1.63.0**（Apache-2.0）。前者实际用于 CPU 资产验证，后者仅为可移植浏览器验收入口；没有因此新增浏览器运行依赖，也没有在本轮下载浏览器或上传项目。解码检查直接使用本项目已归档 Draco/Basis 文件。
- V3.4 对上海四座来源网格的描述是历史：V3.5 东方明珠已按塔柱轮廓重建，三座金融地标继续复用已有网格。普通街区立面仍为概化材质，来源日期/高度缺口没有因视觉加工而消失。见 [当前验收边界](docs/V3.5-交付与验收.md)。

## V3.4 连续地表、地理轮廓与地标（历史基础）

地理要素 © OpenStreetMap contributors，ODbL；本轮读取用户提供的分省 GDB 局部范围并补取在线标签。影像 © Esri 及其服务所列数据提供方，来自 World Imagery 公开缓存，保留来源归因，不把下载日期当拍摄时间。原始文件与散列在 `source-data/v3.4-context/`；网页显示署名及拍摄时间未知。当前范围仅在本机运行，未公开上传。

数据处理复用 pyogrio/GDAL OpenFileGDB、Shapely、NumPy、Pillow 和 trimesh；这些是离线构建工具，不是新增浏览器运行框架。地标以建筑方资料、真实轮廓和参考照片进行程序化形态复原；上海复用高德原地标网格。连续地表、地标建模、整合、交互和检查代码由 AI 辅助开发，并经过运行核对。没有把程序生成的幕墙、背景高度或水位展示层冒充实拍资料。具体 GitHub 路径、建筑参考与派生关系见 [资源与建模说明](docs/V3.4-资源与建模说明.md)。

| 组件 | 锁定版本 | 许可 |
|---|---:|---|
| React / React DOM | 19.3.0 | MIT |
| MapLibre GL JS | 6.11.2 | BSD-3-Clause |
| Vite | 6.4.3 | MIT |
| TypeScript | 5.8.3 | Apache-2.0 |
| Lucide React | 0.468.0 | ISC |
| Express | 5.2.1 | MIT |
| dotenv | 16.6.1 | BSD-2-Clause |
| concurrently | 9.2.4 | MIT |
| Three.js | 0.186.1 | MIT |
| 3D Tiles Renderer | 0.5.3 | Apache-2.0 |

构建工具、类型声明和传递依赖还见锁文件；表格不是全量软件物料清单。V3.1 未迁移框架或升级上述依赖大版本。全国图采用应用内 SVG 渲染，未新增重型前端地图依赖。离线地图处理脚本使用 Shapely（BSD-3-Clause）与 pyproj（MIT，底层 PROJ 许可见其发行包），它们不是浏览器运行依赖。项目自身源码的使用授权不能从依赖许可反推。

## V3.3 原始模型与本地解码器（历史基础）

Three.js 与 3D Tiles Renderer 只在实景场景按需加载；新增依赖没有升级既有框架。Draco 与 Basis/KTX2 解码文件取自锁定 Three.js 包，来源仍为对应开源工程，不能把解码软件许可套用到城市模型。

模型来自 Mars3D 官方西安/合肥公开摄影示例及高德官方上海地标示例。上海明确为人工建模、局部模型坐标视图；三者均未知采集时间。提供方代码开源、示例可访问，不等于独立原始模型许可；已保留来源、署名、载体、条款调查与散列，本轮仅本机体验，未公开上传。没有绕过账号、认证或付费接口。

原始资源在 `source-data/v3.3-models/`，派生 GLB/B3DM 与本地解码器在 `public/models/`；原始摄影纹理没有被 AI 提高清晰度或替换。兼容修复不创造新的测绘精度。卡片预览为真实网页渲染截图，展示光照为自研程序生成，明确不是现场摄影或照明记录。见 [模型清单](public/models/manifest.json) 与 [逐处评估](docs/V3.3-模型来源与扩展评估.md)。

## 字体

本地 Noto Sans SC 界面字体子集来自 Google Fonts，采用 SIL Open Font License 1.1；许可文本在 [OFL.txt](public/fonts/OFL.txt)，来源在 [SOURCE.txt](public/fonts/SOURCE.txt)。未改造字体设计，仅按界面字符取子集。

## 地图与空间数据

**当前全国交互矢量**：直接下载自 [GeoJSON.CN 天地图 0.3.0 全国接口](https://geojson.cn/api/tiandi/0.3.0/100000.json)，上游天地图关系和坐标说明来自 [维护者文档](https://geojson.cn/data/atlas/tiandi)。该维护页提供免费的全国及省级数据接口；本项目保留 GeoJSON.CN 与天地图来源归因，不把免费接口声明成独立 CC/MIT 开放数据许可。原始下载、文档与散列已存档，实际取得方式是公开 HTTPS GET，没有认证绕过。

源文件为 **CGCS2000（EPSG:4490）**，PROJ 对 WGS84 提供近似同位变换，精度未知。因此只称“源 CGCS2000，近似 WGS84 兼容显示”，不是原生测绘 WGS84。运行文件 485,519 bytes，含 34 省级面与源境界线，保留岛屿及内洞；处理保持来源几何，不手画国界或分段线。简化误差、上游非严格无缝覆盖的限制、字段与文件散列见 [V3.1 全国矢量记录](docs/V3.1-全国矢量地图.md) 和 [运行清单](public/data/nation/v3.1/manifest.json)。此交互矢量不沿用任何旧标准原图或其他来源页的审图号。

**标准地图参考原图**：自然资源部标准地图服务系统 GS(2023)2767号完整原始 JPG，含南海诸岛附图。保留完整图件与审图号，未裁切、改色、描摹或重制；当前仅由独立参考入口按需打开，不随首屏加载。普通 JPG 无地理配准，不声称 WGS84 或 GeoJSON。原图 11,371,479 bytes，审图号属于该原图，不是当前交互矢量或整个产品的审批证明。官方免费直接使用说明不等同于开源矢量许可。来源条目、使用说明快照、获得方式与 SHA-256 见 [V3 原图历史记录](docs/V3-全国地图来源.md)。

**区域行政边界**：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，采用 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。通过 Nominatim 获得并缓存行政关系多边形及代表点，使用 WGS84 经度/纬度顺序。许可、关系 ID、取得时间、几何核验与哈希见 `public/data/maps/*/manifest.json` 及原始审计。应用保留可见署名，数据分发遵守 ODbL 条件；社区边界不是测绘主管部门的边界认证。

**海岸参考**：[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 陆地数据为 Public Domain。10m 表示 1:1000 万比例尺，**不是 10 米空间精度**。仅作区域陆地显示参考；与 OSM 求交后的衍生区域继续保留 ODbL 归因及数据条件，不用于测绘、地籍或淹没分析。

**在线街道**：[OpenFreeMap](https://openfreemap.org/) 为可选在线底图，道路、建筑与网络可用性取决于上游。服务条件与 MapLibre 软件许可分开，保留 OSM 等上游归因。未标建筑高度时的统一示意高度不是逐栋实测。

**研究候选**：旧 DataV/高德学习候选、geoBoundaries，以及本轮未采用的 GeoJSON.CN 其他版本、GMT 和社区对照资料，仅存于 `source-data/`，不在当前运行图中。候选存档不等于对其全部坐标、精度或再分发条件的认可；原料不同，不能套用当前天地图版本的来源说明。

## 统计数据与真实载体

统计引用广东省统计局及各城市统计部门发布的 2025 全年经济数据、经核验人口及历史年份。逐项记录作者、实际刊载者、URL、发布日期和取得方式。公开的事实数据不因此成为本项目原创，也不将公开网页访问等同于整页素材的自由再分发许可。

当前 r3 覆盖 41 城，40 城有 2025 年末人口，仅南昌缺失。新增人口的实际原件包括政府 DOCX、扫描或文本 PDF、HTML、政府原图和真实页面截图。合肥来源是统计局原页面的**公开转载截图**，另由每日经济新闻交叉核验；新浪转载载体来自功夫财经，不把该载体说成政府机构，也不声称统计局原站直连成功。清远数值来自政府统计月报原表，公报转载仅辅助核对年末口径。梅州采用原官网完整渲染截图，不冒称为直接下载原 PNG。

详细证据见 [V3.1 人口补齐](docs/V3.1-数据补齐.md)、[合肥与南昌证据](docs/V3.1-人口合肥南昌证据.md)、[原有准入总表](docs/V3-数据准入.md) 和 [数据口径](DATA_SOURCES.md)。r1、r2 与 2024 存档继续保留，r3 不覆盖旧原件。

## 产品介绍影片

`public/media/shukan-tour.mp4` 使用本项目实际页面作为画面素材，并沿用本文件中的地图、统计与天气来源。影片画面是采集时的产品状态，不代表实时城市监测。

音乐：**Horizons — Scott Buckley**，依据 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用；[原曲与作者](https://www.scottbuckley.com.au/library/horizons/)、[使用说明](https://www.scottbuckley.com.au/library/using-this-music/)。音乐经过截取、淡入淡出及旁白混音；网站播放器、文稿与制作许可记录保留署名。无配乐版用于替换音乐，画面与旁白保持一致。外部平台发布时应把上述署名一并放入作品描述。

视频制作依赖和素材取得记录见 `video/LICENSES.md`；本地制作依赖不会随网站发布。第三方教程与案例仅用于方法研究，不复用其成片、商标或未授权音轨。

## 天气

天气来自 [Open-Meteo](https://open-meteo.com/en/docs)。保留提供方归因、请求和有效时间，服务额度及用途依提供方条款。本项目不自建气象传感器，当前值和预报均为城市代表点模式输出；缺失和请求失败明确展示，不用示意数值填补。

## AI 辅助开发与场景视觉

开发使用 AI 辅助资料检索、方案、代码、测试与文案，数据事实由所列来源支持。AI 不是统计或地理边界来源；本地规则助手与可选模型回答分开标注。

场景图由 OpenAI 图像生成工具辅助制作，共 8 个主题的桌面/手机素材；V3 新增成渝、长江中游、关中、中原、山东半岛 5 组。统一标注 **“AI 场景示意”**，只作单城视角视觉意象，不声称实景摄影、精确地标复原、测绘或统计证据。运行素材见 [场景清单](public/scenes/manifest.json)，新增原 PNG 和提示词在 `source-data/v3-scenes/`，桌面图 ≤250KB、手机图 ≤120KB。未移除第三方水印或把生成图声明为人工摄影。

[V3 原创性与依赖声明](docs/竞赛材料/04-原创性与依赖声明.md) 及其他竞赛材料按原交付状态保留，不能替代 V3.1 来源或验收。本轮产品状态见 [V3.1 产品说明](docs/V3.1-产品说明.md)，实际验证见 [V3.1 交付与验收](docs/V3.1-交付与验收.md)。本项目没有自动公开部署或上传。

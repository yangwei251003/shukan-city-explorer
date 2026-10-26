# 素材与许可范围

| 内容 | 本快照处理 | 许可 / 来源 |
| --- | --- | --- |
| 自有及有权授权的应用代码、整理文档 | 保留 | 根 MIT；不覆盖第三方代码和其他权利人内容 |
| `demo/data.mjs` 三城指标与布局 | 新生成 | MIT；合成样例，不是统计观测或地图 |
| `demo/CityBlocks.tsx` 生成建筑 | 新生成 | MIT；不依赖第三方模型或实景纹理 |
| `docs/images/shukan-demo-*` | 本次真实运行截图 | 展示的是合成样例，不是比赛实景 |
| `src/lib/vendor/CityWater.js` | 保留派生源码 | Three.js MIT，完整声明 `THREE-LICENSE.txt` |
| `src/assets/waternormals.jpg` | 保留原代码依赖的纹理 | 来自 [Three.js r186 示例](https://github.com/mrdoob/three.js/blob/r186/examples/textures/waternormals.jpg)，保留 [上游 MIT](https://github.com/mrdoob/three.js/blob/r186/LICENSE)；未被新演示加载 |
| `public/fonts/` Noto Sans SC | 保留 | SIL OFL 1.1，完整 OFL 与 SOURCE 文件随附 |
| `public/scenes/*.webp` | 保留 | 原项目 OpenAI 图像生成的场景意象，来源见 manifest；不是真实摄影，不用于合成演示的事实证据 |
| 生产 npm 依赖 | 重装并归档版权声明 | `public/assets/licenses/THIRD_PARTY_NOTICES.md`；依赖各自许可 |

没有将摄影/地图引擎的开源许可套用到第三方影像、城市模型或统计原始文档。原 README 的 2026-10-07 授权记录限“本作品及参赛材料”，本次不能据此推定素材能作为独立开源资产再分发。

因此未捆绑：Mars3D 摄影模型、高德地标网格、Esri 影像、全国及省市地图原件、OSM 分省原始档、政府 PDF/DOCX/截图证据、比赛影片/音轨、原 AI 生成缓存、打包产物与个人材料。保留的原技术文本记录可能引用这些本地原件，仅用于理解原架构。

完整上游字体和软件声明须随相应文件保留，根 MIT 不授予第三方商标、影像或数据权利。用户本地私有配置不包含在公开仓库。

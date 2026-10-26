from pathlib import Path
p=Path(__file__).resolve().parents[1]/'src/App.tsx';s=p.read_text('utf-8')
def rep(a,b):
 global s
 if a not in s:raise Exception('Missing patch: '+a[:110])
 s=s.replace(a,b)
rep("import type { City, Metric, Scene, Weather } from './types';","import type { City, Metric, Scene, Weather, AnswerContext } from './types';\nimport { useDataset } from './lib/useDataset';\nimport { matchesCity } from './lib/cities.mjs';\nimport Onboarding from './components/Onboarding';\nimport RegionScene from './components/RegionScene';")
rep("mode?: string; sources?", "mode?: string; context?: AnswerContext; sources?")
rep("const metricNames = { gdp: '经济规模', growth: '经济增速', industry: '第二产业' };", "const metricNames = { gdp: 'GDP规模', growth: '实际增速', industry: '第二产业占比' };")
rep("  const [cities, setCities] = useState<City[]>([]);\n  const [loadError, setLoadError] = useState('');", "  const {catalog,region,dataset,cities,loading,error:loadError,changeRegion,changeDataset}=useDataset();\n  const baseYear=dataset?.year ?? 2025;\n  const [guideOpen,setGuideOpen]=useState(false);\n  const [mapHealth,setMapHealth]=useState('loading');")
start=s.index("    fetch('/data/cities.json'");end=s.index("    fetch('/api/status'",start);s=s[:start]+s[end:]
rep("value >= 2030 ? 2025 : value + 1", "value >= 2030 ? baseYear+1 : value + 1")
rep("  }, [playing]);", "  }, [playing,baseYear]);")
rep("scenarioSeries[year - 2024]", "scenarioSeries[year - baseYear]")
rep("currentCity?.name || '珠三角'", "currentCity?.name || region?.name || '所选区域'")
rep("  function selectCity(id: string)", "  const sourceList=[...new Map(cities.map(c=>[c.sourceUrl,c])).values()];\n  const metricValues=cities.map(c=>metric==='gdp'?c.gdp:metric==='growth'?c.growth:c.industries[1]/c.gdp*100);\n  function switchRegion(id:string){setTour(false);setPlaying(false);setSelected('all');setQuery('');setCompareIds(ids=>ids.filter(c=>catalog?.regions.find(r=>r.id===id)?.memberCityIds.includes(c)));changeRegion(id);setToast('已切换地区，对比仅保留范围内城市。');}\n  function selectCity(id: string)")
start=s.index('  function exportData()');end=s.index('  async function ask',start)
s=s[:start]+'''  function exportData() {
    const at=new Date().toISOString();
    const rows=[['regionId','城市','统计期','GDP（亿元）','实际增速（%）','第一产业（亿元）','第二产业（亿元）','第三产业（亿元）','币种','价格口径','来源','发布日期','版本','导出时间'],...activeCities.map(c=>[region!.id,c.name,c.statPeriod,c.gdp,c.growth,...c.industries,c.currency,c.priceBasis,c.sourceUrl,c.publishedAt,c.datasetVersion,at])];
    downloadFile(`珠流-${selectedName}-${baseYear}统计数据.csv`,'\\uFEFF'+rows.map(r=>r.join(',')).join('\\r\\n'),'text/csv;charset=utf-8');setToast('已导出统计数据、版本与来源。');
  }
  function exportScenario() {
    const at=new Date().toISOString();
    const rows=[['regionId','城市','统计期','基年','目标年','基期GDP（亿元）','增长调整（百分点）','假设年均增长率（%）','情景值（亿元）','币种','价格口径','来源','发布日期','版本','导出时间','说明'],...activeCities.map(c=>[region!.id,c.name,c.statPeriod,baseYear,year,c.gdp,growthDelta,(c.growth+growthDelta).toFixed(1),projectValue(c.gdp,c.growth+growthDelta,year,baseYear).toFixed(2),c.currency,`固定${baseYear}年价格近似`,c.sourceUrl,c.publishedAt,c.datasetVersion,at,'基期GDP×(1+假设年均增速)^年数；假设推演不是官方预测'])];
    downloadFile(`珠流-${selectedName}-${baseYear}至${year}情景推演.csv`,'\\uFEFF'+rows.map(r=>r.join(',')).join('\\r\\n'),'text/csv;charset=utf-8');setToast('已导出基年、假设参数、来源与版本。');
  }
''' + s[end:]
rep("{ cityId: /珠三角|九市|各市/.test(q) ? 'all' : selected, question: q, ...((scene === 'scenario' || /情景|推演|假设/.test(q)) ? { scenario: { growthDelta, year } } : {}) }", "{ regionId:region!.id,datasetId:dataset!.id,cityId:selected, question:q,...(/情景|推演|假设/.test(q)?{scenario:{growthDelta,year}}:{}) }")
rep("mode: answer.mode, sources: answer.sources", "mode: answer.mode, context:answer.context,sources: answer.sources")
rep("  if (!cities.length)", "  if (!cities.length || loading || !catalog || !region || !dataset)")
rep("正在展开珠三角城市图景", "正在加载地区与年度数据")
rep("V 0.1", "V 0.2")
rep("<i>PRD</i>", "<i>V2</i>")
rep('<div className="header-tools">', '<div className="header-tools"><button id="guide-entry" className="outline-button" onClick={()=>{setTour(false);setPlaying(false);setGuideOpen(true);}}>使用指南</button>')
rep('<section className="intro-row">', '<section className="intro-row regional-hero"><RegionScene region={region}/>')
rep('PEARL RIVER DELTA · 广东珠三角', '{region.coverageLabel} · CITY PERSPECTIVES')
rep("'九座城市，一湾共生。'", "(region.id==='prd'?'九座城市，一湾共生。':region.id==='guangdong'?'山海之间，看见广东。':region.id==='yangtze'?'沿江而行，看见城市差异。':'从城市轴线，读懂发展脉络。')")
rep('2024 年统计基线','{baseYear} 年统计基线')
rep('<section className="metric-strip"', '<div className="dataset-controls" id="dataset-controls"><label>地区<select aria-label="选择地区" value={region.id} onChange={e=>switchRegion(e.target.value)}>{catalog.regions.map(r=><option value={r.id} key={r.id}>{r.coverageLabel}</option>)}</select></label><label>统计期<select aria-label="选择统计年份" value={dataset.id} onChange={e=>{setPlaying(false);setYear(2030);changeDataset(e.target.value);}}>{catalog.datasets.filter(d=>region.datasetIds.includes(d.id)).map(d=><option value={d.id} key={d.id}>{d.label}</option>)}</select></label><p>{region.coverageLabel} · 仅在此范围内计算合计和份额</p></div><section className="metric-strip"')
rep('2024 年 · 现价统计', '{baseYear} 年 · 现价 · CNY')
rep("currentCity ? '01' : '09'", "currentCity ? '01' : String(cities.length).padStart(2,'0')")
rep("'珠江两岸 · 九市协同'", "region.coverageLabel")
rep("'2024 年实际 GDP 增速'", "`${baseYear} 年实际 GDP 增速`")
rep("'根据九市产业增加值计算'", "'本范围产业增加值 / GDP'")
rep('广东省统计局 · 统一年度口径', '{sourceList.length===1?sourceList[0].sourceName:`${sourceList.length}个官方来源 · 同一年度`}')
rep('<small>09 CITIES</small>','<small>{cities.length} CITIES</small>')
rep('<span>珠三角总览</span>','<span>{region.name}总览</span>')
rep("(c.name + c.en).toLowerCase().includes(query.toLowerCase())", "matchesCity(c,query)")
rep('<div className="empty-state">未找到这座城市</div>', '<div className="empty-state">{region.coverageLabel}中未找到该城市。<button onClick={()=>setQuery(\'\')}>清空搜索</button>{catalog.profiles.filter(c=>matchesCity(c,query)&&!region.memberCityIds.includes(c.id)).map(c=><button key={c.id} onClick={()=>{const target=catalog.regions.find(r=>r.memberCityIds.includes(c.id));if(target)switchRegion(target.id);}}>{c.name}位于另一地区，切换查看</button>)}</div>')
rep('按 2024 年 GDP 排序','按 {baseYear} 年 GDP 排序')
rep('<BarChart3 size={15}/>城市对比<span>{compareIds.length}</span>', '<BarChart3 size={15}/>城市对比<span>{compareIds.length}/3</span>')
rep('aria-label="珠三角交互地图"','aria-label={`${region.coverageLabel}交互地图`}')
rep('<CityMap cities={cities}', '<CityMap key={region.id} region={region} onHealthChange={setMapHealth} cities={cities}')
rep('aria-label="切换二维三维" onClick', 'disabled={mapHealth!==\'complete\' && !streetMap} aria-label="切换二维三维" onClick')
rep("'九市巡游'", "'城市巡游'")
rep("'停止九市巡游' : '开始九市巡游'", "'停止城市巡游' : '开始城市巡游'")
rep('<small>低</small><small>高</small>', '<small>{number(Math.min(...metricValues),1)}</small><small>{number(Math.max(...metricValues),1)}</small><span>{metric===\'gdp\'?\'亿元\':\'%\'} · 本区域相对比较{metric===\'growth\'?\'（零为增长分界）\':\'\'}</span>')
rep("'GUANGDONG · CHINA'", "region.coverageLabel")
rep("'九城协同'", "region.id==='prd'?'九城协同':region.id==='guangdong'?'全省视图':'精选城市'")
rep("'珠江两岸，产业相连。以同一统计口径，观察九座城市的经济规模与产业结构。'", "`以${baseYear}年官方统计观察${region.coverageLabel}的经济规模与产业结构。`")
rep("'占珠三角经济总量' : '广深两市经济占比'", "`占${region.name}经济总量` : '规模前两城占本范围'")
rep("(cities.find(c => c.id === '440100')!.gdp + cities.find(c => c.id === '440300')!.gdp)", "ranked.slice(0,2).reduce((sum,c)=>sum+c.gdp,0)")
rep('产业结构<span>2024</span>','产业结构<span>{baseYear}</span>')
rep('`深圳、广州、佛山、东莞的经济规模合计占九市 ', '`规模前${Math.min(4,cities.length)}城（${ranked.slice(0,4).map(c=>c.name).join(\'、\')}）合计占本范围 ')
rep('以各市 2024 年实际增速', '以各市 {baseYear} 年实际增速')
rep('固定 2024 年价格近似值','固定 {baseYear} 年价格近似值')
rep('九市经济增速', '{region.coverageLabel}经济增速')
rep('2024 · 实际 GDP 增速', '{baseYear} · 实际 GDP 增速')
rep('c.growth / 5.8 * 52', 'Math.abs(c.growth) / Math.max(1,...cities.map(x=>Math.abs(x.growth))) * 52')
rep('min="2025" max="2030"','min={baseYear+1} max="2030"')
rep('year - 2024','year - baseYear')
rep('setYear(2024 + i)','setYear(baseYear + i)')
rep('统计数据：2024 年','统计数据：{baseYear} 年')
start=s.index("      {modal === 'sources' &&");end=s.index("      {modal === 'compare'",start)
s=s[:start]+'''      {modal === 'sources' && <div className="source-content"><p className="dialog-description">{region.coverageLabel} · {baseYear} 全年。各类数据有不同的时间与用途。</p>{sourceList.map(c=><article key={c.sourceUrl}><span className="source-tag">官方统计 · {c.statPeriod}</span><h3>{c.sourceName}</h3><p>金额：{c.amountUnit}，{c.currency}；{c.priceBasis}。发布：{c.publishedAt}；采集：{c.fetchedAt.slice(0,10)}。{c.revisionStatus}。</p><p>版本：{c.datasetVersion}。保留原值和舍入差，不混合半年与全年。</p><a href={c.sourceUrl} target="_blank" rel="noreferrer">查看原始统计来源<ExternalLink size={13}/></a></article>)}<article><span className="source-tag">地图参考</span><h3>OSM 行政范围与陆地交集</h3><p>WGS84 坐标；Natural Earth 1:1000 万海岸参考，不是10米精度。区域高度是指标示意。在线建筑按上游高度展示，缺失高度采用6米示意，并非实测全覆盖。</p><a href={region.map.manifestUrl} target="_blank" rel="noreferrer">本地区地图清单<ExternalLink size={13}/></a></article><article><span className="source-tag">天气模式与情景</span><p>Open-Meteo 提供代表点模式估计及小时预报，失败时不补假值。发展情景以{baseYear}年为基期，固定价格近似、逐城复利，不是官方预测。</p><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">天气来源说明</a></article><article><h3>区域场景视觉</h3><p>{region.theme.sceneAlt}。场景不作地理或统计证据，不拼接不相邻城市为同一真实景观。</p><a href="/scenes/manifest.json" target="_blank" rel="noreferrer">素材与制作记录</a></article></div>}
''' + s[end:]
rep('<p>2024 年 GDP</p>','<p>{baseYear} 年 GDP</p>')
rep("['占珠三角 GDP'", "[`占${region.name} GDP`")
rep('统计来源：广东省统计局，2024 年全年各市地区生产总值。','统计期：{baseYear} 全年；范围：{region.coverageLabel}；来源见数据说明。')
rep('<p>{m.text}</p>', '<>{m.context&&<div className="answer-context">{m.context.object} · {m.context.statPeriod} · {m.context.type}{m.context.targetYear?` · 目标${m.context.targetYear}（基期${m.context.dataYear}）`:null}<small>{m.context.datasetVersion}</small></div>}<p>{m.text}</p></>')
rep("'比较珠三角各市的经济规模'", "'比较当前区域各市的经济规模'")
rep('    {toast &&', '    <Onboarding manualOpen={guideOpen} onManualHandled={()=>setGuideOpen(false)} scene={scene} setScene={setScene} onPause={()=>{setTour(false);setPlaying(false);}} onCompare={()=>{setCompareIds(cities.slice(0,2).map(c=>c.id));setModal(\'compare\');setToast(\'已选择本区域前两座城市作为教学示例。\');}}/>\n    {toast &&')
p.write_text(s,encoding='utf-8')
print('App context and data bindings upgraded')

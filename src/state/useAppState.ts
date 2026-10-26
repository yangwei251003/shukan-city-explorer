import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadFile, gdpFormat, number, projectionSeries, projectValue, sumGDP } from '../lib/metrics';
import type { City, Metric, Scene, Weather, AnswerContext } from '../types';
import { metricValue, csvText } from '../lib/v3';
import { readRoute, routeHash } from '../router';
import { useNationalData } from '../lib/useNationalData';
import { useDataset } from '../lib/useDataset';
type Modal = 'sources' | 'compare' | 'assistant' | 'regions' | null;
type Answer = { role: 'user' | 'assistant'; text: string; mode?: string; context?: AnswerContext; sources?: { title: string; url: string }[] };
export function useAppState() {
  const {catalog,region,dataset,cities,loading,error:loadError,changeRegion,changeDataset}=useDataset();
  const national=useNationalData(catalog);
  const [scenarioA,setScenarioA]=useState(0);
  const [roadshow,setRoadshow]=useState(false);
  const pendingRoute=useRef('');
  const baseYear=dataset?.year ?? 2025;
  const [guideOpen,setGuideOpen]=useState(false);
  const [mapHealth,setMapHealth]=useState('loading');
  const [selected, setSelected] = useState('all');
  const [scene, setScene] = useState<Scene>('nation');
  const [metric, setMetric] = useState<Metric>('gdp');
  const [query, setQuery] = useState('');
  const [mode3d, setMode3d] = useState(true);
  const [connections, setConnections] = useState(false);
  const [labels, setLabels] = useState(true);
  const [streetMap, setStreetMap] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [mapStatus, setMapStatus] = useState('正在加载区域底图');
  const [compareIds, setCompareIds] = useState(['440100', '440300', '440600']);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [tour, setTour] = useState(false);
  const [year, setYear] = useState(2030);
  const [growthDelta, setGrowthDelta] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherRefresh, setWeatherRefresh] = useState(0);
  const [weatherIndex, setWeatherIndex] = useState(0);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Answer[]>([]);
  const [thinking, setThinking] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/status', { signal: controller.signal }).then(r => r.json()).then(d => setModelConfigured(!!d.modelConfigured)).catch(() => {});
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (modal) {
      setTour(false); setPlaying(false);
      if (!dialogRef.current?.open) {if(roadshow)dialogRef.current?.show();else dialogRef.current?.showModal();}
    }
    else dialogRef.current?.close();
  }, [modal,roadshow]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, thinking]);
  useEffect(() => {
    if (!tour || !cities.length) return;
    const t = setInterval(() => setSelected(id => cities[(cities.findIndex(c => c.id === id) + 1) % cities.length].id), 5500);
    return () => clearInterval(t);
  }, [tour, cities]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setYear(value => value >= 2030 ? baseYear+1 : value + 1), 1400);
    return () => clearInterval(t);
  }, [playing,baseYear]);
  useEffect(() => { if (scene !== 'scenario') setPlaying(false); }, [scene]);

  const currentCity = cities.find(c => c.id === selected);
  const weatherCity = currentCity || cities[0];
  useEffect(() => {
    if (scene !== 'weather' || !weatherCity) return;
    const controller = new AbortController();
    setWeatherLoading(true); setWeather(null); setWeatherIndex(0);
    fetch(`/api/weather?city=${weatherCity.id}`, { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(value=>{if(!controller.signal.aborted)setWeather(value);}).catch(e => {
      if (e.name !== 'AbortError') setWeather({ cityId: weatherCity.id, available: false, provider: 'Open-Meteo', fetchedAt: new Date().toISOString(), sourceUrl: 'https://open-meteo.com/', error: '气象服务暂时无法连接，请稍后重试。' });
    }).finally(() => { if (!controller.signal.aborted) setWeatherLoading(false); });
    return () => controller.abort();
  }, [scene, weatherCity?.id, weatherRefresh]);

  useEffect(()=>{
    if(!catalog)return;
    const apply=()=>{const r=readRoute(location.hash,catalog);pendingRoute.current=routeHash(r);changeRegion(r.regionId,r.datasetId);setScene(r.scene);setSelected(r.cityId);};
    apply();window.addEventListener('hashchange',apply);window.addEventListener('popstate',apply);
    return()=>{window.removeEventListener('hashchange',apply);window.removeEventListener('popstate',apply);};
  },[catalog]);
  useEffect(()=>{
    if(!catalog||!region||!dataset||loading)return;
    const hash=routeHash({regionId:region.id,scene,cityId:selected,datasetId:dataset.id});
    if(pendingRoute.current){if(hash!==pendingRoute.current)return;pendingRoute.current='';}
    if(location.hash!==hash)history.pushState(null,'',hash);
    document.title=`数瞰 · ${scene==='nation'?'全国':region.coverageLabel} · ${{nation:'全国总览',overview:'城市总览',weather:'气象洞察',scenario:'发展推演',real3d:'城市实景'}[scene]}`;
  },[catalog,region,dataset,scene,selected,loading]);
  const ranked = useMemo(() => [...cities].sort((a, b) => b.gdp - a.gdp), [cities]);
  const activeCities = currentCity ? [currentCity] : cities;
  const total = sumGDP(cities);
  const activeGDP = sumGDP(activeCities);
  const formattedGDP = gdpFormat(activeGDP);
  const activeIndustries = [0, 1, 2].map(i => activeCities.reduce((sum, c) => sum + c.industries[i], 0));
  const thirdShare = activeGDP ? activeIndustries[2] / activeGDP * 100 : 0;
  const baseline = projectionSeries(activeCities, 0);
  const scenarioSeries = projectionSeries(activeCities, growthDelta);
  const projected = scenarioSeries[year - baseYear]?.value || 0;
  const scenarioGDP = gdpFormat(projected);
  const compareCities = compareIds.map(id => cities.find(c => c.id === id)).filter((c): c is City => !!c);
  const forecast = weather?.hourly || [];
  const forecastHour = forecast[weatherIndex];
  const selectedName = currentCity?.name || region?.name || '所选区域';

  const sourceList=[...new Map((scene==='nation'?national.cities:cities).map(c=>[c.sourceUrl,c])).values()];
  const metricValues=cities.map(c=>metricValue(c,metric)).filter((v):v is number=>v!==null);
  function switchRegion(id:string,preferredDataset?:string){setTour(false);setPlaying(false);setSelected('all');setQuery('');setCompareIds(ids=>ids.filter(c=>catalog?.regions.find(r=>r.id===id)?.memberCityIds.includes(c)));changeRegion(id,preferredDataset);setToast('已切换地区，对比仅保留范围内城市。');}
  function selectCity(id: string) { setSelected(id); setTour(false); }
  function toggleCompare(id: string) {
    setCompareIds(ids => {
      if (ids.includes(id)) return ids.filter(i => i !== id);
      if (ids.length >= 3) { setToast('最多对比三座城市，请先取消一座。'); return ids; }
      return [...ids, id];
    });
  }
  function exportData() {
    const at=new Date().toISOString();
    const rows=[['regionId','城市','统计期','GDP（亿元）','实际增速（%）','第一产业（亿元）','第二产业（亿元）','第三产业（亿元）','币种','价格口径','来源','发布日期','版本','导出时间','常住人口（万人）','人口来源','人均GDP（元）','计算口径'],...activeCities.map(c=>[region!.id,c.name,c.statPeriod,c.gdp,c.growth,...c.industries,c.currency,c.priceBasis,c.sourceUrl,c.publishedAt,c.datasetVersion,at,c.population??'',c.populationSourceUrl??'',metricValue(c,'gdpPerCapita')??'','GDP亿元÷常住人口万人×10000；按常住人口计算'])];
    downloadFile(`数瞰-${selectedName}-${baseYear}统计数据.csv`,csvText(rows),'text/csv;charset=utf-8');setToast('已导出统计数据、版本与来源。');
  }
  function exportScenario() {
    const at=new Date().toISOString();
    const rows=[['regionId','城市','统计期','基年','目标年','基期GDP（亿元）','增长调整（百分点）','假设年均增长率（%）','情景值（亿元）','币种','价格口径','来源','发布日期','版本','导出时间','说明','情景A增长调整（百分点）','情景A假设年均增长率（%）','情景A值（亿元）','情景B增长调整（百分点）','情景B假设年均增长率（%）','情景B值（亿元）'],...activeCities.map(c=>[region!.id,c.name,c.statPeriod,baseYear,year,c.gdp,growthDelta,(c.growth+growthDelta).toFixed(1),projectValue(c.gdp,c.growth+growthDelta,year,baseYear).toFixed(2),c.currency,`固定${baseYear}年价格近似`,c.sourceUrl,c.publishedAt,c.datasetVersion,at,'基期GDP×(1+假设年均增速)^年数；假设推演不是官方预测',scenarioA,(c.growth+scenarioA).toFixed(1),projectValue(c.gdp,c.growth+scenarioA,year,baseYear).toFixed(2),growthDelta,(c.growth+growthDelta).toFixed(1),projectValue(c.gdp,c.growth+growthDelta,year,baseYear).toFixed(2)])];
    downloadFile(`数瞰-${selectedName}-${baseYear}至${year}情景推演.csv`,csvText(rows),'text/csv;charset=utf-8');setToast('已导出基年、假设参数、来源与版本。');
  }
  async function ask(text = question) {
    const q = text.trim(); if (!q || thinking) return;
    setQuestion(''); setAnalysisError(''); setThinking(true);
    setMessages(m => [...m, { role: 'user', text: q }]);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regionId:region!.id,datasetId:dataset!.id,cityId:selected, question:q,...(/情景|推演|假设/.test(q)?{scenario:{growthDelta,year}}:{}) }), signal: AbortSignal.timeout(35000) });
      const answer = await r.json(); if (!r.ok) throw new Error(answer.error || '分析服务暂不可用');
      setMessages(m => [...m, { role: 'assistant', text: answer.answer, mode: answer.mode, context:answer.context,sources: answer.sources }]);
    } catch (e) { setAnalysisError(e instanceof Error ? e.message : '分析失败，请重试。'); setQuestion(q); }
    finally { setThinking(false); }
  }

  return { national,scenarioA,setScenarioA,roadshow,setRoadshow,catalog, region, dataset, cities, loading, loadError, changeRegion, changeDataset, baseYear, guideOpen, setGuideOpen, mapHealth, setMapHealth, selected, setSelected, scene, setScene, metric, setMetric, query, setQuery, mode3d, setMode3d, connections, setConnections, labels, setLabels, streetMap, setStreetMap, layerOpen, setLayerOpen, resetKey, setResetKey, mapStatus, setMapStatus, compareIds, setCompareIds, modal, setModal, toast, setToast, tour, setTour, year, setYear, growthDelta, setGrowthDelta, playing, setPlaying, weather, weatherLoading, weatherRefresh, setWeatherRefresh, weatherIndex, setWeatherIndex, modelConfigured, question, setQuestion, messages, thinking, analysisError, dialogRef, chatRef, now, currentCity, weatherCity, ranked, activeCities, total, activeGDP, formattedGDP, activeIndustries, thirdShare, baseline, scenarioSeries, projected, scenarioGDP, compareCities, forecast, forecastHour, selectedName, sourceList, metricValues, switchRegion, selectCity, toggleCompare, exportData, exportScenario, ask };
}

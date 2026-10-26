import {useMemo,useState} from 'react';
import {ArrowUpRight,ArrowRight,ArrowLeft,Search,X,BarChart3,SlidersHorizontal,Database,Compass} from 'lucide-react';
import NationMap from '../components/NationMap';
import {useApp} from '../state/AppContext';
import {metricValue,metricNames,metricUnits} from '../lib/v3';
import {matchesCity} from '../lib/cities.mjs';
import {number} from '../lib/metrics';
import type {City,Metric} from '../types';
import {provinceOf,type Province} from '../lib/provinceSelection';

export default function Nation(){
 const {catalog,national,switchRegion,setScene,setSelected,setModal,region}=useApp();
 const [metric,setMetric]=useState<Metric>('gdp'),[page,setPage]=useState(0),[active,setActive]=useState(region.id);
 const [query,setQuery]=useState(''),[searchOpen,setSearchOpen]=useState(false),[searchIndex,setSearchIndex]=useState(0);
 const [province,setProvince]=useState<Province|null>(null);
 const chooseProvince=(value:Province|null)=>{setProvince(value);setRange('all');setRankQuery('');setPage(0);};
 const chooseRegion=(id:string)=>{setProvince(null);setActive(id);setRange(id);setRankQuery('');setPage(0);};
 const [rankQuery,setRankQuery]=useState(''),[range,setRange]=useState('all');
 const latest=Math.max(...national.cities.map(c=>c.dataYear),2025),cities=national.cities.filter(c=>c.dataYear===latest);
 const admittedCount=new Set(catalog.regions.flatMap(r=>r.memberCityIds)).size;
 const populationCount=cities.filter(c=>c.population!=null).length;
 const current=catalog.regions.find(r=>r.id===active)??catalog.regions[0];
 const enter=(id:string,cityId='all',scene:'overview'|'scenario'='overview')=>{switchRegion(id,catalog.regions.find(r=>r.id===id)?.defaultDatasetId);setScene(scene);setSelected(cityId);setSearchOpen(false);window.scrollTo({top:0,behavior:'instant'});};
 const cityRegion=(c:City)=>catalog.regions.find(r=>r.memberCityIds.includes(c.id));
 const matches=query.trim()?cities.filter(c=>matchesCity(c,query)).slice(0,7):[];
 const ranked=useMemo(()=>{
  const members=catalog.regions.find(r=>r.id===range)?.memberCityIds;
  return national.cities.filter(c=>c.dataYear===latest&&(!province||provinceOf(c.id)===province.id)&&(!members||members.includes(c.id))&&matchesCity(c,rankQuery)).sort((a,b)=>(metricValue(b,metric)??-Infinity)-(metricValue(a,metric)??-Infinity));
 },[national.cities,catalog,range,rankQuery,metric,latest,province]);
 const pages=Math.max(1,Math.ceil(ranked.length/15)),safePage=Math.min(page,pages-1);
 const goCity=(c:City)=>{const r=cityRegion(c);if(r)enter(r.id,c.id);};
 return <div className="nation-scene nation-product">
  <section className="nation-product-heading"><div><div className="eyebrow"><span/> A WINDOW INTO OUR CITIES</div><h1>看见城市，<em>发现不同。</em></h1><p>从全国格局，到一座城市。用真实数据理解每一种发展路径。</p></div>
   <div className="nation-search-wrap"><label className="nation-global-search"><Search size={18}/><input role="combobox" aria-label="搜索已接入城市" aria-controls="nation-search-results" aria-expanded={searchOpen&&!!query.trim()} aria-autocomplete="list" aria-activedescendant={searchOpen&&matches.length?`nation-result-${searchIndex}`:undefined} placeholder="想了解哪座城市？输入名称或拼音" value={query} onFocus={()=>setSearchOpen(true)} onBlur={()=>setSearchOpen(false)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);setSearchIndex(0);}} onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);e.currentTarget.blur();}if(e.key==='ArrowDown'&&matches.length){e.preventDefault();setSearchOpen(true);setSearchIndex(i=>(i+1)%matches.length);}if(e.key==='ArrowUp'&&matches.length){e.preventDefault();setSearchIndex(i=>(i+matches.length-1)%matches.length);}if(e.key==='Enter'&&matches[searchIndex]){e.preventDefault();goCity(matches[searchIndex]);}}}/>{query?<button aria-label="清空城市搜索" onClick={()=>{setQuery('');setSearchOpen(false);}}><X size={15}/></button>:<kbd>↵</kbd>}</label>
    {searchOpen&&query.trim()&&<div className="nation-search-results" id="nation-search-results" role="listbox" aria-label="城市搜索结果">{matches.length?matches.map((c,i)=><button id={`nation-result-${i}`} role="option" aria-selected={i===searchIndex} key={c.id} onMouseDown={e=>e.preventDefault()} onClick={()=>goCity(c)}><span><strong>{c.name}</strong><small>{cityRegion(c)?.coverageLabel}</small></span><span>{number(c.gdp/10000,2)} 万亿元<ArrowUpRight size={15}/></span></button>):<p>{national.loading?'正在读取城市，请稍候…':national.error?'统计暂未加载，请先重试数据。':<>暂未接入“{query}”。试试广州、杭州或成都。</>}</p>}</div>}
    <div className="nation-coverage"><span><i/>{admittedCount} 城已接入</span><span>{catalog.regions.length} 个区域</span><span>{latest} 全年</span><button onClick={()=>setModal('sources')}>来源可追溯<ArrowUpRight size={11}/></button></div>
   </div>
  </section>
  <div className="national-data-notice" role="status">{national.loading?'正在同步已接入城市统计…':national.error?<>{national.error}<button className="outline-button" onClick={national.reload}>重新读取数据</button></>:null}</div>
  <div id="nation-regions"><NationMap regions={catalog.regions} cities={cities} activeRegion={active} profiles={catalog.profiles} province={province} onProvince={chooseProvince} loading={national.loading} onActive={chooseRegion} onSelect={enter}/></div>
  <section className="nation-explore-actions" aria-label="探索方式"><button onClick={()=>setModal('regions')}><span className="explore-icon"><BarChart3 size={20}/></span><span><strong>把两个区域放在一起看</strong><small>同年同口径，比较规模、产业与人口。</small></span><ArrowUpRight size={19}/></button><button onClick={()=>enter(current.id,'all','scenario')}><span className="explore-icon"><SlidersHorizontal size={20}/></span><span><strong>如果增长路径不同？</strong><small>在{current.name}试一组 A / B 增长假设。</small></span><ArrowUpRight size={19}/></button><button onClick={()=>setModal('sources')}><span className="explore-icon"><Database size={20}/></span><span><strong>数字从哪里来</strong><small>{national.loading?'正在核对统计版本':`${populationCount} / ${admittedCount} 城人口已核验`}，原始出处可查。</small></span><ArrowUpRight size={19}/></button></section>
  <section className="nation-ranking panel" id="nation-ranking"><div className="nation-section-heading"><div><span className="eyebrow">FIND YOUR PERSPECTIVE</span><h2>城市之间，总有新的发现。</h2><p>仅含已接入城市 · 不代表全国完整排名 · {latest} 全年</p></div><div className="metric-switch" role="group" aria-label="榜单指标">{(['gdp','growth','gdpPerCapita'] as Metric[]).map(m=><button key={m} aria-pressed={metric===m} className={metric===m?'active':''} onClick={()=>{setMetric(m);setPage(0);}}>{metricNames[m]}</button>)}</div></div>
   <div className="atlas-selection-status" aria-live="polite">{province&&<><span><Compass size={14}/>{province.name} · 仅含已接入城市</span><button onClick={()=>chooseProvince(null)}>清除省份筛选<X size={13}/></button></>}</div><div className="ranking-toolbar"><label><Compass size={15}/><select aria-label="筛选榜单区域" value={range} onChange={e=>{setProvince(null);setRange(e.target.value);setPage(0);}}><option value="all">全部已接入城市</option>{catalog.regions.map(r=><option value={r.id} key={r.id}>{r.coverageLabel}</option>)}</select></label><label className="ranking-search"><Search size={15}/><input aria-label="筛选榜单城市" value={rankQuery} onChange={e=>{setRankQuery(e.target.value);setPage(0);}} placeholder="在榜单中找城市"/>{rankQuery&&<button aria-label="清空榜单搜索" onClick={()=>setRankQuery('')}><X size={13}/></button>}</label><span>{ranked.length} 座城市 · {metricUnits[metric]}</span></div>
   {metric==='gdpPerCapita'&&<p className="method-note">按同年年末常住人口计算，与官方年平均人口口径可能不同；缺人口时显示暂缺，不以零补齐。</p>}
   {national.loading?<p className="ranking-empty" role="status">正在读取城市榜单…</p>:national.error?<p role="alert">{national.error}</p>:ranked.length?<ol start={safePage*15+1} className="national-ranks">{ranked.slice(safePage*15,safePage*15+15).map((c,i)=>{const value=metricValue(c,metric),max=metricValue(ranked[0],metric)??1;return <li key={c.id}><button onClick={()=>goCity(c)}><span className={`rank-number ${safePage*15+i<3?'rank-top':''}`}>{String(safePage*15+i+1).padStart(2,'0')}</span><span className="rank-city"><strong>{c.name}</strong><small>{cityRegion(c)?.name}</small></span><span className="rank-value"><b>{value===null?'暂缺':number(value,metric==='growth'?1:0)}<small>{value===null?'':metricUnits[metric]}</small></b><i className="rank-track"><i style={{width:`${value===null?0:Math.max(0,Math.min(100,value/max*100))}%`}}/></i></span><ArrowUpRight size={15}/></button></li>;})}</ol>:<div className="ranking-empty"><Search size={24}/><h3>当前范围没有找到这座城市</h3><p>可更换区域，或清空关键词查看已接入城市。</p><button className="outline-button" onClick={()=>{setProvince(null);setRankQuery('');setRange('all');setPage(0);}}>查看全部城市</button></div>}
   <div className="rank-pagination"><span>{ranked.length?`${safePage*15+1}–${Math.min((safePage+1)*15,ranked.length)} / ${ranked.length}`:'0 / 0'}</span><button className="outline-button" disabled={safePage===0} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={14}/>上一页</button><button className="outline-button" disabled={safePage+1>=pages} onClick={()=>setPage(p=>p+1)}>下一页<ArrowRight size={14}/></button></div>
  </section>
 </div>;
}

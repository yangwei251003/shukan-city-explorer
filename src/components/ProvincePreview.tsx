import PopulationReference from './PopulationReference';
import {ArrowUpRight,MapPin,X} from 'lucide-react';
import type {City,RegionConfig} from '../types';
import type {Province} from '../lib/provinceSelection';
import {regionForCity} from '../lib/provinceSelection';
import {regionSummary} from '../lib/nationalAtlas';
import {gdpFormat,number} from '../lib/metrics';

interface Props {province:Province;cities:City[];regions:RegionConfig[];loading:boolean;onSelect:(region:string,city?:string)=>void;onActive:(id:string)=>void;onClear:()=>void}
export default function ProvincePreview({province,cities,regions,loading,onSelect,onActive,onClear}:Props){
 const members=cities.filter(c=>province.cityIds.includes(c.id)).sort((a,b)=>b.gdp-a.gdp);
 const complete=!loading&&members.length===province.cityIds.length,stats=regionSummary(members),amount=gdpFormat(stats.gdp);
 return <aside className="atlas-province-preview" aria-label="省份探索详情">
  <div className="province-heading"><span className="eyebrow">EXPLORE A PROVINCE</span><button aria-label="清除省份选择" onClick={onClear}><X size={17}/></button><MapPin size={23}/><h2>{province.name}</h2><p role="status">{loading?'正在读取城市统计':province.cityIds.length?`已接入 ${province.cityIds.length} 城 · ${complete?'下方榜单已同步':'统计暂不可用，可在页面重试'}`:'该省级区域暂无已接入城市'}</p></div>
  {province.cityIds.length?<>
   <div className="province-total"><span>已接入城市 GDP 合计</span><strong>{complete?amount.value:'—'}<small>{complete?amount.unit:'暂不可用'}</small></strong><p>{members[0]?.dataYear??2025} 全年现价 · 仅所列成员</p></div>
   <div className="province-population"><span>已接入城市常住人口</span><b>{!complete?'暂不可用':stats.population===null?'暂缺':`${number(stats.population,2)} 万人`}</b><small>{!complete?'等待完整统计':stats.population===null?'有成员缺少同年人口，保留缺口':'同年年末人口 · 不代表全省合计'}</small></div>
   {members.length===1&&<PopulationReference city={members[0]}/>}<div className="province-cities" aria-label={`${province.name}已接入城市`}>{members.map(c=><button key={c.id} onClick={()=>{const region=regionForCity(c.id,regions);if(region)onSelect(region.id,c.id);}}><span><b>{c.name}</b><small>{c.population==null?'同年人口待核验':`人口 ${number(c.population,2)} 万人`}</small></span><span>{number(c.gdp,0)}<small>亿元</small><ArrowUpRight size={13}/></span></button>)}</div>
   <div className="province-region-links"><span>继续探索相关范围</span>{regions.filter(r=>province.regionIds.includes(r.id)).map(r=><button key={r.id} onClick={()=>onActive(r.id)}>{r.coverageLabel}<ArrowUpRight size={12}/></button>)}</div>
  </>:<div className="province-empty"><p>地图轮廓不代表统计数据已接入。你仍可探索其他省份，或查看全部已接入城市。</p><button className="outline-button" onClick={onClear}>返回全国探索</button></div>}
  <p className="province-footnote">按行政区划归属筛选；省份、精选范围与完整城市群是不同概念。</p>
 </aside>;
}

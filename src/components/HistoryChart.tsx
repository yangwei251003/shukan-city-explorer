import type {City} from '../types';
import {historicalSeries} from '../lib/v3';
import {number} from '../lib/metrics';
export interface ChartSeries {name:string;color:string;values:(number|null)[];dashed?:boolean}
export function TimeSeriesChart({years,series,label}:{years:number[];series:ChartSeries[];label:string}){
 const values=series.flatMap(s=>s.values).filter((v):v is number=>v!==null&&Number.isFinite(v));
 if(!values.length)return <p className="empty-state">暂无已核验历史数据</p>;
 const max=Math.max(...values)*1.1,min=Math.min(...values)*.9;
 const x=(i:number)=>48+i/Math.max(1,years.length-1)*526,y=(v:number)=>130-(v-min)/(max-min||1)*112;
 const path=(arr:(number|null)[])=>arr.map((v,i)=>v===null?'':`${i===0||arr[i-1]===null?'M':'L'}${x(i)} ${y(v)}`).join(' ');
 return <svg className="history-chart" viewBox="0 0 610 166" role="img" aria-label={label}>
  {[min,(min+max)/2,max].map(v=><g key={v}><line x1="48" x2="574" y1={y(v)} y2={y(v)} stroke="#304942" strokeDasharray="3 5"/><text x="40" y={y(v)+4} textAnchor="end" fill="#a9bdb7" fontSize="10">{number(v,1)}</text></g>)}
  {series.map(s=><g key={s.name}><path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.3" strokeDasharray={s.dashed?'5 4':undefined}/>{s.values.map((v,i)=>v===null?null:<circle key={years[i]} cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{s.name} · {years[i]}：{number(v,2)} 万亿元</title></circle>)}</g>)}
  {years.map((year,i)=>(years.length<=8||i%2===0||i===years.length-1)&&<text key={year} x={x(i)} y="157" textAnchor="middle" fontSize="10" fill="#a9bdb7">{year}</text>)}
 </svg>;
}
export default function HistoryChart({cities,compact=false}:{cities:City[];compact?:boolean}){
 const points=historicalSeries(cities,cities[0]?.dataYear??2025);
 return <section className={`history-section ${compact?'compact':''}`} aria-label="历史实际路径"><div className="subsection-title">历史实际路径<small>现价 · 万亿元</small></div><TimeSeriesChart years={points.map(p=>p.year)} series={[{name:'历史实际',color:'#83c5ff',values:points.map(p=>p.value===null?null:p.value/10000)}]} label="2019至2025年官方GDP历史，缺年断开不插值"/><small>缺年留空，不插值；各年当时公布版本，未统一经济普查回溯修订。</small><details><summary>核对历史年份与来源</summary>{points.map(p=><div className="history-source" key={p.year}><b>{p.year}</b><span>{p.value===null?'暂缺':`${number(p.value,2)} 亿元`}</span>{cities.map(c=>{const row=c.history?.find(h=>h.year===p.year);return row?<a key={c.id} href={row.sourceUrl} target="_blank" rel="noreferrer">{c.name}官方来源</a>:null;})}</div>)}</details></section>;
}

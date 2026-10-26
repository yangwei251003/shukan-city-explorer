import type {City} from '../types';
import {historicalSeries} from '../lib/v3';
import {projectionSeries} from '../lib/metrics';
import HistoryChart,{TimeSeriesChart} from './HistoryChart';
export default function ScenarioPath({cities,scenarioA,scenarioB}:{cities:City[];scenarioA:number;scenarioB:number}){
 const base=cities[0]?.dataYear??2025,years=Array.from({length:12},(_,i)=>2019+i);
 const historical=historicalSeries(cities,base),a=projectionSeries(cities,scenarioA),b=projectionSeries(cities,scenarioB);
 const values=(points:{year:number;value:number|null}[])=>years.map(year=>{const point=points.find(p=>p.year===year);return point?.value===null||!point?null:point.value/10000;});
 return <div className="scenario-path"><TimeSeriesChart years={years} label="历史实际路径与情景A/B对照，空缺年份不连线，未来为假设非预测" series={[{name:'历史实际（现价）',color:'#83c5ff',values:values(historical)},{name:'情景A（假设）',color:'#f5cc85',values:values(a),dashed:true},{name:'情景B（假设）',color:'#8ce9c7',values:values(b)}]}/><p className="path-caption"><i/>历史实际（现价） · A：{scenarioA>=0?'+':''}{scenarioA.toFixed(1)} / B：{scenarioB>=0?'+':''}{scenarioB.toFixed(1)} 个百分点</p><p className="method-note">历史采用各年当时公布版本，未统一经济普查回溯修订。历史为当年现价，情景为固定 {base} 年价格近似值。金额路径仅供对照，不据此推算历史实际增速；精选集合中任一城市缺年，合计该年留空。</p><HistoryChart cities={cities}/></div>;
}

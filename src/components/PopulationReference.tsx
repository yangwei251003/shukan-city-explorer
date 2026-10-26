import {populationReference} from '../lib/populationReference';
import type {City} from '../types';
export default function PopulationReference({city}:{city:City|undefined}){
 const ref=populationReference(city);return ref?<div className="population-reference"><strong>最近已核实人口：{ref.population.toFixed(2)} 万人</strong><small>2024 年末 · 网页标注“2025 年初”</small><small>{city!.dataYear} 年末人口及同年人均 GDP 仍暂缺。</small><a href={ref.sourceUrl} target="_blank" rel="noreferrer">查看官方人口出处 ↗</a></div>:null;
}

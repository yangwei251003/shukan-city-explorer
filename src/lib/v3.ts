import type { City, Metric } from '../types';
export const metricNames:Record<Metric,string>={gdp:'GDP规模',growth:'实际增速',industry:'第二产业占比',population:'常住人口',gdpPerCapita:'人均GDP'};
export const metricUnits:Record<Metric,string>={gdp:'亿元',growth:'%',industry:'%',population:'万人',gdpPerCapita:'元'};
export function perCapita(city:Pick<City,'gdp'|'population'>){return typeof city.population==='number'&&city.population>0?city.gdp/city.population*10000:null;}
export function metricValue(city:City,metric:Metric):number|null {
 if(metric==='population')return typeof city.population==='number'&&city.population>0?city.population:null;
 if(metric==='gdpPerCapita')return perCapita(city);
 if(metric==='industry')return city.industries[1]/city.gdp*100;
 return city[metric];
}
export function historicalSeries(cities:City[],endYear=2025){
 return Array.from({length:Math.max(0,endYear-2019+1)},(_,i)=>{
  const year=2019+i;
  const rows=cities.map(c=>c.history?.find(p=>p.year===year));
  return {year,value:cities.length&&rows.every(p=>p&&Number.isFinite(p.gdp)&&p.sourceUrl)?rows.reduce((n,p)=>n+p!.gdp,0):null};
 });
}
export function scopeObservation(cities:City[]){
 if(cities.length<=4)return `本范围为精选 ${cities.length} 城（${cities.map(c=>c.name).join('、')}），仅比较已接入城市，不代表完整城市群。`;
 const ranked=[...cities].sort((a,b)=>b.gdp-a.gdp),total=cities.reduce((s,c)=>s+c.gdp,0);
 return `规模前4城（${ranked.slice(0,4).map(c=>c.name).join('、')}）合计占本范围 ${(ranked.slice(0,4).reduce((s,c)=>s+c.gdp,0)/total*100).toFixed(1)}%。`;
}
export function inheritOnboarding(storage:Pick<Storage,'getItem'|'setItem'>){
 const key='shukan.onboarding.v3';
 try {
  const current=storage.getItem(key);if(current)return JSON.parse(current);
  const previous=JSON.parse(storage.getItem('zhuliu.onboarding.v2')??'{}');
  if(previous.dismissed||previous.completed){const value={...previous,dismissed:true,version:3};storage.setItem(key,JSON.stringify(value));return value;}
 }catch{}return {};
}
export function csvText(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');}

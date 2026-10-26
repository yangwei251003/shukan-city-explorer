import type {City,Dataset} from '../types';

export function nationalRows(dataset:Dataset,value:unknown):(City&{cityId:string})[]{
 if(!Array.isArray(value)||value.length!==dataset.cityIds.length)throw Error('统计文件城市数量不完整');
 const ids=new Set<string>();
 for(const row of value){
  if(!row||!dataset.cityIds.includes(row.cityId)||ids.has(row.cityId)||row.dataYear!==dataset.year||row.datasetVersion!==dataset.id||!Number.isFinite(row.gdp)||row.gdp<=0)throw Error('统计文件与发布版本不一致');
  ids.add(row.cityId);
 }
 return value;
}

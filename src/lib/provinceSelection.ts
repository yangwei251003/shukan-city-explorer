import type {City,RegionConfig} from '../types';
import type {AtlasCollection} from './nationalAtlas';

export interface Province {id:string;name:string;cityIds:string[];regionIds:string[]}
export function provinceOf(cityId:string):string|null {
 return /^\d{6}$/.test(cityId)?`${cityId.slice(0,2)}0000`:null;
}
// Administrative membership uses catalog IDs, never an arbitrary first region or a label guess.
export function provinceIndex(geo:AtlasCollection,cities:Pick<City,'id'>[],regions:RegionConfig[]):Province[]{
 const admitted=new Set(regions.flatMap(r=>r.memberCityIds));
 return geo.features.filter(f=>f.properties.kind==='province').map(f=>{
  const id=String(f.properties.adcode??f.properties.id);
  const cityIds=[...new Set(cities.filter(c=>admitted.has(c.id)&&provinceOf(c.id)===id).map(c=>c.id))];
  return {id,name:String(f.properties.name),cityIds,regionIds:regions.filter(r=>r.memberCityIds.some(id=>cityIds.includes(id))).map(r=>r.id)};
 });
}
export function regionForCity(id:string,regions:RegionConfig[],preferred?:string){
 return regions.find(r=>r.id===preferred&&r.memberCityIds.includes(id))??regions.find(r=>r.memberCityIds.includes(id));
}

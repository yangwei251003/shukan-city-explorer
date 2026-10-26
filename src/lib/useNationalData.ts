import {useEffect,useState} from 'react';
import type {Catalog,City} from '../types';
import {nationalRows} from './nationalData';
export function useNationalData(catalog:Catalog|null){
 const [cities,setCities]=useState<City[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!catalog)return;const controller=new AbortController();setLoading(true);setError('');
  const ids=new Set(catalog.regions.map(r=>r.defaultDatasetId));
  Promise.all(catalog.datasets.filter(d=>ids.has(d.id)).map(async d=>{const r=await fetch(d.url,{signal:controller.signal});if(!r.ok)throw Error();return nationalRows(d,await r.json());})).then(groups=>{
   const unique=new Map<string,City>();for(const row of groups.flat()){const profile=catalog.profiles.find(c=>c.id===row.cityId);if(profile)unique.set(row.cityId,{...profile,...row,id:row.cityId});}
   setCities([...unique.values()]);setError('');
  }).catch(e=>{if(e.name!=='AbortError'){setCities([]);setError('城市统计暂未加载成功，请重试。');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[catalog,attempt]);return {cities,error,loading,reload:()=>setAttempt(n=>n+1)};
}

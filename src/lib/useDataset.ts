import { useEffect, useRef, useState } from 'react';
import type { Catalog, City } from '../types';
export function useDataset() {
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [regionId,setRegionId]=useState('prd');
  const [datasetId,setDatasetId]=useState('gd-annual-2025-r1');
  const [cities,setCities]=useState<City[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const latest=useRef({catalog,regionId,datasetId});latest.current={catalog,regionId,datasetId};
  useEffect(()=>{const controller=new AbortController();fetch('/data/catalog.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{const first=value.regions.find((r:{id:string})=>r.id===value.defaultRegionId);setRegionId(first.id);setDatasetId(first.defaultDatasetId);setCatalog(value);}).catch(e=>{if(e.name!=='AbortError'){setError('地区目录加载失败，请刷新重试。');setLoading(false);}});return()=>controller.abort();},[]);
  const region=catalog?.regions.find(r=>r.id===regionId);
  const dataset=catalog?.datasets.find(d=>d.id===datasetId);
  useEffect(()=>{
    if(!catalog||!region||!dataset)return;
    const controller=new AbortController();setLoading(true);setError('');
    fetch(dataset.url,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then((rows:(City&{cityId:string})[])=>{
      const selected=rows.filter(row=>region.memberCityIds.includes(row.cityId)).map(row=>({...catalog.profiles.find(c=>c.id===row.cityId)!,...row,id:row.cityId}));
      if(selected.length!==region.memberCityIds.length||selected.some(c=>c.dataYear!==dataset.year||!Number.isFinite(c.gdp)))throw Error();
      setCities(selected);
    }).catch(e=>{if(e.name!=='AbortError'){setCities([]);setError('所选年度的数据不完整或加载失败，请刷新重试。');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[catalog,regionId,datasetId]);
  function changeRegion(id:string,preferredDataset?:string){const current=latest.current,next=current.catalog?.regions.find(r=>r.id===id);if(!next)return;const target=preferredDataset&&next.datasetIds.includes(preferredDataset)?preferredDataset:next.datasetIds.includes(current.datasetId)?current.datasetId:next.defaultDatasetId;if(id===current.regionId&&target===current.datasetId)return;setLoading(true);setRegionId(id);setDatasetId(target);}
  function changeDataset(id:string){if(!region?.datasetIds.includes(id)||id===datasetId)return;setLoading(true);setDatasetId(id);}
  return {catalog,region,dataset,cities,loading,error,changeRegion,changeDataset};
}

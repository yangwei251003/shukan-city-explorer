import {catalog} from '../server/catalog.mjs';
import {writeFileSync} from 'node:fs';
const rows=[];let index=0;
await Promise.all(Array.from({length:3},async()=>{while(index<catalog.profiles.length){const c=catalog.profiles[index++];const r=await fetch('http://127.0.0.1:8787/api/weather?city='+c.id).then(r=>r.json()).catch(e=>({available:false,error:e.message}));rows.push({cityId:c.id,name:c.name,available:r.available,hours:r.hourly?.length,time:r.current?.time,error:r.error});}}));
writeFileSync('docs/v2-weather-check.json',JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2));console.log(JSON.stringify({total:rows.length,available:rows.filter(r=>r.available).length,failed:rows.filter(r=>!r.available)}));

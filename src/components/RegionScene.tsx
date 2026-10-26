import {useEffect,useState} from 'react';
import type {RegionConfig} from '../types';
export default function RegionScene({region}:{region:RegionConfig}){
 const [failed,setFailed]=useState(false);const [visible,setVisible]=useState(!document.hidden);
 useEffect(()=>setFailed(false),[region.id]);
 useEffect(()=>{const update=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 return <div className={`region-scene ${visible?'':'scene-paused'}`} aria-label={region.theme.sceneAlt}>
  {!failed&&<img src={region.theme.sceneUrl} srcSet={`${region.theme.sceneUrl.replace('.webp','-mobile.webp')} 800w, ${region.theme.sceneUrl} 1600w`} sizes="100vw" alt={region.theme.sceneAlt} onError={()=>setFailed(true)}/>}
  <svg className="scene-current" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true"><path d={region.theme.id==='jingjinji'?'M660 260V10M610 150H900M620 90H880':'M420 230C610 60 810 290 1040 100M450 250C650 100 820 330 1060 140'}/></svg>
  <span className="scene-caption">{{gd:'广州滨水',yangtze:'上海滨江',jingjinji:'北京中轴',chengyu:'重庆两江','middle-yangtze':'武汉长江',guanzhong:'西安城墙',central:'郑州如意湖',shandong:'青岛海滨'}[region.theme.id]??region.name} · AI 场景示意</span>
 </div>;
}

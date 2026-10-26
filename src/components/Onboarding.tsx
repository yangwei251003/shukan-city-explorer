import {useEffect,useRef,useState} from 'react';
import type {Scene} from '../types';
import { inheritOnboarding } from '../lib/v3';
import GuideSpotlight from './GuideSpotlight';
const KEY='shukan.onboarding.v3';
let memorySeen=false;
let draft:{phase:'welcome'|'tour';step:number;never:boolean;original:{scene:Scene;delta:number}}|null=null;
const steps=[
 {title:'先看全国格局，再进入城市群',text:'全国页只展示已接入城市。先选择一个区域，再看它包含哪些城市与统计年份。',selectors:['#nation-regions'],scene:'nation'},
 {title:'把城市放在一起比较',text:'最多比较三座城市。规模、实际增速与产业占比是不同维度；下方按钮会选择两座教学示例城市。',selectors:['.compare-button','.bottom-title button'],scene:'overview'},
 {title:'天气是代表点的模式数据',text:'查看当前模式估计和未来小时预报，不是全市每个街区的实测。暂时无数据也能继续下一步。',selectors:['.insight-panel'],scene:'weather'},
 {title:'改一个假设，看结果如何变化',text:'这是固定增长假设的计算实验，不是官方预测。可以试加1.5个百分点；退出教学会恢复你原来的假设。',selectors:['.growth-control'],scene:'scenario'},
 {title:'带着来源与参数离开',text:'数据说明提供原始来源；导出文件保留年份、版本与参数。完成后可开始一次两城比较。',selectors:['.header-tools'],scene:'overview'},
] as const;
type Props={manualOpen:boolean;onManualHandled:()=>void;scene:Scene;setScene:(s:Scene)=>void;onPause:()=>void;onCompare:()=>void;modalOpen:boolean;growthDelta:number;setGrowthDelta:(n:number)=>void;autoStart?:boolean;directTour?:boolean};
export default function Onboarding(p:Props){
 const [phase,setPhase]=useState<'welcome'|'tour'|null>(draft?(p.directTour!==false?'tour':draft.phase):null);
 const [step,setStep]=useState(draft?.step??0);const [never,setNever]=useState(draft?.never??false);
 const [rect,setRect]=useState<DOMRect|null>(null);const [viewport,setViewport]=useState({w:window.innerWidth,h:window.innerHeight});
 const panel=useRef<HTMLDivElement>(null);const target=useRef<HTMLElement|null>(null);const initialized=useRef(false);
 const closing=useRef(false);const closeFrame=useRef<number|null>(null);
 const original=useRef(draft?.original??{scene:p.scene,delta:p.growthDelta});const focusBefore=useRef<HTMLElement|null>(null);
 const savedNever=()=>{try{return inheritOnboarding(localStorage).dismissed===true;}catch{return false;}};
 function open(){if(phase)return;closing.current=false;if(closeFrame.current!==null)cancelAnimationFrame(closeFrame.current);setViewport({w:window.innerWidth,h:window.innerHeight});original.current={scene:p.scene,delta:p.growthDelta};focusBefore.current=document.activeElement as HTMLElement;p.onPause();setNever(savedNever());setPhase(p.directTour===false?'welcome':'tour');setStep(0);}
 useEffect(()=>{if(initialized.current)return;initialized.current=true;if(!p.autoStart)return;let seen=memorySeen;try{seen ||= sessionStorage.getItem(KEY)==='seen';}catch{}if(!seen&&!savedNever()){memorySeen=true;try{sessionStorage.setItem(KEY,'seen');}catch{}open();}},[]);
 useEffect(()=>{if(p.manualOpen){open();p.onManualHandled();}},[p.manualOpen]);
 useEffect(()=>{if(phase)draft={phase,step,never,original:original.current};},[phase,step,never]);
 useEffect(()=>()=>{if(closeFrame.current!==null)cancelAnimationFrame(closeFrame.current);},[]);
 function close(complete=false,compare=false){
   if(closing.current)return;closing.current=true;
   draft=null;
   if(never||complete){try{localStorage.setItem(KEY,JSON.stringify({dismissed:true,completed:complete,version:3}));}catch{}}
   memorySeen=true;try{sessionStorage.setItem(KEY,'seen');}catch{}
   setPhase(null);setRect(null);p.setGrowthDelta(original.current.delta);p.setScene(compare?'overview':original.current.scene);
   closeFrame.current=requestAnimationFrame(()=>{closeFrame.current=null;const previous=focusBefore.current;const destination=previous?.isConnected&&previous!==document.body&&previous.getClientRects().length&&!previous.closest('[inert]')?previous:document.getElementById('guide-entry');if(destination&&!destination.closest('[inert]'))destination.focus();if(compare)p.onCompare();});
 }
 useEffect(()=>{
   if(!phase||p.modalOpen)return;
   if(phase==='tour')p.setScene(steps[step].scene);
   const find=()=>{target.current=null;if(phase==='tour')for(const selector of steps[step].selectors){const e=document.querySelector<HTMLElement>(selector);if(e&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height){target.current=e;break;}}};
   const frame=requestAnimationFrame(()=>{find();target.current?.scrollIntoView({block:'center',behavior:'instant'});setRect(target.current?.getBoundingClientRect()??null);panel.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({preventScroll:true});});
   const update=()=>{find();setRect(target.current?.getBoundingClientRect()??null);setViewport({w:innerWidth,h:innerHeight});};
   window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
   return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[phase,step,p.scene,p.modalOpen]);
 useEffect(()=>{if(!phase||p.modalOpen)return;const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();close();}
   if(e.key==='Tab'){
     const elements=[...(target.current?.querySelectorAll<HTMLElement>('button,input,select,a[href]')??[]),...(panel.current?.querySelectorAll<HTMLElement>('button,input')??[])].filter(x=>!x.hasAttribute('disabled')&&x.getBoundingClientRect().width>0);
     if(target.current?.matches('button,a[href]'))elements.unshift(target.current);
     if(!elements.length)return;const index=elements.indexOf(document.activeElement as HTMLElement);
     e.preventDefault();elements[(index+(e.shiftKey?-1:1)+elements.length)%elements.length].focus();
   }
 };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[phase,step,never,p.modalOpen]);
 if(!phase||p.modalOpen)return null;
 const margin=8;const hole=rect?{x:Math.max(0,rect.x-margin),y:Math.max(0,rect.y-margin),right:Math.min(viewport.w,rect.right+margin),bottom:Math.min(viewport.h,rect.bottom+margin)}:null;
 const top=hole?Math.min(viewport.h-300,Math.max(16,hole.bottom+12)):Math.max(16,(viewport.h-300)/2);
 const left=hole?Math.min(viewport.w-376,Math.max(16,hole.x)):Math.max(16,(viewport.w-360)/2);
 return <div className="onboarding-layer">
  <GuideSpotlight hole={hole}/>
  <div ref={panel} className="guide-card" role="dialog" aria-label={phase==='welcome'?'欢迎使用数瞰':`使用指南第${step+1}步`} style={{top:viewport.w<700?undefined:top,left:viewport.w<700?16:left}}>
    <span className="eyebrow">{phase==='welcome'?'WELCOME TO SHUKAN':`第 ${step+1} / 5 步 · 可操作高亮区域`}</span>
    <h2>{phase==='welcome'?'用真实数据，看懂城市差异。':steps[step].title}</h2>
    <p>{phase==='welcome'?'选城市、看差异、试假设。官方统计有年份，天气来自模式，发展情景不是预测。':steps[step].text}</p>
    {phase==='welcome'?<><label><input type="checkbox" checked={never} onChange={e=>setNever(e.target.checked)}/>不再自动提示</label><div className="guide-actions"><button onClick={()=>setPhase('tour')}>用1分钟了解</button><button onClick={()=>close()}>直接开始</button></div></>:<>
      {step===1&&<button className="guide-demo" onClick={p.onCompare}>打开两城教学示例</button>}
      {step===3&&<div className="guide-demo-row"><button className="guide-demo" onClick={()=>p.setGrowthDelta(1.5)}>试加1.5个百分点</button><button className="guide-demo" onClick={()=>p.setGrowthDelta(original.current.delta)}>恢复原假设</button></div>}
      <div className="guide-actions"><button disabled={step===0} onClick={()=>setStep(s=>s-1)}>上一步</button><button onClick={()=>step===4?close(true,true):setStep(s=>s+1)}>{step===4?'开始比较城市':'下一步'}</button><button className="guide-skip" onClick={()=>close()}>跳过</button></div>
    </>}
  </div>
 </div>;
}

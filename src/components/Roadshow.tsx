import {useEffect,useRef,useState} from 'react';
import {Pause,Play,SkipForward,X} from 'lucide-react';
import {useApp} from '../state/AppContext';
import GuideSpotlight,{type SpotlightHole} from './GuideSpotlight';
import type {Scene} from '../types';
const steps:{scene:Scene;region:string;target:string;title:string;text:string}[]=[
 {scene:'nation',region:'prd',target:'.nation-product-heading',title:'全国格局，从可信数据开始',text:'数瞰只展示已接入城市。全国页是探索入口，不计算不完整集合的全国总量。'},
 {scene:'overview',region:'prd',target:'.map-panel',title:'珠三角：从格局看城市差异',text:'区域柱高表示经济指标，不是建筑高度。人口与人均 GDP 有同年来源；缺失值留空。'},
 {scene:'overview',region:'yangtze',target:'.insight-panel',title:'长三角：每个数字都有年份',text:'精选集合不等于完整城市群。历史只录入官方已核验年份，缺年断开，不插值。'},
 {scene:'scenario',region:'yangtze',target:'.bottom-panel',title:'两种假设，两条可能路径',text:'情景 A 与 B 使用同一基年。历史为现价，情景为固定基年价格近似；明确假设，非官方预测。'},
 {scene:'overview',region:'prd',target:'.header-tools',title:'问来源，也问边界',text:'助手可逐一回应多个城市，未接入就明确说明。统计、地图、假设计算和规则助手在本机离线可用。'},
];
export default function Roadshow(){
 const app=useApp(),[step,setStep]=useState(0),[paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[hole,setHole]=useState<SpotlightHole|null>(null),[fullscreen,setFullscreen]=useState(false);
 const original=useRef({scene:app.scene,region:app.region.id,dataset:app.dataset.id,selected:app.selected,delta:app.growthDelta,a:app.scenarioA});const controls=useRef<HTMLDivElement>(null);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function exit(){app.setModal(null);app.changeRegion(original.current.region,original.current.dataset);app.setScene(original.current.scene);app.setSelected(original.current.selected);app.setGrowthDelta(original.current.delta);app.setScenarioA(original.current.a);app.setRoadshow(false);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});}
 useEffect(()=>{app.setTour(false);app.setPlaying(false);document.documentElement.requestFullscreen?.().then(()=>setFullscreen(true)).catch(()=>setFullscreen(false));controls.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();exit();}if(e.key==='Tab'){e.preventDefault();const buttons=[...controls.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}};document.addEventListener('keydown',listener,true);return()=>document.removeEventListener('keydown',listener,true);},[]);
 useEffect(()=>{const current=steps[step];app.setModal(null);app.switchRegion(current.region);app.setScene(current.scene);if(step===2){const r=app.catalog.regions.find(r=>r.id===current.region);if(r)app.setSelected(r.memberCityIds[0]);}if(step===3){app.setScenarioA(-1);app.setGrowthDelta(1.5);}if(step===4){void app.ask('广州和雄安的GDP是多少？');app.setModal('assistant');}},[step]);
 useEffect(()=>{const update=()=>{const e=document.querySelector(step===4?'.assistant-content':steps[step].target);const r=e?.getBoundingClientRect();setHole(r?{x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),right:Math.min(innerWidth,r.right+6),bottom:Math.min(innerHeight,r.bottom+6)}:null);};const timer=setTimeout(()=>{document.querySelector(steps[step].target)?.scrollIntoView({block:'center',behavior:'instant'});update();},350);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);return()=>{clearTimeout(timer);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};},[step,app.loading]);
 useEffect(()=>{if(paused||reduced)return;const t=setTimeout(()=>step===steps.length-1?exit():setStep(i=>i+1),15000);return()=>clearTimeout(t);},[step,paused,reduced]);
 // A native modal occupies the top layer; make it inert as well as blocking pointer input.
 useEffect(()=>{if(app.dialogRef.current)app.dialogRef.current.inert=true;return()=>{if(app.dialogRef.current)app.dialogRef.current.inert=false;};},[app.modal]);
 return <div className="onboarding-layer roadshow-layer"><GuideSpotlight hole={hole} blocked/><div className="roadshow-caption" ref={controls} role="dialog" aria-label="路演控制"><span className="eyebrow">{step+1} / {steps.length} · {reduced?'减少动态 · 手动分步':paused?'已暂停':'自动导览'}{!fullscreen?' · 窗口演示':''}</span><h2>{steps[step].title}</h2><p>{steps[step].text}</p><div><button disabled={reduced} onClick={()=>setPaused(v=>!v)}>{paused?<Play size={16}/>:<Pause size={16}/>} {paused?'继续':'暂停'}</button><button onClick={()=>step===steps.length-1?exit():setStep(i=>i+1)}><SkipForward size={16}/>{step===steps.length-1?'结束':'快进'}</button><button onClick={exit}><X size={16}/>退出 · Esc</button></div></div></div>;
}

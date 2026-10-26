import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,ExternalLink,MapPin,RefreshCw} from 'lucide-react';
import {useApp} from '../state/AppContext';
import {usableModels,type RealWorldModel} from '../lib/realWorld';
import RealWorldCanvas from '../components/RealWorldCanvas';

export default function RealWorld(){
 const {catalog,selected,setSelected,switchRegion,setScene,currentCity,loading:dataLoading}=useApp();
 const revealed=useRef(0),viewer=useRef<HTMLDivElement>(null);
 const [revealRequest,setRevealRequest]=useState(0);
 const [models,setModels]=useState<RealWorldModel[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');fetch('/models/manifest.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('实景清单暂未加载');return r.json();}).then(v=>setModels(usableModels(v,catalog.regions.flatMap(r=>r.memberCityIds)).map(m=>({...m,preview:m.preview?`${m.preview}?v=${v.files[m.preview.slice(8)].sha256.slice(0,12)}`:m.preview})))).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[attempt,catalog]);
 const choose=(m:RealWorldModel,scroll=false)=>{const r=catalog.regions.find(r=>r.memberCityIds.includes(m.cityId));if(r){if(scroll)setRevealRequest(n=>n+1);switchRegion(r.id,r.defaultDatasetId);setSelected(m.cityId);}};
 useEffect(()=>{if(selected==='all'&&models[0])choose(models[0]);},[selected,models]);
 const model=models.find(m=>m.cityId===selected);
 useEffect(()=>{if(!model||dataLoading||revealRequest===revealed.current)return;const id=requestAnimationFrame(()=>{if(viewer.current){viewer.current.scrollIntoView({block:'center',behavior:'instant'});revealed.current=revealRequest;}});return()=>cancelAnimationFrame(id);},[model?.id,dataLoading,revealRequest]);
 return <div className="real-world-scene"><header className="real-world-heading"><div><span className="eyebrow">A CLOSER LOOK AT THE CITY</span><h1>走近一处，<em>看见真实。</em></h1><p>沿着河岸、广场与天际线，观察一座城市的空间关系。</p></div><button className="outline-button" onClick={()=>setScene('overview')}><ArrowLeft size={14}/>返回城市数据</button></header>
  <div className="real-world-places" role="group" aria-label="选择真实城市模型">{models.map(m=><button key={m.id} aria-pressed={m.id===model?.id} className={m.id===model?.id?'active':''} onClick={()=>choose(m,true)}>{m.preview&&<img src={m.preview} alt={`${m.city}场景预览`} loading="lazy" decoding="async"/>}<MapPin size={17}/><span><b>{m.city} · {m.name}</b><small>{m.kind==='photogrammetry'?'局部倾斜摄影实景':m.kind==='reconstruction'?'地理场景与地标复原':m.kind==='landmark'?'真实地标人工建模':'建筑结构白模'}</small></span><ArrowUpRight size={15}/></button>)}</div>
  {loading?<div className="real-world-empty" role="status">正在核对本地实景清单…</div>:error?<div className="real-world-empty" role="alert"><p>{error}</p><button className="outline-button" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>重试模型清单</button></div>:model?<><div ref={viewer}><RealWorldCanvas key={model.id} model={model}/></div><div className="real-world-details"><article><span className="eyebrow">WHAT YOU ARE SEEING</span><h2>{model.city} · {model.name}</h2><p>{model.coverage}。{model.qualityNote}</p><p className="real-world-context-note">{model.contextNote}</p><small>素材时间：{model.captureDate} · 本地模型约 {(model.bytes/1024**2).toFixed(1)} MB</small></article><article><span className="eyebrow">TRACE THE PLACE</span><h3>每处实景，都能追溯。</h3><p>{model.sourceName}。本地保存已接入层级，断网仍可查看；模型不表示实时城市状态。</p><div><a href={model.exampleUrl} target="_blank" rel="noreferrer">原始示例说明<ExternalLink size={12}/></a><a href="/models/manifest.json" target="_blank" rel="noreferrer">模型来源清单<ExternalLink size={12}/></a></div></article></div></>:<div className="real-world-empty"><MapPin size={28}/><h2>{currentCity?.name??'当前范围'}实景尚待接入</h2><p>已接入的真实地点列在上方，可以先选择其中一处探索。</p><button className="outline-button" onClick={()=>setScene('overview')}>查看城市统计<ArrowUpRight size={14}/></button></div>}
 </div>;
}

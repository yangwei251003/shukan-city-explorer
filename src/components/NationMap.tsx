import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Minus,Plus,RotateCcw,MapPinned,RefreshCw,Maximize2,Minimize2} from 'lucide-react';
import type {City,RegionConfig} from '../types';
import {atlasProjection,regionAnchor,regionSummary,type AtlasCollection,type Position} from '../lib/nationalAtlas';
import {gdpFormat,number} from '../lib/metrics';
import {provinceIndex,provinceOf,type Province} from '../lib/provinceSelection';
import ProvincePreview from './ProvincePreview';

interface Props {regions:RegionConfig[];cities:City[];activeRegion:string;profiles:City[];province:Province|null;onProvince:(province:Province|null)=>void;loading?:boolean;onActive:(id:string)=>void;onSelect:(id:string,cityId?:string)=>void}
let cached:AtlasCollection|null=null;
const offsets:Record<string,Position>={prd:[-82,51],guangdong:[-144,-2],yangtze:[77,-20],jingjinji:[36,-43],chengyu:[-92,-15],'middle-yangtze':[35,44],guanzhong:[-68,-46],central:[57,-17],shandong:[91,-27]};
const main=atlasProjection([73,17.5,135.5,54],[4,25,870,565],16);
const inset=atlasProjection([105,2,124,24],[728,415,152,188],6);
const graticule=Array.from({length:7},(_,i)=>73+i*10).map(lon=>Array.from({length:41},(_,j)=>[lon,15+j] as Position)).concat([20,30,40,50].map(lat=>Array.from({length:66},(_,j)=>[72+j,lat] as Position)));
const line=(points:Position[])=>points.map((p,i)=>{const q=main.project(p);return `${i?'L':'M'}${q[0].toFixed(2)},${q[1].toFixed(2)}`;}).join('');

export default function NationMap({regions,cities,profiles,province,onProvince,activeRegion,loading=false,onActive,onSelect}:Props){
 const [geo,setGeo]=useState<AtlasCollection|null>(cached),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState<Position>([0,0]);
 const drag=useRef<{x:number;y:number;clientX:number;clientY:number;pan:Position}|null>(null),suppressClick=useRef(false),uid=useId().replaceAll(':','');
 const container=useRef<HTMLElement>(null),focusButton=useRef<HTMLButtonElement>(null);
 const [immersive,setImmersive]=useState(false),[hover,setHover]=useState<{kind:'province'|'city';id:string}|null>(null);
 useEffect(()=>{if(!immersive)return;const before=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';focusButton.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setHover(null);setImmersive(false);}if(e.key==='Tab'){
   const nodes=[...container.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.getBoundingClientRect().width>0);
   const index=nodes.indexOf(document.activeElement as HTMLElement);e.preventDefault();nodes[(index+(e.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();
  }};document.addEventListener('keydown',key,true);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key,true);if(before?.isConnected)before.focus({preventScroll:true});};
 },[immersive]);
 const provinces=useMemo(()=>geo?provinceIndex(geo,profiles,regions):[],[geo,profiles,regions]);
 const hoverProvince=hover?.kind==='province'?provinces.find(p=>p.id===hover.id):null;
 const hoverCity=hover?.kind==='city'?cities.find(c=>c.id===hover.id):null;
 useEffect(()=>{if(cached){setGeo(cached);return;}const control=new AbortController();setError(false);
  fetch('/data/nation/v3.1/china.geojson',{signal:control.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then((value:AtlasCollection)=>{if(value.type!=='FeatureCollection'||!value.features?.length)throw Error();cached=value;setGeo(value);}).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>control.abort();
 },[retry]);
 const current=regions.find(r=>r.id===activeRegion)??regions[0];
 const members=useMemo(()=>cities.filter(c=>current.memberCityIds.includes(c.id)),[cities,current]);
 const complete=!loading&&members.length===current.memberCityIds.length;
 const stats=regionSummary(members),amount=gdpFormat(stats.gdp);
 const paths=useMemo(()=>geo?.features.map((f,i)=>({key:String(f.properties.id??i),name:String(f.properties.name??''),provinceId:f.properties.kind==='province'?String(f.properties.adcode??f.properties.id):null,line:f.properties.kind==='maritime-line'||f.geometry.type.includes('Line'),main:main.path(f),inset:inset.path(f)}))??[],[geo]);
 const anchors=regions.map(r=>({region:r,point:regionAnchor(r,cities)})).filter((r):r is {region:RegionConfig;point:Position}=>r.point!==null);
 const zoomTo=(value:number)=>{setZoom(Math.max(1,Math.min(2.5,value)));if(value<=1)setPan([0,0]);};
 return <section ref={container} className={`nation-atlas ${immersive?'atlas-immersive':''}`} role={immersive?'dialog':undefined} aria-modal={immersive||undefined} aria-label="全国城市探索地图">
  <div className="atlas-map-pane">
   <div className="atlas-map-heading"><span><i/> 已接入城市分布</span><div className="atlas-heading-actions"><small>点省份 · 看城市 · 探索范围</small><button ref={focusButton} aria-label={immersive?'退出专注地图':'专注地图'} onClick={()=>{setHover(null);setImmersive(v=>!v);}}>{immersive?<Minimize2 size={14}/>:<Maximize2 size={14}/>}<span>{immersive?'退出 · Esc':'专注地图'}</span></button></div></div>
   {!geo?<div className="atlas-placeholder" role="status"><MapPinned size={30}/><p>{error?'地图读取失败，本地城市数据仍可探索。':'正在展开城市地图…'}</p>{error&&<button className="outline-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>重试地图</button>}</div>:
   <svg className={`atlas-svg ${zoom>1?'is-zoomed':''}`} viewBox="0 0 900 630" aria-label="中国省级地图、已接入城市与南海诸岛附图" onPointerDown={e=>{suppressClick.current=false;if(zoom<=1||(e.target as Element).closest('[data-region], [data-city]'))return;const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;const p=e.currentTarget.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(matrix.inverse());drag.current={x:q.x,y:q.y,clientX:e.clientX,clientY:e.clientY,pan};}} onPointerMove={e=>{if(!drag.current)return;if(Math.hypot(e.clientX-drag.current.clientX,e.clientY-drag.current.clientY)<6&&!suppressClick.current)return;suppressClick.current=true;setHover(null);e.currentTarget.setPointerCapture(e.pointerId);const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;const p=e.currentTarget.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(matrix.inverse());setPan([Math.max(-380,Math.min(380,drag.current.pan[0]+q.x-drag.current.x)),Math.max(-260,Math.min(260,drag.current.pan[1]+q.y-drag.current.y))]);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;suppressClick.current=true;}} onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
    <defs><linearGradient id={`${uid}-land`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#25574c"/><stop offset="1" stopColor="#163c36"/></linearGradient><radialGradient id={`${uid}-ocean`}><stop stopColor="#1a3933"/><stop offset="1" stopColor="#0b201e"/></radialGradient><filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter><clipPath id={`${uid}-main`}><rect x="0" y="0" width="900" height="626" rx="12"/></clipPath><clipPath id={`${uid}-inset`}><rect x="727" y="414" width="154" height="191" rx="6"/></clipPath></defs>
    <rect width="900" height="630" fill={`url(#${uid}-ocean)`}/>
    <g clipPath={`url(#${uid}-main)`}><g transform={`translate(${450+pan[0]},${315+pan[1]}) scale(${zoom}) translate(-450,-315)`}>
     <g className="atlas-grid">{graticule.map((p,i)=><path d={line(p)} key={i}/>)}</g>
     <g className="atlas-land">{paths.map(p=>{const item=provinces.find(a=>a.id===p.provinceId);return <path key={p.key} d={p.main} data-province={p.provinceId??undefined} role={item?'button':undefined} tabIndex={item?0:undefined} aria-label={item?`探索${item.name}，${item.cityIds.length}座已接入城市`:undefined} aria-pressed={item?province?.id===item.id:undefined} className={p.line?'atlas-boundary-line':`atlas-province ${province?.id===p.provinceId?'selected':''} ${hoverProvince?.id===p.provinceId?'hovered':''}`} fill={p.line?'none':`url(#${uid}-land)`} fillRule="evenodd" onPointerEnter={e=>{if(item&&e.pointerType!=='touch'&&!drag.current)setHover({kind:'province',id:item.id});}} onPointerLeave={()=>setHover(null)} onFocus={()=>{if(item)setHover({kind:'province',id:item.id});}} onBlur={()=>setHover(null)} onClick={()=>{if(item){setHover(null);onProvince(item);}}} onKeyDown={e=>{if(item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setHover(null);onProvince(item);}if(e.key==='Escape')setHover(null);}}><title>{p.name}</title></path>;})}</g>
     <g className="atlas-city-dots">{cities.map(c=>{const [x,y]=main.project(c.coordinate),active=province?provinceOf(c.id)===province.id:current.memberCityIds.includes(c.id);return <g key={c.id} role="button" tabIndex={active?0:-1} aria-label={`查看${c.name}`} data-city={c.id} onPointerEnter={e=>{if(e.pointerType!=='touch')setHover({kind:'city',id:c.id});}} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover({kind:'city',id:c.id})} onBlur={()=>setHover(null)} onClick={()=>{const r=current.memberCityIds.includes(c.id)?current:regions.find(r=>r.memberCityIds.includes(c.id));if(r)onSelect(r.id,c.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=current.memberCityIds.includes(c.id)?current:regions.find(r=>r.memberCityIds.includes(c.id));if(r)onSelect(r.id,c.id);}}} className={active?'active':''} transform={`translate(${x},${y})`}><circle r="9" className="city-hit"/><circle r={active?8:3} className="city-halo"/><circle r={active?3.4:1.8} className="city-core"/><title>{c.name} · {c.dataYear} GDP {number(c.gdp)}亿元</title></g>;})}</g>
     {anchors.map(({region:r,point})=>{const [x,y]=main.project(point),[ox,oy]=offsets[r.id]??[34,-25],active=!province&&r.id===current.id,tx=x+ox,ty=y+oy;return <g key={r.id} role="button" tabIndex={0} data-region={r.id} aria-label={`预览${r.coverageLabel}`} aria-pressed={active} className={`atlas-marker ${active?'active':''}`} onClick={()=>onActive(r.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onActive(r.id);}}}>
      <path className="atlas-leader" d={`M${x},${y}L${tx},${ty}`}/><circle className="atlas-halo" cx={x} cy={y} r={active?15:9} filter={`url(#${uid}-glow)`}/><circle className="atlas-anchor" cx={x} cy={y} r={active?5:3.4}/>
      <rect className="atlas-label-bg" x={tx-40} y={ty-15} width="80" height="30" rx="15"/><text x={tx} y={ty+4} textAnchor="middle">{r.name}</text>
     </g>;})}
     <text className="atlas-sea-label" x="832" y="360">东 海</text>
    </g></g>
    <g className="atlas-inset"><rect x="721" y="389" width="166" height="224" rx="8"/><text x="735" y="406">南海诸岛</text><g clipPath={`url(#${uid}-inset)`}>{paths.map(p=><path key={p.key} d={p.inset} className={p.line?'atlas-boundary-line':''} fill={p.line?'none':'#234b42'} fillRule="evenodd"/>)}</g></g>
    <g className="atlas-legend"><circle cx="110" cy="602" r="3"/><text x="122" y="606">已接入城市</text><text x="110" y="622">亮点位置来自城市代表点；区域入口使用成员中心</text></g>
   </svg>}
   {(hoverProvince||hoverCity)&&<div className="atlas-inspection" role="status"><span className="eyebrow">{hoverCity?'CITY SNAPSHOT':'PROVINCE COVERAGE'}</span><strong>{hoverCity?.name??hoverProvince?.name}</strong>{hoverCity?<><dl><dt>GDP · {hoverCity.dataYear} 全年</dt><dd>{number(hoverCity.gdp,0)} 亿元</dd><dt>官方实际增速</dt><dd>{number(hoverCity.growth,1)}%</dd><dt>年末常住人口</dt><dd>{hoverCity.population==null?'暂缺':`${number(hoverCity.population,2)} 万人`}</dd></dl><small>官方统计 · 点击进入城市</small></>:<><p>{loading?'正在读取数据':hoverProvince!.cityIds.length?`已接入 ${hoverProvince!.cityIds.length} 座城市`:'暂无已接入城市'}</p><small>点击省面查看覆盖与城市 · 不代表全省统计</small></>}</div>}
   <div className="atlas-map-tools"><button onClick={()=>zoomTo(zoom+.35)} aria-label="放大全国地图" disabled={zoom>=2.5}><Plus size={16}/></button><button onClick={()=>zoomTo(zoom-.35)} aria-label="缩小全国地图" disabled={zoom<=1}><Minus size={16}/></button><button onClick={()=>{setZoom(1);setPan([0,0]);}} aria-label="重置全国地图"><RotateCcw size={15}/></button></div>
   <div className="atlas-map-note"><span>省级边界参考 · {zoom>1?'可拖动平移 · 点省面筛选':'点选省面或光点开始探索'}</span><span><a href="/data/nation/v3.1/manifest.json" target="_blank" rel="noreferrer">地图来源</a><a href="/data/nation/china-standard-map.jpg" target="_blank" rel="noreferrer">标准图参考</a></span></div>
  </div>
  {province?<ProvincePreview province={province} cities={cities} regions={regions} loading={loading} onSelect={onSelect} onActive={onActive} onClear={()=>onProvince(null)}/>:<aside className="atlas-preview" aria-label="区域预览">
   <div className="atlas-preview-visual"><img key={current.id} src={current.theme.sceneUrl.replace('.webp','-mobile.webp')} alt=""/><span>AI 场景示意</span></div>
   <div className="atlas-preview-body"><span className="eyebrow">REGION IN FOCUS · {members[0]?.dataYear??2025}</span><h2>{current.coverageLabel}</h2><p className="atlas-preview-members">{members.map(c=>c.name).join(' · ')||'正在读取成员城市'}</p>
    <div className="atlas-preview-stat"><span>本范围 GDP 合计<small>现价 · 全年</small></span><strong>{complete?amount.value:'—'}<small>{complete?amount.unit:loading?'加载中':'暂不可用'}</small></strong></div>
    <div className="atlas-preview-substats"><div><span>常住人口</span><b>{!complete?'—':stats.population===null?'暂缺':number(stats.population,1)}<small>{!complete?'等待完整统计':stats.population===null?'部分城市尚缺来源':'万人 · 年末'}</small></b></div><div><span>已接入成员</span><b>{current.memberCityIds.length}<small>座城市</small></b></div></div>
    <button className="atlas-enter" disabled={!complete} onClick={()=>onSelect(current.id)}>探索{current.name}<ArrowUpRight size={18}/></button>
    <div className="atlas-city-shortcuts"><span>直接查看城市</span><div>{members.map(c=><button key={c.id} onClick={()=>onSelect(current.id,c.id)}>{c.name}<ArrowUpRight size={11}/></button>)}</div></div>
    <small className="atlas-collection-note">仅含上述成员，精选集合不代表完整城市群。</small>
   </div>
  </aside>}
  <div className="atlas-region-tabs" role="group" aria-label="切换地图预览区域">{regions.map(r=><button key={r.id} aria-pressed={!province&&r.id===current.id} onClick={()=>onActive(r.id)}><i/>{r.name}<small>{r.memberCityIds.length}</small></button>)}</div>
 </section>;
}

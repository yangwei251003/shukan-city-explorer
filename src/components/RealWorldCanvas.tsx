import {useEffect,useRef,useState} from 'react';
import {WebGLRenderer,Scene,Color,PerspectiveCamera,Sphere,Vector3,SRGBColorSpace,ACESFilmicToneMapping} from 'three';
import {cityPresentation,type CityMood} from '../lib/cityPresentation';
import {cityQuality} from '../lib/cityQuality';
import {studioEnvironment} from '../lib/studioEnvironment';
import {needsDrawableChildren} from '../lib/drawableGroups';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {isolateModelQueues} from '../lib/modelQueues';
import {ReorientationPlugin,GLTFExtensionsPlugin} from '3d-tiles-renderer/three/plugins';
import {RotateCcw,Rotate3D,Plus,Minus,Maximize2,LoaderCircle,RefreshCw} from 'lucide-react';
import type {RealWorldModel} from '../lib/realWorld';

type Controls={reset:()=>void;zoom:(v:number)=>void;rotate:()=>void;quality:(fine:boolean)=>void;focus:(index:number)=>void;overhead:()=>void;mood:(mood:CityMood)=>void;motion:()=>void};
export default function RealWorldCanvas({model}:{model:RealWorldModel}){
 const host=useRef<HTMLDivElement>(null),frame=useRef<HTMLElement>(null),api=useRef<Controls|null>(null);
 const [retry,setRetry]=useState(0),[phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[notice,setNotice]=useState('正在展开真实模型…');
 const [spinning,setSpinning]=useState(false),[fine,setFine]=useState(true),[loaded,setLoaded]=useState(0),[fullscreen,setFullscreen]=useState(false);
 const [view,setView]=useState('全景'),[mood,setMood]=useState<CityMood>('day'),[motion,setMotion]=useState(true);
 useEffect(()=>{
  const changed=()=>setFullscreen(document.fullscreenElement===frame.current);
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&document.fullscreenElement===frame.current)document.exitFullscreen().catch(()=>setNotice('可点击全屏按钮返回页面'));};
  document.addEventListener('fullscreenchange',changed);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('fullscreenchange',changed);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>{
  let alive=true,closed=false,stopTiles=()=>{};const disposers:Array<()=>void>=[];
  const cleanup=()=>{if(closed)return;closed=true;stopTiles();for(const dispose of disposers.reverse())dispose();api.current=null;};
  const abort=new AbortController();setPhase('loading');setNotice('正在展开真实模型…');setLoaded(0);setSpinning(false);setFine(true);setView('全景');setMood('day');
  (async()=>{
   const response=await fetch(model.url,{signal:abort.signal});if(!response.ok)throw Error('本地模型文件读取失败');
   const root=await response.json();if(root?.asset?.version!=='1.0'||!root.root?.boundingVolume)throw Error('模型入口尚未通过兼容校验');if(!alive)return;
   const el=host.current!,canvas=document.createElement('canvas');const context=canvas.getContext('webgl2',{antialias:true,alpha:false});
   if(!context)throw Error('当前设备未提供 WebGL 2，可返回数据探索');
   const mobile=window.matchMedia('(max-width:700px)').matches,renderer=new WebGLRenderer({canvas,context,antialias:true});
   disposers.push(()=>{renderer.dispose();renderer.forceContextLoss();canvas.remove();});
   renderer.setPixelRatio(Math.min(devicePixelRatio,cityQuality(true,mobile).pixelRatioLimit));renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
   const scene=new Scene();scene.background=new Color('#162c34');const camera=new PerspectiveCamera(45,1,1,10000),controls=new OrbitControls(camera,canvas);
   disposers.push(()=>controls.dispose());
   controls.enableDamping=true;controls.dampingFactor=.09;controls.maxPolarAngle=Math.PI*.485;controls.minPolarAngle=.08;controls.autoRotateSpeed=.6;
   
   const environment=studioEnvironment();scene.environment=environment;scene.environmentIntensity=.45;
   disposers.push(()=>environment.dispose());
   const presentation=cityPresentation(scene,renderer,model,mobile);disposers.push(()=>presentation.dispose());setMotion(presentation.enabled);
   const reduced=matchMedia('(prefers-reduced-motion: reduce)'),motionPreference=()=>{presentation.setEnabled(!reduced.matches);setMotion(presentation.enabled);};reduced.addEventListener('change',motionPreference);disposers.push(()=>reduced.removeEventListener('change',motionPreference));
   const tiles=new TilesRenderer(model.url),draco=new DRACOLoader();draco.setDecoderPath('/models/decoders/draco/').setWorkerLimit(mobile?1:2);
   stopTiles=()=>tiles.dispose();disposers.push(()=>draco.dispose());
   // The library's default queues/cache are shared. Keep aborted worker jobs in their owning view
   // so rapid switches cannot block a new city's parser or consume another view's cache budget.
   isolateModelQueues(tiles);
   const ktx=new KTX2Loader();ktx.setTranscoderPath('/models/decoders/basis/').setWorkerLimit(mobile?1:2).detectSupport(renderer);
   disposers.push(()=>ktx.dispose());
   tiles.registerPlugin(new ReorientationPlugin());tiles.registerPlugin(new GLTFExtensionsPlugin({dracoLoader:draco,ktxLoader:ktx,autoDispose:false}));
   tiles.registerPlugin({name:'drawable-group-refinement',calculateTileViewError(tile:Parameters<typeof needsDrawableChildren>[0],target:{error:number}){
    if(!needsDrawableChildren(tile))return false;target.error=Infinity;return true;
   }});
   tiles.errorTarget=cityQuality(true,mobile).tileError;tiles.lruCache.minBytesSize=(mobile?64:128)*1024**2;tiles.lruCache.maxBytesSize=(mobile?96:192)*1024**2;
   tiles.lruCache.minSize=80;tiles.lruCache.maxSize=250;tiles.downloadQueue.maxJobsPerOrigin=4;tiles.parseQueue.maxJobs=1;
   tiles.setCamera(camera);scene.add(tiles.group);el.append(canvas);
   let radius=300,ready=false,presented=false,fatal=false,count=0,failures=0,raf=0,last=0,inView=true;
   let flight:{start:number;from:Vector3;to:Vector3;fromTarget:Vector3;toTarget:Vector3}|null=null;
   const home=new Vector3(),target=new Vector3(),reset=()=>{flight=null;if(!ready)return;controls.target.copy(target);camera.position.copy(home);controls.update();setView('全景');};
   const zoom=(factor:number)=>{flight=null;const offset=camera.position.clone().sub(controls.target),distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()*factor));camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();};
   const fly=(point:Vector3,position:Vector3)=>{if(reduced.matches){controls.target.copy(point);camera.position.copy(position);controls.update();return;}flight={start:performance.now(),from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),toTarget:point};};
   const interruptFlight=()=>{flight=null;};controls.addEventListener('start',interruptFlight);disposers.push(()=>controls.removeEventListener('start',interruptFlight));
   const rootLoaded=()=>{if(!alive||closed)return;
    tiles.group.updateMatrixWorld(true);const sphere=new Sphere();if(!tiles.getBoundingSphere(sphere)||!Number.isFinite(sphere.radius)||sphere.radius<=0){fatal=true;setPhase('error');setNotice('模型范围无效，请重试');return;}
    sphere.applyMatrix4(tiles.group.matrixWorld);radius=sphere.radius;target.copy(sphere.center);
    if(model.surface)target.set(0,0,model.surface.groundZ+15).applyMatrix4(tiles.group.matrixWorld);
    const fit=(mobile?1.02:1)/Math.min(1,camera.aspect);
    const direction=new Vector3(...(model.cameraDirection??[1.1,.95,1.5])).normalize();
    home.copy(target).add(direction.multiplyScalar(radius*1.78*fit));
    // City scenes need metre-scale depth precision at kilometre distances; a tiny near
    // plane causes water/ground z-fighting even when their surfaces are separated.
    camera.near=Math.max(.5,radius/180);camera.far=radius*16;camera.updateProjectionMatrix();controls.minDistance=radius*.10;controls.maxDistance=radius*6;ready=true;presentation.fit(target,radius,p=>new Vector3(...p).applyMatrix4(tiles.group.matrixWorld));reset();
   };tiles.addEventListener('load-root-tileset',rootLoaded);disposers.push(()=>tiles.removeEventListener('load-root-tileset',rootLoaded));
   tiles.addEventListener('load-model',event=>{if(alive){presentation.decorate(event.scene);count++;setLoaded(count);if(!presented)setNotice(model.kind==='photogrammetry'?'正在展开地表与摄影建筑…':'正在绘制地表与建筑…');}});
   tiles.addEventListener('load-error',()=>{if(!alive)return;failures++;if(!count){setPhase('error');}setNotice(count?'部分模型读取失败，请重试；已显示内容仍可查看':'模型文件读取失败，请重新加载实景');});
   const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(w&&h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();tiles.setResolutionFromRenderer(camera,renderer);}};
   const observer=new ResizeObserver(resize);disposers.push(()=>observer.disconnect());observer.observe(el);resize();
   const visibility=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===el)inView=entry.isIntersecting;});disposers.push(()=>visibility.disconnect());visibility.observe(el);
   const changed=()=>{el.dataset.camera=camera.position.toArray().map(v=>v.toFixed(1)).join(',');};controls.addEventListener('change',changed);
   api.current={reset,zoom,mood:value=>{presentation.setMood(value);setMood(value);},motion:()=>{presentation.setEnabled(!presentation.enabled);setMotion(presentation.enabled);},rotate:()=>{controls.autoRotate=!controls.autoRotate;setSpinning(controls.autoRotate);},quality:isFine=>{const quality=cityQuality(isFine,mobile);tiles.errorTarget=quality.tileError;renderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatioLimit));presentation.setQuality(isFine);resize();setFine(isFine);},
    focus:index=>{const p=model.landmarks?.[index];if(!p||!ready)return;const point=new Vector3(...p.position);point.z-=p.height*.5;point.applyMatrix4(tiles.group.matrixWorld);fly(point,point.clone().add(new Vector3(...(model.cameraDirection??[1,1,1.5])).normalize().multiplyScalar((p.viewDistance??Math.max(220,p.height*1.7))/Math.min(1,camera.aspect))));setView(p.name);},
    overhead:()=>{flight=null;if(!ready)return;controls.target.copy(target);camera.position.copy(target).add(new Vector3(0,radius*2.55/Math.min(1,camera.aspect),radius*.06));controls.update();setView('俯瞰');}
   };
   const key=(e:KeyboardEvent)=>{if(document.activeElement!==el)return;
    flight=null;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','r','R',' '].includes(e.key))e.preventDefault();else return;
    if(e.key==='r'||e.key==='R')reset();else if(e.key==='+'||e.key==='=')zoom(.85);else if(e.key==='-')zoom(1.18);else if(e.key===' ')api.current?.rotate();else{
     const v=camera.position.clone().sub(controls.target);if(e.key==='ArrowLeft'||e.key==='ArrowRight')v.applyAxisAngle(new Vector3(0,1,0),e.key==='ArrowLeft'?.12:-.12);else v.y+=e.key==='ArrowUp'?radius*.06:-radius*.06;
     camera.position.copy(controls.target).add(v);controls.update();
    }
   };el.addEventListener('keydown',key);disposers.push(()=>el.removeEventListener('keydown',key));
   const lost=(e:Event)=>{e.preventDefault();fatal=true;if(alive){setPhase('error');setNotice('三维图形环境已中断，可重试或返回城市数据');}};canvas.addEventListener('webglcontextlost',lost);disposers.push(()=>canvas.removeEventListener('webglcontextlost',lost));
   const render=(now:number)=>{if(!alive)return;raf=requestAnimationFrame(render);if(now-last<(mobile?33:16)||document.hidden||!inView||fatal)return;const delta=(now-last)/1000;last=now;el.dataset.atmosphereTime=presentation.update(delta).toFixed(3);if(flight){const t=reduced.matches?1:Math.min(1,(now-flight.start)/850),ease=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,ease);if(t===1)flight=null;}controls.update();camera.updateMatrixWorld();tiles.update();renderer.render(scene,camera);
    const visible=tiles.visibleTiles.size;el.dataset.visibleModels=String(visible);
    const photographyVisible=[...tiles.visibleTiles].some(t=>!(t.content?.uri??t.content?.url??'').endsWith('context.b3dm'));
    if(!presented&&visible>0&&(model.kind!=='photogrammetry'||photographyVisible||failures>0)){presented=true;setPhase('ready');setNotice(failures?'部分模型读取失败，请重试；已显示内容仍可查看':'地理场景已展开 · 可旋转、缩放与选择地标');}
   };raf=requestAnimationFrame(render);
   disposers.push(()=>{cancelAnimationFrame(raf);controls.removeEventListener('change',changed);});
  })().catch(e=>{cleanup();if(alive&&e.name!=='AbortError'){setPhase('error');setNotice(e.message||'模型加载失败，可重试');}});
  return()=>{alive=false;abort.abort();cleanup();};
 },[model.id,model.url,retry]);
 return <section className="real-world-viewer" ref={frame} aria-label={`${model.city}${model.name}模型查看器`}>
  <div className="real-world-canvas" ref={host} tabIndex={0} data-model-state={phase} data-loaded-models={loaded} role="application" aria-label={`${model.name}三维实景：方向键旋转，加减键缩放，R复位，空格切换旋转`}/>
  <div className="real-world-label"><span>{model.kind==='photogrammetry'?'倾斜摄影 × 地理环境':model.kind==='reconstruction'?'真实地理 × 地标复原':model.kind==='landmark'?'真实地标 · 人工建模':'真实建筑 · 结构白模'}</span><strong>{view==='全景'||view==='俯瞰'?model.name:view}</strong><small>{view==='全景'||view==='俯瞰'?model.coverage:`${model.landmarks?.find(p=>p.name===view)?.height??''} 米 · 拖动查看建筑的不同侧面`}</small></div>
  <div className="real-world-perspectives" role="group" aria-label="场景视角"><button aria-pressed={view==='全景'} onClick={()=>api.current?.reset()} disabled={phase!=='ready'}>全景</button><button aria-pressed={view==='俯瞰'} onClick={()=>api.current?.overhead()} disabled={phase!=='ready'}>俯瞰</button>{model.landmarks?.map((p,i)=><button key={p.name} aria-pressed={view===p.name} onClick={()=>api.current?.focus(i)} disabled={phase!=='ready'}>{p.name}</button>)}</div>
  <div className="real-world-atmosphere" role="group" aria-label="场景氛围"><button aria-pressed={mood==='day'} onClick={()=>api.current?.mood('day')} disabled={phase!=='ready'}>日景</button><button aria-pressed={mood==='dusk'} onClick={()=>api.current?.mood('dusk')} disabled={phase!=='ready'}>暮色</button><span/><button aria-pressed={motion} onClick={()=>api.current?.motion()} disabled={phase!=='ready'}>{motion?'暂停环境':'播放环境'}</button><small>光照与动效为氛围演绎</small></div>
  {phase==='loading'&&<div className="real-world-loading" role="status"><LoaderCircle className="spin" size={26}/><strong>从平面，走进城市。</strong><p>{notice}</p></div>}
  {phase==='error'&&<div className="real-world-loading real-world-error" role="alert"><strong>暂时无法展开模型</strong><p>{notice}</p><button className="outline-button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>重新加载实景</button></div>}
  <div className="real-world-toolbar"><button aria-label="实景视角复位" onClick={()=>api.current?.reset()} disabled={phase!=='ready'}><RotateCcw size={16}/></button><button aria-label="放大实景" onClick={()=>api.current?.zoom(.8)} disabled={phase!=='ready'}><Plus size={16}/></button><button aria-label="缩小实景" onClick={()=>api.current?.zoom(1.25)} disabled={phase!=='ready'}><Minus size={16}/></button><button aria-label="自动旋转实景" aria-pressed={spinning} onClick={()=>api.current?.rotate()} disabled={phase!=='ready'}><Rotate3D size={16}/></button><button aria-label={fullscreen?'退出实景全屏':'实景查看器全屏'} aria-pressed={fullscreen} onClick={()=>{const action=fullscreen?document.exitFullscreen():frame.current?.requestFullscreen?.();action?.catch(()=>setNotice('全屏暂不可用，可继续在页面查看'));}}><Maximize2 size={16}/></button><button className="real-world-quality" aria-pressed={fine} onClick={()=>api.current?.quality(!fine)} disabled={phase!=='ready'}>{fine?'精细优先':'流畅优先'}</button></div>
  <div className="real-world-viewer-note"><span role="status">{phase==='ready'?notice:'本地资源 · 按需加载'}</span><small>© Esri / OSM contributors · {fullscreen?'Esc 退出全屏':'拖动旋转 · R 复位'}</small>{phase==='ready'&&notice.includes('失败')&&<button onClick={()=>setRetry(n=>n+1)}>重试</button>}</div>
 </section>;
}

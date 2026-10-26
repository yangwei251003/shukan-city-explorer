import {Scene,WebGLRenderer,Object3D,Mesh,MeshStandardMaterial,MeshBasicMaterial,ShadowMaterial,DirectionalLight,HemisphereLight,Color,Vector3,DataTexture,RGBAFormat,RepeatWrapping,PCFShadowMap,Group,BoxGeometry,ConeGeometry,TextureLoader,LinearFilter,BufferGeometry,Float32BufferAttribute} from 'three';
import {Water} from './vendor/CityWater.js';
import {citySky} from './citySky';
import {cityQuality} from './cityQuality';
import waterNormalsUrl from '../assets/waternormals.jpg';
import {routeSample,advanceAtmosphere} from './cityMotion';
import type {RealWorldModel} from './realWorld';

export type CityMood='day'|'dusk';

/** Local presentation only. Roads and shorelines are geographic; motion/light are illustrative. */
export function cityPresentation(scene:Scene,renderer:WebGLRenderer,model:RealWorldModel,mobile:boolean){
 const owned:Array<()=>void>=[],windows=new Set<MeshStandardMaterial>(),facades=new Set<MeshStandardMaterial>(),grounds=new Set<MeshBasicMaterial>();
 let quality=cityQuality(true,mobile);
 const waters=new Set<Water>(),decorated=new WeakSet<Object3D>();
 const hemi=new HemisphereLight(0xc9e6ff,0x56614c,1.05),sun=new DirectionalLight(0xfff4df,2.1);
 sun.position.set(-1300,1800,900);sun.castShadow=true;
 sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);sun.shadow.bias=-.00015;sun.shadow.normalBias=1.2;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;renderer.shadowMap.autoUpdate=false;
 scene.add(hemi,sun,sun.target);
 const sky=citySky();scene.background=sky.texture;owned.push(()=>sky.texture.dispose());
 let reflecting=false;
 let mood:CityMood='day',time=0,enabled=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fallback=waterNormals();const normals=new TextureLoader().load(waterNormalsUrl,texture=>{texture.wrapS=texture.wrapT=RepeatWrapping;},undefined,()=>{for(const water of waters)water.material.uniforms.normalSampler.value=fallback;});normals.wrapS=normals.wrapT=RepeatWrapping;owned.push(()=>{normals.dispose();fallback.dispose();});
 const stage=new Group();scene.add(stage);
 const moving:Array<{group:Group;path:[number,number,number][];offset:number;speed:number;boat:boolean}>=[];
 const carBody=new BoxGeometry(1.85,1.05,4.6),carRoof=new BoxGeometry(1.55,.6,2.35),boatBody=new BoxGeometry(5,2,20),boatCabin=new BoxGeometry(3.6,2.6,8),bow=new ConeGeometry(2.5,4,3);
 const paints=[0xc5d5dc,0xe5e0cb,0x456c82,0x9c4941].map(color=>new MeshStandardMaterial({color,roughness:.32,metalness:.3}));
 const glazing=new MeshStandardMaterial({color:0x324854,roughness:.18,metalness:.6});
 for(const g of [carBody,carRoof,boatBody,boatCabin,bow])owned.push(()=>g.dispose());
 for(const m of [...paints,glazing])owned.push(()=>m.dispose());
 function vehicle(path:[number,number,number][],offset:number,boat:boolean,index:number){
  const group=new Group(),body=new Mesh(boat?boatBody:carBody,paints[index%4]);body.position.y=boat?1:.6;body.castShadow=false;
  const top=new Mesh(boat?boatCabin:carRoof,boat?paints[0]:glazing);top.position.set(0,boat?3:1.38,boat?-2:0);top.castShadow=false;
  group.add(body,top);
  if(boat){const front=new Mesh(bow,paints[index%4]);front.rotation.x=Math.PI/2;front.position.set(0,1,11);group.add(front);}
  stage.add(group);moving.push({group,path,offset,speed:boat?4.2:8.5,boat});
 }
 model.atmosphere?.roads.forEach((r,i)=>{vehicle(r.points,i*51,false,i);vehicle(r.points,i*51+110,false,i+1);});
 if((model.atmosphere?.waterRoute.length??0)>1)for(let i=0;i<3;i++)vehicle(model.atmosphere!.waterRoute,i*730,true,i);
 const localToWorld=(p:number[])=>new Vector3(p[0],p[2],-p[1]);
 // The tiles' ENU reorientation is supplied after the root becomes available.
 let coordinate:(p:number[])=>Vector3=localToWorld;
 function fit(center:Vector3,radius:number,transform:(p:number[])=>Vector3){
  coordinate=transform;const r=radius*.93;
  sun.target.position.copy(center);sun.position.copy(center).add(new Vector3(-r,r*1.4,r*.7));
  Object.assign(sun.shadow.camera,{left:-r,right:r,top:r,bottom:-r,near:1,far:r*5});sun.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate=true;update(0);
 }
 function setMood(value:CityMood){
  mood=value;const night=value==='dusk';sky.update(value);
  hemi.intensity=night?.48:1.05;sun.intensity=night?1.1:2.1;sun.color.set(night?0xffba80:0xfff4df);
  scene.environmentIntensity=night?.5:.85;renderer.toneMappingExposure=night?.78:.82;
  for(const material of windows){material.emissive.setRGB(1,.77,.46);material.emissiveIntensity=night?.75:0;}
  for(const material of grounds)material.color.setScalar(night?.42:1);
  for(const water of waters){water.material.uniforms.sunColor.value.set(night?0xffca9d:0xfff1d3);water.material.uniforms.waterColor.value.set(night?0x183a47:0x43686a);}
  renderer.shadowMap.needsUpdate=true;
 }
 function setQuality(fine:boolean){
  const next=cityQuality(fine,mobile);
  if(quality.shadowSize!==next.shadowSize){
   sun.shadow.map?.dispose();sun.shadow.map=null;
   sun.shadow.mapSize.set(next.shadowSize,next.shadowSize);
  }
  for(const water of waters)water.setReflectionSize(next.reflectionSize);
  for(const material of facades)if(material.map){material.map.anisotropy=Math.min(next.anisotropy,renderer.capabilities.getMaxAnisotropy());material.map.needsUpdate=true;}
  quality=next;renderer.shadowMap.needsUpdate=true;
 }
 function decorate(root:Object3D){
  if(decorated.has(root))return;decorated.add(root);
  // Add after traversal so scene mutation cannot visit newly inserted mirror meshes.
  const meshes:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
  for(const mesh of meshes){
   const name=mesh.name;
   if(name==='water'){
    // A water polygon is split by height before reflecting; Hefei's repaired lake
    // is higher than its smaller surrounding ponds. A single plane would be wrong.
    const g=mesh.geometry.clone(),axis=model.id.startsWith('xian')?'Z':'Y';
    if(axis==='Y')g.rotateX(Math.PI/2);
    const pos=g.getAttribute('position'),idx=g.index,groups=new Map<number,number[]>();
    for(let i=0;i<(idx?.count??pos.count);i+=3){
     const face=[0,1,2].map(j=>idx?idx.getX(i+j):i+j),z=Math.round(pos.getZ(face[0])*100)/100;
     const vertices=groups.get(z)??[];for(const j of face)vertices.push(pos.getX(j),pos.getY(j),0);groups.set(z,vertices);
    }
    for(const [z,vertices] of groups){
     const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
     const water=new Water(geometry,{textureWidth:quality.reflectionSize,textureHeight:quality.reflectionSize,waterNormals:normals,sunDirection:sun.position.clone().normalize(),sunColor:0xfff1d3,waterColor:0x43686a,distortionScale:1.8});
     if(axis==='Y'){water.rotation.x=-Math.PI/2;water.position.y=z;}else water.position.z=z;
     let reflectionAt=-Infinity;const reflect=water.onBeforeRender;water.onBeforeRender=(...args)=>{const now=performance.now();if(reflecting||now-reflectionAt<quality.reflectionInterval)return;reflectionAt=now;reflecting=true;try{reflect.apply(water,args);}finally{reflecting=false;}};
     mesh.add(water);waters.add(water);
     // Water owns its reflection target; dispose() is provided by the r186 object.
     owned.push(()=>{waters.delete(water);water.dispose();geometry.dispose();});
    }
    g.dispose();mesh.material=new MeshBasicMaterial({visible:false});owned.push(()=>{(mesh.material as MeshBasicMaterial).dispose();});
   }else if(name==='ground'){
    if(mesh.material instanceof MeshBasicMaterial)grounds.add(mesh.material);
    const material=new ShadowMaterial({opacity:.32,depthWrite:false}),overlay=new Mesh(mesh.geometry,material);
    if(model.id.startsWith('xian'))overlay.position.z=.12;else overlay.position.y=.12;
    overlay.receiveShadow=true;mesh.add(overlay);owned.push(()=>material.dispose());
   }else if(name!=='base'){
    const material=mesh.material;
    if(material instanceof MeshStandardMaterial){
     mesh.castShadow=true;mesh.receiveShadow=true;
     facades.add(material);
     if(material.map)material.map.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());
     if(material.emissiveMap)windows.add(material);
     material.envMapIntensity=.8;if(material.normalMap)material.normalScale.set(.14,.14);
    }
   }
  }
  renderer.shadowMap.needsUpdate=true;setMood(mood);
 }
 function update(delta:number){
  time=advanceAtmosphere(time,delta,enabled);
  for(const water of waters)water.material.uniforms.time.value=time*.35;
  for(const item of moving){
   const sample=routeSample(item.path,time*item.speed+item.offset);if(!sample)continue;
   const p=coordinate(sample.position),ahead=coordinate([sample.position[0]+Math.sin(sample.heading),sample.position[1]+Math.cos(sample.heading),sample.position[2]]);
   item.group.position.copy(p);item.group.lookAt(ahead);
  }
  return time;
 }
 setMood('day');
 return {decorate,fit,setMood,setQuality,update,get enabled(){return enabled;},setEnabled(value:boolean){enabled=value;},dispose(){stage.removeFromParent();sun.shadow.dispose();scene.remove(hemi,sun,sun.target);for(const dispose of owned.reverse())dispose();windows.clear();facades.clear();grounds.clear();}};
}

function waterNormals(){
 const n=128,data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const a=x/n*Math.PI*2,b=y/n*Math.PI*2;
  const dx=.28*Math.cos(a*7+b*3)+.17*Math.sin(a*13-b*8),dy=.25*Math.sin(b*9+a*4)+.14*Math.cos(a*6-b*17),length=Math.hypot(dx,dy,1),i=(y*n+x)*4;
  data[i]=(dx/length*.5+.5)*255;data[i+1]=(dy/length*.5+.5)*255;data[i+2]=(1/length*.5+.5)*255;data[i+3]=255;
 }
 const texture=new DataTexture(data,n,n,RGBAFormat);texture.wrapS=texture.wrapT=RepeatWrapping;texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;return texture;
}

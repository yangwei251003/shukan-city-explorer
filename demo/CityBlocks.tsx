import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {buildingLayout} from './data.mjs';

export default function CityBlocks({seed,color}:{seed:number;color:string}) {
  const mount=useRef<HTMLDivElement>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const host=mount.current!;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError(true);return;}
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(42,1,0.1,100);
    camera.position.set(12,12,14);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.target.set(0,1,0);controls.enableDamping=true;controls.minDistance=9;controls.maxDistance=30;controls.maxPolarAngle=Math.PI*0.48;
    scene.add(new THREE.HemisphereLight(0xd9fff6,0x132225,2.5));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-8,15,5);scene.add(light);
    const geometries:THREE.BufferGeometry[]=[];
    const materials:THREE.Material[]=[];
    for(const b of buildingLayout(seed)) {
      const geometry=new THREE.BoxGeometry(b.width,b.height,b.depth);geometries.push(geometry);
      const material=new THREE.MeshStandardMaterial({color,metalness:0.15,roughness:0.5});materials.push(material);
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(b.x,b.height/2,b.z);scene.add(mesh);
      const edges=new THREE.EdgesGeometry(geometry);geometries.push(edges);
      const edgeMaterial=new THREE.LineBasicMaterial({color:0xc4fff1,transparent:true,opacity:0.22});materials.push(edgeMaterial);
      const line=new THREE.LineSegments(edges,edgeMaterial);line.position.copy(mesh.position);scene.add(line);
    }
    const groundGeometry=new THREE.BoxGeometry(12,0.2,12);geometries.push(groundGeometry);
    const groundMaterial=new THREE.MeshStandardMaterial({color:0x163333,roughness:1});materials.push(groundMaterial);
    const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.position.y=-0.18;scene.add(ground);
    const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','程序生成的合成建筑街区，可拖动旋转与滚轮缩放');
    resize();const observer=new ResizeObserver(resize);observer.observe(host);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
    return()=>{observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[seed,color]);
  return <div ref={mount} className="city-canvas">{error&&<p role="status">当前设备无法启用 WebGL。数据、比较和情景计算仍可使用。</p>}</div>;
}

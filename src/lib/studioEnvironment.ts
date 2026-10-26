import {CubeUVReflectionMapping,DataTexture,HalfFloatType,LinearFilter,RGBAFormat,DataUtils} from 'three';

// A small, analytical studio light atlas. This is viewer lighting, not captured city imagery.
// CubeUV layout follows Three r186's cube_uv_reflection_fragment, including padded faces and roughness levels.
// Baking this smooth radiance on the CPU avoids the Windows ANGLE GGX constant-folding warning (#32692).
export function studioEnvironment(){
 const size=32,width=336,height=128,data=new Uint16Array(width*height*4);
 const panels=[[.4,.9,.3,1.5],[-.7,.45,-.3,.7],[.3,.4,-.85,.9]];
 for(let mip=5;mip>=-2;mip--){
  const faceSize=Math.max(16,2**mip),extra=Math.max(0,4-mip),offsetX=extra*48,offsetY=4*(size-faceSize);
  for(let face=0;face<6;face++)for(let y=0;y<faceSize;y++)for(let x=0;x<faceSize;x++){
   const u=2*(x-1)/(faceSize-2)-1,v=2*(y-1)/(faceSize-2)-1;
   const d=[[1,v,u],[-u,1,-v],[-u,v,1],[-1,v,-u],[-u,-1,v],[u,v,-1]][face];
   const length=Math.hypot(...d);for(let i=0;i<3;i++)d[i]/=length;
   const sky=.35+.35*Math.max(0,d[1]),power=Math.max(2,14-(5-mip)*2);
   let radiance=sky;for(const p of panels){const n=Math.hypot(p[0],p[1],p[2]);radiance+=p[3]*Math.max(0,(d[0]*p[0]+d[1]*p[1]+d[2]*p[2])/n)**power;}
   const pixel=((offsetY+(face>2?faceSize:0)+y)*width+offsetX+(face%3)*faceSize+x)*4;
   // A cool sky and warmer lower hemisphere give glazing a readable change of
   // reflection as it turns. This is an analytical light rig, not city imagery.
   const upper=Math.max(0,d[1]),horizon=Math.exp(-Math.abs(d[1])*9);
   const azimuth=Math.atan2(d[2],d[0]),softness=Math.max(.12,(5-mip)*.12);
   const skyline=d[1]<.12?1-.24*Math.max(0,Math.sin(azimuth*13))*Math.exp(-Math.abs(d[1]+.04)/softness):1;
   data[pixel]=DataUtils.toHalfFloat((radiance*(1-.24*upper)+horizon*.12)*skyline);data[pixel+1]=DataUtils.toHalfFloat((radiance*(1-.08*upper)+horizon*.13)*skyline);data[pixel+2]=DataUtils.toHalfFloat((radiance*(1+.12*upper)+horizon*.16)*skyline);data[pixel+3]=DataUtils.toHalfFloat(1);
  }
 }
 const texture=new DataTexture(data,width,height,RGBAFormat,HalfFloatType);
 texture.mapping=CubeUVReflectionMapping;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return texture;
}

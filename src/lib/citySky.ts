import {DataTexture,RGBAFormat,LinearFilter,SRGBColorSpace} from 'three';

/** A tiny CPU gradient avoids uploading a mutable DOM canvas during a mood switch. */
export function citySky(){
 const pixels=new Uint8Array(256*4),texture=new DataTexture(pixels,1,256,RGBAFormat);
 texture.colorSpace=SRGBColorSpace;texture.minFilter=texture.magFilter=LinearFilter;
 function update(mood:'day'|'dusk'){
  const colors=(mood==='day'?['476879','7f9da9','bbcbd0']:['101b35','424961','877374']).map(hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)));
  for(let y=0;y<256;y++){
   // DataTexture rows start at the bottom, unlike a DOM canvas.
   const t=1-y/255,segment=t<.6?0:1,f=segment===0?t/.6:(t-.6)/.4;
   for(let c=0;c<3;c++)pixels[y*4+c]=Math.round(colors[segment][c]*(1-f)+colors[segment+1][c]*f);
   pixels[y*4+3]=255;
  }
  texture.needsUpdate=true;
 }
 update('day');return {texture,update};
}

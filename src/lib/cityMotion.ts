/** Travel at constant speed along mapped segments; no smoothing may cut a corner. */
export function routeSample(points:readonly (readonly number[])[],distance:number){
 if(points.length<2)return null;
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1],p[2]-points[i][2]));
 const total=lengths.reduce((a,b)=>a+b,0);if(!(total>0)||!Number.isFinite(distance))return null;
 // Ping-pong gives bounded motion with no visible teleport between disconnected ends.
 const cycle=((distance%(2*total))+2*total)%(2*total),reverse=cycle>total;
 let along=reverse?2*total-cycle:cycle;
 for(let i=0;i<lengths.length;i++){
  if(along<=lengths[i]||i===lengths.length-1){
   const t=lengths[i]?along/lengths[i]:0,a=points[i],b=points[i+1];
   return {position:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],heading:Math.atan2(b[0]-a[0],b[1]-a[1])+(reverse?Math.PI:0),total};
  }
  along-=lengths[i];
 }
 return null;
}

export function advanceAtmosphere(time:number,delta:number,enabled:boolean){
 return enabled?time+Math.max(0,Math.min(.1,delta)):time;
}

export type SpotlightHole={x:number;y:number;right:number;bottom:number};
export default function GuideSpotlight({hole,blocked=false}:{hole:SpotlightHole|null;blocked?:boolean}){
 return <>{hole?<><div className="guide-blocker" style={{inset:'0 0 auto 0',height:hole.y}}/><div className="guide-blocker" style={{top:hole.bottom,bottom:0,left:0,right:0}}/><div className="guide-blocker" style={{top:hole.y,height:hole.bottom-hole.y,left:0,width:hole.x}}/><div className="guide-blocker" style={{top:hole.y,height:hole.bottom-hole.y,left:hole.right,right:0}}/><div className="guide-highlight" style={{top:hole.y,left:hole.x,width:hole.right-hole.x,height:hole.bottom-hole.y}}/></>:<div className="guide-blocker" style={{inset:0}}/>}{blocked&&<div className="roadshow-shield"/>}</>;
}

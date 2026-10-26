export interface RealWorldModel {
 id:string;cityId:string;city:string;name:string;kind:'photogrammetry'|'building-mass'|'landmark'|'reconstruction';
 url:string;preview?:string;sourceUrl:string;exampleUrl:string;sourceName:string;
 coverage:string;captureDate:string;qualityNote:string;bytes:number;tileCount:number;
 contextNote?:string;buildingCount?:number;cameraDirection?:[number,number,number];
 landmarks?:Array<{name:string;position:[number,number,number];height:number;viewDistance?:number}>;
 surface?:{bounds:[number,number,number,number];groundZ:number;contextUrl:string;continuous:boolean};
 atmosphere?:{roads:Array<{osmId:string;points:[number,number,number][]}>;waterRoute:[number,number,number][];meaning:string;waterCorridorVerified?:boolean};
}
export interface RealWorldManifest {version:string;models:RealWorldModel[]}
export const realWorldCityIds=['610100','340100','310000','440100','440300'] as const;
export function usableModels(value:unknown,admittedCityIds?:string[]):RealWorldModel[]{
 if(!value||typeof value!=='object'||!Array.isArray((value as RealWorldManifest).models))throw Error('模型清单读取失败');
 const ids=new Set<string>();
 return (value as RealWorldManifest).models.map(m=>{
  if(!m||!/^[a-z0-9-]+$/.test(m.id)||ids.has(m.id)||!/^\d{6}$/.test(m.cityId)||!m.name||!m.city||!m.coverage||!m.qualityNote||!m.sourceName||!/^https:\/\//.test(m.sourceUrl)||!/^\/models\/[a-z0-9-]+\/tileset\.json$/.test(m.url)||!['photogrammetry','building-mass','landmark','reconstruction'].includes(m.kind)||!Number.isFinite(m.bytes)||m.bytes<=0||!Number.isInteger(m.tileCount)||m.tileCount<1)throw Error('模型清单字段不完整');
  if(admittedCityIds&&!admittedCityIds.includes(m.cityId))throw Error('模型所属城市尚未接入');
  if(m.url!==`/models/${m.id}/tileset.json`||!m.captureDate||!/^https:\/\//.test(m.exampleUrl))throw Error('模型来源或入口不一致');
  if(m.surface&&(!m.surface.continuous||m.surface.contextUrl!==`/models/${m.id}/context.b3dm`||m.surface.bounds?.length!==4||!m.surface.bounds.every(Number.isFinite)||!Number.isFinite(m.surface.groundZ)))throw Error('场景地表资料不完整');
  if(m.surface&&(m.surface.bounds[2]<=m.surface.bounds[0]||m.surface.bounds[3]<=m.surface.bounds[1]))throw Error('场景地表范围无效');
  if(m.cameraDirection&&(m.cameraDirection.length!==3||!m.cameraDirection.every(Number.isFinite)||Math.hypot(...m.cameraDirection)===0))throw Error('场景取景方向无效');
  if(m.landmarks&&(!Array.isArray(m.landmarks)||m.landmarks.some(p=>!p.name||p.position?.length!==3||!p.position.every(Number.isFinite)||!Number.isFinite(p.height)||p.height<=0||(p.viewDistance!==undefined&&(!Number.isFinite(p.viewDistance)||p.viewDistance<=0)))))throw Error('地标视角资料不完整');
  if(m.landmarks&&new Set(m.landmarks.map(p=>p.name)).size!==m.landmarks.length)throw Error('地标名称重复');
  if(m.atmosphere){
   const a=m.atmosphere,b=m.surface?.bounds;
   const points=(p:unknown)=>Array.isArray(p)&&p.length>=2&&p.length<=2048&&p.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&b&&v[0]>=b[0]&&v[0]<=b[2]&&v[1]>=b[1]&&v[1]<=b[3]);
   if(!Array.isArray(a.roads)||a.roads.length>24||!Array.isArray(a.waterRoute)||!a.meaning||a.roads.some(r=>!r||!/^\d+$/.test(r.osmId)||!points(r.points))||(a.waterRoute.length&&(!points(a.waterRoute)||!a.waterCorridorVerified)))throw Error('环境动效路径未通过边界校验');
  }
  ids.add(m.id);return m;
 });
}

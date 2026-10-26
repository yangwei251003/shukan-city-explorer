import type {City,RegionConfig} from '../types';

export type Position=[number,number];
export interface AtlasFeature {type:'Feature';properties:Record<string,unknown>;geometry:{type:string;coordinates:unknown}}
export interface AtlasCollection {type:'FeatureCollection';features:AtlasFeature[]}
export interface AtlasProjection {project:(point:Position)=>Position;path:(feature:AtlasFeature)=>string}

// Spherical Albers equal-area, 25°/47° standard parallels and 105°E central meridian.
// The display projection and the source datum are deliberately separate concerns.
export function albers(point:Position):Position {
 const rad=Math.PI/180,p1=25*rad,p2=47*rad,p0=35*rad;
 const n=(Math.sin(p1)+Math.sin(p2))/2,c=Math.cos(p1)**2+2*n*Math.sin(p1);
 const rho=Math.sqrt(Math.max(0,c-2*n*Math.sin(point[1]*rad)))/n,rho0=Math.sqrt(c-2*n*Math.sin(p0))/n;
 const theta=n*(point[0]-105)*rad;
 return [rho*Math.sin(theta),rho0-rho*Math.cos(theta)];
}
export function atlasProjection(bounds:[number,number,number,number],box:[number,number,number,number],padding=8):AtlasProjection {
 const samples:Position[]=[];
 for(let i=0;i<=64;i++){const t=i/64,x=bounds[0]+t*(bounds[2]-bounds[0]),y=bounds[1]+t*(bounds[3]-bounds[1]);samples.push(albers([x,bounds[1]]),albers([x,bounds[3]]),albers([bounds[0],y]),albers([bounds[2],y]));}
 const xs=samples.map(p=>p[0]),ys=samples.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min((box[2]-padding*2)/(maxX-minX),(box[3]-padding*2)/(maxY-minY));
 const dx=box[0]+box[2]/2-(minX+maxX)/2*scale,dy=box[1]+box[3]/2+(minY+maxY)/2*scale;
 const project=(point:Position):Position=>{const [x,y]=albers(point);return [dx+x*scale,dy-y*scale];};
 const line=(points:Position[],close=false)=>points.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join('')+(close?'Z':'');
 const path=(feature:AtlasFeature)=>{
  const g=feature.geometry;
  if(g.type==='Polygon')return (g.coordinates as Position[][]).map(r=>line(r,true)).join('');
  if(g.type==='MultiPolygon')return (g.coordinates as Position[][][]).map(p=>p.map(r=>line(r,true)).join('')).join('');
  if(g.type==='LineString')return line(g.coordinates as Position[]);
  if(g.type==='MultiLineString')return (g.coordinates as Position[][]).map(r=>line(r)).join('');
  return '';
 };return {project,path};
}
export function regionAnchor(region:RegionConfig,cities:City[]):Position|null {
 const members=cities.filter(c=>region.memberCityIds.includes(c.id));if(!members.length)return null;
 return [members.reduce((s,c)=>s+c.coordinate[0],0)/members.length,members.reduce((s,c)=>s+c.coordinate[1],0)/members.length];
}
export function regionSummary(cities:City[]){
 const gdp=cities.reduce((s,c)=>s+c.gdp,0);
 const complete=cities.length>0&&cities.every(c=>typeof c.population==='number'&&c.population>0);
 const population=complete?cities.reduce((s,c)=>s+c.population!,0):null;
 return {gdp,population,perCapita:population?gdp/population*10000:null};
}

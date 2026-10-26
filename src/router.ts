import type { Catalog, Scene } from './types';
export interface Route {regionId:string;scene:Scene;cityId:string;datasetId?:string}
const scenes:Scene[]=['nation','overview','weather','scenario','real3d'];
export function readRoute(hash:string,catalog:Catalog):Route {
 let parts:string[]=[];try{parts=decodeURIComponent(hash.replace(/^#\/?/,'').split('?')[0]).split('/');}catch{}
 const region=catalog.regions.find(r=>r.id===parts[0])??catalog.regions.find(r=>r.id===catalog.defaultRegionId)??catalog.regions[0];
 const params=new URLSearchParams(hash.split('?')[1]??'');const requested=params.get('dataset');
 return {regionId:region.id,scene:scenes.includes(parts[1] as Scene)?parts[1] as Scene:'nation',cityId:region.memberCityIds.includes(parts[2])?parts[2]:'all',datasetId:requested&&region.datasetIds.includes(requested)?requested:region.defaultDatasetId};
}
export function routeHash(route:Route){return `#/${route.regionId}/${route.scene}/${route.cityId}${route.datasetId?`?dataset=${encodeURIComponent(route.datasetId)}`:''}`;}

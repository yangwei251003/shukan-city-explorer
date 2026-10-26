import record from '../../public/data/population-reference-v3.3.json' with {type:'json'};
import type {City} from '../types';
export function populationReference(city:Pick<City,'id'|'population'|'dataYear'>|undefined){
 return city&&city.id===record.cityId&&city.population==null&&city.dataYear>record.populationYear?record:null;
}

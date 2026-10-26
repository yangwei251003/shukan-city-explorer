import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {perCapita,metricValue,historicalSeries,scopeObservation,inheritOnboarding,csvText} from '../src/lib/v3.ts';
import {readRoute,routeHash} from '../src/router.ts';
import {projectionSeries} from '../src/lib/metrics.ts';
const catalog=JSON.parse(readFileSync(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
const city={id:'demo',name:'测试城',gdp:200,growth:5,industries:[10,90,100],dataYear:2025,population:10,history:[{year:2019,gdp:100,sourceUrl:'https://example.gov.cn/2019'},{year:2021,gdp:130,sourceUrl:'https://example.gov.cn/2021'},{year:2025,gdp:200,sourceUrl:'https://example.gov.cn/2025'}]};
test('T16/T17：空路由全国首屏，城市深链接可往返且未知范围回退',()=>{
 assert.equal(readRoute('',catalog).scene,'nation');
 const expected={regionId:'prd',scene:'scenario',cityId:'440100',datasetId:'prd-annual-2024-archive'};
 assert.deepEqual(readRoute(routeHash(expected),catalog),expected);
 assert.equal(readRoute('#/unknown/weather/999999?dataset=wrong',catalog).cityId,'all');
 assert.equal(readRoute('#/%xx',catalog).scene,'nation');
});
test('T17：继承V2完成或不再提示，保留旧键，已有V3偏好优先，存储失败可降级',()=>{
 for(const old of [{dismissed:true},{completed:true}]){
  const store=new Map([['zhuliu.onboarding.v2',JSON.stringify(old)]]),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  assert.equal(inheritOnboarding(storage).dismissed,true);assert.ok(store.has('zhuliu.onboarding.v2'));assert.equal(JSON.parse(store.get('shukan.onboarding.v3')).version,3);
 }
 assert.deepEqual(inheritOnboarding({getItem:()=>{throw Error('blocked')},setItem:()=>{}}),{});
 const existing={dismissed:false,version:3};assert.deepEqual(inheritOnboarding({getItem:()=>JSON.stringify(existing),setItem:()=>{throw Error()}}),existing);
});
test('T19：仅有官方出处的年份形成历史值，缺年不插值，缺一城则集合整年缺口',()=>{
 const rows=historicalSeries([city]);assert.equal(rows[0].value,100);assert.equal(rows[1].value,null);assert.equal(rows[2].value,130);assert.equal(rows[6].value,200);
 const second={...city,history:[{year:2025,gdp:50,sourceUrl:'https://example.gov.cn/2025'}]};
 const aggregate=historicalSeries([city,second]);assert.equal(aggregate[0].value,null);assert.equal(aggregate[6].value,250);
 assert.equal(historicalSeries([{...city,history:[{year:2019,gdp:100}]}])[0].value,null);
});
test('T20：GDP亿元/人口万人换算到元，缺人口不可补零，五项指标独立',()=>{
 assert.equal(perCapita(city),200000);assert.equal(metricValue(city,'population'),10);assert.equal(metricValue(city,'gdpPerCapita'),200000);assert.equal(metricValue(city,'industry'),45);
 for(const population of [null,undefined,0]){assert.equal(perCapita({...city,population}),null);assert.equal(metricValue({...city,population},'population'),null);}
});
test('T21：1至4城文案交代精选范围；超过4城才输出头部规模份额',()=>{
 for(let n=1;n<=4;n++){const text=scopeObservation(Array.from({length:n},()=>city));assert.match(text,/精选/);assert.doesNotMatch(text,/100\.0%/);}
 assert.match(scopeObservation(Array.from({length:5},()=>city)),/80\.0%/);
});
test('V3b双情景：A/B假设独立计算且同基期相等；CSV保留两组数值和含逗号的来源文本',()=>{
 const a=projectionSeries([city],-1),b=projectionSeries([city],1.5);assert.equal(a[0].value,b[0].value);assert.ok(a.at(-1).value<b.at(-1).value);
 const csv=csvText([['来源','情景A','情景B'],['统计局,公报"原文"',a.at(-1).value,b.at(-1).value]]);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"统计局,公报""原文"""/);
});

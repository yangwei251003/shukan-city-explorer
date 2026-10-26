import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,selectDataset} from '../server/catalog.mjs';
import {validateCities} from '../server/domain.mjs';
import {createAnalysisService} from '../server/services.mjs';
import {matchesCity} from '../src/lib/cities.mjs';
import {projectionSeries} from '../src/lib/metrics.ts';
const service=createAnalysisService({env:{}});
test('发布范围、年度、数据口径完整且拒绝混币混年',()=>{
 for(const region of catalog.regions)for(const id of region.datasetIds){
  const s=selectDataset(region.id,id);validateCities(s.cities,region.memberCityIds);
  assert.equal(s.cities.length,region.memberCityIds.length);
  for(const c of s.cities)for(const k of ['sourceUrl','publishedAt','fetchedAt','datasetVersion','priceBasis','statPeriod'])assert.ok(c[k],`${c.name} ${k}`);
 }
 const {cities}=selectDataset('prd');
 assert.throws(()=>validateCities(cities.map((c,i)=>i?c:{...c,currency:'USD'})));
 assert.throws(()=>validateCities(cities.map((c,i)=>i?c:{...c,dataYear:2024})));
 assert.throws(()=>selectDataset('guangdong','prd-annual-2024-archive'));
});
test('广州问题优先于深圳选择，回答快照保留正确年份且不混入推演',async()=>{
 for(const id of ['gd-annual-2025-r1','prd-annual-2024-archive']){
  const s=selectDataset('prd',id);const r=await service.analyze(s.cities,{cityId:'440300',question:'广州市的产业结构如何？',scenario:{year:2030,growthDelta:2}},s);
  assert.deepEqual(r.context.cityIds,['440100']);assert.equal(r.context.dataYear,s.dataset.year);
  assert.match(r.answer,/广州 GDP/);assert.doesNotMatch(r.answer,/深圳 GDP/);assert.equal(r.projections,undefined);
 }
});
test('不支持的城市不会被当前选择替代；多城问题返回所问城市',async()=>{
 const s=selectDataset('prd');
 for(const question of ['雄安的GDP是多少','分析温州市','广州与雄安比较']){
  const r=await service.analyze(s.cities,{cityId:'440300',question},s);assert.match(r.answer,/尚未接入/);assert.ok(!r.facts?.length);
 }
 const r=await service.analyze(s.cities,{cityId:'440300',question:'广州和佛山比较产业结构'},s);
 assert.deepEqual(r.context.cityIds.sort(),['440100','440600']);assert.match(r.answer,/广州/);assert.match(r.answer,/佛山/);
});
test('搜索兼容全名、大小写与首尾空格；2025推演起点不偏一年',()=>{
 const {cities}=selectDataset('prd');const c=cities.find(c=>c.id==='440100');
 for(const q of ['广州市',' GUANGZHOU ','广州'])assert.ok(matchesCity(c,q));
 const series=projectionSeries(cities,0);assert.deepEqual(series.map(p=>p.year),[2025,2026,2027,2028,2029,2030]);
 assert.equal(series[0].value,cities.reduce((s,c)=>s+c.gdp,0));
});

test('区域快捷问题不被当作陌生城市；显式情景目标年优先',async()=>{
 const s=selectDataset('prd');
 const r=await service.analyze(s.cities,{cityId:'440300',question:'比较当前区域各市的经济规模'},s);
 assert.equal(r.context.cityIds.length,9);assert.match(r.answer,/珠三角/);
 const p=await service.analyze(s.cities,{cityId:'440300',question:'推演到2030年',scenario:{year:2026,growthDelta:1}},s);
 assert.equal(p.context.targetYear,2030);assert.match(p.answer,/到 2030 年/);
});

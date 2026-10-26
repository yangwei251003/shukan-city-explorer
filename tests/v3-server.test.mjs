import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalog, selectDataset, assertCatalogConsistency } from '../server/catalog.mjs';
import { CITY_IDS, cityInsights } from '../server/domain.mjs';
import { createAnalysisService } from '../server/services.mjs';

const service = createAnalysisService({ env: {}, fetchImpl: async () => { throw new Error('规则模式不能请求网络'); } });
const ask = async (question, region = 'prd', datasetId) => {
  const selection = selectDataset(region, datasetId);
  return service.analyze(selection.cities, { cityId: selection.cities[0].id, question }, selection);
};
const readRows = dataset => JSON.parse(readFileSync(new URL(`../public${dataset.url}`, import.meta.url), 'utf8'));

test('V3 R6：天气白名单从目录派生，启动自检检测重复及悬空引用', () => {
  assert.deepEqual([...assertCatalogConsistency()].sort(), [...CITY_IDS].sort());
  const duplicate = structuredClone(catalog);
  duplicate.profiles.push(duplicate.profiles[0]);
  assert.throws(() => assertCatalogConsistency(duplicate, readRows), /自检失败/);
  const dangling = structuredClone(catalog);
  dangling.regions[0].memberCityIds.push('999999');
  assert.throws(() => assertCatalogConsistency(dangling, readRows), /自检失败/);
  assert.throws(() => assertCatalogConsistency(catalog, dataset => readRows(dataset).slice(1)), /内容与目录不一致/);
});

test('T22：杭州和雄安逐一说明，不以当前城市代替未接入实体', async () => {
  const result = await ask('杭州的 GDP 是多少？雄安呢？');
  assert.match(result.answer, /杭州/);
  assert.match(result.answer, /雄安：尚未接入/);
  assert.doesNotMatch(result.answer, /广州 GDP/);
  assert.ok(result.context.object.includes('杭州') && result.context.object.includes('雄安'));
});

test('T22：已接入与未接入混问保留已核实事实、来源和分别的接入状态', async () => {
  const result = await ask('广州和雄安的 GDP 分别是多少？');
  assert.match(result.answer, /广州 GDP 为/);
  assert.match(result.answer, /雄安：尚未接入/);
  assert.deepEqual(result.context.cityIds, ['440100']);
  assert.deepEqual(result.context.unavailableObjects, ['雄安']);
  assert.ok(result.sources.some(source => source.url.includes('stats.gd.gov.cn')));
  assert.doesNotMatch(result.answer, /雄安 GDP 为/);
});

test('T22：多个已接入城市跨区域回答，版本标签不丢失', async () => {
  const result = await ask('广州与上海比较经济规模');
  assert.deepEqual(new Set(result.context.cityIds), new Set(['440100', '310000']));
  assert.match(result.answer, /广州/);
  assert.match(result.answer, /上海/);
  assert.ok(result.context.datasetVersion.includes('/'));
  assert.equal(result.mode, 'local');
});

test('T22：中英文城市名均不会命中单词内部或被缺失名单覆盖', async () => {
  const result = await ask('SHANGHAI 和 Guangzhou 的产业结构');
  assert.deepEqual(new Set(result.context.cityIds), new Set(['440100', '310000']));
  assert.doesNotMatch(result.answer, /尚未接入/);
});

test('V3b：跨区域问题以同年精选集合回答且不把平均增速称为整体增速', async () => {
  const result = await ask('长三角和珠三角哪个总量大？');
  const yangtze = selectDataset('yangtze');
  const expected = yangtze.cities.reduce((sum, city) => sum + city.gdp, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.match(result.answer, /精选集合比较/);
  assert.match(result.answer, /不代表完整城市群/);
  assert.match(result.answer, /不是该范围的整体 GDP 增速/);
  assert.ok(result.answer.includes(expected));
  assert.deepEqual(new Set(result.context.regionIds), new Set(['yangtze', 'prd']));
  assert.ok(result.sources.length >= 2);
});

test('V3b：重叠区域不再次合计，不同年度覆盖不完整时拒绝比较', async () => {
  const overlapping = await ask('广东和珠三角比较');
  assert.match(overlapping.answer, /存在重复城市/);
  assert.match(overlapping.answer, /不能将两个合计再次相加/);
  const unavailable = await ask('长三角和珠三角比较', 'prd', 'prd-annual-2024-archive');
  assert.match(unavailable.answer, /尚未完整接入 2024/);
  assert.equal(unavailable.sources.length, 0);
});

test('T21：小范围文案说明精选城市，单城不输出自排名或百分百份额', () => {
  const { cities, region } = selectDataset('jingjinji');
  assert.match(cityInsights(cities, 'all', undefined, { regionLabel: region.coverageLabel }).answer, /本范围为精选 3 城/);
  const single = cityInsights([cities[0]], cities[0].id);
  assert.match(single.answer, /当前范围仅含该城/);
  assert.doesNotMatch(single.answer, /排第 1|100\.0%/);
});

test('T20：人口暂缺不会补零，有同年来源时按年末常住人口计算人均', async () => {
  const selection = selectDataset('prd');
  const city = { ...selection.cities[0], population: null, populationSourceUrl: null };
  const missing = await service.analyze([city], { cityId: city.id, question: '常住人口与人均 GDP 是多少？' });
  assert.match(missing.answer, /常住人口暂缺，人均 GDP 暂缺/);
  assert.doesNotMatch(missing.answer, /常住人口 0/);
  const withPopulation = { ...city, population: 1000, populationStatPeriod: '2025年末', populationSourceUrl: city.sourceUrl, populationSourceName: city.sourceName };
  const available = await service.analyze([withPopulation], { cityId: city.id, question: '常住人口与人均 GDP 是多少？' });
  assert.match(available.answer, /按年末常住人口计算/);
  assert.ok(available.answer.includes(Math.round(city.gdp / 1000 * 10000).toLocaleString('zh-CN')));
  assert.doesNotMatch(available.answer, /人口暂缺/);
});

test('V3 数据边界：全国总量、未接入年份与未来预测仍然明确拒绝', async () => {
  assert.match((await ask('全国 GDP 总量')).answer, /不展示全国合计/);
  assert.match((await ask('广州 2018 年 GDP')).answer, /没有数据时不会改用另一年回答/);
  assert.match((await ask('广州未来 GDP 预测')).answer, /不能回答未接入的数据或提供未来经济预测/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_IDS, cityInsights, scenarioProjection, validateAnalysisRequest, validateCities } from '../server/domain.mjs';

export const cities = CITY_IDS.filter(id => ['440100','440300','440400','440600','440700','441200','441300','441900','442000'].includes(id)).map((id, index) => ({
  id, name: `测试城市${index}`, fullName: `测试城市${index}市`, en: `City${index}`,
  coordinate: [113 + index / 10, 23], gdp: (index + 1) * 1000, growth: index === 0 ? 5 : 4,
  industries: [(index + 1) * 100, (index + 1) * 400, (index + 1) * 500],
  dataYear: 2024, sourceUrl: 'https://stats.example.test/table', color: '#fff', tag: '', description: '',
}));

test('情景复利以 2024 年为基期，百分点调整不误作百分数乘法', () => {
  const result = scenarioProjection(cities[0], { year: 2026, growthDelta: 5 });
  assert.equal(result.assumedAnnualGrowth, 10);
  assert.equal(result.projectedGdp, 1210);
  assert.equal(result.absoluteChange, 210);
  assert.equal(result.cumulativeChange, 21);
  assert.match(result.unit, /固定 2024/);
  assert.match(result.label, /不是经济预测/);
});

test('零增长和负增长情景保留其数学含义', () => {
  assert.equal(scenarioProjection(cities[0], { year: 2030, growthDelta: -5 }).projectedGdp, 1000);
  assert.equal(scenarioProjection(cities[0], { year: 2025, growthDelta: -10 }).projectedGdp, 950);
});

test('拒绝非法年份、无限值、字符串数字及错误基期', () => {
  for (const scenario of [null, { year: 2024, growthDelta: 0 }, { year: 2031, growthDelta: 0 },
    { year: 2025.5, growthDelta: 0 }, { year: 2026, growthDelta: Infinity },
    { year: 2026, growthDelta: '2' }, { year: 2026, growthDelta: -11 }]) {
    assert.throws(() => scenarioProjection(cities[0], scenario));
  }
  assert.throws(() => scenarioProjection({ ...cities[0], dataYear: 2023 }, { year: 2030, growthDelta: 0 }));
});

test('排名和产业占比来自九市同口径值，不改变原始城市排序', () => {
  const before = cities.map(city => city.id);
  const result = cityInsights(cities, cities[0].id);
  assert.equal(result.totalGdp, 45000);
  assert.equal(result.facts[0].gdpRank, 9);
  assert.equal(result.facts[0].regionalShare.toFixed(2), '2.22');
  assert.deepEqual(result.facts[0].industryShares, [10, 40, 50]);
  assert.deepEqual(cities.map(city => city.id), before);
  assert.match(result.answer, /规则解读/);
  assert.equal(result.sources[0].url, cities[0].sourceUrl);
});

test('区域情景逐市计算、来源去重，不能把各市增长率直接相加', () => {
  const result = cityInsights(cities, 'all', { year: 2025, growthDelta: 0 });
  assert.equal(result.projections.length, 9);
  assert.equal(result.projections.reduce((sum, city) => sum + city.projectedGdp, 0), 46810);
  assert.equal(result.sources.length, 1);
  assert.match(result.answer, /不是经济预测/);
});

test('数据不完整、重复行政代码或非有限统计值不进入事实层', () => {
  assert.throws(() => validateCities(cities.slice(0, 8), cities.map(c => c.id)));
  assert.throws(() => validateCities(cities.map((city, index) => index === 1 ? cities[0] : city)));
  assert.throws(() => validateCities(cities.map((city, index) => index === 0 ? { ...city, gdp: NaN } : city)));
});

test('分析参数只接受规定城市与有限长度问题', () => {
  assert.throws(() => validateAnalysisRequest({ cityId: 'https://example.org', question: '分析' }));
  assert.throws(() => validateAnalysisRequest({ cityId: 'all', question: ' '.repeat(4) }));
  assert.throws(() => validateAnalysisRequest({ cityId: 'all', question: '长'.repeat(1001) }));
  assert.throws(() => validateAnalysisRequest({ cityId: 'all', question: '情景', scenario: {} }));
  assert.equal(validateAnalysisRequest({ cityId: 'all', question: ' 分析 ' }).question, '分析');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { projectValue, projectionSeries, sumGDP } from '../src/lib/metrics.ts';

const sample = [
  { id: 'a', dataYear: 2024, gdp: 100, growth: -2 },
  { id: 'b', dataYear: 2024, gdp: 200, growth: 4 },
  { id: 'c', dataYear: 2024, gdp: 500, growth: 10 },
];
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`);

test('前端推演固定覆盖 2024–2030，基期总量不受增长调整影响', () => {
  for (const delta of [-3, 0, 3]) {
    const series = projectionSeries(sample, delta);
    assert.equal(series.length, 7);
    assert.deepEqual(series.map(point => point.year), [2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    assert.equal(series[0].value, 800);
    assert.equal(series[0].value, sumGDP(sample));
  }
  assert.equal(projectValue(1234.56, -2, 2024), 1234.56);
});

test('调整为零时保留各市原有增速，区域总量由各市计算后相加', () => {
  const baseline = projectionSeries(sample, 0);
  // 次年三个城市分别为 98、208、550，不能用未加权平均增速替代。
  near(baseline[1].value, 856);
  // 独立计算六年终值：88.5842380864 + 253.0638036992 + 885.7805。
  near(baseline[6].value, 1227.4285417856);
  assert.notEqual(baseline[1].value, baseline[0].value);
  assert.notEqual(baseline[1].value, 832);
});

test('百分点调整提高时，同年情景不降低，基期保持相等', () => {
  const low = projectionSeries(sample, -3);
  const baseline = projectionSeries(sample, 0);
  const high = projectionSeries(sample, 3);
  assert.equal(low[0].value, high[0].value);
  for (let index = 1; index < baseline.length; index++) {
    assert.ok(low[index].value < baseline[index].value);
    assert.ok(baseline[index].value < high[index].value);
  }
});

test('逐年单调性遵循假设增速，负增长不被错误截断成零增长', () => {
  const growing = projectionSeries([{ dataYear: 2024, gdp: 100, growth: 5 }], 0);
  const shrinking = projectionSeries([{ dataYear: 2024, gdp: 100, growth: -5 }], 0);
  const flat = projectionSeries([{ dataYear: 2024, gdp: 100, growth: 5 }], -5);
  for (let index = 1; index < 7; index++) {
    assert.ok(growing[index].value > growing[index - 1].value);
    assert.ok(shrinking[index].value < shrinking[index - 1].value);
    assert.equal(flat[index].value, 100);
  }
  near(projectValue(100, 10, 2030), 177.1561);
  assert.equal(projectValue(0, 10, 2030), 0);
});

test('无效数学输入不生成可展示的情景数字', () => {
  for (const args of [[-1, 5, 2030], [100, -100, 2030], [100, -101, 2030],
    [NaN, 5, 2030], [100, Infinity, 2030], [100, 5, 2023], [100, 5, 2025.5]]) {
    assert.throws(() => projectValue(...args));
  }
  assert.throws(() => projectionSeries(sample, NaN));
});

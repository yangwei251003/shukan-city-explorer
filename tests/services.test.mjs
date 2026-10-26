import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_IDS } from '../server/domain.mjs';
import { createWeatherService, createAnalysisService, modelConfiguration } from '../server/services.mjs';

const cities = CITY_IDS.filter(id => ['440100','440300','440400','440600','440700','441200','441300','441900','442000'].includes(id)).map((id, index) => ({
  id, name: `测试城市${index}`, coordinate: [113 + index / 10, 23], gdp: (index + 1) * 1000, growth: 5,
  industries: [(index + 1) * 100, (index + 1) * 400, (index + 1) * 500],
  dataYear: 2024, sourceUrl: 'https://stats.example.test/table',
}));
const json = payload => ({ ok: true, json: async () => payload });
const weatherPayload = () => ({
  current: { time: '2026-09-26T12:00', temperature_2m: 28, relative_humidity_2m: 70,
    precipitation: 0, weather_code: 1, wind_speed_10m: 12 },
  hourly: { time: Array.from({ length: 24 }, (_, index) => `2026-09-26T${String(index).padStart(2, '0')}:00`),
    temperature_2m: Array(24).fill(28), precipitation: Array(24).fill(0), precipitation_probability: Array(24).fill(20) },
});

test('天气请求固定来源及单位，保留真实零降水值，缓存并合并并发', async () => {
  let calls = 0;
  const weather = createWeatherService({ fetchImpl: async url => {
    calls++;
    assert.equal(url.hostname, 'api.open-meteo.com');
    assert.equal(url.searchParams.get('forecast_hours'), '24');
    assert.equal(url.searchParams.get('longitude'), '113');
    assert.equal(url.searchParams.get('timezone'), 'Asia/Shanghai');
    return json(weatherPayload());
  } });
  const results = await Promise.all([weather(cities[0]), weather(cities[0])]);
  assert.equal(results[0].available, true);
  assert.equal(results[0].current.precipitation, 0);
  assert.equal(results[0].hourly.length, 24);
  await weather(cities[0]);
  assert.equal(calls, 1);
});

test('天气失败不返回伪造值，过期成功缓存不冒充当前数据', async () => {
  let timestamp = 0;
  let calls = 0;
  const weather = createWeatherService({ now: () => timestamp, cacheMs: 100, fetchImpl: async () => {
    if (++calls === 1) return json(weatherPayload());
    throw new Error('secret internal detail');
  } });
  assert.equal((await weather(cities[0])).available, true);
  timestamp = 101;
  const result = await weather(cities[0]);
  assert.equal(result.available, false);
  assert.equal(result.current, undefined);
  assert.equal(result.hourly, undefined);
  assert.doesNotMatch(result.error, /secret/);
  await weather(cities[0]);
  assert.equal(calls, 2);
});

test('缺失天气字段、HTTP 失败和超时均明确不可用', async () => {
  const missing = weatherPayload();
  missing.hourly.precipitation_probability[4] = null;
  for (const fetchImpl of [async () => json(missing), async () => ({ ok: false }), () => new Promise(() => {})]) {
    const result = await createWeatherService({ fetchImpl, timeoutMs: 15 })(cities[0]);
    assert.equal(result.available, false);
    assert.equal(result.current, undefined);
    assert.ok(result.error);
  }
});

test('模型关闭不发送任何网络请求，明确返回规则模式', async () => {
  const service = createAnalysisService({ env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(service.status(), { modelConfigured: false });
  const result = await service.analyze(cities, { cityId: 'all', question: '明年人口有多少？' });
  assert.equal(result.mode, 'local');
  assert.match(result.answer, /不能回答未接入/);
  assert.ok(result.sources.length);
});

test('附带经济情景也不能略过人口和实时交通等未接入领域的提示', async () => {
  const service = createAnalysisService({ env: {} });
  for (const question of ['这个城市有多少人口？', '当前实时交通有什么变化？']) {
    const result = await service.analyze(cities, {
      cityId: cities[0].id, question, scenario: { year: 2030, growthDelta: 1 },
    });
    assert.equal(result.mode, 'local');
    assert.equal(result.projections, undefined);
    assert.match(result.answer, /不能回答未接入的数据/);
  }
  const economicScenario = await service.analyze(cities, {
    cityId: 'all', question: '解释未来发展情景的假设与局限', scenario: { year: 2030, growthDelta: 1 },
  });
  assert.match(economicScenario.answer, /不是经济预测/);
  assert.doesNotMatch(economicScenario.answer, /不能回答未接入的数据/);
});

const modelEnv = { AI_BASE_URL: 'https://model.example.test/v1', AI_API_KEY: 'test-only-key', AI_MODEL: 'test-model' };
test('模型仅收到冻结事实，成功响应保留本地数值和来源，状态不暴露密钥', async () => {
  let calls = 0;
  const service = createAnalysisService({ env: modelEnv, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://model.example.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, 'test-model');
    assert.match(sent.messages[1].content, /verifiedFacts/);
    return json({ choices: [{ message: { content: '产业占比描述产出结构，还需要长期数据判断变化趋势。' } }] });
  } });
  assert.deepEqual(service.status(), { modelConfigured: true, model: 'test-model' });
  const result = await service.analyze(cities, { cityId: cities[0].id, question: '产业结构如何？' });
  assert.equal(result.mode, 'model');
  assert.equal(result.model, 'test-model');
  assert.match(result.answer, /1,000.00/);
  assert.match(result.answer, /模型辅助说明/);
  assert.equal(result.sources[0].url, cities[0].sourceUrl);
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /test-only-key/);
});

test('模型虚构数值、空内容及超时回落规则解读', async () => {
  for (const fetchImpl of [
    async () => json({ choices: [{ message: { content: '2030 年将达到 100 万亿元。' } }] }),
    async () => json({ choices: [] }),
    () => new Promise(() => {}),
  ]) {
    const service = createAnalysisService({ env: modelEnv, fetchImpl, timeoutMs: 15 });
    const result = await service.analyze(cities, { cityId: 'all', question: '分析' });
    assert.equal(result.mode, 'local');
    assert.match(result.answer, /本次使用规则解读/);
    assert.doesNotMatch(result.answer, /100 万亿元/);
  }
});

test('不完整或带凭据、查询参数的模型地址不启用', () => {
  assert.equal(modelConfiguration({ ...modelEnv, AI_MODEL: '' }).configured, false);
  assert.equal(modelConfiguration({ ...modelEnv, AI_BASE_URL: 'file:///tmp' }).configured, false);
  assert.equal(modelConfiguration({ ...modelEnv, AI_BASE_URL: 'https://user:pass@example.test/v1' }).configured, false);
  assert.equal(modelConfiguration({ ...modelEnv, AI_BASE_URL: 'https://example.test/v1?key=x' }).configured, false);
});

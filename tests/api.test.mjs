import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { CITY_IDS } from '../server/domain.mjs';
import { createApp } from '../server/index.mjs';

const cities = CITY_IDS.filter(id => ['440100','440300','440400','440600','440700','441200','441300','441900','442000'].includes(id)).map((id, index) => ({
  id, name: `测试城市${index}`, coordinate: [113 + index / 10, 23], gdp: (index + 1) * 1000, growth: 5,
  industries: [(index + 1) * 100, (index + 1) * 400, (index + 1) * 500],
  dataYear: 2024, sourceUrl: 'https://stats.example.test/table',
}));

async function serve(t, options = {}) {
  const app = createApp({ loadCities: async () => cities, env: {},
    fetchImpl: async () => { throw new Error('test-network-unavailable'); }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('API 合同：健康、关闭模型、真实不可用天气、规则分析', async t => {
  const base = await serve(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health, { status: 'ok', dataReady: true, cityCount: 9, dataYear: 2024 });
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { modelConfigured: false });
  const weather = await (await fetch(`${base}/api/weather?city=440100`)).json();
  assert.equal(weather.available, false);
  assert.equal(weather.cityId, '440100');
  assert.equal(weather.current, undefined);
  assert.ok(weather.error);
  const analysisResponse = await fetch(`${base}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityId: '440100', question: '比较产业结构的情景推演', scenario: { year: 2026, growthDelta: 1 } }),
  });
  assert.equal(analysisResponse.status, 200);
  const analysis = await analysisResponse.json();
  assert.equal(analysis.mode, 'local');
  assert.ok(analysis.sources.length);
  assert.match(analysis.answer, /不是经济预测/);
});

test('URL、重复城市参数、错误情景、非法 JSON 返回可读错误', async t => {
  let networkCalls = 0;
  const base = await serve(t, { fetchImpl: async () => { networkCalls++; throw new Error('unexpected'); } });
  for (const query of ['city=https%3A%2F%2Fexample.org', 'city=440100&city=440300', 'city=all', '']) {
    const response = await fetch(`${base}/api/weather?${query}`);
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
  assert.equal(networkCalls, 0);
  const invalid = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityId: 'all', question: '分析', scenario: { year: 2040, growthDelta: 0 } }) });
  assert.equal(invalid.status, 400);
  const malformed = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.ok((await malformed.json()).error);
  assert.equal((await fetch(`${base}/api/missing`)).status, 404);
});

test('数据缺失时健康接口不得宣称就绪', async t => {
  const base = await serve(t, { loadCities: async () => { throw new Error('not ready'); } });
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).dataReady, false);
});

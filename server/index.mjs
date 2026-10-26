import express from 'express';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InputError, validateCityId, validateCities } from './domain.mjs';
import { createAnalysisService, createWeatherService } from './services.mjs';
import { catalog, selectDataset, assertCatalogConsistency } from './catalog.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ root = projectRoot, env = process.env, fetchImpl = fetch, loadCities,
  weatherOptions = {}, analysisOptions = {} } = {}) {
  if (!loadCities) {
    assertCatalogConsistency();
    for (const region of catalog.regions) for (const id of region.datasetIds) {
      validateCities(selectDataset(region.id, id).cities, region.memberCityIds);
    }
  }
  const app = express();
  const weather = createWeatherService({ fetchImpl, ...weatherOptions });
  const analysis = createAnalysisService({ fetchImpl, env, ...analysisOptions });
  const readCities = loadCities ?? (async () => JSON.parse(await readFile(path.join(root, 'public/data/cities.json'), 'utf8')));
  const selection = async (request) => {
    if (loadCities) return {cities:validateCities(await readCities()),region:undefined,dataset:undefined};
    try {
      const value=selectDataset(request.query.region ?? request.body?.regionId, request.query.dataset ?? request.body?.datasetId);
      validateCities(value.cities,value.region.memberCityIds);return value;
    } catch(error) { throw new InputError(error.message); }
  };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12kb' }));
  app.get('/api/health', async (request, response) => {
    try { const value = await selection(request); const data=value.cities; response.json({ status: 'ok', dataReady: true, cityCount: data.length, dataYear:data[0].dataYear, regionId:value.region?.id, datasetVersion:value.dataset?.id }); }
    catch { response.status(503).json({ status: 'degraded', dataReady: false, error: '城市数据暂不可用。' }); }
  });
  app.get('/api/status', (_request, response) => response.json(analysis.status()));
  app.get('/api/weather', async (request, response) => {
    const cityId = validateCityId(request.query.city);
    const city = catalog.profiles.find(item => item.id === cityId);
    response.json(await weather(city));
  });
  app.post('/api/analyze', async (request, response) => { const value=await selection(request); response.json(await analysis.analyze(value.cities, request.body,value)); });
  app.use('/api', (_request, response) => response.status(404).json({ error: '没有这个接口。' }));
  const dist = path.join(root, 'dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (request, response, next) => {
      if (path.extname(request.path)) return next();
      return response.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((error, _request, response, _next) => {
    if (error instanceof InputError) return response.status(400).json({ error: error.message });
    if (error.type === 'entity.too.large') return response.status(413).json({ error: '请求内容过长。' });
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: '请求必须是有效 JSON。' });
    response.status(503).json({ error: '本地数据服务暂不可用，请稍后重试。' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  dotenv.config({ path: path.join(projectRoot, '.env.local') });
  const port = 8787;
  createApp().listen(port, '127.0.0.1', () => console.log(`数瞰数据服务：http://127.0.0.1:${port}`));
}

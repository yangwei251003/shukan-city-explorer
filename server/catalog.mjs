import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/', import.meta.url);
export const catalog = JSON.parse(readFileSync(new URL('data/catalog.json', root), 'utf8'));
const datasetRows = dataset => JSON.parse(readFileSync(fileURLToPath(new URL(dataset.url.slice(1), root)), 'utf8'));

// Validate the single source of truth before accepting requests. In particular,
// a profile alone cannot grant weather access to an unpublished city.
export function assertCatalogConsistency(value = catalog, readRows = datasetRows) {
  const fail = reason => { throw new Error(`数据目录自检失败：${reason}`); };
  for (const key of ['profiles', 'datasets', 'regions']) {
    if (!Array.isArray(value[key]) || !value[key].length || new Set(value[key].map(item => item.id)).size !== value[key].length) fail(`${key} 缺失或 ID 重复`);
  }
  const profiles = new Map(value.profiles.map(profile => [profile.id, profile]));
  const datasets = new Map(value.datasets.map(dataset => [dataset.id, dataset]));
  const publishedIds = new Set();
  for (const profile of value.profiles) {
    if (!/^\d{6}$/.test(profile.id) || typeof profile.name !== 'string' || !profile.name || !Array.isArray(profile.coordinate) || profile.coordinate.length !== 2 || !profile.coordinate.every(Number.isFinite) || Math.abs(profile.coordinate[0]) > 180 || Math.abs(profile.coordinate[1]) > 90) fail(`城市档案 ${profile.id} 无效`);
  }
  for (const dataset of value.datasets) {
    if (!Number.isInteger(dataset.year) || !Array.isArray(dataset.cityIds) || !dataset.cityIds.length || new Set(dataset.cityIds).size !== dataset.cityIds.length || !/^\/data\/datasets\/[a-zA-Z0-9_-]+\.json$/.test(dataset.url)) fail(`数据集 ${dataset.id} 声明无效`);
    if (dataset.cityIds.some(id => !profiles.has(id))) fail(`数据集 ${dataset.id} 引用了缺失的城市档案`);
    const rows = readRows(dataset);
    if (!Array.isArray(rows) || rows.length !== dataset.cityIds.length || new Set(rows.map(row => row.cityId)).size !== rows.length || rows.some(row => !dataset.cityIds.includes(row.cityId) || row.dataYear !== dataset.year || row.datasetVersion !== dataset.id)) fail(`数据集 ${dataset.id} 内容与目录不一致`);
    dataset.cityIds.forEach(id => publishedIds.add(id));
  }
  if (value.profiles.some(profile => !publishedIds.has(profile.id))) fail('城市档案存在未发布条目，请将待接入城市放入独立准入清单');
  if (!value.regions.some(region => region.id === value.defaultRegionId)) fail('默认地区不存在');
  for (const region of value.regions) {
    if (!Array.isArray(region.memberCityIds) || !region.memberCityIds.length || new Set(region.memberCityIds).size !== region.memberCityIds.length || region.memberCityIds.some(id => !profiles.has(id)) || !Array.isArray(region.datasetIds) || !region.datasetIds.includes(region.defaultDatasetId)) fail(`地区 ${region.id} 引用无效`);
    for (const id of region.datasetIds) {
      const dataset = datasets.get(id);
      if (!dataset || region.memberCityIds.some(cityId => !dataset.cityIds.includes(cityId))) fail(`地区 ${region.id} 与数据集 ${id} 覆盖不一致`);
    }
  }
  return [...publishedIds];
}
export function publishedCities(datasetId) {
  const dataset = catalog.datasets.find(d => d.id === datasetId);
  if (!dataset) throw new Error('未发布的数据版本');
  const rows = datasetRows(dataset);
  return rows.map(row => ({ ...catalog.profiles.find(p => p.id === row.cityId), ...row, id: row.cityId }));
}
export function selectDataset(regionId = catalog.defaultRegionId, datasetId) {
  const region = catalog.regions.find(r => r.id === regionId);
  if (!region) throw new Error('未接入该地区');
  const id = datasetId ?? region.defaultDatasetId;
  if (!region.datasetIds.includes(id)) throw new Error('该地区不支持这个数据年份');
  const dataset = catalog.datasets.find(d => d.id === id);
  const cities = publishedCities(id).filter(c => region.memberCityIds.includes(c.id));
  if (cities.length !== region.memberCityIds.length) throw new Error('地区数据不完整');
  return { region, dataset, cities };
}
export function allCitiesForYear(year) {
  const map = new Map();
  catalog.datasets.filter(d => d.year === year).forEach(d => publishedCities(d.id).forEach(c => map.set(c.id, c)));
  return [...map.values()];
}

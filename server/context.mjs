import { catalog, allCitiesForYear } from './catalog.mjs';
import { normalizeCityQuery } from '../src/lib/cities.mjs';

// These names describe questions outside the published catalog, never admission.
// A catalog match always takes precedence when a city is subsequently admitted.
const commonlyRequestedCities = ['杭州','宁波','无锡','常州','南通','合肥','唐山','成都','重庆','武汉','长沙','西安','郑州','济南','青岛','香港','澳门','昆明','南宁','南昌','福州','厦门','海口','三亚','兰州','哈尔滨','长春','沈阳','大连','拉萨','乌鲁木齐','太原','贵阳','呼和浩特','银川','西宁','雄安'];
export const scenarioIntent = question => /情景|推演|假设|增长率调整/.test(question);
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentioned(question, alias) {
  const normalized = normalizeCityQuery(alias);
  return normalized && (/[a-z]/.test(normalized)
    ? new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'i').test(question)
    : question.includes(normalized));
}
const inQuestionOrder = (question, values, name = value => value.name) => values.sort((a, b) => question.indexOf(normalizeCityQuery(name(a))) - question.indexOf(normalizeCityQuery(name(b))));
const missingLine = (name, year) => `${name}：尚未接入 ${year} 全年可比数据，不会以当前城市代替，也不估算数值。`;

export function resolveContext(cities, request, selection = {}) {
  const year = cities[0].dataYear;
  const q = normalizeCityQuery(request.question);
  const known = new Map([...allCitiesForYear(year), ...cities].map(city => [city.id, city]));
  const explicit = inQuestionOrder(q, catalog.profiles.filter(city => [city.fullName, city.name, city.en, ...(city.aliases ?? [])].some(alias => mentioned(q, alias))));
  const explicitNames = explicit.map(city => city.name);
  const unsupported = commonlyRequestedCities.filter(name => q.includes(name) && !explicitNames.includes(name));
  const unknownCity = [...q.matchAll(/([\u4e00-\u9fff]{2,10})市/g)]
    .map(match => match[1].split(/和|与|及|比较|对比|分析|查询|查看|介绍|的/).at(-1).replace(/^(?:请|看看)+/, ''))
    .filter(name => name.length >= 2 && !catalog.profiles.some(city => name.endsWith(city.name)) && !/城|都/.test(name) && !/(各|全|所有|这些|那些|[一二三四五六七八九十两])$/.test(name));
  const missing = inQuestionOrder(q, [...new Set([...unsupported, ...unknownCity, ...explicit.filter(city => !known.has(city.id)).map(city => city.name)])], value => value);
  const explicitYear = q.match(/(20\d{2})\s*年?/);
  const wantsScenario = scenarioIntent(q);
  if (wantsScenario && explicitYear && request.scenario && Number(explicitYear[1]) !== year) {
    const target = Number(explicitYear[1]);
    if (target <= year || target > 2030) return { error: `情景目标年须在 ${year + 1}–2030 年之间。`, year };
    request = { ...request, scenario: { ...request.scenario, year: target } };
  }
  if (/全国|粤港澳|大湾区/.test(q)) return { error: '目前尚未接入该完整区域的可比数据。全国入口只列已接入城市，不展示全国合计；港澳未通过币种和分类准入。请选择已发布城市或精选范围，不会以当前城市代替。', year };
  if (explicitYear && Number(explicitYear[1]) !== year && !wantsScenario) return { error: `当前选择的数据是 ${year} 全年；问题指定 ${explicitYear[1]} 年，请先切换到支持该年份的数据版本。没有数据时不会改用另一年回答。`, year };

  let region = selection.region ?? { id: 'prd', name: '珠三角', coverageLabel: `珠三角${cities.length}市`, memberCityIds: cities.map(city => city.id) };
  let pool = cities;
  let ids;
  const availableExplicit = explicit.filter(city => known.has(city.id));
  if (availableExplicit.length) {
    ids = availableExplicit.map(city => city.id);
    if (ids.some(id => !pool.some(city => city.id === id))) {
      pool = ids.map(id => known.get(id));
      region = { id: 'explicit-cities', coverageLabel: '问题指定城市', memberCityIds: ids };
    }
  } else if (missing.length) {
    return { error: missing.map(name => missingLine(name, year)).join('\n\n'), object: missing.join('、'), missing, year };
  } else {
    const named = inQuestionOrder(q, catalog.regions.filter(item => [item.name, item.coverageLabel, ...(item.aliases ?? [])].some(alias => mentioned(q, alias))));
    if (named.length > 1) {
      const complete = named.filter(item => item.memberCityIds.every(id => known.has(id)));
      const incomplete = named.filter(item => !complete.includes(item)).map(item => `${item.coverageLabel}：尚未完整接入 ${year} 全年，不能拿部分城市代替该范围。`);
      if (complete.length < 2) return { error: [...incomplete, '两个范围均需具备同年全年数据，才可作精选集合比较。'].join('\n\n'), object: named.map(item => item.coverageLabel).join('、'), year };
      const groups = complete.map(item => ({ region: item, cities: item.memberCityIds.map(id => known.get(id)) }));
      const selected = [...new Map(groups.flatMap(group => group.cities).map(city => [city.id, city])).values()];
      return { groups, pool: selected, cityId: 'all', regionLabel: '问题指定精选集合', notices: incomplete,
        context: { object: named.map(item => item.coverageLabel).join('、'), cityIds: selected.map(city => city.id), regionId: 'region-comparison', regionIds: complete.map(item => item.id), dataYear: year, statPeriod: `${year}全年`, datasetVersion: [...new Set(selected.map(city => city.datasetVersion ?? `legacy-${year}`))].join(' / '), type: '官方统计' } };
    }
    if (named.length || /全省/.test(q)) {
      if (/全省/.test(q) && !['prd', 'guangdong'].includes(region.id) && !named.length) return { error: '当前为跨省精选城市，请明确省份或选择已接入区域，不能把精选城市当作全省。', year };
      region = named[0] ?? catalog.regions.find(item => item.id === 'guangdong');
      if (region.memberCityIds.some(id => !known.has(id))) return { error: `该范围未完整接入 ${year} 年，请切换数据版本。`, year };
      pool = region.memberCityIds.map(id => known.get(id));
      ids = pool.map(city => city.id);
    } else if (/各市|三城|所有城市|整个区域/.test(q) || request.cityId === 'all') ids = pool.map(city => city.id);
    else ids = [request.cityId];
  }
  const selected = ids.map(id => pool.find(city => city.id === id)).filter(Boolean);
  if (!selected.length) return { error: '当前对象不在已发布范围，请重新选择城市。', year };
  const group = ids.length > 1;
  const object = explicit.length ? [...selected.map(city => city.name), ...missing].join('、') : group ? region.coverageLabel : selected[0].name;
  return { pool: group ? selected : pool, cityId: group ? 'all' : ids[0], regionLabel: group ? (explicit.length ? selected.map(city => city.name).join('、') : region.coverageLabel) : region.coverageLabel,
    context: { object, cityIds: ids, regionId: region.id, dataYear: year, statPeriod: `${year}全年`, datasetVersion: [...new Set(selected.map(city => city.datasetVersion ?? `legacy-${year}`))].join(' / '), type: wantsScenario && request.scenario ? '假设推演' : '官方统计', targetYear: wantsScenario && request.scenario ? request.scenario.year : undefined, ...(missing.length ? { unavailableObjects: missing } : {}) },
    notices: missing.map(name => missingLine(name, year)),
    scenario: wantsScenario ? request.scenario : undefined };
}


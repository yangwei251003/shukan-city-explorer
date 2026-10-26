import { catalog } from './catalog.mjs';
export const CITY_IDS = Object.freeze(catalog.profiles.map(c => c.id));
export class InputError extends Error { constructor(message) { super(message); this.name = 'InputError'; } }
export function validateCityId(value, allowAll = false, ids = CITY_IDS) {
  if (typeof value !== 'string' || (!ids.includes(value) && !(allowAll && value === 'all'))) throw new InputError('请选择当前已接入范围中的城市。');
  return value;
}
export function validateScenario(value, baseYear = 2024) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(value.year) || value.year <= baseYear || value.year > 2030 || typeof value.growthDelta !== 'number' || !Number.isFinite(value.growthDelta) || Math.abs(value.growthDelta) > 10) throw new InputError(`情景年份须为 ${baseYear + 1}–2030，增长调整须为 -10 至 10 个百分点。`);
  return { year: value.year, growthDelta: value.growthDelta };
}
export function validateAnalysisRequest(body, cities) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('请求格式不正确。');
  const cityId = validateCityId(body.cityId, true, cities?.map(c => c.id));
  if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 1000) throw new InputError('请输入 1–1000 字的问题。');
  return { cityId, question: body.question.trim(), ...(body.scenario === undefined ? {} : { scenario: validateScenario(body.scenario, cities?.[0]?.dataYear) }) };
}
function validCity(c) {
  return c && CITY_IDS.includes(c.id) && typeof c.name === 'string' && Number.isFinite(c.gdp) && c.gdp > 0 && Number.isFinite(c.growth) && c.growth > -100 && c.growth <= 100
    && catalog.datasets.some(d => d.year === c.dataYear && d.cityIds.includes(c.id))
    && Array.isArray(c.industries) && c.industries.length === 3 && c.industries.every(v => Number.isFinite(v) && v >= 0)
    && Math.abs(c.industries.reduce((s,v)=>s+v,0)-c.gdp) <= .21
    && Array.isArray(c.coordinate) && c.coordinate.length === 2 && c.coordinate.every(Number.isFinite) && Math.abs(c.coordinate[0]) <= 180 && Math.abs(c.coordinate[1]) <= 90
    && typeof c.sourceUrl === 'string' && /^https:\/\//.test(c.sourceUrl);
}
export function validateCities(cities, expectedIds) {
  if (!Array.isArray(cities) || !cities.length || !cities.every(validCity) || new Set(cities.map(c => c.id)).size !== cities.length || new Set(cities.map(c=>c.dataYear)).size !== 1
    || new Set(cities.map(c=>c.currency ?? 'CNY')).size !== 1 || cities.some(c=>c.currency && c.currency !== 'CNY')
    || (expectedIds && (cities.length !== expectedIds.length || expectedIds.some(id=>!cities.some(c=>c.id===id))))) throw new Error('城市数据文件不完整、口径不一致或格式错误。');
  return cities;
}
const number = v => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = v => v.toFixed(1);
const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
export function scenarioProjection(city, scenario) {
  if (!validCity(city)) throw new InputError('情景基期必须使用已发布的有效年度城市数据。');
  const { year, growthDelta } = validateScenario(scenario, city.dataYear);
  const assumedAnnualGrowth = city.growth + growthDelta;
  if (assumedAnnualGrowth <= -100) throw new InputError('假设年均增长率必须大于 -100%。');
  const projected = city.gdp * (1 + assumedAnnualGrowth / 100) ** (year - city.dataYear);
  return { cityId:city.id, cityName:city.name, baseYear:city.dataYear, year, baseGdp:city.gdp, baseGrowth:city.growth, growthDelta, assumedAnnualGrowth:round(assumedAnnualGrowth), projectedGdp:round(projected), absoluteChange:round(projected-city.gdp), cumulativeChange:round((projected/city.gdp-1)*100), unit:`亿元（固定 ${city.dataYear} 年价格近似）`, method:`${city.dataYear} 年 GDP × (1 + 假设年均增长率 / 100) ^ (目标年 − ${city.dataYear})`, label:'情景假设，不是经济预测。实际增速仅作为初始年均假设，未估计未来价格变化。' };
}
export function cityInsights(cities, cityId='all', scenario, options={}) {
  validateCities(cities); validateCityId(cityId,true,cities.map(c=>c.id));
  const year=cities[0].dataYear;
  if(scenario!==undefined)validateScenario(scenario,year);
  const region=options.regionLabel ?? (cities.length===9?'珠三角九市':`已选${cities.length}城`);
  const byGdp=[...cities].sort((a,b)=>b.gdp-a.gdp||a.id.localeCompare(b.id));
  const byGrowth=[...cities].sort((a,b)=>b.growth-a.growth||a.id.localeCompare(b.id));
  const totalGdp=cities.reduce((s,c)=>s+c.gdp,0);
  const selected=cityId==='all'?cities:cities.filter(c=>c.id===cityId);
  const facts=selected.map(c=>({cityId:c.id,name:c.name,year:c.dataYear,gdp:c.gdp,growth:c.growth,gdpRank:byGdp.findIndex(x=>x.id===c.id)+1,growthRank:byGrowth.findIndex(x=>x.id===c.id)+1,regionalShare:c.gdp/totalGdp*100,industryValues:c.industries,industryShares:c.industries.map(v=>v/c.gdp*100),sourceUrl:c.sourceUrl}));
  const sources=[...new Map(selected.map(c=>[c.sourceUrl,{title:`${c.sourceName??'广东省统计局'} · ${year} 全年地区生产总值及产业数据`,url:c.sourceUrl}])).values()];
  const lines=[`规则解读 · 数据基期：${year} 年。GDP 金额为当年价格，增速为统计来源公布的实际增速。`];
  if(cityId==='all') {
    const ranking = byGdp.slice(0, cities.length > 3 ? 4 : cities.length).map(c=>`${c.name}（${number(c.gdp)} 亿元）`).join('、');
    lines.push(`${region} GDP 合计 ${number(totalGdp)} 亿元。${cities.length > 3 ? `规模前四为 ${ranking}` : `本范围为精选 ${cities.length} 城，依规模为 ${ranking}`}。`);
    lines.push(`实际增速最高的是${byGrowth[0].name}（${percent(byGrowth[0].growth)}%）。单年增速不能直接代表长期趋势。`);
    const second=[...facts].sort((a,b)=>b.industryShares[1]-a.industryShares[1])[0];
    const third=[...facts].sort((a,b)=>b.industryShares[2]-a.industryShares[2])[0];
    lines.push(`第二产业占比最高为${second.name}（${percent(second.industryShares[1])}%）；第三产业占比最高为${third.name}（${percent(third.industryShares[2])}%）。范围仅含当前列出的城市。`);
  }else{
    const f=facts[0];
    lines.push(`${f.name} GDP 为 ${number(f.gdp)} 亿元，${cities.length > 1 ? `在${region}中排第 ${f.gdpRank}，占该范围合计 ${percent(f.regionalShare)}%；` : '当前范围仅含该城，不作范围内排名；'}${year} 年实际增速为 ${percent(f.growth)}%。`);
    lines.push(`第一、第二、第三产业增加值分别为 ${f.industryValues.map(number).join('、')} 亿元，占比分别为 ${f.industryShares.map(v=>`${percent(v)}%`).join('、')}。原表分项与合计可能有微小舍入差异。`);
    lines.push('产业占比描述当年产出结构，不能单独判断发展质量或解释因果。');
  }
  let projections;
  if(scenario){
    projections=selected.map(c=>scenarioProjection(c,scenario));
    const total=projections.reduce((s,p)=>s+p.projectedGdp,0);
    lines.push(`情景推演：把各市 ${year} 年实际增速加上 ${scenario.growthDelta>=0?'+':''}${scenario.growthDelta} 个百分点，作为逐年不变的假设年均增长率。到 ${scenario.year} 年，${cityId==='all'?region:selected[0].name}情景规模约为 ${number(total)} 亿元（固定 ${year} 年价格近似）。`);
    lines.push('这是数学情景假设，不是经济预测；未纳入未来价格变化、政策、投资、人口和外部冲击。');
  }
  return {answer:lines.join('\n\n'),sources,facts,totalGdp:round(totalGdp),...(projections?{projections}:{})};
}

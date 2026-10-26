import type { City } from '../types';

export const sumGDP = (cities: City[]) => cities.reduce((sum, city) => sum + city.gdp, 0);
export function projectValue(base: number, annualRate: number, year: number, baseYear = 2024) {
  if (![base, annualRate, year, baseYear].every(Number.isFinite) || base < 0 || annualRate <= -100 || year < baseYear || !Number.isInteger(year)) throw new Error('无效的推演参数');
  return base * Math.pow(1 + annualRate / 100, year - baseYear);
}
export function projectionSeries(cities: City[], delta: number, endYear = 2030) {
  const baseYear=cities[0]?.dataYear ?? 2024;
  if (cities.some(c=>c.dataYear!==baseYear)) throw new Error('不能混合不同基年');
  return Array.from({ length: endYear-baseYear+1 }, (_, i) => ({ year: baseYear+i, value: cities.reduce((sum, c) => sum + projectValue(c.gdp, c.growth + delta, baseYear+i,baseYear), 0) }));
}
export const number = (n: number, digits = 0) => n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const gdpFormat = (n: number) => n >= 10000 ? { value: (n / 10000).toFixed(2), unit: '万亿元' } : { value: number(n, 0), unit: '亿元' };
export function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

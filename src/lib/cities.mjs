export const normalizeCityQuery = query => String(query ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export function matchesCity(city, query) {
  const normalized = normalizeCityQuery(query);
  return [city.name, city.fullName, city.en, ...(city.aliases ?? [])].some(name => normalizeCityQuery(name).includes(normalized));
}

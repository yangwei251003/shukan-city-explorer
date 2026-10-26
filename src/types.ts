export interface City {
  id: string;
  name: string;
  fullName: string;
  en: string;
  coordinate: [number, number];
  gdp: number;
  growth: number;
  industries: [number, number, number];
  color: string;
  tag: string;
  description: string;
  dataYear: number;
  sourceUrl: string;
  aliases: string[];
  statPeriod: string;
  currency: 'CNY';
  amountUnit: string;
  priceBasis: string;
  sourceName: string;
  publishedAt: string;
  fetchedAt: string;
  revisionStatus: string;
  datasetVersion: string;
  population?: number | null;
  populationSourceUrl?: string | null;
  populationSourceName?: string | null;
  populationPublishedAt?: string | null;
  populationStatPeriod?: string | null;
  populationNote?: string;
  gdpPerCapita?: number | null;
  gdpPerCapitaBasis?: string;
  history?: HistoryPoint[];
}
export interface HistoryPoint { year:number; gdp:number; growth?:number; sourceUrl:string; sourceName?:string; publishedAt?:string; revisionStatus?:string; priceBasis?:string }
export interface RegionConfig { id:string; name:string; coverageLabel:string; memberCityIds:string[]; datasetIds:string[]; defaultDatasetId:string; aliases:string[]; map:{boundaryUrl:string;landUrl:string;regionLandUrl:string;bbox:[number,number,number,number];manifestUrl:string}; theme:{id:string;accent:string;sceneUrl:string;sceneAlt:string;focalPoint:string} }
export interface Dataset { id:string;year:number;label:string;cityIds:string[];url:string }
export interface Catalog {version:string;defaultRegionId:string;profiles:City[];regions:RegionConfig[];datasets:Dataset[]}
export interface AnswerContext {object:string;dataYear:number;statPeriod:string;datasetVersion:string;type:string;targetYear?:number}
export type Metric = 'gdp' | 'growth' | 'industry' | 'population' | 'gdpPerCapita';
export type Scene = 'nation' | 'overview' | 'weather' | 'scenario' | 'real3d';
export interface Weather {
  cityId: string;
  available: boolean;
  provider: string;
  fetchedAt: string;
  sourceUrl: string;
  current?: { time: string; temperature: number; humidity: number; precipitation: number; weatherCode: number; windSpeed: number };
  hourly?: { time: string; temperature: number; precipitation: number; probability: number }[];
  error?: string;
}

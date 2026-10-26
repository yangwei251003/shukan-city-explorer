/// <reference types="vite/client" />
import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as LibreMap, type StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection, Geometry, Position, Feature, Polygon, MultiPolygon } from 'geojson';
import type { City, Metric, RegionConfig } from '../types';
import { metricValue as dataMetricValue } from '../lib/v3';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';

// Vite must bundle the worker and its shared ESM dependency together in production.
maplibregl.setWorkerUrl(workerUrl);

export interface CityMapProps {
  region: RegionConfig;
  onHealthChange?: (health:string)=>void;
  cities: City[];
  selectedCityId: string;
  onSelectCity: (id: string) => void;
  metric: Metric;
  mode3d: boolean;
  showConnections: boolean;
  showLabels: boolean;
  resetKey: number;
  streetMap: boolean;
  onStatusChange?: (status: string) => void;
}

type Boundaries = FeatureCollection<Polygon | MultiPolygon>;
type GeometryData = { region: Boundaries; province: Boundaries | null; land: Boundaries | null; regionLand: Boundaries | null };
type CityMarker = { marker: maplibregl.Marker; button: HTMLButtonElement; value: HTMLSpanElement; city: City };
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const COLOR_STOPS = ['#183d38', '#256658', '#36957a', '#6eb592', '#d6bc79'];
const LOCAL_STATUS = '本地区域地图 · 可离线浏览';
const EMPTY_BOUNDARIES: Boundaries = { type: 'FeatureCollection', features: [] };
const LABEL_POSITIONS: Record<string, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
  '440100': { x: 12, y: -4, anchor: 'start' },
  '440600': { x: -12, y: 0, anchor: 'end' },
  '441900': { x: 12, y: 0, anchor: 'start' },
  '440300': { x: 12, y: 0, anchor: 'start' },
  '440400': { x: -12, y: 0, anchor: 'end' },
  '440700': { x: -12, y: 0, anchor: 'end' },
  '441200': { x: -12, y: 0, anchor: 'end' },
};

function localStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'local-background', type: 'background', paint: { 'background-color': '#081b1a' } }] };
}

function metricValue(city: City, metric: Metric) {
  if(metric==='population'||metric==='gdpPerCapita')return dataMetricValue(city,metric)??NaN;
  if (metric === 'growth') return city.growth;
  if (metric === 'industry') {
    const total = city.gdp;
    return total > 0 ? city.industries[1] / total * 100 : 0;
  }
  return city.gdp;
}

function metricText(city: City, metric: Metric) {
  const value = metricValue(city, metric);
  if(!Number.isFinite(value))return '暂缺';
  if(metric==='population')return `${value.toLocaleString('zh-CN')} 万人`;
  if(metric==='gdpPerCapita')return `${Math.round(value).toLocaleString('zh-CN')} 元`;
  if (metric === 'gdp') return `${(value / 10000).toFixed(2)} 万亿`;
  return `${value.toFixed(1)}%`;
}

function createCityMarker(city: City, map: LibreMap, currentProps: () => CityMapProps): CityMarker {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'prd-map-marker';
  button.setAttribute('role', 'button');
  button.setAttribute('aria-label', `查看${city.name}数据`);
  const dot = document.createElement('span');
  dot.className = 'prd-map-marker-dot';
  const name = document.createElement('span');
  name.className = 'prd-map-marker-name';
  name.textContent = city.name;
  const value = document.createElement('span');
  value.className = 'prd-map-marker-value';
  value.textContent = metricText(city, currentProps().metric);
  const label = document.createElement('span');
  label.className = 'prd-map-marker-label';
  const position = LABEL_POSITIONS[city.id] ?? { x: 12, y: 0, anchor: 'start' };
  label.style.left = `${position.x}px`;
  label.style.top = `${position.y}px`;
  label.style.transform = `translate(${position.anchor === 'end' ? '-100%' : position.anchor === 'middle' ? '-50%' : '0'}, -50%)`;
  label.append(name, value);
  button.append(dot, label);
  button.addEventListener('click', event => { event.stopPropagation(); currentProps().onSelectCity(city.id); });
  const marker = new maplibregl.Marker({ element: button, anchor: 'center', offset: [0, 0] }).setLngLat(city.coordinate).addTo(map);
  return { marker, button, value, city };
}

function normalized(city: City, cities: City[], metric: Metric) {
  const values = cities.map(item => metricValue(item, metric)).filter(Number.isFinite);
  if(!Number.isFinite(metricValue(city,metric))||!values.length)return 0;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum === minimum ? 0.5 : (metricValue(city, metric) - minimum) / (maximum - minimum);
}

function cityColor(city: City, cities: City[], metric: Metric) {
  if(!Number.isFinite(metricValue(city,metric)))return '#41524f';
  if(metric==='growth' && city.growth<0)return '#cda087';
  return COLOR_STOPS[Math.min(4, Math.floor(normalized(city, cities, metric) * 4.999))];
}

function measuredRegion(region: Boundaries, props: CityMapProps): Boundaries {
  return {
    ...region,
    features: region.features.map(feature => {
      const id = String(feature.properties?.id ?? feature.properties?.adcode ?? '');
      const city = props.cities.find(item => item.id === id);
      return {
        ...feature,
        id,
        properties: {
          ...feature.properties,
          id,
          color: city ? cityColor(city, props.cities, props.metric) : COLOR_STOPS[0],
          height: city&&Number.isFinite(metricValue(city,props.metric)) ? (props.metric==='growth' && city.growth<=0 ? 0 : 650 + normalized(city, props.cities, props.metric) * 4400) : 0,
        },
      };
    }),
  };
}

// Curves connect municipal centers for orientation only; they contain no traffic observations.
function connectionData(cities: City[]): FeatureCollection {
  const hub = cities.find(city => city.id === '440100') ?? cities[0];
  if (!hub) return EMPTY;
  return {
    type: 'FeatureCollection',
    features: cities.filter(city => city.id !== hub.id).map(city => {
      const [x1, y1] = hub.coordinate;
      const [x2, y2] = city.coordinate;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const control: Position = [(x1 + x2) / 2 - dy * 0.18, (y1 + y2) / 2 + dx * 0.18];
      const coordinates = Array.from({ length: 49 }, (_, index) => {
        const t = index / 48;
        return [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * control[0] + t ** 2 * x2,
          (1 - t) ** 2 * y1 + 2 * (1 - t) * t * control[1] + t ** 2 * y2];
      });
      return { type: 'Feature', properties: { schematic: true }, geometry: { type: 'LineString', coordinates } };
    }),
  };
}

function eachPosition(geometry: Geometry, callback: (position: Position) => void) {
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') callback(value as Position);
    else value.forEach(walk);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(item => eachPosition(item, callback));
  else walk(geometry.coordinates);
}

function boundsOf(features: Feature[]) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach(feature => eachPosition(feature.geometry, point => bounds.extend([point[0], point[1]])));
  return bounds;
}

function frameMap(map: LibreMap, geometry: GeometryData, props: CityMapProps, immediate = false) {
  const duration = immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100;
  const selected = props.cities.find(city => city.id === props.selectedCityId);
  if (selected) {
    map.flyTo({ center: selected.coordinate, zoom: props.streetMap ? 14.5 : 9.25, pitch: props.mode3d ? 48 : 0, bearing: 0, duration });
    return;
  }
  // The land intersection excludes offshore administrative areas while retaining
  // the complete land extent of every city in the regional overview.
  const bounds = geometry.regionLand?.features.length ? boundsOf(geometry.regionLand.features) : new maplibregl.LngLatBounds();
  if (bounds.isEmpty()) props.cities.forEach(city => bounds.extend(city.coordinate));
  if (bounds.isEmpty()) return;
  if (!geometry.regionLand?.features.length && props.cities.length) {
    const west = bounds.getWest() - 0.3;
    const south = bounds.getSouth() - 0.3;
    const east = bounds.getEast() + 0.3;
    const north = bounds.getNorth() + 0.3;
    bounds.extend([west, south]).extend([east, north]);
  }
  const narrow = map.getContainer().clientWidth < 600;
  map.fitBounds(bounds, {
    padding: { top: narrow ? 80 : 78, right: narrow ? 30 : 42, bottom: narrow ? 80 : 65, left: narrow ? 25 : 36 },
    maxZoom: props.selectedCityId === 'all' ? 8.1 : 10.5,
    pitch: props.mode3d ? 38 : 0,
    bearing: 0,
    duration,
  });
}

function addLayers(map: LibreMap, geometry: GeometryData, props: CityMapProps, online: boolean) {
  if (map.getSource('prd-region')) return;
  // The rectangular land extract is used to derive regionLand, not drawn as a
  // standalone plate: its clipped outer edges are not geographic coastlines.
  if (geometry.province && !online) {
    map.addSource('prd-province', { type: 'geojson', data: geometry.province });
    map.addLayer({ id: 'prd-province-outline', type: 'line', source: 'prd-province', paint: { 'line-color': '#4c6957', 'line-width': 0.6, 'line-opacity': 0.3, 'line-dasharray': [3, 4] } });
  }
  map.addSource('prd-administrative', { type: 'geojson', data: geometry.region });
  map.addLayer({ id: 'prd-administrative-outline', type: 'line', source: 'prd-administrative', paint: { 'line-color': '#85aa91', 'line-width': 0.8, 'line-opacity': 0.3, 'line-dasharray': [3, 5] } });
  map.addSource('prd-region', { type: 'geojson', data: measuredRegion(geometry.regionLand ?? EMPTY_BOUNDARIES, props), promoteId: 'id' });
  map.addLayer({ id: 'prd-region-fill', type: 'fill', source: 'prd-region', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': online ? 0.16 : 0.6 } });
  map.addLayer({
    id: 'prd-region-volume', type: 'fill-extrusion', source: 'prd-region',
    paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.6, 'fill-extrusion-vertical-gradient': true },
  });
  map.addLayer({ id: 'prd-region-edge', type: 'line', source: 'prd-region', paint: { 'line-color': '#90c4b0', 'line-width': 1, 'line-opacity': 0.64 } });
  map.addLayer({ id: 'prd-selected-glow', type: 'line', source: 'prd-region', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#e4cb8b', 'line-width': 7, 'line-blur': 5, 'line-opacity': 0.55 } });
  map.addLayer({ id: 'prd-selected-edge', type: 'line', source: 'prd-region', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#f0dba5', 'line-width': 1.8, 'line-opacity': 1 } });
  map.addSource('prd-connections', { type: 'geojson', data: connectionData(props.cities) });
  map.addLayer({ id: 'prd-connections-glow', type: 'line', source: 'prd-connections', paint: { 'line-color': '#dcca92', 'line-width': 4, 'line-blur': 3, 'line-opacity': 0.3 } });
  map.addLayer({ id: 'prd-connections-line', type: 'line', source: 'prd-connections', paint: { 'line-color': '#dcca92', 'line-width': 1, 'line-opacity': 0.7, 'line-dasharray': [3, 3] } });
  if (online) {
    const style = map.getStyle();
    const source = Object.keys(style.sources).find(key => style.sources[key].type === 'vector');
    // The regional metric volume is also a fill-extrusion, so it must not be used
    // to decide whether a separate OSM building layer already exists.
    if (source && !map.getLayer('prd-osm-buildings')) {
      map.addLayer({ id: 'prd-osm-buildings', type: 'fill-extrusion', source, 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-extrusion-color': '#8fb6a4', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.9 } });
    }
    const roadColors: Record<string, string> = {
      highway_minor: '#34463f', highway_major_inner: '#52695c',
      highway_major_casing: '#273d33', highway_motorway_inner: '#827b56',
      highway_motorway_casing: '#31463a', highway_path: '#2c4036',
    };
    Object.entries(roadColors).forEach(([id, color]) => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', color); });
  }
  syncLayers(map, geometry, props, online);
}

function syncLayers(map: LibreMap, geometry: GeometryData, props: CityMapProps, online: boolean) {
  const source = map.getSource('prd-region') as GeoJSONSource | undefined;
  if (!source) return;
  source.setData(measuredRegion(geometry.regionLand ?? EMPTY_BOUNDARIES, props));
  const volume = props.mode3d && !online;
  map.setLayoutProperty('prd-region-volume', 'visibility', volume ? 'visible' : 'none');
  // Both local OSM relations and OpenFreeMap tiles use verified WGS84 coordinates.
  ['prd-region-fill', 'prd-region-edge', 'prd-selected-glow', 'prd-selected-edge'].forEach(id => map.setLayoutProperty(id, 'visibility', 'visible'));
  map.setLayoutProperty('prd-region-fill', 'visibility', online ? 'none' : 'visible');
  map.setPaintProperty('prd-region-fill', 'fill-opacity', online ? 0.16 : volume ? 0.28 : 0.6);
  ['prd-selected-glow', 'prd-selected-edge'].forEach(id => map.setFilter(id, ['==', ['get', 'id'], props.selectedCityId]));
  ['prd-connections-glow', 'prd-connections-line'].forEach(id => map.setLayoutProperty(id, 'visibility', props.showConnections ? 'visible' : 'none'));
  if (map.getLayer('prd-osm-buildings')) map.setLayoutProperty('prd-osm-buildings', 'visibility', props.mode3d ? 'visible' : 'none');
}

async function readBoundary(url: string, signal: AbortSignal): Promise<Boundaries> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`区域数据读取失败 (${response.status})`);
  const data = await response.json() as Boundaries;
  if (data.type !== 'FeatureCollection' || !data.features?.length || data.features.some(feature => !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type))) {
    throw new Error('行政区几何格式无效');
  }
  return data;
}

export default function CityMap(props: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const markersRef = useRef<CityMarker[]>([]);
  const onlineRef = useRef(false);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [geometry, setGeometry] = useState<GeometryData | null>(null);
  const [fallback, setFallback] = useState(false);
  const [dataError, setDataError] = useState('');
  const [status, setStatus] = useState('正在读取本地行政区数据…');
  const [mapReady, setMapReady] = useState(false);
  const [onlineReady, setOnlineReady] = useState(false);
  const [retry,setRetry]=useState(0);
  const statusRef = useRef(status);
  const report = (text: string) => {
    if(geometry && !geometry.regionLand) text += ' · 城市指标图层未加载，暂显示边界与城市点';
    if (statusRef.current === text) return;
    statusRef.current = text;
    setStatus(text);
    propsRef.current.onStatusChange?.(text);
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readBoundary(props.region.map.boundaryUrl, controller.signal),
      Promise.resolve(null),
      Promise.resolve(null),
      readBoundary(props.region.map.regionLandUrl, controller.signal).catch(() => null),
    ]).then(([region, province, land, regionLand]) => {
      if (!controller.signal.aborted) {
        const expected=props.region.memberCityIds;
        if(expected.some(id=>!region.features.some(f=>String(f.properties?.id)===id)))throw Error('行政区与当前地区不一致');
        if(regionLand && expected.some(id=>!regionLand?.features.some(f=>String(f.properties?.id)===id)))regionLand=null;
        setDataError('');setGeometry({ region, province, land, regionLand });props.onHealthChange?.(regionLand?'complete':'partial');
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setDataError(error instanceof Error ? error.message : '行政区数据读取失败');
        report('本地行政区数据暂不可用');
        props.onHealthChange?.('failed');
      }
    });
    return () => controller.abort();
  }, [props.region.id,retry]);

  useEffect(() => {
    if (!geometry || !containerRef.current) return;
    let map: LibreMap;
    let resizeObserver: ResizeObserver | undefined;
    let alive = true;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: localStyle(),
        center: [(props.region.map.bbox[0]+props.region.map.bbox[2])/2,(props.region.map.bbox[1]+props.region.map.bbox[3])/2], zoom: 7.2,
        pitch: propsRef.current.mode3d ? 38 : 0,
        bearing: 0,
        maxPitch: 65, minZoom: 3, maxZoom: 17,
        renderWorldCopies: false,
        attributionControl: { compact: false, customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors · ODbL</a> | <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth</a>' },
      });
      mapRef.current = map;
      map.setMissingStyleImageResolver(id=>{
        if(map.hasImage(id))return;
        // Missing decorative patterns must not prevent the geographic layers from rendering.
        // POIs fall back to a simple location dot; patterns have a transparent fallback.
        const size=16,data=new Uint8Array(size*size*4);
        if(!id.includes('pattern'))for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          if((x-7.5)**2+(y-7.5)**2<20){const p=(y*size+x)*4;data[p]=157;data[p+1]=189;data[p+2]=172;data[p+3]=255;}
        }
        map.addImage(id,{width:size,height:size,data});
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), 'top-left');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 85, unit: 'metric' }), 'bottom-right');
      const createMarkers = () => {
        if (markersRef.current.length) return;
        markersRef.current = propsRef.current.cities.map(city => createCityMarker(city, map, () => propsRef.current));
      };
      map.on('style.load', () => {
        if (!alive) return;
        try {
          addLayers(map, geometry, propsRef.current, onlineRef.current);
          createMarkers();
          markersRef.current.forEach(({ button, value, city }) => {
            button.dataset.selected = String(city.id === propsRef.current.selectedCityId);
            button.style.display = propsRef.current.showLabels ? '' : 'none';
            value.textContent = metricText(city, propsRef.current.metric);
          });
          setMapReady(true);
          if (onlineRef.current) {
            clearTimeout(onlineTimerRef.current);
            setOnlineReady(true);
            report('在线街道与楼宇 · 放大查看城市细节');
          }
        } catch (error) {
          console.error('Map layers could not be initialized', error);
          setFallback(true);
          setOnlineReady(false);
          report('已启用二维兼容地图');
        }
      });
      map.once('load', () => {
        if (!alive) return;
        frameMap(map, geometry, { ...propsRef.current, streetMap: onlineRef.current }, true);
        if (!onlineRef.current) report(LOCAL_STATUS);
      });
      map.on('click', event => {
        if (!map.getLayer('prd-region-fill')) return;
        const features = map.queryRenderedFeatures(event.point, { layers: ['prd-region-fill', 'prd-region-volume'] });
        const id = String(features[0]?.properties?.id ?? '');
        if (propsRef.current.cities.some(city => city.id === id)) propsRef.current.onSelectCity(id);
      });
      map.on('mousemove', event => {
        if (map.getLayer('prd-region-fill')) {
          const hit = map.queryRenderedFeatures(event.point, { layers: ['prd-region-fill', 'prd-region-volume'] }).length;
          map.getCanvas().style.cursor = hit ? 'pointer' : '';
        }
      });
      map.on('webglcontextlost', () => { if (alive) { setFallback(true); setOnlineReady(false); report('图形加速不可用 · 已切换二维兼容地图'); } });
      map.on('error', event => {
        if (!alive) return;
        if (onlineRef.current) {
          clearTimeout(onlineTimerRef.current);
          onlineRef.current = false;
          setOnlineReady(false);
          report('在线地图不可用 · 已回到本地区域地图');
          map.setStyle(localStyle());
        } else {
          console.warn('Local map rendering error', event.error);
          if (/worker|webgl|gpu/i.test(event.error?.message ?? '')) {
            setFallback(true);
            setOnlineReady(false);
            report('图形引擎暂不可用 · 已启用二维兼容地图');
          }
        }
      });
      resizeObserver = new ResizeObserver(() => {
        map.resize();
        if (map.isStyleLoaded()) frameMap(map, geometry, propsRef.current, true);
      });
      resizeObserver.observe(containerRef.current);
    } catch (error) {
      console.warn('Using geographic SVG fallback', error);
      setFallback(true);
      report('图形加速不可用 · 已启用二维兼容地图');
    }
    return () => {
      alive = false;
      clearTimeout(onlineTimerRef.current);
      resizeObserver?.disconnect();
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [geometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geometry || !mapReady || !map.getSource('prd-region')) return;
    syncLayers(map, geometry, props, onlineRef.current);
    if (markersRef.current.length !== props.cities.length || markersRef.current.some(entry => !props.cities.some(city => city.id === entry.city.id))) {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current = props.cities.map(city => createCityMarker(city, map, () => propsRef.current));
    }
    markersRef.current.forEach(entry => {
      entry.city = props.cities.find(city => city.id === entry.city.id) ?? entry.city;
      const { button, value, city, marker } = entry;
      marker.setLngLat(city.coordinate);
      button.dataset.selected = String(city.id === props.selectedCityId);
      button.style.display = props.showLabels ? '' : 'none';
      value.textContent = metricText(city, props.metric);
    });
  }, [geometry, mapReady, props.cities, props.selectedCityId, props.metric, props.mode3d, props.showConnections, props.showLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && geometry && mapReady) frameMap(map, geometry, { ...propsRef.current, streetMap: onlineRef.current });
  }, [geometry, mapReady, onlineReady, props.selectedCityId, props.mode3d, props.resetKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || fallback) return;
    const controller = new AbortController();
    let done = false;
    if (!props.streetMap) {
      if (onlineRef.current) {
        onlineRef.current = false;
        setOnlineReady(false);
        map.setStyle(localStyle());
      }
      report(LOCAL_STATUS);
    } else {
      report('正在连接在线街道地图…');
      onlineTimerRef.current = setTimeout(() => {
        if (!done) {
          controller.abort();
          const hadOnlineStyle = onlineRef.current;
          onlineRef.current = false;
          setOnlineReady(false);
          report('在线地图连接超时 · 保留本地区域地图');
          if (hadOnlineStyle) map.setStyle(localStyle());
        }
      }, 10000);
      void fetch(STYLE_URL, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('Online style unavailable');
        const style = await response.json() as StyleSpecification;
        if (style.version !== 8 || !style.sources || !style.layers) throw new Error('Invalid map style');
        if (controller.signal.aborted) return;
        onlineRef.current = true;
        map.setStyle(style);
      }).catch(() => {
        if (controller.signal.aborted && done) return;
        if (!controller.signal.aborted) {
          done = true;
          clearTimeout(onlineTimerRef.current);
          report('在线地图不可用 · 保留本地区域地图');
        }
      });
    }
    return () => { done = true; controller.abort(); clearTimeout(onlineTimerRef.current); };
  }, [props.streetMap, mapReady, fallback]);

  return <div className="prd-city-map" data-online={onlineReady} data-fallback={fallback}>
    <div ref={containerRef} className="prd-city-map-canvas" aria-label={`${props.region.coverageLabel}交互地图`} />
    <div className="prd-city-map-vignette" aria-hidden="true" />
    {fallback && geometry && <BoundaryFallback geometry={geometry} props={props} />}
    {!geometry && <div className="prd-map-loading" role="status"><span className="prd-map-loading-orbit" />{dataError || '正在展开地区地图…'}</div>}
    {(dataError || (geometry && !geometry.regionLand)) && <div className="map-retry-panel" role="status"><span>{dataError?'行政区地图未加载':'城市指标图层未加载，暂显示边界与城市点'}</span><button onClick={()=>{setDataError('');setGeometry(null);setFallback(false);setRetry(n=>n+1);}}>重试地图</button></div>}
    {fallback && <div className="prd-map-fallback-badge">二维兼容视图</div>}
    {fallback && <div className="prd-map-fallback-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a> · <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a></div>}
  </div>;
}

function BoundaryFallback({ geometry, props }: { geometry: GeometryData; props: CityMapProps }) {
  const projection = useMemo(() => {
    const selected = props.cities.find(city => city.id === props.selectedCityId);
    const centers = selected ? [selected] : props.cities;
    const fitLand = !selected && geometry.regionLand?.features.length;
    const bounds = fitLand ? boundsOf(geometry.regionLand!.features) : new maplibregl.LngLatBounds();
    if (!fitLand) centers.forEach(city => bounds.extend(city.coordinate));
    if (!fitLand && centers.length) {
      const west = bounds.getWest() - 0.25;
      const south = bounds.getSouth() - 0.25;
      const east = bounds.getEast() + 0.25;
      const north = bounds.getNorth() + 0.25;
      bounds.extend([west, south]).extend([east, north]);
    }
    const west = bounds.getWest();
    const east = bounds.getEast();
    const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
    const north = mercatorY(bounds.getNorth());
    const south = mercatorY(bounds.getSouth());
    const width = (east - west) * Math.PI / 180;
    const height = north - south;
    const scale = Math.min(850 / width, 525 / height);
    return (point: Position) => [500 + ((point[0] - (west + east) / 2) * Math.PI / 180) * scale, 345 + ((north + south) / 2 - mercatorY(point[1])) * scale];
  }, [geometry, props.cities, props.selectedCityId, props.resetKey]);
  const pathFor = (feature: Feature<Polygon | MultiPolygon>) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map((point, index) => `${index ? 'L' : 'M'}${projection(point).map(number => number.toFixed(2)).join(',')}`).join(' ') + 'Z').join(' ')).join(' ');
  };
  const curves = connectionData(props.cities);
  return <svg className="prd-map-svg" viewBox="0 0 1000 720" role="img" aria-label="使用真实行政区边界绘制的珠三角二维地图">
    {geometry.province?.features.map((feature, index) => <path key={`province-${index}`} d={pathFor(feature)} fill="none" stroke="#4c6957" strokeWidth="0.6" strokeDasharray="3 4" opacity="0.3" />)}
    {geometry.region.features.map((feature, index) => <path key={`boundary-${index}`} d={pathFor(feature)} fill="none" stroke="#85aa91" strokeWidth="0.8" strokeDasharray="3 5" opacity="0.3" />)}
    {geometry.regionLand?.features.map(feature => {
      const id = String(feature.properties?.id ?? feature.properties?.adcode);
      const city = props.cities.find(item => item.id === id);
      const selected = props.selectedCityId === id;
      return <path key={id} d={pathFor(feature)} fill={city ? cityColor(city, props.cities, props.metric) : COLOR_STOPS[0]} fillOpacity={0.65} fillRule="evenodd" stroke={selected ? '#f0dba5' : '#83b39e'} strokeWidth={selected ? 2.5 : 1} className="prd-map-svg-region" role="button" tabIndex={0} aria-label={`查看${city?.name ?? feature.properties?.name}`} onClick={() => props.onSelectCity(id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelectCity(id); } }}><title>{city?.name} {city && metricText(city, props.metric)}</title></path>;
    })}
    {props.showConnections && curves.features.map((feature, index) => {
      if (feature.geometry.type !== 'LineString') return null;
      return <path key={`curve-${index}`} d={feature.geometry.coordinates.map((point, i) => `${i ? 'L' : 'M'}${projection(point).join(',')}`).join(' ')} fill="none" stroke="#dcca92" strokeWidth="1" strokeDasharray="4 5" opacity="0.65" pointerEvents="none" />;
    })}
    {props.showLabels && props.cities.map(city => {
      const [x, y] = projection(city.coordinate);
      const label = LABEL_POSITIONS[city.id] ?? { x: 12, y: 0, anchor: 'start' };
      return <g key={city.id} transform={`translate(${x},${y})`} className="prd-map-svg-label" onClick={() => props.onSelectCity(city.id)}>
        <circle r="3" fill="#f0dba5" stroke="#0b2521" strokeWidth="2" />
        <text x={label.x} y={label.y - 4} textAnchor={label.anchor}>{city.name}</text>
        <text x={label.x} y={label.y + 10} textAnchor={label.anchor} className="prd-map-svg-metric">{metricText(city, props.metric)}</text>
      </g>;
    })}
  </svg>;
}

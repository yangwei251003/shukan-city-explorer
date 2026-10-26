import { useId } from 'react';
import { number } from '../lib/metrics';
export function LineChart({ values, comparison, labels, unit = '', activeIndex, onSelect }: { values: number[]; comparison?: number[]; labels: string[]; unit?: string; activeIndex?: number; onSelect?: (index: number) => void }) {
  const gradient = useId().replaceAll(':', '');
  const width = 600, height = 155, left = 44, right = 12, top = 15, bottom = 30;
  const all = [...values, ...(comparison || [])].filter(Number.isFinite);
  if (!all.length) return <p className="empty-state">暂无可用数据</p>;
  const min = Math.min(...all) * .9, max = Math.max(...all) * 1.05;
  const x = (i: number) => left + i / Math.max(values.length - 1, 1) * (width - left - right);
  const y = (v: number) => top + (1 - (v - min) / (max - min || 1)) * (height - top - bottom);
  const points = (data: number[]) => data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${labels[0]}至${labels.at(-1)}，数值从${number(values[0], 1)}到${number(values.at(-1)!, 1)}${unit}`}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6fe1ba" stopOpacity=".2"/><stop offset="1" stopColor="#6fe1ba" stopOpacity="0"/></linearGradient></defs>
    {[0, 1, 2].map(i => { const v = min + (max - min) * i / 2; return <g key={i}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#263c3b" strokeDasharray="3 5"/><text x={left - 10} y={y(v) + 4} textAnchor="end" fill="#78918d" fontSize="10">{number(v, v < 100 ? 1 : 0)}</text></g>; })}
    <polygon points={`${x(0)},${height - bottom} ${points(values)} ${x(values.length - 1)},${height - bottom}`} fill={`url(#${gradient})`}/>
    {comparison && <polyline points={points(comparison)} fill="none" stroke="#6e8580" strokeWidth="1.8" strokeDasharray="5 5"/>}
    <polyline points={points(values)} fill="none" stroke="#8ce9c7" strokeWidth="2.5" strokeLinejoin="round"/>
    {values.map((v, i) => <g key={i} onClick={() => onSelect?.(i)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
      {(activeIndex === i || values.length < 9) && <circle cx={x(i)} cy={y(v)} r={activeIndex === i ? 5 : 3} fill={activeIndex === i ? '#f5cc85' : '#8ce9c7'} stroke="#132322" strokeWidth="2"/>}
      <title>{labels[i]}：{number(v, 2)}{unit}</title>
      {(i % Math.max(1, Math.floor(labels.length / 7)) === 0 || i === labels.length - 1) && <text x={x(i)} y={height - 7} textAnchor="middle" fill={activeIndex === i ? '#f5cc85' : '#78918d'} fontSize="10">{labels[i]}</text>}
    </g>)}
  </svg>;
}
export function IndustryChart({ industries }: { industries: number[] }) {
  const total = industries.reduce((a, b) => a + b, 0);
  const pct = industries.map(v => total ? v / total * 100 : 0);
  return <div className="industry-layout"><div className="industry-donut" style={{ background: `conic-gradient(#d8bf84 0 ${pct[0]}%, #68a7a0 ${pct[0]}% ${pct[0] + pct[1]}%, #8ce9c7 ${pct[0] + pct[1]}% 100%)` }}><div><strong>{pct[2].toFixed(1)}<small>%</small></strong><span>第三产业</span></div></div><div className="industry-legend">{['第一产业', '第二产业', '第三产业'].map((label, i) => <div key={label}><i style={{ background: ['#d8bf84', '#68a7a0', '#8ce9c7'][i] }}/><span>{label}</span><b>{pct[i].toFixed(1)}%</b></div>)}</div></div>;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {cities,buildingLayout,datasetNotice} from './data.mjs';
import {sumGDP,projectionSeries} from '../src/lib/metrics.ts';
import {metricValue,csvText} from '../src/lib/v3.ts';

test('Synthetic dataset has explicit scope and internally consistent totals',()=>{
  assert.match(datasetNotice,/合成样例，非原比赛真实场景/);
  assert.equal(cities.length,3);
  assert.equal(new Set(cities.map(c=>c.id)).size,3);
  for(const c of cities){
    assert.equal(c.revisionStatus,'synthetic');
    assert.deepEqual(c.coordinate,[0,0]);
    assert.equal(c.industries.reduce((a,b)=>a+b),c.gdp);
    assert.equal(metricValue(c,'gdpPerCapita'),c.gdp/c.population*10000);
  }
  assert.equal(sumGDP(cities),3900);
});
test('Demo scenario uses each city growth and includes an unchanged base year',()=>{
  const series=projectionSeries(cities,2,2030);
  assert.equal(series[0].year,2025);
  assert.equal(series[0].value,3900);
  const independent=cities.reduce((sum,c)=>sum+c.gdp*(1+(c.growth+2)/100)**5,0);
  assert.ok(Math.abs(series.at(-1).value-independent)<1e-8);
});
test('Procedural geometry is deterministic, bounded and has no map/model input',()=>{
  const layout=buildingLayout(7);
  assert.equal(layout.length,36);
  assert.deepEqual(layout,buildingLayout(7));
  assert.notDeepEqual(layout,buildingLayout(19));
  assert.ok(layout.every(b=>b.height>0&&b.height<5.3&&Math.abs(b.x)<5&&Math.abs(b.z)<5));
  assert.throws(()=>buildingLayout(1,101));
});
test('Export keeps the synthetic disclaimer and escapes CSV values',()=>{
  const text=csvText([[datasetNotice],['青屿','a"b']]);
  assert.ok(text.includes(datasetNotice));
  assert.ok(text.includes('"a""b"'));
});

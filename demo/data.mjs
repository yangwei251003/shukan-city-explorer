/** Deterministic fictional data; no surveys, accounts or real city locations. */
export const datasetNotice = '合成样例，非原比赛真实场景；所有统计、年份与空间布局仅用于软件演示。';
const sourceUrl = 'https://github.com/yangwei251003/shukan-city-explorer/blob/main/demo/data.mjs';
export const cities = [
  {id:'demo-a',name:'青屿',en:'Qingyu',gdp:1200,growth:4.2,population:80,industries:[60,480,660],color:'#76e1c2',tag:'制造与服务',seed:7},
  {id:'demo-b',name:'星港',en:'Xinggang',gdp:1800,growth:6.1,population:110,industries:[54,666,1080],color:'#80b5ff',tag:'创新与港湾',seed:19},
  {id:'demo-c',name:'云原',en:'Yunyuan',gdp:900,growth:2.8,population:60,industries:[90,315,495],color:'#d8b884',tag:'农业与生活',seed:31},
].map(c=>({...c,fullName:`虚构样例城市·${c.name}`,coordinate:[0,0],aliases:[c.name,c.en],
  description:`${c.name}为虚构样例，与任何真实城市无对应关系。`,dataYear:2025,statPeriod:'合成基期2025',
  currency:'CNY',amountUnit:'演示亿元',priceBasis:'合成现价指标；非统计观测',sourceName:'确定性演示数据',sourceUrl,
  publishedAt:'2026-10-26',fetchedAt:'2026-10-26',revisionStatus:'synthetic',datasetVersion:'synthetic-v1',
  populationSourceName:'合成样例',populationSourceUrl:sourceUrl,populationStatPeriod:'合成基期',
  history:Array.from({length:7},(_,i)=>({year:2019+i,gdp:Number((c.gdp/(1+c.growth/100)**(6-i)).toFixed(2)),growth:c.growth,sourceUrl,sourceName:'公式生成的样例历史'}))
}));

export function buildingLayout(seed, count=36) {
  if(!Number.isInteger(seed)||!Number.isInteger(count)||count<1||count>100)throw new Error('Invalid synthetic layout parameters');
  let state=seed>>>0;
  const rand=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  return Array.from({length:count},(_,i)=>({
    x:(i%6-2.5)*1.7,z:(Math.floor(i/6)-2.5)*1.7,
    width:0.7+rand()*0.55,depth:0.7+rand()*0.55,height:0.7+rand()*4.5,
  }));
}

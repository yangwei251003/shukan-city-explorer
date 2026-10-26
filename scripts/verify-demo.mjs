import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {cities,datasetNotice} from '../demo/data.mjs';

const server=spawn(process.execPath,['scripts/preview-demo.mjs'],{stdio:'ignore'});
const base='http://127.0.0.1:4198/shukan-city-explorer/';
let browser;
const errors=[],badResponses=[],external=[];
try{
  for(let i=0;i<100;i++){
    try{if((await fetch(base)).ok)break;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)badResponses.push(r.status());});
  page.on('request',r=>{if(r.url().startsWith('http')&&!r.url().startsWith(base))external.push(r.url());});
  await mkdir('docs/images',{recursive:true});
  const routes=['overview','compare','scenario','models','sources'];
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    for(const route of routes){
      const response=await page.goto(`${base}#/${route}`,{waitUntil:'networkidle'});
      if(response)assert.equal(response.status(),200);
      await page.getByRole('heading',{level:1}).waitFor();
      assert.ok(await page.getByRole('note').innerText().then(t=>t.includes('合成样例，非原比赛真实场景')));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflow ${width}`);
      if(route==='models'){
        await page.locator('canvas').waitFor();
        assert.ok(await page.locator('canvas').evaluate(c=>!!c.getContext('webgl2')));
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}#/overview`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/星港 创新与港湾/}).click();
  assert.equal(await page.locator('.city-detail h2').innerText(),'星港');
  await page.getByLabel('比较指标').selectOption('population');
  assert.equal(await page.locator('.ranking-row').first().locator('span').innerText(),'星港');
  await page.screenshot({path:'docs/images/shukan-demo-home.png'});
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出样例 CSV ↓'}).click();
  const download=await downloadPromise;
  const stream=await download.createReadStream();let csv='';for await(const part of stream)csv+=part.toString('utf8');
  assert.ok(csv.includes(datasetNotice));assert.ok(csv.includes('青屿'));
  await page.getByRole('link',{name:'情景推演',exact:true}).click();
  await page.getByTestId('scenario-a').waitFor();
  const parse=text=>Number(text.replaceAll(',',''));
  const expectedA=cities.reduce((n,c)=>n+c.gdp*(1+c.growth/100)**5,0);
  assert.ok(Math.abs(parse(await page.getByTestId('scenario-a').innerText())-expectedA)<0.01);
  const previousB=parse(await page.getByTestId('scenario-b').innerText());
  await page.getByLabel('情景 B 增速调整').fill('3');
  await page.waitForFunction(previous=>Number(document.querySelector('[data-testid="scenario-b"]').textContent.replaceAll(',',''))>previous,previousB);
  await page.getByLabel('青屿',{exact:true}).uncheck();
  await page.getByLabel('星港',{exact:true}).uncheck();
  await page.getByLabel('云原',{exact:true}).uncheck();
  await page.getByRole('status').filter({hasText:'请选择至少一座样例城市'}).waitFor();
  await page.getByRole('link',{name:'合成街区',exact:true}).click();
  await page.locator('canvas').waitFor();
  await page.getByLabel('合成街区城市').selectOption('demo-c');
  await page.screenshot({path:'docs/images/shukan-demo-blocks.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('link',{name:'探索样例',exact:true}).click();
  await page.screenshot({path:'docs/images/shukan-demo-mobile.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(external,[]);
  const report={status:'PASS',browser:browser.version(),routeChecks:10,viewports:[1440,390],nestedPath:'/shukan-city-explorer/',scriptErrors:0,httpErrors:0,externalRequests:0,webgl2:true,scenarioIndependentFormula:true,csvDisclaimer:true,remoteDeploymentTested:false};
  await writeFile('docs/demo-browser-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill();}

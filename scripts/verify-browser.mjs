import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {createApp} from '../server/index.mjs';

// Optional acceptance on a GPU-capable workstation/private runner. Never started
// by build/verify:cpu, and never uploads or publishes project content.
const root=fileURLToPath(new URL('../',import.meta.url));
const help='Run npm run build first. Then SHUKAN_BROWSER_PATH may point to an installed Chrome/Edge. npm run verify:browser starts an isolated local service with upstream requests disabled.';
if(process.argv.includes('--help')){console.log(help);process.exit(0);}
if(!fs.existsSync(path.join(root,'dist/index.html')))throw Error(help);
const out=path.join(root,'docs/v3.5-evidence/browser-final');fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),appVersion:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,externalNetwork:'disabled in browser routing and server fetch',status:'running',runs:[]};
const app=createApp({root,env:{},fetchImpl:async()=>{throw Error('External access disabled by acceptance runner');}});
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:!process.argv.includes('--headed'),...(process.env.SHUKAN_BROWSER_PATH?{executablePath:process.env.SHUKAN_BROWSER_PATH}:{channel:process.platform==='win32'?'msedge':'chromium'})});
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/models/manifest.json'),'utf8'));
 const regions={'610100':'guanzhong','340100':'yangtze','310000':'yangtze','440100':'prd','440300':'prd'};
 const cases=[...manifest.models.map(model=>({model,width:1440})),...[390,430,768].map(width=>({model:manifest.models.find(m=>m.city==='上海'),width}))];
 for(const {model,width} of cases){
  const run={model:model.id,width,logs:[],externalRequests:[],status:'running'};report.runs.push(run);
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,hasTouch:width<800,reducedMotion:width===390?'reduce':'no-preference',serviceWorkers:'block'});
  try{
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();run.externalRequests.push(url.href);return route.abort();});
   await context.addInitScript(()=>{localStorage.setItem('shukan.intro.v1','seen');localStorage.setItem('shukan.onboarding.v3',JSON.stringify({dismissed:true,completed:true}));});
   const page=await context.newPage();page.on('console',m=>{if(['error','warning'].includes(m.type()))run.logs.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>run.logs.push({type:'pageerror',text:e.message}));
   await page.goto(`${origin}/?v=0.3.5#/${regions[model.cityId]}/real3d/${model.cityId}`,{waitUntil:'domcontentloaded'});
   const viewer=page.locator('.real-world-canvas');await viewer.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.real-world-canvas')?.getAttribute('data-model-state')==='ready',{},{timeout:90000});
   await page.waitForTimeout(1000);
   run.visibleTiles=Number(await viewer.getAttribute('data-visible-models'));assert.ok(run.visibleTiles>0);
   run.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(run.overflow,false);
   const perspectives=page.getByRole('group',{name:'场景视角'});
   for(const landmark of model.landmarks??[]){await perspectives.getByRole('button',{name:landmark.name,exact:true}).click();await page.waitForTimeout(1100);assert.equal(await perspectives.getByRole('button',{name:landmark.name,exact:true}).getAttribute('aria-pressed'),'true');}
   await perspectives.getByRole('button',{name:'全景',exact:true}).click();
   const atmosphere=page.getByRole('group',{name:'场景氛围'});
   await atmosphere.getByRole('button',{name:'暮色',exact:true}).click();await page.waitForTimeout(700);
   await page.locator('.real-world-viewer').screenshot({path:path.join(out,`${model.id}-${width}-dusk.png`)});
   await atmosphere.getByRole('button',{name:'日景',exact:true}).click();
   const pause=atmosphere.getByRole('button',{name:'暂停环境',exact:true});if(await pause.count())await pause.click();
   const time=await viewer.getAttribute('data-atmosphere-time');await page.waitForTimeout(600);assert.equal(await viewer.getAttribute('data-atmosphere-time'),time);
   await atmosphere.getByRole('button',{name:'播放环境',exact:true}).click();await page.waitForTimeout(600);assert.notEqual(await viewer.getAttribute('data-atmosphere-time'),time);
   const quality=page.locator('.real-world-quality');await quality.click();await page.waitForTimeout(600);assert.equal(await quality.textContent(),'流畅优先');await quality.click();await page.waitForTimeout(600);assert.equal(await quality.textContent(),'精细优先');
   await page.getByRole('button',{name:'放大实景',exact:true}).click();await page.getByRole('button',{name:'实景视角复位',exact:true}).click();
   await page.locator('.real-world-viewer').screenshot({path:path.join(out,`${model.id}-${width}-day.png`)});
   run.status='passed';assert.deepEqual(run.logs,[]);assert.deepEqual(run.externalRequests,[]);
  }catch(error){run.status='failed';run.error=String(error);throw error;}finally{await context.close();}
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`Browser acceptance: ${report.status}. ${out}`);}

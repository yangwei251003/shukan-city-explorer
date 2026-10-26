import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/competition-team-20261007');
const pack=path.join(out,'数瞰-评委提交版');
const shots=path.join(out,'作品截图-8张');
await fs.mkdir(shots,{recursive:true});
const {createApp}=await import(pathToFileURL(path.join(pack,'server/index.mjs')).href);
const server=await new Promise(resolve=>{const s=createApp({root:pack,env:{}}).listen(0,'127.0.0.1',()=>resolve(s));});
const origin=`http://127.0.0.1:${server.address().port}`;
const result={origin,site:'updated production build',screenshots:[],errors:[],httpFailures:[],checks:[]};
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1050},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',acceptDownloads:true});
 await context.addInitScript(()=>{localStorage.setItem('shukan.intro.v1','seen');localStorage.setItem('shukan.onboarding.v3',JSON.stringify({dismissed:true,completed:true}));});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)result.httpFailures.push({url:r.url(),status:r.status()});});
 const shot=async(name,locator)=>{await page.locator('.toast').waitFor({state:'hidden',timeout:10000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(160);await (locator??page).screenshot({path:path.join(shots,name+'.png'),animations:'disabled'});result.screenshots.push(name+'.png');};
 const goto=async(hash)=>{await page.goto(origin+'/#/'+hash);await page.locator('.app-shell').waitFor();await page.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('aria-busy')==='false');};
 await goto('prd/nation/all');await page.getByRole('combobox',{name:'搜索已接入城市'}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.national-ranks li').length>0);await shot('01-全国总览与城市探索');
 await page.getByRole('combobox',{name:'搜索已接入城市'}).fill('深圳');await page.getByRole('option').first().click();await page.getByRole('combobox',{name:'选择地区'}).waitFor();await page.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('aria-busy')==='false');await shot('02-深圳城市总览与指标');
 await page.getByRole('button',{name:'打开城市对比',exact:true}).click();assert.equal(await page.locator('.compare-cards article').count(),3);await shot('03-三城经济与产业对比');await page.getByRole('button',{name:'关闭弹窗'}).click();
 await page.getByRole('button',{name:'发展推演',exact:true}).click();await page.getByRole('button',{name:'积极',exact:true}).click();await page.getByRole('button',{name:'把当前参数保存为情景 A'}).click();await page.getByRole('button',{name:'审慎',exact:true}).click();await shot('04-双情景发展路径');
 await page.getByRole('button',{name:'气象洞察',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('.temperature')||!!document.querySelector('.weather-pending.unavailable'),null,{timeout:25000});result.weather=await page.locator('.insight-panel').innerText();await shot('05-气象洞察与预报状态');
 await goto('yangtze/real3d/310000');await page.waitForFunction(()=>document.querySelector('.real-world-canvas')?.getAttribute('data-model-state')==='ready',null,{timeout:90000});await page.getByRole('group',{name:'场景视角'}).getByRole('button',{name:'东方明珠',exact:true}).click();await page.waitForTimeout(1100);await shot('06-上海城市实景与地标');
 await page.locator('#product-intro-entry').click();await page.getByRole('button',{name:'介绍影片',exact:true}).click();await page.locator('video').evaluate(v=>{v.muted=true;v.load();});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.2);await page.locator('video').evaluate(v=>v.pause());await shot('07-站内介绍与章节导览');
 await page.getByRole('button',{name:'关于团队',exact:true}).click();
 const team=page.locator('.pi-content-team');
 for(const text of ['广州科技职业技术大学','陈毓秀','韦一文','杨炜晨','翁宇航','陈立军','郭宇','林纳川'])assert.ok((await team.innerText()).includes(text));
 assert.equal(await team.locator('.pi-role').count(),5);await shot('08-团队成员院校与指导教师');
 await page.locator('.product-intro-card').screenshot({path:path.join(out,'数瞰-团队页面效果.png'),animations:'disabled'});
 result.checks.push('original about-team area, school, five names and two teachers visible');
 for(const width of [390,768]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await team.locator('.pi-role').count(),5);}
 result.checks.push('390/768 team layouts have no horizontal document overflow');
 await page.getByRole('button',{name:'收起介绍，继续探索'}).click();await page.locator('.product-intro-card').waitFor({state:'hidden'});result.checks.push('close team and resume website');
 assert.deepEqual(result.errors,[]);result.status='passed';
}catch(error){result.status='failed';result.error=String(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'内部检查记录.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,shots:result.screenshots.length,error:result.error,weatherAvailable:result.weather?.includes('有效时刻')},null,2));}

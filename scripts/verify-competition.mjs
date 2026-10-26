import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

const project=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(project,'artifacts/competition-final-20261006');
const root=process.env.SHUKAN_RELEASE_ROOT||path.join(out,'数瞰-参赛完整包');
const evidence=path.join(out,'evidence');
const screenshots=path.join(out,'单独上传材料/作品截图');
await fs.mkdir(evidence,{recursive:true});await fs.mkdir(screenshots,{recursive:true});
const report={startedAt:new Date().toISOString(),root,status:'running',launcher:null,browsers:[]};
let child,browser,server;
try{
 // Exercise the actual CMD entry, bundled executable and server from another CWD.
 const cmd=path.join(root,'启动数瞰.cmd');
 child=spawn('cmd.exe',['/d','/c',cmd,'--no-browser'],{cwd:out,windowsHide:true,env:{...process.env,SHUKAN_PORT:'0'},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
 const url=await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('CMD launch timed out: '+errors)),20000);const onData=()=>{const found=output.match(/SHUKAN_URL=(http:\/\/127\.0\.0\.1:\d+\/)/);if(found){clearTimeout(deadline);child.stdout.off('data',onData);resolve(found[1]);}};child.stdout.on('data',onData);child.once('error',reject);});
 assert.equal((await fetch(url+'api/health').then(r=>r.json())).dataReady,true);
 assert.match(await fetch(url).then(r=>r.text()),/数瞰/);
 assert.equal((await fetch(url+'media/shukan-tour.mp4',{headers:{Range:'bytes=0-127'}})).status,206);
 report.launcher={status:'passed',url,executable:'runtime/node.exe',fromDifferentCwd:true,mediaRange:206};
 // Stop only this runner's own CMD process and its children.
 await new Promise(resolve=>{const kill=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});kill.once('exit',resolve);});child=null;
 const {createApp}=await import(pathToFileURL(path.join(root,'server/index.mjs')).href);
 server=await new Promise(resolve=>{const s=createApp({root,env:{},fetchImpl:async()=>{throw Error('Acceptance: external upstream disabled');}}).listen(0,'127.0.0.1',()=>resolve(s));});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const catalog=JSON.parse(await fs.readFile(path.join(root,'public/data/catalog.json'),'utf8'));
 for(const channel of ['chrome','msedge']){
  browser=await chromium.launch({channel,headless:true});
  const run={channel,status:'running',checks:[],logs:[],external:[],failedRequests:[]};report.browsers.push(run);
  const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();run.external.push(route.request().url());return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',e=>run.logs.push(e.message));page.on('console',m=>{if(m.type()==='error')run.logs.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)run.failedRequests.push({url:r.url(),status:r.status()});});
  const shot=async(name,locator)=>{if(channel==='chrome')await (locator??page).screenshot({path:path.join(screenshots,name+'.png')});};
  const goto=async(hash)=>{await page.goto(origin+'/'+(hash?'#/'+hash:''));await page.locator('.region-loading').waitFor({state:'hidden'});};
  await goto();await page.locator('.product-intro-card').waitFor();
  await shot('01-初次见面');
  await page.getByRole('button',{name:'介绍影片',exact:true}).click();
  const player=page.locator('video');await player.evaluate(v=>{v.muted=true;v.load();});
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await player.evaluate(v=>v.play());
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.3);
  run.checks.push('字幕配乐片播放、1080p、Range');assert.equal(await player.evaluate(v=>v.videoWidth),1920);
  await page.getByRole('button',{name:'给未来一个假设',exact:false}).click();
  assert.ok(await player.evaluate(v=>v.currentTime)>58);
  await page.getByRole('button',{name:'收起介绍，继续探索'}).click();await page.locator('.product-intro-card').waitFor({state:'hidden'});
  run.checks.push('章节跳转与退出');
  await page.getByRole('combobox',{name:'搜索已接入城市'}).waitFor();await page.locator('.ranking-empty').waitFor({state:'hidden'});await shot('02-全国探索');
  await page.getByRole('combobox',{name:'搜索已接入城市'}).fill('shenzhen');await page.getByRole('option').first().click();
  await page.getByRole('combobox',{name:'选择地区'}).waitFor();assert.match(page.url(),/overview\/440300/);run.checks.push('拼音搜索进入深圳');
  await page.getByRole('group',{name:'地图指标'}).getByRole('button',{name:'常住人口',exact:true}).click();await shot('03-深圳城市观察');
  const exported=page.waitForEvent('download');await page.getByRole('button',{name:'导出数据',exact:true}).click();const data=await exported;
  const dataPath=path.join(evidence,channel+'-statistics.csv');await data.saveAs(dataPath);assert.match(await fs.readFile(dataPath,'utf8'),/"版本"/);run.checks.push('统计CSV下载含版本');
  await page.getByRole('button',{name:'打开城市对比',exact:true}).click();
  while(await page.locator('.compare-city-options button.active').count())await page.locator('.compare-city-options button.active').first().click();
  for(const name of ['深圳','广州','佛山'])await page.locator('.compare-city-options').getByRole('button',{name,exact:true}).click();
  assert.equal(await page.locator('.compare-cards article').count(),3);await shot('04-三城对比');
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();run.checks.push('三城对比');
  await page.getByRole('button',{name:'发展推演',exact:true}).click();
  await page.getByRole('button',{name:'积极',exact:true}).click();await page.getByRole('button',{name:'把当前参数保存为情景 A'}).click();
  await page.getByRole('button',{name:'审慎',exact:true}).click();await page.getByRole('slider',{name:'年均增长率调整'}).focus();await page.keyboard.press('ArrowRight');
  const scenario=page.waitForEvent('download');await page.getByRole('button',{name:'导出情景结果'}).click();await (await scenario).saveAs(path.join(evidence,channel+'-scenario.csv'));
  await shot('05-双情景发展路径');run.checks.push('A/B参数与情景CSV');
  await page.getByRole('button',{name:'分析助手',exact:true}).click();await page.getByRole('textbox',{name:'向分析助手提问'}).fill('比较广州和深圳的经济规模');await page.getByRole('button',{name:'发送问题'}).click();
  await page.locator('.chat-message.assistant').waitFor();const answer=await page.locator('.chat-message.assistant').innerText();assert.match(answer,/广州/);assert.match(answer,/深圳/);await shot('06-有据的本地规则解读');
  await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();run.checks.push('离线规则多城解读');
  await page.getByRole('button',{name:'数据来源与说明',exact:true}).click();await page.locator('.source-content').waitFor();await shot('07-数据来源与口径');await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
  for(const region of catalog.regions){await goto(region.id+'/overview/all');assert.equal(await page.getByRole('combobox',{name:'选择地区'}).inputValue(),region.id);assert.equal(await page.locator('.city-item').count(),region.memberCityIds.length);}
  run.checks.push('9范围深链接与成员');
  await goto('middle-yangtze/overview/360100');assert.match(await page.locator('.population-summary').innerText(),/暂缺/);run.checks.push('南昌缺失人口保留暂缺');
  await goto('prd/weather/440300');await page.getByRole('heading',{name:'气象数据暂不可用'}).waitFor();run.checks.push('离线天气诚实降级');
  await goto('prd/nation/all');await page.getByRole('button',{name:'把两个区域放在一起看',exact:false}).click();await page.getByRole('combobox',{name:'对比区域B'}).selectOption('yangtze');await page.locator('.region-comparison-cards').waitFor();await shot('08-同年精选区域比较');await page.getByRole('button',{name:'关闭弹窗'}).click();run.checks.push('同年区域比较');
  await goto('yangtze/real3d/310000');await page.waitForFunction(()=>document.querySelector('.real-world-canvas')?.getAttribute('data-model-state')==='ready',null,{timeout:90000});
  await page.getByRole('group',{name:'场景视角'}).getByRole('button',{name:'东方明珠',exact:true}).click();await page.waitForTimeout(1100);await shot('09-上海地标近景',page.locator('.real-world-viewer'));
  await page.getByRole('button',{name:'实景查看器全屏'}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);run.checks.push('实景全屏/Esc');
  await page.getByRole('group',{name:'场景视角'}).getByRole('button',{name:'全景',exact:true}).click();await page.getByRole('group',{name:'场景氛围'}).getByRole('button',{name:'暮色',exact:true}).click();await page.waitForTimeout(800);await shot('10-上海暮色实景',page.locator('.real-world-viewer'));
  await goto('prd/nation/all');await page.getByRole('button',{name:'路演模式',exact:true}).click();await page.getByRole('dialog',{name:'路演控制'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'路演控制'}).waitFor({state:'hidden'});run.checks.push('路演进入与Esc退出');
  for(const width of [390,768]){await page.setViewportSize({width,height:950});for(const route of ['prd/nation/all','prd/overview/440300','prd/scenario/440300']){await goto(route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}}
  run.checks.push('390/768窗口核心页面无横向溢出');
  assert.deepEqual(run.logs,[]);assert.deepEqual(run.external,[]);assert.deepEqual(run.failedRequests,[]);run.status='passed';
  await context.close();await browser.close();browser=null;
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=String(error);const last=report.browsers.at(-1);if(last?.status==='running')last.status='failed';process.exitCode=1;}
finally{
 if(child){await new Promise(resolve=>{const kill=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});kill.once('exit',resolve);});}
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(evidence,'competition-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}

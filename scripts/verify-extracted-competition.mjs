import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/competition-final-20261006');
const unpacked=path.join(out,'解压验证/数瞰-参赛完整包');
const report=JSON.parse(await fs.readFile(path.join(out,'交付文件校验.json'),'utf8'));
let browser,child;
const guard=await new Promise(resolve=>{const s=createServer((q,r)=>r.end('Acceptance port guard'));s.listen(0,'127.0.0.1',()=>resolve(s));});
try{
 const occupied=guard.address().port;
 child=spawn('cmd.exe',['/d','/c',path.join(unpacked,'启动数瞰.cmd'),'--no-browser'],{cwd:out,windowsHide:true,env:{...process.env,SHUKAN_PORT:String(occupied)},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const origin=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('No extracted service URL: '+stderr)),20000);const check=()=>{const match=stdout.match(/SHUKAN_URL=(http:\/\/127\.0\.0\.1:\d+)\//);if(match){clearTimeout(t);child.stdout.off('data',check);resolve(match[1]);}};child.stdout.on('data',check);child.once('error',reject);});
 assert.notEqual(new URL(origin).port,String(occupied));
 const health=await fetch(origin+'/api/health').then(r=>r.json());assert.equal(health.dataReady,true);
 assert.equal(await fetch(`http://127.0.0.1:${occupied}`).then(r=>r.text()),'Acceptance port guard');
 const media=await fetch(origin+'/media/shukan-tour.mp4',{headers:{Range:'bytes=0-127'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,128);
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('.product-intro-card').waitFor();await page.getByRole('button',{name:'我想自己探索',exact:false}).click();await page.locator('.product-intro-card').waitFor({state:'hidden'});
 const search=page.getByRole('combobox',{name:'搜索已接入城市'});await search.fill('深圳');await page.getByRole('option').first().click();await page.getByRole('combobox',{name:'选择地区'}).waitFor();assert.match(page.url(),/overview\/440300/);
 await page.screenshot({path:path.join(out,'evidence/extracted-running.png')});assert.deepEqual(errors,[]);
 report.extractedStartup='passed';report.extractedCore='national entry, Shenzhen search, real page';report.occupiedPortFallback='passed; existing guard still serves';report.extractedMediaRange=206;report.extractedPageErrors=errors;report.bundledExecutable='runtime/node.exe';
}catch(e){report.extractedStartup='failed';report.error=String(e);process.exitCode=1;}
finally{await browser?.close();if(child)await new Promise(resolve=>{const p=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});p.once('exit',resolve);});await new Promise(resolve=>guard.close(resolve));await fs.writeFile(path.join(out,'交付文件校验.json'),JSON.stringify(report,null,2));console.log(report);}

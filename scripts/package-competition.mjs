import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import crypto from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/competition-final-20261006');
const release=path.join(out,'数瞰-参赛完整包');
const source=path.join(release,'source-code');
await fs.mkdir(source,{recursive:true});
const copy=async(a,b)=>{await fs.mkdir(path.dirname(b),{recursive:true});await fs.cp(a,b,{recursive:true});};
for(const name of ['src','server','tests'])await copy(path.join(root,name),path.join(source,name));
for(const name of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.env.example','THIRD_PARTY_NOTICES.md','DATA_SOURCES.md'])await copy(path.join(root,name),path.join(source,name));
await copy(path.join(root,'scripts/pipeline'),path.join(source,'scripts/pipeline'));
for(const name of ['verify-browser.mjs','start-local.mjs'])await copy(path.join(root,'scripts',name),path.join(source,'scripts',name));
for(const folder of ['derived','references'])await copy(path.join(root,'source-data/v3.5-render',folder),path.join(source,'source-data/v3.5-render',folder));
await fs.mkdir(path.join(source,'source-data/v3'),{recursive:true});
await copy(path.join(root,'source-data/v3.3-population/nc-2024-official.html'),path.join(source,'source-data/v3.3-population/nc-2024-official.html'));
await fs.mkdir(path.join(source,'docs/v3.5-evidence'),{recursive:true});
for(const name of ['compression-audit.json','gltf-audit.json'])await copy(path.join(root,'docs/v3.5-evidence',name),path.join(source,'docs/v3.5-evidence',name));
await copy(path.join(root,'public'),path.join(source,'public'));
for(const film of ['shukan-tour.mp4','shukan-tour-no-music.mp4'])await fs.rm(path.join(source,'public/media',film));
await copy(path.join(out,'数瞰-作品演示-字幕配乐版.mp4'),path.join(source,'public/media/shukan-tour.mp4'));
const component=path.join(source,'src/components/ProductIntro.tsx');
await fs.writeFile(component,(await fs.readFile(component,'utf8')).replace('中文旁白 · 中文字幕','中文字幕 · 配乐导览'));
const transcript=path.join(source,'public/media/shukan-transcript.txt');
await fs.writeFile(transcript,(await fs.readFile(transcript,'utf8')).replace('音乐经过节选、淡入淡出和旁白混音处理。','参赛字幕版保留原创画面与字幕，音乐经过节选、淡入淡出与音量调整，不含原合成旁白。'));
await fs.mkdir(path.join(release,'runtime'),{recursive:true});
await copy('C:/Program Files/nodejs/node.exe',path.join(release,'runtime/node.exe'));
// Reuse the already acquired official tag license and release checksum list.
await copy(path.join(out,'node-LICENSE.txt'),path.join(release,'runtime/LICENSE.txt'));
const sums=await fs.readFile(path.join(out,'node-SHASUMS256.txt'),'utf8');
const expected=sums.split('\n').find(x=>x.endsWith('win-x64/node.exe'))?.split(/\s+/)[0];
const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(release,'runtime/node.exe'))).digest('hex');
if(actual!==expected)throw Error('Node executable hash does not match official distribution');
await fs.writeFile(path.join(out,'evidence-node.json'),JSON.stringify({version:'24.15.0',arch:'win-x64',expected,actual,matched:true},null,2));
await fs.mkdir(path.join(release,'server'),{recursive:true});
const result=await build({entryPoints:[path.join(root,'server/index.mjs')],outfile:path.join(release,'server/index.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',metafile:true,banner:{js:"import {createRequire as _createRequire} from 'node:module'; const require = _createRequire(import.meta.url);"}});
await copy(path.join(source,'public/data'),path.join(release,'public/data'));
await fs.mkdir(path.join(release,'licenses'),{recursive:true});
const seen=new Set();
for(const file of Object.keys(result.metafile.inputs)){
 let folder=path.dirname(path.resolve(file));
 while(folder!==path.dirname(folder)){
  try{
   const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));
   if(folder.includes('node_modules')&&!seen.has(pkg.name)){
    seen.add(pkg.name);const entries=await fs.readdir(folder);const texts=[];
    for(const name of entries.filter(x=>/^(licen[cs]e|copying|notice)/i.test(x))){const p=path.join(folder,name);if((await fs.stat(p)).isFile())texts.push(await fs.readFile(p,'utf8'));}
    await fs.writeFile(path.join(release,'licenses',pkg.name.replace(/[\/]/g,'_')+'.txt'),`${pkg.name} ${pkg.version}\nLicense identifier: ${pkg.license}\n\n${texts.join('\n\n')}`);
   }
   break;
  }catch{folder=path.dirname(folder);}
 }
}
await fs.writeFile(path.join(release,'launch.mjs'),`import {createApp} from './server/index.mjs';\nimport {fileURLToPath} from 'node:url';\nimport {spawn} from 'node:child_process';\nconst root=fileURLToPath(new URL('./',import.meta.url));\nconst requested=process.env.SHUKAN_PORT===undefined?8797:Number(process.env.SHUKAN_PORT);\nif(!Number.isInteger(requested)||requested<0||requested>65535)throw Error('Invalid SHUKAN_PORT');\nconst app=createApp({root,env:{}});\nlet retried=false;\nconst server=app.listen(requested,'127.0.0.1');\nserver.on('error',error=>{if(error.code==='EADDRINUSE'&&!retried){retried=true;server.listen(0,'127.0.0.1');}else{console.error(error.message);process.exitCode=1;}});\nserver.on('listening',()=>{const url='http://127.0.0.1:'+server.address().port+'/';console.log('SHUKAN_URL='+url);console.log('Keep this window open. Press Ctrl+C to stop.');if(!process.argv.includes('--no-browser')&&process.platform==='win32'){const opener=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});opener.on('error',()=>console.log('Open the URL above in Chrome or Edge.'));opener.unref();}});\nprocess.on('SIGINT',()=>server.close(()=>process.exit(0)));\n`);
await fs.writeFile(path.join(release,'启动数瞰.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0launch.mjs" %*\r\nif errorlevel 1 pause\r\n');
await fs.writeFile(path.join(source,'README-参赛源码.md'),'# 数瞰参赛源码\n\n此快照保留最终0.3.5应用、API、测试、构建脚本、已处理模型与数据；介绍片使用字幕配乐版，没有合成旁白。\n评审运行请使用上一层启动数瞰.cmd，无需安装依赖。开发复现：Node22+，npm ci，npm test，npm run build，npm start。verify:cpu保留模型解码与校验。\n可选原始GIS资料、Python采集/建模环境、历史视频制作工程未放入运行包；不是运行依赖。已处理模型文件和相关来源/派生审计随包。重新采集或重建原始模型应先核对提供方许可。\n');
await copy(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(release,'THIRD_PARTY_NOTICES.md'));
await copy(path.join(root,'DATA_SOURCES.md'),path.join(release,'DATA_SOURCES.md'));
console.log(release);

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/competition-final-20261006');
const pack=path.join(out,'数瞰-参赛完整包');
const copy=async(a,b)=>{await fs.mkdir(path.dirname(b),{recursive:true});await fs.cp(a,b,{recursive:true});};
for(const name of ['报名填写文案.md','提交前需要你完成.md'])await copy(path.join(out,name),path.join(pack,'docs',name));
await copy(path.join(out,'数瞰-作品演示-字幕配乐版.mp4'),path.join(out,'单独上传材料/数瞰-作品演示-字幕配乐版.mp4'));
await fs.mkdir(path.join(pack,'verification'),{recursive:true});
for(const [src,name] of [['competition-source-build.log','source-build.log'],['competition-source-tests.log','source-tests.log'],['evidence-node.json','node-checksum.json'],['evidence/competition-browser.json','competition-browser.json']])await copy(path.join(out,src),path.join(pack,'verification',name));
await copy(path.join(root,'docs/v3.5-evidence/browser-final/report.json'),path.join(pack,'verification/gpu-models.json'));
const check=JSON.parse(await fs.readFile(path.join(out,'evidence/competition-browser.json'),'utf8'));
if(check.status!=='passed'||check.browsers.length!==2||check.browsers.some(r=>r.status!=='passed'))throw Error('Package browser checks are not passing');
const gpu=JSON.parse(await fs.readFile(path.join(root,'docs/v3.5-evidence/browser-final/report.json'),'utf8'));
if(gpu.status!=='passed')throw Error('GPU acceptance not passing');
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
for(const [key,pkg] of Object.entries(lock.packages)){
 if(!key.startsWith('node_modules/')||pkg.dev)continue;
 const folder=path.join(root,key);let entries;try{entries=await fs.readdir(folder);}catch{continue;}
 const name=key.replaceAll('node_modules/','').replaceAll('/','_');const texts=[];
 for(const f of entries.filter(x=>/^(licen[cs]e|copying|notice)/i.test(x))){const p=path.join(folder,f);if((await fs.stat(p)).isFile())texts.push(await fs.readFile(p,'utf8'));}
 if(texts.length)await fs.writeFile(path.join(pack,'licenses',name+'.txt'),`${key} ${pkg.version}\nLicense: ${pkg.license??'see text below'}\n\n${texts.join('\n\n')}`);
}
// Remove only redundant outputs produced inside this new, verified staging root.
for(const name of ['source-code/dist','source-code/artifacts']){
 const target=path.resolve(pack,name);if(!target.startsWith(path.resolve(pack)+path.sep))throw Error('Scope violation');await fs.rm(target,{recursive:true,force:true});
}
await fs.writeFile(path.join(pack,'先读我.txt'),`数瞰——中国城市群数据探索平台\r\n版本0.3.5，参赛整理2026-10-06\r\n\r\n重要：本包已做软件运行验证，但第三方摄影模型、部分地标网格、卫星影像及全国矢量的离线再分发授权尚需团队补核。本包用于完整检查与评审运行准备；正式提交前处理docs/提交前需要你完成.md。\r\n\r\nWindows10/11 x64：先完整解压，双击“启动数瞰.cmd”。无需安装Node/npm。浏览器自动打开；默认8797被占用会选择空闲端口，以窗口中的地址为准，不结束其他服务。保持窗口打开；结束按Ctrl+C。建议Chrome/Edge、1920×1080、WebGL2显卡。\r\n\r\n本地统计、比较、情景、规则助手、导出和五处实景无需外网。天气、在线街道及来源网页需要网络；离线天气会明确提示不可用。不要直接双击dist/index.html；模型、Worker和API需要本机HTTP。\r\n\r\n首次可观看约102秒字幕配乐片或直接探索。参赛字幕版不包含原授权未确认合成旁白，原开发片不在本包；完整字幕和文稿保留。\r\n\r\n推荐顺序：全国搜深圳→看城市指标和来源→广州/深圳/佛山比较→A/B假设与CSV→上海、广州、深圳实景→核对来源与限制。详细说明见docs/作品说明.md。\r\n\r\nsource-code含前后端代码、锁文件、已处理数据模型与必要测试资料；开发重建需另装Node22+和npm ci，评审不用此步骤。没有打包私人配置、密钥、node_modules或历史原料。macOS/Linux可自行准备Node22+运行launch.mjs，本轮未在这些系统实测。\r\n`);
await fs.writeFile(path.join(out,'单独上传材料/作品截图/截图上传顺序.txt'),'请按01至10顺序上传PNG。照片均来自当前参赛包真实运行；09、10为查看器画面。字幕配乐影片单独上传到作品视频项，不用制作PPT也能满足视频/PPT至少一项的要求。素材许可核对同样适用于截图和影片中的模型/地图画面。');
let files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(['node_modules','.git','.local'].includes(e.name))throw Error('Forbidden directory '+f);await walk(f);}else{if(/\.env\.local$|\.log\.private$/.test(e.name))throw Error('Private file');const b=await fs.readFile(f);files.push({file:path.relative(pack,f).replaceAll('\\','/'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}}}
await walk(pack);await fs.writeFile(path.join(pack,'verification/文件SHA256.json'),JSON.stringify({date:'2026-10-06',files},null,2));
console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),checks:check.browsers.map(r=>({channel:r.channel,count:r.checks.length})),gpuRuns:gpu.runs.length}));

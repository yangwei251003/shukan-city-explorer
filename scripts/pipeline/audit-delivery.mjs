import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('public/models/manifest.json'),prior=read('docs/v3.4-evidence/frozen-checks.json');
const report={checkedAt:new Date().toISOString(),scope:'Static production files and loopback HTTP; no browser/GPU/offline interactive test',frozen:[],resources:[],webAssets:[],modelVersion:manifest.version};
for(const file of prior.files){const hash=sha(fs.readFileSync(path.join(root,file.path)));assert.equal(hash,file.sha256,`Frozen data changed: ${file.path}`);report.frozen.push({path:file.path,sha256:hash,matches:true});}
assert.deepEqual(read('dist/models/manifest.json'),manifest);
async function httpHash(relative,expected){
 const url=new URL(relative,'http://127.0.0.1:8787');assert.equal(url.origin,'http://127.0.0.1:8787');
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,relative);
 const hash=createHash('sha256');let bytes=0;for await(const chunk of response.body){hash.update(chunk);bytes+=chunk.length;}
 const actual=hash.digest('hex');assert.equal(actual,expected,`Served bytes differ: ${relative}`);return {path:relative,bytes,sha256:actual,httpStatus:200};
}
for(const [file,record] of Object.entries(manifest.files)){
 assert.equal(sha(fs.readFileSync(path.join(root,'dist/models',file))),record.sha256,`dist mismatch: ${file}`);
 report.resources.push(await httpHash(`/models/${file}`,record.sha256));
}
for(const file of fs.readdirSync(path.join(root,'dist/assets'))){
 report.webAssets.push(await httpHash(`/assets/${file}`,sha(fs.readFileSync(path.join(root,'dist/assets',file)))));
}
report.index=await httpHash('/',sha(fs.readFileSync(path.join(root,'dist/index.html'))));
report.stats=await(await fetch('http://127.0.0.1:8787/api/health?region=prd&dataset=gd-annual-2025-r3')).json();assert.equal(report.stats.status,'ok');
fs.writeFileSync(path.join(root,'docs/v3.5-evidence/delivery-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Delivery passed: ${report.frozen.length} frozen files unchanged; ${report.resources.length} model resources and ${report.webAssets.length} built assets served with exact hashes.`);

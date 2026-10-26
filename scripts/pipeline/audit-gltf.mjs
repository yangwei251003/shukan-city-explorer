import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import validator from 'gltf-validator';
import {parseB3DM,parseGLB} from './validate-models.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base=path.join(root,'public/models');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const decoded=JSON.parse(fs.readFileSync(path.join(root,'docs/v3.5-evidence/compression-audit.json'),'utf8'));
const report={checkedAt:new Date().toISOString(),validator:validator.version(),manifest:manifest.version,scope:'Khronos CPU asset validation; no GPU or browser execution',assets:[],errors:0,warnings:0,infos:0,knownValidatorLimitations:0,actionableWarnings:0};
// Sequential validation bounds peak memory to one tile. Never fetch remote URIs.
for(const file of Object.keys(manifest.files).filter(f=>/\.(glb|b3dm)$/.test(f))){
 const input=fs.readFileSync(path.join(base,file));
 if(createHash('sha256').update(input).digest('hex')!==manifest.files[file].sha256)throw Error(`Changed asset: ${file}`);
 const offset=file.endsWith('.b3dm')?28+[12,16,20,24].reduce((sum,p)=>sum+input.readUInt32LE(p),0):0;
 const data=input.subarray(offset,offset+input.readUInt32LE(offset+8));
 const result=await validator.validateBytes(new Uint8Array(data),{uri:file,format:'glb',maxIssues:10000,
  externalResourceFunction:async()=>{throw Error('External resources are forbidden in the local scene pack');}});
 const issues=result.issues;
 const {json}=file.endsWith('.b3dm')?parseB3DM(input):parseGLB(input);
 // This validator release predates KHR_texture_basisu. Preserve raw warnings,
 // and only classify that limitation after the actual published image has passed
 // the local Basis decoder at every mip level with an exact matching asset hash.
 for(const issue of issues.messages){
  const index=/^\/images\/(\d+)(?:\/mimeType)?$/.exec(issue.pointer)?.[1];
  if(issue.severity===1&&index!==undefined&&['VALUE_NOT_IN_LIST','IMAGE_UNRECOGNIZED_FORMAT'].includes(issue.code)&&json.images[+index]?.mimeType==='image/ktx2'&&json.extensionsRequired?.includes('KHR_texture_basisu')&&decoded.textures.some(t=>t.file===file&&t.index===+index&&t.sha256===manifest.files[file].sha256)){
   issue.knownValidatorLimitation='KHR_texture_basisu unsupported by this validator; exact published image passed local CPU decode at every mip';report.knownValidatorLimitations++;
  }
 }
 report.assets.push({file,sha256:manifest.files[file].sha256,...issues,info:result.info});
 report.errors+=issues.numErrors;report.warnings+=issues.numWarnings;report.infos+=issues.numInfos;
 if(issues.truncated)throw Error(`Truncated validation: ${file}`);
}
report.actionableWarnings=report.warnings-report.knownValidatorLimitations;
const output=path.join(root,'docs/v3.5-evidence/gltf-audit.json');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Khronos ${report.validator}: ${report.assets.length} model assets, ${report.errors} errors, ${report.actionableWarnings} actionable warnings; ${report.knownValidatorLimitations} retained KTX2 validator-limit warnings, independently CPU-decoded. ${report.infos} informational notes.`);
if(report.errors||report.actionableWarnings)process.exitCode=1;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePreviewPNG} from './preview-image.mjs';
const image=fs.readFileSync(new URL('../../public/models/shanghai-lujiazui/preview.png',import.meta.url));
test('城市卡片预览能解码，不能只凭文件存在与散列通过',()=>{const size=validatePreviewPNG(image);assert.ok(size.width>100&&size.height>100);});
test('拒绝本次出现的全零图片及截断、像素损坏的 PNG',()=>{
 assert.throws(()=>validatePreviewPNG(Buffer.alloc(image.length)),/文件头损坏/);
 assert.throws(()=>validatePreviewPNG(image.subarray(0,image.length-12)),/内容不完整/);
 const bad=Buffer.from(image);bad[100]^=1;assert.throws(()=>validatePreviewPNG(bad),/校验不符/);
});

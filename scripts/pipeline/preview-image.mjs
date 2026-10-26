import {inflateSync,crc32} from 'node:zlib';
/** Validate the actual PNG payload, not just its filename or manifest hash. */
export function validatePreviewPNG(input){
 const fail=message=>{throw Error(`预览图片无效：${message}`);};
 if(input.length<45||input.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('PNG 文件头损坏');
 let offset=8,width=0,height=0,channels=0,ended=false;const compressed=[];
 while(offset+12<=input.length){
  const size=input.readUInt32BE(offset),type=input.toString('ascii',offset+4,offset+8),end=offset+12+size;
  if(end>input.length)fail('分块截断');
  if(crc32(input.subarray(offset+4,end-4))!==input.readUInt32BE(end-4))fail('分块校验不符');
  const data=input.subarray(offset+8,end-4);
  if(offset===8&&type!=='IHDR')fail('缺少图像信息');
  if(type==='IHDR'){
   if(size!==13)fail('图像信息长度错误');width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels={2:3,6:4}[data[9]];
   if(!width||!height||width>8192||height>8192||data[8]!==8||!channels||data[10]||data[11]||data[12])fail('不支持的预览格式');
  }
  if(type==='IDAT')compressed.push(data);
  offset=end;if(type==='IEND'){ended=true;break;}
 }
 if(!ended||offset!==input.length||!compressed.length)fail('内容不完整');
 const row=width*channels+1,decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:row*height});
 if(decoded.length!==row*height)fail('像素长度错误');
 for(let i=0;i<height;i++)if(decoded[i*row]>4)fail('像素过滤器无效');
 return {width,height};
}

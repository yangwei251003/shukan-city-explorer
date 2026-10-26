from pathlib import Path
import hashlib,json,zipfile

root=Path(__file__).resolve().parents[1]
out=root/'artifacts'/'competition-final-20261006'
pack=out/'数瞰-参赛完整包'
archive=out/'数瞰-参赛完整包.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(pack.rglob('*')):
        if p.is_file():
            if any(x in {'node_modules','.git','.local'} for x in p.relative_to(pack).parts):
                raise RuntimeError('Forbidden package entry')
            z.write(p,p.relative_to(out).as_posix())
with zipfile.ZipFile(archive) as z:
    if z.testzip() is not None: raise RuntimeError('ZIP CRC failure')
    target=out/'解压验证'
    target.mkdir(exist_ok=True)
    z.extractall(target)
unpacked=target/pack.name
manifest=json.loads((unpacked/'verification'/'文件SHA256.json').read_text(encoding='utf-8'))
for record in manifest['files']:
    data=(unpacked/record['file']).read_bytes()
    if len(data)!=record['bytes'] or hashlib.sha256(data).hexdigest()!=record['sha256']:
        raise RuntimeError('Extracted hash mismatch: '+record['file'])
info={'date':'2026-10-06','archive':archive.name,'bytes':archive.stat().st_size,
      'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'crc':'passed',
      'verifiedExtractedFiles':len(manifest['files']),'allExtractedHashes':'passed',
      'extractedStartup':'not yet tested','formalSubmission':'pending third-party asset authorization'}
(out/'交付文件校验.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(info,ensure_ascii=False,indent=2))

from pathlib import Path
from PIL import Image
import json,hashlib,shutil,os
root=Path(__file__).resolve().parents[1]
source=Path(os.environ['SHUKAN_GENERATED_SCENES_DIR'])
files={'chengyu':'exec-ac2fc531-5a3b-45a5-8764-2f7e960c47a7.png','middle-yangtze':'exec-82989b2d-335d-48aa-ba40-125c4a77226c.png','guanzhong':'exec-92440289-41c7-4e2b-9897-1b2d0a136117.png','central':'exec-22076a0d-8ebe-4cd8-8315-c932538c0062.png','shandong':'exec-2726331b-6116-4cd0-a6ec-85f629e759ab.png'}
manifest=json.loads((root/'public/scenes/manifest.json').read_text(encoding='utf-8'))
manifest=[row for row in manifest if row['file'].split('-mobile')[0].split('.')[0] not in files]
for key,name in files.items():
 original=root/'source-data/v3-scenes'/name
 if not original.exists():
  original.parent.mkdir(parents=True,exist_ok=True)
  shutil.copyfile(source/name,original)
 image=Image.open(original).convert('RGB')
 for width,suffix,limit in [(1600,'',250000),(800,'-mobile',120000)]:
  resized=image.resize((width,round(image.height*width/image.width)),Image.Resampling.LANCZOS)
  target=root/'public/scenes'/f'{key}{suffix}.webp'
  for quality in range(84,29,-5):
   resized.save(target,format='WEBP',quality=quality,method=6)
   if target.stat().st_size<=limit:break
  assert target.stat().st_size<=limit
  manifest.append({'file':target.name,'bytes':target.stat().st_size,'width':width,'origin':'OpenAI imagegen builtin','label':'AI 场景示意','generatedOn':'2026-09-27','sourceFile':name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'usage':'单城视觉意象；并非实景摄影、地图或测绘证据','promptRecord':'source-data/v3-scenes/prompts.json'})
(root/'public/scenes/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'file':x['file'],'bytes':x['bytes']} for x in manifest],ensure_ascii=False))

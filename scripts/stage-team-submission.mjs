import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'artifacts/competition-team-20261007');
const pack=path.join(out,'数瞰-评委提交版');
await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'artifacts/competition-submit-20261007/数瞰-评委提交版'),pack,{recursive:true});
for(const name of ['ProductIntro.tsx','product-intro.css']){
 let text=await fs.readFile(path.join(root,'src/components',name),'utf8');
 if(name==='ProductIntro.tsx')text=text.replace('中文旁白 · 中文字幕','中文字幕 · 配乐导览');
 await fs.writeFile(path.join(pack,'source-code/src/components',name),text);
}
await fs.writeFile(path.join(pack,'作品资料/04-团队信息与职责.md'),`# 数瞰团队\n\n参赛院校：广州科技职业技术大学\n\n指导教师：陈毓秀、韦一文\n\n|成员|岗位|职责|\n|---|---|---|\n|杨炜晨|队长、项目统筹|产品方向、需求取舍、成员协作、版本整合与答辩统筹|\n|翁宇航|产品与交互策划|信息层级、检索与对比路径、引导与内容说明|\n|陈立军|前端与地图交互|页面模块、地图与图表交互、终端适配、实景查看器整合|\n|郭宇|数据与服务逻辑|来源与统计口径、数据版本、情景计算、本地服务接口|\n|林纳川|视觉、质量与答辩|视觉规范、展示素材、功能与页面检查、答辩图文与讲解|\n\n指导教师提供选题与作品表达指导，协助审阅技术与展示方案。岗位描述为团队职责安排，不将第三方基础资产归为成员独立制作。\n`);
await fs.writeFile(path.join(pack,'作品资料/02-AI工具使用说明.md'),`# AI工具使用说明\n\n作品：数瞰——中国城市群数据探索平台\n\n参赛院校：广州科技职业技术大学\n\n指导教师：陈毓秀、韦一文\n\n团队：杨炜晨、翁宇航、陈立军、郭宇、林纳川\n\n## 团队职责\n\n团队按产品统筹、交互策划、前端地图、数据服务、视觉质量五个岗位组织工作。各岗位责任包括方案取舍、实现整合、来源与结果核对、操作体验检查及作品答辩；具体对应见团队信息与职责。\n\n## 辅助工具与环节\n\nOpenAI Codex参与方案比较、代码生成与修改、交互文案、故障定位和自动化检查。开发流程将生成内容与统计来源、参数计算和真实浏览器操作核对，再进行迭代与整合。AI未作为统计数值来源，核心数据引用官方记录，情景结果按明确公式与参数计算。\n\nOpenAI内置图像生成工具用于区域页头的场景示意，实际提示词和图像清单位于source-code/public/scenes；页面保留AI场景示意标识，生成图不作为城市摄影或数据证据。\n\n运行时默认助手为本地规则模式，外部模型为可选配置。站内介绍片使用实际页面、字幕与署名配乐，服务于产品认识与操作引导，未作为本作品的答辩视频。\n\n## 内容归属\n\n作品的信息架构、视觉组织、交互路径与系统整合，与开源引擎、第三方数据和授权模型分别说明。素材保留作者及来源，许可文件随包。作品没有以AI生成结果替代真实数据、实验记录或成员身份。\n`);
await fs.mkdir(path.join(out,'作品截图-8张'),{recursive:true});
console.log(pack);

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = 'http://127.0.0.1:8787/';
async function ready() {
  try {
    const [health, document] = await Promise.all([
      fetch(url + 'api/health', { signal: AbortSignal.timeout(1500) }).then(r => r.json()),
      fetch(url, { signal: AbortSignal.timeout(1500) }).then(r => r.text()),
    ]);
    return health.dataReady === true && health.regionId === 'prd' && document.includes('数瞰');
  } catch { return false; }
}

try {
  if (!await ready()) {
    if (!existsSync(join(root, 'dist/index.html'))) throw new Error('尚未构建网页，请先在项目目录运行 npm run build。');
    if (!existsSync(join(root, 'node_modules/express'))) throw new Error('缺少依赖，请先在项目目录运行 npm ci。');
    const logs = join(root, '.local');
    mkdirSync(logs, { recursive: true });
    const output = openSync(join(logs, 'server-output.log'), 'a');
    const error = openSync(join(logs, 'server-error.log'), 'a');
    const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', output, error] });
    closeSync(output); closeSync(error);
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    writeFileSync(join(logs, 'server.pid'), String(child.pid));
    child.unref();
    let started = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await ready()) { started = true; break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!started) throw new Error('服务未能启动，请查看 .local/server-error.log；8787 端口可能已被其他程序占用。');
  }
  console.log('数瞰已就绪：' + url);
  if (!process.argv.includes('--no-browser')) {
    const opener = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log('请在浏览器打开上方地址。'));
    opener.unref();
  }
} catch (error) {
  console.error('启动失败：' + error.message);
  process.exitCode = 1;
}

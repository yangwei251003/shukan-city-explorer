import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
const root = resolve("dist");
const prefix = process.env.DEMO_BASE_PATH || "/shukan-city-explorer";
const mime = {".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".json":"application/json",".txt":"text/plain",".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix + "/")) throw new Error("outside prefix");
    let file = resolve(root, "." + decodeURIComponent(url.pathname.slice(prefix.length)));
    if (file !== root && !file.startsWith(root + sep)) throw new Error("outside output");
    if ((await stat(file)).isDirectory()) file = resolve(file,"index.html");
    const body = await readFile(file);
    res.writeHead(200,{"Content-Type":mime[extname(file)] || "application/octet-stream"});
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {res.writeHead(404);res.end("Not found");}
}).listen(Number(process.env.PREVIEW_PORT || 4198),"127.0.0.1");

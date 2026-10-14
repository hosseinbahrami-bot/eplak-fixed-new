/* tools/dev/demo-server.mjs — سرورِ ایستای کوچک برای دیدنِ «دموی ساعتِ تهران»

   چرا: tools/dev/timezone-demo.html فایلِ واقعیِ اپ (core/state.js) را با مسیرِ
   نسبیِ «../../core/state.js» بار می‌کند، پس باید از **ریشه‌ی مخزن** سرو شود
   (باز کردنِ مستقیم با file:// هم کار می‌کند). این سرور ریشه را به مخزن نگاشت
   می‌کند و نشانیِ «/» را مستقیماً به همان دمو می‌فرستد.

   اجرا:  node tools/dev/demo-server.mjs            ⇒ http://localhost:4173/
          PORT=8080 node tools/dev/demo-server.mjs  ⇒ http://localhost:8080/

   فقط برای توسعه/نمایش است و هیچ دسترسیِ نوشتن یا اجرای PHP ندارد. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const HOME = '/tools/dev/timezone-demo.html';
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch { /* مسیرِ خراب ⇒ همان ریشه */ }
  if (urlPath === '/' || urlPath === '') urlPath = HOME;

  const file = path.join(ROOT, path.normalize(urlPath));
  /* نگهبانِ خروج از ریشه‌ی مخزن */
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 — ' + urlPath);
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`demoye saat-e tehran: http://${HOST}:${PORT}/  (root: ${ROOT})`);
});

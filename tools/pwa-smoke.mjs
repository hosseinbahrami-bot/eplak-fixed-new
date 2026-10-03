/* tools/pwa-smoke.mjs — آزمون دودیِ «PWA مستقل» در مرورگر واقعی (Chrome)
   ---------------------------------------------------------------------------
   بسته‌ی ایستای tools/build-pwa.sh را روی یک سرور محلی (origin جدا از سرور اصلی) باز می‌کند و
   با سرور واقعیِ ای‌پلاک (https://eplak.ir/eplak-fixed/api) حرف می‌زند؛ یعنی دقیقاً همان
   وضعیتی که PWA روی GitHub Pages/Netlify/… خواهد داشت (درخواست‌های بین‌دامنه‌ای = CORS).

   می‌سنجد:
     ۱) آدرس API روی سرور اصلی است، api/ping.php از origin دیگر جواب می‌دهد (CORS) و پرده‌ی
        «بدون اینترنت» نیامده؛ درخواست‌های بوت (بخش‌ها، اخبار، اعلان‌ها) به CORS نخورده‌اند
     ۲) آدرس نسبیِ پیوست‌ها (uploads/…) به سرور اصلی می‌رود
     ۳) قابلیت نصب (PWA): Chrome خطای نصب نمی‌دهد (Page.getInstallabilityErrors)، manifest درست
        خوانده می‌شود (نام، آیکون‌ها)، و سرویس‌ورکر ثبت و فعال می‌شود
     ۴) «نقشه و اماکن شهری» باز می‌شود: چیپ‌های دسته، فهرست مکان‌ها، کاشی‌ها
   از صفحه عکس هم می‌گیرد.

   استفاده:  node tools/pwa-smoke.mjs [پوشه‌ی pwa-dist] [پوشه‌ی خروجی]
   اگر PWA_URL داده شود (مثلاً https://hosseinbahrami-bot.github.io/eplak-fixed/) به‌جای سرور محلی،
   همان آدرسِ واقعیِ منتشرشده سنجیده می‌شود (ورک‌فلو پس از انتشار روی GitHub Pages این کار را می‌کند).
   اگر همراهش PWA_KIND=host باشد، آدرس خودِ سایت روی هاست است (https://eplak.ir/eplak-fixed/): همان
   دامنه‌ی سرور، پس API نسبی است و پیکربندیِ «نسخه‌ی ایستا» (EPLAK_STATIC_PWA، آدرس پیوست‌ها) لازم نیست.
   نیاز: puppeteer-core (npm) و Chrome (CHROME_PATH؛ پیش‌فرض /usr/bin/google-chrome) */
import http from 'http'; import fs from 'fs'; import path from 'path';
import puppeteer from 'puppeteer-core';

const DIST = path.resolve(process.argv[2] || 'pwa-dist');
const OUT = path.resolve(process.argv[3] || 'pwa-evidence');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const API = process.env.EPLAK_PWA_API_BASE || 'https://eplak.ir/eplak-fixed/api';
const HOST_MODE = process.env.PWA_KIND === 'host';
let SITE = API.replace(/\/api$/, '');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const REMOTE = process.env.PWA_URL ? String(process.env.PWA_URL).replace(/\/*$/, '/') : '';
let server = null;
let BASE = REMOTE;
if (!REMOTE) {
  server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(DIST, path.normalize(u));
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}
if (HOST_MODE) SITE = BASE.replace(/\/$/, '');
console.log('PWA روی', BASE, REMOTE ? '(آدرس واقعیِ منتشرشده)' : '(سرور محلی)', HOST_MODE ? '(خودِ سایت روی هاست؛ API نسبی)' : 'و API روی ' + API);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [], notes = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const problems = [], apiStatus = {};
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=fa-IR'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 220)); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e && e.message || e).slice(0, 220)));
  page.on('requestfailed', (r) => problems.push('request failed: ' + r.url().slice(0, 140) + ' — ' + ((r.failure() || {}).errorText || '')));
  page.on('response', (r) => { const u = r.url(); if (u.startsWith(SITE + '/')) apiStatus[u.slice(SITE.length + 1).replace(/\?.*$/, '')] = r.status(); });

  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(6000);

  /* ── ۱) صفحه، API، پینگ، سرویس‌ورکر ───────────────────────────────────── */
  const s1 = await page.evaluate(async () => {
    const out = {};
    out.apiBase = window.EPLAK_API_BASE_URL || null;
    out.staticFlag = window.EPLAK_STATIC_PWA === true;
    out.media = typeof window.eplakResolveMediaUrl === 'function' ? window.eplakResolveMediaUrl('uploads/reports/x.jpg') : null;
    out.screen = (document.querySelector('.screen.active') || {}).id || null;
    out.offlineGate = document.documentElement.classList.contains('eplak-offline');
    out.manifestLink = !!document.querySelector('link[rel="manifest"]');
    out.appleIcon = !!document.querySelector('link[rel="apple-touch-icon"]');
    out.appleCapable = !!document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    out.places = (window.EplakPlaces && typeof window.EplakPlaces.places === 'function') ? window.EplakPlaces.places().length : null;
    try {
      const r = await fetch(out.apiBase + '/ping.php?_=' + Date.now(), { cache: 'no-store' });
      out.ping = { status: r.status, body: (await r.text()).slice(0, 100) };
    } catch (e) { out.ping = { error: String(e) }; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      out.sw = reg ? { scope: reg.scope, active: !!reg.active } : null;
    } catch (e) { out.sw = { error: String(e) }; }
    return out;
  });
  await page.screenshot({ path: path.join(OUT, '1-home.png') });
  if (HOST_MODE) {
    need(typeof s1.apiBase === 'string' && s1.apiBase.length > 0 && !s1.staticFlag, 'روی هاست آدرس API باید نسبی و بدون پرچم نسخه‌ی ایستا باشد: ' + s1.apiBase);
  } else {
    need(s1.apiBase === API, 'آدرس API ' + API + ' نیست: ' + s1.apiBase);
    need(s1.staticFlag === true, 'پرچم EPLAK_STATIC_PWA نیامده');
    need(typeof s1.media === 'string' && s1.media === SITE + '/uploads/reports/x.jpg', 'آدرس پیوست به سرور اصلی نمی‌رود: ' + s1.media);
  }
  need(s1.ping && s1.ping.status === 200, 'api/ping.php از origin دیگر جواب نداد (CORS؟): ' + JSON.stringify(s1.ping));
  need(s1.offlineGate === false, 'پرده‌ی «بدون اینترنت» آمده است');
  need(s1.manifestLink && s1.appleIcon && s1.appleCapable, 'تگ‌های manifest / apple-touch-icon / apple-mobile-web-app-capable نیست');
  need(s1.sw && s1.sw.active === true, 'سرویس‌ورکر فعال نشد: ' + JSON.stringify(s1.sw));
  need((s1.places || 0) >= 130, 'فهرست اماکن کم است: ' + s1.places);

  /* ── ۲) قابلیت نصب (CDP) ───────────────────────────────────────────────── */
  const cdp = await page.createCDPSession();
  const inst = await cdp.send('Page.getInstallabilityErrors');
  const man = await cdp.send('Page.getAppManifest');
  let manifest = {};
  try { manifest = JSON.parse(man.data || '{}'); } catch (e) { /* خالی */ }
  need((inst.installabilityErrors || []).length === 0, 'Chrome خطای قابلیت نصب می‌دهد: ' + JSON.stringify(inst.installabilityErrors));
  need((man.errors || []).length === 0, 'خطای manifest: ' + JSON.stringify(man.errors));
  need(manifest.short_name === 'ای‌پلاک' && manifest.display === 'standalone' && (manifest.icons || []).length >= 2,
    'manifest ناقص است: ' + JSON.stringify({ n: manifest.short_name, d: manifest.display, i: (manifest.icons || []).length }));

  /* ── ۳) نقشه و اماکن شهری ─────────────────────────────────────────────── */
  await page.evaluate(() => window.showScreen('screen-map'));
  await sleep(7000);
  const s2 = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s);
    const imgs = Array.prototype.slice.call(q('#cityMapCanvas .ep-map-tiles img'));
    return {
      screen: (document.querySelector('.screen.active') || {}).id || null,
      chips: q('#screen-map .cm-chip').length, rows: q('#screen-map .cm-row').length,
      tiles: imgs.length, tilesLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      markers: q('#cityMapCanvas .ep-map-markers > *').length,
    };
  });
  await page.screenshot({ path: path.join(OUT, '2-map.png') });
  need(s2.screen === 'screen-map', 'صفحه‌ی نقشه باز نشد: ' + s2.screen);
  need(s2.chips >= 9, 'چیپ‌های دسته کم است: ' + s2.chips);
  need(s2.rows >= 10, 'فهرست مکان‌ها کم است: ' + s2.rows);

  /* درخواست‌های بین‌دامنه‌ای که به CORS خورده‌اند (فقط به سرور اصلی) */
  const cors = problems.filter((x) => /CORS|Access-Control|blocked by/i.test(x));
  need(cors.length === 0, 'خطای CORS: ' + cors.slice(0, 3).join(' | '));

  notes.push('آدرس PWA: ' + BASE + ' — API: ' + (HOST_MODE ? s1.apiBase + ' (نسبی؛ هم‌دامنه با سرور)' : API));
  notes.push('صفحه‌ی اول: ' + s1.screen + '؛ پینگ: ' + JSON.stringify(s1.ping));
  notes.push('سرویس‌ورکر: ' + JSON.stringify(s1.sw) + '؛ نام manifest: ' + manifest.name);
  notes.push('خطاهای قابلیت نصب: ' + JSON.stringify(inst.installabilityErrors || []));
  notes.push('نقشه: چیپ ' + s2.chips + '، ردیف ' + s2.rows + '، کاشی ' + s2.tilesLoaded + ' از ' + s2.tiles + '، نشانگر ' + s2.markers);
  notes.push('کد پاسخ درخواست‌های سرور اصلی: ' + JSON.stringify(apiStatus));
  fs.writeFileSync(path.join(OUT, 'selftest.json'), JSON.stringify({ s1, s2, install: inst, manifest, apiStatus, problems: problems.slice(0, 40) }, null, 2));
} catch (e) {
  errors.push('اجرای آزمون با خطا قطع شد: ' + String(e && e.stack || e).slice(0, 500));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}

const lines = [HOST_MODE ? '## آزمون دودی PWA روی خودِ سایت (هاست) در Chrome' : (REMOTE ? '## آزمون دودی PWA روی آدرس واقعیِ منتشرشده (Chrome)' : '## آزمون دودی PWA (Chrome، origin جدا از سرور اصلی)'), ''];
lines.push(...notes.map((n) => '- ' + n));
if (problems.length) { lines.push('', '### خطاهای کنسول/شبکه‌ی دیده‌شده (گزارشی)'); lines.push(...problems.slice(0, 15).map((x) => '- ' + x)); }
lines.push('');
if (errors.length) { lines.push('### ❌ خطاها', ...errors.map((e) => '- ' + e)); } else { lines.push('### ✅ همه‌ی بررسی‌ها گذشت'); }
const text = lines.join('\n');
console.log(text);
fs.writeFileSync(path.join(OUT, 'report.md'), text + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
process.exit(errors.length ? 1 : 0);

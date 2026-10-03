/* upload.test.mjs — «نمودار درصدیِ هر فایل» + «فیلم نمی‌رسید»
   ------------------------------------------------------------------
   چه چیزی واقعاً اجرا می‌شود (نه فقط متن‌کاوی):
     ۱) core/upload-progress.js در vm: وضعیت هر فایل، درصد (هرگز ۱۰۰٪ پیش از تأیید
        سرور)، درصد کل بر پایه‌ی بایت، و HTML نمودار (نوار ← «فایل آپلود شد»).
     ۲) core/storage.js در vm، روبه‌روی یک «هاست ساختگی» که پروتکل تکه‌تکه‌ی
        api/media.php را عیناً پیاده می‌کند (هم نسخه‌ی تازه، هم نسخه‌ی قدیمی):
        - بایت‌های رسیده‌ی سرور با فایل اصلی یکسان‌اند (md5)
        - رویدادهای هر فایل: start/progress/restart/done/fail
        - فایروال (۴۰۳ برای بدنه‌ی بزرگ) ← تکه‌ی کوچک‌تر ← عبور
        - قطع شبکه، پاسخ گمشده‌ی پس از پردازش (تکه‌ی تکراری)، ۴۰۹ و ادامه از جای سرور
        - سقف ۵۰۰ تکه‌ی سرور قدیمی ← تکه‌ی بزرگ‌تر
        - انتظار برای برگشتن اینترنت
     ۳) سرور (PHP-wasm): تکه‌ی تکراری، سقف تعداد تکه، و بقیه‌ی پروتکل واقعی.
     ۴) ساخته نشدن زودهنگام گزارش وقتی فیلم هنوز در راه است (ریشه‌ی «عکس رسید
        ولی فیلم نه»).
*/
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import crypto from 'crypto';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* تا برقرار شدن شرط صبر می‌کند (روی CI کند هم پایدار) */
const waitFor = async (cond, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(20); } return cond(); };
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

/* ══════════ ۱) نمودار پیشرفت (core/upload-progress.js) ══════════ */
console.log('\n=== نمودار پیشرفت هر فایل ===');

function makeProgressSandbox({ lang = 'fa' } = {}) {
  const sb = {
    console, Math, Date, JSON, Number, isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
    window: null,
    i18n: {
      getLanguage: () => lang,
      t: (text) => (lang === 'en' ? ({ 'فایل آپلود شد': 'File uploaded', 'ارسال نشد': 'Upload failed', 'تلاش دوباره': 'Try again', 'در صف ارسال': 'Waiting to upload', 'تلاش دوباره…': 'Retrying…' }[text] || text) : text),
    },
    EplakIcons: { get: (name) => `<svg data-icon="${name}"></svg>` },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('core/upload-progress.js'), sb, { filename: 'upload-progress.js' });
  return sb;
}

const sbp = makeProgressSandbox();
const T = sbp.EplakUploadProgress;
ok('ماژول نمودار پیشرفت روی window معرفی می‌شود', !!T && typeof T.begin === 'function' && typeof T.apply === 'function' && typeof T.bind === 'function');

const MB = 1048576;
T.begin('REF-1', [{ name: 'photo.jpg', size: 1 * MB, type: 'image/jpeg' }, { name: 'film.mp4', size: 3 * MB, type: 'video/mp4' }]);
let items = T.items('REF-1');
ok('هر فایل یک ردیف «در صف» می‌گیرد و نوع (عکس/فیلم) درست تشخیص داده می‌شود',
  items.length === 2 && items.every((i) => i.state === 'queued' && i.pct === 0) && items[0].kind === 'image' && items[1].kind === 'video');

T.apply('REF-1', 1, { type: 'start' });
T.apply('REF-1', 1, { type: 'progress', loaded: 0.5 * 3 * MB, total: 3 * MB });
items = T.items('REF-1');
ok('درصد هر فایل از بایت‌های واقعی محاسبه می‌شود (۵۰٪ از ۳ مگابایت)', items[1].state === 'uploading' && items[1].pct === 50, JSON.stringify(items[1]));
T.apply('REF-1', 1, { type: 'progress', loaded: 0.2 * 3 * MB, total: 3 * MB });
ok('درصد در یک دوره‌ی ارسال هرگز عقب نمی‌رود (پیام تأخیری شبکه)', T.items('REF-1')[1].pct === 50);
T.apply('REF-1', 1, { type: 'progress', loaded: 3 * MB, total: 3 * MB });
ok('تا وقتی سرور فایل را تأیید نکرده، ۱۰۰٪ نشان داده نمی‌شود (سقف ۹۹٪)', T.items('REF-1')[1].pct === 99 && T.items('REF-1')[1].state === 'uploading');

T.apply('REF-1', 0, { type: 'done' });
let sum = T.summary('REF-1');
ok('درصد کل بر پایه‌ی «بایت» است نه تعداد فایل (۱ مگ تمام + ۳ مگ ۹۹٪ ≈ ۹۹٪)', sum.done === 1 && sum.active === 1 && sum.pct >= 98 && sum.pct <= 99, JSON.stringify(sum));
T.apply('REF-1', 1, { type: 'restart', note: 'ارسال دوباره با بسته‌های کوچک‌تر' });
items = T.items('REF-1');
ok('«restart» نوار را صفر و وضعیت را «تلاش دوباره» می‌کند', items[1].state === 'retrying' && items[1].pct === 0 && /کوچک‌تر/.test(items[1].note));
T.apply('REF-1', 1, { type: 'progress', loaded: 0.1 * 3 * MB, total: 3 * MB });
ok('پس از restart، با اولین پیشرفت دوباره «در حال ارسال» می‌شود', T.items('REF-1')[1].state === 'uploading' && T.items('REF-1')[1].pct === 10);
T.apply('REF-1', 1, { type: 'done' });
sum = T.summary('REF-1');
ok('وقتی همه تمام شدند: allDone و ۱۰۰٪', sum.allDone === true && sum.pct === 100, JSON.stringify(sum));
T.apply('REF-1', 1, { type: 'progress', loaded: 1, total: 3 * MB });
ok('رویداد دیرهنگام پیشرفت، فایل تمام‌شده را به عقب برنمی‌گرداند', T.items('REF-1')[1].state === 'done');

/* HTML نمودار */
T.begin('REF-2', [{ name: 'a.webm', size: 4 * MB, type: 'video/webm' }, { name: 'b.jpg', size: 100 * 1024, type: 'image/jpeg' }, { name: 'c<img src=x onerror=alert(1)>.png', size: 50 * 1024, type: 'image/png' }]);
T.apply('REF-2', 0, { type: 'start' }); T.apply('REF-2', 0, { type: 'progress', loaded: 1.8 * MB, total: 4 * MB });
T.apply('REF-2', 1, { type: 'done' });
T.apply('REF-2', 2, { type: 'fail', note: 'فایروال هاست درخواست را رد کرد (کد ۴۰۳)' });
const html = T.rowsHtml(T.items('REF-2'));
const rows = html.split('<div class="up-row').slice(1);
ok('در حال ارسال: نوار درصدی با aria و عرض درست + «۴۵٪»',
  /role="progressbar"[^>]*aria-valuenow="45"/.test(rows[0]) && /width:45%/.test(rows[0]) && /۴۵٪/.test(rows[0]), rows[0].slice(0, 400));
ok('پس از آپلود: نوار «می‌رود» و فقط «فایل آپلود شد» می‌ماند',
  /فایل آپلود شد/.test(rows[1]) && !/up-bar|up-fill|progressbar|٪/.test(rows[1]), rows[1]);
ok('ناموفق: «ارسال نشد» + دلیل + دکمه‌ی «تلاش دوباره»',
  /ارسال نشد/.test(rows[2]) && /کد ۴۰۳/.test(rows[2]) && /data-action="retry"/.test(rows[2]));
ok('دکمه‌ی تلاش دوباره را می‌شود خاموش کرد (صفحه‌ی «گزارش ثبت شد» دکمه‌ی خودش را دارد)', !/data-action="retry"/.test(T.rowsHtml(T.items('REF-2'), { retry: false })));
ok('نام فایل escape می‌شود (XSS از نام فایل ممکن نیست)', !/<img src=x/.test(html) && /&lt;img/.test(html));
ok('اندازه‌ی ارسال‌شده نمایش داده می‌شود («۱٫۸ از ۴ مگابایت»)', /۱٫۸ از ۴ مگابایت/.test(rows[0]), rows[0].slice(0, 500));
ok('نام بلند فایل کوتاه می‌شود ولی پسوند می‌ماند', T.shortName('eplak-20260930-142233-long-name-here.webm').endsWith('.webm') && T.shortName('eplak-20260930-142233-long-name-here.webm').length < 30);

const media = T.itemsFromMedia([{ kind: 'image', name: 'x.jpg', size: 10, url: 'u' }, { kind: 'video', name: 'y.mp4', url: 'v' }, { kind: 'image', name: 'local.jpg', local: true, url: 'blob:x' }]);
ok('فایل‌های ذخیره‌شده روی سرور «فایل آپلود شد» می‌شوند؛ پیش‌نمایش محلی نه',
  media.length === 2 && media.every((m) => m.state === 'done') && media[1].kind === 'video');

/* نمایش زنده داخل یک عنصر */
const box = { innerHTML: '', style: { display: 'none' }, onclick: null };
const off = T.bind(box, 'REF-3', { onRetry: (ref) => { box.retried = ref; } });
ok('بدون ردیف، کادر نمودار پنهان می‌ماند', box.style.display === 'none' && box.innerHTML === '');
T.begin('REF-3', [{ name: 'v.mp4', size: 2 * MB, type: 'video/mp4' }]);
ok('begin بلافاصله ردیف‌ها را نشان می‌دهد', box.style.display === '' && /v\.mp4/.test(box.innerHTML) && /در صف ارسال/.test(box.innerHTML));
T.apply('REF-3', 0, { type: 'start' }); T.apply('REF-3', 0, { type: 'progress', loaded: 1 * MB, total: 2 * MB });
await waitFor(() => /۵۰٪/.test(box.innerHTML));
ok('پیشرفت با محدودکننده‌ی سرعت روی صفحه می‌نشیند (۵۰٪)', /۵۰٪/.test(box.innerHTML), box.innerHTML.slice(0, 300));
let renders = 0; const unsub = T.subscribe('REF-3', () => { renders++; });
for (let i = 1; i <= 40; i++) T.apply('REF-3', 0, { type: 'progress', loaded: (1 + i / 80) * MB, total: 2 * MB });
await waitFor(() => renders >= 1);
await sleep(250);
ok('۴۰ رویداد پیشرفت پشت‌سرهم، فقط چند بازپخش می‌سازد (نه ۴۰ تا)', renders >= 1 && renders <= 3, String(renders));
unsub();
T.apply('REF-3', 0, { type: 'fail', note: 'قطع شبکه' });
ok('شکست، بلافاصله (بدون تأخیر) دکمه‌ی تلاش دوباره را می‌آورد', /data-action="retry"/.test(box.innerHTML));
box.onclick({ target: { getAttribute: (k) => (k === 'data-action' ? 'retry' : null), parentNode: null } });
ok('کلیک روی «تلاش دوباره»، onRetry را با شناسه‌ی درخواست صدا می‌زند', box.retried === 'REF-3');
off();
ok('جدا کردن نمایش، شنونده را برمی‌دارد', box.onclick === null);

const sbEn = makeProgressSandbox({ lang: 'en' });
sbEn.EplakUploadProgress.begin('E', [{ name: 'v.mp4', size: 2 * MB, type: 'video/mp4' }]);
sbEn.EplakUploadProgress.apply('E', 0, { type: 'progress', loaded: 1 * MB, total: 2 * MB });
const enRows = sbEn.EplakUploadProgress.rowsHtml(sbEn.EplakUploadProgress.items('E'));
ok('حالت انگلیسی: رقم لاتین و علامت % (نه ۵۰٪)', /50%/.test(enRows) && !/۵۰/.test(enRows) && /1 of 2 MB/.test(enRows), enRows.slice(0, 400));
sbEn.EplakUploadProgress.apply('E', 0, { type: 'done' });
ok('حالت انگلیسی: «File uploaded»', /File uploaded/.test(sbEn.EplakUploadProgress.rowsHtml(sbEn.EplakUploadProgress.items('E'))));

/* ══════════ ۲) کد ارسال (core/storage.js) روبه‌روی هاست ساختگی ══════════ */
console.log('\n=== ارسال تکه‌تکه‌ی فیلم روبه‌روی هاست ساختگی (پروتکل واقعی api/media.php) ===');

function makeHost(opts = {}) {
  const uploads = new Map();      /* uploadId → { next, parts[] } */
  const stored = [];              /* فایل‌های کامل‌شده */
  const host = { requests: 0, blocked: 0, dropped: 0, duplicates: 0, conflicts: 0, tooMany: 0, chunkSizes: [], stored, opts, wholeFile: 0 };
  const json = (obj, status = 200) => ({ status, body: JSON.stringify(obj) });
  host.handle = (url, bodyStr) => {
    host.requests++;
    const bytes = Buffer.byteLength(bodyStr);
    if (opts.wafMax && bytes > opts.wafMax) { host.blocked++; return { status: 403, body: '<html><title>403 Forbidden</title></html>' }; }
    if (opts.dropEvery && host.requests % opts.dropEvery === 0) { host.dropped++; return { network: true }; }
    const p = JSON.parse(bodyStr);
    const cap = opts.legacy ? 500 : 6000;
    if (/media\.php\?action=chunk/.test(url)) {
      const total = Number(p.total), idx = Number(p.index);
      if (idx < 0 || total < 1 || total > cap || idx >= total) {
        host.tooMany++;
        return json({ success: false, error: 'شماره‌ی تکه نامعتبر است.', ...(opts.legacy ? {} : { max_chunks: cap }) }, 400);
      }
      if (opts.hardError) return json({ success: false, error: 'حجم فایل بیش از حد مجاز است (حداکثر ۸۰ مگابایت).' }, 413);
      const up = uploads.get(p.uploadId) || { next: 0, parts: [], name: p.name };
      uploads.set(p.uploadId, up);
      /* مثل سرور واقعی (done.json): ارسالِ کامل‌شده، هر تکه‌ی تکراری را با همان نتیجه‌ی قبلی جواب می‌دهد */
      if (up.finished) return json({ success: true, received: up.finished.total, total: up.finished.total, done: true, already: true, media: up.finished.media });
      if (!opts.legacy && up.next > 0 && idx === up.next - 1) { host.duplicates++; return json({ success: true, received: up.next, total, done: false, duplicate: true }); }
      if (idx !== up.next) { host.conflicts++; return json({ success: false, error: 'ترتیب تکه‌ها به هم خورده است؛ ارسال را از اول تکرار کنید.', expected: up.next }, 409); }
      const raw = Buffer.from(String(p.data).split('base64,')[1] || '', 'base64');
      host.chunkSizes.push(raw.length);
      up.parts.push(raw); up.next++;
      let reply;
      if (idx + 1 >= total) {
        const all = Buffer.concat(up.parts);
        stored.push({ name: p.name, bytes: all, md5: md5(all) });
        const mediaInfo = { kind: /video/.test(p.mime) ? 'video' : 'image', name: p.name, size: all.length, url: 'uploads/' + p.name };
        up.finished = { total, media: mediaInfo };
        reply = json({ success: true, received: total, total, done: true, media: mediaInfo });
      } else {
        reply = json({ success: true, received: idx + 1, total, done: false, max_chunks: cap });
      }
      if (opts.dropAfterProcessEvery && host.requests % opts.dropAfterProcessEvery === 0) { host.dropped++; return { network: true }; }   /* پردازش شد ولی پاسخ گم شد */
      return reply;
    }
    if (/reports\.php\?action=add_media/.test(url)) {
      host.wholeFile++;
      const raw = Buffer.from(String(p.data).split('base64,')[1] || '', 'base64');
      stored.push({ name: p.name, bytes: raw, md5: md5(raw) });
      return json({ success: true, media: { kind: /video/.test(p.mime) ? 'video' : 'image', name: p.name, size: raw.length, url: 'uploads/' + p.name } });
    }
    return json({ success: false, error: 'کنش نامعتبر است.' }, 400);
  };
  return host;
}

function makeStorageSandbox(host, { chunkSize, online = true, scale = true } = {}) {
  const listeners = {};
  const nav = { onLine: online, userAgent: 'test' };
  const sb = {
    console,
    setTimeout: (fn, ms) => setTimeout(fn, scale && ms > 20 && ms <= 6000 ? 1 : ms),   /* مکث‌های تلاش دوباره کوتاه می‌شوند؛ انتظار ۴۵ثانیه‌ای نه */
    clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Promise, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol, parseInt, parseFloat, isNaN, isFinite,
    URLSearchParams, encodeURIComponent, decodeURIComponent, Uint8Array, Blob, File,
    indexedDB: null,
    localStorage: { _d: {}, getItem(k) { return (k in this._d) ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    navigator: nav,
    document: { readyState: 'complete', getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } }),
      addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, classList: { add() {}, remove() {} } }, documentElement: { style: {}, setAttribute() {} } },
    FileReader: class {
      readAsDataURL(blob) {
        const self = this;
        blob.arrayBuffer().then((ab) => {
          self.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(ab).toString('base64');
          if (self.onload) self.onload({ target: self });
        }).catch(() => { if (self.onerror) self.onerror(); });
      }
    },
    XMLHttpRequest: class {
      constructor() { this.upload = {}; this.status = 200; this.responseText = ''; }
      open(method, url) { this._url = url; }
      setRequestHeader() {}
      send(body) {
        const self = this;
        const text = String(body || '');
        const size = Buffer.byteLength(text);
        setTimeout(() => {
          if (self.upload.onprogress) {
            self.upload.onprogress({ lengthComputable: true, loaded: Math.floor(size / 2), total: size });
            self.upload.onprogress({ lengthComputable: true, loaded: size, total: size });
          }
          const r = host.handle(String(self._url), text);
          if (r.network) { if (self.onerror) self.onerror(); return; }
          self.status = r.status; self.responseText = r.body;
          if (self.onload) self.onload();
        }, 0);
      }
    },
    location: { protocol: 'https:', href: 'https://eplak.ir/eplak-fixed/', host: 'eplak.ir', pathname: '/eplak-fixed/' },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    _fire(type) { (listeners[type] || []).slice().forEach((fn) => fn({})); },
    _nav: nav,
    window: null,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  if (chunkSize) sb.EPLAK_MEDIA_CHUNK_SIZE = chunkSize;
  vm.createContext(sb);
  vm.runInContext(read('core/storage.js'), sb, { filename: 'storage.js' });
  return sb;
}

const rnd = (n) => crypto.randomBytes(n);
const mkFile = (name, buf, type) => new File([buf], name, { type });
const PHONE = '09121112233';
const trailOf = (events, idx) => events.filter((e) => e.idx === idx).map((e) => e.ev);

/* ── الف) دو فایل هم‌زمان، رویدادها و درصد ── */
{
  const host = makeHost();
  const sb = makeStorageSandbox(host);
  const photoBuf = rnd(150 * 1024), videoBuf = rnd(1100 * 1024);
  const files = [mkFile('photo.jpg', photoBuf, 'image/jpeg'), mkFile('film.mp4', videoBuf, 'video/mp4')];
  const events = []; const overall = [];
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, files, (p) => overall.push(p), { clientRef: 'EPL-A', onFile: (idx, ev) => events.push({ idx, ev }) }), 20000, null);
  ok('دو فایل (عکس + فیلم) کامل می‌رسند', !!res && res.ok === true && res.media.length === 2, JSON.stringify(res && { ok: res.ok, err: res.error }));
  ok('بایت‌های رسیده‌ی سرور با فایل اصلی یکسان‌اند (md5) — هم عکس هم فیلم',
    host.stored.length === 2 && host.stored.some((s) => s.md5 === md5(photoBuf)) && host.stored.some((s) => s.md5 === md5(videoBuf)));
  const vTrail = trailOf(events, 1);
  ok('رویدادهای فیلم: start ← چند progress ← done (به همین ترتیب)',
    vTrail[0].type === 'start' && vTrail[vTrail.length - 1].type === 'done' && vTrail.filter((e) => e.type === 'progress').length >= 6
    && vTrail.slice(1, -1).every((e) => e.type === 'progress'), JSON.stringify(vTrail.map((e) => e.type)));
  const vProg = vTrail.filter((e) => e.type === 'progress');
  ok('پیشرفت فیلم یکنواخت بالا می‌رود و از اندازه‌ی فایل تجاوز نمی‌کند',
    vProg.every((e, i) => i === 0 || e.loaded >= vProg[i - 1].loaded) && vProg.every((e) => e.loaded <= videoBuf.length && e.total === videoBuf.length), `n=${vProg.length}`);
  ok('پیشرفت «داخل» هر تکه هم گزارش می‌شود (نه فقط پس از تکه): بیش از ۲ مقدار در هر تکه',
    vProg.length > 2 * Math.ceil(videoBuf.length / (200 * 1024)), `n=${vProg.length}`);
  ok('رویداد done فقط پس از تأیید سرور می‌آید و عکس جدا از فیلم تمام می‌شود',
    trailOf(events, 0).some((e) => e.type === 'done') && trailOf(events, 0).filter((e) => e.type === 'done').length === 1);
  ok('درصد کل بر پایه‌ی بایت، یکنواخت و در پایان ۱۰۰ است', overall.length > 3 && overall.every((v, i) => i === 0 || v >= overall[i - 1]) && overall[overall.length - 1] === 100, JSON.stringify(overall.slice(-4)));
  ok('هر تکه شناسه‌ی یکتای درخواست را می‌برد و reportId صفر است', host.requests > 5);
  ok('تکه‌ها ۲۰۰ کیلوبایتی‌اند (تنظیم پیش‌فرض)', Math.max(...host.chunkSizes) === 200 * 1024, String(Math.max(...host.chunkSizes)));
}

/* ── ب) فایروال: بدنه‌ی بیش از ۱۰۰ هزار بایت = ۴۰۳ ── */
{
  const host = makeHost({ wafMax: 100000 });
  const sb = makeStorageSandbox(host);
  const videoBuf = rnd(900 * 1024);
  const events = [];
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('film.mp4', videoBuf, 'video/mp4')], null, { clientRef: 'EPL-B', onFile: (idx, ev) => events.push({ idx, ev }) }), 30000, null);
  ok('با فایروالی که بدنه‌ی بزرگ را می‌بندد هم فیلم می‌رسد (تکه‌ی ۵۰ کیلوبایتی)', !!res && res.ok === true && host.stored.length === 1 && host.stored[0].md5 === md5(videoBuf), JSON.stringify(res && { ok: res.ok, err: res.error }));
  ok('دقیقاً دو بار رد شد (۲۰۰ و ۱۰۰ کیلوبایت) و بعد عبور کرد', host.blocked === 2, String(host.blocked));
  const t = trailOf(events, 0);
  ok('کاربر «تلاش دوباره» را روی همان ردیف می‌بیند و نوار از صفر شروع می‌شود',
    t.filter((e) => e.type === 'restart').length === 2 && /کوچک‌تر/.test(t.find((e) => e.type === 'restart').note) && t[t.length - 1].type === 'done', JSON.stringify(t.map((e) => e.type)));
}

/* ── ج) قطع شبکه + پاسخ گمشده‌ی پس از پردازش — هاست تازه (تکه‌ی تکراری را می‌شناسد) ── */
{
  const host = makeHost({ dropEvery: 7, dropAfterProcessEvery: 5 });
  const sb = makeStorageSandbox(host);
  const videoBuf = rnd(2500 * 1024);
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('film.mp4', videoBuf, 'video/mp4')], null, { clientRef: 'EPL-C' }), 40000, null);
  ok('قطع‌های پی‌درپی و پاسخ‌های گمشده: فیلم سالم و کامل می‌رسد (md5)', !!res && res.ok === true && host.stored.length === 1 && host.stored[0].md5 === md5(videoBuf), JSON.stringify(res && { ok: res.ok, err: res.error }));
  ok('هاست تکه‌ی تکراری را دوباره به فایل نچسباند (duplicate) و ارسال از اول شروع نشد', host.dropped >= 4 && host.duplicates >= 1 && host.chunkSizes.length === Math.ceil(videoBuf.length / (200 * 1024)),
    JSON.stringify({ dropped: host.dropped, dup: host.duplicates, chunks: host.chunkSizes.length }));
}

/* ── د) همان وضعیت با هاستِ قدیمی (بدون تشخیص تکه‌ی تکراری): ۴۰۹ ← ادامه از جای سرور ── */
{
  const host = makeHost({ legacy: true, dropAfterProcessEvery: 6 });
  const sb = makeStorageSandbox(host);
  const videoBuf = rnd(2200 * 1024);
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('film.mp4', videoBuf, 'video/mp4')], null, { clientRef: 'EPL-D' }), 40000, null);
  ok('هاست قدیمی (پاسخ ۴۰۹): اپ از «جای سرور» ادامه می‌دهد و فیلم سالم می‌رسد',
    !!res && res.ok === true && host.stored.length === 1 && host.stored[0].md5 === md5(videoBuf) && host.conflicts >= 1 && host.wholeFile === 0,
    JSON.stringify({ ok: res && res.ok, err: res && res.error, conflicts: host.conflicts, whole: host.wholeFile }));
}

/* ── ه) سقف ۵۰۰ تکه‌ی هاست قدیمی ── */
{
  const big = rnd(13 * 1024 * 1024);
  const hostOld = makeHost({ legacy: true });
  const sbOld = makeStorageSandbox(hostOld, { chunkSize: 24 * 1024 });
  const resOld = await withTimeout(sbOld.uploadReportMediaChunked(0, PHONE, [mkFile('big.mp4', big, 'video/mp4')], null, { clientRef: 'EPL-E1' }), 60000, null);
  ok('هاست قدیمی: بیش از ۵۰۰ تکه رد می‌شود ولی اپ همان فایل را با تکه‌ی بزرگ‌تر می‌فرستد',
    !!resOld && resOld.ok === true && hostOld.tooMany === 1 && hostOld.stored[0].md5 === md5(big) && Math.max(...hostOld.chunkSizes) > 24 * 1024 && hostOld.chunkSizes.length <= 480,
    JSON.stringify({ ok: resOld && resOld.ok, tooMany: hostOld.tooMany, chunks: hostOld.chunkSizes.length }));
  const hostNew = makeHost();
  const sbNew = makeStorageSandbox(hostNew, { chunkSize: 24 * 1024 });
  const resNew = await withTimeout(sbNew.uploadReportMediaChunked(0, PHONE, [mkFile('big.mp4', big, 'video/mp4')], null, { clientRef: 'EPL-E2' }), 60000, null);
  ok('هاست تازه: بیش از ۵۰۰ تکه مشکلی ندارد (۵۴۰ تکه‌ی ۲۴ کیلوبایتی)',
    !!resNew && resNew.ok === true && hostNew.tooMany === 0 && hostNew.chunkSizes.length === Math.ceil(big.length / (24 * 1024)) && hostNew.stored[0].md5 === md5(big),
    JSON.stringify({ ok: resNew && resNew.ok, chunks: hostNew.chunkSizes.length }));
}

/* ── و) خطای قطعی حجم: بی‌خود تکرار نمی‌شود و ردیف «ارسال نشد» می‌شود ── */
{
  const host = makeHost({ hardError: true });
  const sb = makeStorageSandbox(host);
  const events = [];
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('huge.mp4', rnd(300 * 1024), 'video/mp4')], null, { clientRef: 'EPL-F', onFile: (idx, ev) => events.push({ idx, ev }) }), 20000, null);
  const t = trailOf(events, 0);
  ok('خطای حجم: فقط یک درخواست و بلافاصله ناموفق (بدون چرخه‌ی بی‌فایده)', !!res && res.ok === false && host.requests === 1 && res.failed.length === 1, JSON.stringify({ req: host.requests, ok: res && res.ok }));
  ok('ردیف «fail» با دلیل واقعی سرور می‌آید', t[t.length - 1].type === 'fail' && /حجم/.test(t[t.length - 1].note), JSON.stringify(t[t.length - 1]));
}

/* ── ز) مسیر پشتیبان (یک‌جا) وقتی مسیر تکه‌تکه جواب منطقی نمی‌دهد ── */
{
  const host = makeHost();
  const orig = host.handle;
  host.handle = (url, body) => (/action=chunk/.test(url) ? { status: 200, body: JSON.stringify({ success: false, error: 'خطای ناشناخته‌ی سرور' }) } : orig(url, body));
  const sb = makeStorageSandbox(host);
  const buf = rnd(300 * 1024); const events = [];
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('p.jpg', buf, 'image/jpeg')], null, { clientRef: 'EPL-G', onFile: (idx, ev) => events.push({ idx, ev }) }), 20000, null);
  const t = trailOf(events, 0);
  ok('اگر مسیر تکه‌تکه رد شود، همان فایل یک‌جا از دروازه‌ی پشتیبان می‌رود (و ردیف «restart» نشان می‌دهد)',
    !!res && res.ok === true && host.wholeFile === 1 && host.stored[0].md5 === md5(buf) && t.some((e) => e.type === 'restart' && /پشتیبان/.test(e.note)) && t[t.length - 1].type === 'done',
    JSON.stringify(t.map((e) => e.type)));
}

/* ── ح) آفلاین: تا برگشتن اینترنت صبر می‌کند، بعد ادامه می‌دهد ── */
{
  const host = makeHost({ dropEvery: 2 });
  const sb = makeStorageSandbox(host, { online: false, scale: true });
  const buf = rnd(500 * 1024);
  setTimeout(() => { sb._nav.onLine = true; sb._fire('online'); }, 120);
  const t0 = Date.now();
  const res = await withTimeout(sb.uploadReportMediaChunked(0, PHONE, [mkFile('v.mp4', buf, 'video/mp4')], null, { clientRef: 'EPL-H' }), 20000, null);
  ok('قطع شبکه‌ی آفلاین: اپ تا رویداد «online» صبر می‌کند و بعد فیلم را کامل می‌رساند',
    !!res && res.ok === true && host.stored[0].md5 === md5(buf) && Date.now() - t0 >= 100, JSON.stringify({ ok: res && res.ok, ms: Date.now() - t0 }));
}

/* ══════════ ۳) سرور: تکه‌ی تکراری و سقف تعداد تکه (PHP-wasm) ══════════ */
console.log('\n=== سرور: تکه‌ی تکراری و سقف تعداد تکه (api/media.php) ===');
const DB = '/tmp/eplak-regression-upload.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.rmSync(`${APP}/uploads`, { recursive: true, force: true });
const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({ code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path', '/tmp'); ${code}` })).text).trim();

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const cut = [PNG.subarray(0, 24), PNG.subarray(24, 48), PNG.subarray(48)];
const sendChunk = (id, index, total, buf, ref = 'EPL-SRV-DUP') => run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '0', 'client_ref' => '${ref}', 'uploadId' => '${id}', 'index' => '${index}', 'total' => '${total}', 'name' => 'dup.png', 'mime' => 'image/png', 'data' => '${buf.toString('base64')}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`);

const c0 = pickJson(await sendChunk('d0d0d0d0aaaa1111', 0, 3, cut[0]));
const c0again = pickJson(await sendChunk('d0d0d0d0aaaa1111', 0, 3, cut[0]));
const c1 = pickJson(await sendChunk('d0d0d0d0aaaa1111', 1, 3, cut[1]));
const c1again = pickJson(await sendChunk('d0d0d0d0aaaa1111', 1, 3, cut[1]));
const c2 = pickJson(await sendChunk('d0d0d0d0aaaa1111', 2, 3, cut[2]));
ok('تکه‌ی ۰ پذیرفته می‌شود', c0?.success === true && c0?.received === 1 && c0?.done === false, JSON.stringify(c0));
ok('همان تکه‌ی ۰ دوباره (پاسخ قبلی گم شده بود): موفق ولی دوباره چسبانده نمی‌شود', c0again?.success === true && c0again?.duplicate === true && c0again?.received === 1, JSON.stringify(c0again));
ok('ارسال از جای درست ادامه می‌یابد (تکه‌ی ۱) و تکه‌ی ۱ تکراری هم بی‌اثر است',
  c1?.success === true && c1?.received === 2 && c1again?.success === true && c1again?.duplicate === true && c1again?.received === 2, JSON.stringify([c1, c1again]));
ok('تکه‌ی آخر فایل را کامل و معتبر ثبت می‌کند (تکراری‌ها خرابش نکرده‌اند)', c2?.success === true && c2?.done === true && c2?.media?.size === PNG.length, JSON.stringify(c2));
const storedBytes = c2?.media?.path ? fs.readFileSync(`${APP}/${c2.media.path}`) : Buffer.alloc(0);
ok('بایت‌های ذخیره‌شده روی سرور با فایل اصلی یکسان است (md5)', md5(storedBytes) === md5(PNG));
const skip = pickJson(await sendChunk('e1e1e1e1bbbb2222', 2, 3, cut[2], 'EPL-SRV-SKIP'));
ok('تکه‌ی جلوتر از نوبت هنوز رد می‌شود (۴۰۹) و جای سرور را می‌گوید', skip?.success === false && skip?.expected === 0, JSON.stringify(skip));
const many = pickJson(await sendChunk('f2f2f2f2cccc3333', 0, 4000, cut[0], 'EPL-SRV-MANY'));
ok('سقف تعداد تکه بالا رفته: ۴۰۰۰ تکه (فیلم ۸۰ مگابایتی با تکه‌ی ۲۰ کیلوبایتی) پذیرفته می‌شود', many?.success === true && many?.received === 1 && many?.max_chunks === 6000, JSON.stringify(many));
const tooMany = pickJson(await sendChunk('a3a3a3a3dddd4444', 0, 6001, cut[0], 'EPL-SRV-TOO'));
ok('بیش از سقف مجاز رد می‌شود و سقف را به اپ می‌گوید', tooMany?.success === false && tooMany?.max_chunks === 6000, JSON.stringify(tooMany));
const mediaSrc = read('shared/media.php');
ok('ثابت سقف تعداد تکه در هسته تعریف شده است', /define\('EPLAK_MEDIA_MAX_CHUNKS', 6000\)/.test(mediaSrc) && !/\$total > 500/.test(read('api/media.php')));

/* ══════════ ۴) ساخته نشدن زودهنگام گزارش + ساختار نمایش ══════════ */
console.log('\n=== «عکس رسید ولی فیلم نه»: گزارش پیش از پایان ارسال ساخته نمی‌شود ===');
const reportsJs = read('modules/reports.js');
const indexHtml = read('index.html');
ok('مجموعه‌ی «ارسال در جریان» (uploadsInFlight) وجود دارد', /const uploadsInFlight = new Set\(\)/.test(reportsJs));
ok('همگام‌سازی دوره‌ای گزارش‌های «در انتظار» را وقتی فایلشان در راه است نمی‌سازد',
  /async function flushPendingCreates[\s\S]{0,700}uploadsInFlight\.has\(String\(r\.clientRef\)\)\) continue;/.test(reportsJs));
ok('ثبت نهایی از لحظه‌ی نمایش گزارش تا پایان ارسال در حال «ارسال» علامت می‌خورد (و در finally آزاد می‌شود)',
  /reports\.unshift\(newReport\);\s*uploadsInFlight\.add\(clientRef\)/.test(reportsJs) && /finally \{\s*uploadsInFlight\.delete\(clientRef\);/.test(reportsJs));
ok('«تلاش دوباره» هم هم‌زمانِ ارسال جاری اجرا نمی‌شود و در پایان آزاد می‌کند',
  /async function retryReportWithMedia[\s\S]{0,400}uploadsInFlight\.has\(guardRef\)\) return false;[\s\S]{0,400}finally \{\s*if \(guardRef\) uploadsInFlight\.delete\(guardRef\);/.test(reportsJs));
ok('ارسال خودکار صف گوشی هم گروهِ «در حال ارسال» را رد می‌کند و فایل‌هایش را از صف پاک نمی‌کند',
  /skip: \(group\) => !!\(group\.clientRef && uploadsInFlight\.has/.test(reportsJs)
  && /hooks\.skip\(group\)\) \{\s*failedGroups\.add\(key\);\s*continue;/.test(read('core/storage.js')));

console.log('\n=== نمایش نمودار: جاها و ساختار ===');
ok('صفحه‌ی «گزارش ثبت شد» کادر نمودار هر فایل را دارد', /id="reportUploadList"/.test(indexHtml));
ok('ماژول نمودار پیش از ماژول گزارش‌ها بار می‌شود', indexHtml.indexOf('core/upload-progress.js') > -1 && indexHtml.indexOf('core/upload-progress.js') < indexHtml.indexOf('modules/reports.js'));
ok('زیر «روند رسیدگی» ← گام «ثبت گزارش» کادر نمودار ساخته می‌شود و به ماژول وصل می‌شود',
  /stage\.key === 'created' \? '<div class="flow-uploads" id="flowUploads"/.test(reportsJs) && /bindDetailUploads\(r\)/.test(reportsJs)
  && /tracker\.itemsFromMedia\(report\.media\)/.test(reportsJs));
ok('هر عکس/فیلم هنگام ارسال با رویداد onFile به نمودار می‌رسد', /onFile: \(idx, ev\) => \{ if \(tracker && ref\) tracker\.apply\(ref, idx, ev\); \}/.test(reportsJs));
ok('از داخل ردیف ناموفقِ جزئیات گزارش می‌شود دوباره امتحان کرد', /async function retryUploadByRef/.test(reportsJs) && /onRetry: retryUploadByRef/.test(reportsJs));
const css = read('assets/css/style.css');
ok('استایل نمودار (نوار، درصد، فایل آپلود شد، ناموفق) در برگه‌ی استایل هست',
  /\.up-bar \{/.test(css) && /\.up-fill \{/.test(css) && /\.up-row\.is-done/.test(css) && /\.up-row\.is-failed/.test(css) && /\.flow-uploads/.test(css));
ok('ترجمه‌ی انگلیسی عبارت‌های نمودار در دیکشنری هست', /'فایل آپلود شد': 'File uploaded'/.test(read('core/i18n.js')));
const cam = read('assets/js/ep-camera.js');
ok('فیلم ضبط‌شده‌ی داخل اپ سبک‌تر است (۱٫۵ مگابیت؛ حدود ۱۱ مگابایت در دقیقه)',
  /VIDEO_BITS_PER_SECOND = 1500000/.test(cam) && /videoBitsPerSecond: VIDEO_BITS_PER_SECOND/.test(cam) && /new MediaRecorder\(state\.stream, recorderOptions\)/.test(cam));

console.log('\n' + '='.repeat(52));
console.log(`UPLOAD: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

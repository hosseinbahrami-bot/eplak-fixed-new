/* push.test.mjs — «تغییر وضعیت/پاسخ در پنل ← اعلان روی گوشی کاربر»
   ------------------------------------------------------------------
   ریشه‌ی خرابی که این آزمون جلویش را می‌گیرد:
     اپ اندروید، گوشی را به‌صورت «فرم ساده» (application/x-www-form-urlencoded) در
     api/push.php ثبت می‌کرد، ولی آن فایل فقط JSON می‌خواند ← هر ثبت با خطای ۴۰۰
     رد می‌شد ← جدول device_tokens همیشه خالی بود ← هیچ اعلان پنلی به گوشی نمی‌رفت.
     و هیچ آزمونی این مسیر را (با بدنه‌ی واقعی HTTP) نمی‌سنجید.

   چه چیزی واقعاً اجرا می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) پشت PHPRequestHandler؛ درخواست‌های HTTP واقعی به
        api/push.php (فرم، JSON، query) و به صفحه‌های پنل ادمین (با ورود و CSRF).
     ۲) یک «گوگلِ ساختگی» (OAuth + FCM) که پیام‌های رسیده را ثبت می‌کند.
     ۳) هر سه مسیر پنل (جزئیات گزارش، تغییر سریع وضعیت، ویرایش) ← اعلان داخل اپ +
        پیام به گوگل + ردیف push_log + پیام نتیجه برای مدیر.
     ۴) شکست‌ها: گوشی ثبت‌نشده، سرور بدون دسترسی به گوگل (و قطع‌کن)، توکن باطل،
        ۴۰۱ و تازه‌سازی توکن دسترسی.
     ۵) لایه‌ی وب اپ (modules/live.js در vm): ثبت مستقل از Service Worker، تلاش مجدد
        پله‌ای، تازه‌سازی هر ۶ ساعت، جداسازی در خروج، دکمه‌ی «تست اعلان».
   اجرا:  bash tools/dev/run-regression.sh push
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-push-shim';
const DB = '/tmp/eplak-regression-push.sqlite';
const CTL = '/tmp/eplak-regression-push.env.json';
const PREPEND = '/tmp/eplak-regression-push.prepend.php';
const G_PORT = 8096;
for (const f of [DB, CTL]) if (fs.existsSync(f)) fs.unlinkSync(f);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ══════════ گوگلِ ساختگی (OAuth + FCM) ══════════ */
const serviceKeys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const serviceAccount = {
  type: 'service_account', project_id: 'eplak-test-project', private_key_id: 'abc123',
  private_key: serviceKeys.privateKey,
  client_email: 'firebase-adminsdk-xyz@eplak-test-project.iam.gserviceaccount.com',
  client_id: '1234567890', token_uri: 'https://oauth2.googleapis.com/token',
};
const G = { tokenCalls: 0, messages: [], validateCalls: 0, unauthOnce: 0, tokenHttp: 200 };
const fakeGoogle = http.createServer((req, res) => {
  let body = Buffer.alloc(0);
  req.on('data', (c) => { body = Buffer.concat([body, c]); });
  req.on('end', () => {
    const text = body.toString();
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.startsWith('/token')) {
      G.tokenCalls++;
      if (G.tokenHttp !== 200) return json(G.tokenHttp, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      return json(200, { access_token: 'ya29.FAKE-' + G.tokenCalls, expires_in: 3600, token_type: 'Bearer' });
    }
    if (req.url.includes('/messages:send')) {
      const parsed = JSON.parse(text);
      if (parsed.validate_only) {
        G.validateCalls++;
        return json(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } });
      }
      if (G.unauthOnce > 0) {
        G.unauthOnce--;
        return json(401, { error: { status: 'UNAUTHENTICATED', message: 'Request had invalid authentication credentials.' } });
      }
      G.messages.push({ auth: req.headers.authorization, message: parsed.message });
      if (parsed?.message?.token === 'BAD-TOKEN') {
        return json(404, { error: { status: 'UNREGISTERED', message: 'Requested entity was not found.' } });
      }
      return json(200, { name: 'projects/eplak-test-project/messages/' + G.messages.length });
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise((r) => fakeGoogle.listen(G_PORT, '127.0.0.1', r));
const setEnv = (obj) => fs.writeFileSync(CTL, JSON.stringify(obj));
const GOOGLE_ENV = { EPLAK_TEST_TOKEN_URL: `http://127.0.0.1:${G_PORT}/token`, EPLAK_TEST_FCM_BASE: `http://127.0.0.1:${G_PORT}/v1/projects/` };
const DEAD_ENV = { EPLAK_TEST_TOKEN_URL: 'http://127.0.0.1:1/token', EPLAK_TEST_FCM_BASE: 'http://127.0.0.1:1/v1/projects/' };
setEnv(GOOGLE_ENV);

/* ══════════ نسخه‌ی آزمایشی کد (فقط نشانی گوگل عوض می‌شود؛ به مخزن دست نمی‌زنیم) ══════════ */
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
for (const entry of ['admin', 'api', 'core', 'modules', 'shared', 'views', 'assets']) {
  const src = `${ROOT}/${entry}`;
  if (fs.existsSync(src)) fs.cpSync(src, `${SHIM}/${entry}`, { recursive: true });
}
for (const file of ['index.html', 'app.js', 'sw.js', 'manifest.json', 'index.php']) {
  const src = `${ROOT}/${file}`;
  if (fs.existsSync(src)) fs.copyFileSync(src, `${SHIM}/${file}`);
}
let fcmSrc = fs.readFileSync(`${SHIM}/shared/fcm.php`, 'utf8');
const oauthLiteral = `    $response = eplakHttpPost(\n        'https://oauth2.googleapis.com/token',`;
const baseLiteral = "'https://fcm.googleapis.com/v1/projects/' . rawurlencode($projectId)";
const shimOk = fcmSrc.includes(oauthLiteral) && fcmSrc.includes(baseLiteral);
fcmSrc = fcmSrc.replace(oauthLiteral, `    $response = eplakHttpPost(\n        getenv('EPLAK_TEST_TOKEN_URL') ?: 'https://oauth2.googleapis.com/token',`);
fcmSrc = fcmSrc.replace(baseLiteral, "(getenv('EPLAK_TEST_FCM_BASE') ?: 'https://fcm.googleapis.com/v1/projects/') . rawurlencode($projectId)");
fs.writeFileSync(`${SHIM}/shared/fcm.php`, fcmSrc);
console.log('\n=== آماده‌سازی ===');
ok('نسخه‌ی آزمایشی به گوگل ساختگی وصل شد (دو نشانی در shared/fcm.php پیدا شد)', shimOk);

fs.writeFileSync(PREPEND, `<?php
putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}');
$_ENV['DB_DRIVER'] = 'sqlite'; $_ENV['DB_SQLITE_PATH'] = '${DB}';
ini_set('session.save_path', '/tmp');
$__ctl = json_decode((string) @file_get_contents('${CTL}'), true);
foreach ((array) $__ctl as $__k => $__v) { putenv($__k . '=' . $__v); }
`);

const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
useHostFilesystem(php);
await setPhpIniEntries(php, {
  auto_prepend_file: PREPEND, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL',
});
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8095' });

/* ── ابزارهای HTTP ── */
const enc = new TextEncoder();
const jar = {};
const absorb = (res) => {
  const sc = res.headers['set-cookie'];
  for (const c of (Array.isArray(sc) ? sc : sc ? [sc] : [])) {
    const [pair] = String(c).split(';'); const i = pair.indexOf('=');
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
};
async function req(method, url, { form, json, rawBody, ctype, cookies = false } = {}) {
  const headers = {};
  let body;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = enc.encode(new URLSearchParams(form).toString()); }
  else if (json !== undefined) { headers['content-type'] = 'application/json'; body = enc.encode(JSON.stringify(json)); }
  else if (rawBody !== undefined) { headers['content-type'] = ctype || 'text/plain'; body = enc.encode(rawBody); }
  if (cookies && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handler.request({ url, method, headers, body });
  if (cookies) absorb(res);
  const text = res.text;
  let parsed = null; try { parsed = JSON.parse(text); } catch (e) {}
  return { status: res.httpStatusCode, headers: res.headers, text, json: parsed };
}
/* اپ اندروید: بدون کوکی؛ فرم ساده */
const appPost = (form, q = '') => req('POST', `/api/push.php${q}`, { form });
const appGet = (q) => req('GET', `/api/push.php?${q}`);
/* پنل ادمین: با کوکی نشست */
const admin = {
  get: (url) => req('GET', url, { cookies: true }),
  post: (url, form) => req('POST', url, { form, cookies: true }),
};
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';

/* ── ابزار دیتابیس (قطعه‌ی PHP روی همان فایل SQLite) ── */
const phpRun = async (code) => {
  const env = JSON.parse(fs.readFileSync(CTL, 'utf8'));
  const puts = Object.entries(env).map(([k, v]) => `putenv('${k}=${v}');`).join(' ');
  const res = await php.run({
    code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); ${puts} `
      + `require_once '${SHIM}/admin/includes/db.php'; require_once '${SHIM}/admin/includes/functions.php'; `
      + `require_once '${SHIM}/shared/notify_events.php'; require_once '${SHIM}/shared/media.php'; ${code}`,
  });
  return String(res.text);
};
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 400)); return JSON.parse(m.split('>>>')[0]); };
const q = async (sql) => grab(await phpRun(`echo '<<<' . json_encode($pdo->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE) . '>>>';`));
const exec = (code) => phpRun(code);

/* ══════════════════════════════════════════════════════════════════
   ۱) ثبت گوشی از اپ (api/push.php) — قالب‌های بدنه
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== ثبت گوشی: فرم ساده (همان قالبی که اپ اندروید می‌فرستد) ===');
const PHONE = '09120001111';
let r = await appPost({ action: 'register_fcm', phone: '', token: 'TOK-FORM-1', platform: 'android' });
ok('ثبت با «فرم ساده» و شماره‌ی خالی (باز شدن تازه‌ی اپ) پذیرفته می‌شود (پیش‌تر: ۴۰۰ «توکن الزامی است»)',
  r.status === 200 && r.json?.success === true && r.json?.saved === true, `${r.status} ${r.text.slice(0, 160)}`);
let rows = await q("SELECT user_phone, platform, is_active FROM device_tokens WHERE token='TOK-FORM-1'");
ok('توکن در جدول device_tokens ذخیره و فعال است', rows.length === 1 && Number(rows[0].is_active) === 1 && rows[0].user_phone === '', JSON.stringify(rows));

r = await appPost({ action: 'register_fcm', phone: PHONE, token: 'TOK-FORM-1', platform: 'android' });
rows = await q("SELECT user_phone FROM device_tokens WHERE token='TOK-FORM-1'");
ok('پس از ورود (فرم با شماره)، گوشی به شماره‌ی کاربر وصل می‌شود', rows[0]?.user_phone === PHONE && r.json?.attached === true && r.json?.devices === 1, `${JSON.stringify(rows)} ${r.text.slice(0, 120)}`);

r = await appPost({ action: 'register_fcm', phone: '', token: 'TOK-FORM-1', platform: 'android' });
rows = await q("SELECT user_phone, is_active FROM device_tokens WHERE token='TOK-FORM-1'");
ok('بالا آمدن دوباره‌ی اپ (شماره‌ی خالی) اتصال به شماره را پاک نمی‌کند (وگرنه اعلان شخصی به گوشی نمی‌رفت)',
  rows[0]?.user_phone === PHONE && Number(rows[0]?.is_active) === 1, JSON.stringify(rows));

r = await appPost({ action: 'register_fcm', phone: '', token: 'TOK-FORM-1', platform: 'android', detach: '1' });
rows = await q("SELECT user_phone FROM device_tokens WHERE token='TOK-FORM-1'");
ok('خروج صریح از حساب (detach=1) گوشی را از شماره جدا می‌کند', rows[0]?.user_phone === '' && r.json?.detached === true, JSON.stringify(rows));

console.log('\n=== ثبت گوشی: JSON، query و ورودی‌های خراب ===');
r = await req('POST', '/api/push.php', { json: { action: 'register_fcm', phone: PHONE, token: 'TOK-JSON-1', platform: 'android' } });
rows = await q("SELECT user_phone FROM device_tokens WHERE token='TOK-JSON-1'");
ok('بدنه‌ی JSON هم پذیرفته می‌شود (سازگار با نسخه‌های قبلی)', r.json?.success === true && rows[0]?.user_phone === PHONE, r.text.slice(0, 120));
r = await req('POST', '/api/push.php?action=register_fcm', { form: { phone: PHONE, token: 'TOK-QUERY-1' } });
ok('کنش در query و بقیه در فرم هم پذیرفته می‌شود', r.json?.success === true, r.text.slice(0, 120));
r = await req('POST', '/api/push.php', { rawBody: `action=register_fcm&phone=${PHONE}&token=TOK-RAW-1`, ctype: 'text/plain' });
ok('بدنه‌ی خام «کلید=مقدار» با Content-Type نامعمول هم خوانده می‌شود (برخی هاست‌ها/پروکسی‌ها نوع را عوض می‌کنند)', r.json?.success === true, r.text.slice(0, 120));
r = await req('POST', '/api/push.php', { rawBody: JSON.stringify({ action: 'register_fcm', phone: PHONE, token: 'TOK-PLAIN-JSON', platform: 'android' }), ctype: 'text/plain;charset=UTF-8' });
ok('JSON با Content-Type «text/plain» (روش جایگزین اپ وقتی فایروال فرم را رد کند) هم پذیرفته می‌شود', r.json?.success === true, r.text.slice(0, 120));
r = await appPost({ action: 'register_fcm', phone: PHONE });
ok('بدون توکن: خطای ۴۰۰ فارسی', r.status === 400 && /توکن/.test(r.json?.error || ''), `${r.status} ${r.text.slice(0, 100)}`);
r = await req('POST', '/api/push.php', { rawBody: 'action[]=x&token[]=y&phone[]=z', ctype: 'application/x-www-form-urlencoded' });
ok('ورودی آرایه‌ای هشدار/کرش PHP نمی‌سازد (پاسخ JSON تمیز)', r.json !== null && !/Warning|Notice|Fatal/i.test(r.text), r.text.slice(0, 160));
r = await appGet('');
ok('بدون کنش، همان «config» قبلی برمی‌گردد (سازگاری)', r.json?.success === true && 'fcm_ready' in r.json, r.text.slice(0, 120));

console.log('\n=== وضعیت «همین گوشی» ===');
r = await appGet(`action=status&phone=${PHONE}&token=TOK-JSON-1`);
ok('status: گوشی ثبت‌شده، فعال و متعلق به همین شماره است', r.json?.device?.registered === true && r.json?.device?.active === true && r.json?.device?.phone_match === true, r.text.slice(0, 200));
r = await appGet('action=status&token=NOPE-TOKEN');
ok('status: توکن ناشناخته → registered=false (فقط با توکن هم کار می‌کند)', r.json?.success === true && r.json?.device?.registered === false, r.text.slice(0, 200));
r = await appGet('action=status');
ok('status بدون شماره و توکن → ۴۰۰', r.status === 400);

/* ══════════════════════════════════════════════════════════════════
   ۲) پنل ادمین ← اعلان
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== راه‌اندازی پنل (کلید فایربیس، کاربر، گزارش) ===');
const PHONE_B = '09120002222';     /* بدون گوشی */
const PHONE_C = '09120003333';     /* توکن باطل */
const setup = grab(await exec(`
eplakSetAppSetting($pdo, 'fcm_service_account', ${JSON.stringify(JSON.stringify(serviceAccount))});
foreach (['${PHONE}', '${PHONE_B}', '${PHONE_C}'] as $p) { $pdo->exec("INSERT OR IGNORE INTO users (phone, name) VALUES ('$p','کاربر')"); }
$ids = [];
foreach (['${PHONE}', '${PHONE}', '${PHONE}', '${PHONE_B}', '${PHONE_C}'] as $i => $p) {
  $ids[] = createReport($pdo, ['user_phone' => $p, 'title' => 'گزارش ' . ($i + 1), 'description' => 'توضیح', 'category' => 'سایر', 'status' => 'pending']);
}
echo '<<<' . json_encode(['ids' => $ids]) . '>>>';`));
const [RA, RA2, RA3, RB, RC] = setup.ids;
const codeOf = (id) => 'EP-1403-' + String(id + 1000).padStart(4, '0');

/* گوشی‌های آزمایشِ بخش قبل پاک می‌شوند تا شمارش پیام‌ها دقیق باشد */
await exec(`$pdo->exec('DELETE FROM device_tokens');`);
await appPost({ action: 'register_fcm', phone: PHONE, token: 'TOK-PANEL-1', platform: 'android' });
await appPost({ action: 'register_fcm', phone: PHONE_C, token: 'BAD-TOKEN', platform: 'android' });

let login = await admin.get('/admin/login.php');
login = await req('POST', '/admin/login.php', { form: { username: 'admin', password: 'admin123' }, cookies: true });
ok('ورود به پنل ادمین (HTTP واقعی با نشست و کوکی)', login.status === 302 && /index\.php/.test(String(login.headers.location || '')), `${login.status} ${login.headers.location}`);

const quick = async (id, status, reply = '') => {
  const page = await admin.get('/admin/reports.php');
  const token = csrfOf(page.text);
  const post = await admin.post('/admin/reports.php', { _token: token, quick_status_id: String(id), status, reply });
  const follow = await admin.get(String(post.headers.location || '/admin/reports.php?status_saved=1'));
  const flash = (follow.text.match(/data-testid="status-flash" data-notify-type="(\w+)"/) || [])[1] || '';
  const flashText = ((follow.text.match(/data-testid="status-flash"[\s\S]*?<\/i>([\s\S]*?)<\/div>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
  return { post, flash, flashText, html: follow.text };
};
const notifsOf = (phone) => q(`SELECT id, title, body FROM notifications WHERE user_phone='${phone}' ORDER BY id`);
const logOf = (code) => q(`SELECT kind, code, devices, sent, failed, outcome, error FROM push_log WHERE code='${code}' ORDER BY id`);
const gMsgs = () => G.messages.length;

console.log('\n=== ۱) تغییر سریع وضعیت در فهرست گزارش‌ها («در حال رسیدگی») ===');
let g0 = gMsgs();
let s = await quick(RA, 'in_progress', '');
ok('پس از تغییر وضعیت به ریدایرکت می‌رود (POST/redirect/GET)', s.post.status === 302 && /status_saved=1/.test(String(s.post.headers.location)), `${s.post.status} ${s.post.headers.location}`);
let n = await notifsOf(PHONE);
ok('اعلان داخل اپ برای کاربر ساخته شد', n.length === 1 && n[0].title.includes(codeOf(RA)), JSON.stringify(n));
ok('متن اعلان «در حال رسیدگی» را می‌گوید', /در حال رسیدگی/.test(n[0]?.body || ''), n[0]?.body);
ok('پیام فایربیس به گوگل رسید (یک گوشی)', gMsgs() === g0 + 1, `پیام‌ها: ${gMsgs() - g0}`);
const m1 = G.messages.at(-1);
ok('پیام به توکن همین کاربر رفت، با عنوان و متن اعلان', m1?.message?.token === 'TOK-PANEL-1' && m1?.message?.notification?.title === n[0]?.title && /در حال رسیدگی/.test(m1?.message?.notification?.body || ''), JSON.stringify(m1?.message?.notification));
ok('اولویت بالا و کانال اعلان تنظیم است (رسیدن در حالت بسته بودن اپ)', m1?.message?.android?.priority === 'high' && m1?.message?.android?.notification?.channel_id === 'eplak_alerts');
let lg = await logOf(codeOf(RA));
ok('نتیجه‌ی ارسال در push_log ثبت شد (sent، ۱ از ۱)', lg.length === 1 && lg[0].outcome === 'sent' && Number(lg[0].sent) === 1 && Number(lg[0].devices) === 1, JSON.stringify(lg));
ok('مدیر پیام «موفق» با شمار دستگاه می‌بیند', s.flash === 'success' && /1 دستگاه|۱ دستگاه/.test(s.flashText), `${s.flash} | ${s.flashText}`);

console.log('\n=== ۲) «انجام شد» ===');
g0 = gMsgs();
s = await quick(RA, 'done', '');
n = await notifsOf(PHONE);
ok('اعلان دوم برای «انجام شد» ساخته شد و گوشی هم گرفت', n.length === 2 && /انجام شد/.test(n[1].body) && gMsgs() === g0 + 1, JSON.stringify(n.map((x) => x.body)));
ok('پیام موفق برای مدیر', s.flash === 'success', `${s.flash} | ${s.flashText}`);

console.log('\n=== ۳) ذخیره‌ی دوباره‌ی همان وضعیت: اعلان تکراری نمی‌سازد ===');
g0 = gMsgs();
s = await quick(RA, 'done', '');
n = await notifsOf(PHONE);
ok('بدون تغییر ← اعلان تازه‌ای ساخته نمی‌شود و به گوگل چیزی نمی‌رود', n.length === 2 && gMsgs() === g0, `${n.length} / ${gMsgs() - g0}`);
ok('مدیر پیام «تغییری ثبت نشد» می‌بیند (نه موفقیت دروغین)', s.flash === 'info' && /تغییری/.test(s.flashText), `${s.flash} | ${s.flashText}`);

console.log('\n=== ۴) پاسخ تازه (وضعیت ثابت) از صفحه‌ی جزئیات ===');
let detail = await admin.get(`/admin/report_detail.php?id=${RA}`);
let tokenD = csrfOf(detail.text);
g0 = gMsgs();
let post = await admin.post(`/admin/report_detail.php?id=${RA}`, { _token: tokenD, form_action: 'reply', status: 'done', reply: 'اکیپ اعزام شد و کار تمام شد' });
n = await notifsOf(PHONE);
ok('پاسخ تازه ← اعلان ساخته و ارسال شد', n.length === 3 && gMsgs() === g0 + 1, `${n.length} / ${gMsgs() - g0}`);
ok('متن اعلان «پاسخ جدید» است و متن پاسخ را دارد (نه «وضعیت تغییر کرد»)', /پاسخ جدیدی/.test(n[2].body) && /اکیپ اعزام شد/.test(n[2].body) && !/تغییر کرد/.test(n[2].body), n[2]?.body);
ok('پیام نتیجه برای مدیر نمایش داده می‌شود', /data-testid="reply-flash" data-notify-type="success"/.test(post.text) && /ثبت شد/.test(post.text), post.text.slice(0, 80));
post = await admin.post(`/admin/report_detail.php?id=${RA}`, { _token: tokenD, form_action: 'reply', status: 'done', reply: 'اکیپ اعزام شد و کار تمام شد' });
n = await notifsOf(PHONE);
ok('ثبت دوباره‌ی همان پاسخ و همان وضعیت ← اعلان تکراری نمی‌سازد', n.length === 3 && /data-notify-type="info"/.test(post.text), `${n.length}`);

console.log('\n=== ۵) تغییر سریع وضعیت وقتی پاسخ قبلی ذخیره است (فرم لیست، پاسخ قبلی را هم می‌فرستد) ===');
const events0 = (await q(`SELECT COUNT(*) AS c FROM report_events WHERE report_id=${RA} AND body LIKE '%اکیپ اعزام%'`))[0].c;
g0 = gMsgs();
s = await quick(RA, 'in_progress', 'اکیپ اعزام شد و کار تمام شد');
n = await notifsOf(PHONE);
const last = n.at(-1);
ok('اعلان وضعیت ساخته شد', n.length === 4 && /در حال رسیدگی/.test(last.body) && gMsgs() === g0 + 1, JSON.stringify(last));
ok('پاسخ قدیمی دوباره در متن اعلان تکرار نمی‌شود', !/اکیپ اعزام/.test(last.body), last.body);
const events1 = (await q(`SELECT COUNT(*) AS c FROM report_events WHERE report_id=${RA} AND body LIKE '%اکیپ اعزام%'`))[0].c;
ok('پاسخ قدیمی دوباره به «روند رسیدگی» اضافه نمی‌شود', Number(events1) === Number(events0), `${events0} → ${events1}`);

console.log('\n=== ۶) صفحه‌ی ویرایش گزارش ===');
let edit = await admin.get(`/admin/report_edit.php?id=${RA2}`);
const tokenE = csrfOf(edit.text);
g0 = gMsgs();
post = await admin.post(`/admin/report_edit.php?id=${RA2}`, {
  _token: tokenE, user_phone: PHONE, title: 'گزارش ۲', description: 'توضیح', category: 'سایر', department: '', sub_department: '', location: '', status: 'in_progress',
});
n = await notifsOf(PHONE);
ok('تغییر وضعیت از «ویرایش» هم اعلان می‌سازد و به گوشی می‌فرستد', n.length === 5 && n[4].title.includes(codeOf(RA2)) && /در حال رسیدگی/.test(n[4].body) && gMsgs() === g0 + 1, `${n.length} / ${gMsgs() - g0}`);
ok('پیام ویرایش، نتیجه‌ی اعلان را هم می‌گوید', /alert-success/.test(post.text) && /گوشی/.test(post.text), '');
const ev = await q(`SELECT type, title FROM report_events WHERE report_id=${RA2}`);
ok('تغییر وضعیت در «روند رسیدگی» هم ثبت شد', ev.some((e) => /status|وضعیت/.test(e.type + e.title)), JSON.stringify(ev));
g0 = gMsgs();
edit = await admin.get(`/admin/report_edit.php?id=${RA2}`);
post = await admin.post(`/admin/report_edit.php?id=${RA2}`, {
  _token: csrfOf(edit.text), user_phone: PHONE, title: 'گزارش ۲ (ویرایش‌شده)', description: 'توضیح', category: 'سایر', department: '', sub_department: '', location: '', status: 'in_progress',
});
ok('ویرایش بدون تغییر وضعیت ← اعلانی نمی‌سازد', (await notifsOf(PHONE)).length === 5 && gMsgs() === g0);

console.log('\n=== ۷) کاربری که گوشی ثبت‌نشده دارد ===');
g0 = gMsgs();
s = await quick(RB, 'in_progress', '');
n = await notifsOf(PHONE_B);
lg = await logOf(codeOf(RB));
ok('اعلان داخل اپ ساخته می‌شود حتی بدون گوشی', n.length === 1 && /در حال رسیدگی/.test(n[0].body));
ok('چیزی به گوگل نمی‌رود و push_log می‌گوید «گوشی ثبت نیست»', gMsgs() === g0 && lg[0]?.outcome === 'no_device', JSON.stringify(lg));
ok('مدیر هشدار فارسی می‌بیند (نه «موفق»)', s.flash === 'warning' && /ثبت نشده/.test(s.flashText), `${s.flash} | ${s.flashText}`);
let det = await admin.get(`/admin/report_detail.php?id=${RB}`);
ok('صفحه‌ی جزئیات «گوشی ثبت نیست» را نشان می‌دهد', /گوشی ثبت نیست/.test(det.text) && /data-testid="push-panel"/.test(det.text));

console.log('\n=== ۸) توکن باطل (اپ پاک شده) ===');
s = await quick(RC, 'in_progress', '');
lg = await logOf(codeOf(RC));
rows = await q("SELECT is_active, last_error FROM device_tokens WHERE token='BAD-TOKEN'");
ok('گوگل UNREGISTERED داد ← ارسال ناموفق ثبت و توکن غیرفعال شد', lg[0]?.outcome === 'failed' && Number(rows[0]?.is_active) === 0 && /UNREGISTERED/.test(rows[0]?.last_error || ''), JSON.stringify([lg, rows]));
ok('مدیر علت را به فارسی می‌بیند (توکن باطل/اپ دوباره نصب شود)', s.flash === 'danger' && /معتبر نیست|دوباره/.test(s.flashText), `${s.flash} | ${s.flashText}`);
await appPost({ action: 'register_fcm', phone: PHONE_C, token: 'BAD-TOKEN', platform: 'android' });
rows = await q("SELECT is_active FROM device_tokens WHERE token='BAD-TOKEN'");
ok('ثبت دوباره‌ی گوشی، توکن غیرفعال را زنده می‌کند', Number(rows[0]?.is_active) === 1);

console.log('\n=== ۹) ۴۰۱ از گوگل ← توکن دسترسی تازه و ارسال دوباره ===');
G.unauthOnce = 1;
const t0 = G.tokenCalls; g0 = gMsgs();
s = await quick(RA, 'done', 'اکیپ اعزام شد و کار تمام شد');
ok('پس از ۴۰۱، توکن دسترسی دقیقاً یک‌بار تازه می‌شود و پیام می‌رسد', G.tokenCalls === t0 + 1 && gMsgs() === g0 + 1 && G.messages.at(-1)?.auth === 'Bearer ya29.FAKE-' + G.tokenCalls, `token calls +${G.tokenCalls - t0}, msgs +${gMsgs() - g0}`);

console.log('\n=== ۱۰) سرور هاست به گوگل نمی‌رسد (فایروال/فیلتر) ===');
await exec(`eplakSetAppSetting($pdo, 'fcm_access_token', ''); eplakSetAppSetting($pdo, 'fcm_access_token_exp', '0'); eplakSetAppSetting($pdo, 'fcm_net_fail_at', '0');`);
setEnv(DEAD_ENV);
const tStart = Date.now();
s = await quick(RA, 'in_progress', '');
const dt1 = Date.now() - tStart;
lg = await logOf(codeOf(RA));
const dead1 = lg.at(-1);
ok('اعلان داخل اپ همچنان ساخته می‌شود', (await notifsOf(PHONE)).length >= 7);
ok('ارسال به گوشی «عدم دسترسی به گوگل» ثبت می‌شود', dead1?.outcome === 'google_error', JSON.stringify(dead1));
ok('مدیر می‌فهمد مشکل از شبکه‌ی هاست است (نه کاربر)', s.flash === 'danger' && /دسترسی ندارد|هاست/.test(s.flashText), `${s.flash} | ${s.flashText}`);
const tStart2 = Date.now();
s = await quick(RA, 'done', '');
const dt2 = Date.now() - tStart2;
lg = await logOf(codeOf(RA));
const dead2 = lg.at(-1);
ok('قطع‌کن: تلاش بعدی بی‌درنگ (بدون انتظار دوباره‌ی شبکه) رد می‌شود', dead2?.outcome === 'google_error' && /برقرار نیست/.test(dead2?.error || ''), JSON.stringify(dead2));
ok('درخواست دوم از اولی سریع‌تر/هم‌اندازه است (مهلت شبکه تکرار نشد)', dt2 <= dt1 + 1500, `${dt1}ms → ${dt2}ms`);

console.log('\n=== ۱۱) بررسی زنجیره‌ی اعلان در تنظیمات ===');
setEnv(GOOGLE_ENV);
let settings = await admin.get('/admin/settings.php');
const tokenS = csrfOf(settings.text);
const v0 = G.validateCalls;
let diag = await admin.post('/admin/settings.php', { _token: tokenS, action: 'diagnose_fcm' });
ok('نتیجه‌ی گام‌به‌گام نمایش داده می‌شود', /data-testid="fcm-diagnose"/.test(diag.text), '');
ok('گام‌ها: کلید، OAuth گوگل، سرویس ارسال، گوشی‌ها — همه سالم', (diag.text.match(/✔ سالم/g) || []).length === 4 && !/✖ مشکل/.test(diag.text), `${(diag.text.match(/✔ سالم/g) || []).length} سالم / ${(diag.text.match(/✖ مشکل/g) || []).length} مشکل`);
ok('درخواست «خشک» validate_only به گوگل رفت (پیامی به کسی ارسال نشد)', G.validateCalls === v0 + 1 && !G.messages.some((m) => String(m.message?.token || '').startsWith('eplak-diagnose')));
g0 = gMsgs();
s = await quick(RA, 'in_progress', '');
ok('بررسی زنجیره قطع‌کن را (با تلاش اجباری) پاک کرد و اعلان‌ها دوباره می‌روند', gMsgs() === g0 + 1 && s.flash === 'success', `${gMsgs() - g0} / ${s.flash} | ${s.flashText}`);
settings = await admin.get('/admin/settings.php');
ok('فهرست گوشی‌های ثبت‌شده و آخرین ارسال‌ها در تنظیمات هست', /data-testid="fcm-devices"/.test(settings.text) && /data-testid="fcm-log"/.test(settings.text), '');

/* بدون کلید */
await exec(`eplakSetAppSetting($pdo, 'fcm_service_account', '');`);
diag = await admin.post('/admin/settings.php', { _token: csrfOf(settings.text), action: 'diagnose_fcm' });
ok('بدون کلید فایربیس، گام اول «مشکل» است و راه‌حل می‌دهد', /✖ مشکل/.test(diag.text) && /کلید JSON/.test(diag.text));
g0 = gMsgs();
s = await quick(RA, 'done', '');
ok('بدون کلید: مدیر می‌فهمد کلید تنظیم نشده (اعلان داخل اپ همچنان هست)', s.flash === 'warning' && /کلید/.test(s.flashText), `${s.flash} | ${s.flashText}`);
await exec(`eplakSetAppSetting($pdo, 'fcm_service_account', ${JSON.stringify(JSON.stringify(serviceAccount))}); eplakSetAppSetting($pdo, 'fcm_net_fail_at', '0');`);

console.log('\n=== ۱۲) جزئیات گزارش: گوشی‌ها، سابقه‌ی ارسال، ارسال دوباره، آزمایشی ===');
detail = await admin.get(`/admin/report_detail.php?id=${RA}`);
ok('کارت «اعلان گوشی این کاربر» گوشی فعال را نشان می‌دهد', /data-testid="push-devices"[\s\S]*1 گوشی فعال/.test(detail.text));
ok('سابقه‌ی ارسال‌های همین گزارش نمایش داده می‌شود', /data-testid="push-log"/.test(detail.text) && /ارسال شد/.test(detail.text));
tokenD = csrfOf(detail.text);
const notifCount = (await notifsOf(PHONE)).length; g0 = gMsgs();
post = await admin.post(`/admin/report_detail.php?id=${RA}`, { _token: tokenD, form_action: 'push_resend' });
ok('«ارسال دوباره» همان آخرین اعلان را روی گوشی می‌نشاند', gMsgs() === g0 + 1 && G.messages.at(-1)?.message?.notification?.title?.includes(codeOf(RA)), `${gMsgs() - g0}`);
ok('«ارسال دوباره» ردیف تازه‌ای در فهرست اعلان‌های اپ نمی‌سازد', (await notifsOf(PHONE)).length === notifCount);
ok('پیام موفق برای مدیر', /data-notify-type="success"/.test(post.text), '');
g0 = gMsgs();
post = await admin.post(`/admin/report_detail.php?id=${RA}`, { _token: tokenD, form_action: 'push_test' });
ok('«اعلان آزمایشی» به گوشی همین کاربر می‌رود', gMsgs() === g0 + 1 && /آزمایشی/.test(G.messages.at(-1)?.message?.notification?.title || '') && G.messages.at(-1)?.message?.token === 'TOK-PANEL-1');

console.log('\n=== ۱۳) «تست اعلان» داخل اپ (api/push.php?action=test با توکن) ===');
g0 = gMsgs();
r = await appPost({ action: 'test', token: 'TOK-PANEL-1' });
ok('اعلان آزمایشی فقط به «همین گوشی» می‌رود', r.json?.success === true && r.json?.sent === 1 && r.json?.devices === 1 && gMsgs() === g0 + 1 && G.messages.at(-1)?.message?.token === 'TOK-PANEL-1', r.text.slice(0, 160));
r = await appPost({ action: 'test', token: 'TOK-PANEL-1' });
ok('درخواست پشت‌سرهم محدود می‌شود (۴۲۹) تا کسی پیام‌باران نکند', r.status === 429 && r.json?.success === false, `${r.status} ${r.text.slice(0, 120)}`);
r = await appPost({ action: 'test', token: 'UNKNOWN-TOKEN-ZZ' });
ok('توکن ثبت‌نشده: پاسخ روشن «این گوشی در سرور ثبت نشده»', r.json?.success === false && r.json?.outcome === 'no_device' && /ثبت نشده/.test(r.json?.error || ''), r.text.slice(0, 160));

console.log('\n=== ۱۴) بررسی نسخه ===');
const ver = await admin.get('/admin/version.php');
ok('صفحه‌ی بررسی نسخه بدون خطا رندر می‌شود', ver.status === 200 && !/Fatal error|Parse error|Warning:/.test(ver.text));
ok('نشانه‌ی «ثبت گوشی از اپ اندروید» در بررسی نسخه «موجود» است', /ثبت گوشی از اپ اندروید[\s\S]{0,400}موجود/.test(ver.text) && /push_log/.test(ver.text));
ok('فهرست آخرین ارسال‌ها به گوشی کاربران نمایش داده می‌شود', /آخرین ارسال‌ها به گوشی کاربران/.test(ver.text));

console.log('\n=== ۱۵) دیتابیس utf8 سه‌بایتی: ایموجی چهاربایتی نباید اعلان را بی‌صدا نابود کند ===');
const strip = grab(await exec(`echo '<<<' . json_encode(eplakStripAstralChars('📣 پاسخ 👍 تمام')) . '>>>';`));
ok('eplakStripAstralChars فقط نویسه‌های چهاربایتی را برمی‌دارد', strip === 'پاسخ تمام', JSON.stringify(strip));
/* شبیه‌سازی جدول utf8 سه‌بایتی: درج هر ردیفِ دارای 📣 یا 👍 با خطا رد می‌شود (مثل MySQL: «Incorrect string value») */
await exec(`$pdo->exec("CREATE TRIGGER no_astral_n BEFORE INSERT ON notifications WHEN instr(NEW.title, '📣') > 0 OR instr(NEW.body, '👍') > 0 BEGIN SELECT RAISE(ABORT, 'Incorrect string value: emoji'); END");
$pdo->exec("CREATE TRIGGER no_astral_l BEFORE INSERT ON push_log WHEN instr(NEW.title, '📣') > 0 BEGIN SELECT RAISE(ABORT, 'Incorrect string value: emoji'); END");`);
g0 = gMsgs();
s = await quick(RA3, 'done', 'ممنون از اطلاع‌رسانی 👍');
n = await notifsOf(PHONE);
const emo = n.at(-1);
ok('اعلان با وجود خطای ایموجی ساخته می‌شود (بدون ایموجی)', emo?.title.includes(codeOf(RA3)) && !/📣|👍/.test(emo.title + emo.body) && /ممنون/.test(emo.body), JSON.stringify(emo));
ok('پیام فایربیس هم می‌رود', gMsgs() === g0 + 1);
lg = await logOf(codeOf(RA3));
ok('push_log هم (با عنوان بدون ایموجی) ثبت می‌شود', lg.length === 1 && lg[0].outcome === 'sent', JSON.stringify(lg));
ok('مدیر پیام موفق می‌بیند', s.flash === 'success', `${s.flash} | ${s.flashText}`);
await exec(`$pdo->exec('DROP TRIGGER no_astral_n'); $pdo->exec('DROP TRIGGER no_astral_l');`);

console.log('\n=== ۱۶) شماره‌ی گزارش با قالب دیگر (+98 / رقم فارسی) ===');
const PHONE_D = '09120004444';
const norm = grab(await exec(`echo '<<<' . json_encode([eplakNotifyNormalizePhone('+989120004444'), eplakNotifyNormalizePhone('۰۹۱۲۰۰۰۴۴۴۴'), eplakNotifyNormalizePhone(' 0912 000 4444 '), eplakNotifyNormalizePhone('9120004444'), eplakNotifyNormalizePhone('021-555')]) . '>>>';`));
ok('نرمال‌سازی شماره: +98، رقم فارسی، فاصله و بدون صفر همه به 09xxxxxxxxx تبدیل می‌شوند', norm.slice(0, 4).every((x) => x === PHONE_D) && norm[4] === '021555', JSON.stringify(norm));
await appPost({ action: 'register_fcm', phone: PHONE_D, token: 'TOK-PHONE-D', platform: 'android' });
const rd = grab(await exec(`$id = createReport($pdo, ['user_phone' => '+989120004444', 'title' => 'گزارش دستی', 'description' => 'ثبت‌شده توسط مدیر', 'category' => 'سایر', 'status' => 'pending']); echo '<<<' . json_encode(['id' => $id]) . '>>>';`)).id;
g0 = gMsgs();
s = await quick(rd, 'in_progress', '');
n = await notifsOf(PHONE_D);
ok('اعلان زیر شماره‌ی استاندارد (09…) ذخیره می‌شود تا در فهرست اپ دیده شود', n.length === 1 && n[0].title.includes(codeOf(rd)), JSON.stringify(n));
ok('و گوشی ثبت‌شده با شماره‌ی استاندارد پیدا و اعلان ارسال می‌شود', gMsgs() === g0 + 1 && G.messages.at(-1)?.message?.token === 'TOK-PHONE-D' && s.flash === 'success', `${gMsgs() - g0} ${s.flash} | ${s.flashText}`);

console.log('\n=== ۱۷) خط جدید CRLF در برابر LF: پاسخ قدیمی «تازه» حساب نمی‌شود ===');
const crId = grab(await exec(`$id = createReport($pdo, ['user_phone' => '${PHONE}', 'title' => 'گزارش خط جدید', 'description' => 'توضیح', 'category' => 'سایر', 'status' => 'done']);
$st = $pdo->prepare('UPDATE reports SET reply = :r WHERE id = :id'); $st->execute([':r' => "سطر یک\nسطر دو", ':id' => $id]);
echo '<<<' . json_encode(['id' => $id]) . '>>>';`)).id;
const nBefore = (await notifsOf(PHONE)).length; g0 = gMsgs();
s = await quick(crId, 'done', 'سطر یک\r\nسطر دو');
ok('همان پاسخ با CRLF (مرورگر) و همان وضعیت ← اعلان تکراری نمی‌سازد', (await notifsOf(PHONE)).length === nBefore && gMsgs() === g0 && s.flash === 'info', `${s.flash} ${gMsgs() - g0}`);

/* ══════════════════════════════════════════════════════════════════
   ۳) لایه‌ی وب اپ (modules/live.js) در vm
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== لایه‌ی وب: ثبت گوشی (تلاش مجدد، مستقل از Service Worker) ===');
/* بدنه‌ی درخواست اپ: JSON (text/plain) یا فرم ساده */
const fieldsOf = (body) => {
  try { const j = JSON.parse(body); if (j && typeof j === 'object') return j; } catch (e) {}
  return Object.fromEntries(new URLSearchParams(String(body || '')));
};

function buildLive(opts = {}) {
  const calls = [];
  const timers = [];
  const store = { ...(opts.storage || {}) };
  const clock = { now: 1_800_000_000_000 };
  const listeners = {};
  const bridge = { token: opts.token ?? '' };
  const server = { mode: opts.mode || 'ok', testReply: null, hold: false, release: null };
  const state = { phone: opts.phone ?? '' };
  const nodes = new Map();
  ['notifDeviceNotice', 'notifListWrap', 'homeNotifDot', 'dashNotifDot'].forEach((id) => nodes.set(id, { id, innerHTML: '', style: { display: '' }, appendChild() {}, addEventListener() {} }));
  const FakeDate = class extends Date { static now() { return clock.now; } };
  const sb = {
    console, URLSearchParams, Date: FakeDate, Promise, JSON, Math, parseInt, String, Object, Array, Number, isNaN, encodeURIComponent, AbortController,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1, done: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].done = true; },
    setInterval: () => 0, clearInterval: () => 0, requestAnimationFrame: (fn) => fn(),
    fetch: async (url, o) => {
      const call = { url: String(url), method: o?.method || 'GET', body: o?.body || '', ctype: String((o?.headers || {})['Content-Type'] || '') };
      calls.push(call);
      if (call.url.includes('push.php') && call.method === 'POST') {
        const fields = fieldsOf(call.body);
        const form = { get: (k) => (fields[k] === undefined ? null : String(fields[k])) };
        if (form.get('action') === 'register_fcm') {
          if (server.mode === 'waf-form' && /x-www-form-urlencoded/.test(call.ctype)) {
            return { ok: false, status: 403, json: async () => { throw new Error('<html>403 Forbidden</html>'); } };
          }
          if (server.mode === 'hang') return new Promise((resolve, reject) => { o?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); });
          if (server.hold) { server.hold = false; await new Promise((r) => { server.release = r; }); }
          if (server.mode === 'network') throw new Error('Failed to fetch');
          if (server.mode === 'http400') return { ok: false, status: 400, json: async () => ({ success: false, error: 'توکن دستگاه الزامی است' }) };
          if (server.mode === 'html') return { ok: false, status: 403, json: async () => { throw new Error('not json'); } };
          return { ok: true, status: 200, json: async () => ({ success: true, saved: true, attached: form.get('phone') !== '' && form.get('detach') !== '1', devices: 1, fcm_ready: true }) };
        }
        if (form.get('action') === 'test') {
          const reply = server.testReply || { status: 200, body: { success: true, sent: 1, devices: 1, outcome: 'sent' } };
          return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
        }
      }
      return { ok: true, status: 200, json: async () => ({ success: true, notifications: [], items: [], enabled: true }) };
    },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: opts.serviceWorkerHangs ? { serviceWorker: { getRegistration: () => new Promise(() => {}), register: () => new Promise(() => {}) } } : {},
    document: {
      readyState: opts.start ? 'complete' : 'loading',
      getElementById: (id) => nodes.get(id) || null,
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, set innerHTML(v) {}, get innerHTML() { return ''; } }),
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, removeEventListener() {},
      body: { appendChild() {} }, hidden: false,
    },
    getCurrentPhone: () => state.phone,
    soundManager: { playNotification() {} }, showScreen() {}, saveNotifications() {}, renderNotifications() {},
    notifications: [], seenNotifIds: new Set(),
    AndroidApp: {
      showNotification() {}, notificationsEnabled: () => true, ensureNotificationChannel() {}, requestNotificationPermission() {},
      getFcmToken: () => bridge.token, isFcmReady: () => !!bridge.token, refreshFcmToken() {},
      openNotificationSettings() { calls.push('openSettings'); }, getPushDiagnostics: () => JSON.stringify({ enabled: true, token: !!bridge.token, sdk: 34, firebase: true }),
    },
    window: null,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('modules/live.js'), sb, { filename: 'live.js' });
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  /* تایمرِ بعدیِ مانده را اجرا می‌کند */
  const fireNext = async () => { const t = timers.find((x) => !x.done); if (!t) return null; t.done = true; t.fn(); await settle(); return t.ms; };
  const pending = () => timers.filter((x) => !x.done).map((x) => x.ms);
  const registerCalls = () => calls.filter((c) => c.url?.includes('push.php') && c.method === 'POST' && fieldsOf(c.body).action === 'register_fcm');
  return { sb, calls, store, clock, listeners, bridge, server, state, settle, fireNext, pending, registerCalls, nodes };
}

/* ۱) مستقل از Service Worker */
let L = buildLive({ token: 'TOK-LIVE-1', phone: '', start: true, serviceWorkerHangs: true });
await L.settle();
ok('ثبت گوشی با شروع اپ انجام می‌شود، حتی اگر Service Worker هرگز آماده نشود (WebView)', L.registerCalls().length === 1, `${L.registerCalls().length}`);
let body = new URLSearchParams(L.registerCalls()[0]?.body || '');
ok('بدنه: action=register_fcm، توکن، platform=android، شماره‌ی خالی (پیش از ورود)', body.get('action') === 'register_fcm' && body.get('token') === 'TOK-LIVE-1' && body.get('platform') === 'android' && body.get('phone') === '');
ok('فرم ساده فرستاده می‌شود (که سرور حالا می‌پذیرد)', L.calls.find((c) => c.url?.includes('push.php') && c.method === 'POST')?.body?.includes('action=register_fcm'));
ok('پس از موفقیت، امضا و زمان ثبت ذخیره می‌شود', L.store['eplak_fcm_registered'] === 'TOK-LIVE-1|' && Number(L.store['eplak_fcm_registered_at']) === L.clock.now);

/* ۲) توکن دیر می‌رسد */
L = buildLive({ token: '', phone: '09120001111', start: true });
await L.settle();
ok('توکن هنوز نرسیده ← ثبتی نمی‌رود ولی تلاش مجدد ۲ ثانیه‌ای زمان‌بندی می‌شود', L.registerCalls().length === 0 && L.pending().includes(2000), JSON.stringify(L.pending()));
let st = L.sb.eplakPushState();
ok('وضعیت: توکن ندارد، ثبت نشده، دلیل no_fcm_token', st.token === false && st.registered === false && st.reason === 'no_fcm_token');
ok('پیام کاربر «در حال دریافت شناسه‌ی اعلان…» است', /در حال دریافت شناسه/.test(L.nodes.get('notifDeviceNotice').innerHTML) && /data-state="no_token"/.test(L.nodes.get('notifDeviceNotice').innerHTML));
L.bridge.token = 'TOK-LIVE-2';
await L.fireNext();
ok('وقتی توکن رسید، تلاش مجدد ثبت را انجام می‌دهد (با شماره‌ی کاربر)', L.registerCalls().length === 1 && new URLSearchParams(L.registerCalls()[0].body).get('phone') === '09120001111', `${L.registerCalls().length}`);
ok('پس از ثبت موفق تایمر دیگری باقی نمی‌ماند', L.pending().length === 0, JSON.stringify(L.pending()));
ok('پیام کاربر «این گوشی برای اعلان ثبت شده است» و دکمه‌ی «تست اعلان» دارد',
  /data-state="registered"/.test(L.nodes.get('notifDeviceNotice').innerHTML) && /تست اعلان/.test(L.nodes.get('notifDeviceNotice').innerHTML));

/* ۳) خطای سرور (۴۰۰، HTML فایروال، قطع شبکه) ← تلاش پله‌ای */
for (const mode of ['http400', 'html', 'network']) {
  L = buildLive({ token: 'TOK-LIVE-3', phone: '09120001111', start: true, mode });
  await L.settle();
  const delays = [];
  for (let i = 0; i < 6; i++) { const d = await L.fireNext(); if (d !== null) delays.push(d); }
  const expected = [2000, 4000, 8000, 16000, 30000, 30000];
  ok(`خطای «${mode}» ← تلاش‌های پله‌ای ۲/۴/۸/۱۶/۳۰ ثانیه و بی‌صدا نمی‌میرد`, JSON.stringify(delays) === JSON.stringify(expected), JSON.stringify(delays));
  ok(`خطای «${mode}» ← چیزی به‌عنوان «ثبت‌شده» ذخیره نمی‌شود`, !('eplak_fcm_registered' in L.store));
  ok(`خطای «${mode}» ← کاربر پیام «ثبت نشد؛ دوباره تلاش می‌شود» می‌بیند`, /data-state="error"/.test(L.nodes.get('notifDeviceNotice').innerHTML));
  L.server.mode = 'ok';
  await L.fireNext();
  ok(`پس از برگشتن سرور (${mode}) ثبت موفق می‌شود و تلاش‌ها پایان می‌یابد`, 'eplak_fcm_registered' in L.store && L.pending().length === 0, JSON.stringify(L.pending()));
}

/* ۴) سقف تلاش‌ها */
L = buildLive({ token: 'TOK-LIVE-4', phone: '09120001111', start: true, mode: 'http400' });
await L.settle();
let fired = 0; while ((await L.fireNext()) !== null && fired < 40) fired++;
ok('تلاش‌های ناموفق بی‌نهایت نیست (سقف ۱۴ تلاش)', fired === 14, `${fired}`);
L.listeners.visibilitychange?.forEach((fn) => fn());
await L.settle();
ok('با برگشتن اپ به پیش‌زمینه، تلاش‌ها از نو شروع می‌شوند', L.pending().length >= 1 || L.registerCalls().length > fired + 1, JSON.stringify(L.pending()));

/* ۴-۱) فایروال هاست، «فرم ساده» را با ۴۰۳ HTML رد می‌کند ← همان فیلدها به‌صورت JSON */
L = buildLive({ token: 'TOK-LIVE-W', phone: '09120001111', start: true, mode: 'waf-form' });
await L.settle();
const wafCalls = L.registerCalls();
ok('فرم ساده با ۴۰۳ رد شد ← همان لحظه یک‌بار با JSON (text/plain) امتحان می‌شود', wafCalls.length === 2 && /x-www-form-urlencoded/.test(wafCalls[0].ctype) && /text\/plain/.test(wafCalls[1].ctype), JSON.stringify(wafCalls.map((c) => c.ctype)));
const wafFields = fieldsOf(wafCalls[1]?.body);
ok('بدنه‌ی JSON همان فیلدها را دارد (action، token، phone، platform)', wafFields.action === 'register_fcm' && wafFields.token === 'TOK-LIVE-W' && wafFields.phone === '09120001111' && wafFields.platform === 'android', JSON.stringify(wafFields));
ok('و ثبت موفق می‌شود (بدون انتظار برای تلاش بعدی)', 'eplak_fcm_registered' in L.store && L.pending().length === 0, JSON.stringify(L.pending()));

/* ۴-۲) اینترنتِ «گیر‌کرده»: درخواست ثبت تا ابد معلق نمی‌ماند */
L = buildLive({ token: 'TOK-LIVE-H', phone: '09120001111', start: true, mode: 'hang' });
await L.settle();
ok('درخواستِ ثبتِ معلق، مهلت ۲۰ ثانیه‌ای دارد', L.pending().includes(20000), JSON.stringify(L.pending()));
await L.fireNext();   /* مهلت تمام می‌شود ← درخواست لغو می‌شود */
ok('پس از پایان مهلت، تلاش مجدد پله‌ای زمان‌بندی می‌شود (ثبت‌های بعدی پشت درخواست معلق نمی‌مانند)', L.pending().includes(2000), JSON.stringify(L.pending()));
L.server.mode = 'ok';
await L.fireNext();
ok('و با برگشتن اینترنت ثبت انجام می‌شود', 'eplak_fcm_registered' in L.store);

/* ۴-۳) ورود کاربر هم‌زمان با ثبتِ در حال انجام: درخواست گم نمی‌شود */
L = buildLive({ token: 'TOK-LIVE-J', phone: '' });
L.server.hold = true;
const first = L.sb.registerAppDevice(false);          /* شماره‌ی خالی؛ پاسخ سرور هنوز نیامده */
await L.settle();
L.state.phone = '09127776666';                        /* کاربر همین الان وارد شد */
const second = L.sb.registerAppDevice(true);           /* به ثبتِ در حال انجام می‌پیوندد */
await L.settle();
L.server.release();
await first; await second; await L.settle();
const phonesSent = L.registerCalls().map((c) => new URLSearchParams(c.body).get('phone'));
ok('پس از پایان ثبتِ قبلی، ثبت با شماره‌ی کاربر هم انجام می‌شود', JSON.stringify(phonesSent) === JSON.stringify(['', '09127776666']), JSON.stringify(phonesSent));

/* ۵) ثبت تکراری و تازه‌سازی هر ۶ ساعت */
L = buildLive({ token: 'TOK-LIVE-5', phone: '09120001111' });
await L.sb.registerAppDevice(false);
await L.sb.registerAppDevice(false);
ok('ثبت تکراری با همان توکن/شماره، دوباره فرستاده نمی‌شود', L.registerCalls().length === 1, `${L.registerCalls().length}`);
L.clock.now += 6 * 3600 * 1000 + 1000;
await L.sb.registerAppDevice(false);
ok('بعد از ۶ ساعت ثبت دوباره تازه می‌شود (جلوگیری از «ثبت‌شده ولی منقضی»)', L.registerCalls().length === 2, `${L.registerCalls().length}`);
await L.sb.registerAppDevice(true);
ok('ثبت «اجباری» (مثلاً بعد از ورود) همیشه می‌رود', L.registerCalls().length === 3);

/* ۶) خود اندروید خبر می‌دهد توکن رسید */
L = buildLive({ token: '', phone: '09120001111' });
await L.sb.registerAppDevice(false);
L.bridge.token = 'TOK-LIVE-6';
await L.sb.eplakOnFcmToken();
ok('eplakOnFcmToken (از EplakMessagingService/MainActivity) فوراً ثبت می‌کند', L.registerCalls().length === 1 && new URLSearchParams(L.registerCalls()[0].body).get('token') === 'TOK-LIVE-6');

/* ۷) خروج از حساب */
L = buildLive({ token: 'TOK-LIVE-7', phone: '09120001111' });
await L.sb.registerAppDevice(false);
const det0 = await L.sb.eplakDetachDevice();
const dBody = new URLSearchParams(L.registerCalls().at(-1).body);
ok('خروج صریح: درخواست register_fcm با detach=1 و شماره‌ی خالی می‌رود', dBody.get('detach') === '1' && dBody.get('phone') === '' && dBody.get('token') === 'TOK-LIVE-7' && det0.ok === true, JSON.stringify([...dBody]));
ok('خروج صریح: امضای ثبت پاک می‌شود تا ورود بعدی دوباره ثبت کند', !('eplak_fcm_registered' in L.store) && !('eplak_fcm_registered_at' in L.store));
const before = L.registerCalls().length;
await L.sb.registerAppDevice(false);
ok('ورود بعدی دوباره ثبت می‌کند', L.registerCalls().length === before + 1);
ok('modules/auth.js هنگام خروج صریح، گوشی را جدا می‌کند', /logoutUser\(\)[\s\S]{0,900}eplakDetachDevice/.test(read('modules/auth.js')));
ok('modules/auth.js پس از ورود (کد تایید) گوشی را با شماره ثبت می‌کند', /registerAppDevice\(true\)/.test(read('modules/auth.js')));

/* ۸) دکمه‌ی «تست اعلان» */
L = buildLive({ token: 'TOK-LIVE-8', phone: '09120001111' });
await L.sb.registerAppDevice(false);
let t = await L.sb.eplakTestPushClick(null);
let tb = new URLSearchParams(L.calls.filter((c) => c.method === 'POST').at(-1).body);
ok('«تست اعلان» با توکن همین گوشی به سرور می‌رود (action=test)', tb.get('action') === 'test' && tb.get('token') === 'TOK-LIVE-8');
ok('موفق: پیام «اعلان آزمایشی ارسال شد» در کادر وضعیت می‌ماند (با هر بازنویسی پاک نمی‌شود)', t.ok === true && /ارسال شد/.test(L.nodes.get('notifDeviceNotice').innerHTML) && /data-code="sent"/.test(L.nodes.get('notifDeviceNotice').innerHTML));
L.server.testReply = { status: 200, body: { success: false, outcome: 'google_error', error: 'x', hint: 'h' } };
t = await L.sb.eplakTestPushClick(null);
ok('سرور به گوگل نمی‌رسد ← پیام «مشکل از سمت هاست» (نه تقصیر کاربر)', t.ok === false && /هاست/.test(t.message), t.message);
L.server.testReply = { status: 200, body: { success: false, outcome: 'no_device', error: 'این گوشی هنوز در سرور ثبت نشده است.' } };
t = await L.sb.eplakTestPushClick(null);
ok('گوشی ثبت نیست ← پیام روشن', t.ok === false && /ثبت نشده/.test(t.message), t.message);
L.server.testReply = { status: 429, body: { success: false, error: 'چند ثانیه صبر کنید و دوباره امتحان کنید.' } };
t = await L.sb.eplakTestPushClick(null);
ok('محدودیت (۴۲۹) ← پیام «چند ثانیه صبر کنید»', /صبر/.test(t.message), t.message);
L = buildLive({ token: '', phone: '09120001111' });
t = await L.sb.eplakTestPushClick(null);
ok('بدون توکن ← پیام «شناسه‌ی اعلان از گوگل نرسیده» (Google Play Services/اینترنت)', t.ok === false && t.code === 'no_fcm_token' && /Google Play/.test(t.message), t.message);
ok('دکمه‌ی «تنظیمات اعلان گوشی» به پل اندروید وصل است', L.sb.eplakOpenNotificationSettings() === true && L.calls.includes('openSettings'));
L = buildLive({ token: 'TOK-LIVE-9', phone: '09120001111' });
L.sb.AndroidApp.notificationsEnabled = () => false;
L.sb.renderDeviceNotice();
ok('اجازه‌ی اعلان رد شده ← «فعال‌سازی اعلان» و «تنظیمات اعلان گوشی» هر دو هست', /فعال‌سازی اعلان/.test(L.nodes.get('notifDeviceNotice').innerHTML) && /eplakOpenNotificationSettings/.test(L.nodes.get('notifDeviceNotice').innerHTML));
L = buildLive({});
L.sb.AndroidApp = undefined;
const web = await L.sb.registerAppDevice(false);
ok('خارج از اپ اندروید (مرورگر) ثبت فایربیس بی‌صدا رد می‌شود', web.ok === false && web.reason === 'not_android_app');

/* ══════════════════════════════════════════════════════════════════
   ۴) کد اندروید و مستندات (فقط حضور؛ کامپایل در CI)
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== اندروید و مستندات ===');
const kt = read('android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt');
const svc = read('android-app/app/src/main/java/com/example/eplakfixed/EplakMessagingService.kt');
ok('MainActivity: وقتی توکن فایربیس رسید به لایه‌ی وب خبر می‌دهد (eplakOnFcmToken)', kt.includes('notifyFcmTokenReady') && kt.includes('window.eplakOnFcmToken'));
ok('MainActivity: توکنِ غیرهمگام پس از رسیدن به وب اعلام می‌شود (getFcmToken و refreshFcmToken)', (kt.match(/notifyFcmTokenReady\(\)/g) || []).length >= 3);
ok('EplakMessagingService.onNewToken به لایه‌ی وب خبر می‌دهد', svc.includes('MainActivity.notifyFcmTokenReady()'));
ok('پل اندروید: getPushDiagnostics و openNotificationSettings', kt.includes('fun getPushDiagnostics') && kt.includes('fun openNotificationSettings') && kt.includes('ACTION_APP_NOTIFICATION_SETTINGS'));
const pushApi = read('api/push.php');
ok('api/push.php از eplakRequestInput استفاده می‌کند (فرم + JSON)', pushApi.includes('eplakRequestInput()') && !pushApi.includes('$_REQUEST'));
for (const f of ['docs/FIREBASE_SETUP_FA.md', 'docs/FIREBASE_SETUP_EN.md']) {
  ok(`${f}: بخش عیب‌یابی «اعلان تغییر وضعیت نرسید» و ابزارهای پنل`, /push_log|بررسی زنجیره|Check the notification chain/.test(read(f)) && read(f).includes('device_tokens'));
}
const buildSh = read('tools/build-update-package.sh');
ok('اسکریپت ساخت بسته، فایل‌های تازه را الزامی می‌کند (api/push.php و shared/fcm.php)', buildSh.includes('api/push.php') && buildSh.includes('shared/fcm.php'));

fakeGoogle.close();
console.log('\n' + '='.repeat(52));
console.log(`PUSH: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

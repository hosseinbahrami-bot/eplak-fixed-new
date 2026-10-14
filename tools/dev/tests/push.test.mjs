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
        پله‌ای، تازه‌سازی هر ۶ ساعت، جداسازی در خروج؛ و اینکه کادر «وضعیت اعلان»
        (با «تست اعلان»/«تنظیمات اعلان گوشی») که به درخواست مالک حذف شد، برنگردد.
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
      /* همان پاسخ واقعی گوگل برای توکنِ پروژه‌ی دیگر: status کلی PERMISSION_DENIED و کد دقیق در details */
      if (String(parsed?.message?.token || '').startsWith('OLD-PROJECT-')) {
        return json(403, { error: { code: 403, message: 'SenderId mismatch', status: 'PERMISSION_DENIED',
          details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'SENDER_ID_MISMATCH' }] } });
      }
      return json(200, { name: 'projects/eplak-test-project/messages/' + G.messages.length });
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise((r) => fakeGoogle.listen(G_PORT, '127.0.0.1', r));
const setEnv = (obj) => fs.writeFileSync(CTL, JSON.stringify(obj));
/* EPLAK_APP_FCM_PROJECT: در آزمون، «پروژه‌ی APK» همان پروژه‌ی کلید ساختگی است تا
   سناریوهای عادی «هم‌خوان» باشند؛ سناریوی «کلید از پروژه‌ی دیگر» جداگانه آزموده می‌شود. */
const GOOGLE_ENV = { EPLAK_TEST_TOKEN_URL: `http://127.0.0.1:${G_PORT}/token`, EPLAK_TEST_FCM_BASE: `http://127.0.0.1:${G_PORT}/v1/projects/`, EPLAK_APP_FCM_PROJECT: 'eplak-test-project' };
const DEAD_ENV = { EPLAK_TEST_TOKEN_URL: 'http://127.0.0.1:1/token', EPLAK_TEST_FCM_BASE: 'http://127.0.0.1:1/v1/projects/', EPLAK_APP_FCM_PROJECT: 'eplak-test-project' };
/* همان گوگلِ ساختگی، ولی APK «با پروژه‌ی دیگری» ساخته شده است */
/* «پروژه‌ی دیگر» = پروژه‌ی قدیمی APK تا نسخه‌ی ۲.۰ (eplak-63c74) — همان نمونه‌ی واقعیِ «کلید از پروژه‌ی دیگر» */
const MISMATCH_ENV = { ...GOOGLE_ENV, EPLAK_APP_FCM_PROJECT: 'eplak-63c74' };
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
async function req(method, url, { form, multipart, json, rawBody, ctype, cookies = false } = {}) {
  const headers = {};
  let body;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = enc.encode(new URLSearchParams(form).toString()); }
  else if (multipart) {
    /* فرم چندبخشی (آپلود فایل): fields = {name: value}, files = {name: {filename, content}} */
    const boundary = '----eplakBoundary' + Date.now();
    let out = '';
    for (const [k, v] of Object.entries(multipart.fields || {})) out += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    for (const [k, f] of Object.entries(multipart.files || {})) out += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${f.filename}"\r\nContent-Type: application/json\r\n\r\n${f.content}\r\n`;
    out += `--${boundary}--\r\n`;
    headers['content-type'] = 'multipart/form-data; boundary=' + boundary; body = enc.encode(out);
  }
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
  upload: (url, fields, files) => req('POST', url, { multipart: { fields, files }, cookies: true }),
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
ok('گام‌ها: کلید، هم‌خوانی پروژه، OAuth گوگل، سرویس ارسال، گوشی‌ها — همه سالم', (diag.text.match(/✔ سالم/g) || []).length === 5 && !/✖ مشکل/.test(diag.text), `${(diag.text.match(/✔ سالم/g) || []).length} سالم / ${(diag.text.match(/✖ مشکل/g) || []).length} مشکل`);
ok('گام «هم‌خوانی پروژه‌ی کلید با پروژه‌ی اپ اندروید» در فهرست هست', diag.text.includes('هم‌خوانی پروژه‌ی کلید با پروژه‌ی اپ اندروید'));
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

console.log('\n=== ۱۳) نقطه‌ی سرور api/push.php?action=test (برای عیب‌یابی؛ دکمه‌اش از اپ حذف شده) ===');
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
  /* مثل index.html واقعی: کادر notifDeviceNotice دیگر وجود ندارد (به درخواست مالک حذف شد) */
  ['notifListWrap', 'homeNotifDot', 'dashNotifDot'].forEach((id) => nodes.set(id, { id, innerHTML: '', style: { display: '' }, appendChild() {}, addEventListener() {} }));
  const askedIds = new Set();
  const FakeDate = class extends Date { static now() { return clock.now; } };
  const sb = {
    console, URLSearchParams, Date: FakeDate, Promise, JSON, Math, parseInt, String, Object, Array, Number, isNaN, encodeURIComponent, AbortController,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1, done: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].done = true; },
    setInterval: () => 0, clearInterval: () => 0, requestAnimationFrame: (fn) => fn(),
    fetch: async (url, o) => {
      const call = { url: String(url), method: o?.method || 'GET', body: o?.body || '', ctype: String((o?.headers || {})['Content-Type'] || '') };
      calls.push(call);
      /* GET action=config — «آیا سرور کلید فایربیس دارد؟» (مسیرِ اپ اندروید) */
      if (call.url.includes('push.php') && call.url.includes('action=config')) {
        const fcmOff = server.mode === 'fcm_off';
        return { ok: true, status: 200, json: async () => ({
          success: true, enabled: true, vapid_public_key: 'x',
          fcm_ready: !fcmOff,
          fcm_reason: fcmOff ? 'کلید سرویس فایربیس وارد نشده است.' : '',
        }) };
      }
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
          if (server.mode === 'fcm_off') {
            return { ok: true, status: 200, json: async () => ({ success: true, saved: true, attached: form.get('phone') !== '' && form.get('detach') !== '1', devices: 1, fcm_ready: false, fcm_reason: 'کلید سرویس فایربیس وارد نشده است.' }) };
          }
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
      getElementById: (id) => { askedIds.add(String(id)); return nodes.get(id) || null; },
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
  return { sb, calls, store, clock, listeners, bridge, server, state, settle, fireNext, pending, registerCalls, nodes, askedIds };
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
ok('کادر وضعیت حذف شده: اپ در این حالت هم سراغ notifDeviceNotice نمی‌رود', !L.askedIds.has('notifDeviceNotice'), [...L.askedIds].join(','));
L.bridge.token = 'TOK-LIVE-2';
await L.fireNext();
ok('وقتی توکن رسید، تلاش مجدد ثبت را انجام می‌دهد (با شماره‌ی کاربر)', L.registerCalls().length === 1 && new URLSearchParams(L.registerCalls()[0].body).get('phone') === '09120001111', `${L.registerCalls().length}`);
ok('پس از ثبت موفق تایمر دیگری باقی نمی‌ماند', L.pending().length === 0, JSON.stringify(L.pending()));
st = L.sb.eplakPushState();
ok('وضعیت عیب‌یابی پس از ثبت: registered=true با شماره‌ی کاربر (بدون هیچ کادری در صفحه)',
  st.registered === true && st.phone === '09120001111' && !L.askedIds.has('notifDeviceNotice'), JSON.stringify(st));

/* ۳) خطای سرور (۴۰۰، HTML فایروال، قطع شبکه) ← تلاش پله‌ای */
for (const mode of ['http400', 'html', 'network']) {
  L = buildLive({ token: 'TOK-LIVE-3', phone: '09120001111', start: true, mode });
  await L.settle();
  const delays = [];
  for (let i = 0; i < 6; i++) { const d = await L.fireNext(); if (d !== null) delays.push(d); }
  const expected = [2000, 4000, 8000, 16000, 30000, 30000];
  ok(`خطای «${mode}» ← تلاش‌های پله‌ای ۲/۴/۸/۱۶/۳۰ ثانیه و بی‌صدا نمی‌میرد`, JSON.stringify(delays) === JSON.stringify(expected), JSON.stringify(delays));
  ok(`خطای «${mode}» ← چیزی به‌عنوان «ثبت‌شده» ذخیره نمی‌شود`, !('eplak_fcm_registered' in L.store));
  ok(`خطای «${mode}» ← دلیل در وضعیت عیب‌یابی ثبت می‌شود (server/network/exception)`, ['server', 'network', 'exception'].includes(L.sb.eplakPushState().reason), L.sb.eplakPushState().reason);
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

/* ۸) کادر «وضعیت اعلان» (با «تست اعلان» و «تنظیمات اعلان گوشی») به درخواست مالک حذف شد */
const liveSrc = read('modules/live.js');
ok('live.js دیگر دکمه‌ی «تست اعلان» (eplakTestPushClick / action=test از اپ) را ندارد',
  !liveSrc.includes('eplakTestPushClick') && !liveSrc.includes('>تست اعلان<') && !/action:\s*'test'/.test(liveSrc));
ok('live.js دیگر دکمه‌ی «تنظیمات اعلان گوشی» (eplakOpenNotificationSettings) را ندارد',
  !liveSrc.includes('eplakOpenNotificationSettings') && !liveSrc.includes('>تنظیمات اعلان گوشی<'));
ok('live.js دیگر کادر را رندر نمی‌کند و متن «اعلان‌های داخل برنامه فعال است» را ندارد',
  !liveSrc.includes('renderDeviceNotice') && !liveSrc.includes('notifDeviceNotice') && !liveSrc.includes('اعلان‌های داخل برنامه فعال است'));
L = buildLive({ token: 'TOK-LIVE-8', phone: '09120001111', start: true });
await L.settle();
ok('با شروع اپ هیچ تماسی با عنصر notifDeviceNotice نمی‌شود و توابع کادر روی window نیستند',
  !L.askedIds.has('notifDeviceNotice') && typeof L.sb.renderDeviceNotice === 'undefined'
  && typeof L.sb.eplakTestPushClick === 'undefined' && typeof L.sb.eplakOpenNotificationSettings === 'undefined');
L = buildLive({ token: 'TOK-LIVE-9', phone: '09120001111' });
L.sb.AndroidApp.notificationsEnabled = () => false;
let askedNative = 0; L.sb.AndroidApp.requestNotificationPermission = () => { askedNative++; };
await L.sb.requestPushPermission();
ok('اجازه‌ی اعلان رد/داده‌نشده ← هنوز با requestPushPermission (اولین لمس کاربر) از خود اندروید پرسیده می‌شود',
  askedNative === 1 && !L.askedIds.has('notifDeviceNotice'));
L.sb.eplakNativePermissionResult(true);
ok('پاسخ اندروید به اجازه‌ی اعلان (eplakNativePermissionResult) همچنان بی‌خطا پذیرفته می‌شود', true);
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

console.log('\n=== «اعلان روی APK نمی‌آید»: شکستِ بی‌صدا حذف شد ===');
/* ۱) پنل: وقتی کلید فایربیس نیست، باید بنرِ صریح باشد (پیش از این هیچ پیامی نبود) */
await exec(`eplakSetAppSetting($pdo, 'fcm_service_account', '');`);
const notifPage = await admin.get('/admin/notifications.php');
ok('صفحه‌ی «اعلان‌ها» بدون خطا رندر می‌شود', notifPage.status === 200, String(notifPage.status));
ok('پنل صریح می‌گوید «اعلانِ اپ اندروید (APK) غیرفعال است» (نه سکوت)',
  notifPage.text.includes('اعلانِ اپ اندروید (APK) غیرفعال است'),
  notifPage.text.includes('فایربیس) فعال است') ? 'بنرِ موفقیت دیده شد (کلید در دیتابیسِ آزمون هست)' : 'بنری پیدا نشد');
ok('همان بنر راهِ حل را هم می‌گوید (Service accounts + پیوندِ تنظیمات + نام پروژه‌ی APK)',
  notifPage.text.includes('Generate new private key') && notifPage.text.includes('settings.php#fcm-section')
    && notifPage.text.includes('eplak-test-project'));

await exec(`eplakSetAppSetting($pdo, 'fcm_service_account', ${JSON.stringify(JSON.stringify(serviceAccount))});`);
const notifPageOk = await admin.get('/admin/notifications.php');
ok('با کلیدِ فایربیس، همان صفحه بنرِ «فعال است» می‌دهد و بنرِ قرمز می‌رود',
  notifPageOk.text.includes('اعلان اپ اندروید (فایربیس) فعال است')
    && !notifPageOk.text.includes('اعلانِ اپ اندروید (APK) غیرفعال است'),
  notifPageOk.text.includes('alert-danger') ? 'هنوز بنرِ قرمز هست' : 'بنرِ سبز هم دیده نشد');

/* ۲) اپ: وضعیتِ واقعیِ سرور نشان داده می‌شود و «✅ ثبت شده» ادعا نمی‌شود */
const LO = buildLive({ token: 'TOK-LIVE-FCMOFF', phone: '09120009999', start: true, mode: 'fcm_off' });
await LO.settle();
await LO.settle();
/* کادر وضعیت در صفحه حذف شده؛ «آماده نبودنِ سرور» فقط در وضعیت عیب‌یابی (eplakPushState)
   و در پنل ادمین (بنر قرمز بالا) دیده می‌شود — نه در صفحه‌ی اعلان‌های کاربر. */
const stOff = LO.sb.eplakPushState();
ok('اپ: حتی وقتی ثبت توکن موفق است، «آماده نبودنِ سرور» در وضعیت عیب‌یابی ثبت می‌شود (نه ادعای «می‌رسد»)',
  stOff.registered === true && stOff.serverReady === false && /کلید سرویس فایربیس/.test(String(stOff.serverReason || '')),
  JSON.stringify(stOff));
ok('اپ: در صفحه‌ی اعلان‌ها هیچ کادری برای این وضعیت ساخته نمی‌شود', !LO.askedIds.has('notifDeviceNotice'));
ok('وضعیتِ اپ: serverReady=false با دلیلِ سرور ذخیره می‌شود',
  stOff.registered === true && stOff.serverReady === false && /کلید/.test(String(stOff.serverReason || '')),
  JSON.stringify(stOff));

/* ۳) وقتی سرور آماده است، همان پیامِ قبلی (بدون ترساندنِ بی‌مورد) */
const LOK = buildLive({ token: 'TOK-LIVE-FCMOK', phone: '09120009998', start: true });
await LOK.settle();
await LOK.settle();
const stOk = LOK.sb.eplakPushState();
ok('اپ: با سرورِ آماده هم هیچ کادری در صفحه ساخته نمی‌شود', !LOK.askedIds.has('notifDeviceNotice'));
ok('وضعیتِ اپ: serverReady=true ثبت می‌شود', stOk.registered === true && stOk.serverReady === true, JSON.stringify(stOk));

/* ۴) ورک‌فلوی APK باید «سیم‌کشی FCM» را سخت‌گیرانه بررسی کند */
const apkWf = read('.github/workflows/android-apk.yml');
ok('CI: مانیفستِ ادغام‌شده برای FirebaseMessagingService/POST_NOTIFICATIONS بررسی می‌شود',
  apkWf.includes('com.google.firebase.messaging.FirebaseMessagingService')
    && apkWf.includes('android.permission.POST_NOTIFICATIONS')
    && apkWf.includes('com.example.eplakfixed.EplakMessagingService')
    && apkWf.includes("grep -qa 'google_app_id'"),
  'بازرسیِ FCM در android-apk.yml پیدا نشد');
ok('CI: نبودِ سیم‌کشی FCM ساخت را متوقف می‌کند (exit 1) و پروژه گزارش می‌شود',
  /اعلانِ گوشی کار نمی‌کند"\n\s+exit 1/.test(apkWf) || (apkWf.includes('اعلانِ گوشی کار نمی‌کند') && apkWf.includes('FCM_PROJECT=')));
ok('مستندات: بخش «چرا اعلان روی APK نمی‌آید» با راهِ فعال‌سازی هست',
  read('docs/NOTIFICATIONS_FA.md').includes('چرا اعلان روی **APK** نمی‌آید')
    && read('docs/NOTIFICATIONS_FA.md').includes('Generate new private key'));
ok('کش‌باسترِ live.js بالا رفت (v=22 — دلیلِ قابل‌مشاهده‌ی فهرست خالی اعلان‌ها) تا گوشی‌ها کد تازه را بگیرند',
  read('index.html').includes('modules/live.js?v=22') && /LIVE_VERSION = '22'/.test(read('modules/live.js')));

/* ══════════════════════════════════════════════════════════════════
   ۵) «کلید سرویس از پروژه‌ی دیگری است» (SenderId mismatch)
   گزارش واقعی مالک: گوشی ثبت می‌شود، گام‌های OAuth و validate_only سبزند،
   ولی هر ارسال با «HTTP 403 PERMISSION_DENIED SenderId mismatch» رد می‌شود،
   چون کلید پنل از پروژه‌ای غیر از پروژه‌ی google-services.json داخل APK بود.
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== کلید سرویس از پروژه‌ی دیگر (SenderId mismatch) ===');
const gsJson = JSON.parse(read('android-app/app/google-services.json'));
const fcmPhp = read('shared/fcm.php');
const gsProject = gsJson.project_info?.project_id;
const gsSender = gsJson.project_info?.project_number;
const gsPackage = gsJson.client?.[0]?.client_info?.android_client_info?.package_name;
ok('ثابت‌های shared/fcm.php با google-services.json داخل APK یکی‌اند (پروژه، شناسه‌ی فرستنده، نام بسته)',
  fcmPhp.includes(`define('EPLAK_APP_FCM_PROJECT_ID', '${gsProject}')`)
    && fcmPhp.includes(`define('EPLAK_APP_FCM_SENDER_ID', '${gsSender}')`)
    && fcmPhp.includes(`define('EPLAK_APP_PACKAGE', '${gsPackage}')`),
  `${gsProject} / ${gsSender} / ${gsPackage}`);
/* پروژه‌ی تازه‌ی مالک (eplak-7e6ed) اپ اندروید را با نام بسته‌ی com.eplak ثبت کرده؛ پلاگین google-services
   فقط client هم‌نام با applicationId را می‌پذیرد ⇒ applicationId اپ باید دقیقاً همان باشد. */
const gradleTxt = read('android-app/app/build.gradle');
ok('applicationId اپ اندروید = نام بسته‌ی ثبت‌شده در google-services.json (وگرنه ساخت APK یا توکن FCM می‌شکند)',
  gradleTxt.includes(`applicationId '${gsPackage}'`) && gsPackage === 'com.eplak' && gsProject === 'eplak-7e6ed' && gsSender === '221915268820',
  `applicationId=${(gradleTxt.match(/applicationId '([^']+)'/) || [])[1]} · gs=${gsPackage}`);
ok('نام بسته‌ی تازه = نسخه‌ی تازه (versionCode 3 / 2.1) تا نصب روی گوشی قابل تشخیص باشد',
  /versionCode 3\b/.test(gradleTxt) && gradleTxt.includes("versionName '2.1'"));
ok('CI: بازرسی APK نام بسته‌ی مانیفستِ ادغام‌شده را با google-services.json مقایسه می‌کند',
  apkWf.includes('GS_PACKAGE=') && apkWf.includes('package=\\"$GS_PACKAGE\\"') && apkWf.includes('APK_PACKAGE='));
ok('مستندات به پروژه و نام بسته‌ی تازه اشاره می‌کنند و مهاجرت از نسخه‌ی ۲.۰ را توضیح می‌دهند',
  read('docs/FIREBASE_SETUP_FA.md').includes('`eplak-7e6ed`') && read('docs/FIREBASE_SETUP_FA.md').includes('`com.eplak`')
    && read('docs/FIREBASE_SETUP_FA.md').includes('نسخه‌ی ۲.۰ را از گوشی حذف کنید')
    && read('docs/FIREBASE_SETUP_EN.md').includes('`com.eplak`') && read('docs/NOTIFICATIONS_FA.md').includes('`com.eplak`')
    && !read('docs/DEPLOY_UPDATE_FA.md').includes('com.example.eplakfixed'));

/* الف) توضیح فارسیِ خطا: متن واقعی گوگل «SenderId mismatch» (نه فقط SENDER_ID_MISMATCH) */
const explain = grab(await exec(`echo '<<<' . json_encode([
  eplakFcmExplainError('HTTP 403 PERMISSION_DENIED SenderId mismatch'),
  eplakFcmExplainError('SENDER_ID_MISMATCH'),
  eplakFcmExplainError('HTTP 403 PERMISSION_DENIED The caller does not have permission'),
], JSON_UNESCAPED_UNICODE) . '>>>';`));
ok('«SenderId mismatch» (متن واقعی پاسخ ۴۰۳ گوگل) به توضیح دقیق «کلید از پروژه‌ی دیگر» نگاشته می‌شود — نه متن کلیِ «اجازه نداد»',
  /پروژه‌ی دیگری/.test(explain[0]) && explain[0].includes('Generate new private key') && explain[0].includes('eplak-test-project'),
  explain[0]);
ok('کد قدیمی SENDER_ID_MISMATCH هم همان توضیح را می‌گیرد', explain[1] === explain[0]);
ok('۴۰۳ِ معمولی (بدون SenderId) همچنان توضیح کلیِ خودش را دارد', /اجازه‌ی ارسال نداد/.test(explain[2]) && explain[2] !== explain[0]);

/* ب) سرور: کلید معتبر ولی APK با پروژه‌ی دیگری ساخته شده */
setEnv(MISMATCH_ENV);
r = await appGet('action=config');
ok('config: fcm_ready=false و دلیل «کلید سرویس … پروژه‌ی دیگر» با نام هر دو پروژه',
  r.json?.fcm_ready === false && r.json?.fcm_project_match === false
    && r.json?.fcm_key_project === 'eplak-test-project' && r.json?.fcm_app_project === 'eplak-63c74'
    && /eplak-63c74/.test(r.json?.fcm_reason || '') && /SenderId mismatch/.test(r.json?.fcm_reason || ''),
  r.text.slice(0, 300));

r = await appPost({ action: 'register_fcm', phone: PHONE, token: 'TOK-MISMATCH-1', platform: 'android', project_id: 'eplak-63c74', sender_id: '817151129705' });
ok('ثبت گوشی با project_id: ذخیره می‌شود ولی پاسخ صریح می‌گوید کلید با پروژه‌ی اپ یکی نیست',
  r.json?.success === true && r.json?.fcm_ready === false && r.json?.project_match === false
    && r.json?.app_project === 'eplak-63c74' && r.json?.key_project === 'eplak-test-project'
    && /Generate new private key/.test(r.json?.fcm_reason || ''),
  r.text.slice(0, 300));
rows = await q("SELECT user_phone, app_project, is_active FROM device_tokens WHERE token='TOK-MISMATCH-1'");
ok('پروژه‌ی گزارش‌شده‌ی گوشی در ستون device_tokens.app_project نگه داشته می‌شود (ستون خودکار اضافه شد)',
  rows[0]?.app_project === 'eplak-63c74' && Number(rows[0]?.is_active) === 1, JSON.stringify(rows));
r = await appPost({ action: 'register_fcm', phone: PHONE, token: 'TOK-MISMATCH-2', platform: 'android', project_id: 'eplak-test-project' });
ok('گوشی‌ای که با پروژه‌ی خودِ کلید ساخته شده (project_id هم‌خوان) همچنان fcm_ready=true می‌گیرد',
  r.json?.success === true && r.json?.fcm_ready === true && r.json?.project_match === true, r.text.slice(0, 200));
r = await appPost({ action: 'register_fcm', phone: PHONE, token: 'TOK-MISMATCH-3', platform: 'android', project_id: '<bad>$(x)' });
rows = await q("SELECT app_project FROM device_tokens WHERE token='TOK-MISMATCH-3'");
ok('project_id با نویسه‌های نامعتبر پاک‌سازی می‌شود (فقط حروف لاتین/رقم/نقطه/خط تیره)', r.json?.success === true && rows[0]?.app_project === 'badx', JSON.stringify(rows));

/* ج) ارسال: برای گوشیِ ناهم‌خوان اصلاً به گوگل نمی‌رویم؛ دلیل دقیق روی ردیف می‌نشیند؛ توکن غیرفعال نمی‌شود */
g0 = gMsgs();
const mm = grab(await exec(`
  $devs = array_values(array_filter(eplakFcmTokens($pdo, ['${PHONE}']), fn($d) => in_array($d['token'], ['TOK-MISMATCH-1', 'TOK-MISMATCH-2'], true)));
  $res = eplakFcmSend($pdo, $devs, 'آزمون', 'ناهم‌خوانی پروژه');
  echo '<<<' . json_encode(['n' => count($devs), 'res' => $res], JSON_UNESCAPED_UNICODE) . '>>>';`));
rows = await q("SELECT token, is_active, fail_count, last_error FROM device_tokens WHERE token IN ('TOK-MISMATCH-1','TOK-MISMATCH-2') ORDER BY token");
ok('گوشیِ ناهم‌خوان بدون تماس با گوگل «شکست» می‌خورد و گوشیِ هم‌خوان عادی ارسال می‌شود',
  mm.n === 2 && mm.res.failed === 1 && mm.res.sent === 1 && gMsgs() === g0 + 1, JSON.stringify(mm));
ok('دلیل دقیق (SENDER_ID_MISMATCH با نام هر دو پروژه) روی ردیف گوشی می‌نشیند و توکن فعال می‌ماند (با عوض شدن کلید همین توکن کار می‌کند)',
  Number(rows[0]?.is_active) === 1 && /SENDER_ID_MISMATCH/.test(rows[0]?.last_error || '') && /eplak-63c74/.test(rows[0]?.last_error || '') && /eplak-test-project/.test(rows[0]?.last_error || '')
    && rows[1]?.last_error === '', JSON.stringify(rows));

/* د) پنل: بنر قرمزِ صریح در «اعلان‌ها» و وضعیت/عیب‌یابی در «تنظیمات» */
const mmNotif = await admin.get('/admin/notifications.php');
ok('پنل → اعلان‌ها: بنر قرمز «کلید سرویس فایربیس از پروژه‌ی دیگری است» با نام هر دو پروژه و راه حل',
  mmNotif.text.includes('data-testid="fcm-project-mismatch-banner"') && mmNotif.text.includes('eplak-63c74')
    && mmNotif.text.includes('eplak-test-project') && mmNotif.text.includes('Generate new private key')
    && !mmNotif.text.includes('اعلان اپ اندروید (فایربیس) فعال است'),
  mmNotif.text.includes('فعال است') ? 'بنر سبزِ گمراه‌کننده هنوز هست' : 'بنر قرمز پیدا نشد');
let mmSettings = await admin.get('/admin/settings.php');
ok('پنل → تنظیمات: وضعیت کلید «کلید از پروژه‌ی دیگری است» + پروژه‌ی اپ با ✖',
  mmSettings.text.includes('data-testid="fcm-project-mismatch"') && mmSettings.text.includes('✖ با کلید سرویس یکی نیست')
    && mmSettings.text.includes('data-testid="fcm-project-mismatch-text"'));
ok('پنل → تنظیمات: جدول گوشی‌ها پروژه‌ی گزارش‌شده‌ی هر گوشی را با نشان «≠ کلید» نشان می‌دهد',
  mmSettings.text.includes('≠ کلید') && /<th>پروژه‌ی اپ<\/th>/.test(mmSettings.text));
const tokenMm = csrfOf(mmSettings.text);
const mmDiag = await admin.post('/admin/settings.php', { _token: tokenMm, action: 'diagnose_fcm' });
ok('عیب‌یابی: گام «هم‌خوانی پروژه» ✖ با راه حل، در حالی که OAuth و سرویس ارسال سبزند (همان الگوی گزارش مالک)',
  /هم‌خوانی پروژه‌ی کلید با پروژه‌ی اپ اندروید/.test(mmDiag.text) && (mmDiag.text.match(/✖ مشکل/g) || []).length === 1
    && (mmDiag.text.match(/✔ سالم/g) || []).length === 4 && /گزارش خودِ گوشی‌ها/.test(mmDiag.text),
  `${(mmDiag.text.match(/✔ سالم/g) || []).length} سالم / ${(mmDiag.text.match(/✖ مشکل/g) || []).length} مشکل`);

/* ه) اپ: پروژه را از پل اندروید می‌گیرد و همراه ثبت می‌فرستد؛ اپ قدیمی بدون پل هم بی‌خطا */
const LP = buildLive({ token: 'TOK-LIVE-PROJ', phone: '09120007777', start: true });
LP.sb.AndroidApp.getFcmProject = () => JSON.stringify({ project_id: 'eplak-63c74', sender_id: '817151129705', app_id: '1:817151129705:android:x' });
await LP.sb.registerAppDevice(true);
await LP.settle();
const projBody = new URLSearchParams(LP.registerCalls().at(-1)?.body || '');
ok('live.js: پروژه‌ی فایربیس اپ (getFcmProject) همراه register_fcm فرستاده می‌شود',
  projBody.get('project_id') === 'eplak-63c74' && projBody.get('sender_id') === '817151129705', projBody.toString());
ok('eplakPushState پروژه‌ی اپ را گزارش می‌کند', LP.sb.eplakPushState().appProject === 'eplak-63c74');
const LN = buildLive({ token: 'TOK-LIVE-NOPROJ', phone: '09120007778', start: true });
await LN.settle(); await LN.settle();
const noProjBody = new URLSearchParams(LN.registerCalls()[0]?.body || '');
ok('اپ قدیمی (بدون getFcmProject): ثبت مثل قبل، بدون فیلد project_id و بدون خطا',
  LN.registerCalls().length === 1 && !noProjBody.has('project_id') && LN.sb.eplakPushState().registered === true);
ok('MainActivity: پل getFcmProject از FirebaseOptions (projectId/gcmSenderId/applicationId) می‌خواند',
  kt.includes('fun getFcmProject') && kt.includes('options.projectId') && kt.includes('options.gcmSenderId') && kt.includes('@JavascriptInterface\n        fun getFcmProject'));
ok('CI: ورک‌فلوی APK وجود پل getFcmProject و ضربان اپ را داخل APK بررسی می‌کند',
  apkWf.includes("grep -q 'fun getFcmProject'") && apkWf.includes("grep -q 'getFcmProject' apk-check/assets/modules/live.js"));

setEnv(GOOGLE_ENV);
const okAgain = await admin.get('/admin/notifications.php');
ok('با کلیدِ پروژه‌ی درست، بنر قرمز می‌رود و بنر سبز برمی‌گردد',
  okAgain.text.includes('اعلان اپ اندروید (فایربیس) فعال است') && !okAgain.text.includes('fcm-project-mismatch-banner'));

/* و) گوگل خودش «SenderId mismatch» می‌دهد (توکنِ APK قدیمی که پروژه‌اش را گزارش نکرده):
      کلید همان پروژه‌ی APK است ⇒ توکن کهنه است ⇒ غیرفعال می‌شود؛ ولی اگر کلید از پروژه‌ی دیگر
      باشد ⇒ اشتباه از کلید است ⇒ توکن فعال می‌ماند. (تغییر پروژه‌ی فایربیس دقیقاً همین را می‌سازد.) */
console.log('\n=== پاسخ واقعی گوگل SenderId mismatch برای توکن‌های قدیمی ===');
const OLD_PHONE = '09120005555';
await appPost({ action: 'register_fcm', phone: OLD_PHONE, token: 'OLD-PROJECT-TOKEN-1', platform: 'android' });
g0 = gMsgs();
const legacy = grab(await exec(`
  $res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['${OLD_PHONE}']), 'آزمون', 'توکن قدیمی');
  echo '<<<' . json_encode($res, JSON_UNESCAPED_UNICODE) . '>>>';`));
rows = await q("SELECT is_active, last_error FROM device_tokens WHERE token='OLD-PROJECT-TOKEN-1'");
ok('کلید = پروژه‌ی APK ⇒ توکنِ پروژه‌ی قبلی غیرفعال می‌شود و دلیل می‌گوید «APK جدید را باز کند» (گوگل یک‌بار صدا شد)',
  legacy.failed === 1 && gMsgs() === g0 + 1 && Number(rows[0]?.is_active) === 0 && /SENDER_ID_MISMATCH/.test(rows[0]?.last_error || '') && /APK جدید/.test(rows[0]?.last_error || ''),
  JSON.stringify({ legacy, rows }));
ok('ارسال بعدی به همان شماره دیگر سراغ توکن کهنه نمی‌رود (گوشی ثبت‌شده‌ی فعال ندارد)', (await q(`SELECT COUNT(*) AS n FROM device_tokens WHERE user_phone='${OLD_PHONE}' AND is_active=1`))[0].n == 0);
await appPost({ action: 'register_fcm', phone: OLD_PHONE, token: 'OLD-PROJECT-TOKEN-1', platform: 'android' });
ok('باز شدن دوباره‌ی اپ، همان ردیف را دوباره فعال می‌کند (ثبت مجدد = زنده شدن)', Number((await q("SELECT is_active FROM device_tokens WHERE token='OLD-PROJECT-TOKEN-1'"))[0]?.is_active) === 1);
setEnv(MISMATCH_ENV);
g0 = gMsgs();
const legacy2 = grab(await exec(`
  $res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['${OLD_PHONE}']), 'آزمون', 'کلید اشتباه');
  echo '<<<' . json_encode($res, JSON_UNESCAPED_UNICODE) . '>>>';`));
rows = await q("SELECT is_active, last_error FROM device_tokens WHERE token='OLD-PROJECT-TOKEN-1'");
ok('کلید ≠ پروژه‌ی APK ⇒ همان پاسخ گوگل، ولی توکن فعال می‌ماند و دلیل «کلید سرویس برای پروژه‌ی دیگر» است',
  legacy2.failed === 1 && gMsgs() === g0 + 1 && Number(rows[0]?.is_active) === 1 && /کلید سرویس برای پروژه‌ی «eplak-test-project»/.test(rows[0]?.last_error || ''),
  JSON.stringify({ legacy2, rows }));
ok('توضیح فارسی برای این خطا همان راهنمای «کلید از پروژه‌ی دیگر» است (نه ۴۰۳ کلی)',
  /Generate new private key/.test(grab(await exec(`echo '<<<' . json_encode([eplakFcmExplainError(${JSON.stringify(String(rows[0]?.last_error || ''))})], JSON_UNESCAPED_UNICODE) . '>>>';`))[0]));
setEnv(GOOGLE_ENV);

/* ح) تعویض پروژه‌ی فایربیس (۲.۰ → ۲.۱): گوشی‌ای که هنوز APK قدیمی را دارد، پروژه‌ی قبلی را گزارش می‌کند.
      کلیدِ پنل برای APK جدید درست است ⇒ این توکن هرگز کار نخواهد کرد ⇒ بدون تماس با گوگل غیرفعال می‌شود
      (نه این‌که تا ابد در هر ارسال یک «ناموفق» بسازد)؛ گوشیِ APK جدید همان شماره عادی می‌گیرد. */
console.log('\n=== گوشی با APK قدیمی (پروژه‌ی قبلی) وقتی کلید برای APK جدید درست است ===');
const STALE_PHONE = '09120006666';
await appPost({ action: 'register_fcm', phone: STALE_PHONE, token: 'TOK-STALE-OLD', platform: 'android', project_id: 'eplak-63c74', sender_id: '817151129705' });
await appPost({ action: 'register_fcm', phone: STALE_PHONE, token: 'TOK-STALE-NEW', platform: 'android', project_id: 'eplak-test-project' });
g0 = gMsgs();
const stale = grab(await exec(`
  $res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['${STALE_PHONE}']), 'آزمون', 'تعویض پروژه');
  echo '<<<' . json_encode($res, JSON_UNESCAPED_UNICODE) . '>>>';`));
rows = await q("SELECT token, is_active, last_error FROM device_tokens WHERE user_phone='" + STALE_PHONE + "' ORDER BY token");
ok('توکن APK قدیمی بدون تماس با گوگل غیرفعال می‌شود و دلیلش «نسخه‌ی قدیمی اپ … APK جدید را نصب» است؛ توکن APK جدید عادی ارسال می‌شود',
  stale.sent === 1 && stale.failed === 1 && gMsgs() === g0 + 1
    && rows.length === 2 && rows[1]?.token === 'TOK-STALE-OLD' && Number(rows[1]?.is_active) === 0
    && /نسخه‌ی قدیمی اپ/.test(rows[1]?.last_error || '') && /eplak-63c74/.test(rows[1]?.last_error || '') && /APK جدید/.test(rows[1]?.last_error || '')
    && Number(rows[0]?.is_active) === 1 && rows[0]?.last_error === '',
  JSON.stringify({ stale, rows }));
const staleExplain = grab(await exec(`echo '<<<' . json_encode([eplakFcmExplainError(${JSON.stringify(String(rows[1]?.last_error || ''))})], JSON_UNESCAPED_UNICODE) . '>>>';`))[0];
ok('توضیح: «نسخه‌ی قدیمی اپ … APK جدید را نصب» و بدون Generate new private key',
  /نسخه‌ی قدیمی اپ/.test(staleExplain) && /APK جدید/.test(staleExplain) && !/Generate new private key/.test(staleExplain), staleExplain);
g0 = gMsgs();
const stale2 = grab(await exec(`
  $res = eplakFcmSend($pdo, eplakFcmTokens($pdo, ['${STALE_PHONE}']), 'آزمون', 'ارسال بعدی');
  echo '<<<' . json_encode($res, JSON_UNESCAPED_UNICODE) . '>>>';`));
ok('ارسال بعدی به همان شماره فقط به APK جدید می‌رود (۱ ارسال، ۰ ناموفق)', stale2.sent === 1 && stale2.failed === 0 && gMsgs() === g0 + 1, JSON.stringify(stale2));

/* ز) پنل → تنظیمات: انتخاب خودِ فایل کلید (به‌جای کپی/چسباندن) + اشتباه‌های رایج */
console.log('\n=== ذخیره‌ی کلید سرویس با انتخاب فایل ===');
let setPage = await admin.get('/admin/settings.php');
ok('فرم کلید فایربیس فیلد انتخاب فایل دارد و multipart است',
  setPage.text.includes('data-testid="fcm-key-file"') && /enctype="multipart\/form-data"[^>]*>\s*(<[^>]+>\s*)*<input type="hidden" name="action" value="save_fcm">/.test(setPage.text));
let tokenF = csrfOf(setPage.text);
const gsFileText = read('android-app/app/google-services.json');
let up = await admin.upload('/admin/settings.php', { _token: tokenF, action: 'save_fcm', fcm_service_account: '' }, { fcm_service_account_file: { filename: 'google-services.json', content: gsFileText } });
ok('آپلود google-services.json به‌جای کلید سرویس با پیام روشن رد می‌شود (کلید قبلی دست نمی‌خورد)',
  up.text.includes('این فایل «کلید سرویس» نیست') && (await q("SELECT setting_value FROM app_settings WHERE setting_key='fcm_service_account'"))[0]?.setting_value.includes('eplak-test-project'),
  up.text.match(/alert[^>]*>[\s\S]{0,200}/)?.[0]);
const otherKey = { ...serviceAccount, project_id: 'eplak-other-project', client_email: 'firebase-adminsdk-x@eplak-other-project.iam.gserviceaccount.com' };
tokenF = csrfOf((await admin.get('/admin/settings.php')).text);
up = await admin.upload('/admin/settings.php', { _token: tokenF, action: 'save_fcm', fcm_service_account: 'ignored-when-file-present' }, { fcm_service_account_file: { filename: 'eplak-other-project-firebase-adminsdk-abc.json', content: JSON.stringify(otherKey) } });
ok('آپلود کلیدِ پروژه‌ی دیگر: ذخیره می‌شود ولی همان لحظه پیام ⛔ «کلید از پروژه‌ی دیگری است» با راه حل می‌آید (نه «✅ برقرار است»)',
  up.text.includes('⛔ کلید ذخیره شد و گوگل آن را می‌پذیرد، ولی') && up.text.includes('eplak-other-project') && up.text.includes('Generate new private key') && !up.text.includes('✅ کلید سرویس فایربیس ذخیره شد'),
  up.text.match(/alert[^>]*>[\s\S]{0,240}/)?.[0]);
ok('فایل بر متنِ کادر مقدم است (کلید ذخیره‌شده همان فایل است)', (await q("SELECT setting_value FROM app_settings WHERE setting_key='fcm_service_account'"))[0]?.setting_value.includes('eplak-other-project'));
tokenF = csrfOf((await admin.get('/admin/settings.php')).text);
up = await admin.upload('/admin/settings.php', { _token: tokenF, action: 'save_fcm', fcm_service_account: '' }, { fcm_service_account_file: { filename: 'eplak-test-project-firebase-adminsdk-abc.json', content: '\uFEFF' + JSON.stringify(serviceAccount, null, 2) } });
ok('آپلود کلیدِ درست (حتی با BOM و تورفتگی): «✅ ذخیره شد … همان پروژه‌ی اپ اندروید»',
  up.text.includes('✅ کلید سرویس فایربیس ذخیره شد') && up.text.includes('همان پروژه‌ی اپ اندروید') && (await q("SELECT setting_value FROM app_settings WHERE setting_key='fcm_service_account'"))[0]?.setting_value.includes('eplak-test-project'),
  up.text.match(/alert[^>]*>[\s\S]{0,240}/)?.[0]);
ok('ابزارهای توسعه: check-firebase-key.mjs و apply-google-services.mjs در مخزن هستند',
  fs.existsSync(path.join(ROOT, 'tools/dev/check-firebase-key.mjs')) && fs.existsSync(path.join(ROOT, 'tools/dev/apply-google-services.mjs')));

/* ══════════════════════════════════════════════════════════════════
   ۶) «ضربان اپ‌ها»: هر دریافت فهرست اعلان‌ها در پنل دیده می‌شود
   (عیب‌یابی «فهرست اعلان‌های APK خالی است» بدون دسترسی به کنسول گوشی)
   ══════════════════════════════════════════════════════════════════ */
console.log('\n=== ضربان اپ‌ها (آخرین دریافت فهرست اعلان‌ها) ===');
const HB_PHONE = '09120001111';
r = await req('GET', `/api/notifications.php?phone=${HB_PHONE}&device=dev-apk-1&app=android&v=21&prev=first&t=1`);
ok('GET notifications.php با app=android مثل قبل فهرست را برمی‌گرداند', r.json?.success === true && Array.isArray(r.json?.notifications), r.text.slice(0, 160));
let hb = await q(`SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'app_poll:%' ORDER BY setting_key`);
const hbRow = hb.find((x) => x.setting_key === `app_poll:android:${HB_PHONE}`);
const hbVal = hbRow ? JSON.parse(hbRow.setting_value) : null;
ok('ضربان با کلید app_poll:android:<شماره> ثبت می‌شود و تعداد اعلان‌های برگشتی را دارد',
  !!hbVal && hbVal.platform === 'android' && hbVal.count === r.json.count && hbVal.v === '21' && hbVal.prev === 'first' && typeof hbVal.at === 'number',
  JSON.stringify(hb).slice(0, 300));
r = await req('GET', `/api/notifications.php?phone=${HB_PHONE}&device=dev-apk-1&app=android&v=21&prev=ok:${hbVal?.count ?? 0}&t=2`);
hb = await q(`SELECT setting_value FROM app_settings WHERE setting_key = 'app_poll:android:${HB_PHONE}'`);
ok('درخواست دوم در کمتر از ۱۰ ثانیه دوباره نوشته نمی‌شود (سقف نوشتن؛ اپ هر ۳٫۵ ثانیه می‌پرسد)',
  JSON.parse(hb[0]?.setting_value || '{}').prev === 'first', hb[0]?.setting_value);
r = await req('GET', `/api/notifications.php?phone=all&device=dev-guest-9&app=android&v=21&prev=net:TypeError&t=3`);
hb = await q(`SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'app_poll:android:guest:%'`);
ok('مهمانِ APK (phone=all، هنوز وارد نشده) با کلید guest:<دستگاه> ثبت می‌شود و prev شبکه‌ای را نگه می‌دارد',
  hb.length === 1 && hb[0].setting_key === 'app_poll:android:guest:dev-guest-9' && JSON.parse(hb[0].setting_value).prev === 'net:TypeError', JSON.stringify(hb));
r = await req('GET', `/api/notifications.php?phone=all&device=dev-guest-web&app=web&v=21&prev=first&t=3`);
hb = await q(`SELECT COUNT(*) AS n FROM app_settings WHERE setting_key LIKE 'app_poll:web:guest:%'`);
ok('مهمانِ وب (هر بازدیدکننده‌ی سایت) ثبت نمی‌شود تا app_settings پر نشود', r.json?.success === true && Number(hb[0]?.n) === 0);
r = await req('GET', `/api/notifications.php?phone=09120002222&device=dev-pwa&app=web&v=21&prev=ok:2&t=3`);
hb = await q(`SELECT setting_key FROM app_settings WHERE setting_key = 'app_poll:web:09120002222'`);
ok('کاربرِ واردشده‌ی PWA ثبت می‌شود (برای مقایسه‌ی APK با PWA در پنل)', hb.length === 1);
r = await req('GET', `/api/notifications.php?phone=${HB_PHONE}&device=dev-old&t=4`);
hb = await q(`SELECT COUNT(*) AS n FROM app_settings WHERE setting_key LIKE 'app_poll:%'`);
ok('اپ قدیمی (بدون app=) ضربانی نمی‌سازد (بدون ردیف اضافی) و پاسخش هم تغییری نمی‌کند', r.json?.success === true && Number(hb[0]?.n) === 3, JSON.stringify(hb));
r = await req('GET', `/api/notifications.php?phone=${HB_PHONE}&device=dev-x&app=<script>&v=1&t=5`);
hb = await q(`SELECT COUNT(*) AS n FROM app_settings WHERE setting_key LIKE 'app_poll:%'`);
ok('سکوی ناشناخته (app=<script>) ثبت نمی‌شود', Number(hb[0]?.n) === 3);
const hbSettings = await admin.get('/admin/settings.php');
ok('پنل → تنظیمات: جدول «ضربان اپ‌ها» با سکو، کاربر، «n ثانیه پیش»، تعداد اعلان، نسخه و تفسیر prev',
  hbSettings.text.includes('data-testid="app-heartbeats"') && hbSettings.text.includes('اپ اندروید (APK)') && hbSettings.text.includes('وب / PWA')
    && /ثانیه پیش/.test(hbSettings.text) && hbSettings.text.includes('اولین درخواست پس از باز شدن اپ')
    && hbSettings.text.includes('درخواست قبلی به سرور نرسید') && hbSettings.text.includes('پاسخ قبلی سالم خوانده شد (2 اعلان)'),
  hbSettings.text.includes('app-heartbeats-empty') ? 'جدول خالی است' : 'جدول/متن‌ها پیدا نشد');
await exec(`require_once '${SHIM}/shared/app_heartbeat.php'; $pdo->exec("UPDATE app_settings SET updated_at = '2020-01-01 00:00:00' WHERE setting_key = 'app_poll:android:guest:dev-guest-9'"); eplakHeartbeatPrune($pdo, 30);`);
hb = await q(`SELECT COUNT(*) AS n FROM app_settings WHERE setting_key LIKE 'app_poll:%'`);
ok('پاک‌سازی: ضربان‌های قدیمی‌تر از ۳۰ روز حذف می‌شوند و بقیه می‌مانند', Number(hb[0]?.n) === 2, JSON.stringify(hb));

/* اپ: پارامترهای ضربان را می‌فرستد و نتیجه‌ی درخواست قبلی را گزارش می‌کند */
const LH = buildLive({ token: 'TOK-LIVE-HB', phone: '09120006666', start: true });
await LH.settle(); await LH.settle();
const hbCalls = () => LH.calls.filter((c) => c.url.includes('notifications.php') && c.method === 'GET');
ok('live.js: درخواست فهرست اعلان‌ها app=android&v=21&prev=first دارد (اولین بار)',
  hbCalls().length >= 1 && /app=android/.test(hbCalls()[0].url) && /v=22/.test(hbCalls()[0].url) && /prev=first/.test(hbCalls()[0].url), hbCalls()[0]?.url);
await LH.sb.syncNotifications();
await LH.settle();
ok('درخواست بعدی نتیجه‌ی قبلی را می‌فرستد (prev=ok:0) و eplakPushState آن را دارد',
  /prev=ok%3A0|prev=ok:0/.test(hbCalls().at(-1).url) && LH.sb.eplakPushState().lastPoll === 'ok:0' && LH.sb.eplakPushState().platform === 'android', hbCalls().at(-1).url);
LH.sb.AndroidApp = undefined;
LH.sb.EPLAK_IOS_APP = true;
await LH.sb.syncNotifications();
ok('پوسته‌ی iOS (window.EPLAK_IOS_APP) خودش را app=ios معرفی می‌کند', /app=ios/.test(hbCalls().at(-1).url), hbCalls().at(-1).url);
LH.sb.EPLAK_IOS_APP = undefined;
await LH.sb.syncNotifications();
ok('مرورگر/PWA خودش را app=web معرفی می‌کند', /app=web/.test(hbCalls().at(-1).url), hbCalls().at(-1).url);
ok('مستندات: NOTIFICATIONS_FA.md «SenderId mismatch» و «ضربان اپ‌ها» را توضیح می‌دهد',
  read('docs/NOTIFICATIONS_FA.md').includes('SenderId mismatch') && read('docs/NOTIFICATIONS_FA.md').includes('ضربان اپ‌ها'));
ok('مستندات: FIREBASE_SETUP_FA.md می‌گوید کلید باید از پروژه‌ی خودِ APK باشد (SenderId mismatch)',
  read('docs/FIREBASE_SETUP_FA.md').includes('SenderId mismatch'));
ok('APK با کلید دیباگِ ثابتِ مخزن امضا می‌شود (نصب به‌روزرسانی بدون حذف؛ توکن فایربیس می‌ماند)',
  fs.existsSync(path.join(ROOT, 'android-app/app/eplak-debug.keystore'))
    && read('android-app/app/build.gradle').includes("storeFile file('eplak-debug.keystore')")
    && read('android-app/.gitignore').includes('!app/eplak-debug.keystore')
    && apkWf.includes('apksigner') && apkWf.includes('EXPECTED_SHA256='));

fakeGoogle.close();
console.log('\n' + '='.repeat(52));
console.log(`PUSH: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

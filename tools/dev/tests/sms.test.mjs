/* sms.test.mjs — «بهبودهای سمتِ کدِ پیامک» (ملی پیامک)
   ============================================================================
   چرا این مجموعه؟ چون «ارسال کد تایید انجام نشد» روی هاستِ کارفرما ساعت‌ها وقت
   گرفت و ریشه‌اش چیزی بود که در کد دیده نمی‌شد: ملی پیامک در وب‌سرویس به‌جای
   «رمز عبورِ پنل»، «کلید API» می‌خواهد و پاسخِ خطا هم فقط یک عددِ خام بود
   (RetStatus=-110) بدونِ هیچ ترجمه‌ای.

   خواسته‌هایی که این‌جا «با اجرای واقعیِ PHP» بررسی می‌شوند (نه متن‌کاوی):
     ۱) کلیدِ مؤثر: PAYAMAK_API_KEY ← payamak_api_key ← PAYAMAK_PASSWORD ←
        payamak_password (تا تنظیمِ قدیمیِ هاست هم بی‌تغییر کار کند).
     ۲) ترجمه‌ی فارسیِ همه‌ی کدهای پاسخ (۱۱۰-، ۱۰۹-، ۴-، ۵-، ۲، ۳۵، …) و
        ساختنِ «چه‌کار باید کرد» برای هرکدام.
     ۳) گزارشِ error_log: HTTP + RetStatus + StrRetStatus + ترجمه + مقصدِ پوشیده،
        و اینکه «هیچ کلید/رمزی» در گزارش نمی‌آید.
     ۴) ارسال از یک تابعِ مشترک (eplakPayamakSendCode) با محافظ‌های پیش از ارسال:
        شماره‌ی نامعتبر، نبودِ کلید، شناسه‌ی غیررقمی ⇒ هرگز درخواستِ شبکه نمی‌رود.
     ۵) setup.php: برچسبِ «کلید API»، نوشتنِ payamak_api_key، رد کردنِ تنظیمِ
        نیمه، سازگاری با کلیدِ قدیمی، و «ساخت پوشه‌های نوشتنی» (+ نگهبانِ
        uploads/.htaccess) با گزارشِ صادقانه.
     ۶) پنل → تنظیمات: «ارسال پیامک آزمایشی» فقط برای مدیرِ کل، با CSRF، با
        اعتبارسنجیِ شماره، و ۴۰۳ برای مدیرِ حوزه/معاونت.
     ۷) خطای دیتابیس روی مسیرِ JSON هدرِ CORS می‌گیرد (وگرنه اپ دلیلِ واقعی را
        نمی‌بیند) و پیش‌درخواستِ OPTIONS هم ۲۰۴ می‌گیرد نه ۵۰۰.

   اجرا:  bash tools/dev/run-regression.sh sms
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-sms-shim';
const DB = '/tmp/eplak-regression-sms.sqlite';
const PREPEND = '/tmp/eplak-regression-sms.prepend.php';
const PREPEND_BAD = '/tmp/eplak-regression-sms.bad-prepend.php';
/* «پوشه‌ی» دیتابیس عمداً یک فایلِ معمولی است تا ساختِ مسیر ممکن نشود و
   eplakGetPdo() خطا بدهد — بدونِ هیچ تلاشِ شبکه‌ای (سریع و قطعی). */
const BLOCKER = '/tmp/eplak-sms-not-a-dir';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── نسخه‌ی آزمایشی کد (به مخزن دست نمی‌زنیم) ── */
for (const f of [DB, PREPEND, PREPEND_BAD]) if (fs.existsSync(f)) fs.rmSync(f, { force: true });
if (fs.existsSync(BLOCKER)) fs.rmSync(BLOCKER, { recursive: true, force: true });
fs.writeFileSync(BLOCKER, 'this is a file, not a directory');
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
for (const entry of ['admin', 'api', 'core', 'modules', 'shared', 'assets', 'uploads']) {
  const src = `${ROOT}/${entry}`;
  if (fs.existsSync(src)) fs.cpSync(src, `${SHIM}/${entry}`, { recursive: true });
}
fs.copyFileSync(`${ROOT}/setup.php`, `${SHIM}/setup.php`);
fs.writeFileSync(PREPEND, `<?php
putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}');
putenv('PAYAMAK_API_KEY'); putenv('PAYAMAK_PASSWORD');
putenv('PAYAMAK_USERNAME'); putenv('PAYAMAK_TEMPLATE_ID');
$_ENV['DB_DRIVER'] = 'sqlite'; $_ENV['DB_SQLITE_PATH'] = '${DB}';
ini_set('session.save_path', '/tmp');
`);
fs.writeFileSync(PREPEND_BAD, `<?php
putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${BLOCKER}/eplak.sqlite');
ini_set('session.save_path', '/tmp');
`);

/* ── ابزارهای HTTP ── */
const enc = new TextEncoder();
const newJar = () => ({});
const absorb = (jar, res) => {
  const sc = res.headers['set-cookie'];
  for (const c of (Array.isArray(sc) ? sc : sc ? [sc] : [])) {
    const [pair] = String(c).split(';'); const i = pair.indexOf('=');
    jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
};
const hdr = (res, name) => {
  const v = res.headers[String(name).toLowerCase()];
  return Array.isArray(v) ? v[0] : (v === undefined ? '' : String(v));
};
const makeClient = (handler, jar) => {
  async function req(method, url, form, extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = enc.encode(new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString());
    }
    if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await handler.request({ url, method, headers, body });
    if (jar) absorb(jar, res);
    const text = String(res.text);
    let json = null; try { json = JSON.parse(text); } catch (e) { /* HTML */ }
    return { status: res.httpStatusCode, headers: res.headers, text, json };
  }
  return {
    get: (u, h) => req('GET', u, null, h),
    post: (u, f, h) => req('POST', u, f, h),
    options: (u, h) => req('OPTIONS', u, null, h),
  };
};
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';
const phpVal = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return '[' + v.map(phpVal).join(', ') + ']';
  return '[' + Object.keys(v).map((k) => phpVal(k) + ' => ' + phpVal(v[k])).join(', ') + ']';
};
const grab = (text) => {
  const m = String(text).split('<<<')[1];
  if (m === undefined) throw new Error('خروجیِ PHP: ' + String(text).slice(0, 600));
  return JSON.parse(m.split('>>>')[0]);
};

/* ══════════════════════════════════════════════════════════════════════════
   ۰) CORS روی «مسیرِ خطای دیتابیس» — با یک رانتایمِ جدا تا دیتابیسِ سالمِ
      بقیه‌ی آزمون‌ها را خراب نکند.
   ══════════════════════════════════════════════════════════════════════════ */
section('۰) خطای دیتابیس: JSON + هدرهای CORS');
const phpBad = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
useHostFilesystem(phpBad);
await setPhpIniEntries(phpBad, { auto_prepend_file: PREPEND_BAD, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL' });
const badHandler = new PHPRequestHandler({ php: phpBad, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8097' });
const badCl = makeClient(badHandler, newJar());

const xhr = await badCl.get('/api/ads.php', { 'x-requested-with': 'XMLHttpRequest' });
ok('خطای دیتابیس ۵۰۰ است ولی JSON برمی‌گرداند (نه HTML)',
  xhr.status === 500 && xhr.json !== null && xhr.json.success === false,
  'status=' + xhr.status + ' body=' + xhr.text.slice(0, 120));
ok('هدر Access-Control-Allow-Origin روی مسیرِ خطا هست',
  hdr(xhr, 'access-control-allow-origin') === '*', 'got: ' + JSON.stringify(hdr(xhr, 'access-control-allow-origin')));
ok('هدرهای روش‌ها و سرآیندهای مجاز هم هست',
  hdr(xhr, 'access-control-allow-methods').includes('POST')
    && hdr(xhr, 'access-control-allow-headers').includes('X-Requested-With'));
ok('دلیلِ خوانا + نشانی setup.php در همان JSON است',
  String(xhr.json && xhr.json.error).includes('setup.php') === false
    ? String(xhr.json && xhr.json.setup_url).includes('setup.php')
    : true, JSON.stringify(xhr.json));
ok('کدِ خطا database_unavailable است تا اپ «بدون اینترنت» نگوید',
  xhr.json && xhr.json.code === 'database_unavailable');

const acceptJson = await badCl.get('/api/status.php', { accept: 'application/json' });
ok('با Accept: application/json هم همان JSON + CORS می‌آید',
  acceptJson.json !== null && hdr(acceptJson, 'access-control-allow-origin') === '*');

const preflight = await badCl.options('/api/ads.php', {
  origin: 'https://eplak.ir',
  'access-control-request-method': 'POST',
});
ok('پیش‌درخواستِ OPTIONS روی مسیرِ خطا ۲۰۴ می‌گیرد (نه ۵۰۰)',
  preflight.status === 204 && hdr(preflight, 'access-control-allow-origin') === '*',
  'status=' + preflight.status);

const htmlPath = await badCl.get('/admin/index.php');
ok('مسیرِ غیرِ JSON (پنل) همان صفحه‌ی خطای خوانای HTML است',
  htmlPath.status === 500 && htmlPath.text.includes('صفحه ادمین باز نمی‌شود')
    && !htmlPath.text.includes('database_unavailable'));

/* ══════════════════════════════════════════════════════════════════════════
   رانتایمِ اصلی (دیتابیسِ SQLite سالم)
   ══════════════════════════════════════════════════════════════════════════ */
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 2 } }));
useHostFilesystem(php);
await setPhpIniEntries(php, { auto_prepend_file: PREPEND, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL' });
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8098' });

/* پاک‌سازیِ متغیرهای محیطیِ پیامک پیش از هر پرونده (تا پرونده‌ی قبلی اثر نگذارد) */
const PAY_CLEAR = "putenv('PAYAMAK_API_KEY'); putenv('PAYAMAK_PASSWORD'); putenv('PAYAMAK_USERNAME'); putenv('PAYAMAK_TEMPLATE_ID'); ";
/* فقط shared/payamak.php — بدونِ دیتابیس، سریع و بی‌اثر */
const payRun = async (code) => String((await php.run({
  code: `<?php ${PAY_CLEAR}require_once '${ROOT}/shared/payamak.php'; ${code}`,
})).text);
const pay = async (body) => grab(await payRun(`${body} echo '<<<' . json_encode($__out) . '>>>';`));
/* با دیتابیس و تابع‌های پنل */
const phpRun = async (code, server = {}) => {
  const srv = Object.assign({
    REQUEST_METHOD: 'GET',
    SCRIPT_NAME: '/eplak-fixed/admin/settings.php',
    PHP_SELF: '/eplak-fixed/admin/settings.php',
    HTTP_HOST: 'eplak.test',
    HTTPS: 'on',
    REMOTE_ADDR: '203.0.113.9',
  }, server);
  return String((await php.run({
    code: `<?php ${PAY_CLEAR}putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
      + `$_SERVER = array_merge($_SERVER, ${phpVal(srv)}); `
      + `require_once '${ROOT}/admin/includes/db.php'; require_once '${ROOT}/shared/payamak.php'; `
      + `require_once '${ROOT}/admin/includes/functions.php'; ${code}`,
  })).text);
};

/* ══════════════════════════════════════════════════════════════════════════
   ۱) کلیدِ مؤثر: کلید API مقدم بر رمزِ قدیمی
   ══════════════════════════════════════════════════════════════════════════ */
section('۱) کلید API (payamak_api_key) و سازگاری با تنظیمِ قدیمی');

let r1 = await pay(`
    $c = ['payamak_username' => '19350505507', 'payamak_api_key' => 'KEY_FROM_CONFIG'];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c), eplakPayamakPasswordSet($c), eplakPayamakReady($c), eplakPayamakSecretLabel($c)];
`);
ok('payamak_api_key خوانده می‌شود و منبع «api_key» است',
  r1[0] === 'KEY_FROM_CONFIG' && r1[1] === 'api_key' && r1[2] === true && r1[3] === true, JSON.stringify(r1));
ok('برچسبِ فارسی می‌گوید «کلید API — درست»', String(r1[4]).includes('کلید API'));

r1 = await pay(`
    $c = ['payamak_username' => 'u', 'payamak_password' => 'OLD_PANEL_PASS'];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c), eplakPayamakReady($c), eplakPayamakSecretLabel($c)];
`);
ok('تنظیمِ قدیمی (payamak_password) هم کار می‌کند تا ارسال قطع نشود',
  r1[0] === 'OLD_PANEL_PASS' && r1[1] === 'password' && r1[2] === true, JSON.stringify(r1));
ok('برچسب هشدار می‌دهد که این مسیرِ قدیمی ممکن است ۱۱۰- بدهد',
  String(r1[3]).includes('قدیمی') && String(r1[3]).includes('۱۱۰-'), String(r1[3]));

r1 = await pay(`
    $c = ['payamak_api_key' => 'KEY_A', 'payamak_password' => 'PASS_B'];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c)];
`);
ok('اگر هر دو باشند، «کلید API» برنده است', r1[0] === 'KEY_A' && r1[1] === 'api_key', JSON.stringify(r1));

r1 = await pay(`
    putenv('PAYAMAK_API_KEY=KEY_FROM_ENV');
  $c = ['payamak_api_key' => 'KEY_FROM_CONFIG'];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c)];
`);
ok('متغیرِ محیطی بر فایلِ تنظیمات برتری دارد', r1[0] === 'KEY_FROM_ENV' && r1[1] === 'api_key', JSON.stringify(r1));

r1 = await pay(`
    putenv('PAYAMAK_PASSWORD=PASS_FROM_ENV');
  $c = ['payamak_password' => 'PASS_FROM_CONFIG'];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c)];
`);
ok('برای مسیرِ قدیمی هم محیطی برنده است', r1[0] === 'PASS_FROM_ENV' && r1[1] === 'password', JSON.stringify(r1));

r1 = await pay(`
    $c = ['payamak_api_key' => '   ', 'payamak_password' => ''];
  $__out = [eplakPayamakSecret($c), eplakPayamakSecretSource($c), eplakPayamakPasswordSet($c), eplakPayamakReady($c), eplakPayamakPartial($c), eplakPayamakSecretLabel($c)];
`);
ok('کلیدِ خالی/فاصله «تنظیم نشده» حساب می‌شود (نه نیمه‌تنظیم)',
  r1[0] === '' && r1[1] === '' && r1[2] === false && r1[3] === false && r1[4] === false, JSON.stringify(r1));
ok('برچسبِ حالتِ تنظیم‌نشده صادقانه است', String(r1[5]).includes('تنظیم نشده'));

r1 = await pay(`
  $__out = [eplakPayamakTemplateId(['payamak_template_id' => '']),
   eplakPayamakTemplateId(['payamak_template_id' => '123456']),
   eplakPayamakReady(['payamak_username' => 'u', 'payamak_api_key' => 'k', 'payamak_template_id' => 'abc']),
   eplakPayamakTemplateRaw(['payamak_template_id' => ''])];
`);
ok('شناسه‌ی متن: خالی ⇒ پیش‌فرضِ 573639؛ غیررقمی ⇒ «آماده نیست»',
  r1[0] === '573639' && r1[1] === '123456' && r1[2] === false && r1[3] === '', JSON.stringify(r1));

/* ══════════════════════════════════════════════════════════════════════════
   ۲) ترجمه‌ی فارسیِ کدهای پاسخ
   ══════════════════════════════════════════════════════════════════════════ */
section('۲) ترجمه‌ی فارسیِ کدهای پاسخِ ملی پیامک');

const CODES = {
  '1': 'موفق',
  '0': 'نام کاربری',
  '-1': 'الگو',
  '-4': 'bodyId',
  '-5': 'الگو',
  '-6': 'به‌روزرسانی',
  '-8': '۰۷:۰۰',
  '-9': 'گذشته',
  '-10': 'متغیر',
  '-108': 'IP',
  '-109': 'IP',
  '-110': 'کلید API',
  '-111': 'IP',
  '2': 'اعتبار',
  '7': 'فیلتر',
  '10': 'غیرفعال',
  '19': 'سقف',
  '35': 'لیست سیاه',
};
for (const [code, word] of Object.entries(CODES)) {
  const [text] = await pay(`
  $__out = [eplakPayamakStatusText(${phpVal(code)})];
`);
  ok(`کدِ ${code} ترجمه‌ی فارسی دارد («${word}»)`, String(text).includes(word), String(text));
}
const [unknownText] = await pay(`
  $__out = [eplakPayamakStatusText('9999')];
`);
ok('کدِ ناشناخته ترجمه‌ی ساختگی نمی‌گیرد (رشته‌ی خالی)', unknownText === '', JSON.stringify(unknownText));
const [faDigits] = await pay(`
  $__out = [eplakPayamakStatusText('-۱۱۰')];
`);
ok('رقم‌های فارسی هم همان کد را می‌دهند (۱۱۰- ≡ -110)', String(faDigits).includes('کلید API'), String(faDigits));

/* ══════════════════════════════════════════════════════════════════════════
   ۳) eplakPayamakExplain — از پاسخِ خام تا «چه‌کار باید کرد»
   ══════════════════════════════════════════════════════════════════════════ */
section('۳) تفسیرِ پاسخ (Value / RetStatus / StrRetStatus) و گزارش');

let e = await pay(`
    $x = eplakPayamakExplain(['RetStatus' => 1, 'Value' => '5294807965139091570'], 200);
  $__out = [$x['ok'], $x['value'], $x['fa'], $x['text'], $x['log']];
`);
ok('پاسخِ موفق: RetStatus=1 و Value = شناسه‌ی رکوردِ ارسال',
  e[0] === true && e[1] === '5294807965139091570' && String(e[2]).includes('موفقیت'), JSON.stringify(e));
ok('در گزارش، شناسه‌ی رکورد با برچسب rec_id می‌آید',
  String(e[4]).includes('rec_id=5294807965139091570') && String(e[4]).includes('ret=1') && String(e[4]).includes('[eplak-sms]'), String(e[4]));

e = await pay(`
    $x = eplakPayamakExplain(['RetStatus' => '-110'], 200);
  $__out = [$x['ok'], $x['fa'], $x['hint'], $x['log']];
`);
ok('۱۱۰- ⇒ پیامِ کاربر «کلید API» را می‌گوید و راهنما مسیرِ گرفتنِ کلید را',
  e[0] === false && String(e[1]).includes('کلید API') && String(e[2]).includes('تنظیمات وب‌سرویس'), JSON.stringify(e));
ok('گزارشِ ۱۱۰- هم کد را دارد هم ترجمه‌اش را',
  String(e[3]).includes('ret=-110') && String(e[3]).includes('fa='), String(e[3]));

e = await pay(`
    $x = eplakPayamakExplain(['RetStatus' => -109, 'StrRetStatus' => 'Invalid IP'], 200);
  $__out = [$x['fa'], $x['hint'], $x['str'], $x['log']];
`);
ok('۱۰۹- ⇒ «IP سرور را در پنل مجاز کنید» + StrRetStatus هم گزارش می‌شود',
  String(e[0]).includes('IP') && String(e[1]).includes('IPهای مجاز') && e[2] === 'Invalid IP'
    && String(e[3]).includes('str=Invalid IP'), JSON.stringify(e));

e = await pay(`
    $x = eplakPayamakExplain(['RetStatus' => '-4'], 200);
  $__out = [$x['fa'], $x['hint']];
`);
ok('۴- ⇒ «شناسه‌ی متن تأیید نشده» و در راهنما شناسه‌ی پیش‌فرضِ 573639 هست',
  String(e[0]).includes('الگوی پیامک') && String(e[1]).includes('573639'), JSON.stringify(e));

e = await pay(`
    $x = eplakPayamakExplain(['RetStatus' => '-5'], 200);
  $__out = [$x['fa'], $x['hint']];
`);
ok('۵- ⇒ «متن با متغیرهای الگو مطابقت ندارد»', String(e[1]).includes('الگو') || String(e[0]).includes('الگو'), JSON.stringify(e));

for (const [code, word] of [['2', 'اعتبار'], ['35', 'لیست سیاه'], ['19', 'سقف'], ['-8', '۰۷:۰۰'], ['-6', 'به‌روزرسانی']]) {
  const one = await pay(`
      $x = eplakPayamakExplain(['RetStatus' => ${phpVal(code)}], 200);
  $__out = [$x['ok'], $x['fa']];
`);
  ok(`کدِ ${code} در پیامِ کاربر فارسی توضیح داده می‌شود («${word}»)`,
    one[0] === false && String(one[1]).includes(word), JSON.stringify(one));
}

e = await pay(`
    $x = eplakPayamakExplain(['StrRetStatus' => 'Some unknown provider text'], 200);
  $__out = [$x['ok'], $x['fa'], $x['log']];
`);
ok('بدونِ RetStatus ولی با StrRetStatus ⇒ همان متنِ سرویس به کاربر نشان داده می‌شود',
  e[0] === false && String(e[1]).includes('Some unknown provider text'), JSON.stringify(e));

e = await pay(`
    $x = eplakPayamakExplain([], 502);
  $__out = [$x['ok'], $x['fa'], $x['hint'], $x['log']];
`);
ok('HTTP ناموفق ⇒ پیامِ «پاسخِ غیرمنتظره (HTTP 502)» و گزارشِ http=502',
  e[0] === false && String(e[1]).includes('502') && String(e[3]).includes('http=502'), JSON.stringify(e));

e = await pay(`
    $x = eplakPayamakExplain([], 0, 'Could not resolve host: rest.payamak-panel.com');
  $__out = [$x['fa'], $x['hint'], $x['log']];
`);
ok('خطای اتصال (cURL) ⇒ پیامِ جدا و ثبتِ متنِ خطا در گزارش',
  String(e[0]).includes('اتصال') && String(e[1]).includes('Could not resolve host')
    && String(e[2]).includes('curl=Could not resolve host'), JSON.stringify(e));

e = await pay(`
    $x = eplakPayamakExplain(null, 200);
  $__out = [$x['ok'], $x['fa']];
`);
ok('پاسخِ غیرِ JSON/خالی ⇒ «انجام نشد» بدونِ خطای PHP',
  e[0] === false && String(e[1]).length > 10, JSON.stringify(e));

/* ══════════════════════════════════════════════════════════════════════════
   ۴) محافظ‌های پیش از ارسال (هرگز درخواستِ شبکه نمی‌رود)
   ══════════════════════════════════════════════════════════════════════════ */
section('۴) eplakPayamakSendCode — محافظ‌ها و نبودِ کلید در گزارش');

let s = await pay(`
    $r = eplakPayamakSendCode(['payamak_username' => 'u', 'payamak_api_key' => 'SUPER_SECRET_KEY_999'], '12345', '4321');
  $__out = [$r['ok'], $r['fa'], $r['log'], $r['http'], $r['raw'], $r['secret_source']];
`);
ok('شماره‌ی نامعتبر ⇒ ارسال نمی‌رود و پیامِ فارسی می‌آید',
  s[0] === false && String(s[1]).includes('شماره‌ی موبایل معتبر نیست') && s[3] === 0 && s[4] === '', JSON.stringify(s));
ok('گزارشِ این تلاش «هیچ کلیدی» در خودش ندارد',
  String(s[2]).includes('SUPER_SECRET_KEY_999') === false && String(s[2]).includes('[eplak-sms]'), String(s[2]));
ok('منبعِ کلید (نه خودِ کلید) در گزارش می‌آید', String(s[5]) === 'api_key', JSON.stringify(s[5]));

s = await pay(`
    $r = eplakPayamakSendCode(['payamak_username' => 'u', 'payamak_api_key' => 'k'], '+989121234567', '4321');
  $__out = [$r['ok'], $r['fa']];
`);
ok('شماره‌ی +98… پذیرفته نمی‌شود (اپ باید 09xxxxxxxxx بفرستد)',
  s[0] === false && String(s[1]).includes('شماره‌ی موبایل معتبر نیست'), JSON.stringify(s));

s = await pay(`
    $r = eplakPayamakSendCode(['payamak_username' => 'u'], '09121234567', '4321');
  $__out = [$r['ok'], $r['fa'], $r['hint'], $r['log']];
`);
ok('نبودِ کلید ⇒ «پنل ملی پیامک تنظیم نشده» و هیچ درخواستی نمی‌رود',
  s[0] === false && String(s[1]).includes('پنل ملی پیامک تنظیم نشده') && String(s[3]).includes('nothing sent'), JSON.stringify(s));

s = await pay(`
    $r = eplakPayamakSendCode(['payamak_username' => 'u', 'payamak_api_key' => 'k', 'payamak_template_id' => 'abc'], '09121234567', '4321');
  $__out = [$r['ok'], $r['fa'], $r['log']];
`);
ok('شناسه‌ی متنِ غیررقمی ⇒ پیش از ارسال رد می‌شود',
  s[0] === false && String(s[1]).includes('bodyId') && String(s[2]).includes('invalid bodyId'), JSON.stringify(s));

s = await pay(`
    $r = eplakPayamakSendCode([], '09121234567', '4321', ['username' => 'u', 'secret' => '', 'bodyId' => '573639']);
  $__out = [$r['ok'], $r['fa']];
`);
ok('override خالی (مسیرِ api/auth.php) هم «تنظیم نشده» می‌دهد',
  s[0] === false && String(s[1]).includes('تنظیم نشده'), JSON.stringify(s));

s = await pay(`
    $r = eplakPayamakSendCode(['payamak_username' => 'u', 'payamak_api_key' => 'k'], '09121234567', '4321',
    ['username' => 'u2', 'secret' => 'k2', 'bodyId' => '573639']);
  $__out = [$r['body_id'], $r['to'], is_array($r['payload'])];
`);
ok('مقدارهای override (که api/auth.php می‌فرستد) در نتیجه دیده می‌شوند',
  s[0] === '573639' && s[1] === '09121234567' && s[2] === true, JSON.stringify(s));

/* ══════════════════════════════════════════════════════════════════════════
   ۵) setup.php — برچسبِ «کلید API»، پوشه‌های نوشتنی، ساختِ config
   ══════════════════════════════════════════════════════════════════════════ */
section('۵) setup.php — کلید API، پوشه‌های نوشتنی و ساختِ shared/config.php');

fs.rmSync(`${SHIM}/uploads`, { recursive: true, force: true });
fs.rmSync(`${SHIM}/data`, { recursive: true, force: true });
fs.rmSync(`${SHIM}/shared/config.php`, { force: true });

let jar = newJar();
let cl = makeClient(handler, jar);
let page = await cl.get('/setup.php');
ok('setup.php باز می‌شود', page.status === 200 && page.text.includes('راه‌اندازی ای‌پلاک'), 'status=' + page.status);
ok('برچسبِ فیلد «کلید API» است (نه «رمز») و نامِ فیلد payamak_api_key است',
  page.text.includes('ملی پیامک — کلید API') && page.text.includes('name="payamak_api_key"')
    && !page.text.includes('name="payamak_password"'));
ok('دلیلِ خطای ۱۱۰- و مسیرِ گرفتنِ کلید در راهنمای فرم توضیح داده شده',
  page.text.includes('-110') && page.text.includes('توسعه‌دهندگان') && page.text.includes('تنظیمات وب‌سرویس'));
ok('پوشه‌های نبوده «صادقانه» گزارش می‌شوند (نه ✅ الکی)',
  page.text.includes('وجود ندارد') && page.text.includes('ساخت پوشه‌های نوشتنی')
    && page.text.includes('value="make_dirs"'));

const token = csrfOf(page.text);
ok('توکنِ CSRF صفحه گرفته شد', /^[a-f0-9]{32}$/.test(token), token);

let bad = await cl.post('/setup.php', { _token: 'deadbeefdeadbeefdeadbeefdeadbeef', action: 'make_dirs' });
ok('بدون توکنِ درست هیچ پوشه‌ای ساخته نمی‌شود',
  bad.text.includes('توکن امنیتی صفحه معتبر نیست') && !fs.existsSync(`${SHIM}/uploads`));

let made = await cl.post('/setup.php', { _token: token, action: 'make_dirs' });
ok('«ساخت پوشه‌های نوشتنی» موفق گزارش می‌شود',
  made.status === 200 && made.text.includes('همه‌ی پوشه‌های نوشتنی آماده‌اند'), made.text.slice(0, 200));
for (const d of ['uploads', 'uploads/reports', 'uploads/news', 'uploads/ads', 'uploads/tmp', 'data']) {
  ok(`پوشه‌ی ${d} روی هاست ساخته شد`, fs.existsSync(`${SHIM}/${d}`) && fs.statSync(`${SHIM}/${d}`).isDirectory());
}
const guard = fs.existsSync(`${SHIM}/uploads/.htaccess`) ? fs.readFileSync(`${SHIM}/uploads/.htaccess`, 'utf8') : '';
ok('نگهبانِ uploads/.htaccess نوشته شد (اجرای اسکریپت در پوشه‌ی آپلود بسته است)',
  guard.includes('eplak-media-guard-v2') && guard.includes('Require all denied')
    && guard.includes('Deny from all') && !/^php_(flag|value)/m.test(guard), guard.slice(0, 120));
ok('بعد از ساخت، وضعیتِ پوشه‌ها «هست و نوشتنی است» می‌شود',
  (String(made.text).match(/هست و نوشتنی است/g) || []).length >= 7,
  'count=' + (String(made.text).match(/هست و نوشتنی است/g) || []).length);

let saved = await cl.post('/setup.php', {
  _token: token, action: 'save_config', driver: 'sqlite', db_host: 'localhost', db_name: '', db_user: '', db_pass: '',
  db_timezone: 'Asia/Tehran', display_timezone: 'Asia/Tehran', otp_test_code: '',
  payamak_username: '19350505507', payamak_api_key: 'TEST_API_KEY_1234', payamak_template_id: '',
});
ok('با «کلید API» تنظیمات ذخیره می‌شود', saved.status === 200 && saved.text.includes('shared/config.php ساخته شد'),
  saved.text.slice(0, 200));
const cfgText = fs.existsSync(`${SHIM}/shared/config.php`) ? fs.readFileSync(`${SHIM}/shared/config.php`, 'utf8') : '';
ok('payamak_api_key در config نوشته شد و payamak_password خالی ماند',
  cfgText.includes("'payamak_api_key' => 'TEST_API_KEY_1234'") && cfgText.includes("'payamak_password' => ''"), cfgText.slice(0, 240));
ok('شناسه‌ی متنِ خالی ⇒ پیش‌فرضِ 573639 نوشته می‌شود', cfgText.includes("'payamak_template_id' => '573639'"));

page = await cl.get('/setup.php');
ok('مقدارِ کلید هرگز در صفحه نمایش داده نمی‌شود', !page.text.includes('TEST_API_KEY_1234'));
ok('منبعِ کلید «کلید API — درست» و وضعیت «✅ ملی پیامک» است',
  page.text.includes('کلید API (payamak_api_key) — درست') && page.text.includes('✅ ملی پیامک'),
  page.text.slice(0, 200));

fs.rmSync(`${SHIM}/shared/config.php`, { force: true });
let half = await cl.post('/setup.php', {
  _token: token, action: 'save_config', driver: 'sqlite', db_host: 'localhost', db_name: '', db_user: '', db_pass: '',
  payamak_username: '19350505507', payamak_api_key: '', payamak_template_id: '',
});
ok('تنظیمِ نیمه (فقط نام کاربری) ⇒ چیزی نوشته نمی‌شود و پیامِ فارسی می‌آید',
  half.text.includes('هر دو لازم‌اند') && !fs.existsSync(`${SHIM}/shared/config.php`));

let legacy = await cl.post('/setup.php', {
  _token: token, action: 'save_config', driver: 'sqlite', db_host: 'localhost', db_name: '', db_user: '', db_pass: '',
  payamak_username: '19350505507', payamak_api_key: '', payamak_password: 'LEGACY_KEY_77', payamak_template_id: '',
});
const legacyCfg = fs.existsSync(`${SHIM}/shared/config.php`) ? fs.readFileSync(`${SHIM}/shared/config.php`, 'utf8') : '';
ok('فیلدِ قدیمیِ «رمز» هم پذیرفته می‌شود تا ارسالِ هاستِ فعلی قطع نشود',
  legacy.text.includes('shared/config.php ساخته شد') && legacyCfg.includes("'payamak_password' => 'LEGACY_KEY_77'"),
  legacyCfg.slice(0, 200));
page = await cl.get('/setup.php');
ok('در حالتِ قدیمی، هشدارِ «رمزِ قدیمی / ۱۱۰-» نشان داده می‌شود و مقدار پنهان است',
  page.text.includes('رمزِ قدیمی') && page.text.includes('-110') && !page.text.includes('LEGACY_KEY_77'));

/* ══════════════════════════════════════════════════════════════════════════
   ۶) پنل → تنظیمات: «ارسال پیامک آزمایشی» (فقط مدیرِ کل + CSRF)
   ══════════════════════════════════════════════════════════════════════════ */
section('۶) پنل → تنظیمات: ارسال پیامک آزمایشی');

/* عمداً بدونِ کلید: هیچ مسیری در این آزمون به شبکه نمی‌رود.
   نکته‌ی مهم: eplakConfigArray() تنظیمات را در یک static نگه می‌دارد و staticها در
   یک رانتایمِ php-wasm بین درخواست‌ها زنده می‌مانند ⇒ اگر با همان رانتایمِ بخشِ ۵
   ادامه بدهیم، configِ نوشته‌شده‌ی آن بخش «در حافظه» می‌ماند و پنل پیامک را
   «آماده» می‌بیند (و آزمون می‌توانست به ارسالِ واقعی برسد). پس این بخش رانتایمِ
   جدا دارد. */
fs.rmSync(`${SHIM}/shared/config.php`, { force: true });
const phpAdmin = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 3 } }));
useHostFilesystem(phpAdmin);
await setPhpIniEntries(phpAdmin, { auto_prepend_file: PREPEND, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL' });
const adminHandler = new PHPRequestHandler({ php: phpAdmin, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8099' });
jar = newJar();
cl = makeClient(adminHandler, jar);
await cl.get('/admin/login.php');
let lr = await cl.post('/admin/login.php', { username: 'admin', password: 'admin123' });
ok('مدیرِ کل وارد پنل می‌شود', lr.status === 200 || lr.status === 302, 'status=' + lr.status);

let st = await cl.get('/admin/settings.php');
ok('مدیرِ کل بخشِ پیامک را می‌بیند',
  st.status === 200 && st.text.includes('data-testid="sms-test-form"') && st.text.includes('ارسال پیامک آزمایشی'),
  'status=' + st.status);
ok('پنل هم «کلید API» را می‌گوید و دلیلِ ۱۱۰- را توضیح می‌دهد',
  st.text.includes('کلید API') && st.text.includes('-110') && st.text.includes('rest.payamak-panel.com'));
ok('بدونِ کلید: وضعیت «تنظیم نشده» و دکمه غیرفعال است',
  st.text.includes('sms-state-notready') && st.text.includes('sms-test-disabled')
    && /data-testid="sms-test-send"[^>]*disabled/.test(st.text.replace(/\n/g, ' ')));

const stToken = csrfOf(st.text);
ok('فرمِ پیامکِ آزمایشی توکنِ CSRF دارد', /^[a-f0-9]{32,64}$/.test(stToken), stToken);

let noCsrf = await cl.post('/admin/settings.php', { action: 'test_sms', sms_test_phone: '09121234567' });
ok('بدون توکنِ CSRF درخواست رد می‌شود (۴۰۳) و پیامکی نمی‌رود',
  noCsrf.status === 403 && noCsrf.text.includes('توکن امنیتی'), 'status=' + noCsrf.status);

let badPhone = await cl.post('/admin/settings.php', { _token: stToken, action: 'test_sms', sms_test_phone: '12345' });
ok('شماره‌ی نامعتبر ⇒ پیامِ فارسیِ روشن',
  badPhone.status === 200 && badPhone.text.includes('شماره‌ی موبایل معتبر نیست'), 'status=' + badPhone.status);

let noCreds = await cl.post('/admin/settings.php', { _token: stToken, action: 'test_sms', sms_test_phone: '09121234567' });
ok('بدونِ کلید API ⇒ «پنل ملی پیامک آماده نیست» + نامِ کلیدِ payamak_api_key (و هیچ ارسالِ واقعی)',
  noCreds.status === 200 && noCreds.text.includes('پنل ملی پیامک آماده نیست')
    && noCreds.text.includes('payamak_api_key') && !noCreds.text.includes('data-testid="sms-test-result"'),
  'status=' + noCreds.status);

/* مدیرِ حوزه/معاونت: ساخته می‌شود، وارد می‌شود و باید ۴۰۳ بگیرد */
const created = grab(await phpRun(`
  $u = eplakCreateAdminUser($pdo, 'sms-dept-admin', 'SmsTest1403', 'مدیر معاونت خدمات شهری', 'admin');
  echo '<<<' . json_encode($u) . '>>>';
`));
ok('مدیرِ حوزه/معاونت برای آزمون ساخته شد', Number(created.id || 0) > 0, JSON.stringify(created));

await cl.get('/admin/logout.php');
await cl.get('/admin/login.php');
await cl.post('/admin/login.php', { username: 'sms-dept-admin', password: 'SmsTest1403' });
const deptSettings = await cl.get('/admin/settings.php');
ok('مدیرِ حوزه/معاونت به تنظیمات (و پیامکِ آزمایشی) نمی‌رسد ⇒ ۴۰۳',
  deptSettings.status === 403 && deptSettings.text.includes('دسترسی ندارید'), 'status=' + deptSettings.status);

/* ══════════════════════════════════════════════════════════════════════════
   ۷) قراردادِ بسته و راهنماها
   ══════════════════════════════════════════════════════════════════════════ */
section('۷) راهنماها و بسته‌ی آپلود');

const newHost = read('docs/NEW_HOST_FA.md');
const smsGuide = read('docs/SMS_FA.md');
const buildScript = read('tools/build-update-package.sh');
const settingsPage = read('admin/settings.php');

ok('راهنمای هاست تازه «کلید API» و «ساخت پوشه‌های نوشتنی» را می‌گوید',
  newHost.includes('payamak_api_key') && newHost.includes('کلید API')
    && newHost.includes('ساخت پوشه‌های نوشتنی') && newHost.includes('-110'));
ok('راهنمای پیامک جدولِ کدها، پیامکِ آزمایشی و کلید API را دارد',
  smsGuide.includes('-110') && smsGuide.includes('payamak_api_key')
    && smsGuide.includes('ارسال پیامک آزمایشی') && smsGuide.includes('573639')
    && !/amoot/i.test(smsGuide) && !smsGuide.includes('552115'));
ok('بسته‌ی آپلود پوشه‌های نوشتنی را می‌برد ولی داده‌ی کاربران را نه',
  ['uploads/.htaccess', 'uploads/reports/.gitkeep', 'uploads/news/.gitkeep',
   'uploads/ads/.gitkeep', 'uploads/tmp/.gitkeep', 'data/.gitkeep'].every((f) => buildScript.includes(f))
    && buildScript.includes('tools/package-stubs')
    && buildScript.includes("^uploads/(reports|news|ads|tmp)/[0-9]{4}/"));
ok('فایل‌های نشانه‌ی بسته در مخزن هستند (تا CI از یک checkout تمیز هم بسته بسازد)',
  fs.existsSync(`${ROOT}/tools/package-stubs/uploads-htaccess`)
    && fs.existsSync(`${ROOT}/tools/package-stubs/gitkeep`));
/* ضدِ واگرایی: نگهبانی که بسته می‌برد باید دقیقاً همان متنی باشد که
   shared/media.php موقعِ آپلود می‌نویسد — وگرنه روزی یکی‌شان عوض می‌شود و
   پوشه‌ی آپلود روی هاست بی‌نگهبان می‌ماند. */
const stubGuard = fs.readFileSync(`${ROOT}/tools/package-stubs/uploads-htaccess`, 'utf8');
ok('نگهبانِ بسته == نگهبانی که shared/media.php می‌نویسد',
  stubGuard.includes('eplak-media-guard-v2') && stubGuard.includes('Require all denied')
    && stubGuard.includes('Deny from all') && !/^php_(flag|value)/m.test(stubGuard)
    && read('shared/media.php').includes('@file_put_contents($htaccess, eplakMediaGuardContent())'));
ok('پیامکِ آزمایشی در پنل فقط با مجوزِ settings (مدیرِ کل) است',
  settingsPage.includes("eplakRequirePermission('settings')")
    && settingsPage.includes("$action === 'test_sms'")
    && settingsPage.includes('eplakPayamakSendCode($smsCfg, $phone, $smsTestCode)'));

console.log(`\nنتیجهٔ SMS: ${pass} موفق، ${fail} ناموفق`);
if (fail) process.exitCode = 1;
process.exit(fail ? 1 : 0);

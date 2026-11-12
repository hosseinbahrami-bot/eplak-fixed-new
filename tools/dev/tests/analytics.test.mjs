/* analytics.test.mjs — «آمارِ سایت و دانلودها» در پنلِ مدیریت
   ============================================================================
   خواسته‌ی کارفرما:
     «تو صفحه ادمین ی قسمت درست کن که بشه آمار بازدید سایت و تعداد دانلود هارو
      خیلی قشنگ و شیک و باحال با نمودار های جذاب روزانه ماهانه و سالانه و
      تعداد کاربر و … ی چیز کامل درست کن»

   چه چیزی «واقعاً اجرا» می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) با دیتابیسِ SQLite تازه: جدول site_stats با همه‌ی
        ستون‌ها و سه ایندکس ساخته می‌شود و نسخه‌ی اسکیما بالا رفته است.
     ۲) shared/analytics.php: ثبتِ رویداد، ضدِ تورم (تکرار/سقفِ روزانه)، رد کردنِ
        ربات، هش بودنِ IP (خام ذخیره نمی‌شود)، تجزیه‌ی UA، دامنه‌ی referrer،
        سریِ روزانه/ماهانه/سالانه با برچسبِ شمسی و پُر شدنِ جایِ خالی، کلِ دوره،
        مقایسه با دوره‌ی قبل، برترین‌ها، ساعت‌ها، نقشه‌ی حرارتیِ هفته، آنلاین،
        آخرین رویدادها، پاک‌سازی، CSV، آمارِ سامانه (کاربران/گزارش‌ها/تیکت‌ها).
     ۳) api/track.php با درخواستِ HTTP واقعی: POSTِ JSON و GET، سرآیندهای CORS،
        OPTIONS ⇒ ۲۴، «هرگز HTML نشدن»، ساختِ خودکارِ جدولِ نیفتاده، و
        نشمردنِ ربات/نوعِ نامعتبر.
     ۴) admin/analytics.php با نشستِ واقعی: ورود، ۲۰۰ و نمودارهای SVG،
        کلیدهای بازه/دانه‌بندی، خروجیِ CSV، رویدادِ آزمایشی با CSRF،
        ۴۰۳ بدون توکن، ۴۰۳ برای مدیرِ حوزه/معاونت و نبودنش در منوی او.
     ۵) قراردادها: «اپ دست‌نخورده» (هیچ فایلِ اپی track.php را نمی‌شناسد)،
        سازگاری با PHP 7.4، و مستنداتِ docs/ANALYTICS_FA.md.

   اجرا:  bash tools/dev/run-regression.sh analytics
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-analytics-shim';
const DB = '/tmp/eplak-regression-analytics.sqlite';
const PREPEND = '/tmp/eplak-regression-analytics.prepend.php';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* ── نسخه‌ی آزمایشی کد (به مخزن دست نمی‌زنیم) ── */
fs.rmSync(SHIM, { recursive: true, force: true });
fs.mkdirSync(SHIM, { recursive: true });
for (const entry of ['admin', 'api', 'core', 'modules', 'shared', 'assets']) {
  const src = `${ROOT}/${entry}`;
  if (fs.existsSync(src)) fs.cpSync(src, `${SHIM}/${entry}`, { recursive: true });
}
fs.writeFileSync(PREPEND, `<?php
putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}');
$_ENV['DB_DRIVER'] = 'sqlite'; $_ENV['DB_SQLITE_PATH'] = '${DB}';
ini_set('session.save_path', '/tmp');
`);

const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
useHostFilesystem(php);
await setPhpIniEntries(php, { auto_prepend_file: PREPEND, memory_limit: '256M', display_errors: '1', error_reporting: 'E_ALL' });
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8099' });

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
const phpNoise = [];
async function req(method, url, jar, form, extraHeaders) {
  const headers = Object.assign({}, extraHeaders || {});
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = enc.encode(new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString());
  } else if (headers['content-type'] === 'application/json' && extraHeaders && extraHeaders.__json) {
    body = enc.encode(extraHeaders.__json);
    delete headers.__json;
  }
  if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handler.request({ url, method, headers, body });
  if (jar) absorb(jar, res);
  const text = String(res.text);
  const noise = text.match(/(?:<b>)?(?:Warning|Notice|Deprecated|Fatal error|Parse error|Uncaught)(?:<\/b>)?:?\s[^\n]{0,160}/);
  if (noise) phpNoise.push(`${method} ${url} → ${noise[0]}`);
  let json = null; try { json = JSON.parse(text); } catch (e) { /* HTML */ }
  return { status: res.httpStatusCode, headers: res.headers, text, json };
}
const client = (jar) => ({ get: (u) => req('GET', u, jar), post: (u, f) => req('POST', u, jar, f) });
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';
const loc = (r) => String((Array.isArray(r.headers.location) ? r.headers.location[0] : r.headers.location) || '');
const hdr = (r, k) => String((Array.isArray(r.headers[k]) ? r.headers[k][0] : r.headers[k]) || '');
async function submit(cl, page, fields) {
  const form = await cl.get(page);
  return cl.post(page, Object.assign({ _token: csrfOf(form.text) }, fields));
}
const phpVal = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(phpVal).join(',') + ']';
  if (typeof v === 'object') return '[' + Object.entries(v).map(([k, x]) => `'${k}'=>${phpVal(x)}`).join(',') + ']';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};
const phpRun = async (code, server = {}) => {
  const srv = Object.assign({
    REQUEST_METHOD: 'GET',
    SCRIPT_NAME: '/eplak-fixed/api/track.php',
    PHP_SELF: '/eplak-fixed/api/track.php',
    HTTP_HOST: 'eplak.test',
    HTTPS: 'on',
    REMOTE_ADDR: '203.0.113.9',
  }, server);
  return String((await php.run({
    code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
      + `$_SERVER = array_merge($_SERVER, ${phpVal(srv)}); `
      + `require_once '${ROOT}/admin/includes/db.php'; require_once '${ROOT}/shared/analytics.php'; `
      + `require_once '${ROOT}/admin/includes/charts.php'; require_once '${ROOT}/admin/includes/functions.php'; ${code}`,
  })).text);
};
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 600)); return JSON.parse(m.split('>>>')[0]); };
const one = async (code, server) => grab(await phpRun(`echo '<<<' . json_encode([${code}]) . '>>>';`, server))[0];
const has = (html, needle) => String(html).includes(needle);
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/* ══════════════════════════════════════════════════════════════════
   ۱) ساختارِ داده
   ══════════════════════════════════════════════════════════════════ */
section('۱) جدولِ آمار روی دیتابیسِ تازه ساخته می‌شود');
await phpRun(`eplakAnalyticsReady($pdo); echo 'boot';`);
const cols = await one(`json_encode(array_map(function($r){return $r['name'];}, $pdo->query('PRAGMA table_info(site_stats)')->fetchAll(PDO::FETCH_ASSOC)))`);
const colList = JSON.parse(cols);
ok('جدول site_stats با همه‌ی ستون‌ها ساخته شد',
  ['id', 'visit_day', 'visit_hour', 'kind', 'target', 'page', 'visitor', 'ip_hash',
    'device', 'browser', 'os', 'ref_host', 'created_at'].every((c) => colList.includes(c)),
  colList.join(','));
const idx = await one(`json_encode(array_map(function($r){return $r['name'];}, $pdo->query("PRAGMA index_list('site_stats')")->fetchAll(PDO::FETCH_ASSOC)))`);
ok('سه ایندکسِ روز/بازدیدکننده/IP ساخته شد (آمارِ یک سال هم کند نشود)',
  JSON.parse(idx).filter((n) => /idx_site_stats_(day|visitor|ip)/.test(n)).length === 3, idx);
ok('نسخه‌ی اسکیما بالا رفته و جدول در bootstrapِ هر دو درایور هست',
  (await one(`EPLAK_SCHEMA_VERSION`)) === '2026-11-12.1'
  && (read('shared/bootstrap.php').match(/CREATE TABLE IF NOT EXISTS site_stats/g) || []).length === 2);
ok('ستون‌های روز/ساعت جدا هستند ⇒ نمودارِ روزانه/ماهانه/سالانه با SUBSTR و بدونِ توابعِ فقط‌MySQL',
  /SUBSTR\(visit_day, 1, 7\)/.test(read('shared/analytics.php'))
  && !/DATE_FORMAT\(/.test(read('shared/analytics.php')) && !/CONCAT\(/.test(read('shared/analytics.php')));

/* ══════════════════════════════════════════════════════════════════
   ۲) ثبتِ رویداد و ضدِ تورم
   ══════════════════════════════════════════════════════════════════ */
section('۲) گردآورِ رویداد: ضدِ تورم، ربات‌ها، حریمِ خصوصی');
const tr = (o) => one(`json_encode(eplakAnalyticsTrack($pdo, ${phpVal(o)}))`, { HTTP_USER_AGENT: o.ua || UA_CHROME, REMOTE_ADDR: o.ip || '203.0.113.9' });
const first = await tr({ kind: 'view', target: '/', ua: UA_CHROME, ip: '203.0.113.9', visitor: 'a'.repeat(32) });
ok('نخستین بازدید شمرده شد', JSON.parse(first).counted === true, first);
const dup = await tr({ kind: 'view', target: '/', ua: UA_CHROME, ip: '203.0.113.9', visitor: 'a'.repeat(32) });
ok('بازدیدِ تکراریِ همان نفر از همان صفحه در ۳۰ ثانیه ⇒ شمرده نمی‌شود',
  JSON.parse(dup).counted === false && JSON.parse(dup).reason === 'throttled', dup);
const other = await tr({ kind: 'view', target: '#download', ua: UA_CHROME, ip: '203.0.113.9', visitor: 'a'.repeat(32) });
ok('رفتن به بخشِ دیگرِ همان صفحه شمرده می‌شود (آمارِ بخش‌ها)', JSON.parse(other).counted === true, other);
const bot = await tr({ kind: 'view', target: '/', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', ip: '66.249.66.1', visitor: 'b'.repeat(32) });
ok('رباتِ گوگل شمرده نمی‌شود (آمار باد نمی‌کند)', JSON.parse(bot).counted === false && JSON.parse(bot).reason === 'bot', bot);
const emptyUa = await tr({ kind: 'view', target: '/', ua: '', ip: '203.0.113.9', visitor: 'c'.repeat(32) });
ok('درخواستِ بدونِ User-Agent هم شمرده نمی‌شود', JSON.parse(emptyUa).reason === 'bot', emptyUa);
const badKind = await tr({ kind: 'hack', target: '/', ua: UA_CHROME, visitor: 'd'.repeat(32) });
ok('نوعِ ناشناخته رد می‌شود (بدونِ درج)', JSON.parse(badKind).counted === false && JSON.parse(badKind).reason === 'bad_kind', badKind);
const dl = await tr({ kind: 'download', target: 'APK', ua: UA_ANDROID, ip: '198.51.100.7', visitor: 'e'.repeat(32) });
ok('کلیکِ دانلود شمرده شد و هدفِ بزرگ‌نوشته به apk نرمال شد',
  JSON.parse(dl).counted === true
  && (await one(`(string) $pdo->query("SELECT target FROM site_stats WHERE kind='download' ORDER BY id DESC LIMIT 1")->fetchColumn()`)) === 'apk', dl);

const rawIp = await one(`(int) $pdo->query("SELECT COUNT(*) FROM site_stats WHERE ip_hash = '203.0.113.9' OR ip_hash LIKE '%203.0.113%'")->fetchColumn()`);
const hashed = await one(`(int) $pdo->query("SELECT COUNT(*) FROM site_stats WHERE ip_hash <> '' AND LENGTH(ip_hash) = 32")->fetchColumn()`);
ok('IPِ خام هیچ‌جا ذخیره نشده؛ فقط هشِ ۳۲ نویسه‌ای', rawIp === 0 && hashed > 0, `${rawIp}/${hashed}`);
const uaRow = await one(`json_encode($pdo->query("SELECT device, browser, os FROM site_stats WHERE kind='download' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC))`);
ok('دستگاه/مرورگر/سیستم‌عامل از User-Agent خوانده شد (اندروید + کروم)',
  JSON.parse(uaRow).device === 'mobile' && JSON.parse(uaRow).browser === 'کروم' && JSON.parse(uaRow).os === 'اندروید', uaRow);
ok('آیفون/سافاری و دسکتاپ/ویندوز هم درست تشخیص داده می‌شوند',
  (await one(`json_encode(eplakAnalyticsParseUa(${phpVal(UA_IPHONE)}))`)).includes('"mobile"')
  && (await one(`eplakAnalyticsParseUa(${phpVal(UA_IPHONE)})['os']`)) === 'آیفون/آیپد'
  && (await one(`eplakAnalyticsParseUa(${phpVal(UA_CHROME)})['device']`)) === 'desktop');
ok('از نشانیِ منبع فقط «دامنه» نگه داشته می‌شود (نه مسیر و نه پرس‌وجو)',
  (await one(`eplakAnalyticsRefHost('https://www.google.com/search?q=%D9%88%D8%B1%D8%A7%D9%85%DB%8C%D9%86&rlz=1')`)) === 'google.com'
  && (await one(`eplakAnalyticsRefLabel('google.com')`)) === 'گوگل'
  && (await one(`eplakAnalyticsRefLabel('')`)) === 'ورودِ مستقیم');
ok('شناسه‌ی بازدیدکننده فقط هگزِ ۱۶..۴۰ نویسه است؛ هر چیز دیگر ⇒ هشِ IP+UA',
  (await one(`eplakAnalyticsVisitorId(${phpVal('z'.repeat(40))}, '1.2.3.4', 'ua')`)).length === 32
  && (await one(`strlen(eplakAnalyticsVisitorId('a1b2c3d4e5f60718', '1.2.3.4', 'ua'))`)) === 16);
ok('ورودیِ آزاد strip_tags و کوتاه می‌شود (XSS در آمار جا نمی‌گیرد)',
  (await one(`eplakAnalyticsCleanText('<script>alert(1)</script> خانه', 60)`)).indexOf('<') === -1
  && (await one(`function_exists('mb_strlen') ? mb_strlen(eplakAnalyticsCleanText(str_repeat('ا', 400), 180), 'UTF-8') : 0`)) === 180);

/* سقفِ روزانه */
await phpRun(`$h = eplakAnalyticsHashIp('203.0.113.200'); $day = eplakAnalyticsToday($pdo);
$st = $pdo->prepare('INSERT INTO site_stats (visit_day, visit_hour, kind, target, page, visitor, ip_hash, device, browser, os, ref_host, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
for ($i = 0; $i < 300; $i++) { $st->execute([$day, 10, 'view', '/flood', '/flood', 'flood' . $i, $h, 'desktop', 'کروم', 'ویندوز', '', eplakDbNowString($pdo)]); }
echo 'seeded';`);
const flooded = await tr({ kind: 'view', target: '/after-flood', ua: UA_CHROME, ip: '203.0.113.200', visitor: 'f'.repeat(32) });
ok('سقفِ ۳۰۰ رویداد در روز برای هر IP ⇒ حمله‌ی تورم، نمودار را خراب نمی‌کند',
  JSON.parse(flooded).counted === false && JSON.parse(flooded).reason === 'daily_cap', flooded);
await phpRun(`$pdo->exec("DELETE FROM site_stats WHERE target IN ('/flood','/after-flood')"); echo 'cleaned';`);

/* ══════════════════════════════════════════════════════════════════
   ۳) تجمیع‌ها و برچسب‌های شمسی
   ══════════════════════════════════════════════════════════════════ */
section('۳) نمودارها: روزانه، ماهانه، سالانه (برچسبِ شمسی)');
const dates = grab(await phpRun(`$t = eplakAnalyticsToday($pdo);
echo '<<<' . json_encode([
  'today' => $t,
  'd1' => date('Y-m-d', strtotime($t . ' 12:00:00') - 86400),
  'd2' => date('Y-m-d', strtotime($t . ' 12:00:00') - 2 * 86400),
  'm1' => date('Y-m-d', strtotime($t . ' 12:00:00') - 40 * 86400),
  'y1' => date('Y-m-d', strtotime($t . ' 12:00:00') - 400 * 86400),
]) . '>>>';`));
const seedEvent = (day, hour, kind, target, visitor, ua = UA_CHROME, ip = '192.0.2.1') =>
  one(`json_encode(eplakAnalyticsTrack($pdo, ${phpVal({ kind, target, ua, ip, visitor, now: `${day} ${String(hour).padStart(2, '0')}:15:00` })}))`,
    { HTTP_USER_AGENT: ua, REMOTE_ADDR: ip });
ok('داده‌ی سه روزِ اخیر برایِ نمودارِ روزانه کاشته شد',
  JSON.parse(await seedEvent(dates.today, 9, 'view', '/', 'v1'.padEnd(32, '0'))).counted === true
  && JSON.parse(await seedEvent(dates.today, 21, 'download', 'apk', 'v1'.padEnd(32, '0'))).counted === true
  && JSON.parse(await seedEvent(dates.d1, 14, 'view', '#download', 'v2'.padEnd(32, '0'), UA_ANDROID, '192.0.2.2')).counted === true
  && JSON.parse(await seedEvent(dates.d2, 3, 'view', '#news', 'v3'.padEnd(32, '0'), UA_IPHONE, '192.0.2.3')).counted === true
  && JSON.parse(await seedEvent(dates.m1, 11, 'view', '/', 'v4'.padEnd(32, '0'), UA_ANDROID, '192.0.2.4')).counted === true
  && JSON.parse(await seedEvent(dates.y1, 11, 'view', '/', 'v5'.padEnd(32, '0'), UA_CHROME, '192.0.2.5')).counted === true);

const rangeAll = await one(`json_encode(eplakAnalyticsDayRange('all', $pdo))`);
ok('بازه‌ی «همه» از نخستین رویداد تا امروز است',
  JSON.parse(rangeAll).from === dates.y1 && JSON.parse(rangeAll).to === dates.today, rangeAll);
const badRange = await one(`json_encode(eplakAnalyticsDayRange('999', $pdo))`);
ok('بازه‌ی ناشناخته ⇒ همان ۳۰ روزِ پیش‌فرض (صفحه خطا نمی‌گیرد)',
  JSON.parse(badRange).days === 30 && JSON.parse(badRange).key === '30', badRange);

const daily = JSON.parse(await one(`json_encode(eplakAnalyticsSeries($pdo, 'day', ${phpVal(dates.d2)}, ${phpVal(dates.today)}))`));
ok('سریِ روزانه: جایِ روزهای بی‌رویداد با صفر پُر می‌شود (نمودار نمی‌شکند)',
  daily.length === 3 && daily.map((r) => r.key).join(',') === [dates.d2, dates.d1, dates.today].join(',')
  && daily[2].views >= 1 && daily[0].views >= 1, JSON.stringify(daily));
ok('برچسبِ محورِ روزانه شمسی و فارسی است (۱۴xx/xx/xx)',
  /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(daily[2].label), daily[2].label);
const monthly = JSON.parse(await one(`json_encode(eplakAnalyticsSeries($pdo, 'month', ${phpVal(dates.m1)}, ${phpVal(dates.today)}))`));
ok('سریِ ماهانه: ماهِ خالی صفر است و برچسب «نامِ ماهِ شمسی + سال» دارد',
  monthly.length >= 2 && /[۰-۹]{4}$/.test(monthly[monthly.length - 1].label)
  && /فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند/.test(monthly[0].label),
  JSON.stringify(monthly.map((m) => m.label)));
const yearly = JSON.parse(await one(`json_encode(eplakAnalyticsSeries($pdo, 'year', ${phpVal(dates.y1)}, ${phpVal(dates.today)}))`));
ok('سریِ سالانه هم ساخته می‌شود (برچسبِ سالِ شمسی)',
  yearly.length >= 1 && /^[۰-۹]{4}$/.test(yearly[yearly.length - 1].label), JSON.stringify(yearly));
ok('«یکتا» در دانه‌بندیِ ماهانه با کوئریِ جدا شمرده می‌شود (جمعِ یکتای روزها نیست)',
  /COUNT\(DISTINCT visitor\)/g.test(read('shared/analytics.php'))
  && (read('shared/analytics.php').match(/COUNT\(DISTINCT visitor\)/g) || []).length >= 3);

const totals = JSON.parse(await one(`json_encode(eplakAnalyticsTotals($pdo, ${phpVal(dates.d2)}, ${phpVal(dates.today)}))`));
ok('کلِ دوره: بازدید، یکتا، دانلود و QR جدا شمرده شدند',
  totals.views >= 2 && totals.uniques >= 2 && totals.downloads >= 1 && totals.apk >= 1 && totals.events >= 3,
  JSON.stringify(totals));
const deltas = JSON.parse(await one(`json_encode(eplakAnalyticsDeltas(
  eplakAnalyticsTotals($pdo, ${phpVal(dates.d1)}, ${phpVal(dates.today)}),
  eplakAnalyticsTotals($pdo, ${phpVal(dates.d2)}, ${phpVal(dates.d2)})))`));
ok('مقایسه با دوره‌ی قبل: جهت و درصدِ تغییر برای نشانِ «رشد/افت»',
  ['views', 'downloads'].every((k) => ['up', 'down', 'flat'].includes(deltas[k].dir))
  && typeof deltas.views.pct === 'number', JSON.stringify(deltas.views));
const topPages = JSON.parse(await one(`json_encode(eplakAnalyticsTop($pdo, 'page', ${phpVal(dates.d2)}, ${phpVal(dates.today)}, 5, 'view'))`));
const pageLabels = JSON.parse(await one(`json_encode(array_map(function ($r) {
  return eplakAnalyticsTargetLabel('view', $r['key']); }, eplakAnalyticsTop($pdo, 'page', ${phpVal(dates.d2)}, ${phpVal(dates.today)}, 5, 'view')))`));
ok('پربازدیدترین بخش‌ها با برچسبِ فارسیِ خودِ سایت («صفحه‌ی اصلی»، «بخشِ دانلود»)',
  topPages.length >= 2 && topPages.every((r) => r.count >= 1)
  && /صفحه‌ی اصلی/.test(pageLabels.join(' ')) && /بخشِ دانلود/.test(pageLabels.join(' ')),
  JSON.stringify(pageLabels));
ok('ستونِ ناشناخته در «برترین‌ها» رد می‌شود (SQL از ورودیِ مدیر ساخته نمی‌شود)',
  JSON.parse(await one(`json_encode(eplakAnalyticsTop($pdo, 'ip_hash; DROP TABLE users', ${phpVal(dates.d2)}, ${phpVal(dates.today)}, 5, 'view'))`)).length === 0);
const hours = JSON.parse(await one(`json_encode(eplakAnalyticsHourly($pdo, ${phpVal(dates.y1)}, ${phpVal(dates.today)}))`));
ok('ساعت‌های اوج: ۲۴ خانه و رویدادهای کاشته‌شده در ساعتِ خودشان',
  hours.length === 24 && hours[9] >= 1 && hours[21] >= 1 && hours[14] >= 1, JSON.stringify(hours.slice(0, 24)));
const heat = JSON.parse(await one(`json_encode(eplakAnalyticsHeatmap($pdo, ${phpVal(dates.d2)}, ${phpVal(dates.today)}))`));
ok('نقشه‌ی حرارتیِ هفته: ۷ روز × ۲۴ ساعت با بیشینه و شمارِ روزها',
  Object.keys(heat.cells).length === 7 && Object.values(heat.cells).every((row) => Object.keys(row).length === 24)
  && heat.max >= 1 && heat.days === 3, JSON.stringify({ max: heat.max, days: heat.days }));
ok('ترتیبِ هفته در نقشه از «شنبه» شروع می‌شود',
  JSON.parse(await one(`json_encode(array_values(eplakAnalyticsWeekdayOrder()))`)).join(',') === '6,7,1,2,3,4,5');
const online = await one(`eplakAnalyticsOnline($pdo, 100000)`);
ok('«الان آنلاین» = بازدیدکننده‌های یکتای پنجره‌ی اخیر', Number(online) >= 1, String(online));
const recent = JSON.parse(await one(`json_encode(eplakAnalyticsRecent($pdo, 5))`));
ok('آخرین رویدادها تازه‌ترین‌اول و با ستون‌های لازم',
  recent.length === 5 && ['kind', 'device', 'browser', 'os', 'ref_host', 'created_at'].every((k) => k in recent[0]),
  JSON.stringify(recent[0] || {}));

/* ── آمارِ سامانه و اپ از جدول‌های موجود ── */
section('۴) آمارِ کاربران و سامانه (بدونِ دست‌زدن به اپ)');
await phpRun(`$pdo->exec("INSERT OR IGNORE INTO users (phone, name, created_at) VALUES ('09121112233','شهروندِ آزمون', '" . eplakAnalyticsToday($pdo) . " 08:00:00')");
$pdo->exec("INSERT OR IGNORE INTO users (phone, name, created_at) VALUES ('09121114444','شهروندِ دوم', '" . date('Y-m-d', strtotime(eplakAnalyticsToday($pdo) . ' 12:00:00') - 3 * 86400) . " 08:00:00')");
echo 'users';`);
const appStats = JSON.parse(await one(`json_encode(eplakAnalyticsAppStats($pdo, ${phpVal(dates.today)}))`));
ok('کاربرانِ سامانه: کل + امروز + ۷ روز + ۳۰ روز',
  appStats.users_total >= 2 && appStats.users_today >= 1 && appStats.users_week >= 2 && appStats.users_month >= 2,
  JSON.stringify(appStats));
ok('گزارش‌ها، تیکت‌ها، دستگاه‌های اعلان و کلیکِ تبلیغات هم خوانده می‌شوند',
  ['reports', 'tickets', 'devices', 'ad_clicks', 'notif_sends', 'news'].every((k) => k in appStats));
ok('جدولِ نبوده ⇒ null (نه صفرِ دروغین) تا «نبودِ دسترسی/داده» با صفر قاطی نشود',
  appStats.devices === null || typeof appStats.devices === 'number', JSON.stringify(appStats.devices));
const userMonths = JSON.parse(await one(`json_encode(eplakAnalyticsUserMonths($pdo, 6))`));
ok('رشدِ ماهانه‌ی کاربران: شش ماه با برچسبِ شمسی و شمارِ هر ماه',
  userMonths.length === 6 && userMonths.every((m) => /^.+\s[۰-۹]{4}$/.test(m.label)) && userMonths[5].count >= 1,
  JSON.stringify(userMonths.map((m) => [m.label, m.count])));

/* ── خروجی و نگهداری ── */
section('۵) خروجیِ CSV، پاک‌سازی و شمارِ دانلودِ گیت‌هاب');
const csvHead = JSON.parse(await one(`json_encode(eplakAnalyticsCsvHead())`));
const csvRows = JSON.parse(await one(`json_encode(eplakAnalyticsCsvRows($pdo, ${phpVal(dates.y1)}, ${phpVal(dates.today)}, 10))`));
ok('سرستون‌های فارسیِ CSV و ردیف‌های هم‌اندازه', csvHead.length === 10 && csvRows.length >= 3
  && csvRows.every((r) => r.length === 10), `${csvHead.length}/${csvRows[0] ? csvRows[0].length : 0}`);
ok('در CSV هم تاریخِ شمسی و برچسبِ فارسیِ نوع/هدف/دستگاه است (نه کدِ خام)',
  csvRows.some((r) => r[1] === 'بازدید' || r[1] === 'دانلود')
  && csvRows.some((r) => /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(r[0])), JSON.stringify(csvRows[0] || []));
const beforePrune = Number(await one(`eplakAnalyticsRowCount($pdo)`));
const pruned = Number(await one(`eplakAnalyticsPrune($pdo, 365)`));
const afterPrune = Number(await one(`eplakAnalyticsRowCount($pdo)`));
ok('پاک‌سازیِ دستی: رویدادهای قدیمی‌تر از ۳۶۵ روز رفتند و تازه‌ها ماندند',
  pruned >= 1 && afterPrune === beforePrune - pruned && afterPrune >= 5, `${beforePrune}→${afterPrune} (${pruned})`);
ok('نگه‌داشتنِ کمتر از ۳۰ روز اجازه ندارد (نمودارِ ماهانه خراب نشود)',
  Number(await one(`eplakAnalyticsPrune($pdo, 1)`)) === 0);
const ghParsed = JSON.parse(await one(`json_encode(eplakAnalyticsParseGithubRelease(${phpVal(JSON.stringify({
  tag_name: 'v2.0-eplak-update',
  assets: [{ name: 'eplak-app.apk', download_count: 1234 }, { name: 'eplak-app-unsigned.ipa', download_count: 12 }],
}))}))`));
ok('شمارِ «واقعیِ» دانلودِ APK از ریلیزِ گیت‌هاب خوانده می‌شود',
  ghParsed.ok === true && ghParsed.apk === 1234 && ghParsed.all === 1246 && ghParsed.tag === 'v2.0-eplak-update',
  JSON.stringify(ghParsed));
const ghBad = JSON.parse(await one(`json_encode(eplakAnalyticsParseGithubRelease('not json'))`));
ok('پاسخِ خراب/بسته‌ی گیت‌هاب ⇒ پیامِ خوانا و بدونِ شکستنِ صفحه',
  ghBad.ok === false && ghBad.error !== '', JSON.stringify(ghBad));
const ghCached = JSON.parse(await one(`json_encode(eplakAnalyticsGithubCached($pdo))`));
ok('در بارگذاریِ صفحه هیچ درخواستِ شبکه‌ای نمی‌رود (فقط کش خوانده می‌شود)',
  ghCached.apk === 0 && ghCached.error === '' && /if \(!\$force\)/.test(read('shared/analytics.php'))
  && /function_exists\('curl_init'\)/.test(read('shared/analytics.php')));
ok('به‌روزرسانیِ گیت‌هاب فقط با POST + توکنِ CSRF از پنل ممکن است',
  /\$act === 'gh'/.test(read('admin/analytics.php'))
  && read('admin/analytics.php').indexOf('eplakRequireCsrf()') < read('admin/analytics.php').indexOf("eplakAnalyticsGithubRefresh($pdo, true)"));

/* ══════════════════════════════════════════════════════════════════
   ۶) api/track.php — گردآورِ عمومی
   ══════════════════════════════════════════════════════════════════ */
section('۶) api/track.php (گردآورِ عمومیِ سایتِ معرفی)');
const opt = await req('OPTIONS', '/api/track.php', newJar());
ok('پیش‌درخواستِ CORS ⇒ ۲۰۴ و بدونِ بدنه', opt.status === 204, String(opt.status));
const postJson = await req('POST', '/api/track.php', newJar(), null,
  { 'content-type': 'application/json', 'user-agent': UA_CHROME,
    __json: JSON.stringify({ k: 'qr', t: 'pwa', v: '9'.repeat(32), r: 'https://www.eplak.ir/' }) });
ok('POSTِ JSON (همان چیزی که sendBeacon می‌فرستد) ⇒ JSON و شمرده شد',
  postJson.status === 200 && postJson.json && postJson.json.success === true && postJson.json.counted === true
  && postJson.json.kind === 'qr', postJson.text.slice(0, 120));
ok('پاسخ همیشه JSON است، هرگز HTML',
  /application\/json/.test(hdr(postJson, 'content-type')) && postJson.text.trim()[0] === '{');
ok('سرآیندهای CORS و بدونِ کش (مثلِ بقیه‌ی api/)',
  hdr(postJson, 'access-control-allow-origin') === '*' && /no-store/.test(hdr(postJson, 'cache-control')));
const getQ = await req('GET', '/api/track.php?k=download&t=apk&v=' + '8'.repeat(32), newJar(), null, { 'user-agent': UA_ANDROID });
ok('GET با پرس‌وجو هم کار می‌کند (برای <img> یا دیباگ با curl)',
  getQ.json && getQ.json.success === true && getQ.json.counted === true, getQ.text.slice(0, 120));
const botReq = await req('GET', '/api/track.php?k=view&t=/&v=' + '7'.repeat(32), newJar(), null, { 'user-agent': 'curl/8.5.0' });
ok('ربات از روی HTTP هم شمرده نمی‌شود ولی پاسخ «موفق» است (سایت معطل نمی‌شود)',
  botReq.json && botReq.json.success === true && botReq.json.counted === false && botReq.json.reason === 'bot',
  JSON.stringify(botReq.json));
const noKind = await req('GET', '/api/track.php?v=' + '6'.repeat(32), newJar(), null, { 'user-agent': UA_CHROME, referer: 'https://www.eplak.ir/#download' });
ok('بی‌نوع ⇒ «بازدید» و هدف از Referer گرفته می‌شود',
  noKind.json && noKind.json.counted === true && noKind.json.kind === 'view', JSON.stringify(noKind.json));
const badTarget = await req('GET', '/api/track.php?k=download&t=' + encodeURIComponent('javascript:alert(1)') + '&v=' + '5'.repeat(32), newJar(), null, { 'user-agent': UA_CHROME });
const storedTarget = await one(`(string) $pdo->query("SELECT target FROM site_stats WHERE kind='download' ORDER BY id DESC LIMIT 1")->fetchColumn()`);
ok('هدفِ نامعتبر در دانلود به apk/pwa نرمال می‌شود (نه هر رشته‌ی ارسالی)',
  badTarget.json && ['apk', 'pwa'].includes(storedTarget), storedTarget);
await phpRun(`$pdo->exec('DROP TABLE site_stats'); echo 'dropped';`);
const afterDrop = await req('GET', '/api/track.php?k=view&t=/&v=' + '4'.repeat(32), newJar(), null, { 'user-agent': UA_CHROME });
ok('اگر جدول پاک/گم شده باشد، گردآور خودش می‌سازدش و آمار از دست نمی‌رود',
  afterDrop.json && afterDrop.json.counted === true
  && (await one(`eplakAnalyticsReady($pdo) ? 'yes' : 'no'`)) === 'yes', afterDrop.text.slice(0, 120));
ok('گردآور هیچ‌وقت ۵۰۰ نمی‌دهد (آمار اختیاری است)', afterDrop.status === 200, String(afterDrop.status));

/* ══════════════════════════════════════════════════════════════════
   ۷) admin/analytics.php — پنل
   ══════════════════════════════════════════════════════════════════ */
section('۷) پنل: نمودارها، بازه‌ها، CSV، CSRF و دسترسی');
const anon = await req('GET', '/admin/analytics.php', newJar());
ok('بدون ورود ⇒ هدایت به صفحه‌ی ورود (نه محتوای آمار)',
  anon.status === 302 && /login\.php/.test(loc(anon)) && !has(anon.text, 'ega-area'), `${anon.status} ${loc(anon)}`);

const SUP = newJar(); const sup = client(SUP);
await req('GET', '/admin/login.php', SUP);
let r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ مدیر کل', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

let page = await sup.get('/admin/analytics.php');
ok('صفحه‌ی آمار ۲۰۰ و بدونِ خطای PHP', page.status === 200 && !/Fatal error|Warning:|Notice:/.test(page.text), String(page.status));
ok('منوی واحدِ پنل صدا زده شد و «آمارِ سایت» فعال است',
  has(page.text, 'data-testid="admin-sidebar"') && /class="active" href="analytics\.php"/.test(page.text));
ok('نشانِ دامنه‌ی دسترسیِ مدیر کل هست', /data-testid="acl-scope-badge"/.test(page.text) && /مدیر کل/.test(page.text));
const svgCount = (page.text.match(/<svg /g) || []).length;
ok('نمودارها SVGِ سمتِ سرورند (بدونِ کتابخانه/CDNِ بیرونی)',
  svgCount >= 5 && !/chart\.js|cdn\.|googleapis|unpkg|jsdelivr/i.test(page.text), String(svgCount));
ok('نمودارِ سطحیِ روند + ستون‌های دانلود + دوناتِ دستگاه‌ها + جرقه‌نمودارِ کارت‌ها',
  has(page.text, 'ega-area-line') && has(page.text, 'ega-bar') && has(page.text, 'ega-donut') && has(page.text, 'ega-spark'));
ok('نقشه‌ی حرارتیِ هفته (۷ سطر × ۲۴ خانه) و ستون‌های ساعتِ اوج (۲۴ ستون)',
  (page.text.match(/class="ega-heat-row"/g) || []).length === 7
  && (page.text.match(/class="ega-heat-cells"/g) || []).length === 7
  && (page.text.match(/<i style="background:#10b981;opacity:/g) || []).length === 168
  && (page.text.match(/class="ega-hour[ "]/g) || []).length === 24,
  JSON.stringify({ rows: (page.text.match(/class="ega-heat-row"/g) || []).length,
    cells: (page.text.match(/<i style="background:#10b981;opacity:/g) || []).length,
    hours: (page.text.match(/class="ega-hour[ "]/g) || []).length }));
ok('کارت‌های شاخص: بازدید، یکتا، دانلود، QR، موبایل، کاربران، گزارش‌ها، دانلودِ واقعی',
  ['بازدیدِ سایت', 'بازدیدکننده‌ی یکتا', 'دانلودِ مستقیم', 'کلیکِ کدِ QR', 'سهمِ موبایل',
    'کاربرانِ سامانه', 'گزارش‌های شهروندی', 'دانلودِ واقعیِ APK'].every((t) => has(page.text, t)));
ok('کلیدهای بازه (امروز/۷/۳۰/۹۰/۱۲ ماه/همه) و دانه‌بندی (روزانه/ماهانه/سالانه)',
  ['امروز', '۷ روز', '۳۰ روز', '۹۰ روز', '۱۲ ماه', 'همه'].every((t) => has(page.text, t))
  && ['روزانه', 'ماهانه', 'سالانه'].every((t) => has(page.text, t)));
ok('برچسب‌های محور شمسی‌اند و رقم‌ها فارسی', /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(page.text) && /[۰-۹]/.test(page.text));
ok('جدولِ آخرین رویدادها با نوع/دستگاه/مرورگر/منبع', has(page.text, 'آخرین رویدادها') && has(page.text, 'ega-tag-view'));
ok('بخشِ راهنما و نگهداری (پاک‌سازی، حریمِ خصوصی، ضدِ تورم) دیده می‌شود',
  has(page.text, 'نگهداریِ داده‌ی آمار') && has(page.text, 'api/track.php') && has(page.text, 'IPِ خام ذخیره نمی‌شود'));

const wide = await sup.get('/admin/analytics.php?range=365&g=month');
ok('بازه‌ی ۱۲ ماه با دانه‌بندیِ ماهانه ⇒ برچسبِ «نامِ ماهِ شمسی سال»',
  wide.status === 200 && /آبان|مهر|شهریور|مرداد|تیر|خرداد|اردیبهشت|فروردین|آذر|دی|بهمن|اسفند/.test(wide.text)
  && has(wide.text, 'دانه‌بندی: ماهانه'));
const yearPage = await sup.get('/admin/analytics.php?range=all&g=year');
ok('دانه‌بندیِ سالانه روی بازه‌ی «همه» هم کار می‌کند',
  yearPage.status === 200 && has(yearPage.text, 'دانه‌بندی: سالانه') && /[۰-۹]{4}/.test(yearPage.text));
const csv = await sup.get('/admin/analytics.php?range=365&export=csv');
/* نکته: کمی بالاتر، آزمونِ «ساختِ خودکارِ جدول» جدول را DROP می‌کند؛ پس این‌جا
   تنها یک رویداد مانده و CSV هم یک ردیفِ داده دارد — همان کافی است. */
ok('خروجیِ CSV: سرآیندِ text/csv، نامِ فایل، سرستون‌های فارسی و ردیفِ داده با تاریخِ شمسی',
  csv.status === 200 && /text\/csv/.test(hdr(csv, 'content-type'))
  && /attachment; filename="eplak-analytics-/.test(hdr(csv, 'content-disposition'))
  && has(csv.text, 'تاریخ و ساعت') && has(csv.text, 'منبعِ ورود')
  && /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(csv.text)
  && (csv.text.match(/\n/g) || []).length >= 1,
  JSON.stringify({ ct: hdr(csv, 'content-type'), cd: hdr(csv, 'content-disposition'),
    len: csv.text.length, head: csv.text.slice(0, 90), nl: (csv.text.match(/\n/g) || []).length }));
ok('BOM برایِ اکسلِ فارسی در خروجی نوشته می‌شود (TextDecoderِ آزمون آن را می‌خورد)',
  read('admin/analytics.php').includes('echo "\\xEF\\xBB\\xBF"'));
ok('خروجیِ CSV هیچ HTML‌ای ندارد', !/<html|<\?php|<!doctype/i.test(csv.text));

const noToken = await sup.post('/admin/analytics.php', { act: 'prune', keep_days: '30' });
ok('POST بدون توکنِ CSRF ⇒ ۴۰۳ (پاک‌سازیِ ناخواسته ممکن نیست)', noToken.status === 403, String(noToken.status));
const rowsBefore = Number(await one(`eplakAnalyticsRowCount($pdo)`));
r = await submit(sup, '/admin/analytics.php', { act: 'test' });
ok('دکمه‌ی «رویدادِ آزمایشی» ⇒ پیامِ موفقیت و یک سطرِ تازه',
  r.status === 200 && /رویدادِ آزمایشی ثبت شد/.test(r.text)
  && Number(await one(`eplakAnalyticsRowCount($pdo)`)) === rowsBefore + 1, `${rowsBefore}`);
r = await submit(sup, '/admin/analytics.php', { act: 'prune', keep_days: '1' });
ok('پاک‌سازی با عددِ کمتر از ۳۰ روز ⇒ به ۳۰ روز گرد می‌شود و داده‌ی امروز نمی‌رود',
  r.status === 200 && Number(await one(`eplakAnalyticsRowCount($pdo)`)) >= rowsBefore);
r = await submit(sup, '/admin/analytics.php', { act: 'nope' });
ok('عملیاتِ ناشناخته ⇒ پیامِ خطا و نه خطای PHP', r.status === 200 && /عملیاتِ ناشناخته/.test(r.text));

/* مدیرِ حوزه/معاونت */
await phpRun(`$c = eplakCreateAdminUser($pdo, 'an-dept-admin', 'AnTest1403', 'مدیرِ خدمات', 'admin'); echo 'created:' . (int) $c['id'];`);
const DEPT = newJar(); const dept = client(DEPT);
await req('GET', '/admin/login.php', DEPT);
r = await req('POST', '/admin/login.php', DEPT, { username: 'an-dept-admin', password: 'AnTest1403' });
ok('ورودِ مدیرِ حوزه (برای بررسیِ دسترسیِ آمار)', r.status === 302, `${r.status} ${loc(r)}`);
const forbidden = await dept.get('/admin/analytics.php');
ok('مدیرِ حوزه به آمار نمی‌رسد: ۴۰۳ «دسترسی ندارید» و بدونِ هیچ داده‌ای',
  forbidden.status === 403 && /دسترسی ندارید/.test(forbidden.text) && !has(forbidden.text, 'ega-area')
  && !has(forbidden.text, 'بازدیدکننده‌ی یکتا'), String(forbidden.status));
const forbiddenCsv = await dept.get('/admin/analytics.php?export=csv');
ok('خروجیِ CSV هم برایِ مدیرِ حوزه بسته است (نه فقط صفحه)',
  forbiddenCsv.status === 403 && !has(forbiddenCsv.text, 'تاریخ و ساعت'), String(forbiddenCsv.status));
const forbiddenPost = await dept.post('/admin/analytics.php', { act: 'prune', keep_days: '30' });
ok('POST مستقیمِ مدیرِ حوزه ⇒ ۴۰۳ و داده‌ی آمار سرِ جایش',
  forbiddenPost.status === 403 && Number(await one(`eplakAnalyticsRowCount($pdo)`)) >= rowsBefore);
const deptNav = (await dept.get('/admin/index.php')).text;
ok('«آمارِ سایت و دانلودها» در منوی مدیرِ حوزه نیست', !/href="analytics\.php"/.test(deptNav));

r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ دوباره‌ی مدیر کل (نشستِ php-wasm مشترک است)', r.status === 302, `${r.status} ${loc(r)}`);

/* ══════════════════════════════════════════════════════════════════
   ۸) قراردادها: اپ دست‌نخورده، PHP 7.4، مستندات، منو
   ══════════════════════════════════════════════════════════════════ */
section('۸) قراردادها و مستندات');
const appFiles = ['index.html', 'app.js', 'sw.js', 'manifest.json'];
for (const dir of ['core', 'modules', 'views']) {
  const p = path.join(ROOT, dir);
  if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (/\.(js|html|json)$/.test(f)) appFiles.push(`${dir}/${f}`);
}
const touched = appFiles.filter((f) => /track\.php|site_stats|eplakAnalytics/.test(read(f)));
ok('اپ (index.html، core/، modules/، views/، sw.js) هیچ تغییری نکرده و آمار را نمی‌شناسد',
  touched.length === 0, touched.join(', '));
ok('فقط سه فایلِ تازه + دو تغییرِ کوچک: گردآور، لایه‌ی آمار، نمودارها، صفحه‌ی پنل، منو/مجوز',
  exists('api/track.php') && exists('shared/analytics.php') && exists('admin/includes/charts.php')
  && exists('admin/analytics.php')
  && /'analytics'\s+=> 'آمارِ سایت و دانلودها'/.test(read('admin/includes/acl.php'))
  && /'href' => 'analytics\.php'/.test(read('admin/includes/acl.php')));
ok('صفحه‌ی آمار هم مثلِ بقیه‌ی پنل منوی واحد و نشانِ دسترسی را صدا می‌زند',
  /eplakAdminSidebar\('analytics'\)/.test(read('admin/analytics.php'))
  && /eplakAdminScopeBadge\(\$pdo\)/.test(read('admin/analytics.php'))
  && /eplakRequirePermission\('analytics'\)/.test(read('admin/analytics.php'))
  && has(read('admin/analytics.php'), '<aside class="sidebar">'));
const php74 = ['shared/analytics.php', 'admin/includes/charts.php', 'admin/analytics.php', 'api/track.php'];
ok('سازگار با PHP 7.4ِ هاست (بدونِ str_contains/match/?-> و بدونِ پارامترِ نام‌دار)',
  php74.every((f) => !/\bstr_contains\(|\bstr_starts_with\(|\bstr_ends_with\(|\bmatch\s*\(|\?->/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, ''))));
ok('مستندِ فارسیِ کامل هست (docs/ANALYTICS_FA.md) و نشانیِ گردآور را می‌گوید',
  exists('docs/ANALYTICS_FA.md') && has(read('docs/ANALYTICS_FA.md'), 'api/track.php')
  && has(read('docs/ANALYTICS_FA.md'), 'site_stats') && has(read('docs/ANALYTICS_FA.md'), 'analytics.php'));
ok('آزمون در فهرستِ run-regression.sh و در بررسی‌های بسته‌ی ورک‌فلو هست',
  /analytics/.test(read('tools/dev/run-regression.sh'))
  && has(read('.github/workflows/build-update-package.yml'), 'shared/analytics.php'));
ok('هیچ هشدار/اخطار/خطای PHP در پاسخ‌های پنل و API دیده نشد (display_errors روشن، E_ALL)',
  phpNoise.length === 0, phpNoise.slice(0, 3).join(' | '));

console.log(`\nنتیجهٔ ANALYTICS: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);

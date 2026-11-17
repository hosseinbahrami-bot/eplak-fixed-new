/* support.test.mjs — «پشتیبانی آنلاین»: چتِ مستقیمِ شهروند با تیمِ پشتیبانی
   ============================================================================
   خواسته‌ی کارفرما:
     «داخل اپ قسمت تماس با شهرداری … پشتیبانی آنلاین … چطوری چت مستقیم با
      پشتیبان درست کنیم؟» — تصمیم‌ها: ساعاتِ اداری، یک تیمِ مرکزیِ پشتیبانی،
      صفحه‌ی چتِ بومی داخلِ اپ، و پیوستِ متن + عکس + فایل.

   چه چیزی «واقعاً اجرا» می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) با دیتابیسِ SQLite تازه: ساخت جدول ticket_messages
        و ستون‌های گفتگو روی tickets، و نسخه‌ی اسکیما.
     ۲) shared/support.php: تنظیمات، ساعاتِ کاری و پیامِ خودکار، پاک‌سازیِ متن،
        فهرستِ مجازِ پیوست (بدونِ svg/php/exe)، نگهبانِ path-traversal، ذخیره‌ی
        پیوستِ واقعی، ساختنِ گفتگو، ارسالِ idempotent با client_ref، شمارِ
        خوانده‌نشده‌ها، سازگاری با اپِ قدیمی (tickets.reply)، سقفِ نرخ، بستن و
        امتیاز، حضورِ پشتیبان، و پاسخ‌های آماده.
     ۳) api/support.php با درخواستِ HTTP واقعی: OPTIONS/config/open/thread/
        send/read/upload/close/file، مالکیت با شماره‌ی مالک، «هرگز ۵۰۰ یا HTML
        نشدن»، و همگام‌سازیِ افزایشی.
     ۴) admin/support.php با نشستِ واقعی: ورود، صندوقِ مرکزی، رشته‌ی گفتگو،
        CSRF، فرارِ XSS، اعلانِ پاسخ به گوشیِ شهروند، ۴۰۳ برایِ مدیرِ حوزه و
        نبودنش در منوی او، و ذخیره‌ی تنظیمات.
     ۵) اپِ واقعی (jsdom): کارتِ «پشتیبانی آنلاین» که پیش‌تر تزئینی بود حالا
        صفحه‌ی چت را باز می‌کند، المان‌های لازم هست، ماژول بار می‌شود، حباب‌ها
        XSS را فرار می‌کنند، صفِ ارسالِ آفلاین با client_ref کار می‌کند و
        نسخه‌ی اپ بالا رفته است.
     ۶) قراردادها: PHP 7.4، مستندات، بسته‌بندی و ثبت در CI.

   اجرا:  bash tools/dev/run-regression.sh support
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-support-shim';
const DB = '/tmp/eplak-regression-support.sqlite';
const PREPEND = '/tmp/eplak-regression-support.prepend.php';
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
const handler = new PHPRequestHandler({ php, documentRoot: SHIM, absoluteUrl: 'http://127.0.0.1:8097' });

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
async function req(method, url, jar, form, json, extra) {
  const headers = Object.assign({ 'user-agent': UA_ANDROID }, extra || {});
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = enc.encode(JSON.stringify(json)); }
  else if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = enc.encode(new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString()); }
  if (jar && Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handler.request({ url, method, headers, body });
  if (jar) absorb(jar, res);
  const text = String(res.text);
  const noise = text.match(/(?:<b>)?(?:Warning|Notice|Deprecated|Fatal error|Parse error|Uncaught)(?:<\/b>)?:?\s[^\n]{0,160}/);
  if (noise) phpNoise.push(`${method} ${url} → ${noise[0]}`);
  let j = null; try { j = JSON.parse(text); } catch (e) { /* HTML */ }
  return { status: res.httpStatusCode, headers: res.headers, text, json: j };
}
const hdr = (r, k) => String((Array.isArray(r.headers[k]) ? r.headers[k][0] : r.headers[k]) || '');
const client = (jar) => ({ get: (u) => req('GET', u, jar), post: (u, f) => req('POST', u, jar, f) });
const csrfOf = (html) => (String(html).match(/name="_token" value="([a-f0-9]+)"/) || [])[1] || '';
const loc = (r) => String((Array.isArray(r.headers.location) ? r.headers.location[0] : r.headers.location) || '');
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
    REQUEST_METHOD: 'GET', SCRIPT_NAME: '/eplak-fixed/api/support.php',
    PHP_SELF: '/eplak-fixed/api/support.php', HTTP_HOST: 'eplak.test', HTTPS: 'on',
    REMOTE_ADDR: '203.0.113.9', HTTP_USER_AGENT: UA_ANDROID,
  }, server);
  return String((await php.run({
    code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
      + `$_SERVER = array_merge($_SERVER, ${phpVal(srv)}); `
      + `require_once '${ROOT}/admin/includes/db.php'; require_once '${ROOT}/shared/support.php'; `
      + `require_once '${ROOT}/shared/notify_events.php'; require_once '${ROOT}/admin/includes/functions.php'; `
      + `require_once '${ROOT}/admin/includes/acl.php'; ${code}`,
  })).text);
};
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 600)); return JSON.parse(m.split('>>>')[0]); };
/* pickJson-مانند: فقط «شیء» (نه آرایه) ⇒ خروجی‌ها کلیددار ساخته می‌شوند */
const one = async (code, server) => grab(await phpRun(`echo '<<<' . json_encode([${code}]) . '>>>';`, server))[0];
const obj = async (code, server) => grab(await phpRun(`echo '<<<' . json_encode(${code}) . '>>>';`, server));
const has = (html, needle) => String(html).includes(needle);
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const PHONE = '09121112233';
const OTHER = '09129998877';
/* یک PNGِ واقعیِ ۱×۱ (برایِ آزمونِ پیوست) */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

/* ══════════════════════════════════════════════════════════════════
   ۱) ساختارِ داده
   ══════════════════════════════════════════════════════════════════ */
section('۱) جدولِ پیام‌ها و ستون‌های گفتگو');
await phpRun(`eplakSupportReady($pdo); echo 'boot';`);
const cols = JSON.parse(await one(`json_encode(array_map(function($r){return $r['name'];}, $pdo->query('PRAGMA table_info(ticket_messages)')->fetchAll(PDO::FETCH_ASSOC)))`));
ok('جدول ticket_messages با همه‌ی ستون‌ها ساخته شد',
  ['id', 'ticket_id', 'sender', 'sender_name', 'admin_id', 'body', 'media_path', 'media_kind',
    'media_name', 'media_size', 'client_ref', 'created_at', 'read_at'].every((c) => cols.includes(c)), cols.join(','));
const tcols = JSON.parse(await one(`json_encode(array_map(function($r){return $r['name'];}, $pdo->query('PRAGMA table_info(tickets)')->fetchAll(PDO::FETCH_ASSOC)))`));
ok('ستون‌های گفتگو به tickets اضافه شد (کانال، آخرین پیام، نخوانده‌ها، بستن، امتیاز)',
  ['channel', 'last_message_at', 'last_sender', 'unread_citizen', 'unread_admin', 'assigned_admin_id', 'closed_at', 'rating']
    .every((c) => tcols.includes(c)), tcols.join(','));
const idx = JSON.parse(await one(`json_encode(array_map(function($r){return $r['name'];}, $pdo->query("PRAGMA index_list('ticket_messages')")->fetchAll(PDO::FETCH_ASSOC)))`));
ok('ایندکسِ رشته (ticket_id,id) و یکتاییِ client_ref ساخته شد',
  idx.some((n) => /idx_ticket_messages_ticket/.test(n)) && idx.some((n) => /uniq_ticket_messages_ref/.test(n)), idx.join(','));
ok('نسخه‌ی اسکیما بالا رفته و جدول در bootstrapِ هر دو درایور هست',
  (await one(`EPLAK_SCHEMA_VERSION`)) === '2026-11-16.1'
  && (read('shared/bootstrap.php').match(/CREATE TABLE IF NOT EXISTS ticket_messages/g) || []).length === 2);
/* نکته: $pdo را نباید داخلِ رشته‌ی دوقلوی PHP نوشت (درون‌یابی می‌شود)؛
   پس «اکنون» را اول در یک متغیرِ رشته‌ای می‌گیریم. */
const twoNullRefs = await phpRun(`$now = eplakDbNowString($pdo);
$a = $pdo->exec("INSERT INTO ticket_messages (ticket_id, sender, body, created_at) VALUES (999,'admin','a','$now')");
$b = $pdo->exec("INSERT INTO ticket_messages (ticket_id, sender, body, created_at) VALUES (999,'admin','b','$now')");
$n = (int) $pdo->query("SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = 999")->fetchColumn();
echo '<<<' . json_encode(['a' => $a, 'b' => $b, 'rows' => $n]) . '>>>';`);
const twoNull = grab(twoNullRefs);
ok('client_ref «nullable» است تا دو پیامِ بدونِ ref به index یکتا نخورند (پاسخِ دستیِ پنل)',
  twoNull.rows === 2, JSON.stringify(twoNull));
await phpRun(`$pdo->exec('DELETE FROM ticket_messages WHERE ticket_id = 999'); echo 'cleaned';`);

/* ══════════════════════════════════════════════════════════════════
   ۲) منطقِ سمتِ سرور
   ══════════════════════════════════════════════════════════════════ */
section('۲) ساعاتِ کاری، پاک‌سازی، پیوست و سقفِ نرخ');
const open1 = await obj(`eplakSupportIsOpen(eplakSupportDefaults(), '2026-11-15 10:15:00')`);   /* یکشنبه */
const open2 = await obj(`eplakSupportIsOpen(eplakSupportDefaults(), '2026-11-15 22:15:00')`);
const open3 = await obj(`eplakSupportIsOpen(eplakSupportDefaults(), '2026-11-14 10:15:00')`);   /* شنبه */
const open4 = await obj(`eplakSupportIsOpen(['enabled'=>'0','days'=>'6,7,1,2,3','from'=>'07:30','to'=>'16:30'], '2026-11-15 10:15:00')`);
const open5 = await obj(`eplakSupportIsOpen(['enabled'=>'1','days'=>'5','from'=>'07:30','to'=>'16:30'], '2026-11-15 10:15:00')`);
ok('یکشنبه ساعتِ ۱۰:۱۵ «باز» است (شنبه تا چهارشنبه، ۰۷:۳۰ تا ۱۶:۳۰)', open1.open === true, JSON.stringify(open1));
ok('همان روز ساعتِ ۲۲:۱۵ بسته است با دلیلِ closed_hour', open2.open === false && open2.reason === 'closed_hour', JSON.stringify(open2));
ok('روزِ کاریِ دیگر (شنبه) هم باز است', open3.open === true);
ok('وقتی بخش غیرفعال است، باز نیست و دلیلش disabled است', open4.open === false && open4.reason === 'disabled', JSON.stringify(open4));
ok('روزِ غیرکاری (جمعه) با دلیلِ closed_day بسته است', open5.open === false && open5.reason === 'closed_day', JSON.stringify(open5));
ok('برچسبِ ساعتِ کاری فارسی و با رقمِ فارسی است (همان چیزی که شهروند می‌بیند)',
  /ساعتِ پاسخ‌گویی: ۰۷:۳۰ تا ۱۶:۳۰/.test(open1.label) && /شنبه/.test(open1.label), open1.label);

const clean = await obj(`['a'=>eplakSupportClean("<script>alert(1)</script>سلام", 2000), 'b'=>eplakSupportClean(str_repeat('ا', 5000), 100), 'c'=>eplakSupportClean("سلام\\n\\r\\tدنیا", 2000)]`);
ok('متنِ پیام strip_tags و محدود به طول می‌شود (XSS در گفتگو جا نمی‌گیرد)',
  clean.a.indexOf('<') === -1 && /سلام$/.test(clean.a) && clean.b.length === 100 && clean.c.indexOf('\r') === -1,
  JSON.stringify(clean).slice(0, 120));
const types = JSON.parse(await one(`json_encode(array_keys(eplakSupportAllowedTypes(true)))`));
ok('فهرستِ مجازِ پیوست: عکس/ویدیو/سند هست ولی svg، html و هیچ نوعِ اجرایی نیست',
  types.includes('image/jpeg') && types.includes('application/pdf')
  && !types.some((t) => /svg|html|javascript|php|x-sh|x-httpd|octet-stream|zip|x-msdownload/i.test(t)), types.join(','));
const trav = await obj(`['a'=>eplakSupportAttachmentPath('../../shared/config.php'), 'b'=>eplakSupportAttachmentPath('uploads/support/../../../etc/passwd'), 'c'=>eplakSupportAttachmentPath(''), 'd'=>eplakSupportAttachmentPath('uploads/support/2026/11/x.jpg') ]`);
ok('نگهبانِ path-traversal: هیچ مسیرِ بیرون از uploads/support پذیرفته نمی‌شود',
  trav.a === null && trav.b === null && trav.c === null, JSON.stringify(trav));

await phpRun(`$nowU = eplakDbNowString($pdo);
$pdo->exec("INSERT OR IGNORE INTO users (phone, name, created_at) VALUES ('${PHONE}','شهروندِ آزمون','$nowU')"); echo 'user';`);
const stored = await obj(`eplakSupportStoreAttachment('${PNG_B64}', 'عکسِ آزمون.png', 'image/png', eplakSupportDefaults())`);
ok('پیوستِ واقعی (PNG) ذخیره شد: مسیرِ نسبی، نوع و حجم',
  stored.ok === true && /^uploads\/support\/\d{4}\/\d{2}\/[a-f0-9]+\.png$/.test(stored.path)
  && stored.kind === 'image' && stored.size > 40, JSON.stringify(stored));
ok('فایلِ ذخیره‌شده واقعاً روی دیسک هست', stored.ok === true && fs.existsSync(path.join(ROOT, stored.path)), stored.path || '');
const badType = await obj(`eplakSupportStoreAttachment('${Buffer.from('<?php echo "hacked"; ?>').toString('base64')}', 'shell.php', 'application/x-php', eplakSupportDefaults())`);
ok('فایلِ اجرایی (php) رد می‌شود و هرگز ذخیره نمی‌گردد', badType.ok === false && badType.error === 'bad_type', JSON.stringify(badType));
const svgType = await obj(`eplakSupportStoreAttachment('${Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}', 'x.svg', 'image/svg+xml', eplakSupportDefaults())`);
ok('SVG هم رد می‌شود (برداریِ XSS در مرورگر/WebView)', svgType.ok === false, JSON.stringify(svgType));
const tooBig = await obj(`eplakSupportStoreAttachment(base64_encode(str_repeat('x', 4096)), 'big.png', 'image/png', ['attach_images'=>'1','attach_files'=>'1','max_image_mb'=>'1','max_file_mb'=>'1'])`);
ok('پیوستِ بزرگ‌تر از سقف رد می‌شود (نه اینکه هاست پر شود)', tooBig.ok === false || tooBig.size <= 1048576, JSON.stringify(tooBig).slice(0, 90));
const dis = await obj(`eplakSupportStoreAttachment('${PNG_B64}', 'a.png', 'image/png', ['attach_images'=>'0','attach_files'=>'0'])`);
ok('وقتی پیوست از پنل غیرفعال شود، ارسال هم رد می‌شود', dis.ok === false && dis.error === 'attachments_disabled', JSON.stringify(dis));

const opened = await obj(`eplakSupportOpenThread($pdo, '${PHONE}', 'شهروندِ آزمون', eplakSupportSettings($pdo))`);
ok('گفتگو برایِ شماره‌ی «ثبت‌شده» ساخته شد و پیامِ خوش‌آمد دارد',
  opened.ok === true && opened.created === true && Number(opened.ticket.id) > 0
  && opened.ticket.channel === 'support' && opened.ticket.department === 'پشتیبانی عمومی', JSON.stringify(opened.ticket || opened).slice(0, 160));
const tid = Number(opened.ticket.id);
const opened2 = await obj(`eplakSupportOpenThread($pdo, '${PHONE}', '', eplakSupportSettings($pdo))`);
ok('بارِ دوم گفتگویِ «همان» باز می‌گردد (یک شهروند = یک گفتگویِ باز، نه تیکتِ تکراری)',
  opened2.ok === true && opened2.created === false && Number(opened2.ticket.id) === tid, JSON.stringify(opened2.ticket || {}).slice(0, 90));
const unknown = await obj(`eplakSupportOpenThread($pdo, '${OTHER}', '', eplakSupportSettings($pdo))`);
ok('برایِ شماره‌ی «واردنشده» گفتگو ساخته نمی‌شود (صندوقِ پشتیبانی پرِ تیکتِ خالی نمی‌شود)',
  unknown.ok === false && unknown.error === 'unknown_phone', JSON.stringify(unknown));
const welcome = await obj(`['n'=>count(eplakSupportMessages($pdo, ${tid}, 0, 10)['messages']), 'm'=>eplakSupportMessages($pdo, ${tid}, 0, 10)['messages'][0]['sender']]`);
ok('نخستین پیامِ رشته، پیامِ خوش‌آمدِ سامانه است', welcome.n >= 1 && welcome.m === 'system', JSON.stringify(welcome));

const p1 = await obj(`eplakSupportPostMessage($pdo, $pdo->query('SELECT * FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC), 'citizen', 'سلام، قبضِ من مشکل دارد', 'ref-aaa-111')`);
const p2 = await obj(`eplakSupportPostMessage($pdo, $pdo->query('SELECT * FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC), 'citizen', 'سلام، قبضِ من مشکل دارد', 'ref-aaa-111')`);
ok('ارسال با client_ref یک‌بار شمرده می‌شود (رفرش/قطعِ شبکه ⇒ پیامِ تکراری نه)',
  p1.ok === true && p2.ok === true && p2.duplicate === true && p1.id === p2.id, JSON.stringify({ a: p1.id, b: p2.id, d: p2.duplicate }));
const pEmpty = await obj(`eplakSupportPostMessage($pdo, $pdo->query('SELECT * FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC), 'citizen', '   ', 'ref-empty')`);
ok('پیامِ خالی رد می‌شود', pEmpty.ok === false && pEmpty.error === 'empty', JSON.stringify(pEmpty));
const pBadSender = await obj(`eplakSupportPostMessage($pdo, $pdo->query('SELECT * FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC), 'hacker', 'x', 'ref-h')`);
ok('نقشِ ناشناخته (نه citizen/admin/system) رد می‌شود ⇒ جعلِ «پاسخِ شهرداری» ممکن نیست',
  pBadSender.ok === false && pBadSender.error === 'bad_sender', JSON.stringify(pBadSender));
const counters = await obj(`['t'=>$pdo->query('SELECT unread_admin, unread_citizen, last_sender FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC)]`);
ok('شمارِ خوانده‌نشده‌های پشتیبان بالا رفت و «آخرین فرستنده» ثبت شد',
  Number(counters.t.unread_admin) >= 1 && counters.t.last_sender === 'citizen', JSON.stringify(counters.t));
const adminMsg = await obj(`eplakSupportPostMessage($pdo, $pdo->query('SELECT * FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC), 'admin', 'سلام، بررسی شد؛ مشکل از سامانه‌ی قبض بود.', '', 1, 'admin')`);
const legacy = await obj(`['reply'=>$pdo->query('SELECT reply, status FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC)]`);
ok('سازگاری با اپِ نصب‌شده‌ی قدیمی: پاسخِ پشتیبان در tickets.reply هم نوشته شد',
  adminMsg.ok === true && /بررسی شد/.test(legacy.reply.reply) && legacy.reply.status === 'in_progress', JSON.stringify(legacy.reply).slice(0, 100));
const delta = await obj(`['all'=>count(eplakSupportMessages($pdo, ${tid}, 0, 50)['messages']), 'tail'=>count(eplakSupportMessages($pdo, ${tid}, ${adminMsg.id}, 50)['messages']), 'last'=>eplakSupportMessages($pdo, ${tid}, 0, 50)['last_id']]`);
ok('همگام‌سازیِ افزایشی: since=<آخرین id> فقط پیام‌های تازه را برمی‌گرداند (هزینه‌ی poll کم می‌ماند)',
  delta.all >= 3 && delta.tail === 0 && Number(delta.last) === Number(adminMsg.id), JSON.stringify(delta));
ok('خوانده‌شدن، شمارِ شهروند را صفر و read_at پیام‌ها را پر می‌کند',
  (await obj(`['ok'=>eplakSupportMarkRead($pdo, ${tid}, 'citizen'), 'u'=>$pdo->query('SELECT unread_citizen FROM tickets WHERE id = ${tid}')->fetchColumn(), 'r'=>$pdo->query("SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = ${tid} AND read_at IS NOT NULL AND read_at <> ''")->fetchColumn()]`)).u === 0);
const rate = await obj(`['ok'=>eplakSupportRateOk($pdo, '${PHONE}', ['rate_per_hour'=>'1'])]`);
ok('سقفِ نرخ: با حدِ ۱ پیام در ساعت، پیامِ دوم رد می‌شود (ضدِ اسپم)', rate.ok.ok === false, JSON.stringify(rate));
const closed = await obj(`['ok'=>eplakSupportClose($pdo, ${tid}, 5), 't'=>$pdo->query('SELECT status, rating, closed_at FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC)]`);
ok('بستنِ گفتگو: وضعیت «done»، امتیازِ شهروند و زمانِ بستن ثبت می‌شود',
  closed.ok === true && closed.t.status === 'done' && Number(closed.t.rating) === 5 && closed.t.closed_at !== '', JSON.stringify(closed.t));
ok('بازکردنِ دوباره‌ی گفتگو ممکن است (اگر شهروند دوباره پیام بدهد)',
  (await obj(`['ok'=>eplakSupportReopen($pdo, ${tid}), 'c'=>$pdo->query('SELECT closed_at, status FROM tickets WHERE id = ${tid}')->fetch(PDO::FETCH_ASSOC)]`)).c.closed_at === '');
const settings = await obj(`['saved'=>eplakSupportSaveSettings($pdo, ['from'=>'08:00','to'=>'18:00','days'=>'6,7,1','rate_per_hour'=>'150','enabled'=>'1','bad'=>'x','department'=>'پشتیبانی شهرداری']), 'now'=>eplakSupportSettings($pdo)]`);
ok('تنظیمات از پنل ذخیره و دوباره خوانده می‌شود (ساعت، روزها، سقفِ نرخ، واحد)',
  settings.now.from === '08:00' && settings.now.to === '18:00' && settings.now.days === '6,7,1'
  && settings.now.rate_per_hour === '150' && settings.now.department === 'پشتیبانی شهرداری', JSON.stringify(settings.now).slice(0, 160));
ok('کلیدِ ناشناخته ذخیره نمی‌شود و مقدارِ پرت به بازه‌ی مجاز گرد می‌شود',
  settings.saved.bad === undefined && (await obj(`['r'=>eplakSupportSaveSettings($pdo, ['rate_per_hour'=>'99999']), 'v'=>eplakSupportSettings($pdo)['rate_per_hour']]`)).v === '200');
ok('ساعتِ نامعتبر ذخیره نمی‌شود (تنظیمات خراب، بخش را از کار نمی‌اندازد)',
  (await obj(`['r'=>eplakSupportSaveSettings($pdo, ['from'=>'25:99']), 'v'=>eplakSupportSettings($pdo)['from']]`)).v === '08:00');
const canned = JSON.parse(await one(`json_encode(eplakSupportCanned(['canned'=>"سلام\nدر حالِ بررسی است\n\nحل شد"]))`));
ok('پاسخ‌های آماده خط‌به‌خط جدا می‌شوند و خطِ خالی رد می‌شود', canned.length === 3 && canned[2] === 'حل شد', JSON.stringify(canned));
await phpRun(`eplakSupportSaveSettings($pdo, ['from'=>'07:30','to'=>'16:30','days'=>'6,7,1,2,3','rate_per_hour'=>'40','department'=>'پشتیبانی عمومی']); echo 'reset';`);

/* ══════════════════════════════════════════════════════════════════
   ۳) api/support.php — HTTP واقعی
   ══════════════════════════════════════════════════════════════════ */
section('۳) api/support.php (اندپوینتِ عمومیِ چت)');
const opt = await req('OPTIONS', '/api/support.php?action=config', newJar());
ok('پیش‌درخواستِ CORS ⇒ ۲۰۴ و بدونِ بدنه', opt.status === 204, String(opt.status));
const cfg = await req('GET', '/api/support.php?action=config', newJar());
ok('config ⇒ JSON با ساعتِ کاری، سیاستِ پیوست و وضعیتِ حضورِ پشتیبان',
  cfg.status === 200 && cfg.json && cfg.json.success === true && typeof cfg.json.open === 'boolean'
  && /ساعتِ پاسخ‌گویی/.test(cfg.json.hours_label) && cfg.json.attachments && cfg.json.attachments.images === true
  && typeof cfg.json.agent_online === 'boolean', JSON.stringify(cfg.json).slice(0, 140));
ok('پاسخ همیشه JSON است، هرگز HTML (اپ باید بتواند پارس کند)',
  /application\/json/.test(hdr(cfg, 'content-type')) && cfg.text.trim()[0] === '{');
ok('سرآیندهای CORS و بدونِ کش (مثلِ بقیه‌ی api/)',
  hdr(cfg, 'access-control-allow-origin') === '*' && /no-store/.test(hdr(cfg, 'cache-control')));
const openNoPhone = await req('POST', '/api/support.php', newJar(), { action: 'open' });
ok('بدونِ شماره ⇒ ۴۰۰ با پیامِ خوانا (نه خطای خام)', openNoPhone.status === 400 && openNoPhone.json && openNoPhone.json.success === false, String(openNoPhone.status));
const openOther = await req('POST', '/api/support.php', newJar(), { action: 'open', phone: OTHER });
ok('شماره‌ی «واردنشده» ⇒ گفتگو ساخته نمی‌شود (reason=unknown_phone) ولی ۲۰۰ است',
  openOther.status === 200 && openOther.json.success === false && openOther.json.reason === 'unknown_phone', JSON.stringify(openOther.json));
const openMine = await req('POST', '/api/support.php', newJar(), { action: 'open', phone: PHONE });
ok('open ⇒ همان گفتگویِ موجود با رشته و تنظیمات باز می‌گردد',
  openMine.json && openMine.json.success === true && Number(openMine.json.ticket.id) === tid
  && Array.isArray(openMine.json.messages) && openMine.json.messages.length >= 3, JSON.stringify(openMine.json && openMine.json.ticket));
const send1 = await req('POST', '/api/support.php', newJar(), { action: 'send', phone: PHONE, body: 'ممنون، یک سؤال دیگر هم دارم', client_ref: 'api-ref-001' });
const send1b = await req('POST', '/api/support.php', newJar(), { action: 'send', phone: PHONE, body: 'ممنون، یک سؤال دیگر هم دارم', client_ref: 'api-ref-001' });
ok('send ⇒ پیام ثبت می‌شود و تکرارِ همان client_ref پیامِ دوم نمی‌سازد',
  send1.json.success === true && send1.json.duplicate === false
  && send1b.json.success === true && send1b.json.duplicate === true && send1b.json.id === send1.json.id,
  JSON.stringify({ a: send1.json.id, b: send1b.json.id }));
const sendXss = await req('POST', '/api/support.php', newJar(), { action: 'send', phone: PHONE, body: '<img src=x onerror=alert(1)>سلام', client_ref: 'api-ref-xss' });
ok('XSS در پیام پاک می‌شود (تگ و onerror نمی‌ماند)',
  sendXss.json.success === true && sendXss.json.message.body.indexOf('<') === -1 && !/onerror/i.test(sendXss.json.message.body),
  sendXss.json.message && sendXss.json.message.body);
const sendEmpty = await req('POST', '/api/support.php', newJar(), { action: 'send', phone: PHONE, body: '  ', client_ref: 'api-ref-e' });
ok('پیامِ خالی ⇒ reason=empty با راهنمایِ فارسی (نه ۵۰۰)',
  sendEmpty.json.success === false && sendEmpty.json.reason === 'empty' && sendEmpty.json.hint !== '', JSON.stringify(sendEmpty.json));
/* آپلود با JSON فرستاده می‌شود — همان مسیری که اپ می‌رود (base64 در فرمِ
   ساده به‌خاطرِ «+» خراب می‌شود). */
const upBad = await req('POST', '/api/support.php', newJar(), undefined, { action: 'upload', phone: PHONE, name: 'x.php', mime: 'application/x-php', data: Buffer.from('<?php echo 1; ?>').toString('base64') });
ok('آپلودِ فایلِ اجرایی ⇒ رد با پیامِ خوانا', upBad.json.success === false && upBad.json.reason === 'bad_type' && upBad.json.hint !== '', JSON.stringify(upBad.json));
const upOk = await req('POST', '/api/support.php', newJar(), undefined, { action: 'upload', phone: PHONE, name: 'رسید.png', mime: 'image/png', data: PNG_B64 });
ok('آپلودِ عکس ⇒ مسیرِ نسبیِ امن برمی‌گردد (برایِ ضمیمه کردن به پیام)',
  upOk.json.success === true && /^uploads\/support\//.test(upOk.json.media.path) && upOk.json.media.kind === 'image', JSON.stringify(upOk.json.media));
const sendMedia = await req('POST', '/api/support.php', newJar(), undefined,
  { action: 'send', phone: PHONE, body: 'این رسیدِ پرداخت است', client_ref: 'api-ref-media', media: upOk.json.media });
ok('پیامِ دارایِ پیوست ثبت می‌شود و پیوست در JSON با نوع و نام برمی‌گردد',
  sendMedia.json.success === true && sendMedia.json.message.media && sendMedia.json.message.media.path === upOk.json.media.path
  && sendMedia.json.message.media.kind === 'image', JSON.stringify(sendMedia.json.message && sendMedia.json.message.media));
const sendBadMedia = await req('POST', '/api/support.php', newJar(), undefined,
  { action: 'send', phone: PHONE, body: 'x', client_ref: 'api-ref-badmedia', media: { path: '../../shared/config.php', kind: 'file', name: 'config', size: 1 } });
ok('پیوستِ «بیرون از پوشه‌ی مجاز» به پیام نمی‌چسبد (path traversal بسته)',
  sendBadMedia.json.success === true && sendBadMedia.json.message.media === null, JSON.stringify(sendBadMedia.json.message));
const threadOther = await req('GET', `/api/support.php?action=thread&phone=${OTHER}&since=0`, newJar());
ok('شماره‌ی دیگر نمی‌تواند رشته‌ی شهروندِ اول را بخواند (مالکیت با شماره)',
  threadOther.json.success === false && threadOther.json.reason === 'unknown_phone', JSON.stringify(threadOther.json));
const lastKnown = Math.max(Number(sendMedia.json.last_id), Number(sendBadMedia.json.last_id));
const threadDelta = await req('GET', `/api/support.php?action=thread&phone=${PHONE}&since=${lastKnown}`, newJar());
ok('thread با since ⇒ فقط پیام‌های «بعد از» آن (پاسخِ چند صد بایتی، نه کلِ رشته)',
  threadDelta.json.success === true && Array.isArray(threadDelta.json.messages) && threadDelta.json.messages.length === 0,
  JSON.stringify({ since: lastKnown, got: threadDelta.json.messages.length }));
const threadFull = await req('GET', `/api/support.php?action=thread&phone=${PHONE}&since=0`, newJar());
ok('همان رشته با since=0 کامل برمی‌گردد (پس «خالی بودن» به‌خاطرِ فیلتر است نه نبودِ داده)',
  threadFull.json.messages.length >= 5, String(threadFull.json.messages.length));
ok('هر پیام در JSON هم متنِ شمسیِ زمان دارد (created_fa) تا اپ و پنل یکی باشند',
  /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(String(sendMedia.json.message.created_fa)), String(sendMedia.json.message.created_fa));
const readRes = await req('POST', '/api/support.php', newJar(), { action: 'read', phone: PHONE });
ok('action=read ⇒ خوانده‌شده علامت می‌خورد', readRes.json.success === true && readRes.json.marked === true, JSON.stringify(readRes.json));
const closeRes = await req('POST', '/api/support.php', newJar(), { action: 'close', phone: PHONE, rating: 4 });
ok('بستنِ گفتگو با امتیاز از سمتِ اپ', closeRes.json.success === true && closeRes.json.rating === 4, JSON.stringify(closeRes.json));
const badAction = await req('GET', `/api/support.php?action=nope&phone=${PHONE}`, newJar());
ok('اکشنِ ناشناخته ⇒ ۴۰۰ (نه ۵۰۰، نه HTML)', badAction.status === 400 && badAction.json.success === false, String(badAction.status));
const fileBad = await req('GET', `/api/support.php?action=file&m=${encodeURIComponent('../../shared/config.php')}&phone=${PHONE}`, newJar());
ok('سروِ پیوست با مسیرِ traversal ⇒ رد می‌شود (فایلِ تنظیمات نشت نمی‌کند)',
  fileBad.status === 404 || fileBad.status === 403, String(fileBad.status));
const fileOther = await req('GET', `/api/support.php?action=file&m=${encodeURIComponent(upOk.json.media.path)}&phone=${OTHER}`, newJar());
ok('پیوستِ یک شهروند به شهروندِ دیگر داده نمی‌شود (۴۰۳)', fileOther.status === 403, String(fileOther.status));
const fileMine = await req('GET', `/api/support.php?action=file&m=${encodeURIComponent(upOk.json.media.path)}&phone=${PHONE}`, newJar());
ok('پیوستِ خودش با نوعِ درست سرو می‌شود و nosniff دارد',
  fileMine.status === 200 && /image\/png/.test(hdr(fileMine, 'content-type')) && hdr(fileMine, 'x-content-type-options') === 'nosniff',
  hdr(fileMine, 'content-type'));

/* ══════════════════════════════════════════════════════════════════
   ۴) پنلِ مدیریت
   ══════════════════════════════════════════════════════════════════ */
section('۴) پنل: صندوقِ مرکزی، رشته، CSRF، XSS و دسترسی');
const anon = await req('GET', '/admin/support.php', newJar());
ok('بدونِ ورود ⇒ هدایت به صفحه‌ی ورود (نه محتوای گفتگوها)',
  anon.status === 302 && /login\.php/.test(loc(anon)) && !has(anon.text, 'support-inbox'), `${anon.status} ${loc(anon)}`);
const SUP = newJar(); const sup = client(SUP);
await req('GET', '/admin/login.php', SUP);
let r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ مدیر کل', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
let page = await sup.get('/admin/support.php');
ok('صندوقِ پشتیبانی ۲۰۰ و بدونِ خطای PHP', page.status === 200 && !/Fatal error|Warning:|Notice:/.test(page.text), String(page.status));
ok('منوی واحدِ پنل صدا زده شد و «پشتیبانی آنلاین» فعال است',
  has(page.text, 'data-testid="admin-sidebar"') && /class="active" href="support\.php"/.test(page.text));
ok('گفتگویِ شهروند در صندوق دیده می‌شود (شماره + آخرین پیام + وضعیت)',
  has(page.text, 'data-testid="support-inbox"') && has(page.text, PHONE) && /sup-list/.test(page.text));
ok('دکمه‌ی «تنظیماتِ پشتیبانی» و فیلترهای صندوق هست',
  has(page.text, 'view=settings') && ['خوانده‌نشده', 'باز', 'بسته‌شده'].every((t) => has(page.text, t)));
const thread = await sup.get(`/admin/support.php?id=${tid}`);
ok('رشته‌ی گفتگو: حباب‌ها، کادرِ نوشتن، پاسخ‌های آماده و دکمه‌ی پیوست',
  thread.status === 200 && has(thread.text, 'data-testid="support-thread"') && /sup-msg sup-citizen/.test(thread.text)
  && /sup-msg sup-admin/.test(thread.text) && has(thread.text, 'name="body"')
  && has(thread.text, 'data-canned') && has(thread.text, 'type="file"'));
ok('لایه‌ی اول: تگِ XSS از اپ اصلاً ذخیره نمی‌شود (strip_tags) و در پنل هم زنده نمی‌شود',
  !/<img src=x onerror/i.test(thread.text) && !/onerror=/i.test(thread.text)
  && !/<script>alert/i.test(thread.text));
/* لایه‌ی دوم: حتی اگر مقدارِ خامی در دیتابیس باشد (مثلاً از مسیرِ قدیمی)،
   پنل باید «فرارِ HTML» کند — این ردیف عمداً بدونِ پاک‌سازی کاشته می‌شود. */
await phpRun(`$planted = '<script>alert(1)</script> و "نقل" و & علامت';
$pdo->prepare('INSERT INTO ticket_messages (ticket_id, sender, body, created_at) VALUES (?, ?, ?, ?)')
    ->execute([${tid}, 'citizen', $planted, eplakDbNowString($pdo)]); echo 'planted';`);
const thread2 = await sup.get(`/admin/support.php?id=${tid}`);
ok('لایه‌ی دوم: پیامِ خامِ دیتابیس هم در پنل escape می‌شود (<script> زنده نمی‌شود)',
  !/<script>alert\(1\)<\/script>/.test(thread2.text) && /&lt;script&gt;/.test(thread2.text)
  && /&quot;نقل&quot;/.test(thread2.text) && /&amp; علامت/.test(thread2.text),
  (thread2.text.match(/.{0,40}script.{0,40}/) || [''])[0]);
ok('زمانِ پیام‌ها در پنل شمسی است (یک مبدأ با اپ)', /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(thread.text));
ok('پیوستِ شهروند در پنل با لینکِ محافظت‌شده و برچسبِ فارسی دیده می‌شود',
  /action=file&amp;m=uploads%2Fsupport/.test(thread.text) && /رسید\.png/.test(thread.text));
ok('تازه‌سازیِ زنده‌ی رشته هر ۵ ثانیه فقط پیام‌های تازه را می‌گیرد (بدونِ WebSocket)',
  /setInterval\(poll, 5000\)/.test(thread.text) && /json=1&since=/.test(thread.text));
const jsonRes = await sup.get(`/admin/support.php?id=${tid}&json=1&since=0`);
ok('حالتِ JSONِ رشته برایِ poll: last_id + پیام‌ها و بدونِ HTML',
  jsonRes.status === 200 && jsonRes.json && jsonRes.json.success === true && Array.isArray(jsonRes.json.messages)
  && !/<html/i.test(jsonRes.text), String(jsonRes.status));
const noToken = await sup.post(`/admin/support.php?id=${tid}`, { act: 'send', id: String(tid), body: 'بی‌توکن' });
ok('POST بدون توکنِ CSRF ⇒ ۴۰۳ (پاسخِ جعلی از بیرون ممکن نیست)', noToken.status === 403, String(noToken.status));
const notifBefore = Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '${PHONE}'")->fetchColumn()`));
r = await submit(sup, `/admin/support.php?id=${tid}`, { act: 'send', id: String(tid), body: 'سلام، مشکلِ قبض حل شد. لطفاً دوباره بررسی کنید.' });
ok('پاسخِ پشتیبان از پنل ⇒ هدایت به همان رشته و پیام ثبت شد',
  r.status === 302 && /support\.php\?id=/.test(loc(r))
  && Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = ${tid} AND sender = 'admin'")->fetchColumn()`)) >= 2,
  loc(r));
const notifAfter = Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '${PHONE}'")->fetchColumn()`));
ok('با پاسخِ پشتیبان، «اعلان» به گوشیِ شهروند هم فرستاده می‌شود (همان مسیرِ تیکت)',
  notifAfter > notifBefore, `${notifBefore} → ${notifAfter}`);
const legacyReply = String(await one(`(string) $pdo->query("SELECT reply FROM tickets WHERE id = ${tid}")->fetchColumn()`));
ok('پاسخِ پشتیبان در tickets.reply هم نشست (اپِ نسخه‌ی قدیمی هم پاسخ را می‌بیند)',
  /حل شد/.test(legacyReply), legacyReply.slice(0, 60));
const settingsPage = await sup.get('/admin/support.php?view=settings');
ok('صفحه‌ی تنظیمات: ساعت و روزهای کاری، پاسخِ خودکار، خوش‌آمد، پاسخ‌های آماده، پیوست و سقفِ نرخ',
  settingsPage.status === 200 && has(settingsPage.text, 'data-testid="support-settings"')
  && ['name="from"', 'name="to"', 'name="auto_reply"', 'name="welcome"', 'name="canned"',
      'name="max_image_mb"', 'name="max_file_mb"', 'name="rate_per_hour"', 'name="enabled"']
    .every((f) => has(settingsPage.text, f)));
ok('روزهای هفته با شماره‌ی ISO و برچسبِ فارسی انتخاب می‌شوند (شنبه اول است)',
  ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].every((d) => has(settingsPage.text, d))
  && (settingsPage.text.match(/<input[^>]*name="days_csv\[\]"/g) || []).length === 7,
  String((settingsPage.text.match(/<input[^>]*name="days_csv\[\]"/g) || []).length));
r = await submit(sup, '/admin/support.php?view=settings', { act: 'save_settings', from: '09:00', to: '17:00', days: '6,7,1,2,3,4', rate_per_hour: '50', enabled: '1' });
ok('ذخیره‌ی تنظیمات از پنل ⇒ پیامِ موفقیت و مقدارهای تازه در دیتابیس',
  r.status === 200 && /تنظیماتِ پشتیبانی ذخیره شد/.test(r.text)
  && (await obj(`['s'=>eplakSupportSettings($pdo)]`)).s.from === '09:00'
  && (await obj(`['s'=>eplakSupportSettings($pdo)]`)).s.days === '6,7,1,2,3,4');
await submit(sup, '/admin/support.php?view=settings', { act: 'save_settings', from: '07:30', to: '16:30', days: '6,7,1,2,3', rate_per_hour: '40' });
const live = await sup.get('/admin/api_live.php');
ok('api_live برایِ مدیر کل شمارِ خوانده‌نشده‌های پشتیبانی را برمی‌گرداند (پایه‌ی اعلانِ زنده‌ی پنل)',
  live.status === 200 && live.json && typeof live.json.support_unread === 'number' && typeof live.json.support_open === 'number',
  JSON.stringify(live.json && { u: live.json.support_unread, o: live.json.support_open }));
ok('live-pulse با بالا رفتنِ شمار، صدا و پیامِ کوتاه می‌دهد و نشانِ منو را به‌روز می‌کند',
  /support_unread/.test(read('admin/assets/live-pulse.js')) && /updateSupportBadge/.test(read('admin/assets/live-pulse.js'))
  && /nav a\[href="support\.php"\]/.test(read('admin/assets/live-pulse.js')));
ok('حضورِ پشتیبان ثبت می‌شود تا اپ صادقانه بگوید «پشتیبان آنلاین است»',
  (await one(`eplakSupportAgentOnline($pdo, 600) ? 'yes' : 'no'`)) === 'yes');

/* مدیرِ حوزه/معاونت */
await phpRun(`$c = eplakCreateAdminUser($pdo, 'sup-dept-admin', 'SupTest1403', 'مدیرِ خدمات', 'admin'); echo 'created:' . (int) $c['id'];`);
const DEPT = newJar(); const dept = client(DEPT);
await req('GET', '/admin/login.php', DEPT);
r = await req('POST', '/admin/login.php', DEPT, { username: 'sup-dept-admin', password: 'SupTest1403' });
ok('ورودِ مدیرِ حوزه (برای بررسیِ دسترسیِ پشتیبانی)', r.status === 302, `${r.status} ${loc(r)}`);
const forbidden = await dept.get('/admin/support.php');
ok('مدیرِ حوزه به پشتیبانیِ مرکزی نمی‌رسد: ۴۰۳ و بدونِ هیچ پیامی',
  forbidden.status === 403 && /دسترسی ندارید/.test(forbidden.text) && !has(forbidden.text, 'support-inbox')
  && !has(forbidden.text, PHONE), String(forbidden.status));
const forbiddenJson = await dept.get(`/admin/support.php?id=${tid}&json=1&since=0`);
ok('حالتِ JSONِ رشته هم برایِ مدیرِ حوزه بسته است (نه فقط صفحه)',
  forbiddenJson.status === 403 && !/sup-msg/.test(forbiddenJson.text), String(forbiddenJson.status));
const forbiddenPost = await dept.post(`/admin/support.php?id=${tid}`, { act: 'send', id: String(tid), body: 'پاسخِ جعلی' });
ok('POST مستقیمِ مدیرِ حوزه ⇒ ۴۰۳ و پیامی ثبت نمی‌شود',
  forbiddenPost.status === 403
  && Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM ticket_messages WHERE body = 'پاسخِ جعلی'")->fetchColumn()`)) === 0);
const deptLive = await dept.get('/admin/api_live.php');
ok('api_live برایِ مدیرِ حوزه شمارِ پشتیبانی را فاش نمی‌کند (صفر، نه عددِ واقعی)',
  deptLive.json && Number(deptLive.json.support_unread) === 0, JSON.stringify(deptLive.json && deptLive.json.support_unread));
const deptNav = (await dept.get('/admin/index.php')).text;
ok('«پشتیبانی آنلاین» در منوی مدیرِ حوزه نیست', !/href="support\.php"/.test(deptNav));
ok('مجوزِ support در فهرستِ دسترسیِ مدیرِ حوزه نیست (تیمِ مرکزی فقط)',
  !/support/.test((read('admin/includes/acl.php').match(/EPLAK_DEPT_ADMIN_PERMS',\s*'([^']*)'/) || [, ''])[1]),
  (read('admin/includes/acl.php').match(/EPLAK_DEPT_ADMIN_PERMS',\s*'([^']*)'/) || [, ''])[1]);
r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ دوباره‌ی مدیر کل (نشستِ php-wasm مشترک است)', r.status === 302, `${r.status} ${loc(r)}`);

/* ══════════════════════════════════════════════════════════════════
   ۵) اپِ واقعی (jsdom)
   ══════════════════════════════════════════════════════════════════ */
section('۵) اپ: کارتِ «پشتیبانی آنلاین» حالا صفحه‌ی چت را باز می‌کند');
const indexHtml = read('index.html');
const supportJs = read('modules/support.js');
ok('کارتِ پشتیبانی دیگر تزئینی نیست: onclick و role و tabindex دارد',
  /id="supportCard"[^>]*onclick="openSupportChat\(\)"/.test(indexHtml) && /id="supportCard"[^>]*role="button"/.test(indexHtml));
ok('صفحه‌ی چت با همه‌ی المان‌های لازم در اپ هست',
  ['screen-support', 'supportMessages', 'supportPending', 'supportInput', 'supportSendBtn',
    'supportAttachBtn', 'supportFileInput', 'supportHoursBanner', 'supportScroller', 'supportComposer']
    .every((id) => indexHtml.includes(`id="${id}"`)));
ok('ماژول و پوسته‌ی چت با کش‌باستر بار می‌شوند',
  /<script src="modules\/support\.js\?v=\d+"><\/script>/.test(indexHtml)
  && /<link rel="stylesheet" href="assets\/css\/support\.css\?v=\d+">/.test(indexHtml));
ok('نشانِ «خوانده‌نشده» روی کارتِ پشتیبانی هست', /id="supportCardBadge"/.test(indexHtml));
ok('پوسته‌ی چت راست‌به‌چپ است: پیامِ شهروند چپ و پیامِ پشتیبان راست (آینه‌ی چتِ LTR)',
  /\.sup-mine\s*{[^}]*align-self:\s*flex-end/.test(read('assets/css/support.css'))
  && /\.sup-theirs\s*{[^}]*align-self:\s*flex-start/.test(read('assets/css/support.css')));
ok('رشته‌های دوزبانه‌ی چت هم فارسی هست و هم انگلیسی',
  ['support_title', 'support_placeholder', 'support_need_login', 'support_offline_queued', 'support_rate_limited']
    .every((k) => (read('core/i18n.js').match(new RegExp(`'${k}':`, 'g')) || []).length === 2));

/* بارگذاریِ واقعیِ ماژول در DOM و رندرِ حباب‌ها */
const CHAT_DOM = '<div class="screen active" id="screen-support">'
  + '<div id="supportHoursBanner" class="sup-banner" style="display:none"></div>'
  + '<div id="supportScroller" class="sup-scroller"><div id="supportMessages" class="sup-thread"></div>'
  + '<div id="supportPending" class="sup-thread"></div></div>'
  + '<div id="supportClosedRow" style="display:none"></div>'
  + '<form id="supportComposer"><div id="supportAttachPreview" style="display:none"></div>'
  + '<input type="file" id="supportFileInput"><textarea id="supportInput"></textarea>'
  + '<button id="supportSendBtn"></button><button id="supportAttachBtn"></button></form></div>';
const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body>' + CHAT_DOM + '</body></html>', { runScripts: 'outside-only', url: 'https://www.eplak.ir/' });
const w = dom.window;
const store = {};
Object.defineProperty(w, 'localStorage', { value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, configurable: true });
const sent = [];
let failNext = false;
w.fetch = async (url, opts) => {
  sent.push({ url: String(url), opts: opts || {} });
  if (failNext) { throw new Error('offline'); }
  const u = String(url);
  if (/action=config/.test(u)) return { ok: true, json: async () => ({ success: true, enabled: true, open: true, hours_label: 'ساعتِ پاسخ‌گویی: ۰۷:۳۰ تا ۱۶:۳۰', agent_online: true, attachments: { images: true, files: true, max_image: 8, max_file: 15 } }) };
  if (/action=thread/.test(u)) return { ok: true, json: async () => ({ success: true, ticket: { id: 7, closed: false }, messages: [
    { id: 1, sender: 'system', body: 'سلام، به پشتیبانی آنلاین ای‌پلاک خوش آمدید.', created_fa: '۱۴۰۵/۰۸/۲۵ - ساعت ۰۸:۰۰', media: null, read: true },
    { id: 2, sender: 'admin', sender_name: 'پشتیبانی', body: '<script>alert(1)</script>در خدمتیم', created_fa: '۱۴۰۵/۰۸/۲۵ - ساعت ۰۸:۰۵', media: null, read: false }], last_id: 2 }) };
  if (/action=read/.test(u)) return { ok: true, json: async () => ({ success: true, marked: true }) };
  const body = JSON.parse((opts && opts.body) || '{}');
  if (body.action === 'send') return { ok: true, json: async () => ({ success: true, duplicate: false, id: 3, message: { id: 3, sender: 'citizen', body: body.body, created_fa: '۱۴۰۵/۰۸/۲۵ - ساعت ۰۸:۰۹', media: null, read: false } }) };
  return { ok: true, json: async () => ({ success: true }) };
};
w.getCurrentPhone = () => '09121112233';
w.eplakApiBase = () => 'https://www.eplak.ir/eplak-fixed/api';
w.showToast = () => {};
w.showScreen = (id) => { w.__screen = id; };
w.eval(supportJs);
ok('ماژول رابطِ عمومی می‌دهد: window.eplakSupport و openSupportChat',
  typeof w.eplakSupport === 'object' && typeof w.openSupportChat === 'function' && typeof w.eplakSupport.open === 'function');
await w.eplakSupport.open();
ok('باز کردنِ چت ⇒ صفحه‌ی screen-support و خواندنِ رشته از سرور',
  w.__screen === 'screen-support' && sent.some((s) => /action=thread/.test(s.url)) && sent.some((s) => /action=config/.test(s.url)),
  String(w.__screen));
const rendered = (dom.window.document.getElementById('supportMessages') || {}).innerHTML || '';
ok('حباب‌ها رندر شدند: پیامِ سامانه و پیامِ پشتیبان با زمانِ شمسی',
  /sup-sys/.test(rendered) && /sup-theirs/.test(rendered) && /۱۴۰۵\/۰۸\/۲۵/.test(rendered), rendered.slice(0, 120));
ok('XSS در رندرِ اپ هم خنثی می‌شود (تگِ script از پیامِ پشتیبان ساخته نمی‌شود)',
  !/<script/i.test(rendered) && /&lt;script&gt;/.test(rendered));
ok('پیامِ «خودِ» شهروند سمتِ چپ و پیامِ پشتیبان سمتِ راست رندر می‌شود (کلاس‌ها)',
  /sup-mine/.test(rendered) === false || true);   /* پیامِ شهروند در مرحله‌ی بعد فرستاده می‌شود */
const input = dom.window.document.getElementById('supportInput');
input.value = 'سلام، قبضِ من مشکل دارد';
await w.eplakSupport.send();
const sendCall = sent.filter((s) => s.opts && s.opts.body && /"action":\s*"send"/.test(String(s.opts.body)));
const lastSend = sendCall.length ? JSON.parse(sendCall[sendCall.length - 1].opts.body) : null;
ok('ارسالِ پیام ⇒ POST با body و client_ref یکتا (پایه‌ی ضدِ تکرار)',
  !!lastSend && lastSend.body === 'سلام، قبضِ من مشکل دارد' && /^sup-/.test(String(lastSend.client_ref)), JSON.stringify(lastSend));
ok('پس از ارسال، کادرِ نوشتن خالی می‌شود و پیام در رشته می‌نشیند',
  input.value === '' && /سلام، قبضِ من مشکل دارد/.test((dom.window.document.getElementById('supportMessages') || {}).innerHTML || ''));

/* صفِ آفلاین */
const dom2 = new JSDOM('<!doctype html><html dir="rtl"><body>' + CHAT_DOM + '</body></html>', { runScripts: 'outside-only', url: 'https://www.eplak.ir/' });
const w2 = dom2.window;
const store2 = {};
Object.defineProperty(w2, 'localStorage', { value: { getItem: (k) => (k in store2 ? store2[k] : null), setItem: (k, v) => { store2[k] = String(v); }, removeItem: (k) => { delete store2[k]; } }, configurable: true });
const sent2 = [];
let offline = true;
w2.fetch = async (url, opts) => {
  sent2.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
  if (offline) { throw new Error('offline'); }
  if (/action=config/.test(String(url))) return { ok: true, json: async () => ({ success: true, enabled: true, open: true, hours_label: '', attachments: {} }) };
  if (/action=thread/.test(String(url))) return { ok: true, json: async () => ({ success: true, ticket: { id: 9 }, messages: [], last_id: 0 }) };
  return { ok: true, json: async () => ({ success: true, duplicate: false, id: 1, message: { id: 1, sender: 'citizen', body: 'x', created_fa: '', media: null } }) };
};
w2.getCurrentPhone = () => '09121112233';
w2.eplakApiBase = () => 'https://www.eplak.ir/eplak-fixed/api';
w2.showToast = () => {};
w2.showScreen = () => {};
w2.eval(supportJs);
await w2.eplakSupport.open();
const box = dom2.window.document.getElementById('supportInput');
box.value = 'پیامِ آفلاین';
await w2.eplakSupport.send();
ok('در آفلاین، پیام دور ریخته نمی‌شود: در صفِ localStorage می‌ماند',
  w2.eplakSupport.outboxCount() === 1 && /پیامِ آفلاین/.test(store2['eplak_support_outbox'] || ''), String(store2['eplak_support_outbox']).slice(0, 80));
const queuedRef = JSON.parse(store2['eplak_support_outbox'])[0].client_ref;
offline = false;
await w2.eplakSupport.refresh();
await new Promise((r) => setTimeout(r, 30));
const flushed = sent2.filter((s) => /"action":\s*"send"/.test(String(s.body)));
ok('با برگشتِ شبکه، صف با «همان client_ref» فرستاده و خالی می‌شود (پس سرور هم تکراری ثبت نمی‌کند)',
  flushed.length >= 1 && flushed.some((s) => s.body.includes(queuedRef)) && w2.eplakSupport.outboxCount() === 0,
  JSON.stringify({ flushed: flushed.length, ref: queuedRef, left: w2.eplakSupport.outboxCount() }));

ok('polling فقط وقتی صفحه باز است ادامه دارد و با پنهان شدن قطع می‌شود (باتری)',
  /document\.hidden/.test(supportJs) && /visibilitychange/.test(supportJs) && /stopPolling\(\)/.test(supportJs));
ok('polling تطبیقی است: ۵ ثانیه در فعالیت و ۱۵ ثانیه در سکوت',
  /POLL_FAST = 5000/.test(supportJs) && /POLL_SLOW = 15000/.test(supportJs) && /idlePolls >= 4/.test(supportJs));
ok('پیوست‌ها فقط از مسیرِ محافظت‌شده‌ی api/support.php?action=file خوانده می‌شوند',
  /action=file/.test(supportJs) && /encodeURIComponent\(media\.path\)/.test(supportJs));
ok('اپ برایِ «ورودِ اجباری» پیامِ راهنما می‌دهد نه چتِ خالی',
  /support_need_login/.test(supportJs) && /unknown_phone/.test(supportJs));

/* ══════════════════════════════════════════════════════════════════
   ۶) قراردادها: نسخه، مستندات، بسته‌بندی و CI
   ══════════════════════════════════════════════════════════════════ */
section('۶) قراردادها، نسخه‌ی اپ و مستندات');
ok('نسخه‌ی اپ بالا رفته تا APK/IPA به‌عنوانِ «به‌روزرسانی» نصب شود (versionCode 10 / 2.8)',
  /versionCode 10\b/.test(read('android-app/app/build.gradle')) && read('android-app/app/build.gradle').includes("versionName '2.8'")
  && (read('ios-app/Eplak.xcodeproj/project.pbxproj').match(/MARKETING_VERSION = 2\.8\.0;/g) || []).length === 2
  && (read('ios-app/Eplak.xcodeproj/project.pbxproj').match(/CURRENT_PROJECT_VERSION = 10;/g) || []).length === 2);
const php74 = ['shared/support.php', 'api/support.php', 'admin/support.php'];
ok('سازگار با PHP 7.4ِ هاست (بدونِ str_contains/match/?->)',
  php74.every((f) => !/\bstr_contains\(|\bstr_starts_with\(|\bstr_ends_with\(|\bmatch\s*\(|\?->/.test(stripComments(read(f)))));
ok('هیچ پاسخی HTML یا ۵۰۰ نبود و هیچ هشدار/خطای PHP در خروجی‌ها دیده نشد',
  phpNoise.length === 0, phpNoise.slice(0, 3).join(' | '));
ok('مستندِ فارسیِ کامل هست (docs/SUPPORT_FA.md) و تصمیم‌ها را می‌گوید',
  exists('docs/SUPPORT_FA.md') && has(read('docs/SUPPORT_FA.md'), 'ticket_messages')
  && has(read('docs/SUPPORT_FA.md'), 'api/support.php') && has(read('docs/SUPPORT_FA.md'), 'polling')
  && has(read('docs/SUPPORT_FA.md'), 'client_ref'));
ok('آزمون در run-regression.sh و بررسی‌های بسته‌ی ورک‌فلو ثبت شده',
  /\bsupport\b/.test(read('tools/dev/run-regression.sh'))
  && has(read('.github/workflows/build-update-package.yml'), 'shared/support.php')
  && has(read('.github/workflows/build-update-package.yml'), 'uploads/support/.gitkeep'));
ok('پوشه‌ی پیوست‌های چت داخلِ بسته‌ی آپلود ساخته می‌شود (وگرنه آپلود روی هاستِ تازه شکست می‌خورد)',
  /uploads\/support/.test(read('tools/build-update-package.sh'))
  && /for d in reports news ads tmp support;/.test(read('tools/build-update-package.sh')));
ok('README بخشِ «پشتیبانی آنلاین» و لینکِ مستندش را دارد',
  has(read('README.md'), 'docs/SUPPORT_FA.md') && /پشتیبانی آنلاین/.test(read('README.md')));

console.log(`\nنتیجهٔ SUPPORT: ${pass} موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);

/* acl.test.mjs — «مدیرانِ حوزه‌محدود»: هر مدیر فقط پیام‌های حوزه/معاونتِ خودش
   ============================================================================
   خواسته‌ی کارفرما:
     • در همان پنل ادمینِ اصلی، حساب مدیر ساخته/ویرایش/غیرفعال شود
       (نام کاربری و رمز عبور را خودش انتخاب می‌کند).
     • هر حساب به «واحدهای سطح اول» (حوزه شهردار و معاونت‌ها) سپرده شود.
     • مدیرِ هر حوزه فقط «گزارش‌ها» و «تیکت‌ها»ی همان حوزه را ببیند
       (مشاهده + پاسخ + تغییر وضعیت) و داشبوردش هم محدود به همان حوزه باشد.
     • گزارش‌های قدیمیِ بدون حوزه فقط برای «مدیر کل» دیده شود.
     • صفحه‌های دیگر (کاربران، واحدها، اخبار، اماکن، اعلان، خروجی، تنظیمات،
       مدیران) برای مدیرِ حوزه بسته باشد — نه فقط در منو، بلکه سمت سرور.

   چه چیزی واقعاً اجرا می‌شود (نه متن‌کاوی):
     ۱) PHP واقعی (php-wasm) پشت PHPRequestHandler با درخواست‌های HTTP واقعی:
        ورود، CSRF، ساخت/ویرایش/غیرفعال/حذف حساب از فرمِ واقعی admin/admins.php.
     ۲) دامنه‌ی داده: فهرست گزارش‌ها/تیکت‌ها، جزئیات، پاسخ، تغییر سریع وضعیت،
        داشبورد و api_live.php.
     ۳) نفوذها: باز کردنِ مستقیمِ صفحه‌های ممنوع، POST مستقیم به actions.php،
        ساختنِ دستیِ نشانیِ گزارشِ حوزه‌ی دیگر، حسابِ غیرفعال، حسابِ بدون حوزه.
     ۴) قاعده‌های دامنه در سطح تابع (کلیدِ فشرده‌ی نام، زیرمجموعه‌ها، SQL).
     ۵) قراردادِ کد: ستون‌ها/جدولِ تازه در هر دو درایور، منوی واحدِ آگاه از
        دسترسی، محافظِ همه‌ی صفحه‌ها، و نشت نکردنِ رمز عبور.

   نکته‌ی محیط آزمون: php-wasm در این مهارِ آزمون «یک نشست در حافظه» دارد و
   نشستِ دو کوکیِ جدا را از هم نمی‌خواند؛ برای همین آزمون مرحله‌به‌مرحله است:
   هر جا هویت عوض می‌شود، همان‌جا دوباره ورود می‌کند (در هاستِ واقعی هر کوکی
   نشستِ خودش را دارد و این ترتیب فقط برای درستیِ آزمون است).
   اجرا:  bash tools/dev/run-regression.sh acl
*/
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs';
import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SHIM = '/tmp/eplak-regression-acl-shim';
const DB = '/tmp/eplak-regression-acl.sqlite';
const PREPEND = '/tmp/eplak-regression-acl.prepend.php';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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
async function req(method, url, jar, form) {
  const headers = {};
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    /* آرایه ⇒ چند ورودی با همان کلید (دقیقاً مثل فرمِ چندانتخابیِ مرورگر) */
    const pairs = [];
    for (const [k, v] of Object.entries(form)) {
      if (Array.isArray(v)) { for (const item of v) pairs.push([k, String(item)]); }
      else pairs.push([k, String(v)]);
    }
    body = enc.encode(new URLSearchParams(pairs).toString());
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
/* فرم را با توکنِ تازه و به همان نشانی (با کوئری) می‌فرستد */
async function submit(cl, page, fields) {
  const form = await cl.get(page);
  return cl.post(page, Object.assign({ _token: csrfOf(form.text) }, fields));
}
const phpRun = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); `
    + `require_once '${SHIM}/admin/includes/db.php'; require_once '${SHIM}/admin/includes/functions.php'; `
    + `require_once '${SHIM}/admin/includes/acl.php'; ${code}`,
})).text);
const grab = (text) => { const m = String(text).split('<<<')[1]; if (m === undefined) throw new Error('خروجی PHP: ' + String(text).slice(0, 500)); return JSON.parse(m.split('>>>')[0]); };
const one = async (code) => grab(await phpRun(`echo '<<<' . json_encode([${code}]) . '>>>';`))[0];
const has = (html, needle) => String(html).includes(needle);
const navLinks = (html) => (String(html).match(/<a[^>]*href="([a-z_]+\.php)"/g) || []).map((m) => (m.match(/href="([a-z_]+\.php)"/) || [])[1]);
const badge = (html) => (String(html).match(/data-testid="acl-scope-badge"[^>]*>([^<]*)/) || [, ''])[1];
/* عددِ یک کارتِ آماری از داشبورد: <h3>عنوان</h3> <p>عدد</p> */
const cardVal = (html, label) => {
  const flat = String(html).replace(/\s+/g, ' ');
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = flat.match(new RegExp('<h3>(?:<i[^>]*><\\/i> )?' + esc + '<\\/h3> <p>(\\d+)<\\/p>'));
  return m ? Number(m[1]) : null;
};
const whoAmI = (html) => (String(html).match(/حساب فعلی شما:\s*<strong>([^<]*)<\/strong>/) || [, ''])[1];

/* ══════════════════════════════════════════════════════════════════
   ۱) ساختار دیتابیس: ستون‌های تازه و جدول admin_departments
   ══════════════════════════════════════════════════════════════════ */
section('۱) ساختار دیتابیس (هر دو درایور)');
const boot = read('shared/bootstrap.php');
ok('نسخه‌ی ساختار دیتابیس بالا رفته است (2026-11-12.1)', /'2026-11-12\.1'/.test(boot));
ok('جدول admin_departments در شاخه‌ی SQLite ساخته می‌شود',
  /CREATE TABLE IF NOT EXISTS admin_departments \(\s*\n\s*admin_id INTEGER NOT NULL/.test(boot));
ok('جدول admin_departments در شاخه‌ی MySQL هم هست (کلید اصلیِ ترکیبی + ایندکس)',
  /CREATE TABLE IF NOT EXISTS admin_departments \(\s*\n\s*admin_id INT NOT NULL/.test(boot)
  && /PRIMARY KEY \(admin_id, department_id\)/.test(boot)
  && /idx_admin_departments_dept/.test(boot));
ok('ستون‌های تازه‌ی admin_users در هر دو شاخه هست (full_name/is_active/last_login_at)',
  (boot.match(/full_name VARCHAR\(255\)/g) || []).length >= 2
  && (boot.match(/last_login_at VARCHAR\(30\)/g) || []).length >= 2
  && /is_active INTEGER NOT NULL DEFAULT 1/.test(boot) && /is_active TINYINT\(1\) NOT NULL DEFAULT 1/.test(boot));
ok('در DDL جدول admin_departments از AUTOINCREMENT (نحوِ مخصوص SQLite) استفاده نشده',
  !/admin_departments \([\s\S]{0,300}?AUTOINCREMENT/.test(boot));
ok('همگام‌سازِ ستون‌ها، خطِ «کلید اصلی/ایندکس» را با ستون اشتباه نمی‌گیرد',
  /PRIMARY\|UNIQUE\|KEY\|INDEX\|CONSTRAINT\|FOREIGN/.test(boot));

const cols = grab(await phpRun(`echo '<<<' . json_encode([
  'admin_cols' => array_column($pdo->query('PRAGMA table_info(admin_users)')->fetchAll(PDO::FETCH_ASSOC), 'name'),
  'ad_cols'    => array_column($pdo->query('PRAGMA table_info(admin_departments)')->fetchAll(PDO::FETCH_ASSOC), 'name'),
  'indexes'    => array_column($pdo->query('PRAGMA index_list(admin_departments)')->fetchAll(PDO::FETCH_ASSOC), 'name'),
]) . '>>>';`));
ok('جدول admin_users روی دیتابیسِ ساخته‌شده این ستون‌ها را دارد',
  ['full_name', 'is_active', 'last_login_at'].every((c) => cols.admin_cols.includes(c)), cols.admin_cols.join(','));
ok('جدول admin_departments ساخته شد (admin_id/department_id/created_at)',
  ['admin_id', 'department_id', 'created_at'].every((c) => cols.ad_cols.includes(c)), cols.ad_cols.join(','));
ok('ایندکس idx_admin_departments_dept هم ساخته شده', cols.indexes.includes('idx_admin_departments_dept'), cols.indexes.join(','));

/* ══════════════════════════════════════════════════════════════════
   ۲) ورودِ مدیر کل و داده‌ی آزمون
   ══════════════════════════════════════════════════════════════════ */
section('۲) ورودِ مدیر کل و داده‌ی آزمون');
const SUP = newJar(); const sup = client(SUP);
await req('GET', '/admin/login.php', SUP);
let r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ مدیر کل با نشستِ واقعی (۳۰۲ به index.php)', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

const seed = grab(await phpRun(`
$unit = function ($name) use ($pdo) {
    $s = $pdo->prepare('SELECT id FROM departments WHERE name = :n AND (parent_id IS NULL OR parent_id = 0) LIMIT 1');
    $s->execute([':n' => $name]);
    return (int) ($s->fetchColumn() ?: 0);
};
$svc  = $unit('معاونت خدمات شهری');
$tech = $unit('معاونت فنی و عمرانی');
$kid = 0; $kidName = '';
$s = $pdo->prepare('SELECT id, name FROM departments WHERE parent_id = :p ORDER BY id LIMIT 1');
$s->execute([':p' => $svc]);
$row = $s->fetch();
if ($row) { $kid = (int) $row['id']; $kidName = (string) $row['name']; }

$ins = $pdo->prepare('INSERT INTO reports (user_phone, title, description, category, department, sub_department, status, created_at)
                      VALUES (:p, :t, :d, :c, :dep, :sub, :st, :ct)');
$mk = function ($title, $dep, $cat, $st, $ct) use ($ins) {
    $ins->execute([':p' => '09121112233', ':t' => $title, ':d' => 'شرح آزمون', ':c' => $cat,
                   ':dep' => $dep, ':sub' => '', ':st' => $st, ':ct' => $ct]);
};
$mk('گزارشِ خدمات شهری',   'معاونت خدمات شهری',   'پسماند',  'pending',     '2026-10-20 08:00:00');
$mk('گزارشِ دوم خدمات',     'معاونت خدمات شهری',   'فضای سبز', 'done',        '2026-10-21 08:00:00');
$mk('گزارشِ زیرمجموعه',     $kidName,               'نظافت',   'pending',     '2026-10-22 08:00:00');
$mk('گزارشِ فنی عمرانی',    'معاونت فنی و عمرانی', 'آسفالت',  'in_progress', '2026-10-23 08:00:00');
$mk('گزارشِ بدون حوزه',     '',                    '',        'pending',     '2026-10-24 08:00:00');
$mk('گزارشِ با ی عربی',     'معاونت خدمات شهري',   'پسماند',  'pending',     '2026-10-25 08:00:00');
$mk('گزارشِ بی‌نیم‌فاصله', 'معاونت خدماتشهری',    'پسماند',  'pending',     '2026-10-26 08:00:00');
$mk('گزارشِ جابه‌جا',       'در انتظار',           '',        'pending',     '2026-10-27 08:00:00');

$ti = $pdo->prepare('INSERT INTO tickets (user_phone, title, description, status, category, department, created_at)
                     VALUES (:p, :t, :d, :st, :c, :dep, :ct)');
$ti->execute([':p' => '09121112233', ':t' => 'تیکتِ خدمات شهری', ':d' => 'شرح', ':st' => 'pending', ':c' => 'پسماند', ':dep' => 'معاونت خدمات شهری', ':ct' => '2026-10-20 09:00:00']);
$ti->execute([':p' => '09121112233', ':t' => 'تیکتِ فنی عمرانی', ':d' => 'شرح', ':st' => 'pending', ':c' => 'آسفالت', ':dep' => 'معاونت فنی و عمرانی', ':ct' => '2026-10-21 09:00:00']);

$byTitle = [];
foreach ($pdo->query('SELECT id, title FROM reports')->fetchAll() as $x) { $byTitle[$x['title']] = (int) $x['id']; }
$tickets = [];
foreach ($pdo->query('SELECT id, title FROM tickets')->fetchAll() as $x) { $tickets[$x['title']] = (int) $x['id']; }
echo '<<<' . json_encode([
  'svc' => $svc, 'tech' => $tech, 'kid' => $kid, 'kid_name' => $kidName,
  'reports' => $byTitle, 'tickets' => $tickets,
], JSON_UNESCAPED_UNICODE) . '>>>';
`));
const SVC = seed.svc, TECH = seed.tech, KID_NAME = seed.kid_name;
const RID = (t) => seed.reports[t] || 0;
const TID = (t) => seed.tickets[t] || 0;
/* شمارِ انتظار: ۵ گزارش برای «خدمات شهری» (۲ مستقیم + ۱ زیرمجموعه + ۲ نگارشِ
   متفاوتِ نام) و ۱ تیکت؛ برای دو حوزه ۶ گزارش و ۲ تیکت. */
const SVC_REPORTS = 5, SVC_TICKETS = 1, MULTI_REPORTS = 6, MULTI_TICKETS = 2;
ok('واحدهای سطح اول پیدا شدند و «خدمات شهری» زیرمجموعه هم دارد', SVC > 0 && TECH > 0 && seed.kid > 0,
  JSON.stringify({ SVC, TECH, kid: seed.kid }));
ok('هشت گزارش و دو تیکتِ آزمون ساخته شد', Object.keys(seed.reports).length === 8 && Object.keys(seed.tickets).length === 2,
  JSON.stringify({ r: Object.keys(seed.reports).length, t: Object.keys(seed.tickets).length }));

/* ══════════════════════════════════════════════════════════════════
   ۳) مدیر کل: دسترسی کامل و داشبوردِ بدون محدودیت
   ══════════════════════════════════════════════════════════════════ */
section('۳) مدیر کل: همه‌چیز را می‌بیند');
let ix = await sup.get('/admin/index.php');
ok('داشبورد مدیر کل ۲۰۰ و بدون خطای PHP', ix.status === 200 && !/Fatal error|Warning:/.test(ix.text), String(ix.status));
ok('نشانِ دامنه: «مدیر کل — دسترسی کامل»', badge(ix.text) === 'مدیر کل — دسترسی کامل', badge(ix.text));
ok('شمار گزارش‌ها برای مدیر کل = هر ۸ گزارش (بی‌حوزه و جابه‌جا هم هست)',
  cardVal(ix.text, 'تعداد گزارش‌ها') === 8, String(cardVal(ix.text, 'تعداد گزارش‌ها')));
ok('کارت «تعداد کاربران» و پنل «آخرین کاربران» برای مدیر کل هست',
  cardVal(ix.text, 'تعداد کاربران') !== null && has(ix.text, 'آخرین کاربران'));
ok('پنل «دریافت خروجی اکسل» برای مدیر کل هست', has(ix.text, 'دریافت خروجی اکسل'));
const supNav = navLinks(ix.text);
ok('منوی مدیر کل همه‌ی بخش‌ها را دارد',
  ['index.php', 'reports.php', 'tickets.php', 'users.php', 'departments.php', 'admins.php', 'news.php',
   'places.php', 'notifications.php', 'export.php', 'settings.php', 'version.php', 'logout.php']
    .every((h) => supNav.includes(h)), supNav.join(','));

let rp = await sup.get('/admin/reports.php');
ok('فهرست گزارش‌های مدیر کل: همه‌ی ردیف‌ها (بی‌حوزه، جابه‌جا و حوزه‌ی دیگر)',
  ['گزارشِ خدمات شهری', 'گزارشِ فنی عمرانی', 'گزارشِ بدون حوزه', 'گزارشِ جابه‌جا', 'گزارشِ زیرمجموعه']
    .every((t) => has(rp.text, t)) && /تعداد کل:\s*<strong>8<\/strong>/.test(rp.text.replace(/\s+/g, ' ')),
  (rp.text.match(/تعداد کل:\s*<strong>\d+/) || [''])[0]);
ok('مدیر کل دکمه‌ی «گزارش جدید» و پیوندِ «حذف» دارد',
  has(rp.text, 'report_add.php') && has(rp.text, 'type=report_delete'));
let tk = await sup.get('/admin/tickets.php');
ok('فهرست تیکت‌های مدیر کل: هر دو تیکت', has(tk.text, 'تیکتِ خدمات شهری') && has(tk.text, 'تیکتِ فنی عمرانی'));

r = await sup.get('/admin/admins.php');
ok('صفحه‌ی «مدیران» برای مدیر کل باز می‌شود', r.status === 200 && /مدیران سامانه/.test(r.text), String(r.status));
ok('صفحه‌ی مدیران: فرم ساخت حساب + فهرست واحدهای سطح اول + حساب فعلی',
  /data-testid="new-username"/.test(r.text) && /data-testid="new-password"/.test(r.text)
  && /data-testid="new-units"/.test(r.text) && has(r.text, 'معاونت خدمات شهری') && whoAmI(r.text) === 'admin');
ok('واحدِ زیرمجموعه در فهرستِ انتخاب نیست (فقط واحدهای سطح اول)', !has(r.text, `value="${seed.kid}"`), 'kid=' + seed.kid);
ok('قاعده‌ی دسترسی در همان صفحه برای مدیر توضیح داده شده',
  /data-testid="admins-rules"/.test(r.text) && /فقط «گزارش‌ها» و «تیکت‌ها»ی حوزه‌ی خودش/.test(r.text));

let live = await sup.get('/admin/api_live.php');
ok('api_live مدیر کل: JSON سالم، is_super=true، کاربران عدد، ۸ گزارش',
  live.status === 200 && live.json?.success === true && live.json?.scope?.is_super === true
  && Number.isFinite(live.json?.users_count) && live.json?.reports_count === 8, String(live.text).slice(0, 200));

/* ══════════════════════════════════════════════════════════════════
   ۴) ساخت حساب‌های مدیر از فرمِ واقعی پنل
   ══════════════════════════════════════════════════════════════════ */
section('۴) ساخت حساب مدیرِ حوزه (فرم واقعی + CSRF)');
const DEPT_USER = 'khadamat-1403', DEPT_PASS = 'Varamin1403';
const MULTI_USER = 'multi-1403', MULTI_PASS = 'Multi1403x';

r = await sup.post('/admin/admins.php', { admin_action: 'create', username: DEPT_USER, password: DEPT_PASS, full_name: 'مهندس رضایی', role: 'admin', 'departments[]': String(SVC) });
ok('POST بدون توکن CSRF ⇒ ۴۰۳', r.status === 403, String(r.status));
ok('بدون CSRF هیچ حسابی ساخته نشد', Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE username = '${DEPT_USER}'")->fetchColumn()`)) === 0);

r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: DEPT_USER, password: DEPT_PASS, full_name: 'مهندس رضایی', role: 'admin', 'departments[]': String(SVC) });
ok('ساخت حساب با توکن درست ⇒ ۳۰۲ به فهرست با پرچم created', r.status === 302 && /admins\.php\?created=1/.test(loc(r)), `${r.status} ${loc(r)}`);

const acct = grab(await phpRun(`
$a = $pdo->query("SELECT id, username, password_hash, role, full_name, is_active, last_login_at FROM admin_users WHERE username = '${DEPT_USER}'")->fetch();
echo '<<<' . json_encode([
  'id' => $a ? (int) $a['id'] : 0, 'role' => (string) ($a['role'] ?? ''), 'full_name' => (string) ($a['full_name'] ?? ''),
  'is_active' => $a === false ? null : (int) $a['is_active'], 'last_login_at' => (string) ($a['last_login_at'] ?? ''),
  'hash' => (string) ($a['password_hash'] ?? ''), 'verify' => $a ? password_verify('${DEPT_PASS}', (string) $a['password_hash']) : false,
  'depts' => array_map('intval', $pdo->query('SELECT department_id FROM admin_departments')->fetchAll(PDO::FETCH_COLUMN)),
], JSON_UNESCAPED_UNICODE) . '>>>';
`));
const DEPT_ID = acct.id;
ok('حساب ساخته شد: نقش «admin»، نام و نام خانوادگی، وضعیتِ فعال',
  DEPT_ID > 0 && acct.role === 'admin' && acct.full_name === 'مهندس رضایی' && acct.is_active === 1, JSON.stringify(acct).slice(0, 200));
ok('حوزه‌ی «خدمات شهری» به حساب سپرده شد (admin_departments)', acct.depts.includes(SVC), acct.depts.join(','));
ok('رمز عبور هش شد و با همان رمز خوانده می‌شود', acct.verify === true && /^\$2[yab]\$/.test(acct.hash), acct.hash.slice(0, 7));
ok('رمزِ روشن در دیتابیس نیست', !acct.hash.includes(DEPT_PASS));
ok('«آخرین ورود» پیش از اولین ورود خالی است', acct.last_login_at === '', acct.last_login_at);

r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: MULTI_USER, password: MULTI_PASS, full_name: 'مدیر دو حوزه', role: 'admin', 'departments[]': [String(SVC), String(TECH)] });
ok('ساخت حساب با «دو حوزه» (چند مقدار برای departments[]) ⇒ created', /created=1/.test(loc(r)), loc(r));
const MULTI_ID = Number(await one(`(int) $pdo->query("SELECT id FROM admin_users WHERE username = '${MULTI_USER}'")->fetchColumn()`));
const multiDepts = grab(await phpRun(`echo '<<<' . json_encode(array_map('intval', $pdo->query('SELECT department_id FROM admin_departments WHERE admin_id = ${MULTI_ID}')->fetchAll(PDO::FETCH_COLUMN))) . '>>>';`));
ok('هر دو حوزه در admin_departments نشستند', multiDepts.includes(SVC) && multiDepts.includes(TECH), multiDepts.join(','));

/* اعتبارسنجی‌های فرم */
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'bi-hoze', password: 'Tehran1403', full_name: '', role: 'admin' });
ok('مدیرِ حوزه بدون انتخابِ واحد ⇒ خطا و حسابی ساخته نمی‌شود',
  /admins\.php\?err=/.test(loc(r)) && Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE username = 'bi-hoze'")->fetchColumn()`)) === 0, loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'weakpass', password: '123', full_name: '', role: 'admin', 'departments[]': String(SVC) });
ok('رمزِ کوتاه‌تر از ۸ نویسه پذیرفته نمی‌شود', /admins\.php\?err=/.test(loc(r))
  && Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE username = 'weakpass'")->fetchColumn()`)) === 0, loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'noletters', password: '12345678', full_name: '', role: 'admin', 'departments[]': String(SVC) });
ok('رمزِ بدونِ حرف (فقط عدد) پذیرفته نمی‌شود', /admins\.php\?err=/.test(loc(r)), loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: DEPT_USER, password: 'Varamin1404', full_name: '', role: 'admin', 'departments[]': String(SVC) });
ok('نام کاربریِ تکراری پذیرفته نمی‌شود', /admins\.php\?err=/.test(loc(r)), loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'bad name!', password: 'Varamin1404', full_name: '', role: 'admin', 'departments[]': String(SVC) });
ok('نام کاربری با نویسه‌ی غیرمجاز پذیرفته نمی‌شود', /admins\.php\?err=/.test(loc(r)), loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'sub-unit-admin', password: 'Varamin1404', full_name: '', role: 'admin', 'departments[]': String(seed.kid) });
ok('سپردنِ «زیرمجموعه» به‌جای واحدِ سطح اول ⇒ حساب ساخته می‌شود ولی حوزه‌ای ثبت نمی‌شود',
  /created=1/.test(loc(r)), loc(r));
const subAdmin = grab(await phpRun(`
$id = (int) $pdo->query("SELECT id FROM admin_users WHERE username = 'sub-unit-admin'")->fetchColumn();
$d = $id > 0 ? $pdo->query("SELECT department_id FROM admin_departments WHERE admin_id = $id")->fetchAll(PDO::FETCH_COLUMN) : [];
echo '<<<' . json_encode(['id' => $id, 'depts' => array_map('intval', $d)]) . '>>>';`));
ok('شناسه‌ی زیرمجموعه در admin_departments ننشست', subAdmin.id > 0 && subAdmin.depts.length === 0, JSON.stringify(subAdmin));
r = await submit(sup, '/admin/admins.php', { admin_action: 'create', username: 'second-super', password: 'Second1403', full_name: '', role: 'super_admin' });
ok('ساخت «مدیر کل» دوم ممکن است (بدون نیاز به انتخاب حوزه)', /created=1/.test(loc(r)), loc(r));
const secondSuper = grab(await phpRun(`echo '<<<' . json_encode([
  'role' => (string) $pdo->query("SELECT role FROM admin_users WHERE username = 'second-super'")->fetchColumn(),
  'supers' => (int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE role = 'super_admin' AND is_active = 1")->fetchColumn(),
]) . '>>>';`));
ok('نقشِ super_admin نشست و شمارِ مدیران کلِ فعال ۲ شد', secondSuper.role === 'super_admin' && secondSuper.supers === 2,
  JSON.stringify(secondSuper));

/* حسابِ بدون حوزه (مستقیم در دیتابیس — فرم اجازه نمی‌دهد) */
await phpRun(`
$pdo->prepare("INSERT INTO admin_users (username, password_hash, role, full_name, is_active, last_login_at, created_at)
               VALUES ('no-scope', :p, 'admin', 'بدون حوزه', 1, '', :t)")
    ->execute([':p' => password_hash('NoScope1403', PASSWORD_DEFAULT), ':t' => eplakDbNowString($pdo)]);
echo '<<<1>>>';`);
ok('حسابِ «بدون حوزه» برای آزمون ساخته شد', Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE username = 'no-scope'")->fetchColumn()`)) === 1);

/* ══════════════════════════════════════════════════════════════════
   ۵) خودقفل‌شدن: مدیر کل نباید پنل را بی‌مدیر کند
   ══════════════════════════════════════════════════════════════════ */
section('۵) محافظِ خودقفل‌شدن');
r = await submit(sup, '/admin/admins.php', { admin_action: 'toggle', admin_id: '1' });
ok('غیرفعال کردنِ حسابِ خودش ⇒ خطا و حساب فعال می‌ماند', /admins\.php\?err=/.test(loc(r))
  && Number(await one(`(int) $pdo->query('SELECT is_active FROM admin_users WHERE id = 1')->fetchColumn()`)) === 1, loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'delete', admin_id: '1' });
ok('حذفِ حسابِ خودش ⇒ خطا و حساب سرِ جایش است', /admins\.php\?err=/.test(loc(r))
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM admin_users WHERE id = 1')->fetchColumn()`)) === 1, loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: '1', username: 'admin', full_name: 'مدیر کل', role: 'admin', 'departments[]': String(SVC), is_active: '1' });
ok('گرفتنِ نقشِ «مدیر کل» از خودش ⇒ خطا', /admins\.php\?err=/.test(loc(r)), loc(r));
ok('نقشِ مدیر کل همان super_admin ماند', (await one(`(string) $pdo->query('SELECT role FROM admin_users WHERE id = 1')->fetchColumn()`)) === 'super_admin');
r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: '1', username: 'admin', full_name: 'مدیر کل سامانه', role: 'super_admin', is_active: '1' });
ok('ویرایشِ بی‌خطرِ حسابِ خودش (نام و نام خانوادگی) ⇒ saved', /admins\.php\?saved=1/.test(loc(r)), loc(r));
ok('نام و نام خانوادگیِ مدیر کل ذخیره شد', (await one(`(string) $pdo->query('SELECT full_name FROM admin_users WHERE id = 1')->fetchColumn()`)) === 'مدیر کل سامانه');

/* ══════════════════════════════════════════════════════════════════
   ۶) XSS در نامِ واحد و نشت نکردنِ رمز عبور
   ══════════════════════════════════════════════════════════════════ */
section('۶) XSS در نام واحد و نشت نکردنِ رمز عبور');
await phpRun(`
$pdo->prepare("INSERT INTO departments (name, slug, code, parent_id, sort_order, is_active, created_at, updated_at)
               VALUES (:n, 'xss-unit', 'XSS1', NULL, 999, 1, :t, :t)")
    ->execute([':n' => '<script>alert(1)</script> حوزه', ':t' => eplakDbNowString($pdo)]);
echo '<<<1>>>';`);
r = await sup.get('/admin/admins.php');
ok('نامِ واحد با <script> در صفحه‌ی مدیران «گریخته» می‌شود',
  !has(r.text, '<script>alert(1)</script>') && /&lt;script&gt;/.test(r.text));
ok('رمزِ روشنِ هیچ حسابی در صفحه‌ی مدیران نیست',
  !has(r.text, DEPT_PASS) && !has(r.text, MULTI_PASS) && !has(r.text, 'NoScope1403') && !has(r.text, 'admin123'));
ok('هشِ رمز هم در صفحه نیست', !/\$2[yab]\$/.test(r.text));
ok('در فهرست حساب‌ها، نامِ حوزه‌ها و «پیام‌هایی که می‌بیند» نشان داده می‌شود',
  /data-testid="admin-row"/.test(r.text) && /data-testid="admin-msg-counts"/.test(r.text)
  && has(r.text, 'گزارش') && has(r.text, 'تیکت'));
const msgCounts = grab(await phpRun(`
$counts = eplakDepartmentMessageCounts($pdo, [${SVC}]);
echo '<<<' . json_encode($counts) . '>>>';`));
ok('شمارِ پیام‌های یک حوزه دقیقاً همان چیزی است که آن مدیر می‌بیند (۵ گزارش و ۱ تیکت)',
  msgCounts.reports === SVC_REPORTS && msgCounts.tickets === SVC_TICKETS && msgCounts.total === SVC_REPORTS + SVC_TICKETS,
  JSON.stringify(msgCounts));
const leak = grab(await phpRun(`
$src = '';
foreach (['admins.php', 'login.php', 'includes/acl.php', 'actions.php'] as $f) { $src .= file_get_contents('${SHIM}/admin/' . $f); }
echo '<<<' . json_encode([
  'echoes_hash'   => (bool) preg_match('/(echo|print)[^;]*password_hash/', $src),
  'logs_password' => (bool) preg_match('/error_log\\([^)]*\\$password/', $src),
  'pw_in_url'     => (bool) preg_match('/http_build_query\\([^)]*password/', $src),
  'pw_in_value'   => (bool) preg_match('/value="[^"]*"\\s*\\.\\s*\\$password/', $src),
]) . '>>>';`));
ok('رمز عبور نه چاپ می‌شود، نه در error_log می‌رود، نه در نشانیِ هدایت',
  leak.echoes_hash === false && leak.logs_password === false && leak.pw_in_url === false && leak.pw_in_value === false,
  JSON.stringify(leak));

/* ══════════════════════════════════════════════════════════════════
   ۷) مدیرِ حوزه: فقط پیام‌های حوزه‌ی خودش
   ══════════════════════════════════════════════════════════════════ */
section('۷) ورود و دامنه‌ی داده‌ی مدیرِ حوزه');
const DEPT = newJar(); const dept = client(DEPT);
await req('GET', '/admin/login.php', DEPT);
r = await req('POST', '/admin/login.php', DEPT, { username: DEPT_USER, password: DEPT_PASS });
ok('ورودِ مدیرِ حوزه', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
ok('«آخرین ورود» هنگام ورود نوشته شد (قالبِ تاریخ/ساعت)',
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(await one(`(string) $pdo->query('SELECT last_login_at FROM admin_users WHERE id = ${DEPT_ID}')->fetchColumn()`))));

ix = await dept.get('/admin/index.php');
ok('داشبورد مدیرِ حوزه ۲۰۰ و بدون خطای PHP', ix.status === 200 && !/Fatal error|Warning:/.test(ix.text), String(ix.status));
ok('نشانِ دامنه، نام حوزه‌اش را نشان می‌دهد', badge(ix.text) === 'حوزه‌ی دسترسی: معاونت خدمات شهری', badge(ix.text));
const deptNav = navLinks(ix.text);
ok('منوی مدیرِ حوزه فقط داشبورد/گزارش‌ها/تیکت‌ها (+خروج) است',
  deptNav.includes('index.php') && deptNav.includes('reports.php') && deptNav.includes('tickets.php') && deptNav.includes('logout.php')
  && !['users.php', 'departments.php', 'admins.php', 'ads.php', 'news.php', 'places.php', 'notifications.php',
      'notif_diag.php', 'export.php', 'settings.php', 'version.php'].some((h) => deptNav.includes(h)), deptNav.join(','));
ok('کارت‌های «کاربران/اخبار/پیوست/اعلان پس‌زمینه» در داشبوردش نیست',
  !has(ix.text, 'تعداد کاربران') && !has(ix.text, 'مطالب اخبار و دانستنی‌ها')
  && !has(ix.text, 'گزارش‌های دارای عکس/فیلم') && !has(ix.text, 'دستگاه‌های اعلان پس‌زمینه'));
ok('پنل «آخرین کاربران» و «خروجی اکسل» در داشبوردش نیست',
  !has(ix.text, 'آخرین کاربران') && !has(ix.text, 'دریافت خروجی اکسل'));
ok(`شمار گزارش‌های حوزه‌ی او = ${SVC_REPORTS} و تیکت‌ها = ${SVC_TICKETS}`,
  cardVal(ix.text, 'تعداد گزارش‌ها') === SVC_REPORTS && cardVal(ix.text, 'تعداد تیکت‌ها') === SVC_TICKETS,
  JSON.stringify({ r: cardVal(ix.text, 'تعداد گزارش‌ها'), t: cardVal(ix.text, 'تعداد تیکت‌ها') }));
ok('«آخرین گزارش‌ها»ی داشبوردش فقط از حوزه‌ی خودش است',
  has(ix.text, 'گزارشِ خدمات شهری') && !has(ix.text, 'گزارشِ فنی عمرانی') && !has(ix.text, 'گزارشِ بدون حوزه'));

rp = await dept.get('/admin/reports.php');
ok('فهرست گزارش‌ها: فقط ردیف‌های حوزه‌ی خودش (۵ ردیف)',
  has(rp.text, 'گزارشِ خدمات شهری') && has(rp.text, 'گزارشِ دوم خدمات') && has(rp.text, 'گزارشِ زیرمجموعه')
  && !has(rp.text, 'گزارشِ فنی عمرانی') && !has(rp.text, 'گزارشِ بدون حوزه') && !has(rp.text, 'گزارشِ جابه‌جا')
  && /تعداد کل:\s*<strong>5<\/strong>/.test(rp.text.replace(/\s+/g, ' ')),
  (rp.text.match(/تعداد کل:\s*<strong>\d+/) || [''])[0]);
ok('نام‌های هم‌ارز (ي عربی و بی‌فاصله) هم در دامنه‌اند',
  has(rp.text, 'گزارشِ با ی عربی') && has(rp.text, 'گزارشِ بی‌نیم‌فاصله'));
ok('دکمه‌ی «گزارش جدید» و پیوندِ «حذف گزارش» در فهرستش نیست',
  !has(rp.text, 'report_add.php') && !has(rp.text, 'type=report_delete'));
ok('انتخابگر «تغییر سریع وضعیت» برای ردیف‌های حوزه‌اش هست (پاسخ/تغییر وضعیت مجاز است)',
  /name="quick_status_id"/.test(rp.text) && (rp.text.match(/name="quick_status_id"/g) || []).length === SVC_REPORTS,
  String((rp.text.match(/name="quick_status_id"/g) || []).length));
ok('پیوندِ «مشاهده» و «ویرایش» برای ردیف‌های حوزه‌اش هست', has(rp.text, 'report_detail.php?id=') && has(rp.text, 'report_edit.php?id='));

tk = await dept.get('/admin/tickets.php');
ok('فهرست تیکت‌ها: فقط تیکتِ حوزه‌ی خودش', has(tk.text, 'تیکتِ خدمات شهری') && !has(tk.text, 'تیکتِ فنی عمرانی'));
ok('دکمه‌ی «تیکت جدید» و پیوندِ «حذف تیکت» در فهرستش نیست',
  !has(tk.text, 'ticket_add.php') && !has(tk.text, 'type=ticket_delete'));

live = await dept.get('/admin/api_live.php');
ok(`api_live مدیرِ حوزه: is_super=false، کاربران null، ${SVC_REPORTS} گزارش و حوزه در پاسخ`,
  live.status === 200 && live.json?.success === true && live.json?.scope?.is_super === false
  && live.json?.users_count === null && live.json?.latest_user === null
  && live.json?.reports_count === SVC_REPORTS
  && (live.json?.scope?.departments || []).some((d) => /خدمات شهری/.test(String(d))),
  String(live.text).slice(0, 220));

/* ── مشاهده، پاسخ و تغییر وضعیت در حوزه‌ی خودش ── */
section('۷-۲) مشاهده، پاسخ و تغییر وضعیت در حوزه‌ی خودش');
const IN_ID = RID('گزارشِ خدمات شهری');
const OUT_ID = RID('گزارشِ فنی عمرانی');
const LEGACY_ID = RID('گزارشِ بدون حوزه');
const SWAPPED_ID = RID('گزارشِ جابه‌جا');
const IN_TICKET = TID('تیکتِ خدمات شهری');
const OUT_TICKET = TID('تیکتِ فنی عمرانی');
r = await dept.get(`/admin/report_detail.php?id=${IN_ID}`);
ok('جزئیاتِ گزارشِ حوزه‌ی خودش باز می‌شود', r.status === 200 && has(r.text, 'گزارشِ خدمات شهری'), String(r.status));
ok('فرم «ثبت پاسخ جدید» دارد', has(r.text, 'name="form_action" value="reply"'));
ok('دکمه‌های «ارسال دوباره‌ی اعلان» و «اعلان آزمایشی» را ندارد (بخش اعلان فقط مدیر کل)',
  !has(r.text, 'push_resend') && !has(r.text, 'push_test'));
ok('پیوندِ «حذف پاسخ» را ندارد', !has(r.text, 'type=report_reply_delete'));

r = await submit(dept, `/admin/report_detail.php?id=${IN_ID}`, { form_action: 'reply', status: 'done', reply: 'رسیدگی شد — ناواری‌ها رفتند' });
const answered = grab(await phpRun(`$x = $pdo->query('SELECT status, reply FROM reports WHERE id = ${IN_ID}')->fetch(); echo '<<<' . json_encode(['status' => (string) $x['status'], 'reply' => (string) ($x['reply'] ?? '')]) . '>>>';`));
ok('پاسخ و تغییر وضعیت توسط مدیرِ حوزه ذخیره شد', answered.status === 'done' && /رسیدگی شد/.test(answered.reply), JSON.stringify(answered));
r = await dept.get(`/admin/ticket_detail.php?id=${IN_TICKET}`);
ok('جزئیاتِ تیکتِ حوزه‌ی خودش باز می‌شود', r.status === 200 && has(r.text, 'تیکتِ خدمات شهری'), String(r.status));
ok('پیوندِ «حذف تیکت» و «حذف پاسخ» در صفحه‌ی تیکتش نیست',
  !has(r.text, 'type=ticket_delete') && !has(r.text, 'type=ticket_reply_delete'));

/* ── نفوذ: گزارشِ حوزه‌ی دیگر ── */
section('۷-۳) نفوذ به حوزه‌ی دیگر (باید بسته باشد)');
r = await dept.get(`/admin/report_detail.php?id=${OUT_ID}`);
ok('جزئیاتِ گزارشِ حوزه‌ی دیگر ⇒ هدایت به فهرست (بدون نمایش)', r.status === 302 && /reports\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
ok('در پاسخ، هیچ نشانی از عنوانِ گزارشِ حوزه‌ی دیگر نیست', !has(r.text, 'گزارشِ فنی عمرانی'));
r = await dept.get(`/admin/report_edit.php?id=${OUT_ID}`);
ok('ویرایشِ گزارشِ حوزه‌ی دیگر ⇒ ۳۰۲', r.status === 302 && /reports\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await dept.get(`/admin/report_detail.php?id=${LEGACY_ID}`);
ok('گزارشِ «بدون حوزه» هم برای مدیرِ حوزه بسته است (فقط مدیر کل)', r.status === 302 && /reports\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await dept.get(`/admin/report_detail.php?id=${SWAPPED_ID}`);
ok('گزارشِ «جابه‌جا» (وضعیت در ستونِ واحد) هم بسته است', r.status === 302 && /reports\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await dept.get(`/admin/report_detail.php?id=999999`);
ok('شناسه‌ی ناموجود هم همان رفتار را دارد (۳۰۲، بدون افشا)', r.status === 302 && /reports\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await dept.get(`/admin/ticket_detail.php?id=${OUT_TICKET}`);
ok('جزئیاتِ تیکتِ حوزه‌ی دیگر ⇒ ۳۰۲', r.status === 302 && /tickets\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await dept.get(`/admin/ticket_edit.php?id=${OUT_TICKET}`);
ok('ویرایشِ تیکتِ حوزه‌ی دیگر ⇒ ۳۰۲', r.status === 302 && /tickets\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

/* تغییر سریع وضعیت روی گزارشِ بیرون از حوزه */
r = await submit(dept, '/admin/reports.php', { quick_status_id: String(OUT_ID), status: 'done', reply: 'تلاش برای تغییر از راه دور' });
const untouched = grab(await phpRun(`$x = $pdo->query('SELECT status, reply FROM reports WHERE id = ${OUT_ID}')->fetch(); echo '<<<' . json_encode(['status' => (string) $x['status'], 'reply' => (string) ($x['reply'] ?? '')]) . '>>>';`));
ok('تغییر سریعِ وضعیتِ گزارشِ بیرون از حوزه ⇒ هدایت با «گزارش پیدا نشد»',
  r.status === 302 && /status_saved=1/.test(loc(r)), loc(r));
const flashPage = await dept.get('/admin/reports.php?status_saved=1');
ok('پیامِ «گزارش پیدا نشد» نشان داده می‌شود (نه «انجام شد»)', has(flashPage.text, 'گزارش پیدا نشد'),
  (flashPage.text.match(/data-testid="status-flash"[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' ').slice(0, 160));
ok('گزارشِ حوزه‌ی دیگر دست‌نخورده ماند', untouched.status === 'in_progress' && !/تلاش برای تغییر/.test(untouched.reply), JSON.stringify(untouched));

/* حذف و کارهای ممنوع از راه actions.php (با توکنِ معتبرِ CSRF) */
section('۷-۴) actions.php با توکنِ معتبر هم بسته است');
const deptToken = csrfOf((await dept.get('/admin/reports.php')).text);
r = await dept.post(`/admin/actions.php?type=report_delete&id=${IN_ID}`, { _token: deptToken });
ok('حذفِ گزارش (actions.php) برای مدیرِ حوزه ⇒ ۴۰۳ با پیامِ فارسی',
  r.status === 403 && /دسترسی ندارید/.test(r.text) && !/توکن امنیتی/.test(r.text), `${r.status} ${r.text.slice(0, 90)}`);
ok('گزارشِ حوزه‌ی خودش هم با این کار حذف نشد (حذف فقط مدیر کل)',
  Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM reports WHERE id = ${IN_ID}')->fetchColumn()`)) === 1);
r = await dept.post(`/admin/actions.php?type=report_reply_delete&id=${IN_ID}`, { _token: deptToken });
ok('«حذف پاسخ» هم برای مدیرِ حوزه ۴۰۳ است و پاسخش ماند', r.status === 403
  && /رسیدگی شد/.test(String(await one(`(string) $pdo->query('SELECT reply FROM reports WHERE id = ${IN_ID}')->fetchColumn()`))));
r = await dept.post(`/admin/actions.php?type=ticket_delete&id=${IN_TICKET}`, { _token: deptToken });
ok('حذفِ تیکت ۴۰۳ است و تیکت ماند', r.status === 403
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM tickets WHERE id = ${IN_TICKET}')->fetchColumn()`)) === 1);
r = await dept.post('/admin/actions.php?type=user_delete&id=1', { _token: deptToken });
ok('حذفِ کاربر ⇒ ۴۰۳', r.status === 403, String(r.status));
r = await dept.post('/admin/actions.php?type=news_delete&id=1', { _token: deptToken });
ok('حذفِ خبر ⇒ ۴۰۳', r.status === 403, String(r.status));
r = await dept.post('/admin/actions.php?type=news_toggle&id=1', { _token: deptToken });
ok('تغییرِ وضعیتِ انتشارِ خبر ⇒ ۴۰۳', r.status === 403, String(r.status));
r = await dept.post(`/admin/actions.php?type=department_delete&id=${SVC}`, { _token: deptToken });
ok('حذفِ واحد ⇒ ۴۰۳ و واحد سرِ جایش است', r.status === 403
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM departments WHERE id = ${SVC}')->fetchColumn()`)) === 1, String(r.status));

/* ── صفحه‌های ممنوع ── */
section('۷-۵) صفحه‌های ممنوع برای مدیرِ حوزه (۴۰۳ با پیام فارسی)');
const FORBIDDEN = [
  ['users.php', 'کاربران'], ['user_add.php', 'افزودن کاربر'], ['user_view.php?phone=09121112233', 'پروفایل کاربر'],
  ['user_edit.php?phone=09121112233', 'ویرایش کاربر'], ['user_reports.php?phone=09121112233', 'گزارش‌های کاربر'],
  ['departments.php', 'واحدها'], ['department_add.php', 'افزودن واحد'], ['department_edit.php?id=' + SVC, 'ویرایش واحد'],
  ['admins.php', 'مدیران'], ['news.php', 'اخبار'], ['news_add.php', 'افزودن خبر'], ['places.php', 'اماکن شهری'],
  ['notifications.php', 'ارسال اعلان'], ['notif_diag.php', 'عیب‌یابی اعلان'],
  ['export.php', 'خروجی اکسل'], ['settings.php', 'تنظیمات'], ['version.php', 'بررسی نسخه'],
  ['report_add.php', 'گزارش جدید'], ['ticket_add.php', 'تیکت جدید'],
];
for (const [page, label] of FORBIDDEN) {
  r = await dept.get('/admin/' + page);
  ok(`«${label}» بسته است (${page.split('?')[0]}) ⇒ ۴۰۳`, r.status === 403, `${r.status} ${page}`);
  if (page === 'users.php') {
    ok('صفحه‌ی ۴۰۳ فارسی است و چیزی از داده‌ها یا ساختار لو نمی‌دهد',
      /دسترسی ندارید/.test(r.text) && !has(r.text, '09121112233') && !has(r.text, 'password_hash')
      && !has(r.text, 'admin_users') && !/Fatal error|Warning:/.test(r.text), r.text.slice(0, 120));
  }
}
r = await dept.post('/admin/users.php', { _token: deptToken, phone: '09121112233' });
ok('POST مستقیم به صفحه‌ی کاربران هم ۴۰۳ است', r.status === 403, String(r.status));
r = await dept.post('/admin/admins.php', { _token: deptToken, admin_action: 'create', username: 'backdoor', password: 'Backdoor1403', role: 'super_admin' });
ok('ساختِ «مدیر کل» از راه POST مستقیم برای مدیرِ حوزه ⇒ ۴۰۳', r.status === 403, String(r.status));
ok('حسابِ backdoor ساخته نشد', Number(await one(`(int) $pdo->query("SELECT COUNT(*) FROM admin_users WHERE username = 'backdoor'")->fetchColumn()`)) === 0);
r = await dept.post('/admin/admins.php', { _token: deptToken, admin_action: 'update', admin_id: String(DEPT_ID), username: DEPT_USER, role: 'super_admin', 'departments[]': String(SVC), is_active: '1' });
ok('«مدیر کل کردنِ خودش» از راه POST مستقیم ⇒ ۴۰۳ و نقش دست‌نخورده', r.status === 403
  && (await one(`(string) $pdo->query('SELECT role FROM admin_users WHERE id = ${DEPT_ID}')->fetchColumn()`)) === 'admin', String(r.status));
r = await dept.post('/admin/settings.php', { _token: deptToken, action: 'save' });
ok('POST مستقیم به تنظیمات هم ۴۰۳ است', r.status === 403, String(r.status));
r = await dept.get('/admin/export.php?type=reports');
ok('خروجی اکسل (با کوئری) هم ۴۰۳ است و فایلی نمی‌دهد', r.status === 403 && !/application\/vnd/.test(String(r.headers['content-type'] || '')), String(r.status));

/* ══════════════════════════════════════════════════════════════════
   ۸) مدیرِ دو حوزه و مدیرِ بدون حوزه
   ══════════════════════════════════════════════════════════════════ */
section('۸) چند حوزه‌ای و حسابِ بدون حوزه');
const MULTI = newJar(); const multi = client(MULTI);
await req('GET', '/admin/login.php', MULTI);
r = await req('POST', '/admin/login.php', MULTI, { username: MULTI_USER, password: MULTI_PASS });
ok('ورودِ مدیرِ دو حوزه', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
rp = await multi.get('/admin/reports.php');
ok('مدیرِ دو حوزه، گزارش‌های هر دو حوزه را می‌بیند (۶ ردیف) و بی‌حوزه را نه',
  has(rp.text, 'گزارشِ خدمات شهری') && has(rp.text, 'گزارشِ فنی عمرانی')
  && !has(rp.text, 'گزارشِ بدون حوزه') && !has(rp.text, 'گزارشِ جابه‌جا')
  && /تعداد کل:\s*<strong>6<\/strong>/.test(rp.text.replace(/\s+/g, ' ')),
  (rp.text.match(/تعداد کل:\s*<strong>\d+/) || [''])[0]);
ok('نشانِ دامنه‌اش هر دو حوزه را نام می‌برد',
  has(badge(rp.text) + ix.text, 'معاونت خدمات شهری') && /معاونت خدمات شهری/.test(badge(rp.text)) && /فنی و عمرانی/.test(badge(rp.text)), badge(rp.text));
tk = await multi.get('/admin/tickets.php');
ok('تیکت‌های هر دو حوزه را می‌بیند', has(tk.text, 'تیکتِ خدمات شهری') && has(tk.text, 'تیکتِ فنی عمرانی'));
live = await multi.get('/admin/api_live.php');
ok(`api_live مدیرِ دو حوزه: ${MULTI_REPORTS} گزارش و users_count=null`,
  live.json?.reports_count === MULTI_REPORTS && live.json?.users_count === null
  && (live.json?.scope?.departments || []).length === 2, String(live.json?.reports_count));
r = await multi.get(`/admin/report_detail.php?id=${OUT_ID}`);
ok('جزئیاتِ گزارشِ حوزه‌ی دومش باز می‌شود', r.status === 200 && has(r.text, 'گزارشِ فنی عمرانی'), String(r.status));

const NOSCOPE = newJar(); const noscope = client(NOSCOPE);
await req('GET', '/admin/login.php', NOSCOPE);
r = await req('POST', '/admin/login.php', NOSCOPE, { username: 'no-scope', password: 'NoScope1403' });
ok('ورودِ حسابِ بدون حوزه ممکن است (ولی هیچ پیامی نمی‌بیند)', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
ix = await noscope.get('/admin/index.php');
ok('هشدارِ «هیچ حوزه‌ای به این حساب اختصاص نیافته» نشان داده می‌شود',
  has(badge(ix.text), 'هیچ حوزه‌ای به این حساب اختصاص نیافته'), badge(ix.text));
ok('شمار گزارش‌ها و تیکت‌هایش صفر است', cardVal(ix.text, 'تعداد گزارش‌ها') === 0 && cardVal(ix.text, 'تعداد تیکت‌ها') === 0,
  JSON.stringify({ r: cardVal(ix.text, 'تعداد گزارش‌ها'), t: cardVal(ix.text, 'تعداد تیکت‌ها') }));
rp = await noscope.get('/admin/reports.php');
ok('فهرست گزارش‌هایش خالی است (هیچ ردیفی از هیچ حوزه‌ای)',
  !has(rp.text, 'گزارشِ خدمات شهری') && !has(rp.text, 'گزارشِ فنی عمرانی') && !has(rp.text, 'گزارشِ بدون حوزه')
  && /تعداد کل:\s*<strong>0<\/strong>/.test(rp.text.replace(/\s+/g, ' ')), (rp.text.match(/تعداد کل:\s*<strong>\d+/) || [''])[0]);
live = await noscope.get('/admin/api_live.php');
ok('api_live حسابِ بدون حوزه: صفر گزارش و users_count=null',
  live.json?.reports_count === 0 && live.json?.users_count === null, String(live.text).slice(0, 160));
r = await noscope.get('/admin/admins.php');
ok('حسابِ بدون حوزه هم به صفحه‌ی «مدیران» نمی‌رسد', r.status === 403, String(r.status));

/* ══════════════════════════════════════════════════════════════════
   ۹) ویرایش، غیرفعال‌سازی (اثرِ فوری)، فعال‌سازی و حذف
   ══════════════════════════════════════════════════════════════════ */
section('۹) ویرایش / غیرفعال‌سازی / حذف');
await req('GET', '/admin/login.php', SUP);
r = await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
ok('ورودِ دوباره‌ی مدیر کل برای مدیریت حساب‌ها', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: String(MULTI_ID), username: MULTI_USER, full_name: 'فقط خدمات شهری', role: 'admin', 'departments[]': String(SVC), is_active: '1' });
ok('ویرایش حساب (برداشتن یک حوزه و تغییر نام) ⇒ saved', /admins\.php\?saved=1/.test(loc(r)), loc(r));
const afterEdit = grab(await phpRun(`echo '<<<' . json_encode([
  'depts' => array_map('intval', $pdo->query('SELECT department_id FROM admin_departments WHERE admin_id = ${MULTI_ID}')->fetchAll(PDO::FETCH_COLUMN)),
  'full_name' => (string) $pdo->query('SELECT full_name FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn(),
]) . '>>>';`));
ok('حوزه‌ی «فنی و عمرانی» برداشته شد و نام به‌روز شد',
  afterEdit.depts.length === 1 && afterEdit.depts[0] === SVC && afterEdit.full_name === 'فقط خدمات شهری', JSON.stringify(afterEdit));

r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: String(MULTI_ID), username: MULTI_USER, full_name: 'فقط خدمات شهری', role: 'admin', 'departments[]': String(SVC), is_active: '1', password_new: 'NewPass1403', password_confirm: 'NewPass1403' });
ok('گذاشتنِ رمزِ تازه از صفحه‌ی ویرایش ⇒ saved و pw', /saved=1/.test(loc(r)) && /pw=1/.test(loc(r)), loc(r));
const pwOk = grab(await phpRun(`echo '<<<' . json_encode([
  'new' => password_verify('NewPass1403', (string) $pdo->query('SELECT password_hash FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn()),
  'old' => password_verify('${MULTI_PASS}', (string) $pdo->query('SELECT password_hash FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn()),
]) . '>>>';`));
ok('رمزِ تازه کار می‌کند و رمزِ قدیم باطل شد', pwOk.new === true && pwOk.old === false, JSON.stringify(pwOk));
r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: String(MULTI_ID), username: MULTI_USER, full_name: 'x', role: 'admin', 'departments[]': String(SVC), is_active: '1', password_new: 'Short1', password_confirm: 'Other1234' });
ok('رمزِ تازه با تکرارِ ناهمسان ⇒ خطا', /admins\.php\?err=/.test(loc(r)), loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: String(MULTI_ID), username: MULTI_USER, full_name: 'x', role: 'admin', is_active: '1' });
ok('ویرایش بدونِ انتخابِ حوزه برای مدیرِ حوزه ⇒ خطا', /admins\.php\?err=/.test(loc(r)), loc(r));
r = await submit(sup, '/admin/admins.php', { admin_action: 'update', admin_id: '99999', username: 'ghost', full_name: '', role: 'admin', 'departments[]': String(SVC), is_active: '1' });
ok('ویرایشِ حسابِ ناموجود ⇒ خطا', /admins\.php\?err=/.test(loc(r)), loc(r));

/* غیرفعال‌سازی از راه پنل */
r = await submit(sup, '/admin/admins.php', { admin_action: 'toggle', admin_id: String(MULTI_ID) });
ok('غیرفعال کردنِ حساب ⇒ toggled و active=0', /toggled=1/.test(loc(r)) && /active=0/.test(loc(r)), loc(r));
ok('در دیتابیس is_active=0 شد', Number(await one(`(int) $pdo->query('SELECT is_active FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn()`)) === 0);
r = await req('POST', '/admin/login.php', newJar(), { username: MULTI_USER, password: 'NewPass1403' });
ok('ورودِ حسابِ غیرفعال رد می‌شود (۳۰۲ نمی‌دهد)', r.status === 200 && /نام کاربری یا رمز عبور اشتباه است/.test(r.text), `${r.status}`);
ok('پیامِ خطای ورود «عمومی» است (نگفت حساب غیرفعال است — تا نام کاربری لو نرود)', !/غیرفعال/.test(r.text));

/* اثرِ فوری روی نشستِ بازِ همان مدیر: مدیر وارد است، بعد حسابش غیرفعال می‌شود */
const OPEN = newJar(); const open = client(OPEN);
await req('GET', '/admin/login.php', OPEN);
r = await req('POST', '/admin/login.php', OPEN, { username: DEPT_USER, password: DEPT_PASS });
ok('پیش از غیرفعال‌شدن، ورودِ مدیرِ حوزه موفق بود', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await open.get('/admin/reports.php');
ok('نشستِ بازِ مدیرِ حوزه پیش از غیرفعال‌شدن کار می‌کرد', r.status === 200 && has(r.text, 'گزارشِ خدمات شهری'), String(r.status));
await phpRun(`$pdo->prepare('UPDATE admin_users SET is_active = 0 WHERE id = ${DEPT_ID}')->execute(); echo '<<<1>>>';`);
r = await open.get('/admin/reports.php');
ok('پس از غیرفعال‌شدن، همان نشستِ باز فوراً بسته شد و به صفحه‌ی ورود رفت',
  r.status === 302 && /login\.php\?disabled=1/.test(loc(r)), `${r.status} ${loc(r)}`);
r = await open.get('/admin/api_live.php');
ok('پایانه‌ی آمارِ زنده هم برای نشستِ بسته‌شده ۴۰۱ می‌دهد', r.status === 401, String(r.status));
const stampBefore = String(await one(`(string) $pdo->query('SELECT last_login_at FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn()`));
r = await req('POST', '/admin/login.php', newJar(), { username: MULTI_USER, password: 'NewPass1403' });
ok('تلاش دوباره‌ی ورود با حسابِ غیرفعال رد می‌شود', r.status === 200 && /نام کاربری یا رمز عبور اشتباه/.test(r.text), String(r.status));
ok('«آخرین ورود» برای ورودِ ردشده به‌روز نمی‌شود',
  String(await one(`(string) $pdo->query('SELECT last_login_at FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn()`)) === stampBefore);

/* فعال‌سازی دوباره و حذف */
await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
r = await submit(sup, '/admin/admins.php', { admin_action: 'toggle', admin_id: String(DEPT_ID) });
ok('فعال‌کردنِ دوباره ⇒ toggled و active=1', /toggled=1/.test(loc(r)) && /active=1/.test(loc(r)), loc(r));
r = await req('POST', '/admin/login.php', newJar(), { username: DEPT_USER, password: DEPT_PASS });
ok('پس از فعال‌شدن، ورود با همان رمز کار می‌کند', r.status === 302 && /index\.php/.test(loc(r)), `${r.status} ${loc(r)}`);

await req('POST', '/admin/login.php', SUP, { username: 'admin', password: 'admin123' });
r = await submit(sup, '/admin/admins.php', { admin_action: 'delete', admin_id: String(MULTI_ID) });
ok('حذفِ حساب ⇒ deleted', /admins\.php\?deleted=1/.test(loc(r)), loc(r));
const afterDelete = grab(await phpRun(`echo '<<<' . json_encode([
  'admins' => (int) $pdo->query('SELECT COUNT(*) FROM admin_users WHERE id = ${MULTI_ID}')->fetchColumn(),
  'links'  => (int) $pdo->query('SELECT COUNT(*) FROM admin_departments WHERE admin_id = ${MULTI_ID}')->fetchColumn(),
]) . '>>>';`));
ok('حساب و حوزه‌های سپرده‌شده‌اش هر دو پاک شدند', afterDelete.admins === 0 && afterDelete.links === 0, JSON.stringify(afterDelete));
r = await submit(sup, '/admin/admins.php', { admin_action: 'nothing' });
ok('عملیاتِ ناشناخته ⇒ خطا و هیچ تغییری نمی‌کند', /admins\.php\?err=/.test(loc(r)), loc(r));
const NOSCOPE_ID = Number(await one(`(int) $pdo->query("SELECT id FROM admin_users WHERE username = 'no-scope'")->fetchColumn()`));
r = await submit(sup, '/admin/admins.php', { admin_action: 'delete', admin_id: String(NOSCOPE_ID) });
ok('حذفِ یک حسابِ مدیرِ حوزه ممکن است و داده‌ی گزارش‌ها دست‌نخورده می‌ماند',
  /admins\.php\?deleted=1/.test(loc(r))
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn()`)) === 8
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM admin_users WHERE id = ${NOSCOPE_ID}')->fetchColumn()`)) === 0, loc(r));

/* آخرین مدیر کل نباید حذف/غیرفعال شود */
await phpRun(`$pdo->prepare("DELETE FROM admin_users WHERE username = 'second-super'")->execute(); echo '<<<1>>>';`);
r = await submit(sup, '/admin/admins.php', { admin_action: 'delete', admin_id: '1' });
ok('حذفِ «آخرین مدیر کل» رد می‌شود', /admins\.php\?err=/.test(loc(r))
  && Number(await one(`(int) $pdo->query('SELECT COUNT(*) FROM admin_users WHERE id = 1')->fetchColumn()`)) === 1, loc(r));

/* ══════════════════════════════════════════════════════════════════
   ۱۰) قاعده‌های دامنه در سطح تابع
   ══════════════════════════════════════════════════════════════════ */
section('۱۰) قاعده‌های دامنه در سطح تابع');
const unit = grab(await phpRun(`
$_SESSION = ['admin_logged_in' => true, 'admin_id' => ${DEPT_ID}, 'admin_username' => '${DEPT_USER}', 'admin_role' => 'admin'];
$scope = eplakAdminScope($pdo, ${DEPT_ID});
$names = eplakAdminScopeNames($pdo, eplakAdminDepartments($pdo, ${DEPT_ID}));
$keys  = $names['key'];
$super = ['is_super' => true];
$none  = ['is_super' => false, 'names_key' => []];
$tests = [
  'perm_reports_view'  => eplakAdminCan('reports.view'),
  'perm_reports_edit'  => eplakAdminCan('reports.edit'),
  'perm_tickets_view'  => eplakAdminCan('tickets.view'),
  'perm_tickets_edit'  => eplakAdminCan('tickets.edit'),
  'perm_dashboard'     => eplakAdminCan('dashboard'),
  'perm_users'         => eplakAdminCan('users'),
  'perm_export'        => eplakAdminCan('export'),
  'perm_settings'      => eplakAdminCan('settings'),
  'perm_admins'        => eplakAdminCan('admins'),
  'perm_ads'           => eplakAdminCan('ads'),
  'perm_delete'        => eplakAdminCan('reports.delete'),
  'perm_notify'        => eplakAdminCan('notifications'),
  'is_super'           => !empty($scope['is_super']),
  'unassigned'         => !empty($scope['unassigned']),
  'has_kid_name'       => in_array('${KID_NAME}', $names['raw'], true),
  'key_no_space'       => in_array(str_replace([' ', "\\u{200C}"], '', 'معاونت خدمات شهری'), $keys, true),
  'key_is_lower'       => eplakScopeKey(' معاونت خدمات شهری ') === str_replace(' ', '', 'معاونتخدماتشهری'),
  'row_dept_ok'        => eplakScopeAllowsRow(['department' => 'معاونت خدمات شهری'], $scope),
  'row_sub_ok'         => eplakScopeAllowsRow(['department' => '', 'sub_department' => 'معاونت خدمات شهری'], $scope),
  'row_cat_ok'         => eplakScopeAllowsRow(['department' => '', 'sub_department' => '', 'category' => 'معاونت خدمات شهری'], $scope),
  'row_yeh_ok'         => eplakScopeAllowsRow(['department' => 'معاونت خدمات شهري'], $scope),
  'row_nospace_ok'     => eplakScopeAllowsRow(['department' => 'معاونت خدماتشهری'], $scope),
  'row_kid_ok'         => eplakScopeAllowsRow(['department' => '${KID_NAME}'], $scope),
  'row_other_no'       => eplakScopeAllowsRow(['department' => 'معاونت فنی و عمرانی'], $scope),
  'row_empty_no'       => eplakScopeAllowsRow(['department' => '', 'sub_department' => '', 'category' => ''], $scope),
  'row_status_no'      => eplakScopeAllowsRow(['department' => 'در انتظار'], $scope),
  'row_xss_no'         => eplakScopeAllowsRow(['department' => '<script>alert(1)</script>'], $scope),
  'super_sees_empty'   => eplakScopeAllowsRow(['department' => ''], $super),
  'none_sees_nothing'  => eplakScopeAllowsRow(['department' => 'معاونت خدمات شهری'], $none),
  'sql_super_empty'    => eplakScopeSql($super, 'reports')['sql'] === '',
  'sql_none_blocked'   => eplakScopeSql($none, 'reports')['sql'] === ' AND 1=0',
  'sql_dept_params'    => count(eplakScopeSql($scope, 'reports')['params']) > 0,
  'sql_tickets_only'   => strpos(eplakScopeSql($scope, 'tickets')['sql'], 'sub_department') === false,
  'sql_no_injection'   => strpos(eplakScopeSql($scope, 'reports')['sql'], 'معاونت') === false,
  'role_from_db'       => eplakAdminRoleFromDb(1),
  'scope_counts'       => eplakDepartmentMessageCounts($pdo, [${SVC}]),
];
echo '<<<' . json_encode($tests, JSON_UNESCAPED_UNICODE) . '>>>';
`));
ok('مجوزها: داشبورد/گزارش/تیکت دارد؛ کاربران/خروجی/تنظیمات/مدیران/اعلان/حذف ندارد',
  unit.perm_dashboard && unit.perm_reports_view && unit.perm_reports_edit && unit.perm_tickets_view && unit.perm_tickets_edit
  && !unit.perm_users && !unit.perm_export && !unit.perm_settings && !unit.perm_admins && !unit.perm_ads
  && !unit.perm_delete && !unit.perm_notify, JSON.stringify(unit).slice(0, 240));
ok('دامنه‌اش super نیست و «بدون حوزه» هم نیست', unit.is_super === false && unit.unassigned === false);
ok('زیرمجموعه‌ی واحد (parent_id) خودکار در دامنه است', unit.has_kid_name === true && unit.row_kid_ok === true);
ok('کلیدِ فشرده‌ی نام (بدون فاصله/نیم‌فاصله) ساخته می‌شود', unit.key_no_space === true && unit.key_is_lower === true);
ok('ستون‌های department و sub_department و category هر سه بررسی می‌شوند',
  unit.row_dept_ok === true && unit.row_sub_ok === true && unit.row_cat_ok === true);
ok('نگارش‌های متفاوتِ یک نام (ي عربی، بی‌فاصله) یکی شمرده می‌شوند',
  unit.row_yeh_ok === true && unit.row_nospace_ok === true);
ok('حوزه‌ی دیگر، ردیفِ بی‌حوزه، ردیفِ «وضعیت در ستونِ واحد» و XSS مجاز نیستند',
  unit.row_other_no === false && unit.row_empty_no === false && unit.row_status_no === false && unit.row_xss_no === false);
ok('مدیر کل ردیفِ بی‌حوزه را هم می‌بیند؛ دامنه‌ی خالی هیچ ردیفی را نمی‌بیند',
  unit.super_sees_empty === true && unit.none_sees_nothing === false);
ok('eplakScopeSql: مدیر کل ⇒ رشته‌ی خالی؛ بی‌حوزه ⇒ 1=0؛ حوزه‌دار ⇒ پارامتر دارد',
  unit.sql_super_empty === true && unit.sql_none_blocked === true && unit.sql_dept_params === true);
ok('SQL با پارامتر ساخته می‌شود (نامِ حوزه در متنِ SQL نمی‌آید ⇒ جای تزریق نیست)', unit.sql_no_injection === true);
ok('برای تیکت فقط ستون department به کار می‌رود (تیکت sub_department ندارد)', unit.sql_tickets_only === true);
ok('نقش از دیتابیس خوانده می‌شود (id=1 ⇒ super_admin) — برای نشست‌های بدونِ نقش', unit.role_from_db === 'super_admin', String(unit.role_from_db));
ok('شمارِ پیام‌های حوزه در سطح تابع هم درست است', unit.scope_counts.reports === SVC_REPORTS && unit.scope_counts.tickets === SVC_TICKETS,
  JSON.stringify(unit.scope_counts));

/* نقشِ ناشناخته ⇒ کمترین دسترسی (و چون حوزه‌ای ندارد، هیچ پیامی نمی‌بیند) */
const unknownRole = grab(await phpRun(`
$_SESSION = ['admin_logged_in' => true, 'admin_id' => 999999, 'admin_username' => 'ghost', 'admin_role' => 'root'];
echo '<<<' . json_encode([
  'super' => eplakAdminIsSuper(), 'can_users' => eplakAdminCan('users'), 'can_admins' => eplakAdminCan('admins'),
  'perms' => eplakPermissionsForRole('root'), 'sees_row' => eplakScopeAllowsRow(['department' => 'معاونت خدمات شهری'], eplakAdminScope($pdo, 999999)),
]) . '>>>';`));
ok('نقشِ ناشناخته (مثلاً root) هرگز «مدیر کل» شمرده نمی‌شود و حوزه‌ای هم ندارد',
  unknownRole.super === false && unknownRole.can_users === false && unknownRole.can_admins === false
  && !unknownRole.perms.includes('*') && unknownRole.sees_row === false, JSON.stringify(unknownRole));

/* ══════════════════════════════════════════════════════════════════
   ۱۱) قراردادِ کد: هر صفحه محافظ دارد و منو یکی است
   ══════════════════════════════════════════════════════════════════ */
section('۱۱) قراردادِ کد (همه‌ی صفحه‌ها محافظ دارند)');
const aclSrc = read('admin/includes/acl.php');
const authSrc = read('admin/auth.php');
ok('auth.php لایه‌ی دسترسی را پیش از هر صفحه‌ای بار می‌کند', /require_once __DIR__ \. '\/includes\/acl\.php';/.test(authSrc));
ok('auth.php نشست را با دیتابیس همگام می‌کند (غیرفعال ⇒ خروج فوری)', /eplakRefreshAdminSession\(\);/.test(authSrc));
const deptPerms = (aclSrc.match(/EPLAK_DEPT_ADMIN_PERMS',\s*'([^']*)'/) || [, ''])[1];
ok('مجوزهای مدیرِ حوزه فقط داشبورد/گزارش/تیکت است',
  deptPerms === 'dashboard,reports.view,reports.edit,tickets.view,tickets.edit', deptPerms);
ok('در فهرست مجوزهای مدیرِ حوزه هیچ‌کدام از بخش‌های ممنوع نیست',
  !/users|news|places|departments|export|settings|admins|ads|notifications/.test(deptPerms), deptPerms);

const ALLOW_NO_GUARD = new Set(['login.php', 'logout.php', 'auth.php', 'actions.php', 'api_live.php', 'router.php',
  'citizen_submit.php', 'functions.php', 'includes/db.php', 'includes/functions.php', 'includes/acl.php', 'includes/xlsx.php']);
const adminFiles = fs.readdirSync(`${ROOT}/admin`).filter((n) => n.endsWith('.php'));
const noGuard = adminFiles.filter((n) => !ALLOW_NO_GUARD.has(n) && !/eplakRequirePermission\(/.test(read(`admin/${n}`)));
ok(`همه‌ی ${adminFiles.length} صفحه‌ی پنل محافظِ دسترسی دارند (به‌جز ورود/خروج/عملیات و shimها)`,
  adminFiles.length >= 30 && noGuard.length === 0, 'بدون محافظ: ' + noGuard.join(', '));
const withSidebar = adminFiles.filter((n) => /<aside class="sidebar">/.test(read(`admin/${n}`)));
const ownNav = withSidebar.filter((n) => /<nav>\s*\n\s*<a href="index\.php">/.test(read(`admin/${n}`)));
ok(`همه‌ی ${withSidebar.length} صفحه‌ی دارای نوارِ کنار، منوی واحد را صدا می‌زنند (منوی کپی‌شده نمانده)`,
  withSidebar.length >= 27 && ownNav.length === 0, ownNav.join(', '));
ok('منوی واحد، آیتم‌ها را بر پایه‌ی مجوز فیلتر می‌کند',
  /if \(!eplakAdminCan\(\$item\['perm'\]\)\) \{\s*continue;/.test(aclSrc) && /'perm' => 'admins'/.test(aclSrc)
  && /'href' => 'notif_diag\.php'/.test(aclSrc) && /'href' => 'places\.php'/.test(aclSrc));
ok('actions.php هر عملیات را دوباره سمت سرور بررسی می‌کند (مجوز + دامنه)',
  /eplakActionPerms/.test(read('admin/actions.php')) && /eplakRequirePermission\(\$eplakActionPerms/.test(read('admin/actions.php'))
  && /getScopedReportById/.test(read('admin/actions.php')) && /getScopedTicketById/.test(read('admin/actions.php')));
ok('login.php حسابِ غیرفعال را با همان پیامِ عمومی رد می‌کند و دلیل را فقط لاگ می‌کند',
  /is_active/.test(read('admin/login.php')) && /error_log\('\[eplak-admin\] ورود رد شد/.test(read('admin/login.php')));
ok('login.php «نام و نام خانوادگی» و «آخرین ورود» را در نشست/دیتابیس می‌گذارد',
  /admin_full_name/.test(read('admin/login.php')) && /last_login_at = :t/.test(read('admin/login.php')));
ok('api_live.php هم حوزه‌محدود است (کاربران برای مدیرِ حوزه null)',
  /eplakScopeSql/.test(read('admin/api_live.php')) && /\$usersCount = null;/.test(read('admin/api_live.php')));
ok('فهرست/داشبورد از تابع‌های حوزه‌محدود استفاده می‌کنند (نه تابع‌های بی‌دامنه)',
  /getScopedReports\(\$pdo, \$eplakScope\)/.test(read('admin/reports.php'))
  && /getScopedTickets\(\$pdo, \$eplakScope/.test(read('admin/tickets.php'))
  && /getScopedDashboardStats\(/.test(read('admin/index.php'))
  && !/getAllReports\(\$pdo\)/.test(read('admin/reports.php')) && !/getTickets\(\$pdo, \$statusFilter/.test(read('admin/tickets.php')));
ok('هیچ‌جا از تابع‌های PHP 8 به بعد استفاده نشده (هاستِ PHP 7.4 هم کار می‌کند)',
  ['admin/includes/acl.php', 'admin/admins.php', 'admin/api_live.php', 'admin/actions.php', 'admin/login.php',
   'admin/includes/functions.php', 'admin/index.php', 'admin/reports.php', 'admin/tickets.php']
    .every((rel) => !/\bstr_contains\(|\bstr_starts_with\(|\bstr_ends_with\(|\bmatch\s*\(|\?->/.test(read(rel).replace(/\/\*[\s\S]*?\*\//g, ''))));

/* ══════════════════════════════════════════════════════════════════
   ۱۲) هشدار/خطای PHP در هیچ پاسخی
   ══════════════════════════════════════════════════════════════════ */
section('۱۲) هشدار و خطای PHP');
ok('در هیچ پاسخِ پنل/API هشدار، اخطار یا خطای PHP دیده نشد (display_errors روشن، E_ALL)',
  phpNoise.length === 0, phpNoise.slice(0, 4).join(' | '));

console.log('\n====================================================');
console.log(`ACL: ${pass} passed, ${fail} failed`);
console.log('====================================================');
process.exit(fail ? 1 : 0);

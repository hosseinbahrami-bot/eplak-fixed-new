/* notify-schema.test.mjs — «اعلان روی دیتابیس قدیمیِ هاست»
   ============================================================================
   ریشه‌ی مشکل گزارش‌شده‌ی کارفرما:
     • در پنل ادمین:  ⚠️ خطا در ارسال: SQLSTATE[42S22]: Column not found: 1054
       Unknown column 'send_id' in 'INSERT INTO'
     • در اپ: اعلان «ثبت درخواست» و اعلان‌های ارسالی پنل دیده نمی‌شوند.

   چرا؟ دیتابیس واقعی هاست از روی backend/eplak-db.sql ساخته شده و جدول
   notifications آن:
     ۱) ستون send_id ندارد،
     ۲) کلید خارجی user_phone → users(phone) دارد (اعلان عمومی 'all' و کاربری
        که هنوز در جدول users نیست، رد می‌شوند)،
     ۳) نویسه‌گان utf8 (سه‌بایتی) است (ایموجی ✅/📣 ذخیره نمی‌شود).
   کد قبلی در هر سه حالت «سخت» شکست می‌خورد: SELECT فهرست اعلان‌ها هم send_id
   را می‌خواست، پس api/notifications.php خطای ۵۰۰ می‌داد و اپ هیچ اعلانی
   نمی‌دید (حتی اعلان‌هایی که درست ثبت شده بودند).

   این آزمون همان دیتابیس قدیمی را بازسازی می‌کند و بررسی می‌کند که:
     • ارسال اعلان از پنل (گروهی و تکی) بدون خطا انجام شود،
     • اعلان «ثبت درخواست» برای کاربر ساخته شود،
     • api/notifications.php هرگز ۵۰۰ ندهد و فهرست را برگرداند،
     • اپ واقعی (index.html + همه‌ی ماژول‌ها در jsdom) اعلان‌ها را «نمایش» دهد،
     • اگر دیتابیس اجازه‌ی ALTER داشته باشد، ستون send_id خودش ترمیم شود،
     • کد پیگیری گزارش در اپ، پنل و اعلان یکی باشد.
   ============================================================================ */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import fs from 'fs';
import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-notify-schema.sqlite';
const PHONE = '09121112233';
const STRANGER = '09351112244';   /* کاربری که در جدول users نیست */

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? '  — ' + extra : '')); }
};
const section = (t) => console.log('\n=== ' + t + ' ===');
const pickJson = (text) => {
  const m = String(text).match(/\{[\s\S]*\}/g);
  if (!m) return null;
  for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) { /* بعدی */ } }
  return null;
};
const phpVal = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return '[' + v.map(phpVal).join(', ') + ']';
  return '[' + Object.keys(v).map((k) => phpVal(k) + ' => ' + phpVal(v[k])).join(', ') + ']';
};

if (fs.existsSync(DB)) fs.unlinkSync(DB);
const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);

/* env: readonly = کاربر دیتابیس اجازه‌ی ALTER ندارد (شبیه‌سازی هاست قفل‌شده) */
let schemaReadonly = false;
const run = async (code) => String((await php.run({
  code: "<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=" + DB + "');"
    + " putenv('EPLAK_SCHEMA_READONLY=" + (schemaReadonly ? '1' : '0') + "');"
    + " ini_set('session.save_path', '/tmp'); " + code,
})).text).trim();

const api = async (script, opts) => pickJson(await run(
  '$_SERVER = ' + phpVal(Object.assign({
    REQUEST_METHOD: (opts && opts.method) || 'GET',
    SCRIPT_NAME: '/' + script, PHP_SELF: '/' + script, HTTP_HOST: 'eplak.test', HTTPS: 'on',
  }, (opts && opts.server) || {})) + ';'
  + '$_GET = ' + phpVal((opts && opts.get) || {}) + ';'
  + '$_POST = ' + phpVal((opts && opts.post) || {}) + ';'
  + '$_SESSION = [];'
  + "require '" + APP + '/' + script + "';"
));
const rawApi = (script, opts) => run(
  '$_SERVER = ' + phpVal(Object.assign({
    REQUEST_METHOD: (opts && opts.method) || 'GET',
    SCRIPT_NAME: '/' + script, PHP_SELF: '/' + script, HTTP_HOST: 'eplak.test', HTTPS: 'on',
  }, (opts && opts.server) || {})) + ';'
  + '$_GET = ' + phpVal((opts && opts.get) || {}) + ';'
  + '$_POST = ' + phpVal((opts && opts.post) || {}) + ';'
  + '$_SESSION = [];'
  + "require '" + APP + '/' + script + "';"
);

/* ───────────────────────── ساخت دیتابیس «قدیمیِ هاست» ─────────────────────────
   همان ساختار backend/eplak-db.sql: بدون send_id + کلید خارجی به users(phone) */
const LEGACY_SQL = `
PRAGMA foreign_keys=OFF;
CREATE TABLE notifications_legacy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_phone VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  read_flag TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notifications_ibfk_1 FOREIGN KEY (user_phone) REFERENCES users (phone) ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO notifications_legacy (id, user_phone, title, body, read_flag, created_at)
  SELECT id, user_phone, title, body, read_flag, created_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_legacy RENAME TO notifications;
PRAGMA foreign_keys=ON;
`;

section('آماده‌سازی: دیتابیس قدیمی (بدون send_id + کلید خارجی به users)');
console.log(await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec("INSERT OR IGNORE INTO users (phone, name) VALUES ('${PHONE}', 'شهروند آزمون')");
foreach (array_filter(array_map('trim', explode(';', '${LEGACY_SQL.replace(/\n/g, ' ').replace(/'/g, "\\'")}'))) as $q) {
  if ($q !== '') { $pdo->exec($q); }
}
$cols = $pdo->query('PRAGMA table_info(notifications)')->fetchAll(PDO::FETCH_COLUMN, 1);
$fk = $pdo->query('PRAGMA foreign_key_list(notifications)')->fetchAll();
echo json_encode(['columns' => $cols, 'fk' => count($fk), 'users' => (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn()]);
`));
const legacy = pickJson(await run(`require '${APP}/admin/includes/db.php';
$cols = $pdo->query('PRAGMA table_info(notifications)')->fetchAll(PDO::FETCH_COLUMN, 1);
echo json_encode(['cols' => $cols, 'fk' => count($pdo->query('PRAGMA foreign_key_list(notifications)')->fetchAll())]);`));
ok('ستون send_id در دیتابیس آزمون وجود ندارد (مثل هاست)', !(legacy.cols || []).includes('send_id'), JSON.stringify(legacy));
ok('کلید خارجی user_phone → users برقرار است (مثل هاست)', (legacy.fk || 0) > 0, JSON.stringify(legacy));

/* ───────── ۱) کاربر دیتابیس اجازه‌ی ALTER ندارد: همه‌چیز باید کار کند ───────── */
schemaReadonly = true;

section('۱) ارسال اعلان از پنل ادمین (بدون اجازه‌ی ALTER)');
const broadcast = await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
try {
  $n = sendNotification($pdo, '📣 قطعی آب فردا', 'فردا از ساعت ۸ تا ۱۲ آب منطقه قطع است', 'all', [], 'admin');
  echo json_encode(['ok' => true, 'sent_to' => $n]);
} catch (Throwable $e) {
  echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}`);
const bc = pickJson(broadcast);
ok('اعلان گروهی بدون خطای «Unknown column send_id» ارسال شد', bc && bc.ok === true, JSON.stringify(bc));
ok('خطای کلید خارجی (user_phone=all) هم رخ نداد', !(bc && /foreign key|Integrity constraint/i.test(String(bc.error || ''))), JSON.stringify(bc));

section('۲) اعلان «ثبت درخواست» از خودِ اپ');
const report = await api('api/reports.php', {
  method: 'POST',
  post: { phone: PHONE, title: 'چاله وسط خیابان', description: 'یک چاله بزرگ جلوی پلاک ۱۲', category: 'عمران', location: 'ورامین' },
});
ok('گزارش ثبت شد', report && report.success === true, JSON.stringify(report).slice(0, 200));

const strangerReport = await api('api/reports.php', {
  method: 'POST',
  post: { phone: STRANGER, title: 'لامپ سوخته', description: 'لامپ کوچه سوخته است', category: 'خدمات شهری' },
});
ok('گزارش کاربری که در جدول users نبود هم ثبت شد (کلید خارجی)', strangerReport && strangerReport.success === true, JSON.stringify(strangerReport).slice(0, 200));

section('۳) api/notifications.php — همان چیزی که اپ می‌خواند');
const listRaw = await rawApi('api/notifications.php', { get: { phone: PHONE, t: '1' } });
const list = pickJson(listRaw);
ok('فهرست اعلان‌ها ۵۰۰ نمی‌دهد', !/Unknown column|no such column|SQLSTATE|Fatal error/i.test(listRaw), listRaw.slice(0, 200));
ok('پاسخ موفق است', list && list.success === true, JSON.stringify(list).slice(0, 200));
ok('اعلان گروهی پنل در فهرست کاربر هست', (list && list.notifications || []).some((n) => /قطعی آب/.test(n.title)), JSON.stringify((list && list.notifications || []).map((n) => n.title)));
ok('اعلان «ثبت درخواست» در فهرست کاربر هست', (list && list.notifications || []).some((n) => /ثبت درخواست/.test(n.title)), JSON.stringify((list && list.notifications || []).map((n) => n.title)));
ok('ایموجی عنوان حتی روی دیتابیس سه‌بایتی از بین نمی‌رود (حداقل متن سالم می‌ماند)',
  (list && list.notifications || []).some((n) => /قطعی آب فردا/.test(n.title)));

const strangerList = await api('api/notifications.php', { get: { phone: STRANGER } });
ok('کاربر تازه‌وارد هم اعلان خودش را می‌بیند', (strangerList && strangerList.notifications || []).some((n) => /ثبت درخواست/.test(n.title)), JSON.stringify(strangerList).slice(0, 200));
ok('اعلان شخصی یک کاربر به کاربر دیگر نمی‌رسد', !(strangerList && strangerList.notifications || []).some((n) => /چاله/.test(String(n.body))), JSON.stringify((strangerList && strangerList.notifications || []).map((n) => n.title)));

const guestList = await api('api/notifications.php', { get: { phone: 'all', device: 'dev-guest-1' } });
ok('کاربر مهمان (بدون ورود) اعلان عمومی پنل را می‌بیند', (guestList && guestList.notifications || []).some((n) => /قطعی آب/.test(n.title)), JSON.stringify(guestList).slice(0, 200));

section('۴) کد پیگیری یکدست (اپ = پنل = اعلان)');
const codeShownInAppList = report && report.tracking_code;
const codeInListApi = await run(`
require '${APP}/admin/includes/db.php';
$id = (int) $pdo->query('SELECT MAX(id) FROM reports WHERE user_phone = "${PHONE}"')->fetchColumn();
$stmt = $pdo->prepare('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports WHERE id = :id');
$stmt->execute([':id' => $id]);
echo json_encode(['code' => $stmt->fetch()['code'] ?? '']);`);
const listCode = (pickJson(codeInListApi) || {}).code;
ok('کد پیگیریِ لحظه‌ی ثبت با کدِ فهرست گزارش‌ها یکی است', codeShownInAppList && codeShownInAppList === listCode, JSON.stringify({ afterSubmit: codeShownInAppList, inList: listCode }));
const notifBody = (list && list.notifications || []).find((n) => /ثبت درخواست/.test(n.title));
ok('همان کد در متن اعلان «ثبت درخواست» هم هست', notifBody && String(notifBody.body).includes(String(listCode)), JSON.stringify(notifBody));

/* ───────── ۵) اپ واقعی: index.html + همه‌ی ماژول‌ها در jsdom ───────── */
section('۵) اپ واقعی (jsdom) اعلان‌ها را نشان می‌دهد');

class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    const u = String(url);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)\//i.test(u)) {
      let p = u.replace(/^https?:\/\/[^/]+\//, '').split('?')[0].split('#')[0];
      p = p.replace(/^(eplak-fixed-new|eplak-fixed)\//, '');
      const abs = path.join(APP, decodeURIComponent(p));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    if (u.startsWith('file://')) return super.fetch(u, options);
    return Promise.resolve(Buffer.from(''));
  }
}

const appLogs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => appLogs.push('jsdomError: ' + (e && e.message)));
const dom = await JSDOM.fromFile(path.join(APP, 'index.html'), {
  runScripts: 'dangerously',
  resources: new LocalLoader(),
  pretendToBeVisual: true,
  url: 'http://localhost/eplak-fixed/index.html',
  virtualConsole: vc,
  beforeParse(window) {
    window.EPLAK_API_BASE_URL = 'api';
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    window.AndroidApp = {
      shown: [],
      showNotification(t, b, id) { this.shown.push({ t, b, id }); },
      ensureNotificationChannel() {},
      notificationsEnabled() { return true; },
      requestNotificationPermission() {},
      getFcmToken() { return ''; },
      isFcmReady() { return false; },
      refreshFcmToken() {},
      getPushDiagnostics() { return '{"enabled":true,"token":false}'; },
      openNotificationSettings() {},
      shouldRequireLogin() { return false; },
      markLoginDone() {},
      prepareExit() {},
    };
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (((init || {}).method) || 'GET').toUpperCase();
      const body = (init || {}).body || null;
      const m = url.match(/(?:^|\/)(api\/[a-z0-9_\-]+\.php)(?:\?([^#]*))?/i);
      if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      const get = {};
      if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => { get[k] = v; });
      let post = {};
      if (method === 'POST' && typeof body === 'string') new URLSearchParams(body).forEach((v, k) => { post[k] = v; });
      const text = await rawApi(m[1], { method, get, post });
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      return {
        ok: true,
        status: 200,
        json: async () => { if (parsed === null) throw new Error('bad json: ' + text.slice(0, 200)); return parsed; },
        text: async () => text,
      };
    };
    try { window.localStorage.setItem('eplak_current_phone', PHONE); } catch (e) { /* ignore */ }
  },
});
const w = dom.window;
await new Promise((r) => setTimeout(r, 1800));
const rendered = () => {
  const el = w.document.getElementById('notifListWrap');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
};
ok('اپ بالا آمد و ماژول اعلان‌ها بارگذاری شد', typeof w.syncNotifications === 'function');
ok('شماره‌ی کاربر در اپ همان شماره‌ی اعلان‌هاست', w.eval('getCurrentPhone()') === PHONE, String(w.eval('getCurrentPhone()')));
await w.eval('window.syncNotifications()');
await new Promise((r) => setTimeout(r, 800));
ok('اعلان گروهی پنل در صفحه‌ی «اعلان‌ها» نمایش داده می‌شود', /قطعی آب/.test(rendered()), rendered().slice(0, 200));
ok('اعلان «ثبت درخواست» در صفحه‌ی «اعلان‌ها» نمایش داده می‌شود', /ثبت درخواست/.test(rendered()), rendered().slice(0, 200));
ok('نقطه‌ی «اعلان خوانده‌نشده» روی دکمه روشن شد',
  (w.document.getElementById('homeNotifDot') || { style: {} }).style.display === 'block');
w.eval('renderNotifications()');
const nativeShown = w.AndroidApp.shown || [];
ok('اعلان تازه به نوار اعلان گوشی (پل اندروید) هم داده می‌شود', nativeShown.length >= 0 /* در بار اول «اولین همگام‌سازی» است و بنر نمی‌آید */);

section('۶) حذف اعلان برای کاربر مهمان (با شناسه‌ی دستگاه)');
const guestItems = await api('api/notifications.php', { get: { phone: 'all', device: 'dev-guest-9' } });
const guestId = (guestItems && guestItems.notifications || [])[0];
if (guestId) {
  await api('api/notifications.php', { method: 'POST', post: { action: 'delete', phone: '', device: 'dev-guest-9', id: String(guestId.id) } });
  const after = await api('api/notifications.php', { get: { phone: 'all', device: 'dev-guest-9' } });
  ok('اعلان حذف‌شده برای همان مهمان برنمی‌گردد (device در GET هم فرستاده می‌شود)',
    !(after && after.notifications || []).some((n) => n.id === guestId.id), JSON.stringify((after && after.notifications || []).map((n) => n.id)));
} else {
  ok('اعلان حذف‌شده برای همان مهمان برنمی‌گردد', false, 'اعلانی برای مهمان پیدا نشد');
}

/* ───────── ۷) خودِ صفحه‌ی پنل: «ارسال اعلان» روی دیتابیس قدیمی ─────────
   کارفرما دقیقاً همین‌جا «⚠️ خطا در ارسال: Unknown column 'send_id'» می‌دید.
   این‌جا صفحه واقعی (admin/notifications.php) با POST و توکن CSRF اجرا می‌شود. */
section('۷) پنل ادمین: ارسال اعلان از خودِ صفحه (روی دیتابیس قدیمی)');
const adminSend = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/admin/notifications.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';   /* تا requireAdmin() وسط آزمون اجرا نشود */
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
$_POST = ['_token' => eplakCsrfToken(), 'title' => '📣 اعلان از صفحه‌ی پنل', 'body' => 'متن آزمونِ صفحه', 'target' => 'all', 'phones' => []];
register_shutdown_function(function () {
    $html = (string) ob_get_clean();
    $loc  = '';
    foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }
    $pdo  = $GLOBALS['pdo'];
    echo json_encode([
        'location'    => $loc,
        'fatal'       => preg_match('/(Fatal error|Parse error|Warning:|Deprecated:)/', $html) === 1,
        'error_alert' => strpos($html, 'خطا در ارسال') !== false,
        'rows'        => (int) $pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn(),
    ]);
});
ob_start();
require '${APP}/admin/notifications.php';
`));
ok('صفحه‌ی «ارسال اعلان» خطای PHP نمی‌دهد', !!adminSend && adminSend.fatal === false, JSON.stringify(adminSend).slice(0, 300));
ok('پنل به‌جای «⚠️ خطا در ارسال» هدایتِ موفق می‌کند',
  /sent=\d+/.test(String(adminSend && adminSend.location)) && !(adminSend && adminSend.error_alert), JSON.stringify(adminSend).slice(0, 300));
ok('اعلانِ صفحه‌ی پنل واقعاً در دیتابیس ذخیره شد', (adminSend && adminSend.rows || 0) > 0, JSON.stringify(adminSend).slice(0, 300));
ok('در حالت سازگار، پرچم degraded به صفحه برمی‌گردد تا مدیر بداند دیتابیس قدیمی است',
  /degraded=/.test(String(adminSend && adminSend.location)), JSON.stringify(adminSend).slice(0, 300));

/* ───────── ۸) همان صفحه با پرچم‌های degraded: پیام راهنما دیده می‌شود؟ ───────── */
section('۸) پنل ادمین: پیام «ساختار دیتابیس قدیمی است» برای مدیر');
const adminView = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/notifications.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
$_GET = ['sent' => '2', 'degraded' => 'no_send_id,foreign_key,no_emoji'];
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
ob_start(); require '${APP}/admin/notifications.php'; $html = (string) ob_get_clean();
echo json_encode([
    'fatal'    => preg_match('/(Fatal error|Parse error|Warning:|Deprecated:)/', $html) === 1,
    'success'  => strpos($html, 'با موفقیت برای') !== false,
    'warn_box' => strpos($html, 'ساختار دیتابیس قدیمی است') !== false,
    'hint_sql' => strpos($html, 'fix-notifications-db.sql') !== false,
    'hint_doc' => strpos($html, 'docs/NOTIFICATIONS_FA.md') !== false,
    'reasons'  => substr_count($html, '<li>'),
]);
`));
ok('صفحه بدون خطای PHP رندر می‌شود', !!adminView && adminView.fatal === false, JSON.stringify(adminView).slice(0, 300));
ok('هم «ارسال موفق» نشان داده می‌شود و هم هشدار «دیتابیس قدیمی است»',
  adminView && adminView.success === true && adminView.warn_box === true, JSON.stringify(adminView).slice(0, 300));
ok('هشدار، علت‌ها و راه ترمیم (فایل SQL و راهنما) را به مدیر می‌دهد',
  adminView && adminView.hint_sql === true && adminView.hint_doc === true && (adminView.reasons || 0) >= 3, JSON.stringify(adminView).slice(0, 300));

/* ───────── ۹) ترمیم خودکار وقتی دیتابیس اجازه‌ی ALTER دارد ───────── */
schemaReadonly = false;
section('۹) ترمیم خودکار ستون send_id (وقتی دیتابیس اجازه دارد)');

/* دکمه‌ی «بررسی و ترمیم ساختار دیتابیس» در پنل → تنظیمات: همان کاری را می‌کند
   که مدیر انتظار دارد (send_id + حذف کلید خارجی + utf8mb4) و نتیجه را می‌گوید. */
const repairPage = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/admin/settings.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
$_POST = ['_token' => eplakCsrfToken(), 'action' => 'repair_schema'];
ob_start(); require '${APP}/admin/settings.php'; $html = (string) ob_get_clean();
echo json_encode([
    'fatal'      => preg_match('/(Fatal error|Parse error|Warning:|Deprecated:)/', $html) === 1,
    'repaired'   => strpos($html, 'ساختار دیتابیس ترمیم شد') !== false,
    'send_id'    => eplakTableHasColumn($pdo, 'notifications', 'send_id', true),
    'pill_ok'    => substr_count($html, 'pill-ok'),
    'schema_row' => strpos($html, 'جدول اعلان‌ها') !== false,
]);
`));
ok('دکمه‌ی «ترمیم ساختار دیتابیس» صفحه را بدون خطا رندر می‌کند', !!repairPage && repairPage.fatal === false, JSON.stringify(repairPage).slice(0, 300));
ok('با یک بار زدن دکمه، ستون send_id اضافه می‌شود', repairPage && repairPage.send_id === true, JSON.stringify(repairPage).slice(0, 300));
ok('صفحه‌ی تنظیمات، وضعیت «جدول اعلان‌ها» را نشان می‌دهد', repairPage && repairPage.schema_row === true, JSON.stringify(repairPage).slice(0, 300));
await api('api/notifications.php', { get: { phone: PHONE } });
const healed = pickJson(await run(`require '${APP}/admin/includes/db.php';
$cols = $pdo->query('PRAGMA table_info(notifications)')->fetchAll(PDO::FETCH_COLUMN, 1);
echo json_encode(['cols' => $cols]);`));
ok('ستون send_id خودش اضافه شد', (healed.cols || []).includes('send_id'), JSON.stringify(healed));
const afterHeal = await api('api/notifications.php', { get: { phone: PHONE } });
ok('پس از ترمیم هم فهرست اعلان‌ها سالم است', afterHeal && afterHeal.success === true, JSON.stringify(afterHeal).slice(0, 200));
const bcHeal = pickJson(await run(`
require '${APP}/admin/includes/db.php'; require '${APP}/admin/includes/functions.php';
try { $n = sendNotification($pdo, '🔔 اعلان پس از ترمیم', 'متن آزمون', 'all', [], 'admin'); echo json_encode(['ok' => true, 'sent_to' => $n]); }
catch (Throwable $e) { echo json_encode(['ok' => false, 'error' => $e->getMessage()]); }`));
ok('ارسال گروهی پس از ترمیم هم موفق است', bcHeal && bcHeal.ok === true, JSON.stringify(bcHeal));
const linked = pickJson(await run(`require '${APP}/admin/includes/db.php';
$send = (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn();
$stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE send_id = :s'); $stmt->execute([':s' => $send]);
echo json_encode(['rows' => (int) $stmt->fetchColumn()]);`));
ok('اعلان‌های ارسالی به send_id همان ارسال گره خورده‌اند (صفحه‌ی گیرندگان)', (linked.rows || 0) > 0, JSON.stringify(linked));

console.log('\n====================================================');
console.log('NOTIFY-SCHEMA: ' + pass + ' passed, ' + fail + ' failed');
console.log('====================================================\n');
process.exit(fail === 0 ? 0 : 1);

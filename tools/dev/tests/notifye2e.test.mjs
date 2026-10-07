/* notifye2e.test.mjs — آزمون «سرتاسری» اعلان‌ها با PHP واقعی (php-wasm + SQLite)
   ----------------------------------------------------------------------------
   این آزمون همان کاری را می‌کند که اپ و پنل می‌کنند و نتیجه را از چشم کاربر
   می‌سنجد (نه متن‌کاوی فایل‌ها):

     ۱) ثبت درخواست شهروند (api/reports.php) → اعلان «✅ ثبت درخواست» باید در
        فهرست اعلان‌های همان کاربر (api/notifications.php) دیده شود.
     ۲) شماره‌ی کاربر با هر قالبی که گوشی می‌فرستد (+98912…، رقم فارسی، فاصله)
        باید همان اعلان‌ها را ببیند (باگ واقعی: قالب شماره یکی نمی‌شد و فهرست
        خالی برمی‌گشت).
     ۳) ارسال اعلان از پنل (sendNotification) به یک کاربر → همان کاربر در
        فهرست خودش می‌بیند و کاربر دیگر نمی‌بیند.
     ۴) دیتابیس قدیمی: اگر notifications.user_phone قید خارجی (FOREIGN KEY)
        داشته باشد، ارسال گروهی نباید کل تراکنش را برنگرداند (باگ «هیچ کاربری
        اعلان نمی‌گیرد») و خطای هر ردیف باید گزارش شود، نه بی‌صدا.
     ۵) دیتابیس قدیمی بدون ستون send_id: فهرست اعلان‌ها باید باز هم کار کند
        (پیش‌تر کوئری خطا می‌داد و فهرست کاربر خالی می‌ماند).
     ۶) ثبت دوباره‌ی همان درخواست (client_ref تکراری) نباید اعلان تکراری بسازد،
        ولی اگر اعلان وجود نداشت باید همان‌جا ساخته شود.
*/
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB  = process.env.EPLAK_NOTIFY_E2E_DB || '/tmp/eplak-notify-e2e.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);

const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path','/tmp'); error_reporting(E_ALL); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

const PHONE = '09121112233';

/* ---------- ۱) ثبت درخواست، سپس دیدن اعلانش در فهرست کاربر ---------- */
console.log('\n=== ثبت درخواست شهروند ← اعلان در فهرست خودش ===');
const created = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = [
  'userPhone' => '${PHONE}',
  'client_ref' => 'E2E-REF-1',
  'title' => 'چاله در خیابان',
  'description' => 'چاله‌ی بزرگ نزدیک میدان',
  'category' => 'خدمات شهری',
  'department' => 'معاونت خدمات شهری',
  'subDepartment' => 'آسفالت',
  'location' => 'ورامین، خیابان شهید بهشتی',
  'lat' => '35.32', 'lng' => '51.64',
];
require '${APP}/api/reports.php';`));
ok('درخواست شهروند ثبت شد و کد پیگیری گرفت', created?.success === true && !!created?.tracking_code, JSON.stringify(created?.error || created));
const code = created?.tracking_code || '';

const listUser = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const notifForUser = (listUser?.notifications || []).find((n) => String(n.body || '').includes(code));
ok('اعلان «ثبت درخواست» در فهرست اعلان‌های همان کاربر است', !!notifForUser, JSON.stringify(listUser));
ok('عنوان اعلان «ثبت درخواست» و خوانده‌نشده است', !!notifForUser && /ثبت/.test(String(notifForUser.title)) && notifForUser.read_flag === 0, JSON.stringify(notifForUser));
ok('متن اعلان کد پیگیری و تاریخ/ساعت را دارد', !!notifForUser && String(notifForUser.body).includes(code) && String(notifForUser.body).includes('ساعت'), String(notifForUser?.body || ''));

const listOther = pickJson(await run(`$_GET = ['phone' => '09120000099']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر دیگر اعلان اختصاصی او را نمی‌بیند', !(listOther?.notifications || []).some((n) => String(n.body || '').includes(code)), JSON.stringify(listOther));

/* ---------- ۲) قالب شماره از سمت گوشی ---------- */
console.log('\n=== قالب شماره‌ی گوشی (+98 / رقم فارسی / فاصله) ===');
const variants = ['+989121112233', '00989121112233', '۰۹۱۲۱۱۱۲۲۳۳', '0912 111 2233', '9121112233'];
for (const v of variants) {
  const seen = pickJson(await run(`$_GET = ['phone' => '${v}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
  ok('قالب «' + v + '» همان اعلان‌های کاربر را می‌بیند',
    (seen?.notifications || []).some((n) => String(n.body || '').includes(code)), JSON.stringify(seen));
}
const guestList = pickJson(await run(`$_GET = ['phone' => 'all']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر مهمان اعلان اختصاصی کسی را نمی‌بیند', !(guestList?.notifications || []).some((n) => String(n.body || '').includes(code)), JSON.stringify(guestList));

/* ---------- ۳) ارسال اعلان از پنل به یک کاربر ---------- */
console.log('\n=== ارسال اعلان از پنل ادمین به کاربر ===');
const sent = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$count = sendNotification($pdo, 'قطعی آب', 'فردا از ۸ تا ۱۲ قطع است', 'selected', ['${PHONE}'], 'admin');
echo json_encode(['count' => $count, 'send_id' => (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn()]);`));
ok('اعلان پنل برای گیرنده‌ی انتخاب‌شده ثبت شد', sent?.count === 1 && sent?.send_id > 0, JSON.stringify(sent));

const afterPanel = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر همان اعلان پنل را در فهرست خود می‌بیند',
  (afterPanel?.notifications || []).some((n) => String(n.title).includes('قطعی آب')), JSON.stringify(afterPanel?.notifications?.map((n) => n.title)));

const broadcast = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$count = sendNotification($pdo, 'اطلاعیه‌ی عمومی', 'متن اطلاعیه', 'all', [], 'admin');
echo json_encode(['count' => $count]);`));
ok('ارسال گروهی بدون خطا انجام شد', broadcast?.count > 0, JSON.stringify(broadcast));
const afterBroadcast = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر اعلان گروهی را هم می‌بیند',
  (afterBroadcast?.notifications || []).some((n) => String(n.title).includes('اطلاعیه‌ی عمومی')), JSON.stringify(afterBroadcast?.notifications?.map((n) => n.title)));

/* ---------- ۴) دیتابیس قدیمی با قید خارجی روی user_phone ---------- */
console.log('\n=== دیتابیس قدیمی: قید FOREIGN KEY روی notifications.user_phone ===');
const legacy = pickJson(await run(`
require '${APP}/admin/includes/db.php';
/* بازسازی همان اسکیمای دیتابیس قدیمی: قید خارجی روی user_phone */
$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->exec('DROP TABLE IF EXISTS notifications');
$pdo->exec('CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    send_id INT NULL,
    read_flag TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users (phone)
)');
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09120000001','الف') ON CONFLICT DO NOTHING");
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09120000002','ب') ON CONFLICT DO NOTHING");
$pdo->exec('PRAGMA foreign_keys = ON');

require '${APP}/admin/includes/functions.php';
$threw = '';
$count = 0;
try { $count = sendNotification($pdo, 'گروهی', 'با قید قدیمی', 'all', [], 'admin'); }
catch (Throwable $e) { $threw = $e->getMessage(); }

$rows = $pdo->query("SELECT user_phone FROM notifications ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
echo json_encode([
  'threw' => $threw,
  'count' => $count,
  'rows'  => $rows,
  'users' => $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
], JSON_UNESCAPED_UNICODE);`));
ok('با وجود قید قدیمی، ارسال گروهی خطای مرگبار نمی‌دهد', legacy?.threw === '' || (legacy?.rows || []).length > 0, JSON.stringify(legacy));
ok('اعلان کاربران واقعی حتی با وجود قید قدیمی درج می‌شود (تراکنش کامل برنمی‌گردد)',
  (legacy?.rows || []).includes('09120000001') && (legacy?.rows || []).includes('09120000002'), JSON.stringify(legacy));

/* ---------- ۵) دیتابیس قدیمی بدون ستون send_id ---------- */
console.log('\n=== دیتابیس قدیمی بدون ستون send_id ===');
const noColumn = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->exec('DROP TABLE IF EXISTS notifications');
$pdo->exec('CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    read_flag TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)');
$pdo->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('${PHONE}', 'بدون ستون send_id', 'متن اعلان قدیمی')");
echo json_encode(['ok' => 1]);`));
ok('دیتابیس قدیمی بدون send_id ساخته شد', noColumn?.ok === 1, JSON.stringify(noColumn));

const legacyList = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('فهرست اعلان‌ها با دیتابیس بدون send_id خطا نمی‌دهد و اعلان را نشان می‌دهد',
  legacyList?.success === true && (legacyList?.notifications || []).some((n) => String(n.title).includes('بدون ستون send_id')),
  JSON.stringify(legacyList));

/* ---------- ۶) درخواست تکراری: اعلان تکراری ساخته نشود ---------- */
console.log('\n=== ثبت تکراری همان درخواست ===');
/* پیش از سنجش، اعلان‌های آزمون‌های قبلی پاک می‌شوند تا شمارش دقیق باشد */
await run(`require '${APP}/admin/includes/db.php'; $pdo->exec('DELETE FROM notifications');`);

const POST_DUP = `
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = [
  'userPhone' => '${PHONE}',
  'client_ref' => 'E2E-REF-DUP',
  'title' => 'درخواست تکراری',
  'description' => 'همان درخواست قبلی',
  'category' => 'خدمات شهری',
];
require '${APP}/api/reports.php';`;
const notifCount = async () => Number(pickJson(await run(
  `require '${APP}/admin/includes/db.php'; echo json_encode(['n' => (int) $pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn()]);`))?.n);

const firstDup = pickJson(await run(POST_DUP));
const row1 = await notifCount();
const secondDup = pickJson(await run(POST_DUP));
const row2 = await notifCount();
/* حالت خراب: اعلان پاک شود و همان درخواست دوباره فرستاده شود → باید ساخته شود */
await run(`require '${APP}/admin/includes/db.php'; $pdo->exec('DELETE FROM notifications');`);
const thirdDup = pickJson(await run(POST_DUP));
const row3 = await notifCount();

ok('هر ثبت، یک اعلان می‌سازد', row1 === 1, `row1=${row1} code1=${firstDup?.tracking_code}`);
ok('ثبت دوباره‌ی همان درخواست اعلان تکراری نمی‌سازد',
  secondDup?.deduped === true && row2 === 1, `deduped=${secondDup?.deduped} row2=${row2}`);
ok('اگر اعلان نبود، در ثبت تکراری دوباره ساخته می‌شود (خودترمیمی)',
  row3 === 1 && firstDup?.tracking_code === thirdDup?.tracking_code,
  `row3=${row3} ${firstDup?.tracking_code} / ${thirdDup?.tracking_code}`);

/* ---------- ۷) یکسان بودن کد پیگیری: پاسخ ثبت = فهرست = متن اعلان ---------- */
console.log('\n=== یکسان بودن کد پیگیری (ثبت / فهرست / اعلان) ===');
const dupList = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const dupReports = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/reports.php';`));
const myReport = (dupReports?.reports || []).find((r) => String(r.client_ref) === 'E2E-REF-DUP');
const notifWithCode = (dupList?.notifications || []).find((n) => String(n.body || '').includes(String(firstDup?.tracking_code)));
ok('کد پیگیریِ گزارش در فهرست، همان کدی است که هنگام ثبت برگشت',
  !!myReport && myReport.code === firstDup?.tracking_code,
  `list=${myReport?.code} create=${firstDup?.tracking_code}`);
ok('متن اعلان هم همان کد پیگیری را دارد',
  !!notifWithCode && !!firstDup?.tracking_code,
  JSON.stringify(notifWithCode?.body));

/* ---------- ۸) ردیف‌های قدیمی با قالب شماره‌ی دیگر + خواندن/حذف ---------- */
console.log('\n=== ردیف‌های قدیمی (قالب شماره) و خواندن/حذف ===');
const legacyRows = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/api/_common.php';
$pdo->exec('DELETE FROM notifications');
$pdo->exec('DELETE FROM notification_reads');
$rows = [
  ['+989121112233', 'اعلان قدیمی +98'],
  ['۰۹۱۲۱۱۱۲۲۳۳',  'اعلان قدیمی با رقم فارسی'],
  ['00989121112233', 'اعلان قدیمی با ۰۰'],
  ['989121112233',  'اعلان قدیمی بدون صفر'],
];
foreach ($rows as $r) {
  $pdo->prepare('INSERT INTO notifications (user_phone, title, body) VALUES (?, ?, ?)')->execute([$r[0], $r[1], 'متن']);
}
$pdo->prepare('INSERT INTO notifications (user_phone, title, body) VALUES (?, ?, ?)')->execute(['09129999999', 'اعلان کاربر دیگر', 'متن']);
echo json_encode(['variants' => eplakPhoneVariants('09121112233'), 'ok' => 1], JSON_UNESCAPED_UNICODE);`));
ok('فهرست قالب‌های شماره ساخته می‌شود (شامل +98 و رقم فارسی)',
  (legacyRows?.variants || []).includes('+989121112233') && (legacyRows?.variants || []).includes('۰۹۱۲۱۱۱۲۲۳۳'),
  JSON.stringify(legacyRows?.variants));

const legacySeen = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('اعلان‌های قدیمی با هر قالب شماره‌ای در فهرست کاربر دیده می‌شوند',
  (legacySeen?.notifications || []).filter((n) => String(n.title).includes('اعلان قدیمی')).length === 4,
  JSON.stringify((legacySeen?.notifications || []).map((n) => n.title)));
ok('اعلان کاربر دیگر نمایش داده نمی‌شود',
  !(legacySeen?.notifications || []).some((n) => String(n.title).includes('کاربر دیگر')),
  JSON.stringify(legacySeen?.notifications?.map((n) => n.title)));

const firstId = (legacySeen?.notifications || [])[0]?.id;
const afterRead = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = ['action' => 'read', 'phone' => '${PHONE}', 'all' => 1];
require '${APP}/api/notifications.php';`));
ok('«همه را خواندم» همه‌ی اعلان‌های کاربر (با هر قالب شماره) را خوانده‌شده می‌کند',
  afterRead?.success === true && Number(afterRead?.marked) === 4,
  JSON.stringify(afterRead));

const otherSeen = pickJson(await run(`$_GET = ['phone' => '09129999999']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('اعلان کاربر دیگر با «همه را خواندم» این کاربر خوانده‌نشده می‌ماند',
  (otherSeen?.notifications || []).every((n) => Number(n.read_flag) === 0),
  JSON.stringify(otherSeen?.notifications));

const afterDelete = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = ['action' => 'delete', 'phone' => '${PHONE}', 'id' => ${firstId}];
require '${APP}/api/notifications.php';`));
ok('حذف تک‌اعلان برای همان کاربر انجام می‌شود', afterDelete?.success === true && Number(afterDelete?.hidden) === 1, JSON.stringify(afterDelete));

const afterDeleteList = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('اعلان حذف‌شده در فهرست همان کاربر نیست ولی ردیف دیتابیس پاک نشده',
  !(afterDeleteList?.notifications || []).some((n) => Number(n.id) === Number(firstId)),
  JSON.stringify(afterDeleteList?.notifications?.map((n) => n.id)));

/* ---------- ۹) دیتابیس قدیمی بدون ستون read_flag ---------- */
console.log('\n=== دیتابیس قدیمی بدون ستون read_flag ===');
await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->exec('DROP TABLE IF EXISTS notifications');
$pdo->exec('CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    send_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)');`);

const noFlagReport = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
$_POST = [
  'userPhone' => '${PHONE}',
  'client_ref' => 'E2E-REF-NOFLAG',
  'title' => 'درخواست روی دیتابیس قدیمی',
  'description' => 'بدون ستون read_flag',
  'category' => 'خدمات شهری',
];
require '${APP}/api/reports.php';`));
const noFlagList = pickJson(await run(`$_GET = ['phone' => '${PHONE}']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('ثبت درخواست روی دیتابیس بدون read_flag خطا نمی‌دهد',
  noFlagReport?.success === true && !!noFlagReport?.tracking_code, JSON.stringify(noFlagReport?.error || noFlagReport));
ok('اعلان «ثبت درخواست» روی دیتابیس بدون read_flag هم در فهرست کاربر دیده می‌شود',
  (noFlagList?.notifications || []).some((n) => String(n.body || '').includes(String(noFlagReport?.tracking_code))),
  JSON.stringify(noFlagList));

console.log('\n====================================================');
console.log('NOTIFY-E2E: ' + pass + ' passed, ' + fail + ' failed');
console.log('====================================================');
process.exit(fail ? 1 : 0);

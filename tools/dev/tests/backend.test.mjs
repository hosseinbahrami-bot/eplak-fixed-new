/* backend.test.mjs — دیتابیس، ساختار خودترمیم، ارسال اعلان، آپلود عکس و نمایش در پنل */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-backend.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.rmSync(`${APP}/uploads`, { recursive: true, force: true });

const FX = '/tmp/eplak-regression-fixtures';
fs.mkdirSync(FX, { recursive: true });
fs.writeFileSync(`${FX}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
fs.writeFileSync(`${FX}/bad.txt`, Buffer.from('not an image'));

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path', '/tmp'); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

console.log('\n=== دیتابیس، جدول‌ها و بذرها ===');
const db = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/media.php';
require_once '${APP}/shared/webpush.php';
require_once '${APP}/shared/fcm.php';
require_once '${APP}/shared/notification_reads.php';
$out = [];
$out['news'] = (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
$out['depts'] = (int) $pdo->query('SELECT COUNT(*) FROM departments')->fetchColumn();
$out['tables'] = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
$out['schema'] = eplakAppSetting($pdo, 'schema_version', '');
$out['send_cols'] = array_column($pdo->query('PRAGMA table_info(notification_sends)')->fetchAll(), 'name');
$out['report_cols'] = array_column($pdo->query('PRAGMA table_info(reports)')->fetchAll(), 'name');
$out['fcm_hidden'] = true;
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09121112233','آزمون')");
$out['sent'] = sendNotification($pdo, 'عنوان', 'متن', 'all', [], 'admin');
$out['recipients'] = count(getNotificationRecipients($pdo, (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn()));
echo json_encode($out);`));
ok('بذرها اجرا شدند (۶ خبر/دانستنی + ۶۵ واحد)', db?.news === 6 && db?.depts === 65, `news=${db?.news} depts=${db?.depts}`);
const wanted = ['notifications', 'notification_reads', 'notification_deletes', 'device_tokens', 'push_subscriptions', 'report_media', 'app_settings'];
const missing = wanted.filter((t) => !(db?.tables || []).includes(t));
ok('همه‌ی جدول‌های لازم ساخته شدند', missing.length === 0, 'گم‌شده: ' + missing.join(', '));
ok('نسخه‌ی ساختار دیتابیس تازه ثبت شد', /^2026-(09-30|10-0[123])\./.test(String(db?.schema)), String(db?.schema));
ok('ستون شناسه‌ی یکتای درخواست به جدول گزارش‌ها اضافه شد (پایه‌ی جلوگیری از تکرار)',
  (db?.report_cols || []).includes('client_ref'), JSON.stringify(db?.report_cols || []));
ok('ستون‌های شمارش فایربیس ساخته شدند', (db?.send_cols || []).includes('fcm_sent') && (db?.send_cols || []).includes('fcm_failed'), JSON.stringify(db?.send_cols));
ok('ارسال اعلان کار می‌کند (عمومی + کاربر)', db?.sent === 2 && db?.recipients === 2, JSON.stringify({ sent: db?.sent, recipients: db?.recipients }));

console.log('\n=== آپلود عکس گزارش (مسیر واقعی اپ) ===');
const upload = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'چاله خیابان', 'description' => 'توضیح', 'category' => 'سایر'];
$_FILES = ['media' => ['name' => ['p.png'], 'type' => ['image/png'], 'tmp_name' => ['${FX}/photo.png'], 'error' => [0], 'size' => [70]]];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('گزارش با یک عکس ثبت شد', upload?.success === true && upload?.media_count === 1, JSON.stringify(upload).slice(0, 160));
const stored = upload?.media?.[0];
ok('عکس در uploads/reports ذخیره شد', String(stored?.path || '').startsWith('uploads/reports/'), String(stored?.path));
ok('عکس روی دیسک است', !!stored && fs.existsSync(`${APP}/${stored.path}`));
ok('آدرس عکس نسبی است', !/^https?:/i.test(String(stored?.url || '')), String(stored?.url));

/* اعلان فوری بعد از ثبت گزارش از مسیر واقعی API (بدون هیچ تنظیم اضافه) */
const notifyAfter = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$row = $pdo->query("SELECT title, body FROM notifications WHERE user_phone = '09121112233' ORDER BY id DESC LIMIT 1")->fetch();
echo json_encode(['title' => $row['title'] ?? '', 'body' => $row['body'] ?? '']);`));
ok('ثبت گزارش از مسیر API، اعلان فوری برای همان کاربر می‌سازد',
  String(notifyAfter?.body || '').includes('کد پیگیری'), String(notifyAfter?.body));
ok('متن اعلان، تاریخ و ساعت ثبت را دارد', String(notifyAfter?.body || '').includes('ساعت'), String(notifyAfter?.body));

const guard = fs.existsSync(`${APP}/uploads/.htaccess`) ? fs.readFileSync(`${APP}/uploads/.htaccess`, 'utf8') : '';
ok('نگهبان uploads نسخه‌ی سالم ساخته شد', guard.includes('eplak-media-guard-v2'));
ok('هیچ php_flag بیرون از IfModule نیست', !/^php_(flag|value)/m.test(guard));

const bad = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'تست فایل بد', 'description' => 'x', 'category' => 'سایر'];
$_FILES = ['media' => ['name' => ['bad.txt'], 'type' => ['text/plain'], 'tmp_name' => ['${FX}/bad.txt'], 'error' => [0], 'size' => [11]]];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/reports.php';`));
ok('فایل غیرمجاز ذخیره نمی‌شود', (bad?.media_count || 0) === 0, JSON.stringify(bad).slice(0, 160));

console.log('\n=== پنل ادمین روی همان گزارش ===');
/* شناسه‌ی همان گزارشی که عکس داشت (نه آخرین گزارش دیتابیس؛ چون آزمون
   «فایل غیرمجاز» یک گزارش بدون عکس دیگر هم می‌سازد). */
const goodReportId = Number(upload?.id || 0);
const panel = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$rid = ${goodReportId} > 0 ? ${goodReportId} : (int) $pdo->query('SELECT id FROM reports ORDER BY id DESC LIMIT 1')->fetchColumn();
$media = getReportMedia($pdo, $rid);
echo json_encode([
  'count' => count($media),
  'url' => $media ? adminMediaUrl($media[0]['path']) : '',
  'stats' => getDashboardStats($pdo)['reports_with_media'] ?? 0,
]);`));
ok('پنل عکس شهروند را می‌بیند', panel?.count === 1, JSON.stringify(panel));
ok('آدرس عکس در پنل درست است', String(panel?.url || '').startsWith('../uploads/'), String(panel?.url));
ok('داشبورد گزارش‌های دارای فایل را می‌شمارد', (panel?.stats || 0) >= 1, String(panel?.stats));

console.log('\n=== موقعیت دقیق گزارش (GPS) — ذخیره، بازگشت و نمایش ===');
const geo = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'چاله با موقعیت', 'description' => 'توضیح', 'category' => 'سایر', 'location' => 'خیابان امام', 'lat' => '35.3242100', 'lng' => '51.6455300', 'locationAccuracy' => '12.5'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('گزارش با مختصات GPS ثبت شد', geo?.success === true && Math.abs(Number(geo?.lat) - 35.32421) < 0.0000001,
  JSON.stringify(geo).slice(0, 160));

const geoRow = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$row = $pdo->query('SELECT lat, lng, location_accuracy FROM reports ORDER BY id DESC LIMIT 1')->fetch();
echo json_encode(['lat' => $row['lat'], 'lng' => $row['lng'], 'acc' => $row['location_accuracy']]);`));
ok('مختصات در دیتابیس ذخیره شد',
  Math.abs(Number(geoRow?.lat) - 35.32421) < 0.0000001 && Math.abs(Number(geoRow?.lng) - 51.64553) < 0.0000001,
  JSON.stringify(geoRow));
ok('دقت موقعیت (متر) هم ذخیره می‌شود', Math.abs(Number(geoRow?.acc) - 12.5) < 0.01, String(geoRow?.acc));

const geoList = pickJson(await run(`
$_GET = ['phone' => '09121112233'];
$_SERVER['REQUEST_METHOD'] = 'GET';
require '${APP}/api/reports.php';`));
const geoItem = (geoList?.reports || []).find((r) => Math.abs(Number(r.lat) - 35.32421) < 0.0000001);
ok('API فهرست گزارش‌ها، مختصات را برمی‌گرداند', !!geoItem, JSON.stringify(geoList).slice(0, 160));

const geoBad = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'موقعیت خراب', 'description' => 'توضیح', 'category' => 'سایر', 'lat' => 'abc', 'lng' => '999'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('مختصات نامعتبر باعث خطا نمی‌شود (فقط نادیده گرفته می‌شود)',
  geoBad?.success === true && geoBad?.lat === null, JSON.stringify(geoBad).slice(0, 160));

const geoPanel = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$rid = (int) $pdo->query('SELECT id FROM reports WHERE lat IS NOT NULL ORDER BY id DESC LIMIT 1')->fetchColumn();
$r = getReportById($pdo, $rid);
echo json_encode(['lat' => $r['lat'] ?? null, 'lng' => $r['lng'] ?? null, 'has' => ($r['lat'] !== null && $r['lng'] !== null)]);`));
ok('پنل ادمین به مختصات همان گزارش دسترسی دارد', geoPanel?.has === true, JSON.stringify(geoPanel));

console.log('\n=== آپلود پیوست از مسیر JSON (بدون multipart) + ارسال تکه‌تکه ===');
/* ساخته شدن یک گزارش تازه برای آزمون پیوست */
const mediaReport = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون پیوست', 'description' => 'توضیح', 'category' => 'سایر'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
const MRID = Number(mediaReport?.id || 0);
ok('گزارش پایه برای آزمون پیوست ساخته شد', MRID > 0, JSON.stringify(mediaReport).slice(0, 120));

/* تصویر واقعی ۱×۱ (PNG) — بافر مستقل تا فایل fixture قبلی که جابه‌جا شده لازم نباشد */
const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const b64 = pngBuffer.toString('base64');

/* ۱) آپلود یک‌مرحله‌ای از مسیر JSON */
const up = pickJson(await run(`
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09121112233', 'reportId' => '${MRID}', 'name' => 'json.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('آپلود JSON (base64) کار می‌کند', up?.success === true && up?.media_count === 1, JSON.stringify(up).slice(0, 200));
ok('فایل آپلودشده داخل uploads/reports ذخیره می‌شود', String(up?.media?.path || '').startsWith('uploads/reports/'), String(up?.media?.path));
ok('فایل روی دیسک موجود است', !!up?.media?.path && fs.existsSync(`${APP}/${up.media.path}`));

/* ۲) امنیت: شماره‌ی غیرمالک نمی‌تواند فایل اضافه کند */
const foreign = pickJson(await run(`
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09129998877', 'reportId' => '${MRID}', 'name' => 'x.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('شماره‌ی غیرمالک اجازه‌ی افزودن فایل ندارد', foreign?.success === false, JSON.stringify(foreign).slice(0, 160));

/* ۳) سقف تعداد فایل هر گزارش */
const cap = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
for ($i = 0; $i < 6; $i++) {
    $pdo->exec("INSERT INTO report_media (report_id, kind, file_path, original_name, mime_type, size_bytes) VALUES (${MRID}, 'image', 'uploads/reports/2026/09/f$_i.png', 'f.png', 'image/png', 100)");
}
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09121112233', 'reportId' => '${MRID}', 'name' => 'cap.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('سقف تعداد فایل هر گزارش رعایت می‌شود', cap?.success === false && String(cap?.error || '').includes('حداکثر'), JSON.stringify(cap).slice(0, 160));

/* گزارش تازه برای آزمون تکه‌تکه (سقف بالا پر شد) */
const chunkReport = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون فیلم تکه‌تکه', 'description' => 'توضیح', 'category' => 'سایر'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
const CRID = Number(chunkReport?.id || 0);
ok('گزارش دوم برای آزمون تکه‌تکه ساخته شد', CRID > 0, String(CRID));

/* ۴) ارسال تکه‌تکه: PNG در دو نیمه */
const raw = pngBuffer;
const half1 = raw.slice(0, Math.floor(raw.length / 2)).toString('base64');
const half2 = raw.slice(Math.floor(raw.length / 2)).toString('base64');

const chunk1 = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'abcdef12abcd1234', 'index' => '0', 'total' => '2', 'name' => 'chunk.png', 'mime' => 'image/png', 'data' => '${half1}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی اول پذیرفته می‌شود و هنوز ثبت نهایی نمی‌شود',
  chunk1?.success === true && chunk1?.done === false && chunk1?.received === 1, JSON.stringify(chunk1).slice(0, 160));

const chunk2 = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'abcdef12abcd1234', 'index' => '1', 'total' => '2', 'name' => 'chunk.png', 'mime' => 'image/png', 'data' => '${half2}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی آخر، فایل را به هم می‌چسباند و ثبت می‌کند',
  chunk2?.success === true && chunk2?.done === true && chunk2?.media_count === 1, JSON.stringify(chunk2).slice(0, 200));

const assembled = chunk2?.media?.path ? fs.statSync(`${APP}/${chunk2.media.path}`).size : 0;
ok('حجم فایل ساخته‌شده با فایل اصلی یکی است', assembled === raw.length, `${assembled} ≠ ${raw.length}`);

/* ۵) ترتیب تکه‌ها */
const badOrder = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'bad0order0123', 'index' => '1', 'total' => '3', 'name' => 'x.png', 'mime' => 'image/png', 'data' => '${half1}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی خارج از نوبت رد می‌شود (فایل خراب ساخته نشود)', badOrder?.success === false && badOrder?.expected === 0, JSON.stringify(badOrder).slice(0, 160));

/* ۶) محتوای غیرمجاز در تکه‌ی آخر رد می‌شود */
const evilTxt = Buffer.from('not an image at all').toString('base64');
const evil = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'evil00001234567', 'index' => '0', 'total' => '1', 'name' => 'evil.txt', 'mime' => 'text/plain', 'data' => '${evilTxt}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('فایل غیرمجاز در مسیر تکه‌تکه هم ذخیره نمی‌شود', evil?.success === false, JSON.stringify(evil).slice(0, 160));

/* ۷) وضعیت پیوست‌های گزارش */
const status = pickJson(await run(`
$_GET = ['action' => 'media_status'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('کنش media_status تعداد پیوست‌ها را برمی‌گرداند', status?.success === true && status?.media_count === 1, JSON.stringify(status).slice(0, 160));

/* ۸) پنل ادمین همان فایل تکه‌تکه‌شده را می‌بیند */
const panelMedia = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$media = getReportMedia($pdo, ${CRID});
echo json_encode([
  'count' => count($media),
  'kind' => $media[0]['kind'] ?? '',
  'url' => $media ? adminMediaUrl($media[0]['path']) : '',
]);`));
ok('پنل ادمین فایل ارسال‌شده از مسیر تازه را می‌بیند',
  panelMedia?.count === 1 && panelMedia?.kind === 'image' && String(panelMedia?.url || '').startsWith('../uploads/'),
  JSON.stringify(panelMedia));

console.log('\n=== مسیر واقعی اپ: بدنه‌ی ساده (بدون multipart و بدون preflight) ===');

/* گزارش تازه برای آزمون «پیوست داخل بدنه» */
const inlineReport = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون پیوست داخلی', 'description' => 'توضیح', 'category' => 'سایر'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
require '${APP}/api/reports.php';`));
const IRID = Number(inlineReport?.id || 0);
ok('گزارش با نوع محتوای «ساده» (text/plain) ثبت می‌شود', IRID > 0, JSON.stringify(inlineReport).slice(0, 140));

/* همان درخواستی که اپ می‌فرستد: آرایه‌ی media با data URL */
const inlineBig = Buffer.alloc(700 * 1024, 0x41);
const bigB64 = inlineBig.toString('base64');
const inlineSaved = pickJson(await run(`
$_POST = [
    'phone' => '09121112233',
    'title' => 'گزارش با پیوست داخلی',
    'description' => 'توضیح',
    'category' => 'سایر',
    'media' => [
        ['name' => 'small.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'],
        ['name' => 'photo.jpg', 'mime' => 'image/jpeg', 'data' => 'data:image/jpeg;base64,${bigB64}'],
    ],
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
require '${APP}/api/reports.php';`));
ok('پیوست‌های داخل بدنه‌ی گزارش ذخیره می‌شوند (بدون multipart)',
  inlineSaved?.success === true && inlineSaved?.media_count === 2, JSON.stringify(inlineSaved).slice(0, 200));
ok('عکس بزرگ‌تر (۷۰۰ کیلوبایت خام) هم پذیرفته می‌شود',
  Array.isArray(inlineSaved?.media) && inlineSaved.media.some((m) => Number(m.size) > 600 * 1024),
  JSON.stringify(inlineSaved?.media || []).slice(0, 200));

const inlineStatus = pickJson(await run(`
$_GET = ['action' => 'media_status'];
$_POST = ['phone' => '09121112233', 'reportId' => '${Number(inlineSaved?.id || 0)}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تأیید از سرور: هر دو پیوست روی سرور هستند',
  inlineStatus?.success === true && inlineStatus?.media_count === 2, JSON.stringify(inlineStatus).slice(0, 160));

/* تکه‌تکه با همان نوع محتوای اپ */
const chunkPlain = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${IRID}', 'uploadId' => 'plain0001234567', 'index' => '0', 'total' => '1', 'name' => 'one.png', 'mime' => 'image/png', 'data' => '${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
require '${APP}/api/media.php';`));
ok('ارسال تکه‌تکه با بدنه‌ی ساده (بدون preflight) کار می‌کند',
  chunkPlain?.success === true && chunkPlain?.done === true, JSON.stringify(chunkPlain).slice(0, 180));

/* بدنه‌ی خالی اما با CONTENT_LENGTH: باید پیام روشن post_max_size بدهد، نه «Invalid JSON» */
const tooBig = pickJson(await run(`
$_POST = [];
$_GET = [];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
$_SERVER['CONTENT_LENGTH'] = '9000000';
require '${APP}/api/reports.php';`));
ok('بدنه‌ی بزرگ/دورریخته‌شده، پیام روشن post_max_size می‌گیرد (نه Invalid JSON)',
  tooBig?.success === false && String(tooBig?.error || '').includes('post_max_size'),
  JSON.stringify(tooBig).slice(0, 160));

console.log('\n=== ساختار خودترمیم روی دیتابیس قدیمی ===');
const legacy = pickJson(await run(`
$legacy = '/tmp/eplak-regression-legacy.sqlite';
@unlink($legacy);
$old = new PDO('sqlite:' . $legacy);
$old->exec("CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone VARCHAR(20), title VARCHAR(255), body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$old->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('all','قدیمی','متن قدیمی')");
$old = null;
putenv('DB_SQLITE_PATH=' . $legacy);
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$cols = array_column($pdo->query('PRAGMA table_info(notifications)')->fetchAll(), 'name');
$sendId = sendNotification($pdo, 'تازه', 'متن', 'all', [], 'admin');
$kept = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE title = 'قدیمی'")->fetchColumn();
echo json_encode(['has_send_id' => in_array('send_id', $cols, true), 'send_ok' => $sendId >= 1, 'old_rows' => $kept]);`));
ok('ستون send_id خودکار به دیتابیس قدیمی اضافه شد', legacy?.has_send_id === true, JSON.stringify(legacy));
ok('ارسال اعلان روی دیتابیس قدیمی کار می‌کند (خطای قبلی)', legacy?.send_ok === true, JSON.stringify(legacy));
ok('داده‌های قبلی حفظ شدند', legacy?.old_rows === 1, JSON.stringify(legacy));

/* دیتابیس قدیمیِ همین سایت، جدول reports را بدون ستون‌های lat/lng دارد؛
   همگام‌سازی خودکار باید آن‌ها را اضافه کند تا موقعیت دقیق ذخیره شود. */
const legacyGeo = pickJson(await run(`
$legacy = '/tmp/eplak-regression-legacy-geo.sqlite';
@unlink($legacy);
$old = new PDO('sqlite:' . $legacy);
$old->exec("CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone VARCHAR(20) NOT NULL, title VARCHAR(255) NOT NULL, description TEXT NOT NULL, category VARCHAR(100) NOT NULL, department VARCHAR(255) DEFAULT '', sub_department VARCHAR(255) DEFAULT '', location VARCHAR(500) DEFAULT '', status VARCHAR(50) DEFAULT 'pending', reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$old = null;
putenv('DB_SQLITE_PATH=' . $legacy);
require_once '${APP}/admin/includes/db.php';
$cols = array_column($pdo->query('PRAGMA table_info(reports)')->fetchAll(), 'name');
echo json_encode(['lat' => in_array('lat', $cols, true), 'lng' => in_array('lng', $cols, true), 'acc' => in_array('location_accuracy', $cols, true)]);`));
ok('ستون‌های موقعیت خودکار به جدول reports قدیمی اضافه شدند',
  legacyGeo?.lat === true && legacyGeo?.lng === true && legacyGeo?.acc === true, JSON.stringify(legacyGeo));

console.log('\n=== صفحه‌ی «بررسی نسخه» در پنل ادمین ===');
const ver = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/version.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/fcm.php';
require_once '${APP}/shared/webpush.php';
ob_start(); require '${APP}/admin/version.php'; $html = ob_get_clean();
$stored = (string) eplakAppSetting($pdo, 'schema_version', '');
echo json_encode([
  'len' => strlen($html),
  'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Notice:)/', $html) === 1,
  'has_schema' => strpos($html, EPLAK_SCHEMA_VERSION) !== false,
  'schema_in_db' => $stored === EPLAK_SCHEMA_VERSION,
  'badge_ok' => substr_count($html, 'pill-ok'),
  'badge_bad' => substr_count($html, 'pill-bad'),
  'fcm_hint' => strpos($html, 'فایربیس') !== false,
  'apk_hint' => strpos($html, 'بررسی نسخه') !== false,
]);`));
ok('صفحه‌ی بررسی نسخه بدون خطا رندر می‌شود', (ver?.len || 0) > 3000 && ver?.fatal !== true, JSON.stringify(ver));
ok('نسخه‌ی کد در صفحه نشان داده می‌شود', ver?.has_schema === true);
ok('هم‌خوانی نسخه‌ی دیتابیس تأیید می‌شود', ver?.schema_in_db === true);
ok('فایل‌های نسخه‌ی جدید «هست» علامت خورده‌اند', (ver?.badge_ok || 0) >= 5, JSON.stringify({ ok: ver?.badge_ok, bad: ver?.badge_bad }));
ok('وضعیت فایربیس و اعلان مرورگر نمایش داده می‌شود', ver?.fcm_hint === true);

console.log('\n=== هم‌خوانی منوی پنل ===');
const fsx = await import('fs');
const adminDir = `${APP}/admin`;
const navPages = fsx.readdirSync(adminDir).filter((f) => f.endsWith('.php'));
let navCount = 0, missingLink = [];
for (const f of navPages) {
  const html = fsx.readFileSync(`${adminDir}/${f}`, 'utf8');
  const hasSidebar = /href="settings\.php"><i class="fas fa-cog"><\/i> <span>تنظیمات<\/span>/.test(html);
  if (!hasSidebar) continue;
  navCount++;
  if (!html.includes('href="version.php"')) missingLink.push(f);
}
ok('صفحات پنل با منوی کنار، لینک «بررسی نسخه» دارند', navCount >= 20 && missingLink.length === 0,
   `صفحات دارای منو: ${navCount} • بدون لینک: ${missingLink.join(', ') || 'هیچ'}`);

console.log('\n=== پنل ادمین: تغییر وضعیت ← دیده شدن در اپ ===');

/* گزارش تازه برای آزمون تغییر وضعیت از پنل */
const statusReport = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون وضعیت', 'description' => 'توضیح', 'category' => 'سایر'];
require '${APP}/api/reports.php';`));
const SRID = Number(statusReport?.id || 0);
ok('گزارش آزمون وضعیت ساخته شد', SRID > 0, JSON.stringify(statusReport).slice(0, 120));

/* همان کاری که دکمه‌ی «ثبت پاسخ / تغییر وضعیت» پنل انجام می‌دهد */
const setStatus = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
saveReportReply($pdo, ${SRID}, 'اکیپ شهرداری اعزام شد', 'done');
$row = $pdo->query('SELECT status, reply FROM reports WHERE id = ${SRID}')->fetch();
echo json_encode(['status' => $row['status'], 'reply' => $row['reply'], 'label' => statusLabel($row['status'])]);`));
ok('پنل ادمین وضعیت را در دیتابیس ذخیره می‌کند', setStatus?.status === 'done', JSON.stringify(setStatus));
ok('برچسب فارسی وضعیت درست ساخته می‌شود', setStatus?.label === 'انجام شد', String(setStatus?.label));

/* همان درخواستی که اپ می‌زند (GET api/reports.php?phone=…) */
const appGet = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['phone' => '09121112233'];
require '${APP}/api/reports.php';`));
const appRow = (appGet?.reports || []).find((r) => Number(r.id) === SRID);
ok('اپ همین وضعیت تازه را از سرور می‌گیرد', appRow?.status === 'done', JSON.stringify(appRow?.status));
ok('پاسخ مدیریت هم به اپ می‌رسد', String(appRow?.reply || '').includes('اکیپ شهرداری'), String(appRow?.reply));

/* نگاشت مقدارهای قدیمی/فارسی به وضعیت درست (گزارش‌های قدیمی هاست) */
const legacyStatuses = pickJson(await run(`
require_once '${APP}/admin/includes/functions.php';
echo json_encode([
  'fa_pending' => reportStatusOf(['status' => 'در انتظار', 'department' => '']),
  'fa_progress' => reportStatusOf(['status' => 'در حال بررسی', 'department' => '']),
  'fa_done' => reportStatusOf(['status' => 'انجام‌شده', 'department' => '']),
  'swapped' => reportStatusOf(['status' => 'آموزش و پرورش', 'department' => 'done']),
  'class_done' => statusClass('done'),
]);`));
ok('وضعیت‌های فارسی قدیمی هم درست خوانده می‌شوند',
  legacyStatuses?.fa_pending === 'pending' && legacyStatuses?.fa_done === 'done', JSON.stringify(legacyStatuses));
ok('ردیف‌های جابه‌جا‌شده‌ی قدیمی هم تشخیص داده می‌شوند', legacyStatuses?.swapped === 'done', JSON.stringify(legacyStatuses));

/* تغییر وضعیت از خود فهرست گزارش‌ها (کشوی وضعیت) */
const listHtml = String(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/reports.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
ob_start(); require '${APP}/admin/reports.php'; echo ob_get_clean();`));

ok('فهرست گزارش‌ها بدون خطای PHP رندر می‌شود',
  listHtml.length > 3000 && !/Fatal error|Parse error|Warning:|Notice:/.test(listHtml), String(listHtml.length));
const editHrefs = Array.from(listHtml.matchAll(/href="([^"]*report[^"]*)"/g), (m) => m[1]).slice(0, 6);
ok('دکمه‌ی «ویرایش» به صفحه‌ی ویرایش می‌رود (قبلاً به actions.php می‌رفت و کار نمی‌کرد)',
  /href="report_edit\.php\?id=\d+/.test(listHtml) && !/type=report_edit/.test(listHtml),
  editHrefs.join(' | '));
ok('کشوی تغییر سریع وضعیت در فهرست گزارش‌ها هست',
  /class="status-select/.test(listHtml) && /name="status"/.test(listHtml));
ok('برچسب فارسی وضعیت (نه کلید انگلیسی) در فهرست دیده می‌شود',
  /(در انتظار|در حال بررسی|انجام‌شده)\s*<\/option>/.test(listHtml) && !/>\s*done\s*</.test(listHtml));

/* صفحه‌ی ویرایش گزارش باید کامل و بدون خطا باشد */
const editId = SRID;
const editHtml = String(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/report_edit.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
$_GET = ['id' => '${editId}'];
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
ob_start(); require '${APP}/admin/report_edit.php'; echo ob_get_clean();`));
ok('صفحه‌ی ویرایش گزارش بدون خطا باز می‌شود',
  editHtml.length > 3000 && !/Fatal error|Parse error|Warning:|Notice:/.test(editHtml), String(editHtml.length));
ok('فرم ویرایش، فیلدهای گزارش را دارد',
  /name="title"/.test(editHtml) && /name="status"/.test(editHtml) && /name="user_phone"/.test(editHtml));

/* ذخیره‌ی ویرایش (همان POST صفحه) و دیدن نتیجه در اپ */
const edited = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
updateReport($pdo, ${editId}, [
  'user_phone' => '09121112233', 'title' => 'عنوان ویرایش‌شده', 'description' => 'توضیح ویرایش‌شده',
  'category' => 'سایر', 'department' => 'آموزش و پرورش', 'sub_department' => 'ابتدایی',
  'location' => 'خیابان امام خمینی', 'status' => 'in_progress',
]);
$row = $pdo->query('SELECT title, department, status FROM reports WHERE id = ${editId}')->fetch();
echo json_encode(['title' => $row['title'], 'dept' => $row['department'], 'status' => $row['status']]);`));
ok('ویرایش گزارش ذخیره می‌شود', edited?.title === 'عنوان ویرایش‌شده' && edited?.dept === 'آموزش و پرورش', JSON.stringify(edited));

/* همان درخواستی که اپ می‌زند، پس از ویرایش */
const editedInApp = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['phone' => '09121112233'];
require '${APP}/api/reports.php';`));
const editedRow = (editedInApp?.reports || []).find((r) => Number(r.id) === editId);
ok('ویرایش وضعیت و عنوان هم در اپ دیده می‌شود',
  editedRow?.status === 'in_progress' && editedRow?.title === 'عنوان ویرایش‌شده',
  JSON.stringify({ s: editedRow?.status, t: editedRow?.title }));

console.log('\n=== گالری پیوست‌ها در پنل ادمین ===');
const detailHtml = String(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/report_detail.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
$_GET = ['id' => '${CRID}'];
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
ob_start(); require '${APP}/admin/report_detail.php'; echo ob_get_clean();`));
ok('صفحه‌ی جزئیات گزارش بدون خطا رندر می‌شود',
  detailHtml.length > 3000 && !/Fatal error|Parse error|Warning:|Notice:/.test(detailHtml), String(detailHtml.length));
ok('پیوست‌های شهروند در گالری نشان داده می‌شوند',
  /media-strip-admin/.test(detailHtml) && /media-chip/.test(detailHtml));
ok('روی هر پیوست، نمایش تمام‌صفحه باز می‌شود',
  /eplakAdminMediaOpen/.test(detailHtml) && /admin-media-viewer/.test(detailHtml));
ok('حجم هر پیوست روی کارت نوشته می‌شود', /media-chip-size/.test(detailHtml));
const adminCss = fs.readFileSync(`${APP}/admin/assets/style.css`, 'utf8');
ok('کارت‌های پیوست کوچک و مربعی‌اند (اندازه‌ی مناسب پنل)',
  /\.media-chip \{/.test(adminCss) && /aspect-ratio: 1 \/ 1/.test(adminCss) && /minmax\(104px/.test(adminCss));
ok('نمایش تمام‌صفحه‌ی پنل استایل دارد', /\.admin-media-viewer\.open/.test(adminCss));

/* تغییر سریع وضعیت از خود فهرست گزارش‌ها (POST به reports.php) */
/* مسیر واقعی: ارسال فرم کشوی وضعیت به خود صفحه‌ی فهرست (صفحه با ریدایرکت تمام می‌شود) */
await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/reports.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/admin/reports.php';
$_SERVER['PHP_SELF'] = '/admin/reports.php';
$_POST = ['quick_status_id' => '${editId}', 'status' => 'done', 'reply' => 'کار تمام شد', '_token' => eplakCsrfToken()];
ob_start();
require '${APP}/admin/reports.php';
echo ob_get_clean();`);

/* نتیجه‌ی همان درخواست را از دیتابیس می‌خوانیم */
const quickSwitch = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$row = $pdo->query('SELECT status, reply FROM reports WHERE id = ${editId}')->fetch();
echo json_encode(['status' => $row['status'] ?? '', 'reply' => $row['reply'] ?? '']);`));
ok('تغییر وضعیت از خود فهرست (کشوی وضعیت) ذخیره می‌شود',
  quickSwitch?.status === 'done' && quickSwitch?.reply === 'کار تمام شد', JSON.stringify(quickSwitch));

const afterQuick = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['phone' => '09121112233'];
require '${APP}/api/reports.php';`));
const afterQuickRow = (afterQuick?.reports || []).find((r) => Number(r.id) === editId);
ok('وضعیت تغییر‌یافته از فهرست هم بلافاصله در اپ دیده می‌شود', afterQuickRow?.status === 'done', String(afterQuickRow?.status));

console.log('\n=== روند رسیدگی: یکسان در اپ و پنل ادمین ===');

const tlSetup = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
$_POST = ['phone' => '09121112233', 'title' => 'گزارش روند رسیدگی', 'description' => 'توضیح', 'category' => 'سایر',
          'department' => 'آموزش و پرورش', 'sub_department' => 'ابتدایی'];
require '${APP}/api/reports.php';`));
const TLID = Number(tlSetup?.id || 0);
ok('گزارش تازه برای آزمون روند ساخته شد', TLID > 0, JSON.stringify(tlSetup).slice(0, 140));
ok('گام‌های آغازین (ثبت + ارجاع) در پاسخ سرور برمی‌گردند',
  Array.isArray(tlSetup?.timeline) && tlSetup.timeline.length >= 2, JSON.stringify((tlSetup?.timeline || []).map(e => e.type)));

const tlDb = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$rows = $pdo->query('SELECT type, title, actor FROM report_events WHERE report_id = ${TLID} ORDER BY id ASC')->fetchAll();
echo json_encode(['count' => count($rows), 'types' => array_column($rows, 'type'), 'actors' => array_column($rows, 'actor')]);`));
ok('جدول روند رسیدگی واقعاً پر می‌شود', (tlDb?.count || 0) >= 2, JSON.stringify(tlDb));
ok('گام ثبت گزارش به نام شهروند و گام ارجاع به نام سامانه ثبت می‌شود',
  (tlDb?.types || []).includes('created') && (tlDb?.types || []).includes('assigned'), JSON.stringify(tlDb?.types));

/* تغییر وضعیت از پنل → باید در روند اپ هم دیده شود */
const tlSwitch = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
require_once '${APP}/admin/includes/functions.php';
saveReportReply($pdo, ${TLID}, 'همکاران در محل حاضر شدند', 'in_progress');
$rows = $pdo->query('SELECT type, title, actor, status FROM report_events WHERE report_id = ${TLID} ORDER BY id ASC')->fetchAll();
echo json_encode(['types' => array_column($rows, 'type'), 'last' => end($rows)]);`));
ok('تغییر وضعیت از پنل، یک گام در روند می‌سازد',
  (tlSwitch?.types || []).includes('status'), JSON.stringify(tlSwitch?.types));
ok('پاسخ مدیریت هم به‌صورت گام جدا ثبت می‌شود',
  (tlSwitch?.types || []).includes('reply'), JSON.stringify(tlSwitch?.types));
ok('گام تغییر وضعیت، کلید انگلیسی وضعیت را نگه می‌دارد (هم‌خوان با اپ)',
  (tlSwitch?.last?.status || '') === 'in_progress', JSON.stringify(tlSwitch?.last));

/* همان چیزی که اپ می‌گیرد */
const tlApp = pickJson(await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['phone' => '09121112233'];
require '${APP}/api/reports.php';`));
const tlRow = (tlApp?.reports || []).find((r) => Number(r.id) === TLID);
ok('اپ همان گام‌ها را در فهرست گزارش‌ها می‌گیرد',
  Array.isArray(tlRow?.timeline) && tlRow.timeline.length >= 3, JSON.stringify((tlRow?.timeline || []).map(e => e.type)));
ok('هر گام، سازنده و تاریخ دارد (برای نمایش در اپ)',
  (tlRow?.timeline || []).every((e) => e.actor && e.created_at), JSON.stringify((tlRow?.timeline || []).slice(-1)));
ok('تعداد گام‌ها هم همراه گزارش می‌آید', Number(tlRow?.timeline_count || 0) >= 3, String(tlRow?.timeline_count));

/* ویرایش گزارش → گام ویرایش */
const tlEdit = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
updateReport($pdo, ${TLID}, ['user_phone' => '09121112233', 'title' => 'عنوان تازه‌ی گزارش', 'description' => 'توضیح',
  'category' => 'سایر', 'department' => 'روابط عمومی', 'sub_department' => '', 'location' => 'خیابان تازه', 'status' => 'in_progress']);
$rows = $pdo->query('SELECT type, title FROM report_events WHERE report_id = ${TLID} ORDER BY id ASC')->fetchAll();
echo json_encode(['types' => array_column($rows, 'type'), 'titles' => array_column($rows, 'title')]);`));
ok('ویرایش گزارش هم گام تازه در روند می‌سازد',
  (tlEdit?.types || []).includes('edit'), JSON.stringify(tlEdit?.types));

/* پنل ادمین: صفحه‌ی جزئیات باید همان گام‌ها و صفحه‌ی فهرست هم ستون وضعیت را نشان دهد */
const tlDetail = String(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/report_detail.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
$_GET = ['id' => '${TLID}'];
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require_once '${APP}/admin/includes/functions.php';
ob_start(); require '${APP}/admin/report_detail.php'; echo ob_get_clean();`));
ok('پنل، بخش «روند رسیدگی» را نشان می‌دهد',
  /روند رسیدگی/.test(tlDetail) && /class="flow-list"/.test(tlDetail) && /class="flow-step is-/.test(tlDetail), String(tlDetail.length));
ok('پنل دقیقاً همان چهار مرحله‌ی اپ را نشان می‌دهد',
  /ثبت گزارش/.test(tlDetail) && /در حال انتظار/.test(tlDetail)
  && /در حال رسیدگی/.test(tlDetail) && /انجام شد/.test(tlDetail));
ok('گام‌ها در پنل با سازنده (شهرداری/شهروند/سامانه) دیده می‌شوند',
  /event-actor/.test(tlDetail) && /(شهرداری|شهروند|سامانه)/.test(tlDetail));
ok('روند رسیدگی در پنل با همان تابع مشترک اپ ساخته می‌شود',
  /eplakReportFlowStages/.test(fs.readFileSync(path.join(APP, 'admin/report_detail.php'), 'utf8'))
  && /function eplakReportFlowStages/.test(fs.readFileSync(path.join(APP, 'shared/media.php'), 'utf8')));

/* چهار مرحله در سرور: درست، به ترتیب و با وضعیت درست */
const flow = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/media.php';
echo json_encode([
  'now' => eplakReportFlowStages('in_progress', [], '2026-10-01 10:00:00'),
  'done' => eplakReportFlowStages('done', [], ''),
  'keys' => array_keys(eplakReportFlowStageLabels()),
  'labels' => array_values(eplakReportFlowStageLabels()),
]);`));
ok('سرور چهار مرحله را به ترتیب برمی‌گرداند',
  JSON.stringify(flow?.labels) === JSON.stringify(['ثبت گزارش', 'در حال انتظار', 'در حال رسیدگی', 'انجام شد']),
  JSON.stringify(flow?.labels));
ok('«در حال رسیدگی» یعنی: ثبت و انتظار سپری شده، رسیدگی در جریان، انجام‌شد هنوز نه',
  flow?.now?.[0]?.state === 'done' && flow?.now?.[1]?.state === 'done'
  && flow?.now?.[2]?.state === 'current' && flow?.now?.[3]?.state === 'waiting',
  JSON.stringify((flow?.now || []).map((x) => x.key + ':' + x.state)));
ok('وقتی کار تمام شد، مرحله‌ی «انجام شد» به‌عنوان مرحله‌ی نهایی انتخاب می‌شود',
  flow?.done?.[2]?.state === 'done' && flow?.done?.[3]?.state === 'done');
ok('صفحه‌ی جزئیات پنل بدون خطای PHP رندر می‌شود',
  tlDetail.length > 3000 && !/Fatal error|Parse error|Warning:|Notice:/.test(tlDetail));

/* افزودن پیوست از دروازه‌ی گزارش‌ها (مسیر پشتیبان اپ) */
const addMedia = pickJson(await run(`
$rawPng = @file_get_contents('${FX}/photo.png');
if ($rawPng === false || $rawPng === '') { $rawPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='); }
$png = base64_encode($rawPng);
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
$_POST = ['action' => 'add_media', 'phone' => '09121112233', 'reportId' => ${TLID},
          'name' => 'backup.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,' . $png];
require '${APP}/api/reports.php';`));
ok('مسیر پشتیبان افزودن پیوست (add_media) کار می‌کند',
  addMedia?.success === true && Number(addMedia?.media_count) >= 1, JSON.stringify(addMedia).slice(0, 160));
ok('پیوست افزوده‌شده از مسیر پشتیبان هم در پنل دیده می‌شود',
  String(addMedia?.media?.path || '').startsWith('uploads/reports/'), String(addMedia?.media?.path));
ok('افزودن پیوست، گام تازه در روند ثبت می‌کند',
  (pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$c = $pdo->query("SELECT COUNT(*) FROM report_events WHERE report_id = ${TLID} AND type = 'media'")->fetchColumn();
echo json_encode(['media_events' => (int) $c]);`))?.media_events || 0) >= 1);
const foreignAdd = String(await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'text/plain;charset=UTF-8';
$_POST = ['action' => 'add_media', 'phone' => '09129999999', 'reportId' => ${TLID}, 'name' => 'x.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,iVBORw0KGgo='];
require '${APP}/api/reports.php';`));
ok('افزودن پیوست به گزارش دیگری (شماره‌ی نامربوط) مسدود است',
  /"success":false/.test(foreignAdd), foreignAdd.slice(0, 160));

/* ═══════════════════════════════════════════════════════════════════
   «یک درخواست، یک کد پیگیری» — گزارش تکراری ساخته نشود
   (باگ گزارش‌شده: وقتی ارسال با پیوست گیر می‌کرد، دو گزارش با دو کد و
    یکی بدون پیوست ساخته می‌شد)
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n=== یک درخواست = یک گزارش (ضد تکرار) ===');

/* تابع کمکی: همان درخواستی که اپ می‌زند، با شناسه‌ی یکتا */
const submitOnce = (ref, withMedia) => run(`
$_POST = [
  'phone' => '09121112233', 'title' => 'چاله خیابان ۲', 'description' => 'توضیح تکرار',
  'category' => 'سایر', 'client_ref' => '${ref}',
];
${withMedia ? `$_POST['media'] = [['name' => 'photo.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==']];` : ''}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'application/json';
require '${APP}/api/reports.php';`);

const DUP_REF = 'EPL-TEST' + Date.now().toString(36).toUpperCase();

/* ۱) ارسال «با پیوست» */
const firstSubmit = pickJson(await submitOnce(DUP_REF, true));
ok('درخواست اول با پیوست ثبت می‌شود',
  firstSubmit?.success === true && !!firstSubmit?.id, JSON.stringify(firstSubmit).slice(0, 140));

/* ۲) همان درخواست دوباره (همان شناسه) → نباید گزارش دوم بسازد */
const secondSubmit = pickJson(await submitOnce(DUP_REF, true));
ok('ارسال دوباره‌ی همان درخواست، گزارش دوم نمی‌سازد',
  secondSubmit?.success === true && Number(secondSubmit?.id) === Number(firstSubmit?.id),
  `first=${firstSubmit?.id} second=${secondSubmit?.id}`);
ok('کد پیگیری بار دوم هم همان کد اول است (کد تکراری ساخته نمی‌شود)',
  String(secondSubmit?.tracking_code) === String(firstSubmit?.tracking_code),
  `${firstSubmit?.tracking_code} / ${secondSubmit?.tracking_code}`);
ok('پاسخ بار دوم با نشانه‌ی «تکراری» علامت خورده تا اپ گزارش تازه نسازد',
  secondSubmit?.deduped === true);
ok('در دیتابیس فقط یک گزارش با این شناسه هست',
  (pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
echo json_encode(['n' => (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE client_ref = '${DUP_REF}'")->fetchColumn()]);`)))?.n === 1);

/* ۳) همان درخواست، این بار «بدون پیوست» — سناریوی دقیق باگ کاربر */
const thirdSubmit = pickJson(await submitOnce(DUP_REF, false));
ok('ارسال «بدون پیوست» همان درخواست هم گزارش تازه نمی‌سازد (سناریوی دقیق باگ)',
  Number(thirdSubmit?.id) === Number(firstSubmit?.id) && thirdSubmit?.deduped === true,
  `id=${thirdSubmit?.id} deduped=${thirdSubmit?.deduped}`);
ok('خروجی نشان می‌دهد کاربر برای همان درخواست فقط یک رکورد دارد',
  (pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$rows = $pdo->query("SELECT id FROM reports WHERE client_ref = '${DUP_REF}'")->fetchAll(PDO::FETCH_COLUMN);
echo json_encode(['ids' => array_map('intval', $rows)]);`)))?.ids?.length === 1);

/* ۴) پیوست‌های ارسال تکراری حذف نمی‌شوند و به همان گزارش می‌چسبند */
const mediaCountAfter = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/shared/media.php';
echo json_encode(['media' => count(eplakMediaForReport($pdo, ${firstSubmit?.id || 0}))]);`));
ok('پیوست‌ها روی همان گزارش اول باقی می‌مانند (درخواست دوم بدون پیوست چیزی را خراب نمی‌کند)',
  (mediaCountAfter?.media || 0) >= 1, String(mediaCountAfter?.media));

/* ۵) فایل تکراری (نام+حجم یکسان) روی سرور دو بار ذخیره نمی‌شود */
const dupFile = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/shared/media.php';
$rid = ${firstSubmit?.id || 0};
$before = count(eplakMediaForReport($pdo, $rid));
$bin = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$res = eplakMediaStoreBinary($pdo, $rid, $bin, 'photo.png', 'image/png');
$after = count(eplakMediaForReport($pdo, $rid));
echo json_encode(['ok' => $res['ok'], 'before' => $before, 'after' => $after]);`));
ok('همان فایل (نام و حجم یکسان) بار دوم روی سرور ذخیره نمی‌شود',
  dupFile?.ok === true && dupFile?.after === dupFile?.before,
  JSON.stringify(dupFile));

/* ۶) دو درخواست «واقعاً متفاوت» همچنان دو گزارش جدا می‌سازند */
const otherRef = DUP_REF + '-B';
const other = pickJson(await submitOnce(otherRef, false));
ok('درخواست دیگری با شناسه‌ی متفاوت، گزارش تازه‌ی خودش را می‌سازد (بدون سرکوب اشتباه)',
  !!other?.id && Number(other.id) !== Number(firstSubmit?.id) && other?.deduped !== true);
ok('هر دو درخواست، کد پیگیری جداگانه دارند',
  String(other?.tracking_code) !== String(firstSubmit?.tracking_code));

/* ۷) قید یکتا در سطح دیتابیس (ضامن نهایی ضد تکرار موازی) */
const uniqueCheck = await run(`
require_once '${APP}/admin/includes/db.php';
try {
  $pdo->exec("INSERT INTO reports (user_phone, title, description, category, status, client_ref) VALUES ('09121112233','x','y','سایر','pending','${DUP_REF}')");
  echo json_encode(['blocked' => false]);
} catch (Throwable $e) {
  echo json_encode(['blocked' => true]);
}`);
ok('دیتابیس اجازه‌ی دو گزارش با یک شناسه‌ی یکتا را نمی‌دهد (قید یکتا)',
  /"blocked":true/.test(uniqueCheck), String(uniqueCheck).slice(0, 120));

/* ═══════════════════════════════════════════════════════════════════
   دور ۲۵: «تا بارگیری تمام فیلم و عکس، اپ کد پیگیری نده»
   مسیر تازه: اول عکس/فیلم روی سرور و در انتظار اتصال، بعد ساخت گزارش
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n=== دور ۲۵: اول فایل، بعد گزارش (یک کد پیگیری با پیوست) ===');

const STAGE_REF = 'EPL-STAGE' + Date.now().toString(36).toUpperCase();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ذخیره‌ی یک فایل «در انتظار اتصال» (reportId صفر + شناسه‌ی یکتا) */
const stageUpload = (ref, name, mime, data) => run(`
$_GET = ['action' => 'upload'];
$_POST = [
  'phone' => '09121112233', 'reportId' => 0, 'client_ref' => '${ref}',
  'name' => '${name}', 'mime' => '${mime}', 'data' => '${data}',
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/media.php';`);

const staged1 = pickJson(await stageUpload(STAGE_REF, 'stage-a.png', 'image/png', PNG));
ok('عکس پیش از ساخته شدن گزارش روی سرور ذخیره می‌شود و «در انتظار اتصال» علامت می‌خورد',
  staged1?.success === true && staged1?.staged === true && Number(staged1?.media_count) === 1,
  JSON.stringify(staged1).slice(0, 180));

const staged2 = pickJson(await stageUpload(STAGE_REF, 'stage-b.png', 'image/png', PNG));
ok('فیلم/عکس دوم هم به همان مجموعه‌ی در انتظار اضافه می‌شود',
  staged2?.success === true && Number(staged2?.media_count) === 2, String(staged2?.media_count));

const stagedRows = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$st = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = 0');
$st->execute([':r' => '${STAGE_REF}']);
echo json_encode(['staged' => (int) $st->fetchColumn()]);`));
ok('فایل‌های در انتظار هنوز به هیچ گزارشی وصل نشده‌اند (report_id صفر)',
  Number(stagedRows?.staged) === 2, String(stagedRows?.staged));

/* حالا گزارش با همان شناسه‌ی یکتا ساخته می‌شود — بدون ارسال دوباره‌ی فایل */
const stagedReport = pickJson(await run(`
$_POST = [
  'phone' => '09121112233', 'title' => 'چاله خیابان ۲', 'description' => 'توضیح تکرار',
  'category' => 'سایر', 'client_ref' => '${STAGE_REF}',
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));

ok('گزارش فقط پس از پایان بارگذاری ساخته می‌شود و کد پیگیری می‌گیرد',
  stagedReport?.success === true && !!stagedReport?.tracking_code && Number(stagedReport?.id) > 0,
  JSON.stringify(stagedReport).slice(0, 160));
ok('گزارش ساخته‌شده با فایل‌های در انتظارِ خودش تحویل داده می‌شود (کد با فیلم و عکس)',
  Array.isArray(stagedReport?.media) && stagedReport.media.length === 2, JSON.stringify(stagedReport?.media?.length));

const attachedRows = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$st = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = :id');
$st->execute([':r' => '${STAGE_REF}', ':id' => ${Number(stagedReport?.id) || 0}]);
$left = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = 0');
$left->execute([':r' => '${STAGE_REF}']);
echo json_encode(['attached' => (int) $st->fetchColumn(), 'left' => (int) $left->fetchColumn()]);`));
ok('همه‌ی فایل‌های در انتظار به گزارش وصل شدند و موردی باقی نماند',
  Number(attachedRows?.attached) === 2 && Number(attachedRows?.left) === 0, JSON.stringify(attachedRows));

const stagedList = pickJson(await run(`
$_GET = ['phone' => '09121112233'];
$_SERVER['REQUEST_METHOD'] = 'GET';
require '${APP}/api/reports.php';`));
const stagedListRows = Array.isArray(stagedList?.reports) ? stagedList.reports : [];
const sameRef = stagedListRows.filter(r => String(r.client_ref || '') === STAGE_REF);
ok('فهرست گزارش‌های کاربر برای این درخواست فقط یک ردیف دارد (تکرار در جزئیات گزارش)',
  sameRef.length === 1, `rows=${sameRef.length}`);

/* اپ قدیمی (بدون شناسه‌ی یکتا): ارسال دوباره‌ی سریعِ همان محتوا نباید گزارش دوم بسازد */
const legacyOnce = () => run(`
$_POST = ['phone' => '09121112233', 'title' => 'چراغ سوخته کوچه ۵', 'description' => 'نسخه‌ی قدیمی اپ', 'category' => 'روشنایی'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`);
const legacyFirst  = pickJson(await legacyOnce());
const legacySecond = pickJson(await legacyOnce());
ok('اپ قدیمی (بدون شناسه) هم با ارسال دوباره‌ی سریع، گزارش دوم نمی‌سازد',
  Number(legacyFirst?.id) > 0 && Number(legacySecond?.id) === Number(legacyFirst?.id) && legacySecond?.deduped === true,
  `first=${legacyFirst?.id} second=${legacySecond?.id} deduped=${legacySecond?.deduped}`);
ok('کد پیگیری نسخه‌ی قدیمی هم تکراری ساخته نمی‌شود',
  String(legacySecond?.tracking_code) === String(legacyFirst?.tracking_code));

const legacyCount = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$st = $pdo->prepare("SELECT COUNT(*) FROM reports WHERE user_phone = '09121112233' AND title = 'چراغ سوخته کوچه ۵'");
$st->execute();
echo json_encode(['n' => (int) $st->fetchColumn()]);`));
ok('روی سرور فقط یک ردیف برای آن درخواست قدیمی وجود دارد', Number(legacyCount?.n) === 1, String(legacyCount?.n));

/* ═══════════════════════════════════════════════════════════════════
   دور ۲۶: «عکس و فیلم مجدد بارگذاری نمی‌شود» — ریشه‌ی مشکل
   ۱) مسیر تکه‌تکه باید شناسه‌ی یکتا را بفرستد (وگرنه سرور رد می‌کند)
   ۲) دروازه‌ی پشتیبان add_media هم باید حالت «در انتظار اتصال» را بپذیرد
   ۳) تلاش دوباره، پیوست تکراری نسازد
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n=== دور ۲۶: ارسال مجدد عکس/فیلم (تکه‌تکه + دروازه‌ی پشتیبان) ===');

const R26_REF = 'EPL-CHUNK' + Date.now().toString(36).toUpperCase();
const R26_UPLOAD_ID = (Date.now().toString(16) + 'abcdef1234567890').slice(0, 32);
const R26_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* تکه‌ی کامل (index=0, total=1) — دقیقاً همان چیزی که اپ می‌فرستد */
const r26ChunkUpload = (ref, uploadId, name) => run(`
$_GET = ['action' => 'chunk'];
$_POST = [
  'phone' => '09121112233', 'reportId' => 0, 'client_ref' => '${ref}',
  'uploadId' => '${uploadId}', 'index' => 0, 'total' => 1,
  'name' => '${name}', 'mime' => 'image/png', 'data' => '${R26_PNG}',
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/media.php';`);

const r26Chunked = pickJson(await r26ChunkUpload(R26_REF, R26_UPLOAD_ID, 'chunk-a.png'));
ok('عکس از مسیر تکه‌تکه، پیش از ساخته شدن گزارش روی سرور ذخیره می‌شود (شناسه‌ی یکتا)',
  r26Chunked?.success === true && r26Chunked?.done === true && r26Chunked?.staged === true,
  JSON.stringify(r26Chunked).slice(0, 200));

const r26NoRefChunk = pickJson(await r26ChunkUpload('', R26_UPLOAD_ID + '0f', 'chunk-noref.png'));
ok('بدون شناسه‌ی یکتا، سرور فایلِ reportId=0 را رد می‌کند (ریشه‌ی باگ پیشین)',
  r26NoRefChunk?.success === false, JSON.stringify(r26NoRefChunk).slice(0, 140));

/* دروازه‌ی پشتیبان: api/reports.php?action=add_media در حالت «در انتظار اتصال» */
const r26GatewayUpload = (ref, name) => run(`
$_POST = [
  'action' => 'add_media', 'phone' => '09121112233', 'reportId' => 0,
  'client_ref' => '${ref}', 'name' => '${name}', 'mime' => 'image/png',
  'data' => 'data:image/png;base64,${R26_PNG}',
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`);

const r26Gateway = pickJson(await r26GatewayUpload(R26_REF, 'r26Gateway-b.png'));
ok('اگر مسیر تکه‌تکه بسته باشد، دروازه‌ی پشتیبان گزارش‌ها فایل «در انتظار اتصال» را می‌پذیرد',
  r26Gateway?.success === true && r26Gateway?.staged === true && Number(r26Gateway?.media_count) === 2,
  JSON.stringify(r26Gateway).slice(0, 200));

const r26GatewayNoRef = pickJson(await r26GatewayUpload('', 'r26Gateway-noref.png'));
ok('دروازه‌ی پشتیبان بدون شناسه‌ی یکتا و بدون گزارش، فایل سرگردان نمی‌سازد',
  r26GatewayNoRef?.success !== true, JSON.stringify(r26GatewayNoRef).slice(0, 140));

/* تلاش دوباره: همان فایل با همان شناسه، پیوست دوم نمی‌سازد */
const r26RetrySame = pickJson(await r26GatewayUpload(R26_REF, 'r26Gateway-b.png'));
const r26RetryRows = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$st = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = 0');
$st->execute([':r' => '${R26_REF}']);
echo json_encode(['staged' => (int) $st->fetchColumn()]);`));
ok('تلاش دوباره‌ی همان فایل، پیوست تکراری در حالت «در انتظار اتصال» نمی‌سازد',
  r26RetrySame?.success === true && Number(r26RetryRows?.staged) === 2, JSON.stringify(r26RetryRows));

/* ساخت گزارش: هر دو مسیر (تکه‌تکه و پشتیبان) به «یک» گزارش وصل می‌شوند */
const r26Report = pickJson(await run(`
$_POST = [
  'phone' => '09121112233', 'title' => 'گزارش مسیر تکه‌تکه', 'description' => 'دور ۲۶',
  'category' => 'سایر', 'client_ref' => '${R26_REF}',
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('گزارشِ فایل‌های تکه‌تکه، با هر دو پیوست و یک کد پیگیری ساخته می‌شود',
  r26Report?.success === true && !!r26Report?.tracking_code
  && Array.isArray(r26Report?.media) && r26Report.media.length === 2,
  `media=${r26Report?.media?.length} code=${r26Report?.tracking_code}`);

const r26Attached = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
$st = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = :id');
$st->execute([':r' => '${R26_REF}', ':id' => ${Number(r26Report?.id) || 0}]);
$left = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE client_ref = :r AND report_id = 0');
$left->execute([':r' => '${R26_REF}']);
echo json_encode(['attached' => (int) $st->fetchColumn(), 'left' => (int) $left->fetchColumn()]);`));
ok('فایل‌های هر دو مسیر به همان یک گزارش وصل شدند و چیزی در انتظار نماند',
  Number(r26Attached?.attached) === 2 && Number(r26Attached?.left) === 0, JSON.stringify(r26Attached));

const r26List = pickJson(await run(`
$_GET = ['phone' => '09121112233'];
$_SERVER['REQUEST_METHOD'] = 'GET';
require '${APP}/api/reports.php';`));
const r26Rows = (Array.isArray(r26List?.reports) ? r26List.reports : [])
  .filter(r => String(r.client_ref || '') === R26_REF);
ok('در فهرست/جزئیات گزارش هم فقط یک ردیف با یک کد پیگیری دیده می‌شود',
  r26Rows.length === 1, `rows=${r26Rows.length}`);

/* ═══════════════════════════════════════════════════════════════════
   پاسخ‌دادن به تیکت از پنل ادمین باید برای کاربر اعلان بسازد
   (باگ گزارش‌شده: پاسخ مدیر هیچ اعلانی نمی‌ساخت)
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n=== پاسخ تیکت از پنل ادمین → اعلان کاربر ===');
const ticketSet = pickJson(await run(`
require_once '${APP}/shared/bootstrap.php';
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$cols = array_column($pdo->query('PRAGMA table_info(tickets)')->fetchAll(), 'name');
$pdo->exec("DELETE FROM tickets WHERE title = 'تیکت آزمون اعلان'");
$ins = $pdo->prepare('INSERT INTO tickets (user_phone, title, description, category, department, priority, status, created_at) VALUES (?,?,?,?,?,?,?,?)');
$ins->execute(['09121112233', 'تیکت آزمون اعلان', 'شرح آزمون', 'شکایت', 'خدمات شهری', 'medium', 'pending', date('Y-m-d H:i:s')]);
$tid = (int) $pdo->lastInsertId();
$before = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '09121112233'")->fetchColumn();
saveTicketReply($pdo, $tid, 'پاسخ مدیریت: اکیپ شهرداری تا ۴۸ ساعت آینده مراجعه می‌کند.', 'in_progress');
$after = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '09121112233'")->fetchColumn();
$row = $pdo->query("SELECT title, body FROM notifications WHERE user_phone = '09121112233' ORDER BY id DESC LIMIT 1")->fetch();
echo json_encode([
  'tid' => $tid, 'cols' => $cols,
  'before' => $before, 'after' => $after,
  'title' => $row['title'] ?? '', 'body' => $row['body'] ?? '',
  'status' => (string) $pdo->query("SELECT status FROM tickets WHERE id = $tid")->fetchColumn(),
]);`));
ok('تیکت آزمون ساخته شد و پاسخ مدیر ذخیره شد',
  (ticketSet?.after || 0) === (ticketSet?.before || 0) + 1 && ticketSet?.status === 'in_progress',
  JSON.stringify({ before: ticketSet?.before, after: ticketSet?.after, status: ticketSet?.status }));
ok('پاسخ مدیر روی تیکت، اعلان کاربر را می‌سازد (برگشت‌خوردگی این باگ ممنوع)',
  String(ticketSet?.title || '').includes('تیکت') && String(ticketSet?.title || '').includes('TK-'),
  String(ticketSet?.title));
ok('متن اعلان تیکت: کد پیگیری، وضعیت فارسی، پاسخ مدیر و تاریخ/ساعت',
  String(ticketSet?.body || '').includes('در حال رسیدگی')
  && String(ticketSet?.body || '').includes('پاسخ شهرداری')
  && String(ticketSet?.body || '').includes('زمان:'),
  String(ticketSet?.body).slice(0, 160));
ok('نوع اعلان تیکت از مسیر مشترک notify ساخته می‌شود (هم اعلان درون‌برنامه‌ای، هم فایربیس)',
  /eplakNotifyReply\(\$pdo, \$phone, 'تیکت'/.test(fs.readFileSync(path.join(APP, 'admin/includes/functions.php'), 'utf8'))
  && /eplakPushNotifyPhone/.test(fs.readFileSync(path.join(APP, 'shared/notify_events.php'), 'utf8')));
ok('صفحه‌ی جزئیات تیکت پنل هم اعلان می‌فرستد (نه فقط ذخیره در دیتابیس)',
  /eplakNotifyReply/.test(fs.readFileSync(path.join(APP, 'admin/includes/functions.php'), 'utf8')));

/* ویرایش متن پاسخ هم باید اعلان تازه بسازد */
const ticketEdit = pickJson(await run(`
require_once '${APP}/admin/includes/db.php';
require_once '${APP}/admin/includes/functions.php';
$tid = (int) $pdo->query("SELECT id FROM tickets WHERE title = 'تیکت آزمون اعلان' ORDER BY id DESC LIMIT 1")->fetchColumn();
$before = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '09121112233'")->fetchColumn();
saveTicketDetails($pdo, $tid, 'تیکت آزمون اعلان', 'شرح آزمون', '09121112233', 'پاسخ تکمیلی مدیریت: کار انجام شد.', 'done', 'شکایت', 'خدمات شهری', 'medium');
$after = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE user_phone = '09121112233'")->fetchColumn();
$row = $pdo->query("SELECT body FROM notifications WHERE user_phone = '09121112233' ORDER BY id DESC LIMIT 1")->fetch();
echo json_encode(['tid' => $tid, 'before' => $before, 'after' => $after, 'body' => $row['body'] ?? '',
  'status' => (string) $pdo->query("SELECT status FROM tickets WHERE id = $tid")->fetchColumn()]);`));
ok('ویرایش/تغییر وضعیت تیکت از پنل هم اعلان تازه می‌سازد',
  (ticketEdit?.after || 0) === (ticketEdit?.before || 0) + 1 && ticketEdit?.status === 'done',
  JSON.stringify({ before: ticketEdit?.before, after: ticketEdit?.after, status: ticketEdit?.status }));
ok('اعلان ویرایش هم وضعیت فارسی و پاسخ تازه را دارد',
  String(ticketEdit?.body || '').includes('انجام شد')
  && String(ticketEdit?.body || '').includes('پاسخ تکمیلی مدیریت'),
  String(ticketEdit?.body).slice(0, 140));

console.log('\n' + '='.repeat(52));
console.log(`BACKEND: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

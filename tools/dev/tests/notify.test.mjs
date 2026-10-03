/* notify.test.mjs — «خوانده شدن» اعلان: هر کاربر جدا، پنل درست نشان می‌دهد */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-notify.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path', '/tmp'); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

console.log('\n=== ارسال اعلان گروهی ===');
const sent = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/notification_reads.php';
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09120000001','الف'), ('09120000002','ب'), ('09120000003','ج')");
sendNotification($pdo, 'قطعی آب', 'فردا از ۸ تا ۱۲', 'all', [], 'admin');
echo json_encode(['send_id' => (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn()]);`));
ok('اعلان گروهی ساخته شد', sent?.send_id > 0, JSON.stringify(sent));

const listA = pickJson(await run(`$_GET = ['phone' => '09120000001']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر «الف» اعلان را می‌بیند (نخوانده)', listA?.unread === 1 && listA?.notifications?.[0]?.read_flag === 0, JSON.stringify(listA));
const notifId = listA?.notifications?.[0]?.id;

const readA = pickJson(await run(`$_POST = ['action' => 'read', 'phone' => '09120000001', 'id' => '${notifId}']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`));
ok('خواندن اعلان ثبت شد', readA?.success === true && readA?.marked >= 1, JSON.stringify(readA));

const listA2 = pickJson(await run(`$_GET = ['phone' => '09120000001']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('برای «الف» حالا خوانده‌شده است', listA2?.unread === 0 && listA2?.notifications?.[0]?.read_flag === 1, JSON.stringify(listA2));

const listB = pickJson(await run(`$_GET = ['phone' => '09120000002']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('برای «ب» هنوز خوانده‌نشده است (جدایی وضعیت کاربران)', listB?.unread === 1 && listB?.notifications?.[0]?.read_flag === 0, JSON.stringify(listB));

console.log('\n=== دو کاربر مهمان روی دو گوشی ===');
const g = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('all', 'اطلاعیه عمومی', 'متن')");
echo json_encode(['id' => (int) $pdo->lastInsertId()]);`));
const gid = g?.id;
await run(`$_POST = ['action' => 'read', 'phone' => '', 'device' => 'device-aaa', 'ids' => '${gid}']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`);
const guest1 = pickJson(await run(`$_GET = ['phone' => 'all', 'device' => 'device-aaa']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const guest2 = pickJson(await run(`$_GET = ['phone' => 'all', 'device' => 'device-bbb']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const itemFor = (j, id) => (j?.notifications || []).find((n) => n.id === id);
ok('مهمان اول اعلان عمومی را خوانده‌شده می‌بیند', itemFor(guest1, gid)?.read_flag === 1, JSON.stringify(itemFor(guest1, gid)));
ok('مهمان دوم هم‌چنان خوانده‌نشده می‌بیند (باگ قبلی)', itemFor(guest2, gid)?.read_flag === 0, JSON.stringify(itemFor(guest2, gid)));

console.log('\n=== «همه را خواندم» برای کاربر «ج» ===');
const readAll = pickJson(await run(`$_POST = ['action' => 'read', 'phone' => '09120000003', 'all' => '1']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`));
const listC = pickJson(await run(`$_GET = ['phone' => '09120000003']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('همه‌ی اعلان‌های کاربر خوانده شد', readAll?.marked >= 2 && listC?.unread === 0, JSON.stringify({ marked: readAll?.marked, unread: listC?.unread }));

console.log('\n=== نمایش در پنل ادمین (صفحه‌ی رندر‌شده) ===');
const view = await run(`
$_SESSION = [];
$_GET = ['id' => '${sent.send_id}'];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/notification_view.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
ob_start(); require '${APP}/admin/notification_view.php'; $html = ob_get_clean();
echo json_encode([
  'len' => strlen($html),
  'fatal' => strpos($html, 'Fatal error') !== false,
  'warn' => preg_match('/(Warning|Notice|Deprecated):/', $html) === 1,
  'stats' => (function ($h) {
      /* سه کارت آماری به ترتیب: گیرندگان، خوانده شده، خوانده نشده */
      $grab = function ($h, $p) { $s = strpos($h, '<strong>', $p) + 8; $e = strpos($h, '</strong>', $s); return (int) substr($h, $s, $e - $s); };
      $p1 = strpos($h, 'stat-item');
      $p2 = $p1 === false ? false : strpos($h, 'stat-item', $p1 + 1);
      $p3 = $p2 === false ? false : strpos($h, 'stat-item', $p2 + 1);
      if ($p3 === false) { return [-1, -1, -1]; }
      return [$grab($h, $p1), $grab($h, $p2), $grab($h, $p3)];
  })($html),
]);`);
const v = pickJson(view);
ok('صفحه‌ی گیرندگان رندر می‌شود', (v?.len || 0) > 2000, String(v?.len));
ok('بدون خطا و هشدار PHP', v && !v.fatal && v.warn !== true, JSON.stringify({ fatal: v?.fatal, warn: v?.warn }));
console.log(`   آمار: ${v?.stats?.[0]} گیرنده، ${v?.stats?.[1]} خوانده‌شده، ${v?.stats?.[2]} خوانده‌نشده`);
ok('مجموع خوانده‌شده و خوانده‌نشده برابر شمار گیرندگان است', v?.stats?.[1] + v?.stats?.[2] === v?.stats?.[0], JSON.stringify(v?.stats));
ok('حداقل دو نفر (الف و ج) اعلان را خوانده‌اند', v?.stats?.[1] >= 2, JSON.stringify(v?.stats));
ok('کاربر «ب» هنوز خوانده‌نشده دارد', v?.stats?.[2] >= 1, JSON.stringify(v?.stats));

const sends = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/notifications.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1;
ob_start(); require '${APP}/admin/notifications.php'; $html = ob_get_clean();
echo json_encode(['len' => strlen($html), 'fatal' => strpos($html, 'Fatal error') !== false, 'fcm_col' => strpos($html, 'اعلان اپ (فایربیس)') !== false]);`));
ok('صفحه‌ی ارسال اعلان رندر می‌شود', (sends?.len || 0) > 3000, String(sends?.len));
ok('ستون اعلان فایربیس در جدول هست', sends?.fcm_col === true);

/* ---------- حذف اعلان برای هر کاربر (خواسته‌ی تازه) ---------- */
console.log('\n=== حذف اعلان از فهرست یک کاربر ===');
const delTarget = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('09120000004', 'اعلان حذفی', 'متن حذفی')");
$pdo->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('all', 'اعلان عمومی حذف‌نشدنی', 'متن')");
echo json_encode(['mine' => (int) $pdo->query("SELECT id FROM notifications WHERE title = 'اعلان حذفی'")->fetchColumn(),
                  'shared' => (int) $pdo->query("SELECT id FROM notifications WHERE title = 'اعلان عمومی حذف‌نشدنی'")->fetchColumn()]);`));
ok('اعلان اختصاصی برای آزمون ساخته شد', delTarget?.mine > 0, JSON.stringify(delTarget));

const delRes = pickJson(await run(`$_POST = ['action' => 'delete', 'phone' => '09120000004', 'id' => '${delTarget.mine}']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`));
ok('کنش حذف موفق گزارش می‌شود', delRes?.success === true && delRes?.hidden >= 1, JSON.stringify(delRes));

const afterDel = pickJson(await run(`$_GET = ['phone' => '09120000004']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('اعلان حذف‌شده در فهرست همان کاربر نیست', !(afterDel?.notifications || []).some((n) => n.id === delTarget.mine), JSON.stringify(afterDel?.notifications?.map((n) => n.id)));
ok('اعلان‌های دیگر کاربر دست‌نخورده‌اند', (afterDel?.notifications || []).length >= 1, String((afterDel?.notifications || []).length));

const otherUser = pickJson(await run(`$_GET = ['phone' => '09120000005']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('حذف کاربر، اعلان اختصاصی بقیه را پاک نمی‌کند', !(otherUser?.notifications || []).some((n) => n.id === delTarget.mine));
ok('اعلان مشترک «all» برای همه می‌ماند (حذف واقعی ردیف انجام نشده)', (otherUser?.notifications || []).some((n) => n.id === delTarget.shared), JSON.stringify(otherUser?.notifications?.map((n) => n.id)));

const rowStillThere = pickJson(await run(`require '${APP}/admin/includes/db.php'; echo json_encode(['exists' => (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE id = ${delTarget.mine}")->fetchColumn()]);`));
ok('ردیف اعلان در دیتابیس پاک نشده (فقط برای آن کاربر مخفی شده)', rowStillThere?.exists === 1, JSON.stringify(rowStillThere));

/* ---------- اعلان فوری پس از ثبت درخواست ---------- */
console.log('\n=== اعلان فوری «درخواست ثبت شد» ===');
const created = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require_once '${APP}/shared/notify_events.php';
$out = eplakNotifyRequestCreated($pdo, '09120000009', 'درخواست', 'EP-1403-0042');
$row = $pdo->query("SELECT title, body, user_phone FROM notifications ORDER BY id DESC LIMIT 1")->fetch();
echo json_encode(['ok' => $out['ok'], 'id' => $out['id'], 'title' => $row['title'], 'body' => $row['body'], 'phone' => $row['user_phone'], 'fa_now' => eplakFaDateTime()]);`));
ok('اعلان رویدادی ساخته شد', created?.ok === true && created?.id > 0, JSON.stringify(created));
ok('عنوان «ثبت درخواست» است', String(created?.title || '').includes('ثبت'), String(created?.title));
ok('متن، کد پیگیری را دارد', String(created?.body || '').includes('EP-1403-0042'), String(created?.body));
ok('متن، تاریخ و ساعت دارد (کلمه‌ی «ساعت»)', String(created?.body || '').includes('ساعت'), String(created?.body));
ok('تاریخ شمسی با رقم‌های فارسی نوشته می‌شود', /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(String(created?.body || '')), String(created?.body));
ok('اعلان به شماره‌ی همان کاربر ثبت شده (نه گروهی)', created?.phone === '09120000009', String(created?.phone));

const seenByUser = pickJson(await run(`$_GET = ['phone' => '09120000009']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر اعلان تازه را در فهرست خود می‌بیند', (seenByUser?.notifications || []).some((n) => String(n.body).includes('EP-1403-0042')), JSON.stringify((seenByUser?.notifications || []).map((n) => n.body).slice(0, 3)));
const notSeenByOther = pickJson(await run(`$_GET = ['phone' => '09120000011']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر دیگر این اعلان را نمی‌بیند (حریم خصوصی)', !(notSeenByOther?.notifications || []).some((n) => String(n.body).includes('EP-1403-0042')));

/* ---------- نقطه‌ی بررسی اینترنت ---------- */
console.log('\n=== api/ping.php (پایه‌ی پرده‌ی «بدون اینترنت») ===');
const pong = pickJson(await run(`$_SERVER['REQUEST_METHOD'] = 'GET'; ob_start(); require '${APP}/api/ping.php'; $o = ob_get_clean(); echo $o;`));
ok('پاسخ موفق است', pong?.success === true && pong?.online === true, JSON.stringify(pong));
ok('زمان سرور برگردانده می‌شود', String(pong?.server_time || '').length > 10, String(pong?.server_time));

console.log('\n' + '='.repeat(52));
console.log(`NOTIFY: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

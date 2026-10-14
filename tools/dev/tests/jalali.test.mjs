/* jalali.test.mjs — «تاریخ شمسی» در اپ و پنل ادمین
   ============================================================================
   گزارش کارفرما:
     «موقعی که درخواست ثبت می‌کنی تاریخش به میلادی میاد؛ تاریخ رو به شمسی تغییر
      بده — چه داخل اپ و چه داخل پنل ادمین.»

   ریشه‌ها:
     ۱) پنل ادمین تاریخ‌ها را «خام» از دیتابیس چاپ می‌کرد
        (<?= htmlspecialchars($report['created_at']) ?> ⇒ 2026-10-11 13:24:05)؛
        اسکریپت persian-digits.js فقط رقم‌ها را فارسی می‌کرد و تقویم میلادی
        می‌ماند ⇒ «۲۰۲۶/۱۰/۱۱ ۱۳:۲۴:۰۵».
     ۲) در اپ، `toLocaleDateString('fa-IR')` روی iOS و بعضی WebViewهای اندروید
        تقویم «میلادی» را با رقم فارسی برمی‌گرداند.
     ۳) بدتر از همه: `formatReportDateTime()` هر مقدارِ دارای ساعت را
        «قالب‌گرفته» فرض می‌کرد و همان `2026-10-11 13:24:05` خام را برمی‌گرداند
        ⇒ تاریخِ خودِ «درخواست ثبت‌شده» میلادی دیده می‌شد.

   راه‌حل (یک مبدأ برای هر دو سمت):
     • PHP: `eplakFaDate()` / `eplakFaDateTimeOf()` در shared/fa_datetime.php
       (همان الگوریتم `eplakGregorianToJalali` که آزمون مرجع دارد) و ۴۱ جای
       نمایش تاریخ در پنل با آن‌ها جایگزین شد.
     • JS: همان الگوریتم در core/state.js (`window.eplakFaDate/eplakFaTime/
       eplakFaDateTime`) — بدون وابستگی به Intl مرورگر؛ `formatReportDate()` و
       `formatReportDateTime()` و `faDate()`/`faTime()` از آن استفاده می‌کنند.
     • قرارداد ساعت («یک ساعتِ واحد = تهران»): ستون‌های created_at از نوع
       TIMESTAMP‌اند و MySQL آن‌ها را با time_zoneِ نشست جابه‌جا می‌کند؛ به همین
       دلیل تاریخ‌ها ۳ ساعت جلو دیده می‌شدند. حالا bootstrap ساعتِ PHP و نشستِ
       MySQL را روی تهران پین می‌کند (`SET time_zone = '+03:30'`)، پس مقدارهای
       دیتابیس «دیوارِ تهران»‌اند و بدون جابه‌جایی نمایش داده می‌شوند
       (db_timezone = Asia/Tehran). در اپ هم همه‌ی محاسبه‌ها با getUTC* و
       اختلافِ ثابتِ ‎+03:30 انجام می‌شود تا منطقه‌ی زمانیِ گوشی نتیجه را عوض
       نکند. برای داده‌ی قدیمیِ UTC: `EPLAK_DB_TIMEZONE=UTC`.
   ============================================================================ */
process.env.TZ = 'Asia/Tehran';   /* آزمون در CI هم همان وقت تهران بسنجد */

import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import fs from 'fs';
import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-jalali.sqlite';

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
/* متنِ «دیده‌شده»ی یک صفحه: تگ‌ها و اسکریپت‌ها کنار می‌روند تا فقط آنچه کاربر
   می‌بیند بماند (ویژگی‌هایی مثل data-created عمداً خام می‌مانند). */
const visibleText = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ');

const JALALI = /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/;
/* «۲۰۲۶-۱۰-۰۳.۱» شماره‌ی نسخه‌ی اسکیماست نه تاریخ ⇒ پس از تاریخ، رقم/نقطه/
   خط تیره نباشد تا با کدِ نسخه اشتباه نشود. */
const GREGORIAN = /(?:19|20)\d{2}-\d{2}-\d{2}(?![.\d-])/;
/* نام ماه‌های میلادی هم نشانه‌ی تقویم میلادی است (مثلاً «۱۴ اکتبر ۲۰۲۶» که با
   رقم فارسی نوشته می‌شد و الگوی بالا آن را نمی‌گرفت) */
const GREG_MONTHS = /(ژانویه|فوریه|مارس|آوریل|ژوئن|ژوئیه|اوت|سپتامبر|اکتبر|نوامبر|دسامبر|January|February|March|April|May|June|July|August|September|October|November|December)/;

/* الگوریتم مرجعِ شمسی (همان shared/fa_datetime.php) برای سنجش مقدارهایی که
   نمی‌شود دستی حدس زد (مثل timestamp عددی در منطقه‌ی زمانیِ آزمون). */
function refJalali(gy, gm, gd) {
  const gDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.trunc((gy2 + 3) / 4) - Math.trunc((gy2 + 99) / 100)
    + Math.trunc((gy2 + 399) / 400) + gd + gDays[gm - 1];
  let jy = -1595 + 33 * Math.trunc(days / 12053);
  days %= 12053;
  jy += 4 * Math.trunc(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.trunc((days - 1) / 365); days = (days - 1) % 365; }
  let jm, jd;
  if (days < 186) { jm = 1 + Math.trunc(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.trunc((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const p2 = (n) => String(n).padStart(2, '0');
  return (jy + '/' + p2(jm) + '/' + p2(jd)).replace(/[0-9]/g, (d) => fa[Number(d)]);
}
const refJalaliOf = (d) => refJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
const TS = 1791458645;                        /* timestamp ثابتِ آزمون */
const tsExpected = refJalaliOf(new Date(TS * 1000));

if (fs.existsSync(DB)) fs.unlinkSync(DB);
const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);

const run = async (code, env) => String((await php.run({
  code: "<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=" + DB + "');"
    + " ini_set('session.save_path', '/tmp'); "
    + Object.keys(env || {}).map((k) => "putenv('" + k + '=' + String(env[k]).replace(/'/g, '') + "');").join(' ')
    + ' ' + code,
})).text).trim();
const fn = async (code, env) => pickJson(await run("require '" + APP + "/shared/fa_datetime.php'; echo json_encode(" + code + ');', env));

/* ───────────────── ۱) توابع تاریخِ سمت سرور ───────────────── */
section('۱) توابع شمسیِ سمت سرور (shared/fa_datetime.php)');

const samples = await fn("["
  + "'datetime' => eplakFaDateTimeOf('2026-10-11 13:24:05'),"
  + "'date' => eplakFaDate('2026-10-11 13:24:05'),"
  + "'iso_z' => eplakFaDateTimeOf('2026-10-11T22:00:00Z'),"
  + "'date_only' => eplakFaDate('2026-03-21'),"
  + "'nowruz1403' => eplakFaDate('2024-03-20'),"
  + "'leap' => eplakFaDate('2024-03-19'),"
  + "'null' => eplakFaDateTimeOf(null),"
  + "'empty' => eplakFaDate('', 'خالی'),"
  + "'zero' => eplakFaDate('0000-00-00 00:00:00', 'نامشخص'),"
  + "'garbage' => eplakFaDateTimeOf('not-a-date', '—'),"
  + "'digits' => eplakFaDigits('1405/07/19')"
  + "]");
ok('تاریخ و ساعتِ دیتابیس به شمسیِ وقت تهران تبدیل می‌شود (بدون جابه‌جایی: ۱۳:۲۴)',
  samples && samples.datetime === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴', JSON.stringify(samples && samples.datetime));
ok('فقط تاریخ (بدون ساعت) هم شمسی است',
  samples && samples.date === '۱۴۰۵/۰۷/۱۹', JSON.stringify(samples && samples.date));
ok('مقدارِ ISO با منطقه‌ی زمانی (Z) درست جابه‌جا می‌شود و روز عوض می‌شود',
  samples && samples.iso_z === '۱۴۰۵/۰۷/۲۰ - ساعت ۰۱:۳۰', JSON.stringify(samples && samples.iso_z));
ok('تاریخ‌های مرجعِ الگوریتم درست‌اند (نوروز ۱۴۰۵ و ۱۴۰۳ و سال کبیسه)',
  samples && samples.date_only === '۱۴۰۵/۰۱/۰۱' && samples.nowruz1403 === '۱۴۰۳/۰۱/۰۱' && samples.leap === '۱۴۰۲/۱۲/۲۹',
  JSON.stringify(samples && { a: samples.date_only, b: samples.nowruz1403, c: samples.leap }));
ok('مقدارِ خالی/صفر/خراب ⇒ همان جایگزینِ خوانا (نه خطا، نه تاریخ میلادی)',
  samples && samples.null === '—' && samples.empty === 'خالی' && samples.zero === 'نامشخص' && samples.garbage === '—',
  JSON.stringify(samples && { n: samples.null, e: samples.empty, z: samples.zero, g: samples.garbage }));
ok('رقم‌ها فارسی نوشته می‌شوند', samples && samples.digits === '۱۴۰۵/۰۷/۱۹', JSON.stringify(samples && samples.digits));

/* پیش‌فرضِ تازه: دیتابیس تهران است ⇒ مقدارها جابه‌جا نمی‌شوند و اختلافِ نشستِ
   MySQL که در bootstrap فرستاده می‌شود ‎+03:30 است. */
const tzDefault = await fn("['v' => eplakFaDateTimeOf('2026-10-11 13:24:05'),"
  + " 'off' => eplakTimezoneOffsetString(eplakDbTimezone()),"
  + " 'disp' => eplakTimezoneOffsetString(eplakDisplayTimezone())]");
ok('پیش‌فرض: مقدارِ دیتابیس «وقت تهران» است (۱۳:۲۴) و نشستِ MySQL روی ‎+03:30 پین می‌شود',
  tzDefault && tzDefault.v === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴' && tzDefault.off === '+03:30' && tzDefault.disp === '+03:30',
  JSON.stringify(tzDefault));
const tzLegacy = await fn("['v' => eplakFaDateTimeOf('2026-10-11 13:24:05'),"
  + " 'off' => eplakTimezoneOffsetString(eplakDbTimezone())]", { EPLAK_DB_TIMEZONE: 'UTC' });
ok('سازگاری با داده‌ی قدیمی: EPLAK_DB_TIMEZONE=UTC ⇒ مثل قبل ۳:۳۰ به تهران برده می‌شود (۱۶:۵۴)',
  tzLegacy && tzLegacy.v === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴' && tzLegacy.off === '+00:00', JSON.stringify(tzLegacy));

/* ساعتِ خودِ PHP هم روی تهران است (وگرنه به php.ini هاست بستگی داشت) */
const phpNow = String(await run("require '" + APP + "/shared/bootstrap.php';"
  + " echo date_default_timezone_get() . '|' . eplakDbNow();")).split('|');
const jsTehranNow = new Date(Date.now() + 210 * 60000).toISOString().slice(0, 19).replace('T', ' ');
const skewMs = Math.abs(Date.parse(String(phpNow[1] || '').replace(' ', 'T') + 'Z')
  - Date.parse(jsTehranNow.replace(' ', 'T') + 'Z'));
ok('ساعتِ PHP روی تهران تنظیم شده و eplakDbNow() همان «اکنونِ تهران» است',
  phpNow[0] === 'Asia/Tehran' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(phpNow[1] || '')) && skewMs <= 120000,
  JSON.stringify({ php_tz: phpNow[0], db_now: phpNow[1], js_tehran_now: jsTehranNow, skew_ms: skewMs }));
const tsValue = await fn("['ts' => eplakFaDateTimeOf('" + TS + "'), 'ms' => eplakFaDate(" + TS + "000), 'now' => eplakFaNow()]");
ok('timestamp عددی (ثانیه و میلی‌ثانیه) هم شمسی می‌شود',
  tsValue && String(tsValue.ts).indexOf(tsExpected) === 0 && tsValue.ms === tsExpected,
  JSON.stringify({ got: tsValue, want: tsExpected }));
ok('«همین لحظه» (eplakFaNow) شمسی و هم‌شکلِ بقیه است',
  tsValue && JALALI.test(String(tsValue.now)) && /- ساعت /.test(String(tsValue.now)), JSON.stringify(tsValue && tsValue.now));

/* ───────────────── ۲) داده‌ی آزمون و صفحه‌های پنل ───────────────── */
section('۲) پنل ادمین: همان تاریخ، شمسی نشان داده می‌شود');
const seed = pickJson(await run("require '" + APP + "/admin/includes/db.php';\n"
  + "$at = '2026-10-11 13:24:05';\n"
  + "$pdo->exec(\"INSERT OR REPLACE INTO users (phone, name, address, nid, created_at) VALUES ('09120000001', 'کاربر آزمون تاریخ', 'ورامین', '0012345678', '$at')\");\n"
  + "$pdo->exec(\"INSERT INTO reports (user_phone, title, description, category, department, location, status, client_ref, created_at) VALUES ('09120000001', 'گزارش آزمون تاریخ', 'توضیح آزمون', 'عمران', 'شهرداری', 'میدان شهرداری', 'pending', 'jalali-test-1', '$at')\");\n"
  + "$rid = (int) $pdo->lastInsertId();\n"
  + "$pdo->exec(\"INSERT INTO report_events (report_id, type, title, body, actor, status, created_at) VALUES ($rid, 'note', 'ارجاع به واحد', 'متن رویداد', 'admin', 'in_progress', '$at')\");\n"
  + "$pdo->exec(\"INSERT INTO tickets (user_phone, title, description, status, category, department, priority, created_at) VALUES ('09120000001', 'تیکت آزمون تاریخ', 'متن تیکت', 'pending', 'پشتیبانی', 'پشتیبانی', 'medium', '$at')\");\n"
  + "$tid = (int) $pdo->lastInsertId();\n"
  + "$pdo->exec(\"INSERT INTO notifications (user_phone, title, body, read_flag, created_at) VALUES ('09120000001', 'ثبت درخواست', 'درخواست شما ثبت شد', 0, '$at')\");\n"
  + "$pdo->exec(\"INSERT INTO notification_sends (title, body, target_type, recipients_count, created_by, created_at) VALUES ('اعلان آزمون', 'متن', 'all', 1, 'admin', '$at')\");\n"
  + "$sid = (int) $pdo->lastInsertId();\n"
  + "$pdo->exec(\"INSERT INTO push_log (notification_id, user_phone, kind, code, title, outcome, created_at) VALUES ($sid, '09120000001', 'fcm', 'ok', 'اعلان آزمون', 'sent', '$at')\");\n"
  + "$pdo->exec(\"INSERT INTO news (type, title, summary, body, icon, badge, published, sort_order, created_at, updated_at) VALUES ('news', 'خبر آزمون تاریخ', 'خلاصه', 'متن', '📰', 'شهری', 1, 1, '$at', '$at')\");\n"
  + "echo json_encode(['report_id' => $rid, 'ticket_id' => $tid, 'send_id' => $sid]);"));
ok('داده‌ی آزمون با تاریخِ میلادیِ شناخته‌شده ساخته شد', !!seed && Number(seed.report_id) > 0, JSON.stringify(seed));

const adminPage = async (script, opts) => {
  const raw = await run(
    "$_SESSION = [];\n"
    + "$_SERVER['REQUEST_METHOD'] = '" + ((opts && opts.method) || 'GET') + "';\n"
    + "$_SERVER['SCRIPT_NAME'] = '/" + script + "';\n"
    + "$_SERVER['PHP_SELF'] = '/admin/login.php';   /* تا requireAdmin() وسط آزمون اجرا نشود */\n"
    + "$_SERVER['HTTP_HOST'] = 'eplak.test'; $_SERVER['HTTPS'] = 'on';\n"
    + "require '" + APP + "/admin/auth.php';\n"
    + "$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';\n"
    + "$_GET = " + phpVal((opts && opts.get) || {}) + ";\n"
    + "$_POST = " + phpVal((opts && opts.post) || {}) + ";\n"
    + "register_shutdown_function(function () {\n"
    + "    $html = (string) ob_get_clean(); $loc = '';\n"
    + "    foreach (headers_list() as $h) { if (stripos($h, 'Location:') === 0) { $loc = trim(substr($h, 9)); } }\n"
    + "    echo \"\\n@@META@@\\n\" . json_encode([\n"
    + "        'location' => $loc,\n"
    + "        'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Deprecated:|Uncaught)/', $html) === 1,\n"
    + "        'len' => strlen($html),\n"
    + "    ]) . \"\\n@@HTML@@\\n\" . $html;\n"
    + "});\n"
    + "ob_start();\n"
    + "require '" + APP + "/" + script + "';\n");
  const m = String(raw).match(/@@META@@\n([\s\S]*?)\n@@HTML@@\n([\s\S]*)$/);
  const meta = m ? pickJson(m[1]) : pickJson(raw);
  if (!meta) { console.log('   [خروجی خام ' + script + '] ' + String(raw).slice(0, 200).replace(/\n/g, ' ')); return null; }
  meta.html = m ? m[2] : '';
  return meta;
};

const pages = [
  ['داشبورد', 'admin/index.php', {}],
  ['فهرست گزارش‌ها', 'admin/reports.php', {}],
  ['جزئیات گزارش', 'admin/report_detail.php', { get: { id: String(seed.report_id) } }],
  ['ویرایش گزارش', 'admin/report_edit.php', { get: { id: String(seed.report_id) } }],
  ['فهرست تیکت‌ها', 'admin/tickets.php', {}],
  ['جزئیات تیکت', 'admin/ticket_detail.php', { get: { id: String(seed.ticket_id) } }],
  ['ویرایش تیکت', 'admin/ticket_edit.php', { get: { id: String(seed.ticket_id) } }],
  ['فهرست کاربران', 'admin/users.php', {}],
  ['پروفایل کاربر', 'admin/user_view.php', { get: { phone: '09120000001' } }],
  ['گزارش‌های کاربر', 'admin/user_reports.php', { get: { phone: '09120000001' } }],
  ['ویرایش کاربر', 'admin/user_edit.php', { get: { phone: '09120000001' } }],
  ['اخبار و دانستنی‌ها', 'admin/news.php', {}],
  ['اعلان‌ها', 'admin/notifications.php', {}],
  ['جزئیات ارسال اعلان', 'admin/notification_view.php', { get: { id: String(seed.send_id) } }],
  ['تنظیمات', 'admin/settings.php', {}],
  ['نسخه‌ی اپ', 'admin/version.php', {}],
];

const rendered = {};
for (const [label, script, opts] of pages) {
  rendered[label] = await adminPage(script, opts);
}

let shownJalali = 0; let shownGregorian = 0; let fatalPages = 0;
for (const [label, script] of pages) {
  const p = rendered[label];
  if (!p) { fatalPages++; continue; }
  if (p.fatal) fatalPages++;
  const text = visibleText(p.html);
  if (JALALI.test(text)) shownJalali++;
  if (GREGORIAN.test(text)) { shownGregorian++; console.log('   [میلادی در ' + label + '] ' + (text.match(/.{0,40}\d{4}-\d{2}-\d{2}.{0,30}/) || [''])[0]); }
}
ok('هیچ صفحه‌ی پنل خطای PHP ندارد', fatalPages === 0, 'صفحه‌های دارای خطا: ' + fatalPages);
ok('تاریخِ درخواست/تیکت/کاربر/خبر/اعلان در پنل «شمسی» نشان داده می‌شود', shownJalali >= 10,
  'صفحه‌هایی با تاریخ شمسی: ' + shownJalali + ' از ' + pages.length);
ok('هیچ تاریخ میلادیِ خامی (2026-10-11) در متنِ دیده‌شده‌ی پنل نمانده', shownGregorian === 0,
  'صفحه‌ها: ' + shownGregorian);

const rp = rendered['فهرست گزارش‌ها'];
ok('دقیقاً همان تاریخِ گزارش به شمسی و وقت تهران است (۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴)',
  rp && /۱۴۰۵\/۰۷\/۱۹ - ساعت ۱۳:۲۴/.test(visibleText(rp.html)), '');
const rd = rendered['جزئیات گزارش'];
ok('روند رسیدگی و رویدادهای گزارش هم شمسی‌اند', rd && (visibleText(rd.html).match(/۱۴۰۵\/۰۷\/۱۹/g) || []).length >= 2,
  String(rd && (visibleText(rd.html).match(/۱۴۰۵\/۰۷\/۱۹/g) || []).length));
const us = rendered['فهرست کاربران'];
ok('فیلتر «کاربران تازه» سالم ماند: data-created خام است ولی سلول تاریخ شمسی',
  us && /data-created="2026-10-11 13:24:05"/.test(us.html) && /۱۴۰۵\/۰۷\/۱۹/.test(visibleText(us.html)), '');

/* ───────────────── ۳) اپ (jsdom) ───────────────── */
section('۳) اپ: تاریخ درخواست، خبر و اعلان شمسی است');

class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    const u = String(url);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)\//i.test(u)) {
      let p = u.replace(/^https?:\/\/[^/]+\//, '').split('?')[0].split('#')[0];
      p = p.replace(/^(eplak-fixed-new|eplak-fixed)\//, '');
      const abs = path.join(APP, decodeURIComponent(p));
      return Promise.resolve(fs.existsSync(abs) ? Buffer.from(fs.readFileSync(abs)) : Buffer.from(''));
    }
    if (/^file:\/\/\/android_asset\//i.test(u)) {
      const abs = path.join(APP, decodeURIComponent(u.replace(/^file:\/\/\/android_asset\//i, '').split('?')[0]));
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
      showNotification() {}, ensureNotificationChannel() {}, notificationsEnabled() { return true; },
      requestNotificationPermission() {}, getFcmToken() { return ''; }, isFcmReady() { return false; },
      refreshFcmToken() {}, getPushDiagnostics() { return '{"enabled":true,"token":false}'; },
      openNotificationSettings() {}, shouldRequireLogin() { return false; }, markLoginDone() {}, prepareExit() {},
    };
    window.fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const m = url.match(/(?:^|\/)(api\/[a-z0-9_\-]+\.php)(?:\?([^#]*))?/i);
      if (!m) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      const get = {};
      if (m[2]) new URLSearchParams(m[2]).forEach((v, k) => { get[k] = v; });
      const text = await run("$_SERVER = ['REQUEST_METHOD' => 'GET', 'SCRIPT_NAME' => '/" + m[1]
        + "', 'PHP_SELF' => '/" + m[1] + "', 'HTTP_HOST' => 'eplak.test', 'HTTPS' => 'on']; $_GET = "
        + phpVal(get) + "; $_POST = []; $_SESSION = []; require '" + APP + '/' + m[1] + "';");
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      return {
        ok: parsed !== null, status: parsed === null ? 500 : 200,
        json: async () => { if (parsed === null) throw new Error('bad json: ' + text.slice(0, 160)); return parsed; },
        text: async () => text,
      };
    };
  },
});
await new Promise((r) => setTimeout(r, 2200));
const w = dom.window;

ok('ماژول تاریخ شمسی در اپ بارگذاری شد',
  typeof w.eplakFaDate === 'function' && typeof w.eplakFaDateTime === 'function' && typeof w.eplakGregorianToJalali === 'function',
  appLogs.slice(0, 2).join(' | '));
ok('تاریخِ «درخواست ثبت‌شده» در اپ شمسی است (نه 2026-10-11)',
  w.formatReportDate('2026-10-11 13:24:05') === '۱۴۰۵/۰۷/۱۹', String(w.formatReportDate('2026-10-11 13:24:05')));
ok('تاریخ و ساعتِ درخواست در اپ شمسی و به وقت تهران است (۱۳:۲۴ — بدون ۳ ساعت جابه‌جایی)',
  w.formatReportDateTime('2026-10-11 13:24:05') === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴', String(w.formatReportDateTime('2026-10-11 13:24:05')));
ok('مقداری که منطقه‌ی زمانیِ صریح دارد (Z) به وقت تهران برده می‌شود (۱۳:۲۴Z ⇒ ۱۶:۵۴)',
  w.formatReportDateTime('2026-10-11T13:24:05Z') === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴',
  String(w.formatReportDateTime('2026-10-11T13:24:05Z')));
ok('اپ هم «اکنونِ تهران» را دارد (window.eplakNow) و با ساعتِ گوشیِ ایران یکی است',
  typeof w.eplakNow === 'function' && Math.abs(w.eplakNow().getTime() - Date.now()) < 5000,
  typeof w.eplakNow);
ok('مقدارِ خامِ دارای ساعت دیگر «قالب‌گرفته» فرض نمی‌شود (ریشه‌ی باگ)',
  !/2026-10-11/.test(String(w.formatReportDateTime('2026-10-11 13:24:05')))
    && !/2026/.test(String(w.formatReportDate('2026-10-11T13:24:05'))), String(w.formatReportDate('2026-10-11T13:24:05')));
ok('تاریخ ISO با Z و timestamp هم شمسی می‌شوند',
  w.formatReportDate('2026-10-11T22:00:00Z') === '۱۴۰۵/۰۷/۲۰' && w.formatReportDate(TS) === tsExpected,
  JSON.stringify([w.formatReportDate('2026-10-11T22:00:00Z'), w.formatReportDate(TS), tsExpected]));
ok('متنِ ازقبل‌فارسیِ سرور دست‌نخورده می‌ماند',
  w.formatReportDateTime('۱۴۰۵/۰۷/۱۹ ساعت ۱۶:۵۴') === '۱۴۰۵/۰۷/۱۹ ساعت ۱۶:۵۴', '');
ok('مقدارِ خالی/خراب ⇒ خطا نمی‌دهد و خالی/خط تیره برمی‌گردد',
  w.formatReportDate(null) === '—' && w.formatReportDate('') === '—' && w.formatReportDateTime('not-a-date') === 'not-a-date',
  JSON.stringify([w.formatReportDate(null), w.formatReportDate(''), w.formatReportDateTime('not-a-date')]));
ok('خروجی با پنل ادمین یکی است (یک مبدأ برای هر دو سمت)',
  samples.datetime === w.formatReportDateTime('2026-10-11 13:24:05'),
  JSON.stringify({ php: samples.datetime, js: w.formatReportDateTime('2026-10-11 13:24:05') }));

const notifHtml = (w.document.getElementById('notificationsList') || { innerHTML: '' }).innerHTML;
const newsHtml = (w.document.getElementById('newsListWrap') || { innerHTML: '' }).innerHTML;
ok('تاریخ اعلان‌های داخل اپ شمسی است',
  !notifHtml || (JALALI.test(notifHtml) && !GREGORIAN.test(visibleText(notifHtml))), notifHtml.slice(0, 120));
ok('تاریخ خبرها/دانستنی‌های داخل اپ شمسی است',
  !newsHtml || (JALALI.test(newsHtml) && !GREGORIAN.test(visibleText(newsHtml))), newsHtml.slice(0, 120));

/* ── صفحه‌ی «جزئیات گزارش»: دقیقاً همان چیزی که کاربر در اپ می‌بیند ──
   گزارش کارفرما: «داخل اپ قسمت جزییات گزارش تماما به میلادیه». این‌جا اپ با
   داده‌ی واقعی از api/reports.php بالا می‌آید، صفحه‌ی جزئیات باز می‌شود و متنِ
   دیده‌شده سنجیده می‌شود. */
section('۳-۲) اپ: صفحه‌ی «جزئیات گزارش» و بقیه‌ی صفحه‌ها');
w.localStorage.setItem('eplak_current_phone', '09120000001');
const loaded = await w.loadReportsFromBackend('09120000001');
ok('گزارشِ آزمون از API واقعی به اپ رسید', Array.isArray(loaded) && loaded.length >= 1,
  String(loaded && loaded.length));
const firstReport = (Array.isArray(loaded) && loaded[0]) ? loaded[0] : null;
ok('تاریخِ گزارش در حافظه‌ی اپ شمسی است',
  !!firstReport && JALALI.test(String(firstReport.dateTime)) && !GREGORIAN.test(String(firstReport.dateTime)),
  JSON.stringify(firstReport && firstReport.dateTime));
if (firstReport) {
  w.openReportDetail(firstReport.id);
  await new Promise((r) => setTimeout(r, 350));
  const detailEl = w.document.getElementById('screen-report-detail');
  const detailText = visibleText(detailEl ? detailEl.innerHTML : '');
  const detailDate = (w.document.getElementById('detailDate') || {}).textContent || '';
  ok('«جزئیات گزارش»: تاریخِ زیرِ عنوان شمسی و ساعتِ درستِ تهران است (۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴)',
    detailDate === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴', JSON.stringify(detailDate));
  ok('«جزئیات گزارش»: تاریخِ گام‌های «روند رسیدگی» هم شمسی است',
    (detailText.match(/۱۴۰۵\/۰۷\/۱۹/g) || []).length >= 2,
    String((detailText.match(/۱۴۰۵\/۰۷\/۱۹/g) || []).length));
  ok('«جزئیات گزارش»: هیچ تاریخ میلادی در متنِ دیده‌شده نیست',
    !GREGORIAN.test(detailText) && !GREG_MONTHS.test(detailText),
    (detailText.match(/.{0,40}(?:\d{4}-\d{2}-\d{2}|اکتبر|ژانویه).{0,25}/) || [''])[0]);
  ok('«جزئیات گزارش»: رقم‌ها فارسی‌اند (۲۰۲۶ یا 2026 دیده نمی‌شود)',
    !/(?:۲۰۲۶|2026)/.test(detailText), (detailText.match(/.{0,25}(?:۲۰۲۶|2026).{0,15}/) || [''])[0]);
}

const loadedTickets = typeof w.loadTicketsFromBackend === 'function'
  ? await w.loadTicketsFromBackend('09120000001') : null;
if (Array.isArray(loadedTickets) && loadedTickets[0] && typeof w.openTicketDetail === 'function') {
  w.openTicketDetail(loadedTickets[0].id);
  await new Promise((r) => setTimeout(r, 300));
  const ticketDate = (w.document.getElementById('ticketDetailDate') || {}).textContent || '';
  ok('«جزئیات تیکت»: تاریخ و ساعتِ ثبت شمسی است',
    ticketDate === '۱۴۰۵/۰۷/۱۹ - ساعت ۱۳:۲۴', JSON.stringify(ticketDate));
}

/* پیشخوان: کارت «تاریخ امروز» و ساعت لوکس — خطِ میلادی برداشته شده است */
const heroEl = w.document.querySelector('.dash-hero-datetime-row');
const heroText = visibleText(heroEl ? heroEl.innerHTML : '');
ok('کارت «تاریخ امروز» خطِ میلادی ندارد (فقط شمسی و قمری)',
  !GREG_MONTHS.test(heroText) && !/luxGregDate[^>]*>\s*[^<]/.test(heroEl ? heroEl.innerHTML : ''),
  heroText.slice(0, 140));
ok('عنصرِ luxGregDate از index.html حذف شده', !/id="luxGregDate"/.test(fs.readFileSync(path.join(APP, 'index.html'), 'utf8')));

/* جاروی کلِ صفحه: هرچه کاربر در اپ می‌بیند */
const bodyText = visibleText(w.document.body.innerHTML);
ok('در «کلِ» صفحه‌ی اپ هیچ تاریخ میلادیِ دیده‌شدنی نمانده',
  !GREGORIAN.test(bodyText) && !GREG_MONTHS.test(bodyText),
  (bodyText.match(/.{0,40}(?:\d{4}-\d{2}-\d{2}|اکتبر|ژانویه|November).{0,30}/) || [''])[0]);

/* حالت انگلیسی: تقویم همان شمسی می‌ماند، فقط رقم‌ها لاتین می‌شوند */
w.eval("window.i18n = { currentLang: 'en', getLanguage: function () { return 'en'; } };");
ok('در رابط انگلیسی هم تقویم شمسی است (فقط رقم لاتین: 1405/07/19 13:24)',
  w.formatReportDate('2026-10-11 13:24:05') === '1405/07/19'
    && w.formatReportDateTime('2026-10-11 13:24:05') === '1405/07/19 13:24',
  JSON.stringify([w.formatReportDate('2026-10-11 13:24:05'), w.formatReportDateTime('2026-10-11 13:24:05')]));
ok('در رابط انگلیسی هم تاریخ میلادی چاپ نمی‌شود',
  !/2026-10-11/.test(String(w.formatReportDateTime('2026-10-11 13:24:05'))), '');
w.eval("window.i18n = { currentLang: 'fa', getLanguage: function () { return 'fa'; } };");
try { w.close(); } catch (e) { /* مهم نیست */ }

/* ───────────────── ۴) قراردادها ───────────────── */
section('۴) قراردادها: هیچ‌کس دوباره تاریخ میلادی چاپ نمی‌کند');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const stateJs = read('core/state.js');
const reportsJs = read('modules/reports.js');
const liveJs = read('modules/live.js');
const bootPhp = read('shared/bootstrap.php');
const faPhp = read('shared/fa_datetime.php');
const indexHtml = read('index.html');

ok('الگوریتم شمسی در JS همان PHP است (۳۵۵۶۶۶ · ۱۲۰۵۳ · ۱۴۶۱ · ۱۸۶)',
  ['355666', '12053', '1461', '186'].every((n) => stateJs.includes(n) && faPhp.includes(n)));
ok('formatReportDate/formatReportDateTime از ماژول شمسی استفاده می‌کنند',
  /window\.eplakFaDate/.test(reportsJs) && /window\.eplakFaDateTime/.test(reportsJs));
ok('میان‌بُرِ «مقدارِ دارای ساعت = قالب‌گرفته» برداشته شد (ریشه‌ی باگ)',
  reportsJs.indexOf("dateValue.includes('ساعت') ||") === -1);
ok('faDate/faTime در live.js هم شمسی شدند',
  /window\.eplakFaDate/.test(liveJs) && /window\.eplakFaTime/.test(liveJs));
const clockJs = read('modules/clock-lux.js');
const dashJs = read('modules/dashboard.js');
const cityLiveJs = read('modules/city-live.js');
ok('ساعتِ پیشخوان دیگر تاریخ میلادی نمی‌سازد (نام ماه‌های میلادی حذف شد)',
  !/G_MONTHS/.test(clockJs) && !/اکتبر|ژانویه|October|January/.test(clockJs));
ok('کارت «تاریخ امروز» در حالت انگلیسی هم شمسی است (JALALI_MONTHS_EN، نه EN_MONTHS)',
  /JALALI_MONTHS_EN/.test(dashJs) && !/EN_MONTHS\s*=/.test(dashJs));
ok('مسیرِ جایگزینِ reports.js هم شمسی است (نه Intl)',
  /eplakFaDateLocal/.test(reportsJs) && reportsJs.includes('355666') && /window\.eplakFaNowLocal/.test(reportsJs));
ok('ساعتِ «به‌روزرسانی» در شهر زنده از ماژول شمسی می‌آید',
  /window\.eplakFaTime/.test(cityLiveJs));
ok('«مهلت پرداخت» قبض‌ها شمسی نشان داده می‌شود', /faDueDate\(p\.due\)/.test(dashJs));

/* هیچ ماژولی تاریخ را با Intl نسازد (روی iOS/بعضی WebViewها میلادی می‌دهد) */
function codeLines(src) {
  let inBlock = false;
  const out = [];
  src.split('\n').forEach((line, i) => {
    let l = line;
    if (inBlock) {
      const end = l.indexOf('*/');
      if (end === -1) return;
      l = l.slice(end + 2);
      inBlock = false;
    }
    l = l.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const open = l.indexOf('/*');
    if (open !== -1) { inBlock = true; l = l.slice(0, open); }
    if (l.trim() !== '') out.push({ n: i + 1, t: l });
  });
  return out;
}
const intlSites = [];
for (const f of ['core/state.js', 'modules/reports.js', 'modules/live.js', 'modules/dashboard.js',
                 'modules/clock-lux.js', 'modules/city-live.js', 'modules/services.js', 'app.js']) {
  for (const line of codeLines(read(f))) {
    if (/toLocaleDateString\(|toLocaleTimeString\('fa-IR'|toLocaleString\('fa-IR'\)/.test(line.t)) {
      intlSites.push(f + ':' + line.n);
    }
  }
}
ok('هیچ ماژولِ اپ تاریخ را با Intlِ مرورگر نمی‌سازد (ریشه‌ی میلادی شدن روی دستگاه)',
  intlSites.length === 0, intlSites.join(', '));
ok('bootstrap توابع تاریخ را برای همه‌ی صفحه‌ها بار می‌کند',
  /require_once __DIR__ \. '\/fa_datetime\.php';/.test(bootPhp));

const adminFiles = fs.readdirSync(path.join(APP, 'admin')).filter((f) => f.endsWith('.php'));
const rawSites = [];
for (const f of adminFiles) {
  const lines = read('admin/' + f).split('\n');
  lines.forEach((line, i) => {
    if (/<?=/.test(line) && /htmlspecialchars\(/.test(line) && /\$[a-zA-Z_]+\['(created_at|updated_at|last_seen_at|last_send_at|date)'\]/.test(line)
      && !/eplakFaDate|eplakFaDateTimeOf|eplakFaDateTime\(/.test(line) && !/data-created/.test(line)) {
      rawSites.push('admin/' + f + ':' + (i + 1));
    }
  });
}
ok('در پنل ادمین هیچ تاریخِ خامی چاپ نمی‌شود (همه با eplakFaDate…)', rawSites.length === 0, rawSites.join(', '));
ok('کش‌باسترها بالا رفتند تا گوشی‌ها کد تازه را بگیرند',
  /core\/state\.js\?v=15/.test(indexHtml) && /modules\/reports\.js\?v=30/.test(indexHtml)
  && /modules\/live\.js\?v=21/.test(indexHtml) && /modules\/dashboard\.js\?v=18/.test(indexHtml)
  && /modules\/city-live\.js\?v=15/.test(indexHtml) && /modules\/clock-lux\.js\?v=7/.test(indexHtml));
ok('تنظیم منطقه‌ی زمانیِ دیتابیس مستند و قابل تغییر است',
  /EPLAK_DB_TIMEZONE/.test(faPhp) && /EPLAK_DISPLAY_TIMEZONE/.test(faPhp));

const bootPhpSrc = read('shared/bootstrap.php');
const cfgExample = read('shared/config.example.php');
ok('پیش‌فرضِ db_timezone «تهران» است (نه UTC) — ریشه‌ی ۳ ساعت جابه‌جایی',
  /eplakTimezoneSetting\('EPLAK_DB_TIMEZONE', 'db_timezone', 'Asia\/Tehran'\)/.test(faPhp)
    && /'db_timezone'\s+=> 'Asia\/Tehran'/.test(cfgExample));
ok('نشستِ MySQL روی ساعتِ تهران پین می‌شود (SET time_zone) و ساعتِ PHP هم تهران است',
  /SET time_zone = '\" \. eplakTimezoneOffsetString\(eplakDbTimezone\(\)\)/.test(bootPhpSrc)
    && /date_default_timezone_set\(eplakDisplayTimezone\(\)->getName\(\)\);/.test(bootPhpSrc));
ok('ابزارهای ساعتِ تهران در سرور هست (eplakTimezoneOffsetString/eplakDbNow)',
  /function eplakTimezoneOffsetString/.test(faPhp) && /function eplakDbNow/.test(faPhp));
ok('پاسخِ «ثبت گزارش» ساعتِ دیتابیس را برمی‌گرداند (نه gmdate/UTC)',
  read('api/reports.php').indexOf("eplakReportEvents($pdo, $insertId), eplakDbNowString($pdo))") !== -1
    && read('api/reports.php').indexOf("gmdate('Y-m-d H:i:s')") === -1);
ok('مقایسه‌ی زمان با «ساعتِ خودِ دیتابیس» است (پنجره‌ی تکراری‌یابی و سقفِ اعلان آزمایشی)',
  /function eplakDbNowString/.test(faPhp) && /function eplakDbAgoString/.test(faPhp)
    && /function eplakDbAgeSeconds/.test(faPhp)
    && read('api/reports.php').indexOf("eplakDbAgoString($windowSeconds, $pdo)") !== -1
    && read('api/push.php').indexOf("eplakDbAgeSeconds($recent[0]['created_at'] ?? null, $pdo)") !== -1
    && read('admin/users.php').indexOf('eplakDbAgeSeconds') !== -1);
ok('اپ ساعتِ تهران را مستقل از منطقه‌ی زمانیِ گوشی حساب می‌کند (اختلافِ ثابتِ ۲۱۰ دقیقه و getUTC*)',
  /EPLAK_TEHRAN_OFFSET_MIN = 210/.test(stateJs) && /function eplakTehranParts/.test(stateJs)
    && /shifted\.getUTCFullYear\(\)/.test(stateJs) && /shifted\.getUTCHours\(\)/.test(stateJs));
ok('مسیرِ جایگزینِ reports.js هم همان قراردادِ تهران را دارد',
  /REPORT_TEHRAN_OFFSET_MIN = 210/.test(reportsJs) && /reportTehranWallToDate/.test(reportsJs));
ok('ساعت و تقویمِ پیشخوان از «اکنونِ تهران» می‌آیند (نه ساعتِ گوشی)',
  /window\.eplakNow/.test(read('modules/clock-lux.js')) && /window\.eplakNow/.test(dashJs));

console.log('\n' + '='.repeat(52));
console.log(`JALALI: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail > 0 ? 1 : 0);

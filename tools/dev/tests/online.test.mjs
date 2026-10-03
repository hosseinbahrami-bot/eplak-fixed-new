/* online.test.mjs — چهار خواسته‌ی تازه‌ی کارفرما:
   (۱) اپ فقط آنلاین کار کند و پیام «بدون اینترنت اتصال ممکن نیست» نشان داده شود
   (۲) حذف اعلان‌ها از فهرست کاربر
   (۳) اعلان فوری پس از ثبت هر درخواست (کد پیگیری + تاریخ و ساعت)
   (۴) پس از خروج از اپ، ورود دوباره با کد تایید (حساب ذخیره نشود)
*/
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const read = (p) => fs.readFileSync(`${ROOT}/${p}`, 'utf8');
const exists = (p) => fs.existsSync(`${ROOT}/${p}`);

/* ---------- ۱) سپر آفلاین ---------- */
console.log('\n=== سپر آفلاین (بدون اینترنت اتصال ممکن نیست) ===');
const idx = read('index.html');
const guard = read('modules/online-guard.js');

ok('فایل modules/online-guard.js ساخته شده', exists('modules/online-guard.js'));
ok('در index.html بارگذاری می‌شود', /modules\/online-guard\.js\?v=/.test(idx));
ok('پیام دقیق «بدون اینترنت اتصال ممکن نیست» در صفحه هست',
  idx.includes('بدون اینترنت اتصال ممکن نیست'));
ok('پرده‌ی آفلاین یک عنصر واقعی در صفحه است', idx.includes('id="eplakOfflineGate"'));
ok('شناسه‌ها همان‌هایی هستند که اسکریپت انتظار دارد',
  ['eplakOfflineTitle', 'eplakOfflineDesc', 'eplakOfflineState', 'eplakOfflineRetry']
    .every((id) => idx.includes(`id="${id}"`) && guard.includes(`'${id}'`)));
ok('در حالت آفلاین، پرده کل صفحه را می‌پوشاند و دکمه‌ی تلاش مجدد دارد',
  /html\.eplak-offline\s+#eplakOfflineGate\s*\{[^}]*position:\s*fixed/.test(idx) && guard.includes('eplakRetryOnline'));
ok('اگر همان لحظه‌ی باز شدن، اینترنت نباشد، پرده زودتر از رندر کشیده می‌شود',
  /navigator\.onLine === false[^}]*eplak-offline/.test(idx));
ok('بررسی واقعی با درخواست به api/ping.php انجام می‌شود', /ping\.php/.test(guard));
ok('در حالت آفلاین، محتوای اپ هم پنهان می‌شود (چیزی لود نمی‌شود)',
  /html\.eplak-offline\s+\.phone-frame\s*\{[^}]*visibility:\s*hidden/.test(idx));
ok('آفلاین بودن، جلوی کلیک/لمس/کلید کاربر را می‌گیرد',
  guard.includes('blockEvent') && guard.includes("addEventListener('click', blockEvent, true)"));
ok('با برگشتن اینترنت، پرده خودکار کنار می‌رود',
  guard.includes("window.addEventListener('online'") && guard.includes('scheduleRetry'));
ok('نقطه‌ی اتصال سرور وجود دارد', exists('api/ping.php'));
const ping = read('api/ping.php');
ok('api/ping.php به دیتابیس وابسته نیست (حتی با دیتابیس خراب جواب می‌دهد)',
  !ping.includes('db.php') && !ping.includes('$pdo'));
ok('api/ping.php پاسخ JSON با success/online می‌دهد',
  ping.includes("'success'") && ping.includes("'online'"));

/* ---------- ۱-۲) اجرای واقعی سپر آفلاین در محیط شبیه‌سازی‌شده ---------- */
console.log('\n=== اجرای واقعی سپر آفلاین ===');
function buildGuardSandbox(opts = {}) {
  const classes = new Set();
  const events = { window: {}, document: {} };
  const nodes = new Map();
  const makeEl = (id) => ({ id, textContent: '', style: {}, addEventListener(t, fn) { nodes.get(id)._click = fn; }, contains: () => false });
  ['eplakOfflineGate', 'eplakOfflineTitle', 'eplakOfflineDesc', 'eplakOfflineState', 'eplakOfflineRetry']
    .forEach((id) => nodes.set(id, makeEl(id)));
  nodes.get('eplakOfflineGate').contains = () => false;

  const sandbox = {
    console,
    setTimeout: (fn) => { sandbox._timers.push(fn); return 0; },
    clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    Promise, Date, Math, JSON, String, Object, Array, CustomEvent: function () {},
    AbortController: undefined,
    navigator: { onLine: opts.onLine !== false },
    eplakApiBase: () => 'https://eplak.eplak-fixed/api',
    syncLiveContent: () => { sandbox._synced = true; },
    syncNotifications: () => { sandbox._notifSynced = true; },
    dispatchEvent: () => {},
    addEventListener: (t, fn) => { events.window[t] = fn; },
    removeEventListener: () => {},
    _timers: [], _pings: 0,
    fetch: async (url) => {
      sandbox._pings++;
      sandbox._lastUrl = url;
      if (opts.fail) throw new Error('offline');
      return { ok: true, json: async () => ({ success: true, online: true }) };
    },
    document: {
      readyState: 'complete',
      documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
      body: { style: {} },
      getElementById: (id) => nodes.get(id) || null,
      addEventListener: (t, fn) => { events.document[t] = fn; },
      removeEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(guard, sandbox, { filename: 'online-guard.js' });
  return { sandbox, classes };
}

const gOnline = buildGuardSandbox({});
await new Promise((r) => setTimeout(r, 10));
ok('در حالت آنلاین، پرده کشیده نمی‌شود', !gOnline.classes.has('eplak-offline'));
ok('بررسی اتصال با api/ping.php انجام می‌شود', String(gOnline.sandbox._lastUrl).includes('/ping.php'), String(gOnline.sandbox._lastUrl));

const gOffline = buildGuardSandbox({ fail: true });
await new Promise((r) => setTimeout(r, 10));
ok('وقتی سرور پاسخ نمی‌دهد، پرده‌ی «بدون اینترنت» کشیده می‌شود', gOffline.classes.has('eplak-offline'));
ok('متن‌های پرده از داخل خود اسکریپت پر می‌شوند',
  gOffline.sandbox.document.getElementById('eplakOfflineTitle').textContent.includes('بدون اینترنت'),
  gOffline.sandbox.document.getElementById('eplakOfflineTitle').textContent);

const gNav = buildGuardSandbox({ onLine: false, fail: true });
ok('اگر همان اول مرورگر بگوید آفلاین است، پرده بدون فوت وقت کشیده می‌شود', gNav.classes.has('eplak-offline'));
await new Promise((r) => setTimeout(r, 10));
ok('پس از بررسی سرور، همچنان آفلاین می‌ماند (اتصال واقعی نیست)', gNav.classes.has('eplak-offline'));

/* بازگشت اینترنت: پرده کنار می‌رود و محتوا تازه می‌شود */
gOffline.sandbox.fetch = async () => ({ ok: true, json: async () => ({ success: true, online: true }) });
await gOffline.sandbox.eplakRetryOnline();
ok('دکمه‌ی «تلاش مجدد» با برگشتن اینترنت پرده را برمی‌دارد', !gOffline.classes.has('eplak-offline'));
ok('پس از بازگشت اتصال، محتوای زنده دوباره گرفته می‌شود', gOffline.sandbox._synced === true);

/* ---------- ۲) حذف اعلان ---------- */
console.log('\n=== حذف اعلان از فهرست کاربر ===');
const live = read('modules/live.js');
const dash = read('modules/dashboard.js');
ok('کنش delete در api/notifications.php اضافه شده', read('api/notifications.php').includes("action === 'delete'"));
ok('لایه‌ی وب تابع deleteNotifications دارد', live.includes('function deleteNotifications'));
ok('دکمه‌ی حذف روی هر اعلان ساخته می‌شود',
  dash.includes('notif-delete-btn') && dash.includes("deleteNotif('${n.id}')"));
ok('جلوگیری از باز شدن جزئیات با کلیک روی دکمه‌ی حذف', dash.includes('event.stopPropagation(); deleteNotif'));
ok('دکمه‌ی «حذف همه» در سرصفحه‌ی اعلان‌ها هست', idx.includes('deleteAllNotifs'));
ok('حذف همه با تأیید کاربر انجام می‌شود', dash.includes('confirm(question)'));
ok('حذف آفلاین در صف می‌ماند و بعداً به سرور می‌رود',
  live.includes('pendingDeleteNotifs') && live.includes('flushPendingDeleteNotifs'));
ok('حذف برای هر کاربر جداست (جدول notification_deletes)',
  read('shared/bootstrap.php').includes('notification_deletes') &&
  read('shared/notification_reads.php').includes('function eplakNotificationHide'));
ok('اعلان حذف‌شده از فهرست همان کاربر فیلتر می‌شود',
  read('api/notifications.php').includes('eplakNotificationHiddenSet'));

/* ---------- ۳) اعلان فوری پس از ثبت درخواست ---------- */
console.log('\n=== اعلان فوری «درخواست شما ثبت شد» ===');
const events = read('shared/notify_events.php');
ok('موتور اعلان رویدادی ساخته شده', exists('shared/notify_events.php'));
ok('تابع eplakNotifyRequestCreated متن «کد پیگیری … در تاریخ … ثبت شد» می‌سازد',
  events.includes('function eplakNotifyRequestCreated') && events.includes('کد پیگیری') && events.includes('ثبت شد'));
ok('ثبت گزارش، اعلان فوری می‌سازد', read('api/reports.php').includes('eplakNotifyRequestCreated'));
ok('ثبت تیکت/پیام هم اعلان فوری می‌سازد', read('api/tickets.php').includes('eplakNotifyRequestCreated'));
ok('اعلان رویدادی هم در فهرست ذخیره و هم با فایربیس فرستاده می‌شود (و نتیجه‌ی ارسال در push_log ثبت می‌شود)',
  events.includes('INSERT INTO notifications') && events.includes('eplakFcmSend(') && events.includes('eplakPushLogAdd('));
ok('تاریخ و ساعت شمسی برای متن اعلان محاسبه می‌شود',
  exists('shared/fa_datetime.php') && read('shared/fa_datetime.php').includes('eplakGregorianToJalali'));
ok('اپ بعد از ثبت درخواست، فهرست اعلان‌ها را بلافاصله تازه می‌کند',
  read('modules/reports.js').includes('refreshNotificationsNow') &&
  read('modules/services.js').includes('refreshNotificationsNow'));
ok('تابع refreshNotificationsNow در live.js صادر شده', live.includes('window.refreshNotificationsNow'));

/* صحت الگوریتم تاریخ شمسی (همان محاسبه‌ی shared/fa_datetime.php به زبان جاوااسکریپت) */
function toJalali(gy, gm, gd) {
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
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}
const faDt = read('shared/fa_datetime.php');
const samples = [
  [2026, 9, 30, '1405/07/08'],
  [2026, 3, 21, '1405/01/01'],
  [2025, 3, 21, '1404/01/01'],
  [2024, 3, 20, '1403/01/01'],
  [2024, 3, 19, '1402/12/29'],
  [2025, 3, 20, '1403/12/30'],
  [2023, 8, 15, '1402/05/24']
];
ok('الگوریتم شمسی با تاریخ‌های مرجع درست کار می‌کند',
  samples.every(([gy, gm, gd, want]) => toJalali(gy, gm, gd) === want),
  samples.map(([gy, gm, gd, want]) => `${gy}-${gm}-${gd}=${toJalali(gy, gm, gd)}/${want}`).join(' | '));
ok('همان الگوریتم در shared/fa_datetime.php استفاده شده است',
  ['355666', '12053', '1461', '186'].every((n) => faDt.includes(n)));
ok('خروجی متن، ساعت تهران و «ساعت» را دارد',
  faDt.includes('Asia/Tehran') && faDt.includes('ساعت'));
ok('سرور اعلان را برای همین کاربر ثبت می‌کند (اختصاصی، نه گروهی)',
  events.includes("VALUES (:phone, :title, :body, 0)"));

/* ---------- ۴) ورود دوباره پس از خروج از اپ ---------- */
console.log('\n=== پس از خروج از اپ، کد تایید دوباره ===');
const storage = read('core/storage.js');
const router = read('core/router.js');
const auth = read('modules/auth.js');
const activity = read('android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt');
ok('پاک‌سازی نشست در لایه‌ی وب ساخته شده', storage.includes('function clearStoredSession'));
ok('پیش از خروج، نشست پاک می‌شود', storage.includes('function prepareAppExit') && router.includes('prepareAppExit'));
ok('خروج با دوبار دکمه‌ی بازگشت، نشست را پاک می‌کند',
  /now - lastBackPressTime < 2000[\s\S]{0,400}prepareAppExit/.test(router));
ok('در اپ اندروید، «این بالا آمدن تازه است» تشخیص داده می‌شود',
  activity.includes('shouldRequireLogin') && activity.includes('KEY_REQUIRE_LOGIN'));
ok('هر بار باز شدن تازه‌ی اپ، ورود دوباره لازم است',
  activity.includes('savedInstanceState == null') && activity.includes('putBoolean(KEY_REQUIRE_LOGIN, true)'));
ok('بازیابی حساب وقتی اندروید می‌گوید «کد تایید لازم است» انجام نمی‌شود',
  storage.includes('nativeRequiresLogin()') && /nativeRequiresLogin\(\)[\s\S]{0,200}screen-login/.test(storage));
ok('بعد از ورود موفق، اندروید علامت «ورود انجام شد» می‌گیرد', auth.includes('markLoginDone'));
ok('بعد از ورود موفق، دستگاه کاربر روی سرور ثبت می‌شود', auth.includes('registerAppDevice(true)'));

/* ---------- ۵) متن‌های ادعای تأییدنشده حذف شده‌اند ---------- */
console.log('\n=== حذف ادعای «اعلان گوشی فعال است» ===');
const claims = [
  ['modules/live.js', 'اعلان‌های این گوشی کامل فعال است'],
  ['index.html', 'اعلان‌های این گوشی کامل فعال است'],
  ['README.md', 'اعلان فایربیس (اپ بسته)'],
];
claims.forEach(([file, text]) => ok(`ادعای «${text}» در ${file} حذف شده`, !read(file).includes(text)));
ok('به کاربر راهنمای واقعی (تنظیمات گوشی + نسخه‌ی تازه) نشان داده می‌شود',
  live.includes('تنظیمات گوشی') && live.includes('آخرین نسخه'));

console.log('\n' + '='.repeat(52));
console.log(`ONLINE: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

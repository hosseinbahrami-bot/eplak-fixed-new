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
/* درج اعلان حالا «یک» مسیر مشترک دارد: shared/bootstrap.php → eplakNotificationInsert()
   (سازگار با دیتابیس قدیمیِ هاست: بدون send_id، با کلید خارجی، با نویسه‌گان سه‌بایتی) */
const boot = read('shared/bootstrap.php');
ok('موتور اعلان رویدادی ساخته شده', exists('shared/notify_events.php'));
ok('تابع eplakNotifyRequestCreated متن «کد پیگیری … در تاریخ … ثبت شد» می‌سازد',
  events.includes('function eplakNotifyRequestCreated') && events.includes('کد پیگیری') && events.includes('ثبت شد'));
ok('ثبت گزارش، اعلان فوری می‌سازد', read('api/reports.php').includes('eplakNotifyRequestCreated'));
ok('ثبت تیکت/پیام هم اعلان فوری می‌سازد', read('api/tickets.php').includes('eplakNotifyRequestCreated'));
ok('اعلان رویدادی هم در فهرست ذخیره و هم با فایربیس فرستاده می‌شود (و نتیجه‌ی ارسال در push_log ثبت می‌شود)',
  events.includes('eplakNotificationInsert(') && boot.includes('INSERT INTO notifications') &&
  events.includes('eplakFcmSend(') && events.includes('eplakPushLogAdd('));
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
  /eplakNotificationInsert\(\s*\$pdo,\s*\$phone/.test(events) &&
  boot.includes("'user_phone', 'title', 'body'") && boot.includes("$marks[] = '0'"));

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
/* کادر وضعیت اعلان (که همین راهنما را نشان می‌داد) به درخواست مالک کلاً حذف شد؛ پس
   اپ نه ادعای «فعال است» می‌کند و نه کادری می‌سازد. راهنما در docs/NOTIFICATIONS_FA.md است. */
ok('کادر وضعیت اعلان کلاً حذف شده (نه ادعا، نه راهنما داخل صفحه‌ی اعلان‌ها)',
  !live.includes('renderDeviceNotice') && !live.includes('notifDeviceNotice')
  && !read('index.html').includes('notifDeviceNotice'));
ok('راهنمای تنظیمات گوشی در مستندات هست (docs/NOTIFICATIONS_FA.md)',
  /تنظیمات گوشی ← برنامه‌ها ← ای‌پلاک ← اعلان‌ها/.test(read('docs/NOTIFICATIONS_FA.md')));

/* ---------- ۶) آپدیت اجباری: نسخه‌های قدیمی وارد اپ نمی‌شوند ---------- */
console.log('\n=== آپدیت اجباری (نسخه‌های قدیمی وارد اپ نمی‌شوند) ===');
const vguard = read('modules/version-guard.js');
const vping = read('api/ping.php');
const settingsPhp = read('admin/settings.php');

ok('فایل modules/version-guard.js ساخته شده', exists('modules/version-guard.js'));
ok('در index.html بارگذاری می‌شود', /modules\/version-guard\.js\?v=1/.test(idx));
ok('پرده‌ی آپدیت یک عنصر واقعی در صفحه است', idx.includes('id="eplakUpdateGate"'));
ok('بنرِ «نسخه‌ی جدید» در صفحه هست', idx.includes('id="eplakUpdateBanner"'));
ok('شناسه‌های پرده/بنر همان‌هایی هستند که اسکریپت انتظار دارد',
  ['eplakUpdateGate', 'eplakUpdateTitle', 'eplakUpdateDesc', 'eplakUpdateDownload', 'eplakUpdateRetry',
   'eplakUpdateBanner', 'eplakUpdateBannerTitle', 'eplakUpdateBannerBtn', 'eplakUpdateBannerClose']
    .every((id) => idx.includes(`id="${id}"`) && vguard.includes(`'${id}'`)));
ok('در حالت مسدود، پرده کل صفحه را می‌پوشاند و محتوای اپ پنهان می‌شود',
  /html\.eplak-update-blocked\s+#eplakUpdateGate\s*\{[^}]*position:\s*fixed/.test(idx)
  && /html\.eplak-update-blocked\s+\.phone-frame\s*\{[^}]*visibility:\s*hidden/.test(idx));
ok('مسدود بودن، جلوی کلیک/لمس/کلید کاربر را می‌گیرد (دکمه‌های پرده آزادند)',
  vguard.includes('blockEvent') && vguard.includes("addEventListener('click', blockEvent, true)"));
ok('پیام دقیق «نسخه‌ی اپ شما قدیمی است» در صفحه هست', idx.includes('نسخه‌ی اپ شما قدیمی است'));
ok('دکمه‌ی دانلود لینک را در مرورگرِ گوشی باز می‌کند (پلِ بومی)', vguard.includes('AndroidApp.openUrl'));
ok('بررسی نسخه با api/ping.php انجام می‌شود (همان پینگی که همه‌جا هست و CORS دارد)',
  /ping\.php/.test(vguard) && !vguard.includes('version.php'));
ok('خرابیِ سرور کاربر را مسدود نمی‌کند (fail-open)', vguard.includes('fail-open'));
ok('api/ping.php فیلدهای نسخه را از shared/app_version.json می‌خواند (بدونِ دیتابیس)',
  vping.includes('app_version.json') && vping.includes("'app_version' => $appVersion"));
ok('api/ping.php همچنان به دیتابیس وابسته نیست (حتی با دیتابیس خراب جواب می‌دهد)',
  !vping.includes('db.php') && !vping.includes('$pdo'));
ok('api/ping.php روی خرابیِ فایل پیش‌فرضِ «آخرین نسخه» برمی‌گرداند (min = کدِ آخرین نسخه)',
  vping.includes("'min_version_code'    => 12") && vping.includes('catch (Throwable'));
ok('api/ping.php کدِ منفی و لینکِ غیرِ http(s) را نمی‌پذیرد',
  vping.includes('max(0, (int)') && vping.includes("preg_match('#^https?://#i'"));
ok('پنل مدیریت بخش «نسخه‌ی اپ و آپدیت اجباری» دارد',
  settingsPhp.includes('save_app_version') && settingsPhp.includes('min_app_version_code')
  && settingsPhp.includes('نسخه‌ی اپ و آپدیت اجباری'));
ok('فرمِ پنل هر پنج تنظیم را در shared/app_version.json ذخیره می‌کند',
  ['min_version_code', 'latest_version_code', 'latest_version_name', 'update_url', 'message']
    .every((k) => settingsPhp.includes(`'${k}'`)) && settingsPhp.includes('app_version.json'));

/* کدِ نسخه‌ی اپ در هر سه‌جا یکی است (state.js / اندروید / آیفون) */
{
  const stateJs = read('core/state.js');
  const gradle = read('android-app/app/build.gradle');
  const pbx = read('ios-app/Eplak.xcodeproj/project.pbxproj');
  const stateCode = (stateJs.match(/const APP_VERSION_CODE = (\d+);/) || [])[1];
  const gradleCode = (gradle.match(/versionCode (\d+)/) || [])[1];
  const pbxCode = (pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/) || [])[1];
  ok('کدِ نسخه‌ی اپ در هر سه‌جا یکی است (state.js / اندروید / آیفون)',
    !!stateCode && stateCode === gradleCode && gradleCode === pbxCode, `${stateCode}/${gradleCode}/${pbxCode}`);
  const stateName = (stateJs.match(/const APP_VERSION_NAME = '([^']+)'/) || [])[1];
  const gradleName = (gradle.match(/versionName '([^']+)'/) || [])[1];
  const pbxName = (pbx.match(/MARKETING_VERSION = ([0-9.]+);/) || [])[1];
  ok('نامِ نسخه‌ی اپ در هر سه‌جا یکی است',
    !!stateName && stateName === gradleName && pbxName === stateName + '.0', `${stateName}/${gradleName}/${pbxName}`);

  /* پیش‌فرضِ «حداقل نسخه» در ping.php هم باید همان آخرین نسخه باشد تا نسخه‌های
     قدیمی‌تر خودکار مسدود شوند (بدونِ تنظیمِ دستی در پنل). */
  const pingPhp = read('api/ping.php');
  const pingMin = (pingPhp.match(/'min_version_code'\s+=>\s+(\d+),/) || [])[1];
  const pingLatest = (pingPhp.match(/'latest_version_code'\s+=>\s+(\d+),/) || [])[1];
  const pingName = (pingPhp.match(/'latest_version_name'\s+=>\s+'([^']+)',/) || [])[1];
  ok('پیش‌فرضِ «حداقل نسخه» در ping.php همان آخرین نسخه است (مسدودِ خودکارِ قدیمی‌ها)',
    !!pingMin && pingMin === stateCode && pingLatest === stateCode && pingName === stateName,
    `${pingMin}/${pingLatest}/${pingName} vs ${stateCode}/${stateName}`);
}

/* ---------- ۶-۲) اجرای واقعی نگهبان نسخه در محیط شبیه‌سازی‌شده ---------- */
console.log('\n=== اجرای واقعی نگهبان نسخه ===');
function buildVersionSandbox(opts = {}) {
  const classes = new Set();
  const nodes = new Map();
  const makeEl = (id) => ({ id, textContent: '', style: {}, dataset: {}, addEventListener(t, fn) { nodes.get(id)._click = fn; }, contains: () => false });
  ['eplakUpdateGate', 'eplakUpdateTitle', 'eplakUpdateDesc', 'eplakUpdateDownload', 'eplakUpdateRetry',
   'eplakUpdateBanner', 'eplakUpdateBannerTitle', 'eplakUpdateBannerBtn', 'eplakUpdateBannerClose']
    .forEach((id) => nodes.set(id, makeEl(id)));

  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Promise, Date, Math, JSON, String, Object, Array,
    AbortController: undefined,
    APP_VERSION_CODE: opts.myCode !== undefined ? opts.myCode : 12,
    eplakApiBase: () => 'https://eplak.eplak-fixed/api',
    AndroidApp: { openUrl: (url) => { sandbox._openedNative = url; } },
    open: (url) => { sandbox._opened = url; return {}; },
    fetch: async (url) => {
      sandbox._lastUrl = url;
      if (opts.fail) throw new Error('offline');
      return { ok: true, json: async () => ({ success: true, online: true, app_version: opts.payload }) };
    },
    document: {
      readyState: 'complete',
      documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
      body: { style: {} },
      getElementById: (id) => nodes.get(id) || null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(vguard, sandbox, { filename: 'version-guard.js' });
  return { sandbox, classes, nodes };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

/* نسخه‌ی قدیمی‌تر از حداقل ⇒ پرده‌ی آپدیتِ اجباری */
const vBlocked = buildVersionSandbox({
  myCode: 12,
  payload: { success: true, min_version_code: 13, latest_version_code: 13, latest_version_name: '2.11', update_url: 'https://example.test/app.apk', message: '' },
});
await tick();
ok('نسخه‌ی قدیمی‌تر از حداقل مسدود می‌شود (پرده کشیده می‌شود)', vBlocked.classes.has('eplak-update-blocked'));
ok('eplakIsUpdateBlocked() درست برمی‌گرداند', vBlocked.sandbox.eplakIsUpdateBlocked() === true);
ok('عنوانِ پرده «نسخه‌ی اپ شما قدیمی است» است',
  vBlocked.nodes.get('eplakUpdateTitle').textContent.includes('قدیمی'));
ok('بررسی نسخه با api/ping.php انجام شده', String(vBlocked.sandbox._lastUrl).includes('/ping.php'), String(vBlocked.sandbox._lastUrl));

/* دکمه‌ی دانلود ⇒ باز کردن لینکِ APK در مرورگرِ گوشی */
vBlocked.nodes.get('eplakUpdateDownload')._click({ preventDefault: () => {}, stopPropagation: () => {} });
ok('دکمه‌ی دانلود لینکِ APK را باز می‌کند', vBlocked.sandbox._openedNative === 'https://example.test/app.apk', String(vBlocked.sandbox._openedNative));

/* پیامِ سفارشیِ مدیر جای متنِ پیش‌فرض می‌نشیند */
const vCustom = buildVersionSandbox({
  myCode: 12,
  payload: { success: true, min_version_code: 99, latest_version_code: 99, update_url: '', message: 'لطفاً همین امروز آپدیت کنید.' },
});
await tick();
ok('پیامِ سفارشیِ مدیر روی پرده نمایش داده می‌شود',
  vCustom.nodes.get('eplakUpdateDesc').textContent === 'لطفاً همین امروز آپدیت کنید.');

/* نسخه‌ی مجاز ولی قدیمی‌تر از آخرین ⇒ فقط بنر (کسی بیرون نمی‌افتد) */
const vBanner = buildVersionSandbox({
  myCode: 12,
  payload: { success: true, min_version_code: 12, latest_version_code: 13, update_url: 'https://example.test/app.apk', message: '' },
});
await tick();
ok('نسخه‌ی مجاز مسدود نمی‌شود', !vBanner.classes.has('eplak-update-blocked') && vBanner.sandbox.eplakIsUpdateBlocked() === false);
ok('بنرِ «نسخه‌ی جدید» نمایش داده می‌شود', vBanner.nodes.get('eplakUpdateBanner').style.display === 'flex');

/* نسخه‌ی تازه ⇒ هیچ‌چیز */
const vOk = buildVersionSandbox({
  myCode: 12,
  payload: { success: true, min_version_code: 12, latest_version_code: 12, update_url: '', message: '' },
});
await tick();
ok('نسخه‌ی تازه نه مسدود می‌شود و نه بنر می‌بیند',
  !vOk.classes.has('eplak-update-blocked') && vOk.nodes.get('eplakUpdateBanner').style.display !== 'flex');

/* خرابیِ سرور ⇒ fail-open (کسی بیرون نمی‌افتد) */
const vFail = buildVersionSandbox({ myCode: 12, fail: true });
await tick();
ok('اگر سرور جواب ندهد، کاربر مسدود نمی‌شود (fail-open)', !vFail.classes.has('eplak-update-blocked'));

console.log('\n' + '='.repeat(52));
console.log(`ONLINE: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

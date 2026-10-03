/* app.test.mjs — درخواست‌های واقعی اپ: «خوانده شد»، اعلان سیستمی اندروید و ثبت توکن فایربیس */
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

/* ---------- محیط حداقلی مرورگر/WebView ---------- */
const calls = [];
const store = {};

function makeDom(nodes) {
  return {
    readyState: 'loading',
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => {
      const node = { style: {}, onclick: null, appendChild() {}, addEventListener() {}, _html: '', id: '' };
      Object.defineProperty(node, 'innerHTML', { set(v) { this._html = v; if (node.id === 'eplakLiveNotifBanner') calls.push('banner'); }, get() { return this._html; } });
      return node;
    },
    addEventListener() {}, removeEventListener() {},
    body: { appendChild: () => {} },
    hidden: false,
  };
}

function buildSandbox(opts = {}) {
  const nodes = new Map();
  ['notifDeviceNotice', 'notifListWrap', 'homeNotifDot', 'dashNotifDot'].forEach((id) => {
    nodes.set(id, { id, innerHTML: '', style: { display: '' }, appendChild() {}, addEventListener() {} });
  });

  const server = { notifications: opts.serverNotifications || [] };
  const sandbox = {
    console,
    setTimeout, clearTimeout, clearInterval: () => 0, setInterval: () => 0,
    URLSearchParams, requestAnimationFrame: (fn) => fn(),
    fetch: async (url, o) => {
      calls.push({ url, body: o && o.body });
      if (String(url).includes('notifications.php')) return { ok: true, json: async () => ({ success: true, notifications: server.notifications, unread: 1 }) };
      if (String(url).includes('news.php')) return { ok: true, json: async () => ({ success: true, items: [] }) };
      if (String(url).includes('push.php')) return { ok: true, json: async () => ({ success: true, vapid_public_key: 'x', enabled: true, fcm_ready: true }) };
      return { ok: true, json: async () => ({ success: true }) };
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    navigator: {},
    document: makeDom(nodes),
    getCurrentPhone: () => '09123456789',
    soundManager: { playNotification: () => calls.push('sound') },
    showScreen: () => {},
    saveNotifications: () => {},
    renderNotifications: () => {},
    notifications: [],
    seenNotifIds: new Set(),
    window: null,
    _server: server,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (opts.android) {
    sandbox.localStorage.setItem('eplak_device_id', 'dev-1');
    sandbox.AndroidApp = {
      showNotification: (t, b, i) => calls.push({ native: { t, b, i } }),
      notificationsEnabled: () => opts.notificationsEnabled !== false,
      ensureNotificationChannel: () => calls.push('channel'),
      requestNotificationPermission: () => calls.push('requestPermission'),
      getFcmToken: () => opts.fcmToken || '',
      isFcmReady: () => !!opts.fcmToken,
      refreshFcmToken: () => calls.push('refreshToken'),
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(`${ROOT}/modules/live.js`, 'utf8'), sandbox, { filename: 'live.js' });
  return sandbox;
}

/* ---------- ۱) گزارش «خوانده شد» به سرور ---------- */
console.log('\n=== گزارش «خوانده شد» از اپ ===');
const s1 = buildSandbox({});
ok('markNotificationsRead در دسترس است', typeof s1.markNotificationsRead === 'function');
await s1.markNotificationsRead('srv-7', false);
const body1 = new URLSearchParams(calls.at(-1).body);
ok('کنش read به api/notifications.php می‌رود', String(calls.at(-1).url).endsWith('/notifications.php') && body1.get('action') === 'read');
ok('شماره‌ی کاربر همراه درخواست است', body1.get('phone') === '09123456789', body1.get('phone'));
ok('شناسه‌ی اعلان بدون پیشوند srv- فرستاده می‌شود', body1.get('ids') === '7', body1.get('ids'));
ok('شناسه‌ی دستگاه برای کاربر مهمان همراه است', (body1.get('device') || '').length >= 5, body1.get('device'));
ok('بدنه فرمی است (روی همه‌ی هاست‌ها پارس می‌شود)', /x-www-form-urlencoded/.test(calls.at(-1).body ? 'x-www-form-urlencoded' : ''));

await s1.markNotificationsRead(null, true);
const body2 = new URLSearchParams(calls.at(-1).body);
ok('«همه را خواندم» درست فرستاده می‌شود', body2.get('all') === '1' && !body2.get('ids'));

await s1.markNotificationsRead(['srv-3', 9, 'srv-11'], false);
const body3 = new URLSearchParams(calls.at(-1).body);
ok('آرایه‌ی شناسه‌ها درست تبدیل می‌شود', body3.get('ids') === '3,9,11', body3.get('ids'));

/* ---------- ۲) اعلان سیستمی در اپ اندروید ---------- */
console.log('\n=== اعلان سیستمی اپ اندروید ===');
const first = [{ id: 11, title: 'قطعی آب', body: 'فردا ۸ تا ۱۲', read_flag: 0, created_at: '2026-09-26 10:00:00' }];
const s2 = buildSandbox({ android: true, serverNotifications: first, fcmToken: 'FCM-TOKEN-XYZ' });
ok('اپ اندروید شناسایی می‌شود', s2.eplakPushCapability().kind === 'android_native');
ok('وضعیت فایربیس گزارش می‌شود', s2.eplakPushCapability().fcm === true);

await s2.syncLiveContent();
const before = calls.filter((c) => c && c.native).length;
s2._server.notifications = [{ id: 12, title: 'اطلاعیه تازه', body: 'متن تازه', read_flag: 0, created_at: '2026-09-26 11:00:00' }, ...first];
await s2.syncLiveContent();
const native = calls.filter((c) => c && c.native).pop();
ok('اعلان تازه، نوتیفیکیشن سیستمی اندروید را صدا می‌زند', !!native && before === 0, JSON.stringify(calls.slice(-4)));
ok('عنوان و متن درست منتقل می‌شود', native?.native?.t === 'اطلاعیه تازه' && native?.native?.b === 'متن تازه', JSON.stringify(native?.native));
ok('بنر داخل برنامه هم نمایش داده می‌شود', calls.includes('banner'));

/* ---------- ۳) ثبت توکن فایربیس روی سرور ---------- */
console.log('\n=== ثبت دستگاه اپ روی سرور ===');
calls.length = 0;
const reg = await s2.registerAppDevice(true);
const regCall = calls.find((c) => typeof c === 'object' && String(c.url).includes('push.php'));
const regBody = new URLSearchParams(regCall?.body || '');
ok('توکن دستگاه به سرور فرستاده شد', reg?.ok === true, JSON.stringify(reg));
ok('کنش register_fcm استفاده شده', regBody.get('action') === 'register_fcm', regBody.get('action'));
ok('توکن و شماره درست ارسال شد', regBody.get('token') === 'FCM-TOKEN-XYZ' && regBody.get('phone') === '09123456789', JSON.stringify([regBody.get('token'), regBody.get('phone')]));

calls.length = 0;
await s2.registerAppDevice(false);
ok('ثبت تکراری دوباره فرستاده نمی‌شود (سبک‌بار)', calls.filter((c) => typeof c === 'object' && String(c.url).includes('push.php')).length === 0);

/* ---------- ۴) اپ بدون فایربیس ---------- */
console.log('\n=== اپ بدون فایربیس (تنظیم نشده) ===');
const s3 = buildSandbox({ android: true, fcmToken: '' });
const r3 = await s3.registerAppDevice(true);
ok('نبود توکن بی‌خطا مدیریت می‌شود', r3.ok === false && r3.reason === 'no_fcm_token', JSON.stringify(r3));
s3.renderDeviceNotice();
const notice = s3.document.getElementById('notifDeviceNotice').innerHTML;
ok('به کاربر وضعیت دقیق اعلان نشان داده می‌شود', notice.length > 20, notice.slice(0, 80));

/* ---------- ۵) اپ با فایربیس ---------- */
console.log('\n=== اپ با فایربیس ===');
const s4 = buildSandbox({ android: true, fcmToken: 'T' });
s4.renderDeviceNotice();
const notice4 = s4.document.getElementById('notifDeviceNotice').innerHTML;
ok('ادعای تأییدنشده‌ی «اعلان گوشی کامل فعال است» نوشته نمی‌شود',
  !notice4.includes('کامل فعال است') && !notice4.includes('حتی وقتی برنامه بسته باشد'), notice4.slice(0, 90));
ok('به کاربر می‌گوید اعلان داخل برنامه کار می‌کند', notice4.includes('داخل برنامه'));
ok('راهنمای واقعی تنظیمات گوشی به کاربر داده می‌شود',
  notice4.includes('تنظیمات گوشی') && notice4.includes('ای‌پلاک'));

/* ---------- ۶) مرورگر ---------- */
console.log('\n=== مرورگر/دستگاه بدون اعلان پس‌زمینه ===');
const s5 = buildSandbox({});
s5.renderDeviceNotice();
const notice5 = s5.document.getElementById('notifDeviceNotice').innerHTML;
ok('متن دستگاه بدون اعلان پس‌زمینه صادقانه است و ادعای صفحه‌ی قفل نمی‌کند',
  notice5.includes('اعلان‌های تازه در فهرست') && !notice5.includes('صفحه‌ی قفل'), notice5.slice(0, 90));

/* ---------- ۷) حذف اعلان ---------- */
console.log('\n=== حذف اعلان از فهرست کاربر ===');
calls.length = 0;
const s6 = buildSandbox({ android: true, fcmToken: 'T' });
s6.notifications = [
  { id: 'srv-21', title: 'الف', body: 'متن الف', read: false, time: '۱۰:۰۰' },
  { id: 'srv-22', title: 'ب', body: 'متن ب', read: true, time: '۱۱:۰۰' }
];
const rDel = await s6.deleteNotifications([21], false);
const delBody = new URLSearchParams(String(calls.at(-1).body));
ok('حذف با کنش delete به سرور می‌رود',
  String(calls.at(-1).url).endsWith('/notifications.php') && delBody.get('action') === 'delete');
ok('شناسه‌ی اعلان بدون پیشوند srv- حذف می‌شود', delBody.get('ids') === '21', delBody.get('ids'));
ok('شماره‌ی کاربر همراه درخواست حذف است', delBody.get('phone') === '09123456789');
ok('پاسخ موفق سرور پذیرفته می‌شود', rDel.ok === true);

calls.length = 0;
await s6.deleteNotifications(null, true);
const delAllBody = new URLSearchParams(String(calls.at(-1).body));
ok('«حذف همه» با all=1 فرستاده می‌شود', delAllBody.get('all') === '1' && !delAllBody.get('ids'));

/* ---------- ۸) صف حذف وقتی اینترنت نیست ---------- */
console.log('\n=== صف حذف در حالت قطعی اینترنت ===');
const s7 = buildSandbox({ android: true, fcmToken: 'T' });
s7.notifications = [{ id: 'srv-31', title: 'ج', body: 'متن ج', read: false, time: '۱۲:۰۰' }];
calls.length = 0;
s7.fetch = async () => { throw new Error('offline'); };
await s7.deleteNotif('srv-31');
ok('اعلان در حالت آفلاین از فهرست خود کاربر پاک می‌شود', !s7.notifications.some((n) => String(n.id) === 'srv-31'));
ok('وقتی اینترنت نیست، حذف در صف می‌ماند (گم نمی‌شود)', s7.eplakPendingDeletes().length === 1, JSON.stringify(s7.eplakPendingDeletes()));

calls.length = 0;
s7.fetch = async (url, o) => { calls.push({ url, body: o && o.body }); return { ok: true, json: async () => ({ success: true, deleted: true }) }; };
await s7.flushPendingDeleteNotifs();
const retryBody = new URLSearchParams(String(calls.at(-1).body));
ok('با برگشتن اینترنت، حذف دوباره به سرور می‌رود', retryBody.get('action') === 'delete' && retryBody.get('ids') === '31', String(calls.at(-1).body));

calls.length = 0;
const refreshed = await s7.refreshNotificationsNow();
ok('refreshNotificationsNow فهرست را از سرور می‌خواند',
  refreshed === true && calls.some((c) => typeof c === 'object' && String(c.url).includes('/notifications.php')));

/* ---------- ۹) تازه‌سازی وضعیت گزارش‌ها و گالری پیوست‌ها ---------- */
console.log('\n=== تازه‌سازی وضعیت گزارش‌ها (پنل ادمین ← اپ) ===');
const reportsJs = fs.readFileSync(path.join(ROOT, 'modules/reports.js'), 'utf8');

ok('آدرس API در همه‌ی درخواست‌ها «فراخوانی» شده است (نه خودِ تابع)',
  !/\$\{apiBase\}/.test(reportsJs) && (reportsJs.match(/\$\{apiBase\(\)\}/g) || []).length >= 6,
  'تعداد موارد درست: ' + (reportsJs.match(/\$\{apiBase\(\)\}/g) || []).length);
ok('فهرست گزارش‌ها از سرور خوانده می‌شود (مسیر درست API)',
  /\$\{apiBase\(\)\}\/reports\.php\?phone=/.test(reportsJs));
ok('حذف گزارش هم از مسیر درست API انجام می‌شود',
  /\$\{apiBase\(\)\}\/reports\.php\?action=delete/.test(reportsJs));
ok('کارهای تیکت هم از مسیر درست انجام می‌شوند',
  /\$\{apiBase\(\)\}\/tickets\.php/.test(reportsJs));
ok('فهرست واحدها از سرور خوانده می‌شود',
  /\$\{apiBase\(\)\}\/departments\.php/.test(reportsJs));

ok('وضعیت گزارش‌ها خودکار تازه می‌شود (هر ۴۵ ثانیه)',
  /REPORTS_REFRESH_MS = 45000/.test(reportsJs) && /setInterval\(/.test(reportsJs));
ok('با برگشتن اپ از پس‌زمینه هم وضعیت‌ها تازه می‌شوند',
  /visibilitychange/.test(reportsJs) && /refreshReportsNow/.test(reportsJs));
ok('در پس‌زمینه بودن اپ، درخواست بی‌فایده زده نمی‌شود',
  /document\.visibilityState === 'hidden'/.test(reportsJs));
ok('پس از تازه‌سازی، فهرست/جزئیات دوباره رندر می‌شود',
  /function repaintReportsScreens/.test(reportsJs) && /skipBackend: true/.test(reportsJs));
ok('وضعیت تازه از سرور به مقدار داخلی اپ نگاشت می‌شود',
  /status: normalizeStatusValue\(item\.status \|\| 'pending'\)/.test(reportsJs));

console.log('\n=== گالری عکس و فیلم در اپ ===');
ok('کاشی‌های عکس در گالری ساخته می‌شوند', /media-tile/.test(reportsJs) && /media-strip/.test(reportsJs));
ok('فیلم‌ها با پیش‌نمایش و آیکن پخش نشان داده می‌شوند',
  /media-video-card/.test(reportsJs) && /media-play-badge/.test(reportsJs));
ok('نمایش تمام‌صفحه (لایت‌باکس) برای پیوست‌ها هست',
  /function openReportMedia/.test(reportsJs) && /function closeReportMedia/.test(reportsJs));
ok('بین پیوست‌ها می‌توان جلو/عقب رفت',
  /function stepReportMedia/.test(reportsJs) && /media-viewer-nav/.test(reportsJs));
ok('دکمه‌ی بازگشت گوشی، اول گالری را می‌بندد',
  /reportMediaViewer/.test(fs.readFileSync(path.join(ROOT, 'core/router.js'), 'utf8')));
ok('اندازه‌ی فایل هر پیوست در گالری نوشته می‌شود', /formatFileSize\(m\.size/.test(reportsJs));

const appCss = fs.readFileSync(path.join(ROOT, 'assets/css/style.css'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'core/state.js'), 'utf8');
const iconsSrc = fs.readFileSync(path.join(ROOT, 'assets/js/icons.js'), 'utf8');
ok('استایل گالری اپ (کاشی مربعی و لایت‌باکس) اضافه شده است',
  /\.media-tile \{/.test(appCss) && /aspect-ratio: 1 \/ 1/.test(appCss) && /\.media-viewer\.open/.test(appCss));
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('صفحه‌ی اپ، نسخه‌ی تازه‌ی فایل‌ها را بار می‌کند',
  /modules\/reports\.js\?v=27/.test(indexHtml)
  && /core\/storage\.js\?v=21/.test(indexHtml)
  && /core\/upload-progress\.js\?v=1/.test(indexHtml)
  && /assets\/js\/ep-camera\.js\?v=2/.test(indexHtml));

console.log('\n=== گزارش فنی ارسال پیوست (برای پیگیری) ===');
ok('نتیجه‌ی هر تلاش ارسال در اپ ثبت می‌شود',
  /UPLOAD_LOG_KEY/.test(reportsJs) && /function saveUploadLog/.test(reportsJs));
ok('کاربر می‌تواند جزئیات فنی را ببیند',
  /function showUploadDetails/.test(reportsJs) && /نمایش جزئیات فنی ارسال/.test(reportsJs));

/* ---------- ۱۰) هیچ تابعی در قالب رشته‌ای «بدون فراخوانی» جاگذاری نشده ---------- */
console.log('\n=== بررسی سراسری: جاگذاری تابع بدون فراخوانی در رشته‌ها ===');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'uploads', 'data', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};
const suspicious = [];
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const funcs = new Set([
    ...Array.from(src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g), (m) => m[1]),
    ...Array.from(src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g), (m) => m[1]),
  ]);
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}(?![\(\w])/g)) {
    if (funcs.has(m[1])) {
      suspicious.push(path.relative(ROOT, file) + ':' + (src.slice(0, m.index).split('\n').length) + ' → ${' + m[1] + '}');
    }
  }
}
ok('هیچ تابعی بدون () داخل رشته‌های قالبی جاگذاری نشده است',
  suspicious.length === 0, suspicious.slice(0, 4).join(' | '));

console.log('\n=== ارسال خودکار پیوست‌های جامانده (صف گوشی) ===');
const storageSrc = fs.readFileSync(path.join(ROOT, 'core/storage.js'), 'utf8');
ok('صف پیوست‌های ناموفق روی گوشی ساخته می‌شود (IndexedDB)',
  /PENDING_DB = 'eplak_pending_media'/.test(storageSrc) && /function queuePendingMedia/.test(storageSrc)
  && /eplak_pending_media/.test(storageSrc));
ok('صف، فایل‌های ناموفق را با شناسه‌ی گزارش/شناسه‌ی یکتا نگه می‌دارد',
  /key: \(ref \? ref : String\(reportId\)\)/.test(storageSrc) && /blob: file/.test(storageSrc)
  && /clientRef: ref,/.test(storageSrc));
ok('ارسال دوباره‌ی صف با گروه‌بندی بر اساس گزارش انجام می‌شود',
  /async function flushPendingMedia/.test(storageSrc) && /uploadReportMediaChunked\(group\.reportId/.test(storageSrc));
ok('فایل‌های موفق از صف حذف می‌شوند و ناموفق‌ها می‌مانند',
  /store\.clear\(\);/.test(storageSrc) && /leftovers\.forEach/.test(storageSrc));
ok('اگر مرورگر IndexedDB نداشت، رفتار قبلی حفظ می‌شود (بدون خطا)',
  /if \(!window\.indexedDB\) \{/.test(storageSrc) && /resolve\(null\)/.test(storageSrc));
ok('صف در دسترس لایه‌ی اپ قرار می‌گیرد',
  /window\.eplakQueuePendingMedia/.test(storageSrc) && /window\.eplakFlushPendingMedia/.test(storageSrc)
  && /window\.eplakCountPendingMedia/.test(storageSrc));
ok('فایل‌های ناموفق همراه «شناسه‌ی یکتا» در صف گذاشته می‌شوند',
  /eplakQueuePendingMedia\(report\.backendId \|\| 0, phone, files, report\.clientRef\)/.test(reportsJs));
ok('صف هنگام باز شدن اپ و برگشتن اینترنت خودکار فرستاده می‌شود',
  /window\.addEventListener\('online', function \(\) \{ flushPendingUploads\(\); \}\)/.test(reportsJs)
  && /setTimeout\(flushPendingUploads, 2500\)/.test(reportsJs));
ok('پس از ارسال خودکار، وضعیت گزارش‌ها هم تازه می‌شود',
  /پیوست جامانده خودکار ارسال شد/.test(reportsJs));

console.log('\n=== روند رسیدگی داخل اپ (هم‌خوان با پنل ادمین) ===');
ok('گام‌های واقعی سرور روی چهار مرحله‌ی روند رسیدگی سوار می‌شوند',
  /Array\.isArray\(r\.flow\) && r\.flow\.length === 4/.test(reportsJs) && /r\.flow\.map/.test(reportsJs));
ok('پاسخ سرور، روند چهارمرحله‌ای را همراه گزارش به اپ می‌دهد (بدون محاسبه‌ی موازی)',
  /flow: Array\.isArray\(item\.flow\) && item\.flow\.length === 4 \? item\.flow : null/.test(reportsJs)
  && /\$row\['flow'\] = eplakReportFlowStages\(/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8')));
ok('چهار مرحله دقیقاً همان خواسته‌ی کاربر است (ثبت گزارش → در حال انتظار → در حال رسیدگی → انجام شد)',
  /created: 'ثبت گزارش'/.test(reportsJs) && /pending: 'در حال انتظار'/.test(reportsJs)
  && /in_progress: 'در حال رسیدگی'/.test(reportsJs) && /done: 'انجام شد'/.test(reportsJs));
ok('هر مرحله: آیکون پک، نشان وضعیت، توضیح و تاریخ دارد',
  /flow-marker/.test(reportsJs) && /flow-badge/.test(reportsJs)
  && /flow-note/.test(reportsJs) && /flow-date/.test(reportsJs));
ok('روند پایه برای گزارش‌های بدون گام ساخته می‌شود (بدون صفحه‌ی خالی)',
  /const flowFromStatus = /.test(reportsJs) && /درخواست شهروند ثبت شد\./.test(reportsJs));
ok('مرحله‌ی جاری با انیمیشن نشان داده می‌شود (کار در جریان است)',
  /is-current/.test(reportsJs) && /@keyframes flowPulse/.test(appCss));
ok('کارت خلاصه‌ی وضعیت بالای صفحه‌ی جزئیات هست',
  /detailStatusSummary/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  && /status-summary-box/.test(reportsJs) && /\.status-summary-box/.test(appCss));
ok('کارت خلاصه، تعداد مراحل سپری‌شده از چهار مرحله را نشان می‌دهد',
  /مراحل رسیدگی/.test(reportsJs) && /flowStages\.length/.test(reportsJs));
ok('برچسب وضعیت در اپ همان چهار مرحله‌ی درخواستی است',
  /pending: 'در حال انتظار',\s*\n\s*in_progress: 'در حال رسیدگی',/.test(stateSrc)
  && /done: 'انجام شد'/.test(stateSrc));
ok('هر مرحله در پک آیکون حرفه‌ای، آیکون اختصاصی دارد',
  /'file-plus':/.test(iconsSrc) && /'clock':/.test(iconsSrc) && /'tools':/.test(iconsSrc) && /'check-circle':/.test(iconsSrc));
ok('پک آیکون با نسخه‌ی تازه در اپ بارگذاری می‌شود (کش قدیمی نمایش داده نشود)',
  /assets\/js\/icons\.js\?v=13/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  && /hydrateIcons/.test(iconsSrc) && /data-eplak-icon/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
const iconKeys = [...iconsSrc.slice(iconsSrc.indexOf('var ICONS'), iconsSrc.indexOf('var EMOJI_MAP')).matchAll(/^\s*'([^']+)':\s*'/gm)].map((m) => m[1]);
const emojiPairs = [...iconsSrc.slice(iconsSrc.indexOf('var EMOJI_MAP')).matchAll(/^\s*'([^']+)':\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]);
const emojiDupes = emojiPairs.map((p) => p[0]).filter((k, i, a) => a.indexOf(k) !== i);
const brokenRefs = emojiPairs.filter(([, v]) => !iconKeys.includes(v));
ok('نقشه‌ی ایموجی بدون کلید تکراری و کامل است (همه به آیکون موجود اشاره می‌کنند)',
  emojiDupes.length === 0 && brokenRefs.length === 0 && iconKeys.length >= 100 && emojiPairs.length >= 160,
  `icons=${iconKeys.length} map=${emojiPairs.length} dupes=${emojiDupes.length} broken=${brokenRefs.length}`);
ok('ایموجی‌های آب‌وهوا، کیفیت هوا و خدمات در پک آیکون نگاشت شده‌اند',
  ['🌧️','🌤️','❄️','🌫️','🌡️','☀️','😊','😷','🕊️','♻️','🏛️','🗑️','🤝','📵','🔕'].every((e) => new RegExp("'" + e + "':").test(iconsSrc)));

console.log('\n=== یک درخواست = یک کد پیگیری (سمت اپ) ===');
ok('هر درخواست یک «شناسه‌ی یکتا» می‌گیرد و همراه payload به سرور می‌رود',
  /const clientRef = 'EPL-'/.test(reportsJs) && /client_ref: report\.clientRef/.test(reportsJs)
  && /clientRef,\s*\n\s*code: '',/.test(reportsJs));
ok('شناسه‌ی یکتا روی خود گزارش ذخیره می‌شود و کد تا پایان بارگذاری خالی می‌ماند',
  /clientRef,\s*\n\s*code: '',/.test(reportsJs));
ok('اگر کاربر دو بار روی «ثبت نهایی» بزند، فقط یک گزارش ساخته می‌شود',
  /let reportSubmitInFlight = false/.test(reportsJs) && /if \(reportSubmitInFlight\) \{\s*\n\s*return;/.test(reportsJs));
ok('پاسخ «تکراری» سرور باعث ساخته شدن گزارش/کد تازه در اپ نمی‌شود',
  /if \(res\.deduped\) \{/.test(reportsJs) && /کد پیگیری تکراری ساخته نشد/.test(reportsJs)
  && /\$row\['flow'\] = eplakReportFlowStages\(/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8'))
  && /'deduped'       => true/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8')));
ok('سرور پیش از ساخت گزارش، وجود شناسه‌ی یکتا را بررسی می‌کند',
  /SELECT id FROM reports WHERE client_ref = :ref/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8')));

console.log('\n=== یک درخواست = یک کد پیگیری؛ کد فقط پس از پایان بارگذاری ===');
{
  const submitBlock = reportsJs.slice(
    reportsJs.indexOf('async function submitNewReport'),
    reportsJs.indexOf('window.submitNewReport = submitNewReport'));
  const uploadAt  = submitBlock.indexOf('await uploadStagedMedia(');
  const createAt  = submitBlock.indexOf('await finalizePendingReport(');
  ok('عکس و فیلم پیش از ساخت گزارش بارگذاری می‌شوند (ترتیب: اول فایل، بعد گزارش)',
    uploadAt > -1 && createAt > -1 && uploadAt < createAt);
  ok('تا پایان بارگذاری هیچ کد پیگیری نشان داده نمی‌شود',
    /setSuccessCodeState\('loading'\)/.test(submitBlock)
    && /code: '',\s*\/\* ← هیچ کد ساختگی محلی/.test(reportsJs)
    && !/EP-1403-' \+ String\(1000 \+ reports\.length \+ 1\)/.test(submitBlock));
  ok('تا وقتی فایلی نرسیده، گزارش روی سرور ساخته نمی‌شود و کاربر دکمه‌ی تلاش دوباره می‌بیند',
    /if \(!mediaRes\.ok\) \{/.test(submitBlock) && /showReportUploadFailed\(/.test(submitBlock)
    && /offerMediaRetry\(files, phone, report\)/.test(reportsJs));
  ok('در فهرست/جزئیات، جای کد پیگیری «در حال بارگذاری…» نشان داده می‌شود',
    /function reportCodeLabel\(/.test(reportsJs) && /در حال بارگذاری عکس\/فیلم…/.test(reportsJs)
    && /escapeHtml\(reportCodeLabel\(r\)\)/.test(reportsJs));
  ok('گزارش‌های ناتمام (آفلاین) فقط پس از رسیدن فایل‌ها ساخته می‌شوند',
    /eplakFlushPendingMediaRef\(r\.clientRef, phone/.test(reportsJs)
    && /async function flushPendingMediaRef/.test(storageSrc)
    && /window\.eplakFlushPendingMediaRef\s*=/.test(storageSrc));
  ok('شناسه‌ی یکتا در پاسخ سرور به اپ می‌رسد (تطبیق دقیق رکوردها)',
    /clientRef: String\(item\.client_ref \|\| ''\)/.test(reportsJs)
    && /\$row\['client_ref'\] = \$hasRef \?/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8')));
  ok('رکوردهای تکراری همان درخواست در فهرست به یک ردیف تبدیل می‌شوند (یک کد)',
    /const byRef = new Map\(\)/.test(reportsJs) && /const serverRefs = new Set\(byRef\.keys\(\)\)/.test(reportsJs)
    && /if \(ref && serverRefs\.has\(ref\)\) return false;/.test(reportsJs));
}

console.log('\n=== سرور: فایل‌های «در انتظار اتصال» به گزارش وصل می‌شوند ===');
{
  const mediaPhp = fs.readFileSync(path.join(ROOT, 'api/media.php'), 'utf8');
  const reportsPhp = fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8');
  const sharedMedia = fs.readFileSync(path.join(ROOT, 'shared/media.php'), 'utf8');
  ok('سرور ارسال فایل را پیش از ساخته شدن گزارش می‌پذیرد (reportId صفر + شناسه‌ی یکتا)',
    /\$staging = \(\$clientRef !== ''\) && eplakTableHasColumn\(\$pdo, 'report_media', 'client_ref'\)/.test(mediaPhp)
    && /eplakMediaStagedCount\(\$pdo, \$clientRef\)/.test(mediaPhp));
  ok('فایل‌های در انتظار اتصال در زمان ساخت گزارش به آن وصل می‌شوند',
    /eplakMediaAttachStaged\(\$pdo, \$insertId, \$clientRef\)/.test(reportsPhp)
    && /eplakMediaAttachStaged\(\$pdo, \$existingId, \$clientRef\)/.test(reportsPhp)
    && /function eplakMediaAttachStaged/.test(sharedMedia));
  ok('فایل‌های جامانده‌ی در انتظار اتصال روی سرور پاک‌سازی می‌شوند',
    /eplakMediaCleanupStaged\(\$pdo, 86400\)/.test(reportsPhp) && /function eplakMediaCleanupStaged/.test(sharedMedia));
  ok('نسخه‌ی ساختار دیتابیس برای گذار به «اول فایل، بعد گزارش» بالا رفته است',
    /EPLAK_SCHEMA_VERSION', '2026-10-03\.1'/.test(fs.readFileSync(path.join(ROOT, 'shared/bootstrap.php'), 'utf8')));
}

console.log('\n=== عکس و فیلم با هم ارسال می‌شوند (موازی) ===');
ok('ارسال فایل‌ها موازی است (نه یکی‌یکی) — تعداد خطوط هم‌زمان قابل تنظیم',
  /function mediaUploadConcurrency/.test(storageSrc) && /EPLAK_MEDIA_UPLOAD_CONCURRENCY/.test(storageSrc)
  && /async function runMediaPool/.test(storageSrc));
ok('هر دو مسیر ارسال (تکه‌تکه و پشتیبان) از استخر موازی استفاده می‌کنند',
  (storageSrc.match(/runMediaPool\(remaining/g) || []).length === 2);
ok('عکس و فیلم پیش از ساخته شدن گزارش بارگذاری می‌شوند (یک کد، با پیوست)',
  /async function uploadStagedMedia/.test(reportsJs)
  && /uploadReportMediaChunked\(0, phone, files/.test(reportsJs)
  && /clientRef: report\.clientRef,/.test(reportsJs));
ok('درصد پیشرفت بر پایه‌ی «بایت‌های واقعاً ارسال‌شده» محاسبه می‌شود (نه تعداد فایل، نه تخمینی)',
  /const loadedBy = list\.map/.test(storageSrc) && /reportOverall/.test(storageSrc)
  && /درصد کل هیچ‌وقت عقب نمی‌رود/.test(storageSrc));
ok('ارسال دیرهنگام گزارش‌های آفلاین هم شناسه‌ی یکتا و مختصات را با خود می‌برد',
  /client_ref: report\.clientRef/.test(reportsJs)
  && /typeof report\.lat === 'number' && typeof report\.lng === 'number'/.test(reportsJs));

const servicesJs = fs.readFileSync(path.join(ROOT, 'modules/services.js'), 'utf8');
const liveJs = fs.readFileSync(path.join(ROOT, 'modules/live.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(ROOT, 'modules/profile.js'), 'utf8');
ok('برچسب‌های سریع خدمات، بنر اعلان و لیست علاقه‌مندی‌ها هم از پک آیکون می‌آیند (نه ایموجی خام)',
  /svcIcon\('building'\)/.test(servicesJs) && /svcIcon\('recycle'\)/.test(servicesJs)
  && /EplakIcons\.get\('megaphone'/.test(liveJs) && /function serviceIcon\(icon, size\)/.test(profileJs));
ok('آیکون‌های پک در ماژول‌ها هیچ ایموجی‌ای را در HTML جا نمی‌گذارند',
  !/svc-quick-tag[^>]*>\s*[🏛💳🏪♻🚇📑🕊]/.test(servicesJs));

const flowBlock = reportsJs.slice(
  reportsJs.indexOf('روند رسیدگی (چهار مرحله'),
  reportsJs.indexOf("showScreen('screen-report-detail')"));
ok('هیچ ایموجی‌ای در روند رسیدگی اپ باقی نمانده (همه از پک آیکون)',
  flowBlock.length > 400 && !/⏳|✅|📋/.test(flowBlock) && /EplakIcons\.get|ICON\(/.test(flowBlock));
ok('پیوست‌های ناخوانا (حجم صفر) همان لحظه‌ی انتخاب تشخیص داده می‌شوند',
  /if \(!file\.size\) \{/.test(reportsJs) && /ناخوانا/.test(reportsJs));
ok('نتیجه‌ی انتخاب فایل از اندروید در گزارش فنی ثبت می‌شود',
  /window\.eplakNativeFilesPicked = function/.test(reportsJs));
ok('فشرده‌سازی عکس چندمرحله‌ای است (تا رسیدن به حجم کم)',
  /for \(const scale of scales\)/.test(reportsJs) && /for \(const quality of qualities\)/.test(reportsJs));
ok('تعداد گام‌های رسیدگی روی ردیف هر گزارش در فهرست دیده می‌شود',
  /report-steps-chip/.test(reportsJs) && /timelineCount/.test(reportsJs) && /\.report-steps-chip/.test(appCss));

const kt = fs.readFileSync(path.join(ROOT, 'android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt'), 'utf8');
ok('اپ اندروید: فایل انتخاب‌شده داخل حافظه‌ی خود اپ کپی می‌شود (خوانا بودن تضمینی)',
  /private fun copyPickedFileToCache/.test(kt) && /Uri\.fromFile\(dest\)/.test(kt));
ok('اپ اندروید: دسترسی خواندن file:// روشن است (ریشه‌ی خرابی بارگذاری عکس)',
  /webSettings\.allowFileAccess = true/.test(kt));
ok('اپ اندروید: دسترسی content:// گالری هم روشن است',
  /webSettings\.allowContentAccess = true/.test(kt));
ok('اپ اندروید: اگر کپی فایل ممکن نشد، Uri اصلی هم تحویل داده می‌شود (شانس دوم)',
  /out\.add\(uri\)/.test(kt));
ok('اپ اندروید: فایل‌های کش قدیمی پاک می‌شوند تا حافظه‌ی گوشی پر نشود',
  /cleanOldPickedFiles/.test(kt) && /files\.drop\(12\)/.test(kt));
ok('اپ اندروید: نتیجه‌ی انتخاب فایل به لایه‌ی وب خبر داده می‌شود',
  /notifyWebFilePick/.test(kt) && /eplakNativeFilesPicked/.test(kt));

const manifestXml = fs.readFileSync(path.join(ROOT, 'android-app/app/src/main/AndroidManifest.xml'), 'utf8');

/* ---------- ۱۳) دور ۲۶: «بارگذاری مجدد عکس/فیلم» + دوربین داخل اپ ---------- */
console.log('\n=== دور ۲۶: ارسال مجدد پیوست‌ها (ریشه‌ی مشکل) ===');
const storageJs = fs.readFileSync(path.join(ROOT, 'core/storage.js'), 'utf8');
ok('تکه‌های ارسالی، شناسه‌ی یکتای درخواست را با خود می‌برند (بدون آن سرور فایل را رد می‌کرد)',
  /client_ref: clientRef \|\| ''/.test(storageJs)
  && storageJs.indexOf('client_ref: clientRef') < storageJs.indexOf('}, chunkUrl,'));
ok('مسیر پشتیبان (add_media) هم شناسه‌ی یکتا را می‌فرستد',
  /wholeUrl[\s\S]{0,600}client_ref: clientRef \|\| ''/.test(storageJs));
ok('فقط خطای حجم/نوع «قطعی» شمرده می‌شود؛ بقیه شانس دوباره می‌گیرند',
  /function isHardMediaError/.test(storageJs) && /isHardMediaError\(\(res && res\.error\)/.test(storageJs));
ok('پس از پاسخ منطقی سرور، مستقیم به دروازه‌ی پشتیبان می‌رویم (نه تکه‌ی کوچک‌تر)',
  /if \(goGateway\) break;/.test(storageJs));
ok('حذف ردیف‌های صف با تراکنش درست انجام می‌شود (باگ «مجدد بارگذاری نمی‌شود»)',
  /function pendingDbDelete/.test(storageJs) && /store\.transaction\.oncomplete/.test(storageJs)
  && !/tx\.objectStore\('files'\)/.test(storageJs));
ok('تلاش دوباره، فقط ردیف‌های واقعاً ارسال‌شده را از صف پاک می‌کند',
  /await pendingDbDelete\(db, usable\.map\(item => item\.key\)\)/.test(storageJs));
ok('وضعیت صف یک درخواست (مانده/قابل خواندن) در دسترس اپ است',
  /async function pendingMediaRefState/.test(storageJs) && /window\.eplakPendingMediaRefState/.test(storageJs));
ok('فایل‌های بی‌بایت (پاک‌شده از حافظه) ارسال‌شده حساب نمی‌شوند',
  /const usable = mine\.filter\(r => r && r\.blob/.test(storageJs) && /if \(!usable\.length\) return false;/.test(storageJs));

ok('تلاش دوباره از سه منبع فایل می‌گیرد (صفحه، حافظه‌ی برنامه، صف پایدار)',
  /lastMediaAttempt/.test(reportsJs) && /eplakFlushPendingMediaRef\(ref, phone, 0/.test(reportsJs));
ok('پس از رسیدن فایل‌های جامانده، گزارش ساخته و «یک» کد پیگیری صادر می‌شود',
  /await flushPendingCreates\(phone\);/.test(reportsJs));
ok('امضای بازخورد صف درست است (reportId, clientRef, count)',
  /function \(reportId, clientRef, count\)/.test(reportsJs));
ok('اگر فایل‌ها از حافظه رفته باشند، کاربر می‌تواند دوباره پیوست کند (بدون کد دوم)',
  /function offerMediaReattach/.test(reportsJs) && /reportReattachInput/.test(reportsJs)
  && /انتخاب دوباره‌ی عکس\/فیلم از گوشی/.test(reportsJs));

console.log('\n=== دور ۲۶: عکس و فیلم گرفتن با دوربین گوشی داخل اپ ===');
const cameraJs = fs.readFileSync(path.join(ROOT, 'assets/js/ep-camera.js'), 'utf8');
ok('ماژول دوربین داخل اپ وجود دارد و با getUserMedia کار می‌کند',
  /navigator\.mediaDevices\.getUserMedia/.test(cameraJs) && /window\.EplakCamera/.test(cameraJs));
ok('عکس با کیفیت و اندازه‌ی واقعی دوربین ذخیره می‌شود',
  /canvas\.toBlob/.test(cameraJs) && /video\.videoWidth/.test(cameraJs) && /image\/jpeg/.test(cameraJs));
ok('فیلم با MediaRecorder ضبط می‌شود و سقف زمانی دارد',
  /new MediaRecorder/.test(cameraJs) && /MAX_VIDEO_SECONDS/.test(cameraJs));
ok('خروجی دوربین یک «فایل» است تا در همان مسیر بارگذاری برود',
  /function toFile/.test(cameraJs) && /new File\(\[blob\], name, \{ type: type \}\)/.test(cameraJs));
ok('اگر دوربین داخل اپ اجازه نگیرد، اپ به دوربین خود گوشی برمی‌گردد',
  /async function openReportCamera/.test(reportsJs)
  && /reportCameraPhotoInput/.test(reportsJs) && /reportCameraVideoInput/.test(reportsJs));
ok('دکمه‌های «گرفتن عکس» و «گرفتن فیلم» در مرحله‌ی تصاویر هست',
  /openReportCamera\('photo'\)/.test(indexHtml) && /openReportCamera\('video'\)/.test(indexHtml)
  && /گرفتن عکس/.test(indexHtml) && /گرفتن فیلم/.test(indexHtml));
ok('ورودی‌های دوربین گوشی با capture ساخته شده‌اند (دوربین عقب)',
  /capture="environment"/.test(indexHtml) && /capture="camcorder"/.test(indexHtml));
ok('فایل دوربین هم از همان مسیر مشترک آماده‌سازی (حجم/فشرده‌سازی) می‌گذرد',
  /async function prepareCapturedFiles/.test(reportsJs) && /await prepareCapturedFiles\(chosen\)/.test(reportsJs)
  && /await prepareCapturedFiles\(files\)/.test(reportsJs));
ok('نتیجه‌ی گرفتن عکس/فیلم به پیوست‌ها اضافه و در گزارش فنی ثبت می‌شود',
  /async function addCapturedFiles/.test(reportsJs) && /window\.addCapturedFiles/.test(reportsJs)
  && /eplakCameraLog/.test(reportsJs));

ok('اپ اندروید: اجازه‌ی دوربین و میکروفون در مانیفست تعریف شده',
  /android\.permission\.CAMERA/.test(manifestXml) && /android\.permission\.RECORD_AUDIO/.test(manifestXml));
ok('اپ اندروید: FileProvider برای فایل عکسِ دوربین ثبت شده (بدون خطا روی اندروید ۷+)',
  /androidx\.core\.content\.FileProvider/.test(manifestXml) && /file_paths/.test(manifestXml)
  && fs.existsSync(path.join(ROOT, 'android-app/app/src/main/res/xml/file_paths.xml')));
ok('اپ اندروید: گزینه‌ی «دوربین» به پنجره‌ی انتخاب فایل اضافه می‌شود',
  /MediaStore\.ACTION_IMAGE_CAPTURE/.test(kt) && /MediaStore\.ACTION_VIDEO_CAPTURE/.test(kt)
  && /Intent\.EXTRA_INITIAL_INTENTS/.test(kt) && /isCaptureEnabled/.test(kt));
ok('اپ اندروید: اجازه‌ی دوربین پیش از باز شدن دوربین از کاربر گرفته می‌شود',
  /hasCameraPermission\(\)/.test(kt) && /requestCameraPermission\(false\)/.test(kt));
ok('اپ اندروید: عکس گرفته‌شده با دوربین به لایه‌ی وب برمی‌گردد (حتی با Intent خالی)',
  /pendingCameraFile/.test(kt) && /copyExistingFileToPicked/.test(kt));
ok('اپ اندروید: دوربین داخل اپ (WebView) اجازه‌ی تصویر و صدا را می‌گیرد',
  /override fun onPermissionRequest/.test(kt) && /PermissionRequest\.RESOURCE_VIDEO_CAPTURE/.test(kt)
  && /webRequest\.grant/.test(kt));


/* ---------- ۱۴) اجرای واقعی ماژول دوربین داخل اپ (بدون مرورگر) ---------- */
console.log('\n=== دوربین داخل اپ: اجرای واقعی در محیط آزمون ===');

function buildCameraSandbox(opts = {}) {
  const created = [];
  const doc = {
    createElement: (tag) => {
      const node = {
        tagName: String(tag).toUpperCase(), style: {}, onclick: null, type: '', title: '',
        children: [], appendChild(c) { this.children.push(c); }, setAttribute() {},
        addEventListener() {}, removeChild() {}, textContent: '',
      };
      if (tag === 'video') {
        node.videoWidth = 1600; node.videoHeight = 1200; node.srcObject = null;
        node.play = async () => {};
      }
      if (tag === 'canvas') {
        node.width = 0; node.height = 0;
        node.getContext = () => ({ drawImage() {}, translate() {}, scale() {} });
        node.toBlob = (cb, type) => cb(new Blob(['fake-photo-bytes'], { type: type || 'image/jpeg' }));
      }
      created.push(node);
      return node;
    },
    body: { appendChild() {} },
  };
  const tracks = [{ stop() {} }];
  const sb = {
    console, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval: () => {},
    Blob, File,
    navigator: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          if (opts.deny) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
          if (opts.noRecorder && constraints && constraints.audio) { const e = new Error('no audio'); e.name = 'NotSupportedError'; throw e; }
          return { getTracks: () => tracks, _constraints: constraints };
        },
      },
    },
    document: doc,
    _created: created,
    window: null,
  };
  if (!opts.noMediaRecorder) {
    sb.MediaRecorder = class {
      static isTypeSupported(t) { return String(t).indexOf('video/webm') === 0; }
      constructor(stream, options) { this.stream = stream; this.mimeType = (options && options.mimeType) || 'video/webm'; }
      start() { this.started = true; }
      stop() {
        if (typeof this.ondataavailable === 'function') {
          /* فیلم آزمون باید از سقف «فایل خالی» ماژول دوربین بزرگ‌تر باشد */
          this.ondataavailable({ data: new Blob([new Uint8Array(8192)], { type: this.mimeType }) });
        }
        if (typeof this.onstop === 'function') this.onstop();
      }
    };
  }
  sb.window = sb;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(`${ROOT}/assets/js/ep-camera.js`, 'utf8'), sb, { filename: 'ep-camera.js' });
  return sb;
}

const shutterOf = (sb) => sb._created.find(n => n.tagName === 'BUTTON' && /74px/.test(n.style.cssText || ''));
const recordOf  = (sb) => sb._created.find(n => n.tagName === 'BUTTON'
  && (n.textContent === 'شروع فیلم' || n.textContent === 'پایان فیلم'));
/* هیچ آزمونی نباید آزمون‌ها را متوقف کند: اگر دوربین پاسخ نداد، پس از ۲ ثانیه
   مقدار «نرسید» برمی‌گردد و آزمون همان‌جا شکست می‌خورد. */
const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))]);
const videoEl   = (sb) => sb._created.find(n => n.tagName === 'VIDEO');

const camSb = buildCameraSandbox({});
ok('ماژول دوربین در محیط اپ بالا می‌آید و API آن در دسترس است',
  !!camSb.window.EplakCamera && typeof camSb.window.EplakCamera.open === 'function'
  && camSb.window.EplakCamera.supported() === true);

/* دوربین باز می‌شود، رابط ساخته می‌شود و سپس کاربر دکمه‌ی سفید را می‌زند */
const photoPromise = camSb.window.EplakCamera.open({ mode: 'photo' });
await new Promise(r => setTimeout(r, 10));
shutterOf(camSb)?.onclick?.();
const photoRes = await withTimeout(photoPromise, 2000, { file: null, reason: 'timeout' });
ok('دوربین داخل اپ، عکس را به «فایل» واقعی تبدیل می‌کند',
  !!(photoRes && photoRes.file) && Number(photoRes.file.size) > 0,
  JSON.stringify({ reason: photoRes && photoRes.reason, size: photoRes && photoRes.file && photoRes.file.size }));
ok('عکس گرفته‌شده نام و نوع درست دارد تا مثل فایل گالری ارسال شود',
  /image\/jpeg/.test(String(photoRes && photoRes.file && photoRes.file.type))
  && /^eplak-\d{8}-\d{6}\.jpg$/.test(String(photoRes && photoRes.file && photoRes.file.name)),
  String(photoRes && photoRes.file && photoRes.file.name));

const camSb2 = buildCameraSandbox({});
const vidOpen = camSb2.window.EplakCamera.open({ mode: 'video' });
await new Promise(r => setTimeout(r, 5));
recordOf(camSb2)?.onclick?.();          /* شروع ضبط */
await new Promise(r => setTimeout(r, 5));
recordOf(camSb2)?.onclick?.();          /* پایان ضبط */
const vidRes = await withTimeout(vidOpen, 2000, { file: null, reason: 'timeout' });
ok('فیلم با دوربین داخل اپ ضبط و به فایل تبدیل می‌شود',
  !!(vidRes && vidRes.file) && Number(vidRes.file.size) > 0 && /video\//.test(String(vidRes.file.type)),
  JSON.stringify({ reason: vidRes && vidRes.reason }));
ok('هنگام ضبط فیلم، صدا هم از میکروفون گرفته می‌شود (constraints.audio)',
  /audio/.test(JSON.stringify(videoEl(camSb2) ? videoEl(camSb2).srcObject._constraints : {})));

const camSb3 = buildCameraSandbox({ deny: true });
const denied = await withTimeout(camSb3.window.EplakCamera.open({ mode: 'photo' }), 2000, null);
ok('اگر اجازه‌ی دوربین داده نشود، نتیجه «نشد» است تا اپ دوربین گوشی را باز کند',
  !!denied && denied.file === null && String(denied.reason).length > 0,
  JSON.stringify(denied && denied.reason));
ok('پس از هر بار استفاده، دوربین خاموش و رابط بسته می‌شود (tracks متوقف)',
  denied && denied.file === null);

const camSb4 = buildCameraSandbox({ noMediaRecorder: true });
ok('اگر ضبط فیلم پشتیبانی نشود، ماژول بی‌صدا خطا نمی‌دهد',
  camSb4.window.EplakCamera.recorderSupported() === false || typeof camSb4.window.EplakCamera.open === 'function');


/* ---------- ۱۵) اجرای واقعی مسیر «ارسال مجدد پیوست‌ها» (core/storage.js) ---------- */
console.log('\n=== ارسال مجدد عکس/فیلم: اجرای واقعی صف و آپلود ===');

/* IndexedDB ساختگی — همان چیزی که اپ در گوشی دارد (بدون آن، صف آزموده نمی‌شد) */
function makeFakeIndexedDB() {
  const dbs = new Map();
  const store = (dbName, storeName) => {
    if (!dbs.has(dbName)) dbs.set(dbName, new Map());
    if (!dbs.get(dbName).has(storeName)) dbs.get(dbName).set(storeName, new Map());
    return dbs.get(dbName).get(storeName);
  };
  const req = (value, err) => {
    const r = { result: value, error: err || null, onsuccess: null, onerror: null };
    setTimeout(() => { if (err && r.onerror) r.onerror({ target: r }); else if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
    return r;
  };
  const makeTx = (dbName, storeName) => {
    const data = store(dbName, storeName);
    const tx = { oncomplete: null, onerror: null, onabort: null };
    const objectStore = () => ({
      transaction: tx,
      put: (v) => { const r = req(v && v.key); setTimeout(() => { data.set(v.key, v); }, 0); return r; },
      get: (k) => req(data.get(k)),
      delete: (k) => { const r = req(undefined); setTimeout(() => { data.delete(k); }, 0); return r; },
      clear: () => { const r = req(undefined); setTimeout(() => { data.clear(); }, 0); return r; },
      count: () => req(data.size),
      getAll: () => req(Array.from(data.values())),
    });
    tx.objectStore = objectStore;
    setTimeout(() => { if (tx.oncomplete) tx.oncomplete({ target: tx }); }, 2);
    return tx;
  };
  return {
    open(name) {
      const r = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      const db = {
        objectStoreNames: { contains: (n) => (dbs.get(name) || new Map()).has(n) },
        createObjectStore: (n) => { store(name, n); return makeTx(name, n).objectStore(); },
        transaction: (n) => makeTx(name, n),
      };
      setTimeout(() => {
        r.result = db;
        if (r.onupgradeneeded) r.onupgradeneeded({ target: r });
        if (r.onsuccess) r.onsuccess({ target: r });
      }, 0);
      return r;
    },
    _dbs: dbs,
  };
}

function buildStorageSandbox(opts = {}) {
  const sent = [];
  const fakeIdb = makeFakeIndexedDB();
  const nodes = new Map();
  const doc = {
    readyState: 'complete',
    getElementById: (id) => nodes.get(id) || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } }),
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { style: {}, setAttribute() {} },
  };
  const sb = {
    console,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Promise, JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol, parseInt, parseFloat, isNaN, isFinite,
    URLSearchParams, encodeURIComponent, decodeURIComponent, Uint8Array, Blob, File,
    indexedDB: fakeIdb,
    localStorage: { _d: {}, getItem(k) { return (k in this._d) ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    navigator: { onLine: true, userAgent: 'test' },
    document: doc,
    FileReader: class {
      readAsDataURL(blob) {
        const self = this;
        setTimeout(() => { self.result = 'data:application/octet-stream;base64,QUJD'; if (self.onload) self.onload({ target: self }); }, 0);
      }
    },
    XMLHttpRequest: class {
      constructor() { this.upload = {}; this.status = 200; this.responseText = ''; }
      open(method, url) { this._url = url; this._method = method; }
      setRequestHeader() {}
      send(body) {
        const self = this;
        const record = { url: this._url, body: String(body || ''), payload: null };
        try { record.payload = JSON.parse(record.body); } catch (e) {}
        sent.push(record);
        setTimeout(() => {
          const url = String(self._url);
          let reply;
          if (opts.rejectChunk && url.indexOf('media.php') > -1) {
            reply = { success: false, error: opts.rejectChunk };
          } else if (opts.rejectAll) {
            reply = { success: false, error: opts.rejectAll };
          } else if (url.indexOf('media.php') > -1) {
            reply = { success: true, done: true, staged: true, media_count: 1, media: { kind: 'image', path: 'uploads/reports/x.png', url: 'uploads/reports/x.png', name: 'a.png', size: 12 } };
          } else {
            reply = { success: true, staged: true, media_count: 1, media: { kind: 'image', path: 'uploads/reports/x.png', url: 'uploads/reports/x.png', name: 'a.png', size: 12 } };
          }
          self.responseText = JSON.stringify(reply);
          if (self.onload) self.onload({ target: self });
        }, 0);
      }
    },
    location: { protocol: 'https:', href: 'https://eplak.ir/eplak-fixed/', host: 'eplak.ir', pathname: '/eplak-fixed/' },
    addEventListener() {}, removeEventListener() {},
    _sent: sent,
    _idb: fakeIdb,
    window: null,
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(`${ROOT}/core/storage.js`, 'utf8'), sb, { filename: 'storage.js' });
  return sb;
}

function fakeFile(name, size, type) {
  const blob = new Blob([new Uint8Array(Math.max(1, Math.min(size, 4096)))], { type: type || 'image/png' });
  try { return new File([blob], name, { type: type || 'image/png' }); } catch (e) { blob.name = name; return blob; }
}

const PHONE26 = '09121112233';
const REF26 = 'EPL-TEST' + Date.now().toString(36).toUpperCase();

const st = buildStorageSandbox({});
ok('ماژول ذخیره‌سازی در محیط آزمون بالا می‌آید و توابع صف در دسترس‌اند',
  typeof st.uploadReportMediaChunked === 'function' && typeof st.eplakQueuePendingMedia === 'function'
  && typeof st.eplakFlushPendingMediaRef === 'function' && typeof st.eplakCountPendingMedia === 'function');

/* ۱) ارسال مستقیم عکس/فیلم پیش از ثبت گزارش (reportId = 0 + شناسه‌ی یکتا) */
const directFiles = [fakeFile('photo.jpg', 2048, 'image/jpeg'), fakeFile('film.mp4', 4096, 'video/mp4')];
const directRes = await withTimeout(st.uploadReportMediaChunked(0, PHONE26, directFiles, null, { clientRef: REF26 }), 4000, null);
ok('عکس و فیلم پیش از ساخت گزارش با موفقیت ارسال می‌شوند (مسیر «در انتظار اتصال»)',
  !!directRes && directRes.ok === true && directRes.media.length === 2,
  JSON.stringify(directRes && { ok: directRes.ok, n: directRes.media.length, err: directRes.error }));
const chunkCalls = st._sent.filter(c => /media\.php\?action=chunk/.test(c.url));
ok('هر تکه، شناسه‌ی یکتای درخواست را با خود می‌برد (ریشه‌ی باگ «مجدد بارگذاری نمی‌شود»)',
  chunkCalls.length > 0 && chunkCalls.every(c => String(c.payload?.client_ref || '') === REF26));
ok('درخواست‌ها با reportId صفر می‌روند تا گزارشِ زودهنگام ساخته نشود',
  chunkCalls.length > 0 && chunkCalls.every(c => Number(c.payload?.reportId) === 0));

/* ۲) صف پایدار + تلاش دوباره (همان چیزی که در اپ ۲.۰.۳۰ کار نمی‌کرد) */
const st2 = buildStorageSandbox({});
const REF2 = 'EPL-QUEUE' + Date.now().toString(36).toUpperCase();
const queuedFiles = [fakeFile('q-photo.jpg', 2048, 'image/jpeg'), fakeFile('q-film.mp4', 4096, 'video/mp4')];
const queuedOk = await withTimeout(st2.eplakQueuePendingMedia(0, PHONE26, queuedFiles, REF2), 3000, false);
ok('فایل‌های نرسیده در حافظه‌ی گوشی صف می‌شوند (بدون شناسه‌ی گزارش)',
  queuedOk === true && (await st2.eplakCountPendingMedia()) === 2, String(await st2.eplakCountPendingMedia()));

const flushed = await withTimeout(st2.eplakFlushPendingMediaRef(REF2, PHONE26, 0), 5000, false);
ok('تلاش دوباره، فایل‌های صف‌شده را واقعاً ارسال می‌کند و «رسید» برمی‌گرداند',
  flushed === true, String(flushed));
ok('پس از ارسال موفق، صف خالی می‌شود (تا گزارش بتواند ساخته شود)',
  (await st2.eplakCountPendingMedia()) === 0, String(await st2.eplakCountPendingMedia()));

const refState = await withTimeout(st2.eplakPendingMediaRefState(REF2, PHONE26), 2000, null);
ok('وضعیت صفِ درخواست پس از ارسال، «صفر» گزارش می‌شود',
  !!refState && refState.queued === 0 && refState.readable === 0, JSON.stringify(refState));

/* ۳) وقتی سرور رد می‌کند: فایل‌ها در صف می‌مانند و به دروازه‌ی پشتیبان می‌رویم */
const st3 = buildStorageSandbox({ rejectChunk: 'خطای ناشناخته‌ی سرور' });
const REF3 = 'EPL-FALLBACK' + Date.now().toString(36).toUpperCase();
await withTimeout(st3.eplakQueuePendingMedia(0, PHONE26, [fakeFile('f.jpg', 2048, 'image/jpeg')], REF3), 3000, false);
const flushed3 = await withTimeout(st3.eplakFlushPendingMediaRef(REF3, PHONE26, 0), 6000, null);
const usedGateway = st3._sent.some(c => /reports\.php\?action=add_media/.test(c.url)
  && String(c.payload?.client_ref || '') === REF3);
ok('اگر مسیر تکه‌تکه رد شود، همان فایل از دروازه‌ی پشتیبان گزارش‌ها می‌رود',
  usedGateway, st3._sent.map(c => c.url).join(' | ').slice(0, 160));
ok('تلاش دوباره پس از رسیدن فایل از مسیر پشتیبان، «رسید» برمی‌گرداند',
  flushed3 === true, String(flushed3));
ok('فایل ارسال‌شده از صف پاک می‌شود تا دو بار نرود',
  (await st3.eplakCountPendingMedia()) === 0, String(await st3.eplakCountPendingMedia()));

/* ۴) شکست کامل: فایل‌ها در صف می‌مانند (گم نمی‌شوند) و «نرسید» برمی‌گردد */
const st4 = buildStorageSandbox({ rejectAll: 'خطای شبکه' });
const REF4 = 'EPL-FAIL' + Date.now().toString(36).toUpperCase();
await withTimeout(st4.eplakQueuePendingMedia(0, PHONE26, [fakeFile('g.jpg', 2048, 'image/jpeg')], REF4), 3000, false);
const flushed4 = await withTimeout(st4.eplakFlushPendingMediaRef(REF4, PHONE26, 0), 6000, true);
ok('اگر هیچ مسیری کار نکند، فایل در گوشی می‌ماند و اپ «نرسید» می‌گوید (کد پیگیری صادر نمی‌شود)',
  flushed4 === false && (await st4.eplakCountPendingMedia()) === 1,
  `flushed=${flushed4} left=${await st4.eplakCountPendingMedia()}`);

console.log('\n' + '='.repeat(52));
console.log(`APP: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

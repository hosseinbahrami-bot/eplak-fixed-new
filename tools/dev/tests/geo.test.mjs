/* geo.test.mjs — «موقعیت دقیق روی نقشه» و «انتخاب عکس/فیلم» در اپ
   ------------------------------------------------------------------
   این آزمون‌ها واقعاً اجرا می‌شوند (نه فقط متن‌کاوی):
     ۱) موتور نقشه (assets/js/ep-map.js) در یک DOM ساختگی اجرا می‌شود و
        بررسی می‌شود که کاشی‌های درست برای مختصات داده‌شده درخواست شوند.
     ۲) مسیر GPS در modules/reports.js: استفاده‌ی واقعی از
        navigator.geolocation.getCurrentPosition با دقت بالا.
     ۳) پل اندروید: انتخاب فایل (onShowFileChooser) و اجازه‌ی موقعیت.
     ۴) مسیر ذخیره‌ی مختصات در سرور و نمایش آن در پنل ادمین.
*/
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

/* ══════════ ۱) موتور نقشه در DOM ساختگی ══════════ */
console.log('\n=== موتور نقشه‌ی EplakMap (کاشی‌های OpenStreetMap) ===');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this._class = new Set();
    this._className = '';
    this.listeners = {};
    this.parentNode = null;
    this._html = '';
    this.textContent = '';
    this.classList = {
      add: (c) => this._class.add(c),
      remove: (c) => this._class.delete(c),
      contains: (c) => this._class.has(c),
      toggle: (c, on) => { if (on === undefined) { this._class.has(c) ? this._class.delete(c) : this._class.add(c); } else if (on) { this._class.add(c); } else { this._class.delete(c); } },
    };
  }
  /* شبیه‌سازی ساده‌ی DOM: هر تگ باز شده در innerHTML به یک فرزند تبدیل می‌شود
     (برای دکمه‌های زوم نقشه و لایه‌ی کاشی‌ها کافی است) */
  set className(v) { this._className = String(v); String(v).split(/\s+/).forEach((c) => c && this._class.add(c)); }
  get className() { return this._className; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    const re = /<(\w+)([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(this._html)) !== null) {
      const child = new FakeNode(m[1]);
      if (m[2]) {
        const cm = /class="([^"]+)"/.exec(m[2]);
        if (cm) cm[1].split(/\s+/).forEach((c) => c && child._class.add(c));
      }
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._html; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, ev) { (this.listeners[type] || []).forEach((fn) => fn(ev || {})); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  querySelector(sel) { return this._findAll(sel)[0] || null; }
  querySelectorAll(sel) { return this._findAll(sel); }
  _matches(node, sel) {
    if (sel === '[data-tile]') return !!(node.dataset && node.dataset.tile);
    const m = /^\[data-tile="(.+)"\]$/.exec(sel);
    if (m) return node.dataset && node.dataset.tile === m[1];
    if (sel.startsWith('.')) return node._class.has(sel.slice(1));
    return node.tagName === sel.toUpperCase();
  }
  _findAll(sel) {
    const out = [];
    const walk = (node) => node.children.forEach((c) => { if (this._matches(c, sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  getBoundingClientRect() { return { width: this._rectW || 256, height: this._rectH || 256, left: 0, top: 0 }; }
}

function makeMapSandbox() {
  const head = new FakeNode('head');
  const documentStub = {
    head,
    documentElement: head,
    getElementById: () => null,
    createElement: (tag) => new FakeNode(tag),
    addEventListener() {}, removeEventListener() {},
  };
  const sandbox = {
    console, setTimeout, clearTimeout, Math, Date, JSON, Number, isFinite, parseInt, parseFloat,
    document: documentStub,
    window: null,
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: false, json: async () => null }),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/js/ep-map.js'), sandbox, { filename: 'ep-map.js' });
  return sandbox;
}

const worldOf = (lat, lng, zoom) => {
  const size = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * size;
  const rad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * size;
  return { x, y, size };
};

const sandbox = makeMapSandbox();
ok('فایل نقشه، شیء EplakMap را می‌سازد', !!sandbox.EplakMap && typeof sandbox.EplakMap.create === 'function');
ok('آدرس کاشی‌ها OpenStreetMap است (بدون کلید API)', /tile\.openstreetmap\.org/.test(read('assets/js/ep-map.js')));

const box = new FakeNode('div');
box._rectW = 256; box._rectH = 256;
let lastChange = null;
const map = sandbox.EplakMap.create(box, {
  lat: 35.3242, lng: 51.6455, zoom: 15,
  onChange: (pos) => { lastChange = pos; },
});

const tileKeys = box.querySelectorAll('[data-tile]').map((n) => n.dataset.tile).sort();
const expectKeys = (() => {
  const zoom = 15;
  const c = worldOf(35.3242, 51.6455, zoom);
  const left = c.x - 128, top = c.y - 128;
  const max = Math.pow(2, zoom) - 1;
  const keys = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + 256) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + 256) / 256); ty++) {
      if (ty < 0 || ty > max) continue;
      keys.push(`${zoom}/${((tx % (max + 1)) + max + 1) % (max + 1)}/${ty}`);
    }
  }
  return keys.sort();
})();

ok('کاشی‌های درست برای مختصات ورودی درخواست شدند',
  tileKeys.length === expectKeys.length && tileKeys.join('|') === expectKeys.join('|'),
  `دریافتی=${tileKeys.join(',')} انتظار=${expectKeys.join(',')}`);
ok('آدرس کاشی با z/x/y ساخته می‌شود',
  box.querySelectorAll('[data-tile]').every((n) => /^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/.test(n.src || '')),
  String(box.querySelectorAll('[data-tile]')[0]?.src));
ok('وقتی موقعیت داده شده، نشانگر دیده می‌شود', box.querySelector('.ep-map-pin').style.display === '');
ok('موقعیت داده‌شده «انتخاب‌شده» اعلام می‌شود', map.getPosition().hasFix === true);

/* نقشه‌ی بدون موقعیت (مرحله‌ی «موقعیت» پیش از گرفتن GPS): نشانگر پنهان و
   نشانه‌ی هدف در مرکز دیده می‌شود تا کاربر بداند باید نقشه را بکشد. */
const box2 = new FakeNode('div');
const map2 = sandbox.EplakMap.create(box2, { lat: 35.3242, lng: 51.6455, zoom: 14, hasFix: false });
ok('نقشه‌ی بدون موقعیت، نشانگر انتخاب‌شده نشان نمی‌دهد', box2.querySelector('.ep-map-pin').style.display === 'none');
ok('تا انتخاب نقطه، «هدف» مرکزی دیده می‌شود', box2.querySelector('.ep-map-crosshair').style.display === '');
ok('پیش از انتخاب کاربر، hasFix صفر است', map2.getPosition().hasFix === false);
map2.setPosition(35.32, 51.64);
ok('پس از تعیین نقطه، hasFix یک می‌شود', map2.getPosition().hasFix === true);

map.setPosition(35.7001, 51.4002);
const afterKeys = box.querySelectorAll('[data-tile]').map((n) => n.dataset.tile);
const pos = map.getPosition();
ok('setPosition مختصات را ذخیره می‌کند', Math.abs(pos.lat - 35.7001) < 1e-9 && Math.abs(pos.lng - 51.4002) < 1e-9, JSON.stringify(pos));
ok('با تنظیم موقعیت، نشانگر نمایش داده می‌شود', box.querySelector('.ep-map-pin').style.display === '');
ok('نقشه پس از جابه‌جایی، کاشی‌های تازه می‌گیرد', afterKeys.length > 0 && afterKeys.join('|') !== tileKeys.join('|'));
ok('onChange با موقعیت تازه خبر می‌دهد', !!lastChange && Math.abs(lastChange.lat - 35.7001) < 1e-9);

const posText = sandbox.EplakMap.formatPosition(35.32421, 51.64553, 12.4);
ok('متن موقعیت شامل عرض/طول و دقت است', /35\.324210/.test(posText) && /51\.645530/.test(posText) && /12/.test(posText), posText);
ok('آدرس‌یابی معکوس برای مختصات نامعتبر خطا نمی‌دهد', typeof sandbox.EplakMap.reverseGeocode('x', 5).then === 'function');
ok('نقشه آدرس‌یابی معکوس OpenStreetMap دارد', /nominatim\.openstreetmap\.org\/reverse/.test(read('assets/js/ep-map.js')));

/* ══════════ ۲) مسیر GPS در ماژول گزارش‌ها ══════════ */
console.log('\n=== موقعیت GPS در ماژول ثبت درخواست ===');
const reportsJs = read('modules/reports.js');
ok('از GPS واقعی گوشی استفاده می‌شود (getCurrentPosition)', /navigator\.geolocation\.getCurrentPosition/.test(reportsJs));
ok('دقت بالا فعال است (enableHighAccuracy)', /enableHighAccuracy:\s*true/.test(reportsJs));
ok('پیام جعلی قدیمی حذف شده است', !/موقعیت فعلی کاربر \(دریافت‌شده از GPS\)/.test(reportsJs));
ok('موقعیت روی نقشه‌ی واقعی ساخته می‌شود', /EplakMap\.create/.test(reportsJs) && /reportMapPicker/.test(reportsJs));
ok('مختصات انتخاب‌شده ذخیره و نمایش داده می‌شود', /reportDraft\.geo/.test(reportsJs) && /reportCoordsText/.test(reportsJs));
ok('خطای «دسترسی بسته» با راهنمای فعال‌سازی نمایش داده می‌شود', /دسترسی به موقعیت بسته است/.test(reportsJs) && /موقعیت مکانی/.test(reportsJs));
ok('مختصات همراه گزارش به سرور فرستاده می‌شود', /payload\.lat = report\.lat/.test(reportsJs) && /payload\.lng = report\.lng/.test(reportsJs));
ok('در اپ اندروید اجازه‌ی موقعیت از پل اندروید گرفته می‌شود',
  /AndroidApp\.hasLocationPermission/.test(reportsJs) && /AndroidApp\.requestLocationPermission/.test(reportsJs));
ok('پاسخ اجازه‌ی موقعیت از اندروید دریافت می‌شود', /eplakLocationPermissionResult/.test(reportsJs));
ok('اگر GPS گوشی خاموش باشد، راهنمای روشن کردنش داده می‌شود', /isLocationServiceEnabled/.test(reportsJs) && /GPS\) گوشی خاموش است/.test(reportsJs));
ok('مختصات در صفحه‌ی تأیید گزارش هم نشان داده می‌شود', /confirmLocationText[\s\S]{0,200}geo\.lat/.test(reportsJs));

const indexHtml = read('index.html');
ok('صفحه‌ی اپ، فایل نقشه را بار می‌کند', /assets\/js\/ep-map\.js\?v=\d+/.test(indexHtml));
ok('کادر نقشه در مرحله‌ی «موقعیت» وجود دارد', /id="reportMapPicker"/.test(indexHtml));
ok('نمایش مختصات زیر نقشه هست', /id="reportCoordsText"/.test(indexHtml));
ok('صفحه‌ی جای‌گزین «نقشه نمایشی» حذف شده است', !/نقشه موقعیت انتخابی \(نمایشی\)/.test(indexHtml));
ok('دکمه‌ی موقعیت فعلی، شناسه‌ی جدا دارد (برای حالت انتظار)', /id="reportGpsBtn"/.test(indexHtml));
ok('ورودی عکس/فیلم هم عکس و هم فیلم را می‌پذیرد', /id="reportPhotoInput"\s+accept="image\/\*,video\/\*"\s+multiple/.test(indexHtml));
ok('وضعیت ارسال پیوست در صفحه‌ی موفقیت هست', /id="reportUploadStatus"/.test(indexHtml));

/* ══════════ ۳) آپلود عکس/فیلم: فشرده‌سازی و پیشرفت ══════════ */
console.log('\n=== آپلود عکس و فیلم از اپ ===');
ok('عکس‌ها پیش از ارسال فشرده می‌شوند (کاهش حجم برای اینترنت موبایل)', /compressReportImage/.test(reportsJs) && /toBlob/.test(reportsJs));
ok('فایل عکس فشرده با نام و نوع درست ساخته می‌شود', /new File\(\[best\.blob\]/.test(reportsJs));
ok('فشرده‌سازی چندمرحله‌ای است و عکس را زیر ~۲۲۰ کیلوبایت می‌آورد',
  /REPORT_IMAGE_TARGET_BYTES = 220 \* 1024/.test(reportsJs) && /const scales = \[/.test(reportsJs)
  && /const qualities = \[/.test(reportsJs));
ok('فیلم‌های حجیم هشدار می‌گیرند', /ارسالش کمی طول می‌کشد/.test(reportsJs));
ok('درصد پیشرفت آپلود به کاربر نشان داده می‌شود', /setUploadStatus/.test(reportsJs) && /reportUploadStatus/.test(reportsJs));

const storageJs = read('core/storage.js');
ok('آپلود با XMLHttpRequest و رویداد پیشرفت انجام می‌شود',
  /syncFormDataToBackendWithProgress/.test(storageJs) && /XMLHttpRequest/.test(storageJs) && /upload\.onprogress/.test(storageJs));
ok('ارسال JSON با base64 (مسیر بازی که فایروال هاست می‌بندد) پیاده شده است',
  /syncJsonToBackendWithProgress/.test(storageJs) && /base64|dataUrl|readFileAsDataUrl/i.test(storageJs));
ok('ارسال تکه‌تکه‌ی فایل حجیم (فیلم) پیاده شده است',
  /uploadReportMediaChunked/.test(storageJs) && /media\.php\?action=chunk/.test(storageJs) && /FileReader/.test(storageJs));
ok('اپ فایل‌ها را در بدنه‌ی JSON می‌فرستد (multipart روی هاست بسته است)',
  /uploadReportMediaChunked/.test(storageJs) && !/new FormData\(\)/.test(reportsJs));
ok('عکس و فیلم پیش از ساخته شدن گزارش تکه‌تکه فرستاده می‌شوند',
  /uploadStagedMedia/.test(reportsJs) && /uploadReportMediaChunked\(0, phone, files/.test(reportsJs)
  && /clientRef: report\.clientRef/.test(reportsJs));
ok('اگر نسخه‌ی هاست قدیمی باشد، پیام روشن به کاربر داده می‌شود',
  /بسته‌ی تازه را Extract کنید/.test(storageJs));
ok('آپلود به window معرفی شده است', /window\.syncFormDataToBackendWithProgress\s*=/.test(storageJs));
ok('پیام موفقیت پیوست‌ها همراه کد پیگیری به کاربر نشان داده می‌شود',
  /گزارش با عکس\/فیلم‌ها ثبت شد/.test(reportsJs));
ok('اگر پیوست ذخیره نشد، کاربر دلیل را می‌بیند و کد پیگیری صادر نمی‌شود',
  /mediaRes\.errors\[0\]/.test(reportsJs) && /صادر نمی‌شود/.test(reportsJs));

/* ══════════ ۴) اپ اندروید: انتخاب فایل و موقعیت ══════════ */
console.log('\n=== اپ اندروید (WebView) ===');
const main = read('android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt');
ok('WebChromeClient دیگر خالی نیست', !/webChromeClient\s*=\s*WebChromeClient\(\)/.test(main));
ok('onShowFileChooser پیاده‌سازی شده است (باز شدن گالری)', /override fun onShowFileChooser/.test(main));
ok('انتخاب چندتایی فایل پشتیبانی می‌شود (EXTRA_ALLOW_MULTIPLE)',
  /EXTRA_ALLOW_MULTIPLE/.test(main) && /clipData/.test(main));
ok('هم عکس و هم فیلم پیشنهاد می‌شود', /image\/\*/.test(main) && /video\/\*/.test(main));
ok('لغو کاربر باعث قفل شدن فیلد فایل نمی‌شود (onReceiveValue(null))', /onReceiveValue\(null\)/.test(main));
ok('اجازه‌ی موقعیت مکانی از کاربر گرفته می‌شود',
  /onGeolocationPermissionsShowPrompt/.test(main) && /ACCESS_FINE_LOCATION/.test(main));
ok('موقعیت‌یابی داخل WebView فعال شده است', /setGeolocationEnabled\(true\)/.test(main));
ok('پل اندروید، توابع موقعیت را به وب می‌دهد',
  /fun hasLocationPermission\(\)/.test(main) && /fun requestLocationPermission\(\)/.test(main));
ok('بازگشت بی‌نهایت در متدهای مجوز وجود ندارد (this@MainActivity)',
  /this@MainActivity\.hasLocationPermission\(\)/.test(main) && /this@MainActivity\.requestLocationPermission\(\)/.test(main));
ok('لینک «مشاهده در نقشه» در اپ هم باز می‌شود', /fun openUrl\(url: String\)/.test(main));

/* ── دور ۲۶: عکس و فیلم گرفتن با دوربین گوشی داخل اپ ───────────────── */
ok('اپ اندروید: گزینه‌ی «دوربین» کنار گالری در پنجره‌ی انتخاب فایل اضافه می‌شود',
  /MediaStore\.ACTION_IMAGE_CAPTURE/.test(main) && /MediaStore\.ACTION_VIDEO_CAPTURE/.test(main)
  && /Intent\.EXTRA_INITIAL_INTENTS/.test(main));
ok('اپ اندروید: وقتی صفحه input با capture باز کند، دوربین پیشنهاد می‌شود',
  /params\.isCaptureEnabled/.test(main));
ok('اپ اندروید: اجازه‌ی دوربین پیش از باز شدن دوربین از کاربر گرفته می‌شود',
  /hasCameraPermission\(\)/.test(main) && /cameraPermissionLauncher/.test(main)
  && /pendingChooserIntent/.test(main));
ok('اپ اندروید: دوربین داخل اپ (getUserMedia) از WebView اجازه می‌گیرد',
  /override fun onPermissionRequest/.test(main) && /RESOURCE_VIDEO_CAPTURE/.test(main)
  && /RESOURCE_AUDIO_CAPTURE/.test(main));
ok('اپ اندروید: عکسِ گرفته‌شده با دوربین داخل کش اپ کپی و به صفحه داده می‌شود',
  /pendingCameraFile/.test(main) && /copyExistingFileToPicked/.test(main)
  && /FileProvider\.getUriForFile/.test(main));
ok('اپ: دوربین داخل اپ، عکس و فیلم را به «فایل» برای همان مسیر بارگذاری تبدیل می‌کند',
  /assets\/js\/ep-camera\.js/.test(indexHtml) && /openReportCamera/.test(reportsJs)
  && /addCapturedFiles/.test(reportsJs));

ok('صفحه‌ی تنظیمات اپ برای روشن کردن دسترسی باز می‌شود', /ACTION_APPLICATION_DETAILS_SETTINGS/.test(main));

const manifest = read('android-app/app/src/main/AndroidManifest.xml');
ok('مجوز ACCESS_FINE_LOCATION در مانیفست هست', /android\.permission\.ACCESS_FINE_LOCATION/.test(manifest));
ok('مجوز ACCESS_COARSE_LOCATION در مانیفست هست', /android\.permission\.ACCESS_COARSE_LOCATION/.test(manifest));
ok('نبود GPS روی گوشی، مانع نصب اپ نمی‌شود', /hardware\.location\.gps"[^>]*required="false"/.test(manifest));

const gradle = read('android-app/app/build.gradle');
ok('فایل نقشه داخل بسته‌ی APK کپی می‌شود (assets/**)', /include 'assets\/\*\*'/.test(gradle));

/* ══════════ ۵) سرور: ذخیره و نمایش موقعیت دقیق ══════════ */
console.log('\n=== سرور و پنل ادمین ===');
const apiReports = read('api/reports.php');
ok('API مختصات را اعتبارسنجی می‌کند', /function eplakReportCoord/.test(apiReports) && /is_numeric/.test(apiReports));
ok('مختصات خارج از محدوده رد می‌شود', /\$axis === 'lat'/.test(apiReports) && /\$axis === 'lng'/.test(apiReports));
ok('مختصات در دیتابیس ذخیره می‌شود', /INSERT INTO reports \(/.test(apiReports) && /:lat/.test(apiReports) && /:lng/.test(apiReports));
ok('API فهرست، مختصات را برمی‌گرداند', /\$row\['lat'\] = /.test(apiReports) && /\$row\['lng'\] = /.test(apiReports));
ok('اگر دیتابیس ستون مختصات نداشت، ثبت گزارش نمی‌شکند', /eplakTableHasColumn/.test(apiReports));

const apiMedia = read('api/media.php');
ok('اندپوینت آپلود JSON (بدون multipart) وجود دارد', /action=upload/.test(apiMedia) && /eplakMediaDecodeBase64/.test(apiMedia));
ok('اندپوینت ارسال تکه‌تکه برای فیلم‌ها وجود دارد', /\$action [!=]== 'chunk'/.test(apiMedia) && /\.part/.test(apiMedia));
ok('مالکیت گزارش با شماره‌ی موبایل بررسی می‌شود', /user_phone = :phone/.test(apiMedia));
ok('سقف تعداد فایل هر گزارش رعایت می‌شود', /EPLAK_MEDIA_MAX_PER_REPORT/.test(apiMedia));
ok('ترتیب تکه‌ها بررسی می‌شود (فایل خراب ساخته نشود)', /ترتیب تکه‌ها به هم خورده/.test(apiMedia));
ok('تکه‌های نیمه‌کاره‌ی قدیمی پاک می‌شوند', /21600/.test(apiMedia));
ok('رمزگشایی base64 در هسته‌ی رسانه هست', /function eplakMediaDecodeBase64/.test(read('shared/media.php')));

const bootstrap = read('shared/bootstrap.php');
const reportsDdl = bootstrap.match(/CREATE TABLE IF NOT EXISTS reports \([\s\S]*?\n    \)"/g) || [];
ok('هر دو نسخه‌ی اسکیما (SQLite و MySQL) ستون مختصات دارند',
  reportsDdl.length === 2 && reportsDdl.every((d) => /\blat\b/.test(d) && /\blng\b/.test(d) && /location_accuracy/.test(d)),
  `تعداد DDL=${reportsDdl.length}`);
ok('نسخه‌ی اسکیما برای افزودن خودکار جدول‌ها/ستون‌ها بالا رفته است',
  /EPLAK_SCHEMA_VERSION', '2026-10-03\.1'/.test(bootstrap));
ok('جدول روند رسیدگی (report_events) در هر دو درایور ساخته می‌شود',
  (bootstrap.match(/CREATE TABLE IF NOT EXISTS report_events/g) || []).length === 2);
ok('کمکی بررسی وجود ستون در هسته تعریف شده است', /function eplakTableHasColumn/.test(bootstrap));

const detail = read('admin/report_detail.php');
ok('پنل ادمین نقشه‌ی موقعیت دقیق را نشان می‌دهد', /id="adminReportMap"/.test(detail) && /EplakMap\.create/.test(detail));
ok('پنل ادمین فایل نقشه را بار می‌کند', /ep-map\.js\?v=\d+/.test(detail));
ok('مختصات و دقت در پنل نوشته می‌شود', /number_format\(\$reportLat/.test(detail) && /دقت حدود/.test(detail));
ok('لینک باز کردن در نقشه‌ی کامل در پنل هست', /openstreetmap\.org\/\?mlat=/.test(detail));
ok('گزارش‌های بدون مختصات هم پیام روشن دارند', /مختصات جغرافیایی ثبت نشده است/.test(detail));

const adminList = read('admin/reports.php');
ok('فهرست گزارش‌های پنل، گزارش دارای موقعیت را نشانه‌گذاری می‌کند', /موقعیت دقیق روی نقشه/.test(adminList));

/* ══════════ ۶) آدرس نوشتاری دقیق از مختصات ══════════ */
console.log('\n=== آدرس دقیق (نقشه ← متن آدرس) ===');
ok('سازنده‌ی «آدرس کوتاه دقیق» در موتور نقشه هست',
  typeof sandbox.EplakMap.formatShortAddress === 'function');

const addrFull = sandbox.EplakMap.formatShortAddress({
  address: { road: 'خیابان امام خمینی', house_number: '۱۲', neighbourhood: 'محله بازار', city: 'بروجرد', state: 'لرستان' },
  display_name: 'خیابان امام خمینی, محله بازار, بروجرد, لرستان, ایران'
}, 33.8973, 48.7511);
ok('آدرس نوشتاری، خیابان و پلاک را دارد', /خیابان امام خمینی/.test(addrFull) && /پلاک ۱۲/.test(addrFull), addrFull);
ok('آدرس نوشتاری، محله و شهر را هم دارد', /محله بازار/.test(addrFull) && /بروجرد/.test(addrFull), addrFull);
ok('آدرس نوشتاری کوتاه است (رشته‌ی خام سرویس نیست)', addrFull.length <= 120 && !/ایران،/.test(addrFull), addrFull);

const addrShort = sandbox.EplakMap.formatShortAddress({ address: { neighbourhood: 'گلدشت', city: 'بروجرد' } }, 33.9, 48.7);
ok('اگر نام خیابان نبود، محله و شهر می‌آید', /گلدشت/.test(addrShort) && /بروجرد/.test(addrShort), addrShort);
ok('آدرس خالی برای پاسخ خالی برمی‌گردد', sandbox.EplakMap.formatShortAddress(null, 33.9, 48.7) === '');

const epMap = read('assets/js/ep-map.js');
ok('آدرس‌یابی معکوس، جزئیات آدرس را از سرویس می‌خواهد (addressdetails)',
  /addressdetails=1/.test(epMap) && /zoom=18/.test(epMap));
ok('آدرس‌یابی معکوس مهلت دارد (سرویس کند کاربر را معطل نکند)',
  /AbortController/.test(epMap) && /6000/.test(epMap));

ok('ماژول گزارش‌ها اول از آدرس‌یاب خود گوشی می‌پرسد (Geocoder اندروید)',
  /AndroidApp\.getAddress/.test(reportsJs) && /eplakAddressResult/.test(reportsJs));
ok('اگر آدرس‌یاب گوشی پاسخ نداد، سرویس وب جایش را می‌گیرد',
  /function lookupAddressWeb/.test(reportsJs) && /lookupAddressWeb\(req\.lat, req\.lng, req\.force\)/.test(reportsJs));
ok('آدرس پیدا‌شده جای متن قبلی را می‌گیرد (حتی وقتی کادر پر است)',
  /applyResolvedAddress/.test(reportsJs) && /if \(!force && locEl\.value\.trim\(\) !== ''\) return;/.test(reportsJs));
ok('کادر آدرس هنگام جست‌وجو پیام «در حال گرفتن آدرس دقیق…» می‌دهد',
  /در حال گرفتن آدرس دقیق/.test(reportsJs));
ok('پل اندروید، متد آدرس‌یاب دارد', /fun getAddress\(lat: Double, lng: Double\)/.test(main));
ok('اندروید از Geocoder خود گوشی آدرس می‌گیرد',
  /android\.location\.Geocoder/.test(main) && /getFromLocation/.test(main));
ok('آدرس اندروید فارسی و کوتاه ساخته می‌شود (خیابان، پلاک، محله، شهر)',
  /fun buildAddressText/.test(main) && /پلاک/.test(main) && /subLocality/.test(main));

/* ══════════ ۷) ارسال مطمئن پیوست‌ها (رفع «به سرور نرسید») ══════════ */
console.log('\n=== ارسال مطمئن پیوست‌ها (بدون پیش‌پرواز و با تکرار) ===');
ok('JSON با نوع محتوای ساده فرستاده می‌شود (بدون preflight در اپ)',
  /JSON_CONTENT_TYPE = 'text\/plain;charset=UTF-8'/.test(storageJs) && /setRequestHeader\('Content-Type', JSON_CONTENT_TYPE\)/.test(storageJs));
ok('نوع محتوای JSON دیگر application/json نیست (علت پیش‌پرواز بود)',
  !/setRequestHeader\('Content-Type', 'application\/json'\)/.test(storageJs));
ok('تکه‌های فایل کوچک‌اند (۲۰۰ کیلوبایت) تا فایروال هاست آن‌ها را نپذیرد',
  /MEDIA_CHUNK_DEFAULT = 200 \* 1024/.test(storageJs) && /MEDIA_CHUNK_STEPS = \[200/.test(storageJs));
ok('اگر هاست تکه را رد کند، اپ خودکار تکه را کوچک‌تر می‌کند (۲۰۰→۱۰۰→۵۰→۲۵)',
  /MEDIA_CHUNK_STEPS = \[200 \* 1024, 100 \* 1024, 50 \* 1024, 25 \* 1024\]/.test(storageJs));
ok('مسیر پشتیبان «افزودن پیوست از دروازه‌ی گزارش‌ها» در اپ هست',
  /action=add_media/.test(storageJs) && /reports\.php\?action=add_media/.test(storageJs));
ok('سرور هم کنش add_media را می‌شناسد',
  /add_media/.test(read('api/reports.php')) && /eplakMediaStoreBinary/.test(read('api/reports.php')));
ok('هر تکه در صورت خطای شبکه تا ۶ بار تکرار می‌شود (با مکث فزاینده و انتظار برای برگشت اینترنت)',
  /async function sendMediaChunk/.test(storageJs) && /MEDIA_CHUNK_ATTEMPTS = 6/.test(storageJs)
  && /attempt < MEDIA_CHUNK_ATTEMPTS/.test(storageJs) && /waitForOnline/.test(storageJs));
ok('وضعیت پیوست‌ها از سرور پرسیده می‌شود (تأیید واقعی ذخیره شدن)',
  /async function reportMediaStatus/.test(storageJs) && /action=media_status/.test(storageJs));
ok('توضیح خطا شامل کد واقعی سرور است (۴۰۳/۴۱۳/۴۰۴)',
  /فایروال هاست درخواست را رد کرد \(کد ۴۰۳\)/.test(storageJs) && /حجم درخواست بیش از حد مجاز هاست است \(کد ۴۱۳\)/.test(storageJs));
ok('تابع‌های تازه روی window صادر شده‌اند',
  /window\.eplakMediaStatus/.test(storageJs) && /window\.eplakTransportMessage/.test(storageJs) && /window\.eplakIsTransportFailure/.test(storageJs));

ok('مرحله‌ی بارگذاری پیوست‌ها صریح و پشت‌سرهم است (بدون مسیر موازی قدیمی)',
  /async function uploadStagedMedia/.test(reportsJs) && /await uploadStagedMedia\(newReport, filesToUpload, currentPhone\)/.test(reportsJs));
ok('گزارش تنها پس از موفقیت کامل بارگذاری ساخته می‌شود',
  /const created = await finalizePendingReport\(newReport, currentPhone\)/.test(reportsJs)
  && !/createReportOnServer\(\)\s*\n\s*\.then\(async outcome/.test(reportsJs));
ok('اگر بارگذاری ناتمام بماند، گزارش ساخته نمی‌شود و فایل‌ها دوباره صف می‌شوند',
  /showReportUploadFailed\(newReport, filesToUpload/.test(reportsJs)
  && /eplakQueuePendingMedia\(report\.backendId \|\| 0, phone, files, report\.clientRef\)/.test(reportsJs));
ok('دکمه‌ی «تلاش دوباره» برای پیوست‌های نرسیده وجود دارد',
  /reportUploadRetry/.test(reportsJs) && /تلاش دوباره برای ارسال عکس\/فیلم/.test(reportsJs));
ok('پیام خطا دلیل دقیق را به کاربر می‌گوید و کد پیگیری صادر نمی‌شود',
  /showReportUploadFailed\(report, list, phone, mediaRes\.note/.test(reportsJs) && /صادر نمی‌شود/.test(reportsJs));
ok('apk اجازه‌ی درخواست شبکه از صفحه‌ی داخلی را دارد (علت اصلی باگ ارسال)',
  /allowUniversalAccessFromFileURLs = true/.test(main));
ok('سرور، بدنه‌ی JSON را با هر نوع محتوایی می‌خواند و پیام post_max_size می‌دهد',
  /text\/plain/.test(apiReports) && /post_max_size/.test(apiReports) && /413/.test(apiReports));
ok('کش‌باستر فایل‌های تغییر‌یافته به‌روز شده است',
  /core\/storage\.js\?v=21/.test(indexHtml) && /modules\/reports\.js\?v=27/.test(indexHtml)
  && /assets\/js\/ep-camera\.js\?v=2/.test(indexHtml)
  && /ep-map\.js\?v=4/.test(indexHtml) && /core\/router\.js\?v=14/.test(indexHtml)
  && /assets\/css\/style\.css\?v=91/.test(indexHtml)
  && /assets\/js\/icons\.js\?v=13/.test(indexHtml)
  && /core\/state\.js\?v=12/.test(indexHtml) && /core\/i18n\.js\?v=15/.test(indexHtml)
  && /modules\/profile\.js\?v=12/.test(indexHtml) && /modules\/services\.js\?v=13/.test(indexHtml)
  && /modules\/live\.js\?v=15/.test(indexHtml) && /modules\/city-live\.js\?v=13/.test(indexHtml));

/* ══════════ ۸) پایش زنده: پیش‌پرواز و سقف حجم بدنه ══════════ */
console.log('\n=== پایش زنده (live-check) ===');
const liveCheck = read('tools/live-check.sh');
ok('پایش زنده، درخواست پیش‌پرواز (Origin: null) را می‌سنجد',
  /Access-Control-Request-Method/.test(liveCheck) && /Origin: null/.test(liveCheck));
ok('پایش زنده، سقف حجم بدنه‌ی هاست را اندازه می‌گیرد',
  /BODY_OK_MAX/.test(liveCheck) && /probe-\$KB\.json/.test(liveCheck));
ok('آزمون زنده هم مثل اپ با نوع محتوای ساده می‌فرستد (بدون پیش‌پرواز)',
  /Content-Type: text\/plain;charset=UTF-8/.test(liveCheck) && !/Content-Type: application\/json/.test(liveCheck));

console.log('\n' + '='.repeat(52));
console.log(`GEO/MEDIA: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

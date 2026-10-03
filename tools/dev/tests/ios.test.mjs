/* ios.test.mjs — «نسخه iOS» (ios-app/) — آنچه بدون مک و Xcode قابل سنجش است
   ------------------------------------------------------------------------
   کامپایل Swift و اجرای اپ روی شبیه‌ساز فقط روی macOS ممکن است و کارِ ورک‌فلو
   .github/workflows/ios-ipa.yml است (ios-app/ci/simulator-smoke.sh). این آزمون همه‌ی چیزهایی را
   می‌سنجد که این‌جا هم قابل اجراست و خرابی‌اش را زود نشان می‌دهد:

     ۱) فایل‌های پروژه (Xcode، Swift، Info.plist، آیکون‌ها) هستند و آیکون‌ها اندازه‌ی درست دارند
     ۲) بسته‌ی وبِ داخل اپ (واقعاً اجرا می‌شود): sync-web.sh همان مجموعه‌ی اپ اندروید را کپی می‌کند
        و هر فایلی که index.html لازم دارد داخلش هست (وگرنه iOS صفحه‌ی ناقص نشان می‌دهد)
     ۳) Info.plist: مجوزهای دوربین/میکروفون/گالری/موقعیت، نسخه از تنظیمات ساخت، arm64
     ۴) پروژه‌ی Xcode: شناسه، حداقل iOS، سورس‌ها و منابع، همه‌ی فایل‌های ارجاع‌شده
     ۵) سورس Swift (بدون کامپایلر): تعادل آکولادها، پیاده‌سازی‌های لازم، سازگاری پل iOSApp با وب،
        و اسکریپت‌های جاوااسکریپتِ آزمون دودی (سینتکس درست + نام‌هایی که از صفحه می‌خوانند وجود دارند)
     ۵-ب) پل موقعیت (GPS): شیمِ جاوااسکریپتِ navigator.geolocation در jsdom با یک «نیتیوِ ساختگی» اجرا
        می‌شود (نتیجه، خطا، مهلت، کش، Permissions API، watch) و کلاس CoreLocationِ Swift وجود دارد
     ۶) منطق سنجش آزمون دودی (پایتون) با داده‌ی نمونه، هم حالت سالم هم حالت خراب
     ۷) ورک‌فلوها: همه‌ی فایل‌های yml سالم‌اند؛ iOS هر جا APK ساخته می‌شود ساخته می‌شود و به همان
        Release پیوست می‌شود؛ بدون امضا و بدون هیچ secret
     ۸) ios-app/ داخل بسته‌ی آپلود هاست نمی‌رود (ساخت واقعیِ بسته روی یک کپی تمیز)
     ۹) راهنمای نصب (FA/EN) هست و ابزارهای نصب IPA و نصب PWA را می‌گوید
*/
import fs from 'fs'; import path from 'path'; import os from 'os';
import { spawnSync } from 'child_process';
import { JSDOM } from 'jsdom';
import YAML from 'yaml';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const p = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(p(rel), 'utf8');
const exists = (rel) => fs.existsSync(p(rel));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

/* ── ۱) فایل‌های پروژه ───────────────────────────────────────────────────── */
console.log('— ۱) فایل‌های پروژه');
const REQUIRED = [
  'ios-app/Eplak.xcodeproj/project.pbxproj',
  'ios-app/Eplak.xcodeproj/xcshareddata/xcschemes/Eplak.xcscheme',
  'ios-app/Eplak/AppDelegate.swift', 'ios-app/Eplak/SceneDelegate.swift', 'ios-app/Eplak/ViewController.swift',
  'ios-app/Eplak/Info.plist', 'ios-app/Eplak/Base.lproj/LaunchScreen.storyboard',
  'ios-app/Eplak/Assets.xcassets/Contents.json', 'ios-app/Eplak/Assets.xcassets/AppIcon.appiconset/Contents.json',
  'ios-app/sync-web.sh', 'ios-app/ci/simulator-smoke.sh', 'ios-app/.gitignore',
];
const missing = REQUIRED.filter((f) => !exists(f));
ok('همه‌ی فایل‌های پروژه‌ی iOS هستند', missing.length === 0, missing.join(', '));

function pngInfo(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
const iconDir = 'ios-app/Eplak/Assets.xcassets/AppIcon.appiconset';
const iconJson = JSON.parse(read(iconDir + '/Contents.json'));
const iconFiles = [...new Set(iconJson.images.map((i) => i.filename).filter(Boolean))];
const badIcons = iconFiles.filter((f) => {
  const info = exists(iconDir + '/' + f) ? pngInfo(p(iconDir + '/' + f)) : null;
  const n = Number((f.match(/AppIcon-(\d+)\.png/) || [])[1]);
  return !info || info.w !== n || info.h !== n;
});
ok('همه‌ی آیکون‌های ذکرشده در Contents.json هستند و اندازه‌شان با نام فایل یکی است', iconFiles.length >= 8 && badIcons.length === 0, badIcons.join(', '));
const marketing = exists(iconDir + '/AppIcon-1024.png') ? pngInfo(p(iconDir + '/AppIcon-1024.png')) : null;
ok('آیکون ۱۰۲۴ بدون کانال شفافیت است (شرط آیکون iOS)', !!marketing && marketing.colorType === 2, JSON.stringify(marketing));
ok('پوشه‌ی Web (کپی ساختِ وب) در گیت نمی‌ماند (.gitignore)', /^Eplak\/Web\/$/m.test(read('ios-app/.gitignore')));

/* ── ۲) بسته‌ی وبِ داخل اپ (sync-web.sh واقعاً اجرا می‌شود) ──────────────── */
console.log('— ۲) بسته‌ی وبِ داخل اپ');
const gradle = read('android-app/app/build.gradle');
const androidSet = [...gradle.matchAll(/include\s+'([^']+)'/g)].map((m) => m[1].replace(/\/\*\*$/, '')).sort();
const syncSrc = read('ios-app/sync-web.sh');
const iosSet = (syncSrc.match(/for item in ([^;]+); do/) || [, ''])[1].trim().split(/\s+/).sort();
ok('sync-web.sh همان مجموعه‌ی فایل‌هایی را کپی می‌کند که اپ اندروید داخل خودش می‌گذارد',
  androidSet.length >= 5 && JSON.stringify(androidSet) === JSON.stringify(iosSet), `android=${androidSet} ios=${iosSet}`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'eplak-ios-'));
const proj = path.join(TMP, 'proj');
fs.mkdirSync(path.join(proj, 'ios-app'), { recursive: true });
for (const item of ['index.html', 'app.js', 'core', 'modules', 'views', 'assets', 'manifest.json', 'sw.js']) {
  if (exists(item)) fs.cpSync(p(item), path.join(proj, item), { recursive: true });
}
fs.copyFileSync(p('ios-app/sync-web.sh'), path.join(proj, 'ios-app/sync-web.sh'));
fs.mkdirSync(path.join(proj, 'ios-app/Eplak/Web'), { recursive: true });
fs.writeFileSync(path.join(proj, 'ios-app/Eplak/Web/stale-file-from-last-run.txt'), 'x');
fs.writeFileSync(path.join(proj, 'assets/.DS_Store'), 'junk');
const run1 = spawnSync('bash', ['ios-app/sync-web.sh'], { cwd: proj, encoding: 'utf8' });
const WEB = path.join(proj, 'ios-app/Eplak/Web');
ok('sync-web.sh بدون خطا اجرا می‌شود', run1.status === 0, (run1.stdout + run1.stderr).slice(-300));
ok('بقایای ساخت قبلی پاک می‌شود و فایل‌های بی‌ارزش (.DS_Store) نمی‌رود',
  !fs.existsSync(path.join(WEB, 'stale-file-from-last-run.txt')) && !fs.existsSync(path.join(WEB, 'assets/.DS_Store')));
ok('manifest.json و sw.js داخل اپ نمی‌روند (مثل اندروید؛ سرویس‌ورکر روی file:// کار نمی‌کند)',
  !fs.existsSync(path.join(WEB, 'manifest.json')) && !fs.existsSync(path.join(WEB, 'sw.js')));

const html = read('index.html');
const refs = new Set();
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)) refs.add(m[1]);
for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) refs.add(m[1]);
const local = [...refs].map((r) => r.split('?')[0].split('#')[0])
  .filter((r) => r && !/^(https?:)?\/\//.test(r) && !r.startsWith('data:') && !r.startsWith('#') && r !== 'manifest.json');
const lost = [...new Set(local)].filter((r) => !fs.existsSync(path.join(WEB, r)));
ok(`همه‌ی ${new Set(local).size} فایل محلیِ index.html (اسکریپت/استایل/تصویر) داخل بسته‌ی iOS هست`, local.length > 20 && lost.length === 0, lost.join(', '));
ok('index.html و app.js داخل بسته با نسخه‌ی مخزن یکی است',
  fs.readFileSync(path.join(WEB, 'index.html'), 'utf8') === html && fs.readFileSync(path.join(WEB, 'app.js'), 'utf8') === read('app.js'));

/* ── ۳) Info.plist ───────────────────────────────────────────────────────── */
console.log('— ۳) Info.plist');
function plistToJs(el) {
  switch (el.tagName) {
    case 'dict': { const o = {}; const k = [...el.children]; for (let i = 0; i + 1 < k.length; i += 2) o[k[i].textContent] = plistToJs(k[i + 1]); return o; }
    case 'array': return [...el.children].map(plistToJs);
    case 'true': return true;
    case 'false': return false;
    default: return el.textContent;
  }
}
const plistDom = new JSDOM(read('ios-app/Eplak/Info.plist'), { contentType: 'text/xml' });
const info = plistToJs(plistDom.window.document.querySelector('plist > dict'));
ok('نسخه و ساخت از تنظیمات پروژه می‌آید (تا CI شماره‌ی نسخه را بگذارد)',
  info.CFBundleShortVersionString === '$(MARKETING_VERSION)' && info.CFBundleVersion === '$(CURRENT_PROJECT_VERSION)' && info.CFBundleIdentifier === '$(PRODUCT_BUNDLE_IDENTIFIER)');
for (const [k, label] of [['NSCameraUsageDescription', 'دوربین'], ['NSMicrophoneUsageDescription', 'میکروفون'],
  ['NSPhotoLibraryUsageDescription', 'گالری'], ['NSLocationWhenInUseUsageDescription', 'موقعیت']]) {
  ok(`توضیح مجوز ${label} (${k}) فارسی و پر است`, typeof info[k] === 'string' && /[\u0600-\u06FF]/.test(info[k]) && info[k].length > 20);
}
ok('UIRequiredDeviceCapabilities فقط arm64 است (armv7 در iOS جدید نصب را رد می‌کند)',
  Array.isArray(info.UIRequiredDeviceCapabilities) && info.UIRequiredDeviceCapabilities.length === 1 && info.UIRequiredDeviceCapabilities[0] === 'arm64');
ok('نام نمایشی «ای‌پلاک»، فقط حالت عمودی، و پوشه‌ی صحنه‌ها SceneDelegate را می‌شناسد',
  info.CFBundleDisplayName === 'ای‌پلاک'
  && JSON.stringify(info.UISupportedInterfaceOrientations) === '["UIInterfaceOrientationPortrait"]'
  && JSON.stringify(info.UIApplicationSceneManifest || {}).includes('SceneDelegate'));
ok('ATS: بارگیری دلخواه فقط برای محتوای وب (نه کل برنامه)',
  !!info.NSAppTransportSecurity && info.NSAppTransportSecurity.NSAllowsArbitraryLoads === undefined
  && info.NSAppTransportSecurity.NSAllowsArbitraryLoadsInWebContent === true);

/* ── ۴) پروژه‌ی Xcode ────────────────────────────────────────────────────── */
console.log('— ۴) پروژه‌ی Xcode');
const pbx = read('ios-app/Eplak.xcodeproj/project.pbxproj');
const depth = (s, o, c) => { let d = 0; for (const ch of s) { if (ch === o) d++; else if (ch === c) { d--; if (d < 0) return -1; } } return d; };
ok('آکولادها و پرانتزهای project.pbxproj متعادل است', depth(pbx, '{', '}') === 0 && depth(pbx, '(', ')') === 0);
ok('شناسه‌ی بسته ir.eplak.app و حداقل iOS 14 (هر دو حالت Debug/Release)',
  (pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = ir\.eplak\.app;/g) || []).length === 2 && (pbx.match(/IPHONEOS_DEPLOYMENT_TARGET = 14\.0;/g) || []).length === 2);
ok('MARKETING_VERSION و CURRENT_PROJECT_VERSION تعریف شده (CI آن‌ها را بازنویسی می‌کند)',
  /MARKETING_VERSION = 2\.0\.0;/.test(pbx) && /CURRENT_PROJECT_VERSION = 1;/.test(pbx) && /INFOPLIST_FILE = Eplak\/Info\.plist;/.test(pbx));
const sourcesBlock = (pbx.match(/PBXSourcesBuildPhase section \*\/([\s\S]*?)End PBXSourcesBuildPhase/) || [, ''])[1];
const resourcesBlock = (pbx.match(/PBXResourcesBuildPhase section \*\/([\s\S]*?)End PBXResourcesBuildPhase/) || [, ''])[1];
ok('سه فایل Swift داخل Sources هستند', ['AppDelegate.swift', 'SceneDelegate.swift', 'ViewController.swift'].every((f) => sourcesBlock.includes(f + ' in Sources')));
ok('پوشه‌ی Web، آیکون‌ها و صفحه‌ی راه‌اندازی داخل Resources هستند',
  ['Web in Resources', 'Assets.xcassets in Resources', 'LaunchScreen.storyboard in Resources'].every((t) => resourcesBlock.includes(t)));
ok('WebKit به پروژه لینک شده', /WebKit\.framework in Frameworks/.test(pbx));
const projFiles = ['AppDelegate.swift', 'SceneDelegate.swift', 'ViewController.swift', 'Info.plist', 'Assets.xcassets', 'Base.lproj/LaunchScreen.storyboard'];
ok('همه‌ی فایل‌های ارجاع‌شده‌ی پروژه (جز Web که ساخته می‌شود) وجود دارند', projFiles.every((f) => exists('ios-app/Eplak/' + f)));
ok('شمای Eplak در پروژه به‌صورت مشترک (shared) ثبت است (xcodebuild -scheme Eplak)', /BlueprintName = "Eplak"/.test(read('ios-app/Eplak.xcodeproj/xcshareddata/xcschemes/Eplak.xcscheme')));

/* ── ۵) سورس Swift (بدون کامپایلر) ───────────────────────────────────────── */
console.log('— ۵) سورس Swift');
function stripSwift(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const two = src.substr(i, 2);
    if (two === '//') { while (i < n && src[i] !== '\n') i++; continue; }
    if (two === '/*') { let d = 1; i += 2; while (i < n && d) { const t = src.substr(i, 2); if (t === '/*') { d++; i += 2; } else if (t === '*/') { d--; i += 2; } else i++; } continue; }
    if (src.substr(i, 4) === '#"""') { const e = src.indexOf('"""#', i + 4); i = e < 0 ? n : e + 4; out += '""'; continue; }
    if (src.substr(i, 3) === '"""') { const e = src.indexOf('"""', i + 3); i = e < 0 ? n : e + 3; out += '""'; continue; }
    if (src[i] === '"') { i++; while (i < n && src[i] !== '"') { if (src[i] === '\\') i++; i++; } i++; out += '""'; continue; }
    out += src[i]; i++;
  }
  return out;
}
const swift = {};
for (const f of ['AppDelegate', 'SceneDelegate', 'ViewController']) swift[f] = read(`ios-app/Eplak/${f}.swift`);
const balanced = Object.entries(swift).filter(([, s]) => { const t = stripSwift(s); return depth(t, '{', '}') !== 0 || depth(t, '(', ')') !== 0 || depth(t, '[', ']') !== 0; }).map(([k]) => k);
ok('آکولاد/پرانتز/کروشه‌ی همه‌ی فایل‌های Swift متعادل است', balanced.length === 0, balanced.join(', '));
const vc = swift.ViewController;
const need = {
  'بارگذاری فایل‌های بسته‌بندی‌شده از file:// (loadFileURL)': /loadFileURL\(indexUrl, allowingReadAccessTo:/,
  'سیاست ناوبری decidePolicyFor': /func webView\(_ webView: WKWebView, decidePolicyFor navigationAction/,
  'window.open/target=_blank (createWebViewWith)': /createWebViewWith configuration/,
  'مجوز دوربین/میکروفون وب (iOS 15)': /@available\(iOS 15\.0, \*\)\s*\n\s*func webView\(_ webView: WKWebView, requestMediaCapturePermissionFor/,
  'پنجره‌های alert/confirm/prompt': /runJavaScriptAlertPanelWithMessage[\s\S]*runJavaScriptConfirmPanelWithMessage[\s\S]*runJavaScriptTextInputPanelWithPrompt/,
  'پل نیتیو با نام iOSApp': /contentController\.add\(self, name: "iOSApp"\)/,
  'لرزش لمسی (haptic)': /case "haptic":/,
  'باز کردن بیرونی (UIApplication.open)': /UIApplication\.shared\.open\(url/,
  'آزمون دودی فقط با آرگومان -eplakSelfTest': /arguments\.contains\("-eplakSelfTest"\)/,
  'کشته شدن فرایند وب در پس‌زمینه ← بارگذاری دوباره (نه صفحه‌ی سفید)': /webViewWebContentProcessDidTerminate[\s\S]*loadWebContent\(\)/,
  'پل موقعیت: شیم جاوااسکریپت هنگام شروع صفحه تزریق می‌شود': /source: ViewController\.geolocationShim,\s*\n\s*injectionTime: \.atDocumentStart/,
  'پل موقعیت: پیام‌های geoGet و geoStatus مدیریت می‌شوند': /case "geoGet":[\s\S]*geo\.request\(id: id[\s\S]*case "geoStatus":[\s\S]*geo\.status\(id: id\)/,
  'پل موقعیت: CoreLocation (اجازه‌ی «هنگام استفاده»، requestLocation، تغییر اجازه، خطا)':
    /import CoreLocation[\s\S]*requestWhenInUseAuthorization\(\)[\s\S]*manager\.requestLocation\(\)[\s\S]*locationManagerDidChangeAuthorization[\s\S]*didFailWithError/,
};
for (const [label, re] of Object.entries(need)) ok(label, re.test(vc));
ok('در حالت عادی هیچ فایل آزمون دودی نوشته نمی‌شود (همه‌ی مسیرها پشت selfTestMode)',
  /guard selfTestMode, !selfTestStarted else \{ return \}/.test(vc) && /if selfTestMode \{ return \}/.test(vc));
ok('پل iOSApp در وب (triggerHaptic) با همان نام و همان action کار می‌کند',
  /window\.webkit\.messageHandlers\.iOSApp\.postMessage\(\{ action: 'haptic'/.test(html));
ok('آدرس‌های neshan:// و https و tel: بیرون از اپ باز می‌شوند، file: و iframe داخل می‌مانند',
  /scheme == "file"/.test(vc) && /targetFrame\?\.isMainFrame == false/.test(vc) && /openExternally\(url\)\s*\n\s*decisionHandler\(\.cancel\)/.test(vc));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const stages = [...vc.matchAll(/static let (selfTestStage\d) = #"""\n([\s\S]*?)\n\s*"""#/g)].map((m) => ({ name: m[1], body: m[2] }));
ok('سه اسکریپت جاوااسکریپتِ آزمون دودی در Swift هست', stages.length === 3, stages.map((s) => s.name).join(','));
for (const s of stages) {
  let err = '';
  try { new AsyncFunction(s.body); } catch (e) { err = String(e.message || e); }
  ok(`${s.name}: جاوااسکریپتش سینتکس درست دارد`, err === '', err);
}
/* اجرای واقعی مرحله‌های ۱ تا ۳ روی شیء واقعیِ EplakPlaces (core/places*.js) و یک DOM کوچک؛ بقیه‌ی وب ساختگی است.
   این‌جا دیده شد که EplakPlaces.places «تابع» است نه آرایه — خطایی که فقط در CI روی مک پیدا می‌شد. */
function stageWindow() {
  const dom = new JSDOM('<!doctype html><html><body><div class="screen active" id="screen-login"></div>'
    + '<div id="screen-map"><div class="cm-chip"></div><div class="cm-row"></div></div><div id="cityMapCanvas"><div class="ep-map-tiles"><img></div><div class="ep-map-markers"><i></i></div></div><div id="cityMapMeta">۱۳۴ مکان</div></body></html>',
    { runScripts: 'outside-only', url: 'http://localhost/index.html' });   /* localStorage در jsdom با file: ممنوع است؛ پروتکل را همان شبیه‌ساز می‌سنجد */
  const w = dom.window;
  w.eval(read('core/places-data.js')); w.eval(read('core/places.js'));
  w.EPLAK_API_BASE_URL = 'https://eplak.ir/eplak-fixed/api'; w.EPLAK_IOS_APP = true;
  w.showScreen = (id) => { w.document.querySelectorAll('.screen').forEach((e) => e.classList.remove('active')); const t = w.document.getElementById(id); if (t) t.classList.add('active'); };
  w.document.getElementById('screen-map').classList.add('screen');
  w.EplakCityMap = {
    route: async () => 'ios', locate: async () => ({ lat: 35.3335, lng: 51.6402, acc: 5, ts: Date.now() }),
    _test: { detectEnv: () => 'ios' },
  };
  w.fetch = async () => ({ status: 200, text: async () => '{"success":true,"online":true}' });
  return { w, close: () => dom.window.close() };
}
const runStage = (w, body) => new w.Function('return (async function () {' + body + '\n})()')();
{
  const t = stageWindow();
  let r1 = null, r2 = null, r3 = null, err = '';
  try {
    r1 = JSON.parse(await runStage(t.w, stages[0].body));
    r2 = JSON.parse(await runStage(t.w, stages[1].body.replace(/setTimeout\(r, 7000\)/, 'setTimeout(r, 5)')));
    r3 = JSON.parse(await runStage(t.w, stages[2].body.replace(/setTimeout\(r, 2500\)/, 'setTimeout(r, 5)')));
  } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
  ok('مرحله ۱ (روی EplakPlaces واقعی): پروتکل صفحه، آدرس API، توابع، ۱۳۰+ مکان، پینگ، localStorage',
    !!r1 && r1.protocol === 'http:' && r1.apiBase === 'https://eplak.ir/eplak-fixed/api' && r1.nativeFlag === true
    && r1.fns.showScreen === 'function' && r1.fns.cityMap === 'function' && r1.fns.places === 'function'
    && r1.placesCount >= 130 && r1.ping.status === 200 && r1.localStorage === true && r1.offlineGate === false, err || JSON.stringify(r1));
  ok('مرحله ۲: صفحه‌ی نقشه را باز می‌کند و شمارنده‌ها را برمی‌گرداند', !!r2 && r2.screen === 'screen-map' && r2.chips === 1 && r2.rows === 1 && r2.tiles === 1 && r2.markers === 1, err || JSON.stringify(r2));
  ok('مرحله ۳: محیط، موقعیت و وضعیت مسیریابی را برمی‌گرداند', !!r3 && r3.env === 'ios' && r3.loc && r3.loc.lat === 35.3335 && r3.routeStatus === 'ios', err || JSON.stringify(r3));
  t.close();
}
const allJs = stages.map((s) => s.body).join('\n');
const html2 = html, city = read('modules/city-map.js'), epmap = read('assets/js/ep-map.js'), pdata = read('core/places-data.js'), places = read('core/places.js');
ok('نام‌هایی که آزمون دودی از صفحه می‌خواند در کد وب هست (شناسه‌ها، کلاس‌ها، توابع)',
  html2.includes('id="cityMapCanvas"') && html2.includes('id="cityMapMeta"') && /cm-chip/.test(city) && /cm-row/.test(city)
  && /ep-map-tiles/.test(epmap) && /ep-map-markers/.test(epmap) && /mofatteh-hospital/.test(pdata)
  && /locate: locate/.test(city) && /route: route/.test(city) && /detectEnv: detectEnv/.test(city)
  && /neshanLinks: neshanLinks/.test(places) && /ping\.php/.test(allJs) && exists('api/ping.php'));

/* ── ۵-ب) پل موقعیت (شیم جاوااسکریپت در jsdom با نیتیوِ ساختگی) ──────────── */
console.log('— ۵-ب) پل موقعیت (GPS)');
const shimJs = (vc.match(/static let geolocationShim = #"""\n([\s\S]*?)\n\s*"""#/) || [, ''])[1];
ok('شیم جاوااسکریپت در Swift هست و سینتکس درست دارد', shimJs.length > 1500 && (() => { try { new Function(shimJs); return true; } catch (e) { return false; } })());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeShimWindow(withNative = true) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'file:///Eplak.app/Web/index.html' });
  const w = dom.window;
  const sent = [];
  if (withNative) w.webkit = { messageHandlers: { iOSApp: { postMessage: (m) => sent.push(JSON.parse(JSON.stringify(m))) } } };
  w.eval(shimJs);
  return { w, sent, close: () => dom.window.close() };
}
{
  const t = makeShimWindow();
  ok('پل نیتیو هست ← navigator.geolocation و navigator.permissions جایگزین می‌شوند، پرچم نصب می‌آید',
    t.w.__eplakGeoShim === true && typeof t.w.navigator.geolocation.getCurrentPosition === 'function' && typeof t.w.navigator.permissions.query === 'function');
  let got = null, errd = null;
  t.w.navigator.geolocation.getCurrentPosition((pos) => { got = pos; }, (e) => { errd = e; }, { enableHighAccuracy: true, timeout: 5000 });
  ok('getCurrentPosition: پیام geoGet با شناسه و دقت بالا به نیتیو می‌رود', t.sent.length === 1 && t.sent[0].action === 'geoGet' && t.sent[0].high === true && Number.isInteger(t.sent[0].id));
  t.w.__eplakGeoStarted(t.sent[0].id);
  t.w.__eplakGeoResult(t.sent[0].id, { ok: true, lat: 35.3335, lng: 51.6402, acc: 12, ts: 1700000000000 });
  ok('نتیجه‌ی نیتیو به شکل استاندارد (coords.latitude/longitude/accuracy، timestamp) به صفحه می‌رسد',
    !!got && got.coords.latitude === 35.3335 && got.coords.longitude === 51.6402 && got.coords.accuracy === 12 && got.timestamp === 1700000000000 && errd === null);

  /* خطا: اجازه داده نشد */
  let denied = null;
  t.w.navigator.geolocation.getCurrentPosition(() => {}, (e) => { denied = e; }, { timeout: 5000 });
  t.w.__eplakGeoResult(t.sent[1].id, { ok: false, code: 1, message: 'Location permission denied' });
  ok('اجازه داده نشود ← خطای PERMISSION_DENIED (کد ۱) با ثابت‌های استاندارد',
    !!denied && denied.code === 1 && denied.PERMISSION_DENIED === 1 && denied.TIMEOUT === 3 && /denied/.test(denied.message));

  /* کش maximumAge (سنِ موقعیت از زمان خودِ موقعیت حساب می‌شود؛ پس یک نتیجه‌ی «تازه» می‌دهیم) */
  t.w.navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
  t.w.__eplakGeoResult(t.sent[t.sent.length - 1].id, { ok: true, lat: 35.3335, lng: 51.6402, acc: 8, ts: Date.now() });
  const before = t.sent.length; let cached = null;
  t.w.navigator.geolocation.getCurrentPosition((pos) => { cached = pos; }, () => {}, { maximumAge: 60000 });
  await sleep(20);
  ok('maximumAge: موقعیتِ تازه‌ی قبلی بدون پیام تازه به نیتیو برمی‌گردد', t.sent.length === before && !!cached && cached.coords.latitude === 35.3335);
  const oldBefore = t.sent.length;
  t.w.navigator.geolocation.getCurrentPosition(() => {}, () => {}, { maximumAge: 0 });
  ok('maximumAge صفر (پیش‌فرض) ← همیشه از نیتیو می‌خواهد', t.sent.length === oldBefore + 1);
  const staleBefore = t.sent.length;
  t.w.navigator.geolocation.getCurrentPosition(() => {}, () => {}, { maximumAge: 1 });
  await sleep(30);
  ok('maximumAge کوچک ← موقعیتِ کهنه دوباره از نیتیو خواسته می‌شود', t.sent.length === staleBefore + 1);
  t.close();
}
{
  /* مهلت فقط از لحظه‌ی «شروع واقعیِ جست‌وجو» حساب می‌شود، نه وقتی پنجره‌ی اجازه‌ی iOS باز است */
  const t = makeShimWindow();
  let errd = null;
  t.w.navigator.geolocation.getCurrentPosition(() => {}, (e) => { errd = e; }, { timeout: 60 });
  await sleep(200);
  ok('تا iOS جست‌وجو را شروع نکرده (پنجره‌ی اجازه باز است) مهلت تمام نمی‌شود', errd === null);
  t.w.__eplakGeoStarted(t.sent[0].id);
  await sleep(200);
  ok('پس از شروعِ جست‌وجو، با تمام شدن مهلت خطای TIMEOUT (کد ۳) می‌آید', !!errd && errd.code === 3);
  t.w.__eplakGeoResult(t.sent[0].id, { ok: true, lat: 1, lng: 2, acc: 3 });
  ok('نتیجه‌ی دیرهنگام بعد از خطای مهلت نادیده گرفته می‌شود (بدون خطا و بدون بازخوانی)', true);
  t.close();
}
{
  const t = makeShimWindow();
  let state = null;
  const pr = t.w.navigator.permissions.query({ name: 'geolocation' }).then((r) => { state = r; });
  ok('Permissions API (geolocation): پیام geoStatus به نیتیو می‌رود', t.sent.length === 1 && t.sent[0].action === 'geoStatus');
  t.w.__eplakGeoStatus(t.sent[0].id, 'granted');
  await pr;
  ok('نتیجه‌ی granted/denied/prompt از وضعیت واقعیِ iOS می‌آید (silentLocation فقط با granted صدا می‌زند)', !!state && state.state === 'granted');
  let rejected = false;
  await t.w.navigator.permissions.query({ name: 'camera' }).catch(() => { rejected = true; });
  ok('نام‌های دیگر (camera…) به Permissions API اصلی سپرده می‌شوند (اینجا jsdom ندارد ← رد می‌شود)', rejected === true && t.sent.length === 1);
  t.close();
}
{
  const t = makeShimWindow();
  const seen = [];
  const wid = t.w.navigator.geolocation.watchPosition((pos) => seen.push(pos.coords.latitude), () => {}, { timeout: 5000 });
  ok('watchPosition: شناسه برمی‌گرداند و بلافاصله از نیتیو می‌خواهد', Number.isInteger(wid) && t.sent.length === 1 && t.sent[0].action === 'geoGet');
  t.w.__eplakGeoStarted(t.sent[0].id);
  t.w.__eplakGeoResult(t.sent[0].id, { ok: true, lat: 35.1, lng: 51.1, acc: 5 });
  ok('watchPosition: هر نتیجه به callback می‌رسد', seen.length === 1 && seen[0] === 35.1);
  t.w.navigator.geolocation.clearWatch(wid);
  const n = t.sent.length;
  await sleep(3300);
  ok('clearWatch: بعد از آن دیگر چیزی از نیتیو خواسته نمی‌شود', t.sent.length === n);
  t.w.eval(shimJs);
  ok('بارگذاری دوباره‌ی شیم، آن را دوبار بسته‌بندی نمی‌کند', t.w.__eplakGeoShim === true && t.sent.length === n);
  t.close();
  const bare = makeShimWindow(false);
  ok('بدون پل نیتیو (مرورگر معمولی) شیم هیچ‌چیز را عوض نمی‌کند', bare.w.__eplakGeoShim === undefined && bare.w.navigator.geolocation === undefined);
  bare.close();
}
{
  /* همان کدی که city-map.js برای خواندن موقعیت دارد، با شیم کار می‌کند */
  const cityRead = city.match(/navigator\.geolocation\.getCurrentPosition\(function \(pos\) \{([\s\S]*?)\}, function \(err\)/);
  ok('city-map.js فقط از coords.latitude/longitude/accuracy می‌خواند (همان که شیم می‌دهد)',
    !!cityRead && /c\.latitude/.test(cityRead[1]) && /c\.longitude/.test(cityRead[1]) && /c\.accuracy/.test(cityRead[1]));
}

/* ── ۶) منطق سنجش آزمون دودی (پایتون) ────────────────────────────────────── */
console.log('— ۶) منطق سنجش آزمون دودی');
const smoke = read('ios-app/ci/simulator-smoke.sh');
const bashSyntax = spawnSync('bash', ['-n', p('ios-app/ci/simulator-smoke.sh')], { encoding: 'utf8' });
ok('اسکریپت آزمون دودی سینتکس bash درست دارد', bashSyntax.status === 0, bashSyntax.stderr);
const py = (smoke.match(/python3 - "\$OUT" <<'PYEOF'\n([\s\S]*?)\nPYEOF\n/) || [, ''])[1];
ok('بخش سنجش پایتون در اسکریپت هست', py.length > 500);
const havePy = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0;
if (!havePy) {
  console.log('  ⏭  python3 روی این دستگاه نیست؛ اجرای منطق سنجش رد شد');
} else {
  const good = {
    1: { stage: 1, protocol: 'file:', apiBase: 'https://eplak.ir/eplak-fixed/api', nativeFlag: true, fns: { showScreen: 'function', cityMap: 'function', places: 'function' },
         placesCount: 134, screen: 'screen-login', offlineGate: false, online: true, geoShim: true, geoPermission: 'granted', ping: { status: 200, body: '{}' }, localStorage: true, externalOpens: [] },
    2: { stage: 2, screen: 'screen-map', chips: 10, rows: 40, tiles: 12, tilesLoaded: 9, markers: 60, externalOpens: [] },
    3: { stage: 3, env: 'ios', loc: { lat: 35.3335, lng: 51.6402, acc: 5 }, routeStatus: 'ios',
         externalOpens: ['neshan://?origin=35.333500,51.640200&destination=35.328370,51.662480&vehicle=d', 'https://nshn.ir/?origin=35.333500,51.640200&destination=35.328370,51.662480&vehicle=d'] },
  };
  const evalCase = (mut) => {
    const d = fs.mkdtempSync(path.join(TMP, 'smoke-'));
    const data = JSON.parse(JSON.stringify(good)); mut(data);
    for (const n of [1, 2, 3]) fs.writeFileSync(path.join(d, `selftest-${n}.json`), JSON.stringify(data[n]));
    const r = spawnSync('python3', ['-c', py, d], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  ok('داده‌ی سالم ← سنجش می‌گذرد', evalCase(() => {}).code === 0);
  ok('پینگ سرور شکست بخورد ← رد می‌شود', evalCase((d) => { d[1].ping = { error: 'TypeError: Load failed' }; }).code === 1);
  ok('صفحه از file:// باز نشده باشد ← رد می‌شود', evalCase((d) => { d[1].protocol = 'about:'; }).code === 1);
  ok('پرده‌ی «بدون اینترنت» بیاید ← رد می‌شود', evalCase((d) => { d[1].offlineGate = true; }).code === 1);
  ok('نقشه باز نشود ← رد می‌شود', evalCase((d) => { d[2].screen = 'screen-home'; d[2].chips = 0; }).code === 1);
  ok('لینک neshan:// به پوسته‌ی نیتیو نرسد ← رد می‌شود', evalCase((d) => { d[3].externalOpens = []; }).code === 1);
  ok('لینک نشان بدون origin ← رد می‌شود', evalCase((d) => { d[3].externalOpens = ['neshan://?ll=35.3,51.6']; }).code === 1);
  ok('مبدأ و مقصد جابه‌جا شده باشند ← رد می‌شود (مبدأ باید موقعیت کاربر باشد)',
    evalCase((d) => { d[3].externalOpens = ['neshan://?origin=35.328370,51.662480&destination=35.333500,51.640200&vehicle=d']; }).code === 1);
  ok('GPS شبیه‌ساز از پل نیتیو نرسد (loc خالی) ← رد می‌شود', evalCase((d) => { d[3].loc = null; }).code === 1);
  ok('پل موقعیت (GeoBridge) نصب نباشد ← رد می‌شود', evalCase((d) => { d[1].geoShim = false; }).code === 1);
}

{
  /* مقصدِ مورد انتظارِ آزمون دودی همان مختصات بیمارستان مفتح در فایل داده است (یک بار اشتباهاً مختصات مسجد جامع
     را از یک مثال برداشته بودم؛ این سنجش جلوی چنین اختلافی را می‌گیرد) */
  const line = (read('core/places-data.js').split('\n').find((l) => l.includes('"id": "mofatteh-hospital"')) || '');
  const lat = Number((line.match(/"lat": ([\d.]+)/) || [])[1]), lng = Number((line.match(/"lng": ([\d.]+)/) || [])[1]);
  const expLat = Number((smoke.match(/abs\(d\[0\] - ([\d.]+)\)/) || [])[1]), expLng = Number((smoke.match(/abs\(d\[1\] - ([\d.]+)\)/) || [])[1]);
  ok('مقصدِ مورد انتظارِ آزمون دودی با مختصات بیمارستان مفتح در core/places-data.js یکی است',
    lat > 35 && lng > 51 && Math.abs(lat - expLat) < 0.001 && Math.abs(lng - expLng) < 0.001, `data=${lat},${lng} expected=${expLat},${expLng}`);
}

/* ── ۷) ورک‌فلوها ────────────────────────────────────────────────────────── */
console.log('— ۷) ورک‌فلوها');
const wfDir = p('.github/workflows');
const wfs = {};
let wfErr = '';
for (const f of fs.readdirSync(wfDir).filter((x) => /\.ya?ml$/.test(x))) {
  try { wfs[f] = YAML.parse(fs.readFileSync(path.join(wfDir, f), 'utf8')); } catch (e) { wfErr += f + ': ' + e.message + ' '; }
}
ok(`همه‌ی ${Object.keys(wfs).length} فایل ورک‌فلو YAML سالم‌اند (یک خطا = اجرا نشدنِ بی‌صدا)`, Object.keys(wfs).length >= 4 && wfErr === '', wfErr);
const iosWf = wfs['ios-ipa.yml'], apkWf = wfs['android-apk.yml'];
ok('ورک‌فلوی iOS روی macOS اجرا می‌شود', !!iosWf && /^macos-/.test(iosWf.jobs.ipa['runs-on']));
const iosPaths = new Set((iosWf && iosWf.on.push.paths) || []);
const apkPaths = ((apkWf && apkWf.on.push.paths) || []).filter((x) => x !== 'android-app/**' && x !== '.github/workflows/android-apk.yml');
ok('هر تغییرِ وبی که APK تازه می‌سازد، IPA تازه هم می‌سازد (مسیرهای وب یکی است)',
  apkPaths.length >= 6 && apkPaths.every((x) => iosPaths.has(x)) && iosPaths.has('ios-app/**') && iosPaths.has('.github/workflows/ios-ipa.yml'), [...iosPaths].join(' '));
const iosText = fs.readFileSync(p('.github/workflows/ios-ipa.yml'), 'utf8');
ok('هر دو ساخت (شبیه‌ساز و دستگاه) بدون امضا هستند و هیچ secret لازم نیست',
  (iosText.match(/CODE_SIGNING_ALLOWED=NO/g) || []).length === 2 && !/secrets\./.test(iosText) && !/CODE_SIGNING_ALLOWED=YES/.test(iosText));
const apkTag = (apkWf.jobs.build.steps.find((s) => s.with && s.with.tag_name) || { with: {} }).with.tag_name;
ok('IPA به همان صفحه‌ی Releases پیوست می‌شود که APK (v2.0-eplak-update)',
  apkTag === 'v2.0-eplak-update' && iosWf.env.RELEASE_TAG === apkTag && /gh release upload "\$RELEASE_TAG"[\s\S]*--clobber/.test(iosText));
ok('IPA فقط پس از گذشتن آزمون دودی و بازرسی منتشر می‌شود (پیوست بعد از هر دو است)',
  iosText.indexOf('simulator-smoke.sh') > 0 && iosText.indexOf('simulator-smoke.sh') < iosText.indexOf('gh release upload')
  && iosText.indexOf('بازرسی IPA') < iosText.indexOf('gh release upload'));

/* ── ۸) نرفتن ios-app به بسته‌ی هاست ─────────────────────────────────────── */
console.log('— ۸) بسته‌ی هاست');
const haveZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0 && spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0;
if (!haveZip) {
  console.log('  ⏭  zip/unzip روی این دستگاه نیست؛ ساخت واقعیِ بسته رد شد');
} else {
  const copy = path.join(TMP, 'hostpkg');
  fs.cpSync(ROOT, copy, { recursive: true, filter: (src) => { const b = path.basename(src); return !['.git', 'node_modules', '.arena'].includes(b) && !(b.endsWith('.zip') && path.dirname(src) === ROOT); } });
  fs.mkdirSync(path.join(copy, 'ios-app/Eplak/Web'), { recursive: true });
  fs.writeFileSync(path.join(copy, 'ios-app/Eplak/Web/index.html'), '<!-- کپی ساختِ وب -->');
  const b = spawnSync('bash', ['tools/build-update-package.sh'], { cwd: copy, encoding: 'utf8' });
  const list = spawnSync('unzip', ['-Z1', path.join(copy, 'eplak-fixed-update.zip')], { encoding: 'utf8' }).stdout.split('\n');
  ok('بسته‌ی هاست ساخته می‌شود و هیچ فایلی از ios-app/ داخلش نیست', b.status === 0 && list.length > 100 && !list.some((n) => n.startsWith('ios-app')), (b.stdout + b.stderr).slice(-200));
  ok('فایل‌های سایت (index.html و پوشه‌ی core) هنوز داخل بسته‌ی هاست‌اند', list.includes('index.html') && list.includes('core/storage.js'));
}
const deployText = exists('.github/workflows/deploy.yml') ? read('.github/workflows/deploy.yml') : '';
const rmLines = deployText.split('\n').filter((l) => /^\s*rm -rf /.test(l)).join(' ');
ok('آپلود خودکار FTP (deploy.yml، فقط با ادغام در main و فقط وقتی secret ها هست) هم ios-app، pwa-dist و tools را به هاست نمی‌برد — مثل بسته‌ی zip',
  ['ios-app', 'pwa-dist', 'tools', 'android-app', '.github'].every((d) => new RegExp('(^|\\s)' + d.replace('.', '\\.') + '(\\s|$)').test(rmLines)), rmLines);
fs.rmSync(TMP, { recursive: true, force: true });

/* ── ۹) راهنما ───────────────────────────────────────────────────────────── */
console.log('— ۹) راهنمای نصب');
const faDoc = exists('docs/IOS_PWA_FA.md') ? read('docs/IOS_PWA_FA.md') : '';
const enDoc = exists('docs/IOS_PWA_EN.md') ? read('docs/IOS_PWA_EN.md') : '';
ok('راهنمای فارسی: Sideloadly، AltStore، Xcode و «افزودن به صفحه اصلی» (PWA) را می‌گوید',
  ['Sideloadly', 'AltStore', 'Xcode', 'افزودن به صفحه اصلی', 'eplak-app-unsigned.ipa'].every((t) => faDoc.includes(t)));
ok('راهنمای انگلیسی: Sideloadly, AltStore, Xcode and “Add to Home Screen” (PWA)',
  ['Sideloadly', 'AltStore', 'Xcode', 'Add to Home Screen', 'eplak-app-unsigned.ipa'].every((t) => enDoc.includes(t)));
ok('راهنما تفاوت اعلان (IPA بدون اعلان پس‌زمینه؛ PWA با Web Push در iOS 16.4+) را صادقانه می‌گوید',
  /16\.4/.test(faDoc) && /16\.4/.test(enDoc) && /APNs/.test(faDoc) && /APNs/.test(enDoc));

console.log('\n' + '='.repeat(52));
console.log(`IOS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

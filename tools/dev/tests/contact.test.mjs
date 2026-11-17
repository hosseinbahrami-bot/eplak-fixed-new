/* contact.test.mjs — «تماس با شهرداری»: ایمیلِ شهرداری و آدرس در «نشان»
   ============================================================================
   خواسته‌ی کارفرما:
     «ایمیل شهرداری رو بذار info@eplak.ir وقتی روش کلیک میکنن از کاربر بپرسه
      وصل بشه جیمیلش و امکان ارسال پیام داشته باشه» و «آدرس شهرداری رو هم
      دقیقا آدرس شهرداری ورامین بذار که با زدن روش از طریق برنامه نشان یا…
      آدرس شهرداری ورامین رو بیاره».

   چه چیزی «واقعاً اجرا» می‌شود (نه فقط متن‌کاوی):
     ۱) modules/contact.js در یک vm sandbox با DOM/ناوبریِ ساختگی بار می‌شود:
        ایمیلِ درست، مختصاتِ درست (برابر با رکوردِ «municipality» در
        core/places-data.js)، ساختنِ mailto با موضوع/متنِ i18n، و باز کردنِ
        لینکِ نشان در هر چهار محیط (پلِ بومیِ اندروید، intent در مرورگرِ
        اندروید، طرحِ neshan:// در iOS با پشتیبانِ وب، و پنجره‌ی تازه در
        دسکتاپ) — با core/places.jsِ واقعی برای ساختنِ لینک‌ها.
     ۲) index.html: هر دو کارت onclick دارند، ایمیلِ قدیمیِ info@varamin.ir
        رفته و info@eplak.ir آمده، آدرسِ دقیقِ شهرداری ورامین درج شده و
        اسکریپتِ ماژول با کش‌باستر لود می‌شود.
     ۳) core/i18n.js: کلیدهای فارسی/انگلیسیِ راهنما، موضوع و متنِ ایمیل و
        آدرسِ دقیق در هر دو زبان.
     ۴) نسخه‌ی اپ ۲.۵/۷ (APK و IPA به‌عنوانِ «به‌روزرسانی» نصب شوند).

   اجرا:  bash tools/dev/run-regression.sh contact
*/
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const section = (t) => console.log('\n=== ' + t + ' ===');

/* ── sandboxِ ساختگی: ناوبری و پل و i18n قابلِ مشاهده ── */
function makeSandbox(opts = {}) {
  const nav = [];
  const timers = [];
  const sandbox = {
    console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    navigator: { userAgent: opts.ua || '', platform: opts.platform || '', maxTouchPoints: opts.maxTouchPoints || 0 },
    document: { hidden: !!opts.hidden },
    AndroidApp: opts.bridge,
    t: opts.t || ((k, fb) => fb),
    open: (url, target) => { nav.push({ kind: 'open', url, target }); return opts.popup === undefined ? {} : opts.popup; },
    _nav: nav, _timers: timers,
  };
  sandbox.window = sandbox;
  let href = '';
  sandbox.location = {};
  Object.defineProperty(sandbox.location, 'href', {
    get: () => href,
    set: (v) => { href = String(v); nav.push({ kind: 'href', url: String(v) }); },
    configurable: true,
  });
  vm.createContext(sandbox);
  /* places.jsِ واقعی اول (سازنده‌ی لینکِ نشان)، بعد ماژولِ تماس */
  if (!opts.skipPlaces) vm.runInContext(read('core/places.js'), sandbox, { filename: 'places.js' });
  vm.runInContext(read('modules/contact.js'), sandbox, { filename: 'contact.js' });
  return sandbox;
}

/* مختصاتِ رکوردِ «municipality» در داده‌های اماکن (مرجعِ حقیقت) */
const muniLine = read('core/places-data.js').split('\n').find((l) => l.includes('"id": "municipality"'));
const muniLat = Number(/"lat":\s*([0-9.]+)/.exec(muniLine)[1]);
const muniLng = Number(/"lng":\s*([0-9.]+)/.exec(muniLine)[1]);

/* ══════════ ۱) بار شدنِ ماژول و ثابت‌ها ══════════ */
section('بار شدنِ modules/contact.js');
{
  const sb = makeSandbox();
  ok('توابعِ سراسری ساخته شده‌اند', typeof sb.openMunicipalityEmail === 'function' && typeof sb.openMunicipalityAddress === 'function');
  ok('شیء EplakContact ساخته شده است', !!sb.EplakContact && typeof sb.EplakContact === 'object');
  ok('ایمیلِ شهرداری info@eplak.ir است', sb.EplakContact.EMAIL === 'info@eplak.ir', sb.EplakContact.EMAIL);
  ok('مختصات برابر با رکوردِ «شهرداری ورامین (ساختمان مرکزی)» در places-data.js است',
    sb.EplakContact.POS.lat === muniLat && sb.EplakContact.POS.lng === muniLng,
    JSON.stringify(sb.EplakContact.POS) + ' vs ' + muniLat + ',' + muniLng);
  ok('مختصات همان 35.32831, 51.64017 است', sb.EplakContact.POS.lat === 35.32831 && sb.EplakContact.POS.lng === 51.64017);
}

/* ══════════ ۲) ایمیل: mailto با موضوع و متنِ i18n ══════════ */
section('ایمیل به شهرداری (mailto)');
{
  /* الف) از راهِ پلِ بومیِ اندروید */
  const calls = [];
  const sb = makeSandbox({ bridge: { openUrl: (u) => calls.push(u) } });
  sb.openMunicipalityEmail();
  ok('با پلِ بومی، openUrl با mailto صدا زده می‌شود', calls.length === 1 && calls[0].startsWith('mailto:info@eplak.ir?'), JSON.stringify(calls));
  ok('موضوعِ پیش‌فرض (فارسی) در mailto هست', calls[0].includes('subject=' + encodeURIComponent('پیام به شهرداری ورامین')));
  ok('متنِ آغازین در mailto هست', calls[0].includes('body=' + encodeURIComponent('سلام،\n\n')));
  ok('هیچ هدایتِ صفحه‌ای هم رخ نداده است', sb._nav.length === 0);
}
{
  /* ب) بدونِ پل: هدایتِ صفحه به mailto (جیمیل/برنامه‌ی ایمیل باز می‌شود) */
  const sb = makeSandbox();
  sb.openMunicipalityEmail();
  ok('بدونِ پل، location.href به mailto می‌رود', sb._nav.length === 1 && sb._nav[0].kind === 'href' && sb._nav[0].url.startsWith('mailto:info@eplak.ir?'));
}
{
  /* ج) موضوع/متن از i18n می‌آیند (هر دو زبان) */
  const fa = { contact_email_subject: 'پیام به شهرداری ورامین', contact_email_body: 'سلام،\n\n' };
  const en = { contact_email_subject: 'Message to Varamin Municipality', contact_email_body: 'Hello,\n\n' };
  const sbFa = makeSandbox({ t: (k, fb) => fa[k] || fb });
  sbFa.openMunicipalityEmail();
  ok('موضوعِ فارسیِ i18n در mailto می‌نشیند', sbFa._nav[0].url.includes('subject=' + encodeURIComponent(fa.contact_email_subject)));
  const sbEn = makeSandbox({ t: (k, fb) => en[k] || fb });
  sbEn.openMunicipalityEmail();
  ok('موضوعِ انگلیسیِ i18n در mailto می‌نشیند', sbEn._nav[0].url.includes('subject=' + encodeURIComponent(en.contact_email_subject)));
  ok('متنِ انگلیسیِ i18n در mailto می‌نشیند', sbEn._nav[0].url.includes('body=' + encodeURIComponent(en.contact_email_body)));
}

/* ══════════ ۳) آدرس: باز شدنِ «نشان» در هر چهار محیط ══════════ */
section('آدرسِ شهرداری در نقشه‌ی نشان');
{
  /* الف) پلِ بومیِ اندروید: openNeshan با لینکِ وب */
  const calls = [];
  const sb = makeSandbox({ bridge: { openNeshan: (u) => { calls.push(u); return 'app'; } } });
  sb.openMunicipalityAddress();
  ok('با پلِ بومی، openNeshan با لینکِ وبِ نشان صدا زده می‌شود',
    calls.length === 1 && calls[0] === 'https://nshn.ir/?lat=35.328310&lng=51.640170', JSON.stringify(calls));
  ok('هیچ هدایتِ صفحه‌ای رخ نداده است', sb._nav.length === 0);
}
{
  /* ب) پلِ قدیمیِ openUrl */
  const calls = [];
  const sb = makeSandbox({ bridge: { openUrl: (u) => calls.push(u) } });
  sb.openMunicipalityAddress();
  ok('با openUrlِ پل، لینکِ وبِ نشان باز می‌شود', calls.length === 1 && calls[0] === 'https://nshn.ir/?lat=35.328310&lng=51.640170');
}
{
  /* ج) مرورگرِ اندروید: intent:// نشان */
  const sb = makeSandbox({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120' });
  sb.openMunicipalityAddress();
  ok('در اندروید، intent:// نشان باز می‌شود',
    sb._nav.length === 1 && sb._nav[0].kind === 'href' && sb._nav[0].url.startsWith('intent://nshn.ir/?lat=35.328310&lng=51.640170#Intent;'),
    sb._nav[0] && sb._nav[0].url);
  ok('intent، پکیجِ رسمیِ نشان و آدرسِ جایگزینِ وب را دارد',
    sb._nav[0].url.includes('package=org.rajman.neshan.traffic.tehran.navigator') && sb._nav[0].url.includes('browser_fallback_url='));
}
{
  /* د) iOS: طرحِ neshan:// و پشتیبانِ وب پس از ۱٫۶ ثانیه */
  const sb = makeSandbox({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit' });
  sb.openMunicipalityAddress();
  ok('در iOS، طرحِ neshan://?ll= باز می‌شود',
    sb._nav.length === 1 && sb._nav[0].kind === 'href' && sb._nav[0].url === 'neshan://?ll=35.328310,51.640170',
    sb._nav[0] && sb._nav[0].url);
  ok('پشتیبانِ وب پس از ۱۶۰۰ میلی‌ثانیه زمان‌بندی شده است', sb._timers.length === 1 && sb._timers[0].ms === 1600);
  sb._timers[0].fn();
  ok('اگر صفحه هنوز دیده شود، وبِ نشان هم باز می‌شود',
    sb._nav.length === 2 && sb._nav[1].url === 'https://nshn.ir/?lat=35.328310&lng=51.640170');
}
{
  /* ه) دسکتاپ: پنجره‌ی تازه با وبِ نشان */
  const sb = makeSandbox({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  sb.openMunicipalityAddress();
  ok('در دسکتاپ، پنجره‌ی تازه با وبِ نشان باز می‌شود',
    sb._nav.length === 1 && sb._nav[0].kind === 'open' && sb._nav[0].url === 'https://nshn.ir/?lat=35.328310&lng=51.640170' && sb._nav[0].target === '_blank');
}
{
  /* هـ) دسکتاپ با پاپ‌آپِ مسدودشده: هدایتِ همین صفحه به وبِ نشان */
  const sb = makeSandbox({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', popup: null });
  sb.openMunicipalityAddress();
  ok('اگر پاپ‌آپ مسدود شود، همین صفحه به وبِ نشان می‌رود',
    sb._nav.length === 2 && sb._nav[0].kind === 'open' && sb._nav[1].kind === 'href' && sb._nav[1].url === 'https://nshn.ir/?lat=35.328310&lng=51.640170');
}
{
  /* و) اگر EplakPlaces نباشد، بی‌صدا هیچ‌کاری نمی‌کند (نه خطا، نه ناوبری) */
  const sb = makeSandbox({ skipPlaces: true });
  let threw = false;
  try { sb.openMunicipalityAddress(); } catch (e) { threw = true; }
  ok('بدونِ EplakPlaces خطا نمی‌دهد و ناوبری نمی‌کند', !threw && sb._nav.length === 0);
}

/* ══════════ ۴) index.html: هر دو کارتِ تماس ══════════ */
section('کارت‌های صفحه‌ی «تماس با ما» در index.html');
{
  const html = read('index.html');
  ok('کارتِ ایمیل onclickِ openMunicipalityEmail دارد', html.includes('onclick="openMunicipalityEmail()"'));
  ok('ایمیلِ تازه info@eplak.ir درج شده است', html.includes('>info@eplak.ir<'));
  ok('ایمیلِ قدیمیِ info@varamin.ir دیگر نیست', !html.includes('info@varamin.ir'));
  ok('کارتِ آدرس onclickِ openMunicipalityAddress دارد', html.includes('onclick="openMunicipalityAddress()"'));
  ok('آدرسِ دقیقِ شهرداری ورامین درج شده است',
    html.includes('ورامین، ابتدای خیابان شهید بهشتی، میدان شهرداری، روبروی فرمانداری'));
  ok('آدرسِ کوتاهِ قدیمی («ورامین، میدان شهرداری») به‌تنهایی دیگر نیست',
    !/>ورامین، میدان شهرداری</.test(html));
  ok('راهنمای ایمیل (جیمیل) درج شده است', html.includes('data-i18n="contact_email_hint"'));
  ok('راهنمای آدرس (نشان) درج شده است', html.includes('data-i18n="contact_address_hint"'));
  ok('اسکریپتِ ماژولِ تماس با کش‌باستر لود می‌شود', /modules\/contact\.js\?v=1/.test(html));
  ok('کارتِ «پشتیبانی آنلاین» دست‌نخورده مانده است', html.includes('onclick="openSupportChat()"'));
}

/* ══════════ ۵) i18n: هر دو زبان ══════════ */
section('رشته‌های دوزبانه‌ی core/i18n.js');
{
  const i18n = read('core/i18n.js');
  ok('آدرسِ دقیق در فارسی', i18n.includes("'contact_address_val2': 'ورامین، ابتدای خیابان شهید بهشتی، میدان شهرداری، روبروی فرمانداری'"));
  ok('آدرسِ دقیق در انگلیسی', i18n.includes("'contact_address_val2': 'Varamin, Beginning of Shahid Beheshti St., Municipality Sq., opposite the Governorate'"));
  ok('راهنمای ایمیل در هر دو زبان', i18n.includes("'contact_email_hint': 'با لمس، برنامه‌ی ایمیل شما (جیمیل) باز می‌شود'") && i18n.includes("'contact_email_hint': 'Tap to open your mail app (Gmail)'"));
  ok('راهنمای آدرس در هر دو زبان', i18n.includes("'contact_address_hint': 'مشاهده در نقشه‌ی نشان'") && i18n.includes("'contact_address_hint': 'View in Neshan map'"));
  ok('موضوعِ ایمیل در هر دو زبان', i18n.includes("'contact_email_subject': 'پیام به شهرداری ورامین'") && i18n.includes("'contact_email_subject': 'Message to Varamin Municipality'"));
  ok('متنِ آغازینِ ایمیل در هر دو زبان', i18n.includes("'contact_email_body': 'سلام،\\n\\n'") && i18n.includes("'contact_email_body': 'Hello,\\n\\n'"));
}

/* ══════════ ۶) نسخه‌ی اپ ══════════ */
section('نسخه‌ی اپ (۲.۵/۷)');
{
  const gradle = read('android-app/app/build.gradle');
  ok('اندروید: versionCode 7 / versionName 2.5', /versionCode 7\b/.test(gradle) && gradle.includes("versionName '2.5'"));
  const pbx = read('ios-app/Eplak.xcodeproj/project.pbxproj');
  ok('iOS: MARKETING_VERSION 2.5.0 و CURRENT_PROJECT_VERSION 7 (هر دو پیکربندی)',
    (pbx.match(/MARKETING_VERSION = 2\.5\.0;/g) || []).length === 2 && (pbx.match(/CURRENT_PROJECT_VERSION = 7;/g) || []).length === 2);
}

console.log('\n' + '='.repeat(52));
console.log(`CONTACT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

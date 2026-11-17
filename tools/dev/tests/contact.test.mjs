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
import { JSDOM, VirtualConsole } from 'jsdom';

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
section('نسخه‌ی اپ (۲.۱۰/۱۲)');
{
  const gradle = read('android-app/app/build.gradle');
  ok('اندروید: versionCode 12 / versionName 2.10', /versionCode 12\b/.test(gradle) && gradle.includes("versionName '2.10'"));
  const pbx = read('ios-app/Eplak.xcodeproj/project.pbxproj');
  ok('iOS: MARKETING_VERSION 2.10.0 و CURRENT_PROJECT_VERSION 12 (هر دو پیکربندی)',
    (pbx.match(/MARKETING_VERSION = 2\.10\.0;/g) || []).length === 2 && (pbx.match(/CURRENT_PROJECT_VERSION = 12;/g) || []).length === 2);
}

/* ══════════ ۷) تبِ «چت‌های پشتیبانی» در بخشِ گزارش‌ها ══════════ */
section('تبِ «چت‌های پشتیبانی» (جدا از تیکت‌ها)');
{
  const html = read('index.html');
  const reportsJs = read('modules/reports.js');
  const ticketsPhp = read('api/tickets.php');
  const styleCss = read('assets/css/style.css');
  const i18n = read('core/i18n.js');

  /* ── عنوانِ ایمیل ── */
  ok('عنوانِ کارتِ ایمیل «ارتباط با ما» است (فارسی)', i18n.includes("'contact_email_name': 'ارتباط با ما'"));
  ok('عنوانِ کارتِ ایمیل «Contact Us» است (انگلیسی)', i18n.includes("'contact_email_name': 'Contact Us'"));
  ok('متنِ جایگزینِ HTML هم «ارتباط با ما» است', html.includes('data-i18n="contact_email_name">ارتباط با ما<'));

  /* ── دکمه و پنلِ تبِ سوم ── */
  ok('دکمه‌ی سومِ سوییچر (tabBtnSupport) هست', html.includes('id="tabBtnSupport"') && html.includes("switchReportsMainTab('support', this)"));
  ok('برچسبِ تب «چت‌های پشتیبانی» است', html.includes('data-i18n="reports_tab_support">چت‌های پشتیبانی<'));
  ok('شمارنده‌ی تبِ چت‌ها (supportCountBadge) هست', html.includes('id="supportCountBadge"'));
  ok('پنلِ سوم (sectionSupportPane) هست', html.includes('id="sectionSupportPane"'));
  ok('فهرستِ گفتگوها (supportListWrap) هست', html.includes('id="supportListWrap"'));
  ok('فیلترهای چت‌ها (همه/باز/بسته) هست', html.includes('id="supportFilterTabs"') && html.includes("filterSupportThreads('open', this)") && html.includes("filterSupportThreads('closed', this)"));
  ok('دکمه‌ی «شروع گفتگوی جدید» صفحه‌ی چت را باز می‌کند', html.includes('onclick="openSupportChat()"') && html.includes('data-i18n="support_new_chat"'));
  ok('سه دکمه‌ی سوییچر کنار هم‌اند (گزارش‌ها، تیکت‌ها، چت‌ها)',
    html.indexOf('tabBtnReports') < html.indexOf('tabBtnTickets') && html.indexOf('tabBtnTickets') < html.indexOf('tabBtnSupport'));

  /* ── منطقِ سوییچر و فهرست در reports.js ── */
  ok('switchReportsMainTab بخشِ support را می‌شناسد', reportsJs.includes("section === 'support'") && reportsJs.includes("'tabBtnSupport'"));
  ok('نشانگر برای سه تب جابه‌جا می‌شود (idx تا ۲)', reportsJs.includes("section === 'support' ? 2 : 0"));
  ok('پنلِ چت‌ها هنگامِ سوییچ نمایش/پنهان می‌شود', reportsJs.includes("paneSupport") && reportsJs.includes("section === 'support' ? 'flex' : 'none'"));
  ok('فهرستِ چت‌ها از api/support.php?action=threads می‌آید', reportsJs.includes("/support.php?action=threads"));
  ok('renderSupportList و filterSupportThreads تعریف و export شده‌اند',
    reportsJs.includes('function renderSupportList') && reportsJs.includes('function filterSupportThreads')
    && reportsJs.includes('window.filterSupportThreads = filterSupportThreads') && reportsJs.includes('window.renderSupportList = renderSupportList'));
  ok('لمس روی گفتگو صفحه‌ی چت را باز می‌کند', reportsJs.includes('onclick="openSupportChat()"'));
  ok('وضعیتِ باز/بسته و خوانده‌نشده در فهرست هست', reportsJs.includes('isSupportThreadClosed') && reportsJs.includes('unread_citizen'));

  /* ── تفکیکِ چت‌ها از تیکت‌ها ── */
  ok('api/tickets.php ستونِ channel را برمی‌گرداند', /SELECT[^;]*channel/.test(ticketsPhp));
  ok('mapTicketRow ستونِ channel را نگه می‌دارد', reportsJs.includes("channel: item.channel || ''"));
  ok('لیستِ تیکت‌ها چت‌های پشتیبانی را کنار می‌گذارد', reportsJs.includes("t.channel !== 'support'"));

  /* ── رشته‌های دوزبانه ── */
  ok('برچسبِ تب در هر دو زبان', i18n.includes("'reports_tab_support': 'چت‌های پشتیبانی'") && i18n.includes("'reports_tab_support': 'Support Chats'"));
  ok('رشته‌های فیلتر و دکمه در هر دو زبان',
    i18n.includes("'support_new_chat': '+ شروع گفتگوی جدید'") && i18n.includes("'support_new_chat': '+ Start new conversation'")
    && i18n.includes("'support_list_empty': 'هنوز گفتگوی پشتیبانی ندارید'") && i18n.includes("'support_list_empty': 'No support conversations yet'"));

  /* ── عرضِ نشانگر برای سه تب ── */
  ok('نشانگرِ سوییچر یک‌سومِ عرض است', styleCss.includes('width: calc(33.333% - 6px)'));

  /* ── کش‌باسترها ── */
  ok('کش‌باسترِ reports.js و i18n.js به‌روز شده است', /modules\/reports\.js\?v=34/.test(html) && /core\/i18n\.js\?v=20/.test(html));
}

/* ── اجرای عملکردیِ فهرستِ چت‌ها در jsdom با صفحه‌ی واقعیِ گزارش‌ها ── */
section('اجرای عملکردیِ تبِ چت‌ها (jsdom)');
{
  const INDEX = read('index.html');
  const REPORTS_SCREEN = (/<!-- ============ SCREEN 5: REPORTS LIST ============ -->([\s\S]*?)<!-- ============ SCREEN: SUPPORT CHAT/.exec(INDEX) || [])[1] || '';
  ok('صفحه‌ی گزارش‌ها از index.html استخراج شد', REPORTS_SCREEN.length > 1000);

  const THREADS = [
    { id: 11, title: 'پشتیبانی آنلاین', status: 'open', department: 'پشتیبانی شهرداری', unread_citizen: 2, last_message_at: '2026-11-16 10:00:00', last_sender: 'admin', closed_at: '', rating: 0, created_at: '2026-11-16 09:00:00' },
    { id: 9, title: 'پشتیبانی آنلاین', status: 'done', department: 'پشتیبانی شهرداری', unread_citizen: 0, last_message_at: '2026-11-10 12:00:00', last_sender: 'citizen', closed_at: '2026-11-10 12:30:00', rating: 5, created_at: '2026-11-10 11:00:00' },
  ];
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!DOCTYPE html><html lang="fa" dir="rtl"><body>' + REPORTS_SCREEN + '</body></html>',
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.getCurrentPhone = () => '09120000001';
  w.reports = []; /* letِ state.js در evalِ جدا دیده نمی‌شود؛ معادلِ سراسری می‌گذاریم */
  let fetchUrl = '';
  w.fetch = async (url) => {
    fetchUrl = String(url);
    return { ok: true, json: async () => ({ success: true, threads: THREADS }) };
  };
  w.eval(read('core/state.js'));
  w.eval(read('modules/reports.js'));

  ok('توابعِ تبِ چت‌ها روی window هستند',
    typeof w.switchReportsMainTab === 'function' && typeof w.renderSupportList === 'function' && typeof w.filterSupportThreads === 'function');

  /* سوییچ به تبِ چت‌ها: فهرست باید از threads ساخته شود */
  const waitItems = async (n) => {
    for (let i = 0; i < 40; i++) {
      const el = w.document.getElementById('supportListWrap');
      if (el && el.querySelectorAll('.report-item').length >= n) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return false;
  };
  await w.switchReportsMainTab('support');
  await waitItems(2);
  ok('فهرست از api/support.php?action=threads&phone=… خوانده شد',
    fetchUrl.includes('/support.php?action=threads') && fetchUrl.includes('phone=09120000001'), fetchUrl);
  const wrap = w.document.getElementById('supportListWrap');
  const items = wrap ? wrap.querySelectorAll('.report-item') : [];
  ok('هر دو گفتگو در فهرست رندر شدند', items.length === 2, String(items.length));
  ok('گفتگوی باز برچسبِ «باز» و گفتگوی بسته برچسبِ «بسته» دارد',
    wrap.innerHTML.includes('باز') && wrap.innerHTML.includes('بسته'));
  ok('خوانده‌نشده بودنِ گفتگوی باز نشان داده می‌شود', wrap.innerHTML.includes('خوانده‌نشده'));
  ok('شمارنده‌ی تب تعدادِ گفتگوها را نشان می‌دهد', w.document.getElementById('supportCountBadge').textContent === '۲');
  ok('لمس روی گفتگو openSupportChat را صدا می‌زند', wrap.innerHTML.includes('onclick="openSupportChat()"'));
  ok('پنلِ چت‌ها نمایش داده و پنل‌های دیگر پنهان‌اند',
    w.document.getElementById('sectionSupportPane').style.display === 'flex'
    && w.document.getElementById('sectionReportsPane').style.display === 'none'
    && w.document.getElementById('sectionTicketsPane').style.display === 'none');
  ok('دکمه‌ی تبِ چت‌ها active شد', w.document.getElementById('tabBtnSupport').classList.contains('active'));

  /* فیلترِ «بسته»: فقط گفتگوی بسته */
  w.filterSupportThreads('closed');
  const closedItems = wrap.querySelectorAll('.report-item');
  ok('فیلترِ «بسته» فقط یک گفتگو نشان می‌دهد', closedItems.length === 1, String(closedItems.length));

  /* فیلترِ «باز»: فقط گفتگوی باز */
  w.filterSupportThreads('open');
  ok('فیلترِ «باز» فقط یک گفتگو نشان می‌دهد', wrap.querySelectorAll('.report-item').length === 1);

  /* بازگشت به گزارش‌ها */
  w.switchReportsMainTab('reports');
  ok('بازگشت به تبِ گزارش‌ها پنلِ چت‌ها را پنهان می‌کند',
    w.document.getElementById('sectionSupportPane').style.display === 'none'
    && w.document.getElementById('sectionReportsPane').style.display === 'flex');

  try { w.close(); } catch (e) { /* مهم نیست */ }
}

/* ══════════ ۸) تبِ «چت ها» در کارتِ «پیگیری درخواست» + چیدمانِ تب‌ها ══════════ */
section('تبِ «چت ها» در پیگیری درخواست و چیدمانِ متنِ تب‌ها');
{
  const html = read('index.html');
  const reportsJs = read('modules/reports.js');
  const styleCss = read('assets/css/style.css');
  const i18n = read('core/i18n.js');

  /* ── تب‌های کارتِ پیگیری ── */
  ok('دکمه‌ی «چت ها» در کارتِ پیگیری هست', html.includes('id="profileTrackTabChats"') && html.includes("switchProfileTrackTab('chats', this)"));
  ok('دکمه‌ی «پیگیری» در کارتِ پیگیری هست', html.includes('id="profileTrackTabTrack"') && html.includes("switchProfileTrackTab('track', this)"));
  ok('برچسبِ «چت‌های پشتیبانی» با data-i18n است', html.includes('data-i18n="track_tab_chats">چت‌های پشتیبانی<'));
  ok('پنلِ چت‌های پیگیری (profileSupportListWrap) هست', html.includes('id="profileSupportListWrap"'));
  ok('پنلِ پیگیری (profileTrackPaneTrack) و چت‌ها (profileTrackPaneChats) هست',
    html.includes('id="profileTrackPaneTrack"') && html.includes('id="profileTrackPaneChats"'));
  ok('دکمه‌ی «شروع گفتگوی جدید» در تبِ چت‌های پیگیری هست', html.includes('onclick="openSupportChat()"') && html.includes('id="profileSupportListWrap"'));
  ok('switchProfileTrackTab در reports.js تعریف و export شده است',
    reportsJs.includes('function switchProfileTrackTab') && reportsJs.includes('window.switchProfileTrackTab = switchProfileTrackTab'));
  ok('رندرِ چت‌ها در ظرفِ پیگیری انجام می‌شود', reportsJs.includes("renderSupportList('all', 'profileSupportListWrap')"));
  ok('جستجوی پیگیری، چتِ پشتیبانی را به صفحه‌ی چت می‌فرستد (نه جزئیاتِ تیکت)',
    reportsJs.includes("if (foundTicket.channel === 'support') { openSupportChat(); return; }")
    && reportsJs.includes("if (foundTicketAfter.channel === 'support') { openSupportChat(); return; }"));
  ok('برچسب‌های تبِ پیگیری در هر دو زبان',
    i18n.includes("'track_tab_track': 'پیگیری'") && i18n.includes("'track_tab_chats': 'چت‌های پشتیبانی'")
    && i18n.includes("'track_tab_track': 'Track'") && i18n.includes("'track_tab_chats': 'Support Chats'"));
  ok('استایلِ تبِ فعالِ پیگیری هست', styleCss.includes('.profile-track-tab.active'));

  /* ── چیدمانِ متنِ تب‌های گزارش‌ها: عمودی (آیکون بالا، متن+شمارنده پایین) ── */
  ok('دکمه‌های سوییچر عمودی‌اند (flex-direction: column)', /\.reports-switcher-btn \{[^}]*flex-direction: column/.test(styleCss));
  ok('آیکونِ تب‌ها 18px است', /\.reports-switcher-btn svg \{[^}]*width: 18px/.test(styleCss));
  ok('برچسبِ تب (متن+شمارنده) ظرفِ خودش را دارد', /\.reports-switcher-label \{[^}]*display: flex/.test(styleCss));
  ok('شمارنده داخلِ خطِ برچسب است (نه absolute) تا کنارِ متن بشیند',
    /\.reports-counter-pill \{[^}]*flex-shrink: 0/.test(styleCss) && !/\.reports-counter-pill \{[^}]*position: absolute/.test(styleCss));
  ok('متنِ تب‌ها با ellipsis کنترل می‌شود (نه برشِ ناگهانی)',
    /\.reports-switcher-label > span:first-child \{[^}]*text-overflow: ellipsis/.test(styleCss));
  ok('دکمه‌ها min-width:0 دارند (جمع‌شوندگیِ درستِ flex)', /\.reports-switcher-btn \{[^}]*min-width: 0/.test(styleCss));
  ok('هر سه دکمه ظرفِ برچسب دارند (متن+شمارنده کنارِ هم)',
    (html.match(/class="reports-switcher-label"/g) || []).length === 3);
  ok('کش‌باسترِ style.css به‌روز شده است', /assets\/css\/style\.css\?v=95/.test(html));
}

/* ── اجرای عملکردیِ تبِ «چت ها» در پیگیری (jsdom با صفحه‌ی پروفایل) ── */
section('اجرای عملکردیِ تبِ چت‌های پیگیری (jsdom)');
{
  const INDEX = read('index.html');
  const PROFILE_SCREEN = (/<!-- ============ SCREEN 4: PROFILE ============ -->([\s\S]*?)<!-- ============ SCREEN: PROFILE EDIT/.exec(INDEX) || [])[1] || '';
  ok('صفحه‌ی پروفایل از index.html استخراج شد', PROFILE_SCREEN.length > 1000);

  const THREADS = [
    { id: 21, title: 'پشتیبانی آنلاین', status: 'open', department: 'پشتیبانی شهرداری', unread_citizen: 1, last_message_at: '2026-11-16 11:00:00', last_sender: 'admin', closed_at: '', rating: 0, created_at: '2026-11-16 10:00:00' },
  ];
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!DOCTYPE html><html lang="fa" dir="rtl"><body>' + PROFILE_SCREEN + '</body></html>',
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.getCurrentPhone = () => '09120000001';
  w.reports = [];
  w.fetch = async () => ({ ok: true, json: async () => ({ success: true, threads: THREADS }) });
  w.eval(read('core/state.js'));
  w.eval(read('modules/reports.js'));

  ok('switchProfileTrackTab روی window است', typeof w.switchProfileTrackTab === 'function');

  /* سوییچ به تبِ چت‌ها */
  w.switchProfileTrackTab('chats');
  for (let i = 0; i < 40; i++) {
    const el = w.document.getElementById('profileSupportListWrap');
    if (el && el.querySelectorAll('.report-item').length >= 1) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const wrap = w.document.getElementById('profileSupportListWrap');
  ok('گفتگو در تبِ چت‌های پیگیری رندر شد', wrap && wrap.querySelectorAll('.report-item').length === 1);
  ok('پنلِ چت‌ها نمایش و پنلِ پیگیری پنهان است',
    w.document.getElementById('profileTrackPaneChats').style.display === 'flex'
    && w.document.getElementById('profileTrackPaneTrack').style.display === 'none');
  ok('دکمه‌ی «چت ها» active و «پیگیری» غیرفعال است',
    w.document.getElementById('profileTrackTabChats').classList.contains('active')
    && !w.document.getElementById('profileTrackTabTrack').classList.contains('active'));

  /* بازگشت به تبِ پیگیری */
  w.switchProfileTrackTab('track');
  ok('بازگشت به تبِ پیگیری پنل‌ها را برمی‌گرداند',
    w.document.getElementById('profileTrackPaneTrack').style.display === 'flex'
    && w.document.getElementById('profileTrackPaneChats').style.display === 'none');

  try { w.close(); } catch (e) { /* مهم نیست */ }
}

/* ══════════ ۹) تبِ چهارم «چت‌های پشتیبانی» در صفحه‌ی «پیگیری درخواست» ══════════ */
section('تبِ چهارم «چت‌های پشتیبانی» در صفحه‌ی پیگیری درخواست');
{
  const html = read('index.html');
  const reportsJs = read('modules/reports.js');

  /* ── ساختاری ── */
  ok('تبِ چهارم «چت‌های پشتیبانی» در #trackFilterTabs هست',
    html.includes('data-trackfilter="chats"') && html.includes("filterTrackList('chats', this)") && html.includes('>چت‌های پشتیبانی</button>'));
  ok('آیکونِ تبِ چت‌ها message است',
    html.includes('data-eplak-icon="message" data-icon-size="14" class="filter-tab-icon"></span>چت‌های پشتیبانی'));
  ok('چهار تبِ پیگیری کنارِ هم‌اند (همه/گزارش‌ها/تیکت‌ها/چت‌ها)',
    (html.match(/data-trackfilter="/g) || []).length === 4);
  ok('تبِ تیکت‌ها چتِ پشتیبانی را کنار می‌گذارد (چت تیکت نیست)',
    reportsJs.includes("if (t.channel === 'support') return; // چتِ پشتیبانی تیکت نیست"));
  ok('تبِ چت‌ها فقط چت‌های پشتیبانی را می‌آورد',
    reportsJs.includes("if (t.channel !== 'support') return; // فقط چت‌های پشتیبانی"));
  ok('آیتمِ چت بجِ «💬 چت» دارد (نه «تیکت»)', reportsJs.includes('>💬 چت</span>'));
  ok('کلیک روی آیتمِ چت صفحه‌ی چت را باز می‌کند (نه جزئیاتِ تیکت)',
    reportsJs.includes('const onClickCall = isChat ? `openSupportChat()`'));
  ok('پیامِ حالتِ خالیِ تبِ چت‌ها مخصوصِ چت است',
    reportsJs.includes("'در حال حاضر چت پشتیبانی برای نمایش وجود ندارد.'"));
}

/* ── اجرای عملکردیِ تب‌های صفحه‌ی پیگیری (jsdom با صفحه‌ی پیگیری) ── */
section('اجرای عملکردیِ تب‌های صفحه‌ی پیگیری (jsdom)');
{
  const INDEX = read('index.html');
  const TRACK_SCREEN = (/<!-- ============ SCREEN: TRACK REQUEST ============ -->([\s\S]*?)<!-- ============ SCREEN: NEWS LIST/.exec(INDEX) || [])[1] || '';
  ok('صفحه‌ی پیگیری از index.html استخراج شد', TRACK_SCREEN.length > 1000);

  const dom = new JSDOM('<!DOCTYPE html><html lang="fa" dir="rtl"><body>' + TRACK_SCREEN + '</body></html>',
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.getCurrentPhone = () => '';
  w.reports = [];
  let supportOpened = 0;
  w.openSupportChat = () => { supportOpened++; };
  w.fetch = async () => ({ ok: true, json: async () => ({ success: true, tickets: [] }) });
  w.eval(read('core/state.js'));
  w.eval(read('modules/reports.js'));

  ok('filterTrackList روی window است', typeof w.filterTrackList === 'function');

  /* یک تیکتِ واقعی + یک چتِ پشتیبانی */
  w.tickets.length = 0;
  w.tickets.push(
    { id: 't1', code: 'TK-1403-1001', title: 'درخواست آسفالت', status: 'pending', department: 'عمران', created_at: '2026-11-16 09:00:00', channel: 'ticket', reply: '' },
    { id: 't2', code: 'TK-1403-1003', title: 'پشتیبانی آنلاین', status: 'open', department: 'پشتیبانی شهرداری', created_at: '2026-11-16 10:00:00', channel: 'support', reply: '' }
  );

  const list = () => w.document.querySelectorAll('#trackRecentList .report-item');
  const texts = () => Array.from(list()).map(el => el.textContent);

  w.filterTrackList('tickets');
  ok('تبِ تیکت‌ها فقط تیکتِ واقعی را نشان می‌دهد (چت نیست)',
    list().length === 1 && texts().some(t => t.includes('TK-1403-1001')) && !texts().some(t => t.includes('TK-1403-1003')));

  w.filterTrackList('chats');
  ok('تبِ چت‌ها فقط چتِ پشتیبانی را نشان می‌دهد',
    list().length === 1 && texts().some(t => t.includes('TK-1403-1003')) && !texts().some(t => t.includes('TK-1403-1001')));
  ok('آیتمِ چت بجِ «چت» دارد (نه «تیکت»)',
    texts().some(t => t.includes('چت')) && !texts().some(t => t.includes('تیکت')));

  w.filterTrackList('all');
  ok('تبِ «همه موارد» هر دو را نشان می‌دهد', list().length === 2);

  /* کلیک روی آیتمِ چت → صفحه‌ی چت (jsdom با outside-only هندلرِ inline را اجرا نمی‌کند؛ onclick را دستی می‌خوانیم) */
  w.filterTrackList('chats');
  const chatOnclick = list()[0].getAttribute('onclick') || '';
  ok('onclickِ آیتمِ چت openSupportChat است (نه openTicketDetail)', chatOnclick === 'openSupportChat()', chatOnclick);
  w.eval(chatOnclick);
  ok('کلیک روی چت، صفحه‌ی چت را باز می‌کند (نه تیکت)', supportOpened === 1);

  try { w.close(); } catch (e) { /* مهم نیست */ }
}

console.log('\n' + '='.repeat(52));
console.log(`CONTACT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);

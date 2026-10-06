/* modules/clock-lux.js — ساعت و تقویم لوکس پیشخوان
   ─ ساعت آنالوگ لوکس (SVG زنده با عقربهٔ ثانیهٔ لغزان)
   ─ دیجیتال + برچسب صبح/ظهر/عصر/شب
   ─ سه‌گانهٔ تاریخ: شمسی + قمری (آوینی → Intl → محاسباتی) + میلادی
   ─ تقویم ماه شمسی: ناوبری ماه‌ها، جمعه‌ها و تعطیلات رسمی، انتخاب روز
   بدون تغییر در dashboard.js (همان idهای قبلی همچنان دیجیتال/تاریخ را می‌رانند) */
(function () {
  'use strict';

  /* ───────────── ابزارهای عمومی ───────────── */
  function fa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isEnglish() {
    try {
      if (window.i18n && typeof window.i18n.getLanguage === 'function') return window.i18n.getLanguage() === 'en';
      if (window.i18n && window.i18n.currentLang === 'en') return true;
    } catch (e) {}
    return false;
  }
  function el(id) { return document.getElementById(id); }

  const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const J_MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
  const W_LETTERS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const W_FULL = ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  const W_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const G_MONTHS_FA = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
  const G_MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const H_MONTHS_FA = ['', 'محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه'];
  const H_MONTHS_EN = ['', 'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'];
  /* تعطیلات رسمی ثابت شمسی (ماه، روز) — مناسبت‌های قمری هر سال جابه‌جا می‌شوند */
  const HOLIDAYS = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 12], [1, 13], [3, 14], [3, 15], [11, 22], [11, 29]];

  /* ───────────── تبدیل تاریخ (هم‌الگوریتم dashboard.js + معکوس) ───────────── */
  function toJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100))
      + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }
  function toGregorian(jy, jm, jd) {
    let gy = (jy <= 979) ? 621 : 1600;
    jy -= (jy <= 979) ? 0 : 979;
    let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4)
      + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0);
    const md = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    while (gm < 12 && gd > md[gm]) { gd -= md[gm]; gm++; }
    return [gy, gm + 1, gd];
  }
  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    const g1 = toGregorian(jy, 12, 1), g2 = toGregorian(jy + 1, 1, 1);
    return Math.round((Date.UTC(g2[0], g2[1] - 1, g2[2]) - Date.UTC(g1[0], g1[1] - 1, g1[2])) / 86400000);
  }
  function jWeekCol(date) { return (date.getDay() + 1) % 7; } /* شنبه=ستون ۰ */

  /* ───────────── هجری قمری: آوینی → Intl → الگوریتم tabular ───────────── */
  function hijriFromAviny() {
    try {
      const q = window.eplakCityLive && typeof window.eplakCityLive.getHijri === 'function'
        ? window.eplakCityLive.getHijri() : null;
      if (q && q.y && q.m && q.d) return q;
    } catch (e) {}
    return null;
  }
  function hijriFromIntl(date) {
    try {
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',
        { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(date);
      const get = function (t) { const p = parts.find(function (x) { return x.type === t; }); return p ? parseInt(p.value, 10) : null; };
      const y = get('year'), m = get('month'), d = get('day');
      if (y && m && d) return { y: y, m: m, d: d };
    } catch (e) {}
    return null;
  }
  function hijriArith(date) {
    const jd = Math.floor(date.getTime() / 86400000) + 2440588;
    let l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    const j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
    l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
    const m = Math.floor((24 * l) / 709);
    const d = l - Math.floor((709 * m) / 24);
    const y = 30 * n + j - 30;
    return { y: y, m: m, d: d };
  }
  /* آوینی فقط «امروز» را می‌دهد؛ برای روزهای دیگر: Intl → الگوریتم */
  function getHijri(date) {
    const now = new Date();
    const t = date || now;
    const sameDay = now.getFullYear() === t.getFullYear() && now.getMonth() === t.getMonth() && now.getDate() === t.getDate();
    if (sameDay) {
      const a = hijriFromAviny();
      if (a) return a;
    }
    return hijriFromIntl(t) || hijriArith(t);
  }

  /* ───────────── ساعت آنالوگ لوکس ───────────── */
  function buildAnalog() {
    const C = 100;
    let ticks = '';
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 - 90) * Math.PI / 180;
      const major = i % 5 === 0;
      const r1 = major ? 74 : 79, r2 = 84;
      const x1 = (C + r1 * Math.cos(a)).toFixed(2), y1 = (C + r1 * Math.sin(a)).toFixed(2);
      const x2 = (C + r2 * Math.cos(a)).toFixed(2), y2 = (C + r2 * Math.sin(a)).toFixed(2);
      ticks += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="'
        + (major ? 'rgba(0,229,195,0.9)' : 'rgba(148,163,184,0.35)') + '" stroke-width="'
        + (major ? 2.4 : 1) + '" stroke-linecap="round"/>';
    }
    let nums = '';
    for (let h = 1; h <= 12; h++) {
      const a = (h * 30 - 90) * Math.PI / 180;
      const x = (C + 62 * Math.cos(a)).toFixed(2), y = (C + 62 * Math.sin(a)).toFixed(2);
      nums += '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" class="lux-dial-num'
        + (h === 12 ? ' lux-dial-12' : '') + '">' + fa(h) + '</text>';
    }
    /* ── سه چرخ‌دندهٔ متحرک (موتور لوکس اسکلتون) ── */
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function gear(cx, cy, r, teeth, th, dur, dir) {
      const toothW = r > 13 ? 4.2 : (r > 10 ? 3.6 : 3);
      const spokeW = r > 13 ? 3.2 : 2.6;
      let s = '<g class="lux-gear">';
      for (let i = 0; i < teeth; i++) {
        const a = (i * 360 / teeth - 90) * Math.PI / 180;
        const x1 = (cx + (r - 0.5) * Math.cos(a)).toFixed(2), y1 = (cy + (r - 0.5) * Math.sin(a)).toFixed(2);
        const x2 = (cx + (r + th) * Math.cos(a)).toFixed(2), y2 = (cy + (r + th) * Math.sin(a)).toFixed(2);
        s += '<line class="lux-gear-tooth" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#8ba0b6" stroke-width="' + toothW + '"/>';
      }
      s += '<circle class="lux-gear-base" cx="' + cx + '" cy="' + cy + '" r="' + (r - 1) + '" fill="url(#luxGear)" stroke="#5c6f86" stroke-width="1"/>';
      for (let k = 0; k < 3; k++) {
        const a = (k * 120 - 90) * Math.PI / 180;
        const x1 = (cx + r * 0.14 * Math.cos(a)).toFixed(2), y1 = (cy + r * 0.14 * Math.sin(a)).toFixed(2);
        const x2 = (cx + r * 0.62 * Math.cos(a)).toFixed(2), y2 = (cy + r * 0.62 * Math.sin(a)).toFixed(2);
        s += '<line class="lux-gear-spoke" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#7f92a8" stroke-width="' + spokeW + '" stroke-linecap="round"/>';
      }
      s += '<circle class="lux-gear-hole" cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.36).toFixed(1) + '" fill="#0c1422"/>'
        + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.16).toFixed(1) + '" fill="#22d3c5"/>';
      if (!reduceMotion) {
        s += '<animateTransform attributeName="transform" attributeType="XML" type="rotate"'
          + ' from="0 ' + cx + ' ' + cy + '" to="' + (dir * 360) + ' ' + cx + ' ' + cy + '"'
          + ' dur="' + dur + 's" repeatCount="indefinite"/>';
      }
      return s + '</g>';
    }
    const gears = gear(100, 134, 15, 12, 5, 36, 1)   /* بزرگ — کند */
      + gear(77.5, 119, 11, 10, 4, 24, -1)           /* میانه — خلاف‌گرد */
      + gear(121.5, 119, 8.5, 8, 3.5, 15, 1);        /* کوچک — تند */
    return '<svg id="luxAnalog" class="lux-analog" viewBox="0 0 200 200" role="img" aria-label="ساعت آنالوگ">'
      + '<defs>'
      + '<radialGradient id="luxFace" cx="35%" cy="30%" r="80%">'
      + '<stop offset="0" stop-color="#1a2536"/><stop offset="0.75" stop-color="#101a2a"/><stop offset="1" stop-color="#0a111e"/>'
      + '</radialGradient>'
      + '<linearGradient id="luxRing" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#3b4a63"/><stop offset="0.5" stop-color="#141d2e"/><stop offset="1" stop-color="#2b3a52"/>'
      + '</linearGradient>'
      + '<linearGradient id="luxGear" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#9db0c6"/><stop offset="0.5" stop-color="#4c5d73"/><stop offset="1" stop-color="#8497ad"/>'
      + '</linearGradient>'
      + '</defs>'
      + '<circle class="lux-face" cx="100" cy="100" r="96" fill="url(#luxFace)" stroke="url(#luxRing)" stroke-width="3"/>'
      + '<circle class="lux-face-in" cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>'
      + '<circle class="lux-face-in2" cx="100" cy="100" r="70" fill="none" stroke="rgba(0,229,195,0.08)" stroke-width="1"/>'
      + ticks + nums
      + '<text x="100" y="76" text-anchor="middle" class="lux-dial-brand">EPLAK</text>'
      + gears
      /* عقربه‌ها با رنگ توپر — گرادیان روی خط عمودی در مرورگرها رندر نمی‌شود (باگ قبلی نامرئی‌شدن) */
      + '<g id="luxHandH" transform="rotate(0 100 100)"><line x1="100" y1="112" x2="100" y2="52" stroke="#dce6f2" stroke-width="5.5" stroke-linecap="round"/></g>'
      + '<g id="luxHandM" transform="rotate(0 100 100)"><line x1="100" y1="116" x2="100" y2="36" stroke="#f4f8fd" stroke-width="3.8" stroke-linecap="round"/></g>'
      + '<g id="luxHandS" transform="rotate(0 100 100)" class="lux-second-g"><line x1="100" y1="122" x2="100" y2="30" stroke="#22d3c5" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="122" r="3" fill="#22d3c5"/></g>'
      + '<circle class="lux-cap" cx="100" cy="100" r="6" fill="#0f1622" stroke="#2b3a52" stroke-width="2"/>'
      + '<circle class="lux-cap-dot" cx="100" cy="100" r="2.2" fill="#22d3c5"/>'
      + '</svg>';
  }

  function startAnalog() {
    const hH = el('luxHandH'), hM = el('luxHandM'), hS = el('luxHandS');
    if (!hH || !hM || !hS) return;
    if (typeof requestAnimationFrame !== 'function') return;
    function frame() {
      if (!document.hidden && hH.isConnected) {
        const now = new Date();
        const s = now.getSeconds() + now.getMilliseconds() / 1000;
        const m = now.getMinutes() + s / 60;
        const h = (now.getHours() % 12) + m / 60;
        hS.setAttribute('transform', 'rotate(' + (s * 6).toFixed(2) + ' 100 100)');
        hM.setAttribute('transform', 'rotate(' + (m * 6).toFixed(2) + ' 100 100)');
        hH.setAttribute('transform', 'rotate(' + (h * 30).toFixed(2) + ' 100 100)');
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ───────────── صبح / ظهر / عصر / شب ───────────── */
  function meridiemLabel(h) {
    if (isEnglish()) return h < 12 ? 'AM' : 'PM';
    if (h >= 5 && h < 12) return 'صبح';
    if (h >= 12 && h < 15) return 'ظهر';
    if (h >= 15 && h < 19) return 'عصر';
    return 'شب';
  }

  /* ───────────── سه‌گانهٔ تاریخ ───────────── */
  /* ───────────── مناسبت‌های روز (تقویم رسمی ایران + اعیاد قمری) ───────────── */
  const J_OCC = {
    1: {1:'جشن نوروز، آغاز سال نو',2:'عید نوروز',3:'عید نوروز',4:'عید نوروز',12:'روز جمهوری اسلامی',13:'سیزده‌بدر، روز طبیعت',20:'روز ملی فناوری هسته‌ای',23:'روز دندانپزشک',25:'روز بزرگداشت عطار نیشابوری',29:'روز ارتش جمهوری اسلامی',30:'روز علوم آزمایشگاهی'},
    2: {1:'روز بزرگداشت سعدی',2:'روز زمین پاک',3:'روز بزرگداشت شیخ بهایی، روز ملی کارآفرینی',12:'روز معلم',22:'روز مشاغل خانگی',25:'روز بزرگداشت فردوسی، روز پاسداشت زبان فارسی',27:'روز ارتباطات و روابط عمومی',28:'روز بزرگداشت خیام، روز ازدواج'},
    3: {3:'روز مقاومت و پیروزی، آزادسازی خرمشهر',14:'رحلت امام خمینی',15:'قیام ۱۵ خرداد'},
    4: {1:'روز اصناف',7:'روز قوه قضائیه، شهادت آیت‌الله بهشتی',8:'روز مبارزه با سلاح‌های شیمیایی و میکروبی',10:'روز صنعت و معدن',14:'روز قلم',21:'روز عفاف و حجاب',22:'روز فناوری اطلاعات، بزرگداشت خوارزمی',25:'روز بهزیستی و تأمین اجتماعی'},
    5: {6:'روز ترویج آموزش‌های فنی و حرفه‌ای',8:'روز بزرگداشت شیخ شهاب‌الدین سهروردی',14:'صدور فرمان مشروطیت',17:'روز خبرنگار'},
    6: {1:'روز پزشک، بزرگداشت ابن‌سینا',2:'آغاز هفته دولت',4:'روز کارمند',5:'روز بزرگداشت محمد بن زکریای رازی، روز داروسازی',8:'روز مبارزه با تروریسم',11:'روز صنعت چاپ',13:'روز تعاون، بزرگداشت ابوریحان بیرونی',21:'روز سینما',27:'روز شعر و ادب پارسی، بزرگداشت استاد شهریار',30:'روز گفتگوی تمدن‌ها',31:'آغاز جنگ تحمیلی، هفته دفاع مقدس'},
    7: {1:'آغاز سال تحصیلی',7:'روز آتش‌نشانی و خدمات ایمنی',8:'روز بزرگداشت مولوی',13:'روز نیروی انتظامی',14:'روز دامپزشکی',15:'روز روستا و عشایر',20:'روز بزرگداشت حافظ',24:'روز پرستار، روز پیوند اولیا و مربیان',26:'روز تربیت بدنی و ورزش'},
    8: {1:'روز آمار و برنامه‌ریزی',13:'روز دانش‌آموز، روز ملی مبارزه با استکبار',24:'روز کتاب، کتاب‌خوانی و کتابدار'},
    9: {5:'روز بسیج مستضعفین',7:'روز نیروی دریایی',10:'روز مجلس، شهادت آیت‌الله مدرس',12:'روز قانون اساسی',13:'روز بیمه',16:'روز دانشجو',25:'روز پژوهش',26:'روز حمل و نقل و رانندگان',30:'شب یلدا'},
    10: {5:'روز ایمنی در برابر زلزله و کاهش اثر بلایای طبیعی',9:'روز بصیرت و میثاق امت با ولایت'},
    11: {12:'بازگشت امام خمینی، آغاز دهه فجر',19:'روز نیروی هوایی',22:'پیروزی انقلاب اسلامی',29:'قیام مردم تبریز'},
    12: {5:'روز مهندسی، بزرگداشت خواجه نصیرالدین طوسی',14:'روز احسان و نیکوکاری',15:'روز درختکاری',25:'روز بزرگداشت پروین اعتصامی'}
  };
  const H_OCC = {
    1: {1:'آغاز سال نو قمری',9:'تاسوعای حسینی',10:'عاشورای حسینی'},
    2: {20:'اربعین حسینی',28:'رحلت رسول اکرم، شهادت امام حسن مجتبی',30:'شهادت امام رضا'},
    3: {17:'میلاد رسول اکرم و امام جعفر صادق'},
    6: {3:'شهادت حضرت فاطمه زهرا'},
    7: {13:'ولادت امام علی',27:'مبعث رسول اکرم'},
    8: {15:'ولادت امام زمان (عج)'},
    9: {21:'شهادت امام علی'},
    10: {1:'عید سعید فطر',2:'تعطیل عید سعید فطر',25:'شهادت امام جعفر صادق'},
    11: {1:'ولادت حضرت معصومه، روز دختران',11:'ولادت امام رضا'},
    12: {10:'عید سعید قربان',18:'عید سعید غدیر خم'}
  };
  function dayOccasions(jm, jd, hj) {
    const list = [];
    const jr = J_OCC[jm];
    if (jr && jr[jd]) list.push(jr[jd]);
    if (hj) { const hr = H_OCC[hj.m]; if (hr && hr[hj.d]) list.push(hr[hj.d]); }
    return list;
  }

  function updateDates(now) {
    const hEl = el('luxHijriDate'), gEl = el('luxGregDate'), mEl = el('luxMeridiem');
    const en = isEnglish();
    if (mEl) mEl.textContent = meridiemLabel(now.getHours());
    if (hEl) {
      const hj = getHijri(now);
      if (hj) {
        hEl.textContent = en
          ? hj.d + ' ' + H_MONTHS_EN[hj.m] + ' ' + hj.y + ' AH'
          : fa(hj.d) + ' ' + (H_MONTHS_FA[hj.m] || '') + ' ' + fa(hj.y) + ' (قمری)';
        hEl.style.display = '';
      } else {
        hEl.style.display = 'none';
      }
    }
    if (gEl) {
      gEl.textContent = en
        ? now.getDate() + ' ' + G_MONTHS_EN[now.getMonth()] + ' ' + now.getFullYear()
        : fa(now.getDate()) + ' ' + G_MONTHS_FA[now.getMonth()] + ' ' + fa(now.getFullYear()) + ' میلادی';
    }
    /* مناسبت‌های روز — جای خالی زیر دکمهٔ «تقویم» */
    const occEl = el('luxOccasion');
    if (occEl) {
      if (en) { occEl.hidden = true; }
      else {
        const jn = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const list = dayOccasions(jn[1], jn[2], getHijri(now));
        /* هر مناسبت یک آیتم؛ flex-wrap همه را بدون بریدن جا می‌دهد */
        if (list.length) {
          occEl.innerHTML = list.map(function (o) {
            var occIcon = (window.EplakIcons ? window.EplakIcons.get('sparkle', { size: 13 }) : '✦ ');
            return '<span class="lux-occ-item">' + occIcon + ' ' + o + '</span>';
          }).join('');
          occEl.hidden = false;
        } else { occEl.innerHTML = ''; occEl.hidden = true; }
      }
    }

    /* نیمه‌شب: برچسب‌ها و تقویم تازه شوند */
    const jToday = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (jToday[2] !== _lastJDay) {
      _lastJDay = jToday[2];
      if (_calOpen || _forceCalRefresh) renderCalendar();
    }
  }
  let _lastJDay = -1;
  let _forceCalRefresh = true;

  /* ───────────── تقویم ماه شمسی ───────────── */
  let _view = null;   /* {jy, jm} ماه در حال نمایش */
  let _sel = null;    /* {jy, jm, jd} روز انتخاب‌شده */
  let _calOpen = false;

  function fmtFull(jy, jm, jd) {
    const en = isEnglish();
    return en
      ? jd + ' ' + J_MONTHS_EN[jm - 1] + ' ' + jy
      : fa(jd) + ' ' + J_MONTHS[jm - 1] + ' ' + fa(jy);
  }
  function renderCalendar() {
    const grid = el('luxCalGrid'), title = el('luxCalTitle'), foot = el('luxCalFoot');
    if (!grid || !_view) return;
    const en = isEnglish();
    if (title) {
      title.textContent = en
        ? J_MONTHS_EN[_view.jm - 1] + ' ' + _view.jy
        : J_MONTHS[_view.jm - 1] + ' ' + fa(_view.jy);
    }
    const now = new Date();
    const tj = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let html = '';
    for (let i = 0; i < 7; i++) {
      html += '<span class="lux-cal-wd' + (i === 6 ? ' lux-cal-wd-fri' : '') + '">' + W_LETTERS[i] + '</span>';
    }
    const len = jalaliMonthLength(_view.jy, _view.jm);
    const g1 = toGregorian(_view.jy, _view.jm, 1);
    const firstCol = jWeekCol(new Date(g1[0], g1[1] - 1, g1[2]));
    for (let b = 0; b < firstCol; b++) html += '<span class="lux-cal-blank"></span>';
    for (let d = 1; d <= len; d++) {
      const col = (firstCol + d - 1) % 7;
      const isFri = col === 6;
      const isHol = HOLIDAYS.some(function (h) { return h[0] === _view.jm && h[1] === d; });
      const isToday = tj[0] === _view.jy && tj[1] === _view.jm && tj[2] === d;
      const isSel = _sel && _sel.jy === _view.jy && _sel.jm === _view.jm && _sel.jd === d;
      const cls = 'lux-cal-day'
        + (isFri ? ' lux-fri' : '')
        + (isHol ? ' lux-hol' : '')
        + (isToday ? ' lux-today' : '')
        + (isSel && !isToday ? ' lux-sel' : '');
      html += '<button type="button" class="' + cls + '" data-d="' + d + '" '
        + 'aria-label="' + fmtFull(_view.jy, _view.jm, d) + '">' + fa(d) + '</button>';
    }
    grid.innerHTML = html;

    const btns = grid.querySelectorAll('.lux-cal-day');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        _sel = { jy: _view.jy, jm: _view.jm, jd: +b.getAttribute('data-d') };
        renderCalendar();
      });
    });

    if (foot) {
      const s = _sel || { jy: tj[0], jm: tj[1], jd: tj[2] };
      const g = toGregorian(s.jy, s.jm, s.jd);
      const h = getHijri(new Date(g[0], g[1] - 1, g[2]));
      const gd = new Date(g[0], g[1] - 1, g[2]);
      const parts = [];
      parts.push(fmtFull(s.jy, s.jm, s.jd));
      if (h) parts.push(en ? h.d + ' ' + H_MONTHS_EN[h.m] + ' ' + h.y + ' AH' : fa(h.d) + ' ' + (H_MONTHS_FA[h.m] || '') + ' ' + fa(h.y));
      parts.push(en
        ? gd.getDate() + ' ' + G_MONTHS_EN[gd.getMonth()] + ' ' + gd.getFullYear()
        : fa(gd.getDate()) + ' ' + G_MONTHS_FA[gd.getMonth()] + ' ' + fa(gd.getFullYear()));
      foot.textContent = parts.join('  •  ');
    }
  }
  function shiftMonth(delta) {
    let m = _view.jm + delta, y = _view.jy;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    _view = { jy: y, jm: m };
    renderCalendar();
  }
  function goToday() {
    const now = new Date();
    const t = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    _view = { jy: t[0], jm: t[1] };
    _sel = { jy: t[0], jm: t[1], jd: t[2] };
    renderCalendar();
  }
  function setCalOpen(open) {
    _calOpen = !!open;
    const panel = el('luxCalPanel'), btn = el('luxCalToggle');
    if (panel) {
      panel.classList.toggle('open', _calOpen);
      panel.setAttribute('aria-hidden', _calOpen ? 'false' : 'true');
    }
    if (btn) {
      btn.classList.toggle('open', _calOpen);
      btn.setAttribute('aria-expanded', _calOpen ? 'true' : 'false');
    }
    if (_calOpen) renderCalendar();
  }

  /* ───────────── راه‌اندازی ───────────── */
  function init() {
    const holder = el('luxAnalogHolder');
    if (holder && !holder.firstChild) holder.innerHTML = buildAnalog();

    const now = new Date();
    const tj = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    _view = { jy: tj[0], jm: tj[1] };
    _sel = { jy: tj[0], jm: tj[1], jd: tj[2] };

    startAnalog();
    updateDates(now);
    setInterval(function () { updateDates(new Date()); }, 30000);
    renderCalendar();

    const btn = el('luxCalToggle');
    if (btn) btn.addEventListener('click', function () { setCalOpen(!_calOpen); });
    const prev = el('luxCalPrev'), next = el('luxCalNext'), today = el('luxCalToday');
    if (prev) prev.addEventListener('click', function () { shiftMonth(-1); });
    if (next) next.addEventListener('click', function () { shiftMonth(1); });
    if (today) today.addEventListener('click', goToday);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('languagechange', function () {
        updateDates(new Date());
        renderCalendar();
      });
      /* وقتی دادهٔ زندهٔ آوینی رسید، تاریخ قمری با منبع ایرانی تازه می‌شود */
      window.addEventListener('eplak:citylive-painted', function () {
        updateDates(new Date());
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* API عمومی کوچک */
  window.eplakClockLux = {
    open: function () { setCalOpen(true); },
    close: function () { setCalOpen(false); },
    today: goToday,
    renderCalendar: renderCalendar
  };
})();

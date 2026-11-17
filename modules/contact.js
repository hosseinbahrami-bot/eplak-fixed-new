/* ============================================================================
   modules/contact.js — «تماس با شهرداری»: ایمیل و آدرسِ شهرداری ورامین

   دو کارتِ صفحه‌ی «تماس با ما» (screen-contact در index.html) پیش‌تر فقط
   تزئینی بودند (cursor:pointer بدونِ onclick) و ایمیلِ قدیمیِ info@varamin.ir
   را نشان می‌دادند. حالا:

   • کارتِ «ایمیل شهرداری» → info@eplak.ir؛ با لمس، برنامه‌ی ایمیلِ گوشی
     (جیمیل) با یک پیامِ آماده باز می‌شود تا شهروند بنویسد و بفرستد. اگر هنوز
     حسابِ ایمیلی وصل نشده باشد، خودِ برنامه‌ی ایمیل از کاربر می‌خواهد اول
     حسابش (جیمیل) را اضافه کند — همان رفتاری که کاربر خواسته بود.
   • کارتِ «آدرس شهرداری» → آدرسِ دقیقِ ساختمانِ مرکزیِ شهرداری ورامین
     («ورامین، ابتدای خیابان شهید بهشتی، میدان شهرداری، روبروی فرمانداری»)؛
     با لمس، برنامه‌ی «نشان» روی همان نقطه باز می‌شود (و اگر نصب نباشد،
     نسخه‌ی وبِ نشان). مختصات از همان رکوردِ «شهرداری ورامین (ساختمان
     مرکزی)» در core/places-data.js برداشته شده تا با نقشه‌ی اماکن یکی باشد.

   باز کردنِ لینک‌ها دقیقاً همان قراردادِ modules/city-map.js است:
   پلِ بومیِ اندروید (AndroidApp.openNeshan / openUrl) ← intent:// نشان در
   مرورگرِ اندروید ← طرحِ neshan:// در iOS با پشتیبانِ وب ← پنجره‌ی تازه در
   دسکتاپ. هیچ درخواستِ شبکه‌ای از اینجا زده نمی‌شود.
   ============================================================================ */
(function (root) {
  'use strict';

  /* ایمیلِ رسمیِ شهرداری (همان که کاربر تعیین کرد) */
  var MUNICIPALITY_EMAIL = 'info@eplak.ir';

  /* ساختمانِ مرکزیِ شهرداری ورامین — همان رکوردِ id:"municipality" در
     core/places-data.js تا آدرسِ این کارت با نقطه‌ی نقشه‌ی اماکن یکی باشد. */
  var MUNICIPALITY_POS = { lat: 35.32831, lng: 51.64017 };

  function bridge() { return root.AndroidApp || null; }

  function tr(key, fallback) {
    if (typeof root.t === 'function') return root.t(key, fallback);
    return fallback;
  }

  /* باز کردنِ یک آدرسِ خارجی (mailto: / intent: / https:) از راهِ پلِ بومی
     اگر باشد، وگرنه با هدایتِ همین صفحه — همان قراردادِ dial/openInstall در
     city-map.js. */
  function openExternal(url) {
    var b = bridge();
    try {
      if (b && typeof b.openUrl === 'function') { b.openUrl(url); return true; }
    } catch (e) { /* ادامه با هدایتِ صفحه */ }
    try { root.location.href = url; return true; } catch (e) { return false; }
  }

  /* ── ایمیل به شهرداری ───────────────────────────────────────────────────
     mailto: در اندروید برنامه‌ی ایمیلِ پیش‌فرض (جیمیل) را با پیامِ آماده باز
     می‌کند؛ اگر حسابی تنظیم نشده باشد، خودِ جیمیل از کاربر می‌خواهد حسابش
     را وصل کند. موضوع و متنِ آغازین از i18n می‌آیند تا در هر دو زبان درست
     باشند. */
  function openMunicipalityEmail() {
    var subject = tr('contact_email_subject', 'پیام به شهرداری ورامین');
    var body = tr('contact_email_body', 'سلام،\n\n');
    var url = 'mailto:' + MUNICIPALITY_EMAIL
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);
    openExternal(url);
  }

  /* ── آدرسِ شهرداری در «نشان» ────────────────────────────────────────────
     لینک‌ها از EplakPlaces.neshanLinks ساخته می‌شوند (همان سازنده‌ی نقشه‌ی
     اماکن) و دقیقاً مثل launch() در city-map.js باز می‌شوند. */
  function openMunicipalityAddress() {
    var links = null;
    try {
      if (root.EplakPlaces && typeof root.EplakPlaces.neshanLinks === 'function') {
        links = root.EplakPlaces.neshanLinks(MUNICIPALITY_POS, null, 'd');
      }
    } catch (e) { links = null; }
    if (!links) return;

    var b = bridge();
    var ua = (root.navigator && root.navigator.userAgent) || '';
    try {
      if (b && typeof b.openNeshan === 'function') { b.openNeshan(links.web); return; }
      if (b && typeof b.openUrl === 'function') { b.openUrl(links.web); return; }
    } catch (e) { /* ادامه */ }

    if (/iPad|iPhone|iPod/.test(ua) || (root.navigator && root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1)) {
      /* iOS: اول طرحِ neshan:// (برنامه‌ی نشان) و اگر باز نشد، نسخه‌ی وب */
      root.location.href = links.ios;
      setTimeout(function () {
        if (!root.document.hidden) root.location.href = links.web;
      }, 1600);
      return;
    }
    if (/Android/i.test(ua)) {
      /* مرورگرِ اندروید: intent:// نشان را باز می‌کند، وگرنه وبِ نشان */
      root.location.href = links.androidIntent;
      return;
    }
    var w = null;
    try { w = root.open(links.web, '_blank'); } catch (e) { w = null; }
    if (!w) root.location.href = links.web;
  }

  root.openMunicipalityEmail = openMunicipalityEmail;
  root.openMunicipalityAddress = openMunicipalityAddress;
  root.EplakContact = {
    EMAIL: MUNICIPALITY_EMAIL,
    POS: MUNICIPALITY_POS,
    openMunicipalityEmail: openMunicipalityEmail,
    openMunicipalityAddress: openMunicipalityAddress
  };
})(typeof window !== 'undefined' ? window : this);

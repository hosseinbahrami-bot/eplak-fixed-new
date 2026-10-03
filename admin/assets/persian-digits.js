/* ============================================================
   admin/assets/persian-digits.js
   تبدیل خودکار ارقام لاتین (0-9) به فارسی (۰-۹) در تمام متن‌های
   قابل‌نمایشِ پنل مدیریت.

   نکات ایمنی:
   - فقط «گره‌های متنی» تغییر می‌کنند؛ ویژگی‌ها (attribute) دست‌نخورده
     می‌مانند تا لینک‌ها، مقادیر فرم‌ها و خروجی اکسل تغییر نکنند.
   - محتوای input / textarea / select / script / style تغییر نمی‌کند.
   - با افزودن data-keep-digits به هر عنصر، می‌توان آن را مستثنا کرد.
   ============================================================ */
(function () {
  'use strict';

  var FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  /* عناصری که محتوای آن‌ها هرگز تغییر نمی‌کند */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TITLE: 1,
    INPUT: 1, TEXTAREA: 1, SELECT: 1, PROGRESS: 1, METER: 1
  };

  /* برای مستثنا کردن دستی یک بخش */
  var SKIP_SELECTOR = '[data-keep-digits],[data-fa-digits="off"],.keep-digits,.no-fa-digits';

  function hasLatinDigit(text) {
    return !!text && /[0-9]/.test(text);
  }

  function convert(root) {
    root = root || document.body;
    if (!root || root.nodeType !== 1 && root.nodeType !== 9) { return 0; }

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !hasLatinDigit(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        var parent = node.parentElement;
        if (!parent) { return NodeFilter.FILTER_REJECT; }
        if (SKIP_TAGS[parent.tagName] || SKIP_TAGS[parent.tagName.toUpperCase()]) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest && parent.closest(SKIP_SELECTOR)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var targets = [];
    var node;
    while ((node = walker.nextNode())) { targets.push(node); }

    targets.forEach(function (textNode) {
      textNode.nodeValue = textNode.nodeValue.replace(/[0-9]/g, function (d) {
        return FA[Number(d)];
      });
    });

    return targets.length;
  }

  function run() {
    try { convert(document.body); } catch (e) { /* بی‌صدا */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.addEventListener('load', run);

  /* اجرای دوباره برای محتوای پویا (بدون ایجاد حلقه، چون فقط
     تغییرِ گره‌ها بررسی می‌شود نه تغییرِ متنِ همان گره‌ها) */
  if (typeof MutationObserver !== 'undefined') {
    var timer = null;
    var pending = [];
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (!m.addedNodes) { return; }
        for (var i = 0; i < m.addedNodes.length; i++) {
          if (m.addedNodes[i].nodeType === 1) { pending.push(m.addedNodes[i]); }
        }
      });
      if (timer) { clearTimeout(timer); }
      timer = setTimeout(function () {
        var batch = pending.slice();
        pending.length = 0;
        batch.forEach(function (el) { try { convert(el); } catch (e) {} });
      }, 80);
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* بی‌صدا */ }
  }

  /* امکان فراخوانی دستی */
  window.eplakConvertDigits = convert;
})();

/* ============================================================================
   core/upload-progress.js — پیشرفت بارگذاری «هر فایل» (عکس و فیلم) گزارش

   کار این فایل:
     • برای هر درخواست (شناسه‌ی یکتای clientRef) فهرست فایل‌ها و درصد پیشرفت
       هرکدام را نگه می‌دارد؛ هم‌زمان با ارسال، کد ارسال (core/storage.js) آن را
       به‌روز می‌کند.
     • همان فهرست را به‌صورت «نمودار خطی درصدی» برای هر فایل نشان می‌دهد:
         در حال ارسال  →  نوار + درصد (مثلاً ۴۵٪) + «۴٫۸ از ۱۰٫۶ مگابایت»
         تمام شد       →  نوار می‌رود و فقط می‌نویسد «فایل آپلود شد»
         ناموفق        →  «ارسال نشد» + دلیل + دکمه‌ی تلاش دوباره
     • این نمودار هم زیر «روند رسیدگی» (گام «ثبت گزارش» در جزئیات گزارش) و هم
       در صفحه‌ی «گزارش ثبت شد» نشان داده می‌شود.

   نکته: این وضعیت عمداً داخل خود گزارش (و localStorage) ذخیره نمی‌شود؛ پیشرفت
   یک ارسال زنده است و نباید بعد از بستن اپ، «در حال ارسال»ِ کهنه باقی بماند.

   API (window.EplakUploadProgress):
     begin(ref, files)            شروع یک دوره‌ی ارسال (فایل‌ها: File یا {name,size,kind})
     apply(ref, index, event)     رویدادهای کد ارسال: start/progress/restart/done/fail
     has(ref) / items(ref) / summary(ref)
     subscribe(ref, fn)           fn(items, summary) → تابع لغو
     bind(container, ref, opts)   نمایش زنده داخل یک عنصر؛ opts.onRetry(ref)
     renderStatic(container, items)
     itemsFromMedia(mediaList)    فایل‌های ذخیره‌شده روی سرور → «فایل آپلود شد»
   ============================================================================ */
(function (global) {
  'use strict';

  var sessions = Object.create(null);     /* ref → { items: [], listeners: [], timer: null } */
  var THROTTLE_MS = 90;                   /* بازپخش رابط بیش از ~۱۰ بار در ثانیه لازم نیست */

  /* ── زبان و رقم ──────────────────────────────────────────────────────── */
  function isEnglish() {
    try {
      return !!(global.i18n && typeof global.i18n.getLanguage === 'function' && global.i18n.getLanguage() === 'en');
    } catch (e) { return false; }
  }

  function tr(text) {
    try {
      if (global.i18n && typeof global.i18n.t === 'function') return global.i18n.t(text);
    } catch (e) { /* همان متن فارسی */ }
    return text;
  }

  function digits(value) {
    var text = String(value);
    if (isEnglish()) return text;
    return text.replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+d); }).replace(/\./g, '٫');
  }

  function formatBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1048576) {
      return digits(Math.round(n / 1048576 * 10) / 10) + ' ' + (isEnglish() ? 'MB' : 'مگابایت');
    }
    return digits(Math.max(1, Math.round(n / 1024))) + ' ' + (isEnglish() ? 'KB' : 'کیلوبایت');
  }

  function formatPercent(pct) {
    return digits(Math.max(0, Math.min(100, Math.round(pct)))) + (isEnglish() ? '%' : '٪');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* نام بلند فایل (مثل eplak-20260930-142233.webm) وسط‌چین کوتاه می‌شود */
  function shortName(name) {
    var text = String(name || '');
    if (text.length <= 26) return text;
    var dot = text.lastIndexOf('.');
    var ext = (dot > 0 && text.length - dot <= 6) ? text.slice(dot) : '';
    var base = ext ? text.slice(0, dot) : text;
    return base.slice(0, 14) + '…' + base.slice(-6) + ext;
  }

  function detectKind(file) {
    if (file && file.kind === 'video') return 'video';
    if (file && file.kind === 'image') return 'image';
    var type = String((file && file.type) || '').toLowerCase();
    if (type.indexOf('video/') === 0) return 'video';
    if (type.indexOf('image/') === 0) return 'image';
    var ext = String((file && file.name) || '').split('.').pop().toLowerCase();
    if (['mp4', 'mov', 'webm', '3gp', 'mkv', 'avi', 'mpg'].indexOf(ext) > -1) return 'video';
    return 'image';
  }

  function icon(name, size) {
    try {
      if (global.EplakIcons && typeof global.EplakIcons.get === 'function') {
        return global.EplakIcons.get(name, { size: size || 18 });
      }
    } catch (e) { /* ایموجی جایگزین */ }
    return { image: '🖼', video: '🎬', check: '✓', alert: '!', 'check-circle': '✓' }[name] || '';
  }

  /* ── وضعیت هر درخواست ─────────────────────────────────────────────────── */
  function sessionOf(ref, create) {
    var key = String(ref || '');
    if (!key) return null;
    if (!sessions[key] && create) sessions[key] = { items: [], listeners: [], timer: null };
    return sessions[key] || null;
  }

  function begin(ref, files) {
    var session = sessionOf(ref, true);
    if (!session) return [];
    session.items = Array.prototype.slice.call(files || []).map(function (file, index) {
      return {
        id: index,
        name: String((file && file.name) || ('file-' + (index + 1))),
        kind: detectKind(file),
        size: Number(file && file.size) || 0,
        loaded: 0,
        pct: 0,
        state: 'queued',
        note: ''
      };
    });
    notify(ref, true);
    return session.items;
  }

  function itemAt(ref, index) {
    var session = sessionOf(ref, false);
    return (session && session.items[index]) || null;
  }

  function clampPct(loaded, size) {
    if (!(size > 0)) return 0;
    var pct = Math.floor(Math.max(0, Math.min(1, loaded / size)) * 100);
    return pct > 99 ? 99 : pct;       /* ۱۰۰٪ فقط وقتی سرور فایل را تأیید کرد */
  }

  /* رویدادهایی که core/storage.js می‌فرستد */
  function apply(ref, index, event) {
    var item = itemAt(ref, index);
    if (!item || !event) return;
    var type = event.type;
    var immediate = false;

    if (type === 'start') {
      if (item.state === 'done') return;
      item.state = 'uploading';
      item.note = '';
      immediate = true;
    } else if (type === 'progress') {
      if (item.state === 'done') return;
      var total = Number(event.total) > 0 ? Number(event.total) : item.size;
      if (total > 0 && !item.size) item.size = total;
      var pct = clampPct(Number(event.loaded) || 0, total);
      item.loaded = Math.max(0, Number(event.loaded) || 0);
      if (item.state !== 'retrying' || pct > 0) item.state = 'uploading';
      /* درصد در یک دوره‌ی ارسال فقط جلو می‌رود (جز با restart) */
      if (pct > item.pct) item.pct = pct;
    } else if (type === 'restart') {
      if (item.state === 'done') return;
      item.state = 'retrying';
      item.loaded = 0;
      item.pct = 0;
      item.note = String(event.note || '');
      immediate = true;
    } else if (type === 'done') {
      item.state = 'done';
      item.pct = 100;
      item.loaded = item.size;
      item.note = '';
      immediate = true;
    } else if (type === 'fail') {
      if (item.state === 'done') return;
      item.state = 'failed';
      item.note = String(event.note || '');
      immediate = true;
    } else {
      return;
    }
    notify(ref, immediate);
  }

  function itemsOf(ref) {
    var session = sessionOf(ref, false);
    return session ? session.items.map(function (it) { return Object.assign({}, it); }) : [];
  }

  function has(ref) {
    var session = sessionOf(ref, false);
    return !!(session && session.items.length);
  }

  function isActive(ref) {
    return itemsOf(ref).some(function (it) {
      return it.state === 'queued' || it.state === 'uploading' || it.state === 'retrying';
    });
  }

  /* خلاصه: درصد کل بر پایه‌ی «بایت» (نه تعداد فایل) */
  function summaryOf(items) {
    var list = items || [];
    var sizeSum = 0, loadedSum = 0, done = 0, failed = 0, active = 0;
    list.forEach(function (it) {
      var size = Number(it.size) || 0;
      sizeSum += size;
      if (it.state === 'done') { done++; loadedSum += size; }
      else {
        if (it.state === 'failed') failed++; else active++;
        loadedSum += Math.min(size, Number(it.loaded) || 0);
      }
    });
    var pct = sizeSum > 0 ? Math.floor(loadedSum / sizeSum * 100) : (list.length && done === list.length ? 100 : 0);
    if (done < list.length && pct > 99) pct = 99;
    return { total: list.length, done: done, failed: failed, active: active, pct: pct, allDone: list.length > 0 && done === list.length };
  }

  function summary(ref) {
    return summaryOf(itemsOf(ref));
  }

  /* ── اطلاع‌رسانی به نمایش‌ها (با محدودکننده‌ی سرعت) ───────────────────── */
  function fire(ref) {
    var session = sessionOf(ref, false);
    if (!session) return;
    session.timer = null;
    var items = itemsOf(ref);
    var sum = summaryOf(items);
    session.listeners.slice().forEach(function (fn) {
      try { fn(items, sum); } catch (e) { /* یک شنونده‌ی خراب نباید بقیه را از کار بیندازد */ }
    });
  }

  function notify(ref, immediate) {
    var session = sessionOf(ref, false);
    if (!session) return;
    if (immediate) {
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      fire(ref);
      return;
    }
    if (session.timer) return;
    session.timer = setTimeout(function () { fire(ref); }, THROTTLE_MS);
  }

  function subscribe(ref, fn) {
    var session = sessionOf(ref, true);
    if (!session || typeof fn !== 'function') return function () {};
    session.listeners.push(fn);
    return function () {
      session.listeners = session.listeners.filter(function (f) { return f !== fn; });
    };
  }

  function clear(ref) {
    var key = String(ref || '');
    if (sessions[key] && sessions[key].timer) clearTimeout(sessions[key].timer);
    delete sessions[key];
  }

  /* ── نمایش ────────────────────────────────────────────────────────────── */
  function rowHtml(it, index, opts) {
    var showRetry = !(opts && opts.retry === false);
    var kindIcon = icon(it.kind === 'video' ? 'video' : 'image', 18);
    var name = escapeHtml(shortName(it.name));
    var size = it.size ? formatBytes(it.size) : '';

    if (it.state === 'done') {
      return '<div class="up-row is-done" data-state="done" data-idx="' + index + '">'
        + '<span class="up-ico ok">' + icon('check-circle', 20) + '</span>'
        + '<div class="up-main">'
        +   '<div class="up-done">' + escapeHtml(tr('فایل آپلود شد')) + '</div>'
        +   '<div class="up-sub"><span class="up-kind">' + kindIcon + '</span><span class="up-name">' + name + '</span></div>'
        + '</div></div>';
    }

    if (it.state === 'failed') {
      return '<div class="up-row is-failed" data-state="failed" data-idx="' + index + '">'
        + '<span class="up-ico bad">' + icon('alert', 20) + '</span>'
        + '<div class="up-main">'
        +   '<div class="up-fail">' + escapeHtml(tr('ارسال نشد')) + '</div>'
        +   '<div class="up-sub"><span class="up-kind">' + kindIcon + '</span><span class="up-name">' + name + '</span></div>'
        +   (it.note ? '<div class="up-note">' + escapeHtml(it.note) + '</div>' : '')
        +   (showRetry ? '<button type="button" class="up-retry" data-action="retry">' + escapeHtml(tr('تلاش دوباره')) + '</button>' : '')
        + '</div></div>';
    }

    var pct = it.state === 'queued' ? 0 : it.pct;
    var label = it.state === 'queued'
      ? tr('در صف ارسال')
      : (it.state === 'retrying' ? tr('تلاش دوباره…') : formatPercent(pct));
    var sub = '';
    if (it.state === 'uploading' && it.size) {
      var sent = Math.min(it.size, Number(it.loaded) || 0);
      /* فایل‌های مگابایتی «۴٫۸ از ۱۰٫۶ مگابایت»، فایل‌های کوچک «۴۰ از ۱۳۶ کیلوبایت» */
      var sentText = it.size >= 1048576
        ? digits(Math.round(sent / 1048576 * 10) / 10)
        : digits(Math.round(sent / 1024));
      sub = sentText + ' ' + (isEnglish() ? 'of' : 'از') + ' ' + formatBytes(it.size);
    } else if (it.note) {
      sub = it.note;
    } else if (size) {
      sub = size;
    }
    return '<div class="up-row is-active" data-state="' + it.state + '" data-idx="' + index + '">'
      + '<span class="up-ico">' + kindIcon + '</span>'
      + '<div class="up-main">'
      +   '<div class="up-top"><span class="up-name">' + name + '</span><span class="up-pct">' + escapeHtml(label) + '</span></div>'
      +   '<div class="up-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">'
      +     '<i class="up-fill" style="width:' + pct + '%"></i></div>'
      +   (sub ? '<div class="up-sub2">' + escapeHtml(sub) + '</div>' : '')
      + '</div></div>';
  }

  function rowsHtml(items, opts) {
    var list = items || [];
    if (!list.length) return '';
    return '<div class="up-list">' + list.map(function (it, index) { return rowHtml(it, index, opts); }).join('') + '</div>';
  }

  function setContainer(container, html) {
    if (!container) return;
    container.innerHTML = html;
    if (container.style) container.style.display = html ? '' : 'none';
  }

  function renderStatic(container, items, opts) {
    setContainer(container, rowsHtml(items, opts));
  }

  /* فایل‌های ذخیره‌شده روی سرور (گزارش‌های قدیمی‌تر) → «فایل آپلود شد» */
  function itemsFromMedia(mediaList) {
    return (Array.isArray(mediaList) ? mediaList : [])
      .filter(function (m) { return m && !m.local && (m.url || m.path); })
      .map(function (m, index) {
        return {
          id: index,
          name: String(m.name || ''),
          kind: detectKind(m),
          size: Number(m.size) || 0,
          loaded: Number(m.size) || 0,
          pct: 100,
          state: 'done',
          note: ''
        };
      });
  }

  /* نمایش زنده داخل یک عنصر؛ خروجی: تابع «جدا کردن» */
  function bind(container, ref, opts) {
    if (!container) return function () {};
    var options = opts || {};
    var view = { retry: options.retry !== false };
    var off = subscribe(ref, function (items) { setContainer(container, rowsHtml(items, view)); });
    setContainer(container, rowsHtml(itemsOf(ref), view));
    container.onclick = function (ev) {
      var target = ev && ev.target;
      while (target && target !== container) {
        if (target.getAttribute && target.getAttribute('data-action') === 'retry') {
          if (typeof options.onRetry === 'function') options.onRetry(String(ref || ''));
          return;
        }
        target = target.parentNode;
      }
    };
    return function () {
      off();
      if (container.onclick) container.onclick = null;
    };
  }

  var api = {
    begin: begin,
    apply: apply,
    has: has,
    isActive: isActive,
    items: itemsOf,
    summary: summary,
    summaryOf: summaryOf,
    subscribe: subscribe,
    clear: clear,
    bind: bind,
    renderStatic: renderStatic,
    itemsFromMedia: itemsFromMedia,
    rowsHtml: rowsHtml,
    formatBytes: formatBytes,
    formatPercent: formatPercent,
    detectKind: detectKind,
    shortName: shortName
  };

  global.EplakUploadProgress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);

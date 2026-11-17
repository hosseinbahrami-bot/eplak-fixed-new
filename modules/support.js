/* ════════════════════════════════════════════════════════════════════════════
   modules/support.js — «پشتیبانی آنلاین»: چتِ مستقیمِ شهروند با تیمِ پشتیبانی
   ────────────────────────────────────────────────────────────────────────────
   چه کار می‌کند؟
     کارتِ «پشتیبانی آنلاین — چت مستقیم با پشتیبان» در صفحه‌ی «تماس با ما»
     پیش‌تر فقط تزئینی بود (هیچ onclick نداشت). این ماژول همان کارت را به یک
     صفحه‌ی چتِ واقعی وصل می‌کند: رشته‌ی گفتگو با تیمِ پشتیبانی، ارسالِ متن و
     عکس و فایل، زمانِ شمسی، تیکِ «خوانده‌شدن»، صفِ ارسالِ آفلاین و بنرِ
     ساعتِ کاری.

   چرا polling و نه WebSocket؟
     هاست، cPanel اشتراکی با PHP 7.4 است: پروسه‌ی دائمی (Node/daemon) نمی‌تواند
     بالا بماند و long-polling هم worker‌های PHP-FPM را تمام می‌کند. پس:
       • وقتی همین صفحه باز و visibile است ⇒ pollingِ تطبیقی (۵ ثانیه؛ اگر چند
         بار پشتِ سر هم پیامِ تازه نیامد، ۱۵ ثانیه) و وقتی صفحه پنهان شد ⇒ قطع
       • وقتی اپ بسته است ⇒ پوشِ FCM/Web Push خبر می‌دهد (همان مسیرِ اعلان‌ها)
     همگام‌سازی «افزایشی» است: فقط پیام‌های بعد از last_id گرفته می‌شود، پس
     هر poll معمولاً چند صد بایت است.

   چرا صفِ آفلاین با client_ref؟
     در مترو/آسانسور پیام می‌رود ولی شبکه نیست. پیام در localStorage می‌ماند و
     با همان client_ref وقتی شبکه برگشت فرستاده می‌شود؛ سمتِ سرور هم با همان
     ref جلوی ثبتِ تکراری را می‌گیرد (پس «تلاشِ دوباره» دوتا پیام نمی‌سازد).

   قاعده‌ها:
     • همه‌چیز داخل try/catch: این ماژول هرگز نباید اپ را بشکند
     • متنِ پیام‌ها فقط به‌صورتِ text رندر می‌شود (XSS)
     • تاریخ‌ها از سرور می‌آیند (created_fa) تا با پنلِ ادمین یکی باشند
     • اگر کاربر وارد نشده باشد (شماره نیست)، به‌جایِ چتِ خالی، راهنمایِ ورود
       نشان داده می‌شود
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LS_OUTBOX = 'eplak_support_outbox';
  var LS_LASTID = 'eplak_support_last_id';
  var LS_TICKET = 'eplak_support_ticket';
  var POLL_FAST = 5000;
  var POLL_SLOW = 15000;
  var MAX_BODY = 2000;

  var state = {
    ticketId: 0,
    lastId: 0,
    seen: {},                 /* شناسه‌ی پیام‌هایی که رندر شده‌اند (ضدِ تکرار) */
    timer: null,
    delay: POLL_FAST,
    idlePolls: 0,
    config: null,
    attached: null,           /* پیوستِ آماده‌ی ارسال */
    busy: false,
    started: false
  };

  /* ── کمکی‌ها ─────────────────────────────────────────────────────────── */
  function apiBase() {
    try {
      if (typeof window.eplakApiBase === 'function') { return window.eplakApiBase(); }
    } catch (e) { /* ignore */ }
    return (window.location.protocol === 'file:' ? 'https://eplak.ir/eplak-fixed/api' : 'api');
  }

  function currentPhone() {
    try {
      if (typeof window.getCurrentPhone === 'function') { return window.getCurrentPhone() || ''; }
    } catch (e) { /* ignore */ }
    return '';
  }

  function t(key, fallback) {
    try {
      if (typeof window.t === 'function') { return window.t(key, fallback); }
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    } catch (e) { /* ignore */ }
    console.log('[support]', msg);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clientRef() {
    var rnd = '';
    try {
      var bytes = new Uint8Array(12);
      if (window.crypto && window.crypto.getRandomValues) { window.crypto.getRandomValues(bytes); }
      else { for (var i = 0; i < bytes.length; i++) { bytes[i] = Math.floor(Math.random() * 256); } }
      for (var j = 0; j < bytes.length; j++) { rnd += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16); }
    } catch (e) {
      rnd = String(Date.now()) + Math.floor(Math.random() * 1e6).toString(16);
    }
    return 'sup-' + Date.now().toString(36) + '-' + rnd;
  }

  function lsGet(key, fallback) {
    try { var v = window.localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* پر بودنِ localStorage */ }
  }

  function outbox() {
    try { return JSON.parse(lsGet(LS_OUTBOX, '[]')) || []; } catch (e) { return []; }
  }
  function saveOutbox(list) {
    lsSet(LS_OUTBOX, JSON.stringify(list.slice(0, 40)));
  }

  async function call(action, payload, method) {
    var url = apiBase() + '/support.php';
    var opts = { cache: 'no-store', method: method || 'POST' };
    if (method === 'GET' || !payload) {
      var qs = [];
      Object.keys(payload || {}).forEach(function (k) {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]));
      });
      url += '?' + qs.join('&');
      opts.method = 'GET';
    } else {
      opts.headers = { 'Content-Type': 'text/plain;charset=UTF-8' };
      opts.body = JSON.stringify(payload);
    }
    var res = await fetch(url, opts);
    if (!res.ok) { throw new Error('http:' + res.status); }
    var data = await res.json();
    if (!data) { throw new Error('bad-json'); }
    return data;
  }

  function el(id) { return document.getElementById(id); }

  function isScreenActive() {
    var s = el('screen-support');
    return !!s && s.classList.contains('active');
  }

  /* ── رندر ────────────────────────────────────────────────────────────── */
  function mediaUrl(media) {
    if (!media || !media.path) { return ''; }
    /* پیوست‌ها فقط از مسیرِ محافظت‌شده‌ی api/support.php?action=file خوانده
       می‌شوند (مالکیت با شماره‌ی مالک بررسی می‌شود) */
    return apiBase() + '/support.php?action=file&m=' + encodeURIComponent(media.path)
      + '&phone=' + encodeURIComponent(currentPhone());
  }

  function bubbleHtml(m) {
    var mine = m.sender === 'citizen';
    var cls = mine ? 'sup-bubble sup-mine' : (m.sender === 'admin' ? 'sup-bubble sup-theirs' : 'sup-bubble sup-sys');
    var who = m.sender === 'admin'
      ? '<span class="sup-who">' + esc(m.sender_name || t('support_agent', 'پشتیبانی')) + '</span>' : '';
    var media = '';
    if (m.media && m.media.path) {
      var url = mediaUrl(m.media);
      var icon = m.media.kind === 'image' ? '🖼️' : (m.media.kind === 'video' ? '🎬' : '📎');
      if (m.media.kind === 'image') {
        media = '<a class="sup-attach" href="' + esc(url) + '" target="_blank" rel="noreferrer">'
          + '<img src="' + esc(url) + '" alt="' + esc(m.media.name || '') + '" loading="lazy"></a>';
      } else {
        media = '<a class="sup-attach sup-file" href="' + esc(url) + '" target="_blank" rel="noreferrer">'
          + icon + ' ' + esc(m.media.name || t('support_attachment', 'پیوست')) + '</a>';
      }
    }
    var pending = m.__pending ? ' <span class="sup-pending" title="' + esc(t('support_pending', 'در انتظارِ ارسال')) + '">⏳</span>' : '';
    var tick = m.__pending ? '' : (m.read ? ' <span class="sup-tick">✓✓</span>' : ' <span class="sup-tick sup-tick-1">✓</span>');
    return '<div class="' + cls + '" data-mid="' + esc(m.id || m.__ref || '') + '">'
      + who
      + '<div class="sup-body">' + esc(m.body || '').replace(/\n/g, '<br>') + '</div>'
      + media
      + '<div class="sup-time">' + esc(m.created_fa || '') + (mine ? tick + pending : '') + '</div>'
      + '</div>';
  }

  function renderPending() {
    var box = el('supportMessages');
    if (!box) { return; }
    var list = outbox();
    /* پیامهای در صف با ⏳ نشان داده می‌شوند تا کاربر بداند نرفته‌اند */
    var html = '';
    list.forEach(function (p) {
      html += bubbleHtml({ id: 0, __ref: p.client_ref, __pending: true, sender: 'citizen', body: p.body,
        created_fa: p.when || '', media: p.media || null, read: false });
    });
    var pendingWrap = el('supportPending');
    if (pendingWrap) { pendingWrap.innerHTML = html; }
  }

  function renderThread(messages, mode) {
    var box = el('supportMessages');
    if (!box) { return; }
    if (mode === 'reset') { box.innerHTML = ''; state.seen = {}; }
    var html = '';
    (messages || []).forEach(function (m) {
      var id = Number(m.id || 0);
      if (id && state.seen[id]) { return; }
      if (id) { state.seen[id] = true; }
      html += bubbleHtml(m);
      if (id > state.lastId) { state.lastId = id; }
    });
    if (html) {
      box.insertAdjacentHTML('beforeend', html);
      lsSet(LS_LASTID, String(state.lastId));
    }
    renderPending();
    var scroller = el('supportScroller');
    if (scroller) { scroller.scrollTop = scroller.scrollHeight; }
  }

  function renderConfig(cfg) {
    state.config = cfg || null;
    var banner = el('supportHoursBanner');
    if (!banner) { return; }
    if (!cfg) { banner.style.display = 'none'; return; }
    if (cfg.enabled === false) {
      banner.style.display = '';
      banner.className = 'sup-banner sup-banner-off';
      banner.textContent = t('support_disabled', 'پشتیبانی آنلاین موقتاً غیرفعال است.');
      return;
    }
    if (!cfg.open) {
      banner.style.display = '';
      banner.className = 'sup-banner sup-banner-off';
      banner.textContent = (cfg.hours_label || '') + ' — ' + t('support_closed_hint', 'الان بیرونِ ساعتِ پاسخ‌گویی هستیم؛ پیامِ شما ثبت می‌شود و در نخستین ساعتِ کاری پاسخ می‌دهیم.');
      return;
    }
    banner.style.display = '';
    banner.className = 'sup-banner sup-banner-on';
    banner.textContent = (cfg.agent_online
      ? t('support_agent_online', 'پشتیبان آنلاین است — معمولاً کمتر از ۱۰ دقیقه پاسخ می‌دهیم')
      : t('support_open_hours', 'در ساعتِ کاری هستیم؛ پیام بدهید')) + ' · ' + (cfg.hours_label || '');
  }

  function setSending(on) {
    state.busy = !!on;
    var btn = el('supportSendBtn');
    var input = el('supportInput');
    if (btn) { btn.disabled = !!on; }
    if (input) { input.disabled = !!on; }
  }

  function renderAttached() {
    var box = el('supportAttachPreview');
    if (!box) { return; }
    if (!state.attached) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = '<span>📎 ' + esc(state.attached.name) + '</span>'
      + '<button type="button" class="sup-chip" onclick="eplakSupport.clearAttachment()">✕</button>';
  }

  /* ── بارگذاری و تازه‌سازی ─────────────────────────────────────────────── */
  async function loadConfig() {
    try {
      var cfg = await call('config', { action: 'config' }, 'GET');
      if (cfg && cfg.success) { renderConfig(cfg); }
    } catch (e) { /* بی‌صدا: بنر پنهان می‌ماند */ }
  }

  async function loadThread(reset) {
    var phone = currentPhone();
    if (!phone) {
      var box = el('supportMessages');
      if (box) {
        box.innerHTML = '<div class="sup-empty">' + esc(t('support_need_login',
          'برایِ گفتگو با پشتیبانی، ابتدا با شماره‌ی موبایل و کد تایید وارد شوید.')) + '</div>';
      }
      var composer = el('supportComposer');
      if (composer) { composer.style.display = 'none'; }
      return;
    }
    /* شماره هست ⇒ کادرِ نوشتن حتماً دیده شود. اگر یک‌بار به‌اشتباه پنهان شده
       بود (مثلاً خرابیِ موقتِ localStorage در WebView یا تخلیه‌ی حافظه‌ی
       مرورگر در PWA)، با برگشتنِ شماره کادر هم برمی‌گردد — وگرنه کاربر تا
       پایانِ نشست هیچ‌وقت نمی‌توانست بنویسد. */
    var composer = el('supportComposer');
    if (composer) { composer.style.display = ''; }
    try {
      var data = await call('thread', {
        action: 'thread', phone: phone, since: reset ? 0 : state.lastId
      }, 'GET');
      if (!data || data.success !== true) {
        if (data && data.reason === 'unknown_phone') {
          toast(t('support_need_login', 'برایِ گفتگو با پشتیبانی ابتدا وارد شوید.'));
        }
        return;
      }
      if (data.ticket && data.ticket.id) {
        state.ticketId = Number(data.ticket.id);
        lsSet(LS_TICKET, String(state.ticketId));
        var closedRow = el('supportClosedRow');
        if (closedRow) { closedRow.style.display = data.ticket.closed ? '' : 'none'; }
      }
      renderThread(data.messages || [], reset ? 'reset' : 'append');
      if (data && typeof data.open !== 'undefined') { renderConfig(data); }
      state.idlePolls = (data.messages && data.messages.length) ? 0 : state.idlePolls + 1;
      markRead();
    } catch (e) {
      /* آفلاین یا خطای شبکه: رشته‌ی قبلی روی صفحه می‌ماند و صفِ ارسال کار می‌کند */
      state.idlePolls++;
    }
  }

  async function markRead() {
    var phone = currentPhone();
    if (!phone) { return; }
    try { await call('read', { action: 'read', phone: phone }); } catch (e) { /* بی‌صدا */ }
  }

  function startPolling() {
    stopPolling();
    var tick = async function () {
      /* زنجیره‌ی تایمر هرگز نباید بشکند: اگر این تیک در حالتِ پنهان/غیرفعال
         اجرا شود، فقط کارِش را رد می‌کند و تیکِ بعدی را زمان‌بندی می‌کند.
         (پیش‌تر در همین‌جا return می‌شد و polling برای همیشه می‌مرد؛ بعدش
         هیچ loadThreadای صدا زده نمی‌شد و کادرِ نوشتن هم برنمی‌گشت.) */
      if (isScreenActive() && !document.hidden) {
        await loadThread(false);
        await flushOutbox();
        state.delay = state.idlePolls >= 4 ? POLL_SLOW : POLL_FAST;
      }
      state.timer = setTimeout(tick, state.delay);
    };
    state.timer = setTimeout(tick, state.delay);
  }

  function stopPolling() {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  }

  /* ── ارسال (با صفِ آفلاین) ────────────────────────────────────────────── */
  function queueMessage(payload) {
    var list = outbox();
    /* اگر همان client_ref قبلاً در صف است، دوتا نمی‌گذاریم */
    for (var i = 0; i < list.length; i++) {
      if (list[i].client_ref === payload.client_ref) { return; }
    }
    list.push(payload);
    saveOutbox(list);
    renderPending();
  }

  function dequeue(clientRefValue) {
    var list = outbox().filter(function (p) { return p.client_ref !== clientRefValue; });
    saveOutbox(list);
    renderPending();
  }

  async function flushOutbox() {
    var list = outbox();
    if (!list.length) { return; }
    var phone = currentPhone();
    if (!phone) { return; }
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      try {
        var res = await call('send', {
          action: 'send', phone: phone, body: item.body, client_ref: item.client_ref,
          media: item.media || undefined, name: item.name || ''
        });
        if (res && res.success === true) {
          dequeue(item.client_ref);
          if (res.message) { renderThread([res.message], 'append'); }
        } else if (res && res.reason === 'rate_limited') {
          toast(res.hint || t('support_rate_limited', 'تعدادِ پیام‌ها زیاد است؛ کمی بعد دوباره بفرستید.'));
          return;                        /* بقیه‌ی صف هم احتمالاً رد می‌شود */
        }
      } catch (e) {
        return;                          /* هنوز آفلاین ⇒ صف سرِ جایش می‌ماند */
      }
    }
  }

  async function send() {
    var input = el('supportInput');
    if (!input) { return; }
    var body = String(input.value || '').trim();
    var attached = state.attached;
    if (body === '' && !attached) { return; }
    if (body.length > MAX_BODY) { body = body.slice(0, MAX_BODY); }

    var phone = currentPhone();
    if (!phone) {
      toast(t('support_need_login', 'ابتدا وارد شوید.'));
      return;
    }
    var ref = clientRef();
    var nowFa = '';
    try {
      if (typeof window.eplakFaNow === 'function') { nowFa = window.eplakFaNow(); }
    } catch (e) { /* ignore */ }

    /* خوش‌بینانه رندر می‌شود تا حسِ «چتِ زنده» بدهد؛ اگر نرفت، در صف می‌ماند */
    input.value = '';
    state.attached = null;
    renderAttached();

    var payload = { client_ref: ref, body: body, media: attached || null, when: nowFa, name: '' };
    queueMessage(payload);

    setSending(true);
    try {
      var res = await call('send', {
        action: 'send', phone: phone, body: body, client_ref: ref,
        media: attached || undefined
      });
      if (res && res.success === true) {
        dequeue(ref);
        if (res.message) { renderThread([res.message], 'append'); }
        if (typeof res.open !== 'undefined') { renderConfig(res); }
        state.idlePolls = 0;
        state.delay = POLL_FAST;
      } else {
        toast((res && res.hint) || t('support_send_failed', 'ارسال نشد؛ وقتی اینترنت برگشت خودکار فرستاده می‌شود.'));
      }
    } catch (e) {
      toast(t('support_offline_queued', 'آفلاین هستید؛ پیام در صف ماند و خودکار ارسال می‌شود.'));
    }
    setSending(false);
  }

  /* ── پیوست ───────────────────────────────────────────────────────────── */
  async function pickAttachment() {
    var input = el('supportFileInput');
    if (input) { input.click(); return; }
  }

  async function onFileChosen(ev) {
    var file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) { return; }
    var cfg = state.config || {};
    var att = cfg.attachments || {};
    var maxMb = file.type.indexOf('video/') === 0 ? 25 : (att.max_file || att.max_image || 8);
    if (file.size > maxMb * 1024 * 1024) {
      toast(t('support_too_large', 'حجمِ فایل بیشتر از حدِ مجاز است.'));
      if (ev.target) { ev.target.value = ''; }
      return;
    }
    var phone = currentPhone();
    if (!phone) { toast(t('support_need_login', 'ابتدا وارد شوید.')); return; }
    setSending(true);
    toast(t('support_uploading', 'در حالِ آپلودِ پیوست…'));
    try {
      var dataUrl = (typeof window.eplakReadFileAsDataUrl === 'function')
        ? await window.eplakReadFileAsDataUrl(file)
        : await readAsDataUrlLocal(file);
      var res = await call('upload', {
        action: 'upload', phone: phone, name: file.name, mime: file.type || '', data: dataUrl
      });
      if (res && res.success === true && res.media) {
        state.attached = res.media;
        renderAttached();
      } else {
        toast((res && res.hint) || t('support_upload_failed', 'آپلودِ پیوست ممکن نشد.'));
      }
    } catch (e) {
      toast(t('support_upload_failed', 'آپلودِ پیوست ممکن نشد (شبکه را بررسی کنید).'));
    }
    if (ev.target) { ev.target.value = ''; }
    setSending(false);
  }

  function readAsDataUrlLocal(file) {
    return new Promise(function (resolve, reject) {
      try {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = function () { reject(new Error('read')); };
        fr.readAsDataURL(file);
      } catch (e) { reject(e); }
    });
  }

  async function rateConversation(stars) {
    var phone = currentPhone();
    if (!phone) { return; }
    try {
      await call('close', { action: 'close', phone: phone, rating: Number(stars) || 0 });
      toast(t('support_thanks', 'ممنون از امتیاز شما. گفتگو بسته شد.'));
      await loadThread(true);
    } catch (e) { /* بی‌صدا */ }
  }

  /* ── ورود به صفحه ─────────────────────────────────────────────────────── */
  async function open() {
    try {
      if (typeof window.showScreen === 'function') { window.showScreen('screen-support'); }
    } catch (e) { /* ignore */ }
    state.lastId = Number(lsGet(LS_LASTID, '0')) || 0;
    state.ticketId = Number(lsGet(LS_TICKET, '0')) || 0;
    if (!state.started) {
      state.started = true;
      bindUi();
      window.addEventListener('online', function () { flushOutbox(); loadThread(false); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stopPolling(); }
        else if (isScreenActive()) { loadThread(false); startPolling(); }
      });
    }
    renderPending();
    await loadConfig();
    await loadThread(true);
    await flushOutbox();
    startPolling();
  }

  function bindUi() {
    var sendBtn = el('supportSendBtn');
    var input = el('supportInput');
    var fileBtn = el('supportAttachBtn');
    var fileInput = el('supportFileInput');
    if (sendBtn) { sendBtn.addEventListener('click', function (e) { e.preventDefault(); send(); }); }
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
    }
    if (fileBtn) { fileBtn.addEventListener('click', function (e) { e.preventDefault(); pickAttachment(); }); }
    if (fileInput) { fileInput.addEventListener('change', onFileChosen); }
  }

  /* ── رابطِ عمومی ─────────────────────────────────────────────────────── */
  window.eplakSupport = {
    open: open,
    send: send,
    pickAttachment: pickAttachment,
    clearAttachment: function () { state.attached = null; renderAttached(); },
    rate: rateConversation,
    refresh: function () { loadConfig(); loadThread(false); flushOutbox(); },
    outboxCount: function () { return outbox().length; },
    state: state
  };

  /* کارتِ «پشتیبانی آنلاین» در صفحه‌ی تماس با ما */
  window.openSupportChat = open;
})();

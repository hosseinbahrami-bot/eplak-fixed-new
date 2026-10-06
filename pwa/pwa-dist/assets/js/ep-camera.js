/* ══════════════════════════════════════════════════════════════════════
   ep-camera.js — دوربینِ داخل اپ (عکس و فیلم با دوربین گوشی)
   ──────────────────────────────────────────────────────────────────────
   کاربر بدون بیرون رفتن از اپ، با دوربین گوشی عکس می‌گیرد یا فیلم ضبط می‌کند
   و همان‌جا به پیوست‌های گزارش اضافه می‌کند.

   مسیر کار:
     ۱) اگر مرورگر/وب‌ویو اجازه‌ی دوربین بدهد (getUserMedia) → دوربین داخل اپ
        باز می‌شود: دکمه‌ی «عکس»، دکمه‌ی «فیلم» (شروع/پایان) و چرخش دوربین.
     ۲) اگر اجازه داده نشود یا ضبط فیلم پشتیبانی نشود → null برمی‌گردد و
        لایه‌ی گزارش‌ها به دوربینِ خود گوشی (input capture) برمی‌گردد.

   خروجی همیشه یک «فایل» است (File/Blob با name و type) تا دقیقاً مثل فایل
   گالری در همان مسیر بارگذاری (تکه‌تکه + مسیر پشتیبان) ارسال شود.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MAX_VIDEO_SECONDS = 60;      /* سقف فیلم، تا ارسال طولانی نشود */
  const PHOTO_QUALITY = 0.86;
  /* ── حجم فیلم ضبط‌شده ────────────────────────────────────────────────
     بدون تنظیم، وب‌ویو فیلم را با ~۲٫۵ مگابیت در ثانیه (و کیفیت ۷۲۰ به بالا)
     می‌گیرد: یک دقیقه ≈ ۲۰ مگابایت. این فیلم باید از اینترنت موبایل و
     فایروال هاست عبور کند؛ هرچه سبک‌تر، احتمال رسیدنش بیشتر است. ۱٫۵ مگابیت
     برای فیلم مستند مشکل شهری کاملاً خوانا است (یک دقیقه ≈ ۱۱ مگابایت). */
  const VIDEO_BITS_PER_SECOND = 1500000;
  const AUDIO_BITS_PER_SECOND = 64000;

  const state = {
    stream: null,
    recorder: null,
    chunks: [],
    mime: '',
    recording: false,
    startedAt: 0,
    timer: null,
    facing: 'environment',
    overlay: null,
    video: null,
    hint: null,
    shutter: null,
    recordBtn: null,
    mode: 'photo'
  };

  function supported() {
    return !!(window.navigator && navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function');
  }

  function recorderSupported() {
    return typeof window.MediaRecorder !== 'undefined' && typeof window.Blob !== 'undefined';
  }

  function log(text) {
    try {
      if (typeof window.eplakCameraLog === 'function') window.eplakCameraLog(text);
    } catch (e) { /* بی‌اهمیت */ }
  }

  function stampName(ext) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return 'eplak-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.' + ext;
  }

  function toFile(blob, name, type) {
    if (!blob) return null;
    try {
      if (typeof window.File === 'function') return new File([blob], name, { type: type });
    } catch (e) { /* اگر File ساخته نشد، همان Blob با name برمی‌گردد */ }
    try { blob.name = name; } catch (e) {}
    try { blob.type = type; } catch (e) {}
    return blob;
  }

  /* نامزدی برای ضبط فیلم: وب‌ویوهای مختلف فرمت‌های متفاوتی دارند */
  function pickRecorderMime() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm',
      'video/mp4'
    ];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
          return candidates[i];
        }
      } catch (e) { /* ادامه */ }
    }
    return '';
  }

  function el(tag, styles, text) {
    const node = document.createElement(tag);
    if (styles) node.style.cssText = styles;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setHint(text, isError) {
    if (!state.hint) return;
    state.hint.textContent = text || '';
    state.hint.style.color = isError ? '#ff9a9a' : 'rgba(255,255,255,0.86)';
  }

  /* ── ساخت رابط دوربین ─────────────────────────────────────────────── */
  function buildOverlay(mode) {
    const overlay = el('div',
      'position:fixed; inset:0; z-index:9999; background:#05070a; display:flex; flex-direction:column; '
      + 'font-family:inherit; direction:rtl; touch-action:manipulation;');

    const top = el('div', 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px;');
    const title = el('div', 'color:#fff; font-size:14px; font-weight:700;',
      mode === 'video' ? 'ضبط فیلم با دوربین گوشی' : 'عکس گرفتن با دوربین گوشی');
    const closeBtn = el('button',
      'border:0; background:rgba(255,255,255,0.14); color:#fff; border-radius:50%; width:34px; height:34px; '
      + 'font-size:16px; line-height:1; cursor:pointer;', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'بستن دوربین');
    closeBtn.onclick = () => finish(null, 'cancelled');
    top.appendChild(title);
    top.appendChild(closeBtn);

    const stage = el('div', 'position:relative; flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000;');
    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    try { video.muted = true; } catch (e) {}
    video.style.cssText = 'width:100%; height:100%; object-fit:cover;';
    stage.appendChild(video);

    const badge = el('div',
      'position:absolute; top:10px; right:10px; padding:5px 10px; border-radius:999px; font-size:12px; '
      + 'background:rgba(0,0,0,0.55); color:#fff; display:none;', '● ۰۰:۰۰');
    stage.appendChild(badge);

    const bottom = el('div', 'padding:14px 14px calc(14px + env(safe-area-inset-bottom)); display:flex; align-items:center; justify-content:center; gap:14px;');
    const hint = el('div', 'text-align:center; font-size:12px; padding:0 14px 6px;', '');
    hint.style.color = 'rgba(255,255,255,0.86)';

    const flipBtn = el('button',
      'border:1px solid rgba(255,255,255,0.35); background:rgba(255,255,255,0.10); color:#fff; border-radius:12px; '
      + 'width:46px; height:46px; font-size:18px; cursor:pointer;', '⟲');
    flipBtn.type = 'button';
    flipBtn.title = 'چرخش دوربین';
    flipBtn.onclick = () => { state.facing = (state.facing === 'environment') ? 'user' : 'environment'; startStream(state.mode); };

    const mainBtn = el('button',
      'border:4px solid rgba(255,255,255,0.85); background:#fff; border-radius:50%; width:74px; height:74px; cursor:pointer;', '');
    mainBtn.type = 'button';
    const recordBtn = el('button',
      'border:0; background:rgba(255,90,90,0.92); color:#fff; border-radius:12px; height:46px; padding:0 14px; '
      + 'font-size:13px; font-weight:700; cursor:pointer;', 'شروع فیلم');
    recordBtn.type = 'button';
    recordBtn.style.display = recorderSupported() ? 'inline-block' : 'none';

    mainBtn.onclick = () => {
      if (state.recording) stopRecording();
      else if (state.mode === 'video' || recordMode) startRecording();
      else takePhoto();
    };
    recordBtn.onclick = () => {
      if (state.recording) stopRecording();
      else startRecording();
    };

    bottom.appendChild(flipBtn);
    bottom.appendChild(mainBtn);
    bottom.appendChild(recordBtn);

    overlay.appendChild(top);
    overlay.appendChild(stage);
    overlay.appendChild(hint);
    overlay.appendChild(bottom);
    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.video = video;
    state.hint = hint;
    state.shutter = mainBtn;
    state.recordBtn = recordBtn;
    state.badge = badge;
    state.mode = mode === 'video' ? 'video' : 'photo';
    recordMode = (state.mode === 'video');
    mainBtn.style.background = recordMode ? '#ff5a5a' : '#fff';
    setHint(recordMode ? 'برای شروع ضبط، دکمه‌ی قرمز را بزنید' : 'کادر را روی سوژه بگیرید و دکمه‌ی سفید را بزنید');
  }

  let recordMode = false;
  let pending = null;      /* { resolve } */

  function destroyOverlay() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.stream) {
      try { state.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); } catch (e) {}
      state.stream = null;
    }
    if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);
    state.overlay = null;
    state.video = null;
    state.recording = false;
  }

  /* نتیجه همیشه یک شیء است: { file, reason }
     reason = 'ok' → عکس/فیلم آماده است
     reason = 'cancelled' → کاربر خودش دوربین را بست (بدون باز کردن دوربین گوشی)
     هر چیز دیگر → دوربین داخل اپ نشد؛ لایه‌ی گزارش‌ها به دوربین گوشی برمی‌گردد */
  function finish(file, reason) {
    const resolve = pending ? pending.resolve : null;
    pending = null;
    destroyOverlay();
    const why = reason || (file ? 'ok' : 'empty');
    if (why !== 'ok') log(why);
    if (resolve) resolve({ file: file || null, reason: why });
  }

  async function startStream(mode) {
    if (!state.video) return;
    try {
      if (state.stream) {
        state.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        state.stream = null;
      }
      const constraints = {
        audio: mode === 'video',
        video: mode === 'video'
          ? { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: state.facing }, width: { ideal: 1600 }, height: { ideal: 1200 } }
      };
      setHint('در حال روشن شدن دوربین…');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.stream = stream;
      state.video.srcObject = stream;
      try { await state.video.play(); } catch (e) {}
      setHint(mode === 'video' ? 'برای شروع ضبط، دکمه‌ی قرمز را بزنید' : 'کادر را روی سوژه بگیرید و دکمه‌ی سفید را بزنید');
    } catch (err) {
      const name = String((err && err.name) || '');
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        setHint('اجازه‌ی دوربین داده نشد — از دوربین خود گوشی استفاده کنید', true);
        setTimeout(() => finish(null, 'denied'), 900);
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        setHint('دوربین روی این گوشی پیدا نشد', true);
        setTimeout(() => finish(null, 'no-device'), 900);
      } else {
        setHint('دوربین داخل اپ روی این گوشی کار نکرد — دوربین خود گوشی باز می‌شود', true);
        setTimeout(() => finish(null, 'unsupported'), 900);
      }
    }
  }

  /* ── عکس ──────────────────────────────────────────────────────────── */
  function takePhoto() {
    const video = state.video;
    if (!video || !video.videoWidth) { setHint('دوربین آماده نیست؛ یک لحظه صبر کنید', true); return; }
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { finish(null, 'no-canvas'); return; }
      if (state.facing === 'user') {          /* آینه‌ای، مثل دوربین سلفی گوشی */
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      setHint('در حال آماده‌سازی عکس…');
      canvas.toBlob(blob => {
        if (!blob) { finish(null, 'empty-photo'); return; }
        finish(toFile(blob, stampName('jpg'), 'image/jpeg'), 'ok');
      }, 'image/jpeg', PHOTO_QUALITY);
    } catch (e) {
      finish(null, 'photo-error');
    }
  }

  /* ── فیلم ─────────────────────────────────────────────────────────── */
  function startRecording() {
    if (!state.stream || !recorderSupported()) { finish(null, 'no-recorder'); return; }
    try {
      state.mime = pickRecorderMime();
      state.chunks = [];
      const recorderOptions = {
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND
      };
      if (state.mime) recorderOptions.mimeType = state.mime;
      try {
        state.recorder = new MediaRecorder(state.stream, recorderOptions);
      } catch (optionError) {
        /* بعضی وب‌ویوها گزینه‌ی نرخ بیت را نمی‌شناسند → همان روش قبلی */
        state.recorder = state.mime
          ? new MediaRecorder(state.stream, { mimeType: state.mime })
          : new MediaRecorder(state.stream);
      }
      state.recorder.ondataavailable = ev => { if (ev && ev.data && ev.data.size) state.chunks.push(ev.data); };
      state.recorder.onerror = () => { setHint('ضبط فیلم با خطا مواجه شد', true); };
      state.recorder.onstop = () => {
        const type = state.mime || (state.recorder && state.recorder.mimeType) || 'video/webm';
        const blob = new Blob(state.chunks, { type: type });
        state.chunks = [];
        if (!blob || blob.size < 1024) { finish(null, 'empty-video'); return; }
        const ext = String(type).indexOf('mp4') > -1 ? 'mp4' : 'webm';
        finish(toFile(blob, stampName(ext), type.split(';')[0]), 'ok');
      };
      state.recorder.start(250);
      state.recording = true;
      state.startedAt = Date.now();
      if (state.recordBtn) { state.recordBtn.textContent = 'پایان فیلم'; state.recordBtn.style.background = 'rgba(255,255,255,0.9)'; state.recordBtn.style.color = '#111'; }
      if (state.shutter) state.shutter.style.background = '#ff5a5a';
      if (state.badge) state.badge.style.display = 'block';
      setHint('در حال ضبط… برای پایان، دوباره دکمه را بزنید (حداکثر ' + MAX_VIDEO_SECONDS + ' ثانیه)');
      state.timer = setInterval(() => {
        const secs = Math.floor((Date.now() - state.startedAt) / 1000);
        if (state.badge) {
          const mm = String(Math.floor(secs / 60)).padStart(2, '0');
          const ss = String(secs % 60).padStart(2, '0');
          state.badge.textContent = '● ' + mm + ':' + ss;
        }
        if (secs >= MAX_VIDEO_SECONDS) stopRecording();
      }, 500);
    } catch (e) {
      finish(null, 'recorder-error');
    }
  }

  function stopRecording() {
    if (!state.recording || !state.recorder) return;
    state.recording = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    try { state.recorder.stop(); } catch (e) { finish(null, 'recorder-stop-error'); }
  }

  /* ── API بیرونی ───────────────────────────────────────────────────── */
  async function open(opts) {
    const mode = (opts && opts.mode === 'video') ? 'video' : 'photo';
    if (!supported()) return { file: null, reason: 'no-getusermedia' };
    if (pending) return { file: null, reason: 'busy' };   /* یک دوربین بیشتر باز نمی‌شود */
    return new Promise(resolve => {
      pending = { resolve: resolve };
      try {
        buildOverlay(mode);
        startStream(mode);
      } catch (e) {
        finish(null, 'overlay-error');
      }
    });
  }

  window.EplakCamera = {
    open: open,
    supported: supported,
    recorderSupported: recorderSupported,
    close: () => finish(null, 'closed')
  };
})();

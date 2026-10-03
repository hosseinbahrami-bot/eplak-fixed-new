/* core/storage.js — ذخیره‌سازی محلی چندحسابی کامل (per-phone)
   =====================================================================
   ساختار داده در localStorage:
     eplak_profiles        => { "<phone>": { name, avatar }, ... }
     eplak_current_phone   => "<phone>"
     eplak_reports_<phone> => [ ...آرایه گزارش‌های این شماره ]
     eplak_payments_<phone>=> [ ...آرایه پرداخت‌های این شماره ]
     eplak_notifs_<phone>  => [ ...آرایه اعلان‌های این شماره ]
     eplak_favids_<phone>  => [ ...آرایه آی‌دی علاقه‌مندی‌های این شماره ]
     eplak_rid_<phone>     => <عدد — شمارنده آی‌دی گزارش>
   ===================================================================== */

(function () {
  const LS_PROFILES     = 'eplak_profiles';
  const LS_CURRENT      = 'eplak_current_phone';
  const DEFAULT_NAME    = 'شهروند';
  const DEFAULT_AVATAR  = '👤';
  // در گوشی واقعی باید IP کامپیوترِ دارای XAMPP استفاده شود؛ 127.0.0.1 به خود گوشی اشاره می‌کند.
  // در صورت تغییر IP سیستم، فقط مقدار زیر را تغییر دهید.
  const BACKEND_BASE_URL = window.EPLAK_API_BASE_URL ||
    (window.location.protocol === 'file:' ? 'https://eplak.ir/eplak-fixed/api' : 'api');
  window.EPLAK_API_BASE_URL = BACKEND_BASE_URL;

  /* ─── آدرس پایه‌ی API ─────────────────────────────────────────────
     همه‌ی ماژول‌ها باید از همین یک تابع استفاده کنند (قبلاً چند ماژول آدرس
     IP کامپیوتر توسعه‌دهنده را هاردکد کرده بودند و روی سایت/اپ کار نمی‌کرد). */
  function apiBase() {
    const configured = (typeof window.EPLAK_API_BASE_URL === 'string' && window.EPLAK_API_BASE_URL)
      ? window.EPLAK_API_BASE_URL
      : BACKEND_BASE_URL;
    return String(configured || 'api').replace(/\/+$/, '');
  }
  window.eplakApiBase = apiBase;

  /* ─── آدرس فایل‌های پیوست (عکس/فیلم گزارش) ────────────────────────
     روی وب، آدرس‌ها نسبی‌اند (uploads/reports/…) و درست کار می‌کنند.
     در اپ اندروید صفحه با file:///android_asset/index.html باز می‌شود؛ آنجا
     آدرس نسبی به خود گوشی اشاره می‌کند، پس باید به دامنه‌ی سرور وصل شود. */
  function resolveMediaUrl(path) {
    const value = String(path || '').trim();
    if (value === '') return '';
    if (/^(https?:)?\/\//i.test(value) || value.indexOf('data:') === 0 || value.indexOf('blob:') === 0) {
      return value;
    }
    if (window.location.protocol === 'file:') {
      const base = String(BACKEND_BASE_URL || '').replace(/\/+$/, '').replace(/\/api$/i, '');
      if (/^(https?:)?\/\//i.test(base)) {
        return base + '/' + value.replace(/^\/+/, '');
      }
    }
    return value;
  }
  window.eplakResolveMediaUrl = resolveMediaUrl;

  /* ─── کمکی‌های خام localStorage ─────────────────────────────────── */
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch(e) {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }
  function lsGetJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return (parsed !== null && parsed !== undefined) ? parsed : fallback;
    } catch(e) { return fallback; }
  }
  function lsSetJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  /* ─── «نوع محتوای ساده» برای درخواست‌های JSON ────────────────────────
     چرا text/plain و نه application/json؟
       • در اپ اندروید صفحه از file:///android_asset باز می‌شود و origin آن
         «null» است. با Content-Type: application/json مرورگر/وب‌ویو یک
         درخواست پیش‌پرواز OPTIONS می‌فرستد؛ اگر آن پاسخ تأیید نشود ارسال
         بی‌صدا شکست می‌خورد (همان پیام «پیوست‌ها به سرور نرسیدند»).
       • text/plain جزء انواع ساده است و پیش‌پرواز ندارد.
       • سرور بدنه را با php://input می‌خواند و به Content-Type کاری ندارد. */
  const JSON_CONTENT_TYPE = 'text/plain;charset=UTF-8';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* پیام فارسی خطای «حمل» (شبکه/فایروال/حجم) برای نمایش به کاربر */
  function transportMessage(status, kind) {
    const code = Number(status) || 0;
    if (kind === 'timeout') return 'پاسخی از سرور نرسید (زمان انتظار تمام شد)';
    if (code === 403) return 'فایروال هاست درخواست را رد کرد (کد ۴۰۳)';
    if (code === 413) return 'حجم درخواست بیش از حد مجاز هاست است (کد ۴۱۳)';
    if (code === 404) return 'این سرویس روی هاست فعال نیست (کد ۴۰۴) — بسته‌ی تازه را Extract کنید';
    if (code === 405) return 'این روش ارسال روی هاست فعال نیست (کد ۴۰۵)';
    if (code >= 500) return 'خطای داخلی سرور (کد ' + code + ')';
    if (code > 0) return 'پاسخ سرور خوانده نشد (کد ' + code + ')';
    return 'ارتباط با سرور برقرار نشد (اینترنت را بررسی کنید)';
  }

  function shortDetail(text) {
    return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  function transportFail(status, kind, detail) {
    const code = Number(status) || 0;
    return {
      success: false,
      __transport: true,
      status: code,
      kind: kind || 'network',
      error: transportMessage(code, kind),
      detail: shortDetail(detail)
    };
  }

  /* آیا پاسخ، خطای «حمل» است (نه پاسخ منطقی سرور)؟ */
  function isTransportFailure(res) {
    return !!(res && res.__transport);
  }

  /* ارسال JSON با XMLHttpRequest — هم درصد پیشرفت می‌دهد و هم کد وضعیت را
     برای عیب‌یابی برمی‌گرداند (برخلاف fetch که در بعضی حالت‌ها پیام مبهم
     می‌دهد). در صورت شکست، شیء { __transport:true, status, error } برمی‌گردد. */
  function postJsonXhr(url, payload, timeoutMs, onProgress) {
    return new Promise(resolve => {
      let body;
      try {
        body = JSON.stringify(payload || {});
      } catch (e) {
        resolve(transportFail(0, 'encode', 'ساخت بدنه‌ی درخواست ممکن نشد'));
        return;
      }
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', JSON_CONTENT_TYPE);
        xhr.timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 60000;
        if (typeof onProgress === 'function' && xhr.upload) {
          xhr.upload.onprogress = function (ev) {
            if (ev && ev.lengthComputable && ev.total > 0) {
              onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
            }
          };
        }
        xhr.onload = function () {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          if (typeof onProgress === 'function') onProgress(100);
          if (data === null || typeof data !== 'object') {
            resolve(transportFail(xhr.status, 'body', xhr.responseText));
            return;
          }
          resolve(data);
        };
        xhr.onerror = function () { resolve(transportFail(0, 'network', '')); };
        xhr.ontimeout = function () { resolve(transportFail(0, 'timeout', '')); };
        xhr.send(body);
      } catch (error) {
        resolve(transportFail(0, 'network', error && error.message));
      }
    });
  }

  async function syncDataToBackend(endpoint, payload) {
    if (!payload || typeof payload !== 'object') return null;
    const res = await postJsonXhr(BACKEND_BASE_URL + '/' + endpoint + '.php', payload, 60000);
    if (isTransportFailure(res)) {
      console.warn('[backend] request failed', endpoint, res.status, res.error);
      return null;
    }
    return res;
  }

  /* ارسال فرم چندبخشی (برای آپلود عکس/فیلم گزارش‌ها).
     نکته: هدر Content-Type عمداً تنظیم نمی‌شود تا مرورگر خودش boundary بگذارد.
     توجه: روی هاست فعلی، همین مسیر برای درخواست‌های دارای فایل با کد ۴۰۳
     بسته شده است (فایروال ModSecurity/Imunify)؛ فقط به‌عنوان مسیر قدیمی نگه
     داشته شده و مسیر اصلی، آپلود «تکه‌تکه‌ی JSON» است. */
  function syncFormDataToBackendWithProgress(endpoint, formData, onProgress) {
    return new Promise(resolve => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', BACKEND_BASE_URL + '/' + endpoint + '.php', true);
        xhr.timeout = 300000;
        if (typeof onProgress === 'function' && xhr.upload) {
          xhr.upload.onprogress = function (ev) {
            if (ev && ev.lengthComputable) {
              onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
            }
          };
        }
        xhr.onload = function () {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          if (typeof onProgress === 'function') onProgress(100);
          if (data === null || typeof data !== 'object') {
            resolve(transportFail(xhr.status, 'body', xhr.responseText));
            return;
          }
          resolve(data);
        };
        xhr.onerror = function () { resolve(transportFail(0, 'network', '')); };
        xhr.ontimeout = function () { resolve(transportFail(0, 'timeout', '')); };
        xhr.send(formData);
      } catch (error) {
        resolve(transportFail(0, 'network', error && error.message));
      }
    });
  }

  /* ارسال JSON با نمایش درصد پیشرفت (عکس/فیلمی که داخل بدنه‌ی JSON
     به‌صورت base64 می‌رود — همان مسیری که فایروال هاست اجازه می‌دهد). */
  function syncJsonToBackendWithProgress(endpoint, payload, onProgress) {
    return postJsonXhr(BACKEND_BASE_URL + '/' + endpoint + '.php', payload, 300000, onProgress);
  }

  /* خواندن فایل گوشی به‌صورت data URL (base64) */
  function readFileAsDataUrl(blob) {
    return new Promise(resolve => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      } catch (e) {
        resolve('');
      }
    });
  }

  function postJson(url, payload, timeoutMs, onProgress) {
    return postJsonXhr(url, payload, timeoutMs || 60000, onProgress);
  }

  /* ── آپلود تکه‌تکه‌ی عکس/فیلم (مسیر JSON) ─────────────────────────────
     هاست فعلی، ارسال multipart/form-data همراه فایل را با کد ۴۰۳ می‌بندد و
     به حجم درخواست JSON هم حساس است؛ پس هر تکه کوچک (پیش‌فرض ۲۰۰ کیلوبایت
     خام ≈ ۲۷۰ کیلوبایت base64) و مستقل فرستاده می‌شود، هر تکه در صورت خطای
     شبکه چند بار تکرار می‌شود و ترتیب تکه‌ها روی سرور بررسی می‌شود.
     خروجی:
       { ok, media:[...], failed:[نام فایل‌ها], error, unsupported, blocked, status }
     unsupported=true یعنی نسخه‌ی هاست قدیمی است (کنش تکه‌تکه را ندارد). */
  /* ── چرا تکه‌ها کوچک شدند؟ ────────────────────────────────────────────
     آزمون‌های میدانی نشان داد درخواست‌های کوچک همیشه عبور می‌کنند، ولی بدنه‌ی
     چند صد کیلوبایتیِ حاوی base64 ممکن است در فایروال هاست بسته شود. پس هر
     تکه ۲۰۰ کیلوبایت خام (≈۲۷۰ کیلوبایت بدنه) است و اگر هاست رد کرد، اپ
     خودکار تکه را نصف می‌کند (۲۰۰→۱۰۰→۵۰→۲۵ کیلوبایت) و همان فایل را از
     ابتدا می‌فرستد تا هیچ‌وقت ارسال نیمه‌کاره نماند. */
  const MEDIA_CHUNK_DEFAULT = 200 * 1024;
  const MEDIA_CHUNK_MIN = 24 * 1024;
  const MEDIA_CHUNK_STEPS = [200 * 1024, 100 * 1024, 50 * 1024, 25 * 1024];
  /* هر تکه در خطای شبکه/زمان تا این‌قدر تکرار می‌شود (با مکث فزاینده).
     پیش‌تر ۳ بار بود و فیلم‌های حجیم روی اینترنت ناپایدار نیمه‌کاره می‌ماند. */
  const MEDIA_CHUNK_ATTEMPTS = 6;
  /* سرورهای قدیمی (پیش از این نسخه) بیش از ۵۰۰ تکه در یک فایل نمی‌پذیرفتند */
  const MEDIA_CHUNK_LEGACY_CAP = 480;

  /* ── موازی‌سازی ارسال فایل‌ها ─────────────────────────────────────────
     عکس و فیلم باید «با هم» ارسال شوند، نه یکی‌یکی؛ پس چند فایل هم‌زمان
     می‌روند (پیش‌فرض ۳ فایل). تعداد با window.EPLAK_MEDIA_UPLOAD_CONCURRENCY
     قابل تنظیم است و نتیجه همیشه به ترتیب فهرست اصلی برگردانده می‌شود. */
  function mediaUploadConcurrency() {
    const custom = Number(window.EPLAK_MEDIA_UPLOAD_CONCURRENCY);
    if (isFinite(custom) && custom >= 1 && custom <= 6) return Math.floor(custom);
    return 3;
  }

  async function runMediaPool(items, worker, onDone) {
    const list = Array.from(items || []);
    const results = new Array(list.length);
    let cursor = 0;
    let finished = 0;
    const lanes = Math.min(mediaUploadConcurrency(), Math.max(1, list.length));

    async function lane() {
      while (true) {
        const idx = cursor++;
        if (idx >= list.length) return;
        try {
          results[idx] = await worker(list[idx], idx);
        } catch (e) {
          results[idx] = { ok: false, error: (e && e.message) ? e.message : 'upload-failed' };
        }
        finished++;
        if (typeof onDone === 'function') {
          try { onDone(finished, list.length); } catch (e) {}
        }
      }
    }

    const runners = [];
    for (let i = 0; i < lanes; i++) runners.push(lane());
    await Promise.all(runners);
    return results;
  }

  function mediaChunkSize() {
    const custom = Number(window.EPLAK_MEDIA_CHUNK_SIZE);
    return (isFinite(custom) && custom >= MEDIA_CHUNK_MIN) ? custom : MEDIA_CHUNK_DEFAULT;
  }

  /* ── کدام خطا «قطعی» است؟ ────────────────────────────────────────────────
     تنها خطاهای حجم/نوع/سقف فایل با تکه‌ی کوچک‌تر یا مسیر پشتیبان حل نمی‌شوند.
     هر خطای دیگر (مثلاً پاسخ غیرمنتظره‌ی سرور یا دروازه‌ی بسته) باید شانس
     دوباره بگیرد: هم تکه‌ی کوچک‌تر، هم مسیر پشتیبان api/reports.php.
     پیش‌تر هر پاسخ سروری «قطعی» شمرده می‌شد و فایل بی‌صدا کنار گذاشته می‌شد؛
     نتیجه‌اش این بود که عکس/فیلم دیگر هرگز ارسال نمی‌شد. */
  function isHardMediaError(message) {
    const text = String(message || '');
    if (!text) return false;
    /* «شماره‌ی تکه نامعتبر» (سقف تعداد تکه‌ها) خطای حجم نیست؛ با تکه‌ی بزرگ‌تر حل می‌شود */
    if (/شماره‌ی تکه نامعتبر/.test(text)) return false;
    return /حجم|بزرگ|مجاز نیست|نوع فایل|فرمت|حداکثر|خالی است|post_max_size|upload_max_filesize|413|too large|size/i.test(text);
  }

  /* اگر گوشی آفلاین است، تا برگشتن اینترنت (حداکثر maxMs) صبر می‌کند */
  function waitForOnline(maxMs) {
    return new Promise(resolve => {
      try {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) { resolve(true); return; }
        let finished = false;
        let timer = null;
        const done = (ok) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          window.removeEventListener('online', onOnline);
          resolve(ok);
        };
        const onOnline = () => done(true);
        window.addEventListener('online', onOnline);
        timer = setTimeout(() => done(false), maxMs || 45000);
      } catch (e) { resolve(true); }
    });
  }

  /* ارسال یک تکه. onFraction(0..1) درصدِ همین درخواست را می‌دهد (برای نمودار
     پیشرفت). خطای شبکه/زمان/۵xx تکرار می‌شود؛ پاسخ‌های سروری (۴۰۳/۴۱۳/…) خیر. */
  async function sendMediaChunk(payload, urlOverride, onFraction) {
    const url = urlOverride || (BACKEND_BASE_URL + '/media.php?action=chunk');
    const progress = (typeof onFraction === 'function')
      ? (pct) => { if (pct < 100) onFraction(pct / 100); }
      : null;
    let last = null;
    for (let attempt = 0; attempt < MEDIA_CHUNK_ATTEMPTS; attempt++) {
      last = await postJson(url, payload, 120000, progress);
      if (last && last.success === true) return last;
      const transient = !!(last && last.__transport && (
        last.kind === 'network' || last.kind === 'timeout'
        || (Number(last.status) >= 502 && Number(last.status) <= 504)
      ));
      if (transient && attempt < MEDIA_CHUNK_ATTEMPTS - 1) {
        await waitForOnline(45000);
        await sleep(Math.min(5000, 700 * (attempt + 1)));
        continue;
      }
      return last;
    }
    return last;
  }

  /* ارسال یک فایل با اندازه‌ی تکه‌ی مشخص.
     onProgress(ارسال‌شده‌ی خام، کل) پس از هر تکه (و حین ارسال هر تکه) صدا زده می‌شود.
     خروجی: { ok, media, error, status, unsupported, blocked, tooManyChunks, maxChunks } */
  async function uploadSingleMediaFile(file, size, reportId, phone, onProgress, useFallbackEndpoint, clientRef) {
    const first = await uploadSingleMediaFileOnce(file, size, reportId, phone, onProgress, useFallbackEndpoint, clientRef);
    /* سرور قدیمی: بیش از ۵۰۰ تکه نمی‌پذیرد → همان فایل با تکه‌ی بزرگ‌تر */
    if (!first.ok && first.tooManyChunks && !useFallbackEndpoint) {
      const cap = Number(first.maxChunks) > 0 ? Number(first.maxChunks) : MEDIA_CHUNK_LEGACY_CAP;
      const safeCap = Math.min(cap, MEDIA_CHUNK_LEGACY_CAP);
      const bigger = Math.ceil(file.size / safeCap / 1024) * 1024;
      if (bigger > size) {
        return uploadSingleMediaFileOnce(file, bigger, reportId, phone, onProgress, false, clientRef);
      }
    }
    return first;
  }

  async function uploadSingleMediaFileOnce(file, size, reportId, phone, onProgress, useFallbackEndpoint, clientRef) {
    const fileName = file.name || 'attachment';
    const total = size > 0 ? Math.max(1, Math.ceil(file.size / size)) : 1;
    const uploadId = (Date.now().toString(16) + Math.floor(Math.random() * 0xffffff).toString(16)).slice(0, 32);
    const chunkUrl = BACKEND_BASE_URL + '/media.php?action=chunk';
    const wholeUrl = BACKEND_BASE_URL + '/reports.php?action=add_media';
    const report = (loaded) => {
      if (typeof onProgress === 'function') {
        try { onProgress(Math.max(0, Math.min(file.size, loaded)), file.size); } catch (e) {}
      }
    };

    /* ── مسیر پایانی: یک فایل کامل از دروازه‌ی گزارش‌ها ─────────────────
       اگر مسیر تکه‌تکه روی هاست بسته باشد (فایروال یا نسخه‌ی قدیمی)، همین
       گزارش‌ها که همیشه باز است، فایل را یک‌جا می‌پذیرد. */
    if (useFallbackEndpoint) {
      if (file.size > 12 * 1024 * 1024) {
        return { ok: false, media: null, error: 'فایل «' + fileName + '» برای مسیر پشتیبان بزرگ است', status: 0, unsupported: false, blocked: false };
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) {
        return { ok: false, media: null, error: 'خواندن فایل «' + fileName + '» روی گوشی ممکن نشد.', status: 0, unsupported: false, blocked: false };
      }
      const res = await postJson(wholeUrl, {
        action: 'add_media',
        phone: phone,
        client_ref: clientRef || '',
        reportId: reportId,
        name: fileName,
        mime: file.type || '',
        data: dataUrl
      }, 180000, (pct) => { if (pct < 100) report(file.size * pct / 100); });
      if (!res) return { ok: false, media: null, error: 'ارتباط با سرور برقرار نشد.', status: 0, unsupported: false, blocked: false };
      if (res.__transport) {
        const code = res.status || 0;
        return {
          ok: false, media: null,
          error: res.error || 'ارسال فایل ناموفق بود.',
          status: code,
          unsupported: (code === 404 || code === 405),
          blocked: (code === 403 || code === 413)
        };
      }
      if (res.success !== true) {
        return { ok: false, media: null, error: String(res.error || 'ارسال فایل ناموفق بود.'), status: 0, unsupported: false, blocked: false };
      }
      report(file.size);
      return { ok: true, media: res.media || null, error: '', status: 200, unsupported: false, blocked: false };
    }

    /* ── مسیر عادی: تکه‌تکه ───────────────────────────────────────────── */
    let index = 0;
    let resyncs = 0;
    report(0);
    while (index < total) {
      const start = index * size;
      const chunk = file.slice(start, Math.min(file.size, start + size));
      const data = await readFileAsDataUrl(chunk);
      if (!data) {
        return { ok: false, media: null, error: 'خواندن فایل «' + fileName + '» روی گوشی ممکن نشد.', status: 0, unsupported: false, blocked: false };
      }

      const res = await sendMediaChunk({
        phone: phone,
        reportId: reportId,
        uploadId: uploadId,
        index: index,
        total: total,
        name: fileName,
        mime: file.type || '',
        /* شناسه‌ی یکتای درخواست: بدون آن، سرور فایلِ «پیش از ثبت گزارش»
           (reportId = 0) را رد می‌کند و عکس/فیلم هرگز بارگذاری نمی‌شود. */
        client_ref: clientRef || '',
        data: data
      }, chunkUrl, (fraction) => report(start + fraction * chunk.size));

      if (!res) return { ok: false, media: null, error: 'ارتباط با سرور برقرار نشد.', status: 0, unsupported: false, blocked: false };
      if (res.__transport) {
        const code = res.status || 0;
        return {
          ok: false, media: null,
          error: res.error || 'ارسال فایل ناموفق بود.',
          status: code,
          unsupported: (code === 404 || code === 405),
          blocked: (code === 403 || code === 413)
        };
      }
      if (res.success !== true) {
        /* سرور می‌گوید «تکه‌ی بعدیِ من فلان است» (پاسخ ۴۰۹: ترتیب به‌هم خورده،
           معمولاً چون پاسخ تکه‌ی قبلی گم شد). به‌جای شروع از صفر، همان‌جا ادامه
           می‌دهیم. */
        const expected = Number(res.expected);
        if (isFinite(expected) && expected >= 0 && expected <= total && expected !== index && resyncs < 8) {
          resyncs++;
          index = expected;
          report(Math.min(file.size, index * size));
          continue;
        }
        const message = String(res.error || 'ارسال فایل ناموفق بود.');
        const tooMany = /شماره‌ی تکه نامعتبر/.test(message) && total > 1;
        return {
          ok: false, media: null, error: message, status: 0,
          unsupported: (message.indexOf('گزارش یافت نشد') > -1 || message.indexOf('کنش نامعتبر') > -1),
          blocked: false,
          tooManyChunks: tooMany,
          maxChunks: Number(res.max_chunks) || 0
        };
      }
      report(Math.min(file.size, (index + 1) * size));
      if (index === total - 1 || res.done === true) {
        return { ok: true, media: res.media || null, error: '', status: 200, unsupported: false, blocked: false };
      }
      /* شمارنده‌ی سرور مرجع است (تکه‌ی تکراری هم همین‌جا درست جلو می‌رود) */
      const received = Number(res.received);
      index = (isFinite(received) && received > index) ? received : index + 1;
    }
    return { ok: false, media: null, error: 'ارسال فایل کامل نشد.', status: 0, unsupported: false, blocked: false };
  }

  /* ── ارسال پیوست‌ها با نقشه‌ی پشتیبان چندمرحله‌ای ─────────────────────
     مرحله ۱: تکه‌های ۲۰۰ کیلوبایتی.
     مرحله ۲ و ۳: اگر هاست بدنه را رد کرد، همان فایل‌ها با تکه‌های کوچک‌تر
                  (۱۰۰ و ۵۰ و ۲۵ کیلوبایت) از ابتدا فرستاده می‌شوند.
     مرحله ۴: اگر مسیر تکه‌تکه اصلاً بسته بود، هر فایل یک‌جا از دروازه‌ی
              api/reports.php?action=add_media (که همیشه باز است) می‌رود.
     در هر مرحله، فایل‌های موفق کنار گذاشته می‌شوند تا دوباره فرستاده نشوند.

     پیشرفت «هر فایل»: opts.onFile(index, event) با رویدادهای
       start | progress{loaded,total} | restart{note} | done | fail{note}
     صدا زده می‌شود (index = جایگاه فایل در فهرست ورودی). onProgress(درصد کل)
     هم بر پایه‌ی «بایت» است، نه تعداد فایل. */
  async function uploadReportMediaChunked(reportId, phone, files, onProgress, opts) {
    /* opts.clientRef → ارسال «در انتظار اتصال»: فایل پیش از ساخته شدن گزارش
       ذخیره می‌شود و هنگام ساخت گزارش به آن متصل می‌گردد. */
    const clientRef = (opts && opts.clientRef) ? String(opts.clientRef) : '';
    const list = Array.from(files || []);
    const empty = { ok: true, media: [], failed: [], error: '', unsupported: false, blocked: false, status: 0 };
    if ((!reportId && !clientRef) || !list.length) return empty;

    const emit = (idx, event) => {
      if (opts && typeof opts.onFile === 'function') {
        try { opts.onFile(idx, event); } catch (e) { /* خطای نمایش، ارسال را خراب نکند */ }
      }
    };

    const savedMedia = [];
    let remaining = list.map((file, idx) => ({ file: file, idx: idx }));
    const hardFailed = [];     /* خطای منطقی (حجم/نوع) — تکرار با تکه‌ی کوچک‌تر بی‌فایده است */
    const errorBy = {};        /* آخرین دلیل شکست هر فایل (برای نمودار) */
    let lastError = '';
    let lastStatus = 0;
    let unsupported = false;
    let blocked = false;

    /* درصد کل بر پایه‌ی بایت */
    const sizeOf = (entry) => Number(entry.file.size) || 0;
    const loadedBy = list.map(() => 0);
    const totalBytes = list.reduce((sum, f) => sum + (Number(f.size) || 0), 0) || 1;
    let overall = 0;
    const reportOverall = () => {
      if (typeof onProgress !== 'function') return;
      const sum = loadedBy.reduce((a, b) => a + b, 0);
      const pct = Math.min(99, Math.floor(sum / totalBytes * 100));
      if (pct > overall) overall = pct;      /* درصد کل هیچ‌وقت عقب نمی‌رود */
      onProgress(overall);
    };
    const fileProgress = (entry) => (loaded, total) => {
      loadedBy[entry.idx] = Math.max(0, Math.min(sizeOf(entry), Number(loaded) || 0));
      emit(entry.idx, { type: 'progress', loaded: loadedBy[entry.idx], total: Number(total) || sizeOf(entry) });
      reportOverall();
    };
    const finishEntry = (entry) => {
      loadedBy[entry.idx] = sizeOf(entry);
      emit(entry.idx, { type: 'done' });
      reportOverall();
    };
    const noteFailure = (entry, res) => {
      errorBy[entry.idx] = (res && res.error) || errorBy[entry.idx] || '';
      lastError = (res && res.error) || lastError;
      lastStatus = (res && res.status) || lastStatus;
      if (res && res.unsupported) unsupported = true;
      if (res && res.blocked) blocked = true;
    };

    const custom = Number(window.EPLAK_MEDIA_CHUNK_SIZE);
    const sizes = (isFinite(custom) && custom >= MEDIA_CHUNK_MIN)
      ? [custom].concat(MEDIA_CHUNK_STEPS.filter(s => s < custom))
      : MEDIA_CHUNK_STEPS.slice();

    for (let stage = 0; stage < sizes.length && remaining.length; stage++) {
      const size = sizes[stage];
      const stillFailed = [];
      let goGateway = false;      /* پاسخ سروری منطقی → مستقیم به دروازه‌ی پشتیبان */
      remaining.forEach((entry) => {
        loadedBy[entry.idx] = 0;
        emit(entry.idx, stage === 0
          ? { type: 'start' }
          : { type: 'restart', note: 'ارسال دوباره با بسته‌های کوچک‌تر' });
      });
      /* چند فایل هم‌زمان فرستاده می‌شوند تا عکس و فیلم با هم بالا بروند */
      const results = await runMediaPool(remaining, async (entry) => {
        const res = await uploadSingleMediaFile(entry.file, size, reportId, phone, fileProgress(entry), false, clientRef);
        if (res && res.ok) finishEntry(entry);
        return res;
      }, null);
      results.forEach((res, i) => {
        const entry = remaining[i];
        if (res && res.ok) {
          if (res.media) savedMedia.push(res.media);
        } else {
          noteFailure(entry, res);
          /* فقط خطای حجم/نوع/سقف «قطعی» است؛ بقیه شانس دوباره می‌گیرند. */
          if (isHardMediaError((res && res.error) || '')) {
            hardFailed.push(entry);
          } else {
            stillFailed.push(entry);
            if (res && res.status === 0 && !res.blocked && !res.unsupported) goGateway = true;
          }
        }
      });
      remaining = stillFailed;
      /* تکه‌ی کوچک‌تر، پاسخ منطقی سرور را تغییر نمی‌دهد؛ زودتر به مسیر
         پشتیبان (api/reports.php?action=add_media) می‌رویم. */
      if (goGateway) break;
    }

    /* مرحله‌ی پشتیبان: دروازه‌ی گزارش‌ها (بدون تکه‌تکه) */
    if (remaining.length) {
      remaining.forEach((entry) => {
        loadedBy[entry.idx] = 0;
        emit(entry.idx, { type: 'restart', note: 'ارسال یک‌جا از مسیر پشتیبان' });
      });
      const stillFailed = [];
      const results = await runMediaPool(remaining, async (entry) => {
        const res = await uploadSingleMediaFile(entry.file, 0, reportId, phone, fileProgress(entry), true, clientRef);
        if (res && res.ok) finishEntry(entry);
        return res;
      }, null);
      results.forEach((res, i) => {
        const entry = remaining[i];
        if (res && res.ok) {
          if (res.media) savedMedia.push(res.media);
        } else {
          stillFailed.push(entry);
          noteFailure(entry, res);
        }
      });
      remaining = stillFailed;
    }

    const failedEntries = remaining.concat(hardFailed);
    failedEntries.forEach((entry) => {
      emit(entry.idx, { type: 'fail', note: errorBy[entry.idx] || lastError || 'ارسال فایل ناموفق بود.' });
    });
    if (typeof onProgress === 'function' && !failedEntries.length) onProgress(100);

    return {
      ok: failedEntries.length === 0 && savedMedia.length > 0,
      media: savedMedia,
      failed: failedEntries.map(entry => entry.file.name || 'attachment'),
      error: lastError,
      unsupported: unsupported,
      blocked: blocked,
      status: lastStatus
    };
  }

  /* ── صف پیوست‌های ناموفق (نگه‌داشتن فایل در گوشی تا ارسال موفق) ──────────
     اگر هنگام ثبت گزارش، اینترنت ضعیف باشد یا سرور فایل را نپذیرد، فایل در
     حافظه‌ی مرورگر/اپ (IndexedDB) ذخیره می‌شود و در نخستین فرصت — باز شدن
     دوباره‌ی اپ یا برگشتن اینترنت — خودکار دوباره فرستاده می‌شود. پس کاربر
     هیچ‌وقت عکس/فیلمش را از دست نمی‌دهد و لازم نیست کاری انجام دهد.
     اگر مرورگر از IndexedDB پشتیبانی نکند، این بخش بی‌صدا کنار گذاشته
     می‌شود و رفتار قبلی (دکمه‌ی تلاش دوباره) برجا می‌ماند. */
  const PENDING_DB = 'eplak_pending_media';
  const PENDING_STORE = 'items';

  function openPendingDb() {
    return new Promise(resolve => {
      try {
        if (!window.indexedDB) {
          resolve(null);
          return;
        }
        const req = window.indexedDB.open(PENDING_DB, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (db && !db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function pendingTx(db, mode) {
    return db.transaction(PENDING_STORE, mode).objectStore(PENDING_STORE);
  }

  /* خواندن همه‌ی ردیف‌های صف (یک‌جا و با مدیریت خطا) */
  function pendingDbAll(db) {
    return new Promise(resolve => {
      try {
        const req = pendingTx(db, 'readonly').getAll();
        req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }

  /* حذف ردیف‌های مشخص از صف.
     نکته‌ی مهم (ریشه‌ی باگ «عکس و فیلم مجدد بارگذاری نمی‌شود»): پیش‌تر اینجا
     به‌جای store از transaction استفاده می‌شد و delete روی «فروشگاه فایل»
     صدا زده می‌شد که وجود ندارد؛ پس هیچ ردیفی پاک نمی‌شد و تابع حتی پس از
     ارسال موفق، «نرسید» برمی‌گرداند. در نتیجه هر تلاش دوباره از اول شروع
     می‌شد و گزارش هیچ‌وقت ساخته نمی‌شد. */
  function pendingDbDelete(db, keys) {
    const list = Array.from(keys || []).filter(Boolean);
    if (!list.length) return Promise.resolve(true);
    return new Promise(resolve => {
      try {
        const store = pendingTx(db, 'readwrite');
        list.forEach(key => { try { store.delete(key); } catch (e) {} });
        store.transaction.oncomplete = function () { resolve(true); };
        store.transaction.onerror = function () { resolve(false); };
        store.transaction.onabort = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  /* وضعیت صف یک درخواست: چند فایل مانده و چندتایش قابل خواندن است */
  async function pendingMediaRefState(clientRef, phone) {
    const ref = clientRef ? String(clientRef) : '';
    const empty = { queued: 0, readable: 0 };
    if (!ref || !phone) return empty;
    const db = await openPendingDb();
    if (!db) return empty;
    const rows = await pendingDbAll(db);
    const mine = rows.filter(r => String(r.clientRef || '') === ref && String(r.phone) === String(phone));
    const readable = mine.filter(r => r && r.blob && typeof r.blob === 'object' && (Number(r.blob.size) || 0) > 0);
    return { queued: mine.length, readable: readable.length };
  }

  /* افزودن فایل‌های ناموفق به صف (برای ارسال خودکار در فرصت بعدی) */
  async function queuePendingMedia(reportId, phone, files, clientRef) {
    const list = Array.from(files || []).filter(f => f && typeof f === 'object' && (f.size || 0) > 0);
    const ref = clientRef ? String(clientRef) : '';
    /* بدون شناسه‌ی گزارش هم می‌توان فایل را صف کرد، به شرط داشتن شناسه‌ی
       یکتای درخواست (مسیر «اول فایل، بعد گزارش»). */
    if ((!reportId && !ref) || !phone || !list.length) return false;
    const db = await openPendingDb();
    if (!db) return false;
    const stamp = Date.now();
    return new Promise(resolve => {
      try {
        const store = pendingTx(db, 'readwrite');
        list.forEach((file, i) => {
          store.put({
            key: (ref ? ref : String(reportId)) + '-' + stamp + '-' + i,
            reportId: Number(reportId) || 0,
            clientRef: ref,
            phone: String(phone),
            name: file.name || ('attachment-' + (i + 1)),
            type: file.type || '',
            size: Number(file.size) || 0,
            blob: file,
            addedAt: new Date().toISOString()
          });
        });
        store.transaction.oncomplete = function () { resolve(true); };
        store.transaction.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  /* تعداد فایل‌های در انتظار ارسال */
  async function countPendingMedia() {
    const db = await openPendingDb();
    if (!db) return 0;
    return new Promise(resolve => {
      try {
        const req = pendingTx(db, 'readonly').count();
        req.onsuccess = function () { resolve(Number(req.result) || 0); };
        req.onerror = function () { resolve(0); };
      } catch (e) { resolve(0); }
    });
  }

  /* تلاش دوباره برای همه‌ی فایل‌های صف (هنگام باز شدن اپ یا برگشتن اینترنت) */
  /* ── ارسال فایل‌های صف‌شده‌ی یک «درخواست» (شناسه‌ی یکتا) ────────────────
     برمی‌گرداند true اگر همه‌ی فایل‌های آن درخواست رسیده باشند؛ تا وقتی
     false است، اپ گزارش را نمی‌سازد و کد پیگیری صادر نمی‌شود. */
  async function flushPendingMediaRef(clientRef, phone, reportId, hooks) {
    const ref = clientRef ? String(clientRef) : '';
    if (!ref || !phone) return false;
    const db = await openPendingDb();
    if (!db) return false;
    const rows = await pendingDbAll(db);
    const mine = rows.filter(r => String(r.clientRef || '') === ref && String(r.phone) === String(phone));
    if (!mine.length) return true;    /* چیزی برای این درخواست در صف نمانده است */
    mine.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
    /* فایل‌هایی که بایتشان در حافظه نمانده است (باز شدن دوباره‌ی اپ روی بعضی
       وب‌ویوها) ارسال‌شدنی نیستند؛ گزارش در انتظار می‌ماند تا کاربر دوباره
       همان عکس/فیلم را پیوست کند (با همان شناسه، پس کد پیگیری تکراری نمی‌شود). */
    const usable = mine.filter(r => r && r.blob && typeof r.blob === 'object' && (Number(r.blob.size) || 0) > 0);
    if (!usable.length) return false;
    /* hooks (اختیاری): { begin(فایل‌ها), onFile, onProgress } برای نمودار پیشرفت هر فایل */
    if (hooks && typeof hooks.begin === 'function') {
      try { hooks.begin(usable.map(r => ({ name: r.name, size: Number(r.size) || (r.blob && r.blob.size) || 0, type: r.type || (r.blob && r.blob.type) || '' }))); } catch (e) {}
    }
    const res = await uploadReportMediaChunked(
      Number(reportId) || 0, String(phone), usable.map(i => i.blob),
      (hooks && hooks.onProgress) || null,
      { clientRef: ref, onFile: (hooks && hooks.onFile) || null }
    );
    const okCount = (res && Array.isArray(res.media)) ? res.media.length : 0;
    if (res && res.ok && okCount > 0) {
      /* فقط ردیف‌هایی پاک می‌شوند که واقعاً به سرور رسیده‌اند */
      await pendingDbDelete(db, usable.map(item => item.key));
      return true;   /* فایل‌های همین درخواست رسیدند */
    }
    return false;
  }

  async function flushPendingMedia(onReportDone, hooks) {
    const db = await openPendingDb();
    if (!db) return { sent: 0, left: 0 };
    const rows = await pendingDbAll(db);
    if (!rows.length) return { sent: 0, left: 0 };

    /* گروه‌بندی بر اساس گزارش؛ ترتیب تکه‌ها بر اساس زمان افزوده‌شدن است */
    rows.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
    const groups = new Map();
    rows.forEach(row => {
      const ref = row.clientRef ? String(row.clientRef) : '';
      const key = (ref ? ('ref:' + ref) : ('id:' + String(row.reportId))) + '|' + String(row.phone);
      if (!groups.has(key)) groups.set(key, { reportId: Number(row.reportId) || 0, clientRef: ref, phone: row.phone, items: [] });
      groups.get(key).items.push(row);
    });

    let sent = 0;
    const failedGroups = new Set();
    const leftovers = [];
    for (const [key, group] of groups.entries()) {
      /* گروهی که همین حالا کاربر دارد دستی دوباره می‌فرستد، رد می‌شود؛ ولی فایل‌هایش
         از صف پاک نمی‌شوند (جزو «هنوز نرسیده» می‌ماند). */
      if (hooks && typeof hooks.skip === 'function' && hooks.skip(group)) {
        failedGroups.add(key);
        continue;
      }
      /* hooks.begin(group, files) / hooks.onFile(group, index, event): نمودار پیشرفت
         ارسال خودکارِ فایل‌های جامانده (همان نمودار «روند رسیدگی») */
      if (hooks && typeof hooks.begin === 'function') {
        try {
          hooks.begin(group, group.items.map(r => ({ name: r.name, size: Number(r.size) || (r.blob && r.blob.size) || 0, type: r.type || (r.blob && r.blob.type) || '' })));
        } catch (e) {}
      }
      const groupOpts = group.clientRef ? { clientRef: group.clientRef } : {};
      if (hooks && typeof hooks.onFile === 'function') {
        groupOpts.onFile = (idx, event) => hooks.onFile(group, idx, event);
      }
      const res = await uploadReportMediaChunked(group.reportId, group.phone, group.items.map(i => i.blob), null,
        (group.clientRef || groupOpts.onFile) ? groupOpts : null);
      const okCount = (res && Array.isArray(res.media)) ? res.media.length : 0;
      if (res && res.ok && okCount > 0) {
        sent += group.items.length;
        if (typeof onReportDone === 'function') {
          try { onReportDone(group.reportId, group.clientRef, group.items.length); } catch (e) {}
        }
      } else {
        failedGroups.add(key);
      }
    }
    groups.forEach((group, key) => {
      if (failedGroups.has(key)) group.items.forEach(item => leftovers.push(item));
    });

    /* صف بازنویسی می‌شود: فقط فایل‌های ناموفق باقی می‌مانند */
    if (sent > 0) {
      await new Promise(resolve => {
        try {
          const store = pendingTx(db, 'readwrite');
          store.clear();
          leftovers.forEach(item => store.put(item));
          store.transaction.oncomplete = function () { resolve(true); };
          store.transaction.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }

    return { sent: sent, left: await countPendingMedia() };
  }

  window.eplakQueuePendingMedia = queuePendingMedia;
  window.eplakFlushPendingMedia = flushPendingMedia;
  window.eplakFlushPendingMediaRef = flushPendingMediaRef;
  window.eplakPendingMediaRefState = pendingMediaRefState;
  window.eplakCountPendingMedia = countPendingMedia;

  /* وضعیت پیوست‌های یک گزارش روی سرور (برای تأیید نهایی که فایل‌ها ذخیره شدند) */
  async function reportMediaStatus(reportId, phone) {
    if (!reportId || !phone) return null;
    const res = await postJson(BACKEND_BASE_URL + '/media.php?action=media_status', { phone: phone, reportId: reportId }, 30000);
    if (!res || res.__transport || res.success !== true) return null;
    return {
      count: Number(res.media_count || 0),
      max: Number(res.max || 0),
      media: Array.isArray(res.media) ? res.media : []
    };
  }

  async function syncFormDataToBackend(endpoint, formData) {
    if (!formData || typeof FormData === 'undefined' || !(formData instanceof FormData)) return null;
    try {
      const response = await fetch(BACKEND_BASE_URL + '/' + endpoint + '.php', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        console.warn('[backend] form request failed', endpoint, await response.text());
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[backend] form unavailable', endpoint, error.message);
      return null;
    }
  }
  window.syncFormDataToBackend = syncFormDataToBackend;

  function syncUserProfileToBackend(phone = getCurrentPhone()) {
    if (!phone) return;
    const nameInput = document.getElementById('editNameInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    const profile = getProfileByPhone(phone);
    const payload = {
      phone,
      name: (nameInput?.value || '').trim() || profile.name || DEFAULT_NAME,
      address: (addressInput?.value || '').trim(),
      nid: (nidInput?.value || '').trim()
    };
    syncDataToBackend('users', payload);
  }

  /* ─── پروفایل (نام + عکس) ──────────────────────────────────────── */
  function readAllProfiles() {
    const p = lsGetJSON(LS_PROFILES, {});
    return (p && typeof p === 'object') ? p : {};
  }
  function writeAllProfiles(all) { lsSetJSON(LS_PROFILES, all); }

  function getCurrentPhone() { return lsGet(LS_CURRENT) || ''; }
  function setCurrentPhone(phone) {
    if (phone) lsSet(LS_CURRENT, phone);
    else lsDel(LS_CURRENT);
  }

  function getProfileByPhone(phone) {
    if (!phone) return { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
    const all = readAllProfiles();
    const ex = all[phone];
    return {
      name:    (ex && ex.name)    ? ex.name    : DEFAULT_NAME,
      avatar:  (ex && ex.avatar)  ? ex.avatar  : DEFAULT_AVATAR,
      address: (ex && typeof ex.address === 'string') ? ex.address : '',
      nid:     (ex && typeof ex.nid === 'string') ? ex.nid : ''
    };
  }
  function ensureProfileExists(phone) {
    if (!phone) return;
    const all = readAllProfiles();
    if (!all[phone]) {
      all[phone] = { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
      writeAllProfiles(all);
    }
  }
  function updateProfileByPhone(phone, patch) {
    if (!phone) return;
    const all = readAllProfiles();
    const cur = all[phone] || { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
    all[phone] = Object.assign({}, cur, patch);
    writeAllProfiles(all);
  }

  async function loadUserProfileFromBackend(phone) {
    if (!phone) return;
    try {
      const response = await fetch(BACKEND_BASE_URL + '/users.php?phone=' + encodeURIComponent(phone));
      if (!response.ok) return;
      const data = await response.json();
      if (!data.success || !data.user) return;
      updateProfileByPhone(phone, {
        name:    data.user.name || DEFAULT_NAME,
        address: data.user.address || '',
        nid:     data.user.nid || '',
        avatar:  data.user.avatar || DEFAULT_AVATAR
      });
      if (typeof userProfile === 'object' && userProfile) {
        userProfile.name = data.user.name || DEFAULT_NAME;
      }
      updateProfileUI();
    } catch (error) {
      console.warn('[backend] profile fetch failed', error.message);
    }
  }

  /* ─── کلیدهای per-phone برای سایر داده‌ها ──────────────────────── */
  function keyReports(phone)  { return 'eplak_reports_'  + phone; }
  function keyPayments(phone) { return 'eplak_payments_' + phone; }
  function keyNotifs(phone)   { return 'eplak_notifs_'   + phone; }
  function keyFavIds(phone)   { return 'eplak_favids_'   + phone; }
  function keyRid(phone)      { return 'eplak_rid_'      + phone; }

  /* داده‌های پیش‌فرض برای یک کاربر تازه */
  function defaultPayments() {
    return [
      { id: 'p1', code: 'INV-9001', title: 'عوارض نوسازی سال ۱۴۰۳', due: '۱۴۰۳/۰۴/۳۱', amount: 1850000, status: 'pending' },
      { id: 'p2', code: 'INV-8744', title: 'عوارض پسماند بهار',       due: '۱۴۰۳/۰۳/۳۱', amount:  420000, status: 'pending' },
      { id: 'p3', code: 'INV-8120', title: 'عوارض کسب و پیشه',       due: '۱۴۰۳/۰۲/۱۵', amount: 2200000, status: 'done'    }
    ];
  }
  function defaultNotifications() {
    return [
      { id: 'no1', title: 'خوش آمدید', body: 'به اپ ای‌پلاک خوش آمدید.', time: 'هم‌اکنون', icon: '👋', read: false }
    ];
  }
  function defaultFavIds() { return ['s1', 's4']; }

  /* ─── بارگذاری داده‌های یک شماره به متغیرهای سراسری ────────────── */
  function loadUserData(phone) {
    if (!phone) return;

    /* گزارش‌ها */
    const savedReports = lsGetJSON(keyReports(phone), null);
    if (savedReports !== null) {
      reports.length = 0;
      savedReports.forEach(r => reports.push(r));
    } else {
      /* اولین ورود این شماره — گزارش‌های نمونه حذف، لیست خالی */
      reports.length = 0;
      saveReports(phone);
    }

    /* تیکت‌های همین شماره */
    if (typeof window.loadSavedTickets === 'function') window.loadSavedTickets(phone);

    /* شمارنده آی‌دی گزارش */
    const rid = lsGetJSON(keyRid(phone), 1);
    reportIdCounter = typeof rid === 'number' ? rid : 1;

    /* پرداخت‌ها */
    const savedPayments = lsGetJSON(keyPayments(phone), null);
    if (savedPayments !== null) {
      payments.length = 0;
      savedPayments.forEach(p => payments.push(p));
    } else {
      payments.length = 0;
      defaultPayments().forEach(p => payments.push(p));
      savePayments(phone);
    }

    /* اعلان‌ها */
    const savedNotifs = lsGetJSON(keyNotifs(phone), null);
    if (savedNotifs !== null) {
      notifications.length = 0;
      savedNotifs.forEach(n => notifications.push(n));
    } else {
      notifications.length = 0;
      defaultNotifications().forEach(n => notifications.push(n));
      saveNotifications(phone);
    }

    /* علاقه‌مندی‌ها */
    const savedFavs = lsGetJSON(keyFavIds(phone), null);
    if (savedFavs !== null) {
      favoriteIds.length = 0;
      savedFavs.forEach(id => favoriteIds.push(id));
    } else {
      favoriteIds.length = 0;
      defaultFavIds().forEach(id => favoriteIds.push(id));
      saveFavorites(phone);
    }
  }

  /* ─── ذخیره داده‌ها ─────────────────────────────────────────────── */
  function saveReports(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyReports(phone), reports);
    lsSetJSON(keyRid(phone), reportIdCounter);
  }
  function savePayments(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyPayments(phone), payments);
  }
  function saveNotifications(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyNotifs(phone), notifications);
  }
  function saveFavorites(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyFavIds(phone), favoriteIds);
  }

  const DEFAULT_AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:55%;height:55%;color:rgba(255,255,255,0.9);margin:auto;"><circle cx="12" cy="8" r="4.5" fill="currentColor" fill-opacity="0.25"/><path d="M20 21a8 8 0 0 0-16 0" fill="currentColor" fill-opacity="0.15"/></svg>';

  /* ─── رندر UI پروفایل ───────────────────────────────────────────── */
  function renderAvatarInto(el, avatarValue) {
    if (!el) return;
    if (avatarValue && avatarValue.startsWith('data:image')) {
      el.innerHTML = '<img src="' + avatarValue + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;aspect-ratio:1/1;">';
    } else if (avatarValue && avatarValue.indexOf('<svg') !== -1) {
      el.innerHTML = avatarValue;
    } else {
      el.innerHTML = DEFAULT_AVATAR_SVG;
    }
  }

  function formatPhoneDisplaySafe(raw) {
    if (typeof formatPhoneDisplay === 'function') return formatPhoneDisplay(raw);
    if (!raw || raw.length !== 11) return raw;
    return raw.slice(0, 4) + ' ' + raw.slice(4, 7) + ' ' + raw.slice(7);
  }

  function updateProfileUI() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const defaultName = isEn ? 'Citizen' : DEFAULT_NAME;
    const noPhone = isEn ? 'No phone registered' : 'شماره ثبت نشده';
    const noNid = isEn ? 'National ID not registered' : 'کد ملی ثبت نشده';
    const noAddr = isEn ? 'Address not registered' : 'آدرس ثبت نشده';

    document.querySelectorAll('#profileNameDisplay').forEach(x => {
      const val = profile.name || defaultName;
      x.textContent = (isEn && val === DEFAULT_NAME) ? 'Citizen' : val;
    });
    document.querySelectorAll('#profilePhoneDisplay').forEach(x => x.textContent = phone ? formatPhoneDisplaySafe(phone) : noPhone);
    document.querySelectorAll('#profileNidDisplay').forEach(x => x.textContent = profile.nid || noNid);
    document.querySelectorAll('#profileAddressDisplay').forEach(x => x.textContent = profile.address || noAddr);
    document.querySelectorAll('.avatar').forEach(x => renderAvatarInto(x, profile.avatar));

    const homeName = document.getElementById('homeUserName');
    if (homeName) {
      const displayName = (isEn && (!profile.name || profile.name === DEFAULT_NAME)) ? 'Citizen' : (profile.name || DEFAULT_NAME);
      homeName.textContent = (isEn ? 'Hello ' : 'سلام ') + displayName;
    }
    updateHomeProfileMenu();

    refreshAvatarActionButtons();
    closeProfileActionsMenu();
  }

  function toggleProfileActionsMenu() {
    const panel = document.getElementById('profileActionsPanel');
    if (!panel) return;
    panel.classList.toggle('open');
  }

  function closeProfileActionsMenu() {
    const panel = document.getElementById('profileActionsPanel');
    if (!panel) return;
    panel.classList.remove('open');
  }

  function toggleHomeProfileMenu() {
    const panel = document.getElementById('homeProfileActionsPanel');
    if (!panel) return;
    panel.classList.toggle('open');
  }

  function closeHomeProfileMenu() {
    const panel = document.getElementById('homeProfileActionsPanel');
    if (!panel) return;
    panel.classList.remove('open');
  }

  function updateHomeProfileMenu() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const label = document.getElementById('homeProfileButtonLabel');
    const menuName = document.getElementById('homeProfileMenuName');
    const menuPhone = document.getElementById('homeProfileMenuPhone');
    if (label) label.textContent = profile.name || DEFAULT_NAME;
    if (menuName) menuName.textContent = profile.name || DEFAULT_NAME;
    if (menuPhone) menuPhone.textContent = phone ? formatPhoneDisplaySafe(phone) : '';
  }

  document.addEventListener('click', event => {
    const panel = document.getElementById('profileActionsPanel');
    const toggle = document.getElementById('profileMenuToggleBtn');
    const homePanel = document.getElementById('homeProfileActionsPanel');
    const homeToggle = document.getElementById('homeProfileToggleBtn');
    if (panel && panel.classList.contains('open')) {
      if (panel.contains(event.target) || toggle?.contains(event.target)) {
        return;
      }
      panel.classList.remove('open');
    }
    if (homePanel && homePanel.classList.contains('open')) {
      if (homePanel.contains(event.target) || homeToggle?.contains(event.target)) {
        return;
      }
      homePanel.classList.remove('open');
    }
  });

  /* ─── ورود با شماره ─────────────────────────────────────────────── */
  function loginWithPhone(phone) {
    if (!phone) return;
    ensureProfileExists(phone);
    setCurrentPhone(phone);

    const profile = getProfileByPhone(phone);
    syncUserProfileToBackend(phone);
    if (typeof loadUserProfileFromBackend === 'function') {
      loadUserProfileFromBackend(phone);
    }
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = phone;
      userProfile.phone = formatPhoneDisplaySafe(phone);
      userProfile.name = profile.name;
    }

    /* بارگذاری داده‌های اختصاصی این شماره */
    loadUserData(phone);
    if (typeof loadReportsFromBackend === 'function') {
      loadReportsFromBackend(phone, { silent: true });
    }
    updateProfileUI();
  }

  /* ─── خروج ─────────────────────────────────────────────────────── */
  function logoutCurrentUser() {
    setCurrentPhone('');
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = '';
      userProfile.phone = '';
      userProfile.name = DEFAULT_NAME;
    }
    /* پاک کردن متغیرهای سراسری تا کاربر بعدی داده قدیمی نبیند */
    if (typeof reports !== 'undefined') reports.length = 0;
    if (typeof payments !== 'undefined') payments.length = 0;
    if (typeof notifications !== 'undefined') notifications.length = 0;
    if (typeof favoriteIds !== 'undefined') favoriteIds.length = 0;
    if (typeof window.clearTicketsInMemory === 'function') window.clearTicketsInMemory();
  }

  /* ─── «حساب داخل اپ ذخیره نشود» ───────────────────────────────────
     درخواست کارفرما: اپ اندروید بعد از بسته شدن (خروج با دوبار زدن دکمه‌ی
     بازگشت) باید دوباره کد تایید بخواهد. بنابراین هر بار که اپ از صفر بالا
     می‌آید، اطلاعات ورود از دستگاه پاک می‌شود؛ مگر کاربر همان لحظه کد تایید
     را وارد کرده باشد (markLoginDone در اندروید ثبت می‌شود). */
  function clearStoredSession() {
    try {
      setCurrentPhone('');
      if (typeof userProfile === 'object' && userProfile) {
        userProfile.rawPhone = '';
        userProfile.phone = '';
        userProfile.name = DEFAULT_NAME;
      }
      if (typeof reports !== 'undefined') reports.length = 0;
      if (typeof payments !== 'undefined') payments.length = 0;
      if (typeof notifications !== 'undefined') notifications.length = 0;
      if (typeof favoriteIds !== 'undefined') favoriteIds.length = 0;
    } catch (e) {}
  }
  window.clearStoredSession = clearStoredSession;

  /* آیا اپ اندروید می‌گوید «این بالا آمدن تازه است و باید کد تایید گرفته شود»؟ */
  function nativeRequiresLogin() {
    try {
      if (window.AndroidApp && typeof window.AndroidApp.shouldRequireLogin === 'function') {
        return window.AndroidApp.shouldRequireLogin() === true;
      }
    } catch (e) {}
    return false;
  }

  /* پاک‌سازی اطلاعات ورود پیش از خروج کامل از اپ (دوبار زدن دکمه‌ی بازگشت) */
  function prepareAppExit() {
    clearStoredSession();
    try {
      if (window.AndroidApp && typeof window.AndroidApp.prepareExit === 'function') {
        window.AndroidApp.prepareExit();
      }
    } catch (e) {}
  }
  window.prepareAppExit = prepareAppExit;

  /* ─── بازیابی session پس از رفرش ──────────────────────────────── */
  function restoreSession() {
    /* در اپ اندروید: اگر این بالا آمدن تازه است، حساب بازیابی نمی‌شود */
    if (nativeRequiresLogin()) {
      clearStoredSession();
      try {
        if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
        if (typeof window.showScreen === 'function') window.showScreen('screen-login', { skipHistory: true });
      } catch (e) {}
      return false;
    }

    const phone = getCurrentPhone();
    if (!phone) return false;

    ensureProfileExists(phone);
    const profile = getProfileByPhone(phone);
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = phone;
      userProfile.phone = formatPhoneDisplaySafe(phone);
      userProfile.name = profile.name;
    }

    /* بارگذاری داده‌های این کاربر */
    loadUserData(phone);
    updateProfileUI();

    if (typeof showScreen === 'function') showScreen('screen-home');
    return true;
  }

  /* ─── فرم ویرایش پروفایل ────────────────────────────────────────── */
  function persistNameSilently() {
    const phone = getCurrentPhone();
    if (!phone) return;
    const nameInput = document.getElementById('editNameInput');
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    updateProfileByPhone(phone, { name });
    if (typeof userProfile === 'object' && userProfile) userProfile.name = name;
    updateProfileUI();
  }

  function saveProfile() {
    const phone = getCurrentPhone();
    if (!phone) {
      if (typeof showToast === 'function') showToast('برای ویرایش پروفایل ابتدا وارد شوید');
      return;
    }
    const nameInput = document.getElementById('editNameInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    const name = (nameInput?.value || '').trim();
    const address = (addressInput?.value || '').trim();
    const nid = (nidInput?.value || '').trim();
    if (!name) {
      if (typeof showToast === 'function') showToast('نام و نام خانوادگی را وارد کنید');
      return;
    }
    updateProfileByPhone(phone, { name, address, nid });
    if (typeof userProfile === 'object' && userProfile) userProfile.name = name;
    if (typeof syncUserProfileToBackend === 'function') {
      syncUserProfileToBackend(phone);
    }
    updateProfileUI();
    if (typeof showToast === 'function') showToast('تغییرات با موفقیت ذخیره شد');
    if (typeof showScreen === 'function') showScreen('screen-profile');
  }

  function fillEditProfileForm() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const nameInput  = document.getElementById('editNameInput');
    const phoneInput = document.getElementById('editPhoneInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    if (nameInput)  nameInput.value = profile.name || DEFAULT_NAME;
    if (addressInput) addressInput.value = profile.address || '';
    if (nidInput) nidInput.value = profile.nid || '';
    if (phoneInput) {
      phoneInput.value = phone ? formatPhoneDisplaySafe(phone) : '';
      phoneInput.setAttribute('readonly', 'readonly');
      phoneInput.setAttribute('disabled', 'disabled');
      phoneInput.style.opacity = '0.7';
      phoneInput.style.cursor  = 'not-allowed';
      phoneInput.title = 'شماره موبایل هویت حساب شماست و قابل تغییر نیست';
    }
    refreshAvatarActionButtons();
  }

  /* ─── آپلود / حذف عکس پروفایل ──────────────────────────────────── */
  function getOrCreateAvatarUploadInput() {
    let upload = document.getElementById('profileAvatarUpload');
    if (upload) return upload;
    upload = document.createElement('input');
    upload.type = 'file'; upload.accept = 'image/*';
    upload.id = 'profileAvatarUpload'; upload.style.display = 'none';
    document.body.appendChild(upload);

    upload.addEventListener('change', e => {
      const file = e.target.files[0];
      upload.value = '';
      if (!file) return;
      const phone = getCurrentPhone();
      if (!phone) { if (typeof showToast === 'function') showToast('برای تغییر عکس ابتدا وارد شوید'); return; }
      const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i.test(file.name || '');
      if (!isImage) { if (typeof showToast === 'function') showToast('لطفاً یک فایل تصویری انتخاب کنید'); return; }
      if (file.size > 8 * 1024 * 1024) { if (typeof showToast === 'function') showToast('حجم تصویر باید کمتر از ۸ مگابایت باشد'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        updateProfileByPhone(phone, { avatar: reader.result });
        updateProfileUI();
        if (typeof showToast === 'function') showToast('عکس پروفایل به‌روزرسانی شد');
      };
      reader.onerror = () => { if (typeof showToast === 'function') showToast('خطا در خواندن فایل تصویر'); };
      reader.readAsDataURL(file);
    });
    return upload;
  }

  function triggerAvatarUpload() {
    const phone = getCurrentPhone();
    if (!phone) { if (typeof showToast === 'function') showToast('برای تغییر عکس ابتدا وارد شوید'); return; }
    getOrCreateAvatarUploadInput().click();
  }

  function removeAvatarPhoto() {
    const phone = getCurrentPhone();
    if (!phone) { if (typeof showToast === 'function') showToast('برای حذف عکس ابتدا وارد شوید'); return; }
    const profile = getProfileByPhone(phone);
    if (!profile.avatar || !profile.avatar.startsWith('data:image')) return;
    updateProfileByPhone(phone, { avatar: DEFAULT_AVATAR });
    updateProfileUI();
    if (typeof showToast === 'function') showToast('عکس پروفایل حذف شد');
  }

  function refreshAvatarActionButtons() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const hasPhoto = !!(profile.avatar && profile.avatar.startsWith('data:image'));
    const removeBtn = document.getElementById('removeAvatarBtn');
    if (removeBtn) removeBtn.style.display = hasPhoto ? 'flex' : 'none';
  }

  function setupAvatarUpload() {
    getOrCreateAvatarUploadInput();
    document.querySelectorAll('.avatar').forEach(a => {
      a.style.cursor = 'pointer';
      a.onclick = () => triggerAvatarUpload();
    });
    refreshAvatarActionButtons();
  }

  /* ─── راه‌اندازی اولیه ──────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.steps-bar').forEach(x => x.style.direction = 'rtl');
    const nameInput = document.getElementById('editNameInput');
    nameInput?.addEventListener('input', persistNameSilently);
    setupAvatarUpload();
    updateProfileUI();
    restoreSession();
  });

  /* ─── export به window ──────────────────────────────────────────── */
  window.saveProfileData     = saveProfile;
  window.saveProfile         = saveProfile;
  window.loginWithPhone      = loginWithPhone;
  window.logoutCurrentUser   = logoutCurrentUser;
  window.fillEditProfileForm = fillEditProfileForm;
  window.updateProfileUI     = updateProfileUI;
  window.getCurrentPhone     = getCurrentPhone;
  window.triggerAvatarUpload = triggerAvatarUpload;
  window.removeAvatarPhoto   = removeAvatarPhoto;  window.toggleProfileActionsMenu = toggleProfileActionsMenu;
  window.toggleHomeProfileMenu = toggleHomeProfileMenu;
  window.updateHomeProfileMenu = updateHomeProfileMenu;  /* توابع ذخیره‌سازی داده — صدا زده می‌شوند از modules مربوطه */
  window.saveReports         = saveReports;
  window.savePayments        = savePayments;
  window.saveNotifications   = saveNotifications;
  window.saveFavorites       = saveFavorites;
  window.syncDataToBackend   = syncDataToBackend;
  window.syncFormDataToBackendWithProgress = syncFormDataToBackendWithProgress;
  window.syncJsonToBackendWithProgress    = syncJsonToBackendWithProgress;
  window.uploadReportMediaChunked         = uploadReportMediaChunked;
  window.eplakReadFileAsDataUrl           = readFileAsDataUrl;
  window.eplakMediaStatus                 = reportMediaStatus;
  window.eplakQueuePendingMedia           = queuePendingMedia;
  window.eplakFlushPendingMedia           = flushPendingMedia;
  window.eplakFlushPendingMediaRef        = flushPendingMediaRef;
  window.eplakPendingMediaRefState        = pendingMediaRefState;
  window.eplakCountPendingMedia           = countPendingMedia;
  window.eplakTransportMessage            = transportMessage;
  window.eplakIsTransportFailure          = isTransportFailure;
  window.eplakJsonContentType             = function () { return JSON_CONTENT_TYPE; };
  window.eplakMediaChunkSize              = mediaChunkSize;
  window.syncUserProfileToBackend = syncUserProfileToBackend;

})();

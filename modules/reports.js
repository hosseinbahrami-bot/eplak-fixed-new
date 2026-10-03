/* modules/reports.js — ثبت گزارش جدید، لیست گزارش‌ها و پیگیری درخواست */
/* استخراج‌شده عیناً از فایل اصلی app_01.html با پشتیبانی آفلاین و داده‌های توکار شهرداری */

  const DEFAULT_DEPARTMENTS = [
    {
      id: 1,
      name: 'حوزه شهردار',
      children: [
        { id: 2, name: 'دفتر شهردار ورامین' },
        { id: 3, name: 'روابط عمومی و امور بین‌الملل' },
        { id: 4, name: 'بازرسی و ارزیابی عملکرد' },
        { id: 5, name: 'حراست شهرداری' },
        { id: 6, name: 'امور حقوقی' },
        { id: 7, name: 'شورای مشاوران' }
      ]
    },
    {
      id: 8,
      name: 'معاونت اداری و مالی',
      children: [
        { id: 9, name: 'منابع انسانی' },
        { id: 10, name: 'امور اداری' },
        { id: 11, name: 'امور مالی و حسابداری' },
        { id: 12, name: 'بودجه و برنامه‌ریزی' },
        { id: 13, name: 'تدارکات و پشتیبانی' },
        { id: 14, name: 'فناوری اطلاعات (IT)' }
      ]
    },
    {
      id: 15,
      name: 'معاونت فنی و عمرانی',
      children: [
        { id: 16, name: 'طراحی و اجرای پروژه‌های عمرانی' },
        { id: 17, name: 'ساخت و نگهداری معابر' },
        { id: 18, name: 'پل‌ها و تونل‌ها' },
        { id: 19, name: 'ساختمان‌های عمومی' },
        { id: 20, name: 'تأسیسات شهری' }
      ]
    },
    {
      id: 21,
      name: 'معاونت شهرسازی و معماری',
      children: [
        { id: 22, name: 'صدور پروانه ساختمانی' },
        { id: 23, name: 'پایان کار ساختمان' },
        { id: 24, name: 'کنترل و نظارت ساختمانی' },
        { id: 25, name: 'طرح‌های توسعه شهری' },
        { id: 26, name: 'کمیسیون‌های شهرسازی' }
      ]
    },
    {
      id: 27,
      name: 'معاونت خدمات شهری',
      children: [
        { id: 28, name: 'نظافت شهری' },
        { id: 29, name: 'مدیریت پسماند' },
        { id: 30, name: 'فضای سبز' },
        { id: 31, name: 'زیباسازی شهر' },
        { id: 32, name: 'آرامستان‌ها' },
        { id: 33, name: 'کنترل حیوانات شهری' }
      ]
    },
    {
      id: 34,
      name: 'معاونت حمل‌ونقل و ترافیک',
      children: [
        { id: 35, name: 'مدیریت ترافیک' },
        { id: 36, name: 'پارکینگ‌ها' },
        { id: 37, name: 'حمل‌ونقل عمومی' },
        { id: 38, name: 'پایانه‌ها' },
        { id: 39, name: 'ایمنی و علائم راهنمایی' }
      ]
    },
    {
      id: 40,
      name: 'معاونت فرهنگی و اجتماعی',
      children: [
        { id: 41, name: 'فرهنگسراها' },
        { id: 42, name: 'کتابخانه‌ها' },
        { id: 43, name: 'امور جوانان' },
        { id: 44, name: 'امور بانوان' },
        { id: 45, name: 'مشارکت‌های مردمی' },
        { id: 46, name: 'ورزش همگانی' }
      ]
    },
    {
      id: 47,
      name: 'معاونت برنامه‌ریزی و توسعه',
      children: [
        { id: 48, name: 'آمار و اطلاعات' },
        { id: 49, name: 'پژوهش و نوآوری' },
        { id: 50, name: 'مدیریت پروژه' },
        { id: 51, name: 'هوشمندسازی شهر' }
      ]
    },
    {
      id: 52,
      name: 'سازمان‌ها و شرکت‌های وابسته',
      children: [
        { id: 53, name: 'سازمان مدیریت پسماند' },
        { id: 54, name: 'سازمان آتش‌نشانی و خدمات ایمنی' },
        { id: 55, name: 'سازمان پارک‌ها و فضای سبز' },
        { id: 56, name: 'سازمان زیباسازی' },
        { id: 57, name: 'سازمان حمل‌ونقل بار و مسافر' },
        { id: 58, name: 'سازمان میادین و بازارها' },
        { id: 59, name: 'سازمان آرامستان‌ها' },
        { id: 60, name: 'سازمان فناوری اطلاعات و ارتباطات' },
        { id: 61, name: 'سازمان فرهنگی، اجتماعی و ورزشی' },
        { id: 62, name: 'سازمان سرمایه‌گذاری و مشارکت‌های مردمی' },
        { id: 63, name: 'شرکت بهره‌برداری مترو' },
        { id: 64, name: 'شرکت واحد اتوبوسرانی' },
        { id: 65, name: 'شرکت نوسازی و بهسازی شهری' }
      ]
    }
  ];

  /* =========================================================
     New Report — multi-step form
  ========================================================= */
  function startNewReport() {
    resetReportDraft();
    loadDepartmentsFromBackend();
    showScreen('screen-report');
  }

  function renderDepartments(list) {
    const wrap = document.getElementById('deptListWrap');
    if (!wrap) return;
    const items = (Array.isArray(list) && list.length) ? list : DEFAULT_DEPARTMENTS;
    const safeEscape = (typeof escapeHtml === 'function')
      ? escapeHtml
      : (str => String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const translateText = text => (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(text) : text;

    wrap.innerHTML = items.map((parent, parentIndex) => {
      const pName = translateText(parent.name);
      return `
      <div class="dept-item">
        <div class="dept-header" onclick="toggleDept(this)">
          <span class="dept-title">${parentIndex + 1}. ${safeEscape(pName)}</span>
          <span class="dept-arrow">⌄</span>
        </div>
        <div class="dept-sub-list">
          ${(parent.children || []).map(child => {
            const cName = translateText(child.name);
            return `
            <div class="dept-sub-item" onclick="selectDepartment(this, '${safeEscape(parent.name).replace(/'/g, "\\'")}')">${safeEscape(cName)}</div>
          `;
          }).join('')}
        </div>
      </div>
    `;
    }).join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDepartmentsFromBackend);
  } else {
    loadDepartmentsFromBackend();
  }

  async function loadDepartmentsFromBackend() {
    const wrap = document.getElementById('deptListWrap');
    if (!wrap) return;

    // If wrap is empty or currently contains an error/loading message, immediately render default departments
    if (!wrap.children || !wrap.children.length || !wrap.querySelector || wrap.querySelector('.dept-item') === null) {
      renderDepartments(DEFAULT_DEPARTMENTS);
    }

    try {
      const response = await fetch(`${apiBase()}/departments.php`);
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      const list = Array.isArray(data?.departments) ? data.departments : [];

      if (list.length) {
        renderDepartments(list);
      }
    } catch (error) {
      console.warn('[departments] Backend sync note (using built-in municipal directory):', error.message || error);
      if (!wrap.children || !wrap.children.length || !wrap.querySelector || wrap.querySelector('.dept-item') === null) {
        renderDepartments(DEFAULT_DEPARTMENTS);
      }
    }
  }

  window.DEFAULT_DEPARTMENTS = DEFAULT_DEPARTMENTS;
  window.renderDepartments = renderDepartments;

  function formatReportDate(dateValue) {
    if (!dateValue) return '—';
    let date = new Date(dateValue);
    if (Number.isNaN(date.getTime()) && typeof dateValue === 'string') {
      date = new Date(dateValue.replace(' ', 'T'));
    }
    if (Number.isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function formatReportDateTime(dateValue) {
    if (!dateValue) {
      const now = new Date();
      const d = now.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const t = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${d} - ساعت ${t}`;
    }
    if (typeof dateValue === 'string') {
      if (dateValue.includes('ساعت') || / \d{1,2}:\d{2}/.test(dateValue)) {
        return dateValue;
      }
    }
    let date = new Date(dateValue);
    if (Number.isNaN(date.getTime()) && typeof dateValue === 'string') {
      date = new Date(dateValue.replace(' ', 'T'));
    }
    if (Number.isNaN(date.getTime())) {
      return String(dateValue);
    }
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    if (isEn) {
      const d = date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${d} ${t}`;
    }
    const d = date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const t = date.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${d} - ساعت ${t}`;
  }
  window.formatReportDate = formatReportDate;
  window.formatReportDateTime = formatReportDateTime;

  /* ── هماهنگی حذف با همگام‌سازی سرور ──────────────────────────────
     شناسه‌ی گزارش‌هایی که کاربر حذف کرده ولی حذف آن‌ها هنوز در سرور
     قطعی نشده، این‌جا نگه داشته می‌شود تا همگام‌سازی پس‌زمینه (که هر
     چند ثانیه یک‌بار کل لیست را از سرور می‌گیرد) آن‌ها را دوباره
     به لیست برنگرداند. */
  const pendingDeleteIds = new Set();
  const PENDING_DELETE_KEY = 'eplak_pending_report_deletes';

  /* ── درخواست‌هایی که «همین حالا» عکس/فیلمشان در حال ارسال است ───────────
     ریشه‌ی «عکس رسید ولی فیلم نه»: همگام‌سازی دوره‌ای لیست گزارش‌ها (هر ۴۵
     ثانیه، با باز کردن «گزارش‌های من» و با برگشتن اپ از پس‌زمینه) گزارش‌های
     «در انتظار» را می‌ساخت؛ و چون فیلم در حال ارسال هنوز در «صف خطا» نبود،
     فرض می‌کرد پیوستی باقی نمانده → گزارش را همان لحظه با «فقط عکس» روی سرور
     می‌ساخت و کد پیگیری هم صادر می‌شد، درحالی‌که فیلم هنوز در راه بود. اگر
     اپ در همان دقایق به پس‌زمینه می‌رفت یا بسته می‌شد، فیلم هرگز به گزارش
     نمی‌چسبید. تا وقتی ارسالِ فایل‌های یک درخواست در جریان است، آن درخواست
     نباید ساخته (یا دوباره ارسال) شود. */
  const uploadsInFlight = new Set();
  let reportsSyncInFlight = null;

  function loadPendingDeletes() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(PENDING_DELETE_KEY) : null;
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) arr.forEach(id => pendingDeleteIds.add(String(id)));
    } catch (e) { /* ignore */ }
  }
  function savePendingDeletes() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(Array.from(pendingDeleteIds)));
      }
    } catch (e) { /* ignore */ }
  }
  loadPendingDeletes();

  /* شناسه‌ی سروری یک گزارش (عدد) — یا null اگر گزارش فقط محلی است */
  /* کد پیگیری — تا وقتی عکس/فیلم در حال بارگذاری است، به‌جای کد، وضعیت
     بارگذاری نشان داده می‌شود تا کاربر کد ناقص/موقت نبیند. */
  function reportCodeLabel(r) {
    if (r && r.code) return String(r.code);
    if (r && (r.pendingSync || r.uploadState === 'uploading' || r.uploadState === 'creating')) {
      return 'در حال بارگذاری عکس/فیلم…';
    }
    return '—';
  }

  function getReportBackendId(r) {
    if (!r) return null;
    const candidates = [r.backendId, r.id];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isInteger(n) && n > 0) return n;
    }
    return null;
  }

  async function requestBackendDelete(backendId, phone) {
    const response = await fetch(`${apiBase()}/reports.php?action=delete&id=${encodeURIComponent(backendId)}&phone=${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: backendId, phone })
    });
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    // 404 یعنی از قبل در سرور وجود ندارد — نتیجه‌ی مطلوب همان است
    if (response.status === 404) return true;
    if (!response.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `delete failed (${response.status})`);
    }
    return true;
  }

  /* تلاش مجدد برای حذف‌هایی که قبلاً ناتمام مانده‌اند (مثلاً قطع اینترنت) */
  async function flushPendingDeletes(phone) {
    if (!phone || !pendingDeleteIds.size) return;
    for (const id of Array.from(pendingDeleteIds)) {
      try {
        await requestBackendDelete(id, phone);
        pendingDeleteIds.delete(id);
      } catch (e) { /* دفعه‌ی بعد دوباره تلاش می‌شود */ }
    }
    savePendingDeletes();
  }

  /* گزارش‌هایی که هنگام قطع اینترنت ثبت شده‌اند (pendingSync) را دوباره به
     سرور می‌فرستد تا واقعاً به دست شهرداری برسند. */
  async function flushPendingCreates(phone) {
    if (!phone) return;
    const pending = reports.filter(r => r && r.pendingSync === true && getReportBackendId(r) === null);
    for (const r of pending) {
      /* فایل‌های این درخواست همین حالا در حال ارسال‌اند → صبر؛ نه ساخت، نه ارسال دوباره */
      if (r.clientRef && uploadsInFlight.has(String(r.clientRef))) continue;
      /* ۱) فایل‌های صف‌شده‌ی همین درخواست (بر اساس شناسه‌ی یکتا) بارگذاری شوند */
      if (r.clientRef && typeof window.eplakFlushPendingMediaRef === 'function') {
        let ready = false;
        try {
          ready = await window.eplakFlushPendingMediaRef(r.clientRef, phone, 0, uploadHooksForRef(r.clientRef));
        } catch (e) {
          ready = false;
        }
        if (!ready) {
          continue;   /* هنوز فایل‌ها نرسیده‌اند؛ گزارش ساخته نمی‌شود (کد هم صادر نمی‌شود) */
        }
      }
      /* ۲) فقط حالا گزارش ساخته و کد پیگیری صادر می‌شود */
      try {
        await finalizePendingReport(r, phone, { silent: true });
      } catch (e) { /* دفعه‌ی بعد */ }
    }
    if (pending.length && typeof saveReports === 'function') saveReports(phone);
  }

  async function loadReportsFromBackend(phone = getCurrentPhone(), options = {}) {
    const { silent = false } = options;
    if (!phone) {
      reports.length = 0;
      return [];
    }

    // اگر یک همگام‌سازی در جریان است، همان را برگردان (جلوگیری از درخواست‌های موازی)
    if (reportsSyncInFlight) return reportsSyncInFlight;

    reportsSyncInFlight = (async () => {
    try {
      await flushPendingDeletes(phone);
      await flushPendingCreates(phone);

      const response = await fetch(`${apiBase()}/reports.php?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('reports fetch failed');
      const data = await response.json();
      const rows = (Array.isArray(data?.reports) ? data.reports : [])
        .filter(item => !pendingDeleteIds.has(String(item.id)));
      const mapped = rows.map(item => ({
        id: String(item.id),
        backendId: item.id,
        code: item.code || `EP-1403-${String(Number(item.id) + 1000).padStart(4, '0')}`,
        title: item.title || 'گزارش جدید',
        location: item.location || 'نامشخص',
        rawDate: item.created_at,
        date: formatReportDate(item.created_at),
        dateTime: formatReportDateTime(item.created_at),
        status: normalizeStatusValue(item.status || 'pending'),
        icon: 'report',
        iconBg: 'rgba(0,201,167,0.12)',
        desc: item.description || item.details || '',
        department: item.department || '',
        subDepartment: item.sub_department || '',
        reply: item.reply || '',
        /* عکس/فیلم‌های ذخیره‌شده روی سرور (از جدول report_media) */
        media: Array.isArray(item.media) ? item.media.map(m => ({
          id: m.id,
          kind: m.kind,
          url: mediaUrlOf(m.url || m.path),
          name: m.name,
          size: m.size
        })) : [],
        clientRef: String(item.client_ref || ''),
        timeline: Array.isArray(item.timeline) ? item.timeline : [],
        timelineCount: Number(item.timeline_count || (Array.isArray(item.timeline) ? item.timeline.length : 0)) || 0,
        /* روند رسیدگی چهارمرحله‌ای که سرور (با همان تابع پنل ادمین) می‌فرستد */
        flow: Array.isArray(item.flow) && item.flow.length === 4 ? item.flow : null
      }));

      /* گزارش‌های محلی که هنوز به سرور نرسیده‌اند (بدون شناسه‌ی سروری) را
         نگه می‌داریم تا با هر همگام‌سازی از لیست کاربر ناپدید نشوند.
         اگر نسخه‌ی سروری همان گزارش رسیده باشد (عنوان/توضیح یکسان)، نسخه‌ی
         محلی کنار گذاشته می‌شود تا تکراری دیده نشود. */
      /* ── حذف تکرارِ «یک درخواست» ──────────────────────────────────────
         هر درخواست یک شناسه‌ی یکتا دارد؛ اگر سرور (از تلاش‌های پیشین) دو رکورد
         با همان شناسه برگرداند، فقط یکی — آن که پیوست بیشتری دارد — نمایش
         داده می‌شود. رکورد محلیِ همان درخواست هم نشان داده نمی‌شود تا کاربر
         به‌جای دو کد پیگیری، فقط یک کد ببیند. */
      const byRef = new Map();
      const uniqueRows = [];
      mapped.forEach(item => {
        const ref = String(item.clientRef || '');
        if (ref && byRef.has(ref)) {
          const prev = byRef.get(ref);
          const prevMedia = Array.isArray(prev.media) ? prev.media.length : 0;
          const thisMedia = Array.isArray(item.media) ? item.media.length : 0;
          if (thisMedia > prevMedia) {
            const at = uniqueRows.indexOf(prev);
            if (at > -1) uniqueRows[at] = item;
            byRef.set(ref, item);
          }
          return;
        }
        if (ref) byRef.set(ref, item);
        uniqueRows.push(item);
      });

      const serverRefs = new Set(byRef.keys());
      const sameAsServer = (r) => uniqueRows.some(m =>
        m.title === r.title && (m.desc || '') === (r.desc || '') && (m.location || 'نامشخص') === (r.location || 'نامشخص'));
      const localOnly = reports.filter(r => {
        const ref = String(r.clientRef || '');
        if (ref && serverRefs.has(ref)) return false;   // نسخه‌ی سروری همین درخواست موجود است
        const bid = getReportBackendId(r);
        if (bid !== null) return false;                 // شناسه‌ی سروری دارد؛ رکورد سرور مرجع است
        return !sameAsServer(r);
      });

      reports.length = 0;
      uniqueRows.forEach(item => reports.push(item));
      localOnly.forEach(item => reports.unshift(item));
      if (typeof saveReports === 'function') saveReports(phone);
      return reports;
    } catch (error) {
      if (!silent) {
        console.warn('[reports] backend sync failed', error);
      }
      return reports;
    } finally {
      reportsSyncInFlight = null;
    }
    })();
    return reportsSyncInFlight;
  }

  window.loadReportsFromBackend = loadReportsFromBackend;

  /* پاک کردن تصاویر پیش‌نویس و آزادکردن حافظه‌ی پیش‌نمایش‌ها */
  function clearReportPhotos() {
    (reportDraft.photos || []).forEach(entry => {
      if (entry && entry.previewUrl) {
        try { URL.revokeObjectURL(entry.previewUrl); } catch (e) {}
      }
    });
    reportDraft.photos = [];
  }

  function resetReportDraft() {
    reportDraft = { type: 'سایر', department: '', subDepartment: '', desc: '', location: '', photos: [], geo: null };
    const desc = document.getElementById('reportDescInput');
    if (desc) { desc.value = ''; updateCount(desc); }
    document.querySelectorAll('#deptListWrap .dept-sub-item').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#deptListWrap .dept-item').forEach(it => it.classList.remove('open'));
    const deptBox = document.getElementById('deptSelectedBox');
    if (deptBox) deptBox.style.display = 'none';
    const loc = document.getElementById('reportLocationInput');
    if (loc) loc.value = '';
    const photoPrev = document.getElementById('reportPhotosPreview');
    if (photoPrev) photoPrev.innerHTML = '';
    const coords = document.getElementById('reportCoordsText');
    if (coords) coords.textContent = 'موقعیتی انتخاب نشده است';
  }

  function toggleDept(headerEl) {
    const item = headerEl.closest('.dept-item');
    if (!item) return;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('#deptListWrap .dept-item.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  }

  function selectDepartment(el, mainLabel) {
    document.querySelectorAll('#deptListWrap .dept-sub-item').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const subLabel = el.textContent.trim();
    reportDraft.department = mainLabel;
    reportDraft.subDepartment = subLabel;
    const box = document.getElementById('deptSelectedBox');
    const text = document.getElementById('deptSelectedText');
    if (box && text) {
      text.textContent = mainLabel + ' / ' + subLabel;
      box.style.display = 'flex';
    }
    document.querySelectorAll('#deptListWrap .dept-item.open').forEach(it => it.classList.remove('open'));
  }

  function updateCount(el) {
    if (!el) return;
    const count = (el.value || '').length;
    if (el.nextElementSibling) {
      el.nextElementSibling.textContent = count + '/300';
    }
  }

  function goReportStep2() {
    const descEl = document.getElementById('reportDescInput');
    reportDraft.desc = descEl.value.trim();
    if (!reportDraft.subDepartment) {
      showToast('لطفاً واحد مربوطه را انتخاب کنید');
      return;
    }
    if (!reportDraft.desc) {
      showToast('لطفاً توضیحات مشکل را وارد کنید');
      return;
    }
    showScreen('screen-report-step2');
  }

  /* =========================================================
     موقعیت مکانی: GPS گوشی + نمایش روی نقشه
     ---------------------------------------------------------
     - نشانگر نقشه همیشه در مرکز است؛ کاربر با کشیدن نقشه آن را روی محل
       دقیق مشکل می‌گذارد (lat/lng در reportDraft.geo نگه داشته می‌شود).
     - دکمه‌ی «استفاده از موقعیت فعلی من» با GPS خود گوشی موقعیت را می‌گیرد
       (در اپ اندروید، اجازه‌ی دسترسی از پل AndroidApp گرفته می‌شود).
     - آدرس خیابان (اختیاری) از سرویس آزاد OpenStreetMap گرفته می‌شود؛ اگر
       اینترنت/سرویس پاسخ ندهد، همان مختصات ثبت می‌شود.
  ========================================================= */
  let reportMap = null;
  let reportGeoTimer = null;
  let pendingGpsRequest = false;

  function coordsText() {
    const geo = reportDraft.geo || {};
    const out = document.getElementById('reportCoordsText');
    if (!out) return;
    if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
      out.textContent = 'موقعیتی انتخاب نشده است';
      return;
    }
    const base = (window.EplakMap && window.EplakMap.formatPosition)
      ? window.EplakMap.formatPosition(geo.lat, geo.lng, geo.accuracy)
      : (geo.lat.toFixed(6) + ' , ' + geo.lng.toFixed(6));
    out.textContent = base;
  }

  /* ── گرفتن آدرس دقیق از مختصات ────────────────────────────────────────
     دو مسیر داریم و هر دو استفاده می‌شوند:
       ۱) در اپ اندروید: سرویس آدرس‌یاب خودِ گوشی (Geocoder) از طریق پل
          AndroidApp.getAddress → نتیجه با window.eplakAddressResult برمی‌گردد.
          این مسیر «آدرس نوشتاری» را دقیق‌تر و فارسی می‌دهد و به سرویس
          بیرونی وابسته نیست.
       ۲) در وب (و اگر پل اندروید پاسخ نداد): سرویس آزاد OpenStreetMap.
     نتیجه در کادر «یا آدرس را وارد کنید» نوشته می‌شود و همراه گزارش به
     سرور می‌رود؛ پنل ادمین هم همان آدرس را نشان می‌دهد. */
  let pendingAddressRequest = null;    /* درخواست در انتظار پاسخ پل اندروید */
  let addressBridgeTimer = null;

  function addressInputEl() {
    return document.getElementById('reportLocationInput');
  }

  /* نوشتن آدرسی که از هر مسیری رسیده باشد (پل اندروید یا OpenStreetMap) */
  function applyResolvedAddress(lat, lng, address, force) {
    const clean = String(address || '').trim();
    const locEl = addressInputEl();
    if (locEl) {
      locEl.removeAttribute('placeholder');
      locEl.setAttribute('placeholder', 'مثلاً: خیابان امام خمینی، کوچه ۵');
    }
    if (!clean) {
      /* اگر آدرس متنی پیدا نشد، دستِ‌کم مختصات دقیق در کادر باشد تا کاربر
         بداند موقعیت ثبت شده است (و همان را در صورت نیاز ویرایش کند). */
      return;
    }
    if (!locEl) return;
    /* اگر کاربر خودش آدرسی نوشته، آن را با نتیجه‌ی جست‌وجو بازنویسی نمی‌کنیم
       (مگر در حالت «موقعیت فعلی من» که force=true است). */
    if (!force && locEl.value.trim() !== '') return;
    locEl.value = clean;
    reportDraft.location = clean;
    locEl.classList.add('address-filled');
    setTimeout(function () { locEl.classList.remove('address-filled'); }, 1200);
  }

  /* مسیر ۲: سرویس آزاد آدرس‌یاب (OpenStreetMap) با مهلت ۶ ثانیه */
  function lookupAddressWeb(lat, lng, force) {
    if (!window.EplakMap || typeof window.EplakMap.reverseGeocode !== 'function') return;
    window.EplakMap.reverseGeocode(lat, lng).then(function (address) {
      applyResolvedAddress(lat, lng, address, force);
    }).catch(function () {});
  }

  /* مسیر اصلی: اول پل اندروید (آدرس‌یاب گوشی)، بعد سرویس وب */
  function lookupAddress(lat, lng, force) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const locEl = addressInputEl();
    if (locEl && !locEl.value.trim()) {
      locEl.setAttribute('placeholder', 'در حال گرفتن آدرس دقیق…');
    }
    clearTimeout(reportGeoTimer);
    reportGeoTimer = setTimeout(function () {
      const hasBridge = !!(window.AndroidApp && typeof window.AndroidApp.getAddress === 'function');
      if (!hasBridge) {
        lookupAddressWeb(lat, lng, force);
        return;
      }
      pendingAddressRequest = { lat: lat, lng: lng, force: !!force, done: false };
      try {
        window.AndroidApp.getAddress(lat, lng);
      } catch (e) {
        pendingAddressRequest = null;
        lookupAddressWeb(lat, lng, force);
        return;
      }
      /* اگر آدرس‌یاب گوشی در ۶ ثانیه پاسخ نداد (اینترنت/سرویس نداشت) به
         سرویس وب برمی‌گردیم تا کادر آدرس خالی نماند. */
      clearTimeout(addressBridgeTimer);
      addressBridgeTimer = setTimeout(function () {
        if (pendingAddressRequest && !pendingAddressRequest.done) {
          const req = pendingAddressRequest;
          pendingAddressRequest = null;
          lookupAddressWeb(req.lat, req.lng, req.force);
        }
      }, 6000);
    }, 350);
  }

  /* پاسخ آدرس‌یاب اندروید (از MainActivity → Geocoder) */
  window.eplakAddressResult = function (lat, lng, address) {
    const text = String(address || '').trim();
    const req = pendingAddressRequest;
    if (req) req.done = true;
    clearTimeout(addressBridgeTimer);
    if (!text) {
      /* گوشی آدرسی پیدا نکرد؛ سرویس وب را امتحان می‌کنیم */
      const target = req || { lat: Number(lat), lng: Number(lng), force: false };
      pendingAddressRequest = null;
      lookupAddressWeb(target.lat, target.lng, target.force);
      return;
    }
    const force = req ? !!req.force : false;
    pendingAddressRequest = null;
    applyResolvedAddress(Number(lat), Number(lng), text, force);
  };

  /* ساخت نقشه فقط وقتی صفحه‌ی «موقعیت» دیده می‌شود (برای صرفه‌جویی در اینترنت) */
  function initReportMap(force) {
    if (reportMap && !force) return reportMap;
    const box = document.getElementById('reportMapPicker');
    if (!box || !window.EplakMap) return null;
    if (box.offsetHeight === 0 && !force) return null;   /* صفحه هنوز دیده نمی‌شود */

    const geo = reportDraft.geo || {};
    const hasFix = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    reportMap = window.EplakMap.create(box, {
      lat: hasFix ? geo.lat : 35.3242,
      lng: hasFix ? geo.lng : 51.6455,
      zoom: hasFix ? 17 : 14,
      draggable: true,
      hasFix: hasFix,
      onChange: function (pos) {
        if (!pos.hasFix) return;
        reportDraft.geo = { lat: pos.lat, lng: pos.lng, accuracy: (reportDraft.geo || {}).accuracy, source: 'map' };
        coordsText();
        lookupAddress(pos.lat, pos.lng, false);
      }
    });
    coordsText();
    return reportMap;
  }
  window.initReportMap = initReportMap;

  /* نمایش مختصات انتخاب‌شده در نقشه‌ی کامل (برای بازبینی/ارسال به دیگران) */
  function openReportCoordsInMap() {
    const geo = reportDraft.geo || {};
    if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
      showToast('اول موقعیت را انتخاب کنید');
      return;
    }
    const url = 'https://www.openstreetmap.org/?mlat=' + geo.lat.toFixed(6)
      + '&mlon=' + geo.lng.toFixed(6) + '#map=17/' + geo.lat.toFixed(6) + '/' + geo.lng.toFixed(6);
    try {
      if (window.AndroidApp && typeof window.AndroidApp.openUrl === 'function') {
        /* در اپ اندروید: لینک «geo:» → خودِ اندروید فهرست برنامه‌های نقشه‌ی
           نصب‌شده (نشان، بلد، گوگل‌مپ، …) را نشان می‌دهد و کاربر هرکدام را
           که دوست دارد انتخاب می‌کند؛ به سایت OpenStreetMap نیازی نیست. */
        const pin = geo.lat.toFixed(6) + ',' + geo.lng.toFixed(6);
        window.AndroidApp.openUrl('geo:' + pin + '?q=' + pin + '(' + encodeURIComponent('محل گزارش') + ')');
        return;
      }
    } catch (e) {}
    window.open(url, '_blank', 'noopener');
  }
  window.openReportCoordsInMap = openReportCoordsInMap;

  /* پیام‌های دقیق و راهنمای رفع مشکل برای هر نوع خطای موقعیت */
  function geoErrorText(err) {
    const code = err && typeof err.code === 'number' ? err.code : 0;
    if (code === 1) {   /* PERMISSION_DENIED */
      return 'دسترسی به موقعیت بسته است. برای فعال‌سازی: تنظیمات گوشی → برنامه‌ها → ای‌پلاک → مجوزها → موقعیت مکانی → «فقط هنگام استفاده از برنامه»';
    }
    if (code === 2) {
      return 'موقعیت قابل تشخیص نیست. کمی صبر کنید یا در فضای باز دوباره تلاش کنید';
    }
    if (code === 3) {
      return 'زمان گرفتن موقعیت تمام شد؛ دوباره تلاش کنید';
    }
    return 'موقعیت دریافت نشد؛ مختصات را با کشیدن نقشه انتخاب کنید';
  }

  function setGpsButtonBusy(busy) {
    const btn = document.getElementById('reportGpsBtn');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.style.opacity = busy ? '0.65' : '1';
    const label = btn.querySelector('span');
    if (label) label.textContent = busy ? 'در حال دریافت موقعیت…' : 'استفاده از موقعیت فعلی من';
  }

  function applyGeoFix(lat, lng, accuracy) {
    reportDraft.geo = { lat: lat, lng: lng, accuracy: accuracy, source: 'gps' };
    const map = initReportMap(true);
    if (map) map.setPosition(lat, lng);
    if (map) map.setZoom(17);
    coordsText();
    lookupAddress(lat, lng, true);
    showToast('موقعیت شما روی نقشه مشخص شد ✅');
  }

  /* نتیجه‌ی اجازه‌ی دسترسی موقعیت از سمت اندروید */
  window.eplakLocationPermissionResult = function (granted) {
    setGpsButtonBusy(false);
    if (granted && pendingGpsRequest) {
      pendingGpsRequest = false;
      useCurrentLocation();
      return;
    }
    pendingGpsRequest = false;
    if (!granted) {
      showToast('اجازه‌ی موقعیت داده نشد؛ می‌توانید محل را با کشیدن نقشه انتخاب کنید');
    }
  };

  function useCurrentLocation() {
    /* در اپ اندروید ابتدا اجازه‌ی دسترسی به موقعیت گرفته می‌شود */
    try {
      if (window.AndroidApp && typeof window.AndroidApp.hasLocationPermission === 'function'
          && !window.AndroidApp.hasLocationPermission()) {
        pendingGpsRequest = true;
        setGpsButtonBusy(true);
        if (typeof window.AndroidApp.requestLocationPermission === 'function') {
          window.AndroidApp.requestLocationPermission();
          showToast('برای ثبت دقیق محل، اجازه‌ی «موقعیت مکانی» را بدهید');
          return;
        }
      }
    } catch (e) {}

    if (!navigator.geolocation) {
      showToast('این گوشی از موقعیت‌یابی پشتیبانی نمی‌کند؛ محل را روی نقشه انتخاب کنید');
      initReportMap(true);
      return;
    }

    setGpsButtonBusy(true);
    showToast('در حال دریافت موقعیت دقیق…');

    navigator.geolocation.getCurrentPosition(
      function (position) {
        setGpsButtonBusy(false);
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        if (isNaN(lat) || isNaN(lng)) {
          showToast('موقعیت دریافتی نامعتبر بود؛ دوباره تلاش کنید');
          return;
        }
        applyGeoFix(lat, lng, Number(position.coords.accuracy) || 0);
      },
      function (err) {
        setGpsButtonBusy(false);
        /* اگر GPS گوشی خاموش باشد، راهنمای روشن کردنش را نشان می‌دهیم
           (تشخیص از روی پل اندروید؛ در مرورگر این تابع وجود ندارد). */
        let gpsOff = false;
        try {
          if (window.AndroidApp && typeof window.AndroidApp.isLocationServiceEnabled === 'function') {
            gpsOff = !window.AndroidApp.isLocationServiceEnabled();
          }
        } catch (e) {}
        if (gpsOff && (!err || err.code !== 1)) {
          showToast('سرویس موقعیت (GPS) گوشی خاموش است؛ آن را روشن کنید یا محل را با کشیدن نقشه انتخاب کنید');
        } else {
          showToast(geoErrorText(err));
        }
        initReportMap(true);
        /* اگر کاربر قبلاً «دسترسی به موقعیت» گرفتن با گوشی را فعال کرده،
           در اپ اندروید دکمه‌ی میان‌بر تنظیمات را نشان می‌دهیم. */
        try {
          if (err && err.code === 1 && window.AndroidApp && typeof window.AndroidApp.openAppSettings === 'function') {
            pendingGpsRequest = false;
          }
        } catch (e) {}
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function goReportStep3() {
    const locEl = document.getElementById('reportLocationInput');
    reportDraft.location = (locEl ? locEl.value : '').trim();
    const geo = reportDraft.geo || {};
    const hasCoords = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    /* اگر مختصات GPS/نقشه داریم، نوشتن آدرس اجباری نیست */
    if (!reportDraft.location && hasCoords) {
      reportDraft.location = (window.EplakMap && window.EplakMap.formatPosition)
        ? window.EplakMap.formatPosition(geo.lat, geo.lng, 0).replace('عرض ', 'موقعیت: ')
        : ('موقعیت ' + geo.lat.toFixed(5) + ' , ' + geo.lng.toFixed(5));
    }
    if (!reportDraft.location) {
      showToast('لطفاً موقعیت مکانی را مشخص کنید (GPS یا کشیدن نقشه)');
      return;
    }
    showScreen('screen-report-step3');
  }

  /* آدرس پایه‌ی API — فقط از منبع واحد (core/storage.js) خوانده می‌شود */
  function apiBase() {
    if (typeof window.eplakApiBase === 'function') {
      return window.eplakApiBase();
    }
    return String(window.EPLAK_API_BASE_URL || 'api').replace(/\/+$/, '');
  }

  /* آدرس پیوست‌ها: در اپ اندروید (file://) باید به دامنه‌ی سرور وصل شود */
  function mediaUrlOf(path) {
    return (typeof window.eplakResolveMediaUrl === 'function')
      ? window.eplakResolveMediaUrl(path)
      : String(path || '');
  }

  /* حداکثر حجم مجاز برای هر فایل — هم‌راستا با محدودیت سرور (shared/media.php) */
  const REPORT_MEDIA_MAX_IMAGE_MB = 12;
  const REPORT_MEDIA_MAX_VIDEO_MB = 60;

  /* تشخیص عکس/فیلم — در برخی گوشی‌ها file.type خالی است، پس پسوند هم بررسی می‌شود */
  function detectMediaKind(file) {
    const type = (file.type || '').toLowerCase();
    if (type.indexOf('video/') === 0) return 'video';
    if (type.indexOf('image/') === 0) return 'image';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'mov', 'webm', '3gp', 'mkv', 'avi', 'mpg'].indexOf(ext) > -1) return 'video';
    return 'image';
  }

  /* افزودن عکس/فیلم انتخاب‌شده به پیش‌نویس — فایل واقعی نگه داشته می‌شود تا
     هنگام ثبت گزارش به سرور آپلود شود (قبلاً فقط نام فایل ذخیره می‌شد و هیچ
     فایلی به سرور نمی‌رفت، بنابراین در پنل مدیریت چیزی دیده نمی‌شد). */
  /* وضعیت ارسال پیوست‌ها روی صفحه‌ی «گزارش ثبت شد» — کاربر باید ببیند عکس و
     فیلمش واقعاً در حال رفتن به سرور است و بعد هم تأیید بگیرد. */
  function setUploadStatus(text, tone) {
    const el = document.getElementById('reportUploadStatus');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.style.color = (tone === 'error') ? '#ef4444' : (tone === 'done' ? 'var(--teal)' : 'var(--text-muted)');
  }
  window.setReportUploadStatus = setUploadStatus;

  /* ── فشرده‌سازی عکس پیش از ارسال ──────────────────────────────────────
     دوربین گوشی‌های امروزی عکس ۳ تا ۸ مگابایتی می‌سازد؛ اگر همان‌طور ارسال شود
     آپلود روی اینترنت موبایل کند می‌شود و بعضی هاست‌ها هم قبول نمی‌کنند. اینجا
     عکس تا حداکثر ۱۶۰۰ پیکسل کوچک و با کیفیت ۸۲٪ به JPEG تبدیل می‌شود
     (حجم نمونه‌ی معمول: ۲۰۰ تا ۵۰۰ کیلوبایت) — عکس‌های کوچک‌تر از ۴۰۰ کیلوبایت
     دست‌نخورده می‌مانند تا کیفیت بی‌دلیل کم نشود. GIF و HEIC هم دست‌نخورده
     می‌مانند (یا متحرک‌اند یا مرورگر اندروید نمی‌تواند بازشان کند). */
  const REPORT_IMAGE_MAX_SIDE = 1600;
  const REPORT_IMAGE_QUALITY = 0.82;
  const REPORT_IMAGE_SKIP_BELOW = 400 * 1024;
  /* ── سقف حجم عکسِ آماده‌ی ارسال ─────────────────────────────────────
     تجربه‌ی میدانی روی همین هاست: درخواست‌های کوچک همیشه عبور می‌کنند ولی
     درخواست‌های چند صد کیلوبایتی حاوی base64 ممکن است وسط راه بسته شوند.
     پس عکس پیش از ارسال تا حد امکان سبک می‌شود (کمتر از ~۲۲۰ کیلوبایت) تا
     در همان درخواست کوچکِ گزارش جا بگیرد و هیچ‌وقت به مسیر تکه‌تکه نیفتد. */
  const REPORT_IMAGE_TARGET_BYTES = 220 * 1024;
  const REPORT_IMAGE_MIN_SIDE = 720;

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
      } else {
        try {
          const dataUrl = canvas.toDataURL(type, quality);
          const bin = atob(dataUrl.split(',')[1] || '');
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(new Blob([bytes], { type: type }));
        } catch (e) { resolve(null); }
      }
    });
  }

  async function compressReportImage(file) {
    const type = (file.type || '').toLowerCase();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (type === 'image/gif' || ext === 'gif' || type === 'image/heic' || type === 'image/heif') return file;
    if (file.size <= REPORT_IMAGE_SKIP_BELOW) return file;

    const img = await loadImageElement(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const maxSide = Math.max(w, h);

    /* چند مرحله‌ی کاهش حجم؛ اولین نتیجه‌ی زیر سقف برنده است. اگر هیچ‌کدام
       زیر سقف نرفت، سبک‌ترین نتیجه‌ی ساخته‌شده برگردانده می‌شود. */
    const scales = [1, 0.85, 0.7, 0.55, 0.42];
    const qualities = [0.82, 0.7, 0.6, 0.5];
    let best = null;

    for (const scale of scales) {
      const side = Math.min(REPORT_IMAGE_MAX_SIDE, Math.round(maxSide * scale));
      if (side < REPORT_IMAGE_MIN_SIDE && best) break;
      const targetW = Math.max(1, Math.round(w * (side / maxSide)));
      const targetH = Math.max(1, Math.round(h * (side / maxSide)));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return best ? best.blob : file;
      /* پس‌زمینه‌ی سفید برای عکس‌های شفاف (PNG) تا تبدیل به JPEG سیاه نشود */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (!blob || blob.size === 0) continue;
        if (!best || blob.size < best.blob.size) best = { blob: blob };
        if (blob.size <= REPORT_IMAGE_TARGET_BYTES) {
          best = { blob: blob };
          break;
        }
      }
      if (best && best.blob.size <= REPORT_IMAGE_TARGET_BYTES) break;
    }

    if (!best || !best.blob || best.blob.size >= file.size) return file;

    const newName = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    try {
      return new File([best.blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (e) {
      /* مرورگرهای قدیمی که سازنده‌ی File را پشتیبانی نمی‌کنند */
      best.blob.name = newName;
      return best.blob;
    }
  }

  function formatFileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (Math.round(n / (1024 * 1024) * 10) / 10) + ' مگابایت';
    return Math.max(1, Math.round(n / 1024)) + ' کیلوبایت';
  }

  /* ── آماده‌سازی فایل (دوربین یا گالری) برای ارسال ─────────────────────
     یک مسیر مشترک برای همه‌ی منابع: عکسِ گرفته‌شده با دوربینِ داخل اپ، عکس/فیلم
     دوربینِ خود گوشی، و فایل‌های گالری. حجم غیرمجاز رد می‌شود، عکس‌ها فشرده
     می‌شوند و خروجی، فهرست { file, kind, name, size } است. */
  async function prepareCapturedFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    const out = [];
    if (!list.length) return out;
    let rejected = 0;
    let unreadable = 0;
    const accepted = [];
    list.forEach(file => {
      const kind = detectMediaKind(file);
      const maxMb = kind === 'video' ? REPORT_MEDIA_MAX_VIDEO_MB : REPORT_MEDIA_MAX_IMAGE_MB;
      if (!file.size) {
        /* حجم صفر یعنی سیستم، دسترسی خواندن فایل را به اپ نداده است */
        unreadable++;
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        rejected++;
        showToast('حجم ' + (kind === 'video' ? 'فیلم' : 'عکس') + ' «' + (file.name || '—') + '» بیش از ' + maxMb + ' مگابایت است؛ فایل سبک‌تری انتخاب کنید');
        return;
      }
      accepted.push({ file: file, kind: kind });
    });

    if (unreadable > 0) {
      saveUploadLog({
        time: (new Date()).toLocaleString('fa-IR'),
        text: 'دریافت فایل — ' + toPersianDigits(unreadable) + ' فایل با حجم صفر (ناخوانا)؛ '
          + 'دسترسی خواندن فایل به اپ داده نشده است.'
      });
      showToast('فایل انتخاب‌شده خوانده نشد؛ دوباره با دوربین بگیرید یا از گالری انتخاب کنید');
    }

    if (accepted.some(item => item.kind === 'image')) {
      showToast('در حال آماده‌سازی عکس‌ها…');
    }

    for (const item of accepted) {
      let file = item.file;
      if (item.kind === 'image') {
        try {
          file = await compressReportImage(item.file);
        } catch (e) {
          file = item.file;   /* اگر فشرده‌سازی نشد، همان فایل اصلی ارسال می‌شود */
        }
      }
      out.push({
        file: file,
        kind: item.kind,
        name: file.name || item.file.name || (item.kind === 'video' ? 'film.mp4' : 'photo.jpg'),
        size: Number(file.size) || 0
      });
    }

    const videos = out.filter(item => item.kind === 'video');
    if (videos.length && rejected === 0) {
      const biggest = videos.reduce((a, b) => (a.size > b.size ? a : b));
      if (biggest.size > 20 * 1024 * 1024) {
        showToast('فیلم ' + formatFileSize(biggest.size) + ' است؛ ارسالش کمی طول می‌کشد');
      }
    }
    return out;
  }

  async function addReportPhotos(input) {
    const files = Array.from(input.files || []);
    const remaining = 3 - reportDraft.photos.length;
    if (remaining <= 0) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
      input.value = '';
      return;
    }

    const chosen = files.slice(0, remaining);
    if (files.length > remaining) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
    }

    const accepted = await prepareCapturedFiles(chosen);

    accepted.forEach(item => {
      reportDraft.photos.push({
        file: item.file,
        name: item.name,
        kind: item.kind,
        size: item.size,
        previewUrl: URL.createObjectURL(item.file)
      });
    });

    renderReportPhotosPreview();
    input.value = '';
  }

  /* ── گرفتن عکس/فیلم با دوربین گوشی و بارگذاری آن ──────────────────────
     دو مسیر، تا روی هر گوشی کار کند:
       ۱) دوربینِ داخل اپ (assets/js/ep-camera.js) — کاربر از اپ بیرون نمی‌رود؛
          عکس با دوربین عقب/جلو گرفته می‌شود و فیلم تا ۶۰ ثانیه ضبط می‌شود.
       ۲) اگر اجازه‌ی دوربین به اپ داده نشد یا ضبط فیلم پشتیبانی نشد،
          دوربینِ خود گوشی باز می‌شود (input با capture) و نتیجه برمی‌گردد.
     خروجی هر دو مسیر، «فایل» است و دقیقاً مثل فایل گالری در همان مسیر
     بارگذاری (تکه‌تکه + مسیر پشتیبان + صف تلاش دوباره) ارسال می‌شود. */
  async function openReportCamera(mode) {
    const remaining = 3 - reportDraft.photos.length;
    if (remaining <= 0) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
      return;
    }
    const kind = (mode === 'video') ? 'video' : 'photo';
    saveUploadLog({
      time: (new Date()).toLocaleString('fa-IR'),
      text: 'دوربین — درخواست گرفتن ' + (kind === 'video' ? 'فیلم' : 'عکس') + ' از داخل اپ'
    });
    if (window.EplakCamera && typeof window.EplakCamera.open === 'function') {
      let shot = null;
      try {
        shot = await window.EplakCamera.open({ mode: kind });
      } catch (e) {
        shot = null;
      }
      if (shot && shot.file) {
        await addCapturedFiles([shot.file]);
        return;
      }
      /* کاربر خودش دوربین را بست → چیزی باز نمی‌کنیم */
      if (shot && shot.reason === 'cancelled') return;
      /* دوربین داخل اپ نشد (اجازه/پشتیبانی) → دوربین خود گوشی */
      showToast('دوربین گوشی باز می‌شود…');
    }
    const native = document.getElementById(kind === 'video' ? 'reportCameraVideoInput' : 'reportCameraPhotoInput');
    if (native) {
      native.value = '';
      native.click();
    } else {
      showToast('دوربین روی این گوشی در دسترس نیست؛ از گالری انتخاب کنید');
    }
  }

  /* افزودن فایلِ گرفته‌شده (دوربین اپ یا دوربین گوشی) به پیوست‌ها */
  async function addCapturedFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const remaining = 3 - reportDraft.photos.length;
    if (remaining <= 0) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
      return;
    }
    const chosen = files.slice(0, remaining);
    if (files.length > remaining) showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');

    const prepared = await prepareCapturedFiles(chosen);
    prepared.forEach(item => {
      reportDraft.photos.push({
        file: item.file,
        name: item.name,
        kind: item.kind,
        size: item.size,
        previewUrl: URL.createObjectURL(item.file)
      });
    });
    renderReportPhotosPreview();
    if (prepared.length) {
      saveUploadLog({
        time: (new Date()).toLocaleString('fa-IR'),
        text: 'دوربین — ' + toPersianDigits(prepared.length) + ' فایل آماده‌ی ارسال اضافه شد'
      });
      showToast('✅ به پیوست‌ها اضافه شد — هنگام ثبت، با گزارش ارسال می‌شود');
    }
  }

  function renderReportPhotosPreview() {
    const wrap = document.getElementById('reportPhotosPreview');
    if (!wrap) return;
    wrap.innerHTML = reportDraft.photos.map((item, idx) => {
      const preview = (item.kind === 'video')
        ? `<span class="picked-video-icon">${(window.EplakIcons ? window.EplakIcons.get('video', { size: 26 }) : '🎬')}</span>`
        : '<img src="' + item.previewUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:11px;">';
      return `
      <div style="position:relative; width:68px; height:68px; border-radius:12px; background:var(--card-bg); border:1px solid var(--card-border); display:flex; align-items:center; justify-content:center; font-size:22px; overflow:hidden;">
        ${preview}
        <span onclick="removeReportPhoto(${idx})" style="position:absolute; top:2px; left:2px; width:20px; height:20px; background:rgba(255,60,60,0.92); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; color:white; cursor:pointer; z-index:2;">✕</span>
      </div>`;
    }).join('');
  }

  function removeReportPhoto(idx) {
    const removed = reportDraft.photos.splice(idx, 1)[0];
    if (removed && removed.previewUrl) {
      try { URL.revokeObjectURL(removed.previewUrl); } catch (e) {}
    }
    renderReportPhotosPreview();
  }

  function goReportStep4() {
    document.getElementById('confirmDeptText').textContent = reportDraft.subDepartment
      ? (reportDraft.department + ' / ' + reportDraft.subDepartment) : '—';
    document.getElementById('confirmDescText').textContent = reportDraft.desc || '—';
    const geo = reportDraft.geo || {};
    const hasCoords = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    document.getElementById('confirmLocationText').textContent = hasCoords
      ? ((reportDraft.location || '') + ' — ' + geo.lat.toFixed(5) + ' , ' + geo.lng.toFixed(5))
      : (reportDraft.location || '—');
    document.getElementById('confirmPhotoCount').textContent = `${toPersianDigits(reportDraft.photos.length)} فایل (عکس/فیلم)`;
    showScreen('screen-report-step4');
  }


  /* ══════════════════════════════════════════════════════════════════
     گزارش فنی ارسال پیوست‌ها (برای پیگیری در صورت نرسیدن فایل)
     ══════════════════════════════════════════════════════════════════ */
  const UPLOAD_LOG_KEY = 'eplak_last_media_upload';

  function saveUploadLog(entry) {
    try {
      if (!window.localStorage) return;
      const list = (() => {
        try { return JSON.parse(window.localStorage.getItem(UPLOAD_LOG_KEY) || '[]'); }
        catch (e) { return []; }
      })();
      list.unshift(entry);
      window.localStorage.setItem(UPLOAD_LOG_KEY, JSON.stringify(list.slice(0, 5)));
    } catch (e) { /* بی‌اهمیت */ }
  }

  function readUploadLog() {
    try {
      if (!window.localStorage) return [];
      const list = JSON.parse(window.localStorage.getItem(UPLOAD_LOG_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function uploadLogText() {
    const list = readUploadLog();
    if (!list.length) return 'هنوز تلاشی برای ارسال پیوست ثبت نشده است.';
    return list.map(function (item, i) {
      return (i + 1) + ') ' + (item.time || '') + ' — ' + (item.text || '');
    }).join('\n');
  }

  /* دکمه‌ی «جزئیات فنی» زیر پیام وضعیت (فقط وقتی مشکلی بوده) */
  function showUploadDetails() {
    const text = uploadLogText();
    showToast('جزئیات فنی آخرین ارسال‌ها را در کادر پایین صفحه ببینید');
    const host = document.getElementById('reportUploadStatus');
    if (!host || !host.parentNode) return;
    let box = document.getElementById('reportUploadDetails');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'reportUploadDetails';
      box.style.cssText = 'margin:10px 0 0; padding:10px 12px; border-radius:12px; background:rgba(15,23,42,0.06); ' +
        'color:var(--text-muted); font-size:11px; line-height:1.9; text-align:right; direction:rtl; white-space:pre-wrap;';
      host.parentNode.insertBefore(box, host.nextSibling);
    }
    box.textContent = text;
    box.style.display = 'block';
  }
  window.showUploadDetails = showUploadDetails;

  function offerUploadDetailsButton() {
    const host = document.getElementById('reportUploadStatus');
    if (!host || !host.parentNode) return;
    if (document.getElementById('reportUploadDetailsBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'reportUploadDetailsBtn';
    btn.type = 'button';
    btn.textContent = 'نمایش جزئیات فنی ارسال';
    btn.style.cssText = 'margin:8px 6px 0 0; padding:7px 12px; border:1px solid var(--card-border); border-radius:10px; ' +
      'background:transparent; color:var(--text-muted); font-family:inherit; font-size:12px; cursor:pointer;';
    btn.onclick = showUploadDetails;
    host.parentNode.insertBefore(btn, host.nextSibling);
  }

  /* ── دکمه‌ی «تلاش دوباره»: کل مسیر را از سر می‌گیرد ────────────────────
     عکس/فیلم دوباره بارگذاری می‌شود و سپس گزارش ثبت می‌گردد؛ همچنان فقط
     یک کد پیگیری صادر می‌شود (شناسه‌ی یکتای درخواست تغییری نمی‌کند). */
  function offerMediaRetry(files, phone, report) {
    const el = document.getElementById('reportUploadStatus');
    if (!el || !el.parentNode) return;
    let btn = document.getElementById('reportUploadRetry');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'reportUploadRetry';
      btn.type = 'button';
      btn.textContent = 'تلاش دوباره برای ارسال عکس/فیلم';
      btn.style.cssText = 'margin-top:8px; padding:9px 14px; border:0; border-radius:10px; ' +
        'background:var(--teal); color:#fff; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;';
      el.parentNode.insertBefore(btn, el.nextSibling);
    }
    btn.style.display = 'inline-block';
    btn.onclick = async function () {
      btn.disabled = true;
      btn.textContent = 'در حال تلاش دوباره…';
      try {
        await retryReportWithMedia(report, files, phone);
      } finally {
        btn.disabled = false;
        btn.textContent = 'تلاش دوباره برای ارسال عکس/فیلم';
      }
    };
  }

  function clearMediaRetry() {
    const btn = document.getElementById('reportUploadRetry');
    if (btn) btn.style.display = 'none';
  }

  /* تلاش دوباره‌ی کامل: بارگذاری پیوست‌ها → ساخت گزارش → کد پیگیری
     فایل‌ها از سه منبع پیدا می‌شوند تا «تلاش دوباره» هیچ‌وقت بی‌فایل نماند:
       ۱) همان فایل‌هایی که در همین صفحه انتخاب شده بودند
       ۲) حافظه‌ی درون‌برنامه‌ای آخرین تلاش (lastMediaAttempt)
       ۳) صف پایدار IndexedDB (پس از بستن و باز کردن اپ) */
  let lastMediaAttempt = null;    /* { ref, files, phone } */

  async function retryReportWithMedia(report, files, phone) {
    if (!report) return false;
    const guardRef = String(report.clientRef || '');
    if (guardRef) {
      if (uploadsInFlight.has(guardRef)) return false;   /* ارسال همین درخواست در جریان است */
      uploadsInFlight.add(guardRef);
    }
    try {
      return await retryReportWithMediaInner(report, files, phone);
    } finally {
      if (guardRef) uploadsInFlight.delete(guardRef);
    }
  }

  async function retryReportWithMediaInner(report, files, phone) {
    const ref = String(report.clientRef || '');
    let list = (files || []).filter(Boolean);
    if (!list.length && ref && lastMediaAttempt && lastMediaAttempt.ref === ref) {
      list = (lastMediaAttempt.files || []).filter(Boolean);
    }
    report.uploadState = 'uploading';
    setSuccessCodeState('loading');

    if (list.length) {
      const mediaRes = await uploadStagedMedia(report, list, phone);
      if (!mediaRes.ok) {
        showReportUploadFailed(report, list, phone, mediaRes.note || (mediaRes.errors[0] || ''));
        return false;
      }
    } else if (ref && typeof window.eplakFlushPendingMediaRef === 'function') {
      /* فایل‌ها در صف پایدار گوشی هستند؛ از همان‌جا دوباره فرستاده می‌شوند */
      setSuccessNote('در حال ارسال دوباره‌ی عکس/فیلم‌های ذخیره‌شده در گوشی…');
      let ready = false;
      /* نمودار پیشرفت هر فایل هم‌چنان کار می‌کند (فایل‌ها از صف گوشی می‌آیند) */
      bindSuccessUploadList(ref);
      try { ready = await window.eplakFlushPendingMediaRef(ref, phone, 0, uploadHooksForRef(ref)); } catch (e) { ready = false; }
      if (!ready) {
        const state = (typeof window.eplakPendingMediaRefState === 'function')
          ? await window.eplakPendingMediaRefState(ref, phone).catch(function () { return { queued: 0, readable: 0 }; })
          : { queued: 0, readable: 0 };
        const note = (state && state.queued && !state.readable)
          ? 'عکس/فیلم‌ها در حافظه‌ی اپ نمانده‌اند؛ دوباره از دوربین یا گالری پیوست کنید'
          : 'ارسال عکس/فیلم کامل نشد';
        showReportUploadFailed(report, [], phone, note);
        if (state && state.queued && !state.readable) offerMediaReattach(report, phone);
        return false;
      }
    }

    if (!report.pendingSync && report.backendId) {
      clearMediaRetry();
      setSuccessCodeState('done', report.code || '');
      return true;
    }
    return await finalizePendingReport(report, phone);
  }

  /* وقتی فایل‌ها از حافظه‌ی اپ رفته‌اند: کاربر همان عکس/فیلم را دوباره
     انتخاب (یا با دوربین ضبط) می‌کند و با «همان شناسه‌ی درخواست» فرستاده
     می‌شود؛ پس گزارش تکراری یا کد پیگیری دوم ساخته نمی‌شود. */
  function offerMediaReattach(report, phone) {
    const host = document.getElementById('reportUploadStatus');
    if (!host || !host.parentNode) return;
    let btn = document.getElementById('reportUploadReattach');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'reportUploadReattach';
      btn.type = 'button';
      btn.textContent = 'انتخاب دوباره‌ی عکس/فیلم از گوشی';
      btn.style.cssText = 'margin:8px 6px 0 0; padding:9px 14px; border:0; border-radius:10px; ' +
        'background:var(--teal); color:#fff; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;';
      host.parentNode.insertBefore(btn, host.nextSibling);
    }
    btn.style.display = 'inline-block';
    btn.onclick = function () {
      reattachInputTarget = { report: report, phone: phone };
      const input = getReattachInput();
      if (input) input.click();
    };
  }

  let reattachInputTarget = null;
  function getReattachInput() {
    let input = document.getElementById('reportReattachInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'reportReattachInput';
      input.accept = 'image/*,video/*';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', async function () {
        const target = reattachInputTarget;
        const files = Array.from(input.files || []);
        input.value = '';
        if (!target || !target.report || !files.length) return;
        const prepared = (await prepareCapturedFiles(files)).map(item => item.file);
        if (!prepared.length) {
          showToast('فایل انتخاب‌شده خوانده نشد');
          return;
        }
        lastMediaAttempt = { ref: String(target.report.clientRef || ''), files: prepared, phone: target.phone };
        await retryReportWithMedia(target.report, prepared, target.phone);
      });
    }
    return input;
  }

  /* ── ساخت گزارش روی سرور و گرفتن «یک» کد پیگیری ─────────────────────
     این تابع فقط پس از پایان بارگذاری همه‌ی عکس/فیلم‌ها صدا زده می‌شود؛ پس
     کد پیگیری همیشه با پیوست‌ها صادر می‌شود. */
  async function finalizePendingReport(report, phone, opts) {
    if (!report || !phone) return false;
    const payload = {
      userPhone: phone,
      client_ref: report.clientRef || '',
      title: report.title,
      description: report.desc || report.title,
      category: report.subDepartment || report.department || 'سایر',
      department: report.department || '',
      subDepartment: report.subDepartment || '',
      location: report.location || ''
    };
    if (typeof report.lat === 'number' && typeof report.lng === 'number') {
      payload.lat = report.lat;
      payload.lng = report.lng;
      if (!payload.location || payload.location === 'نامشخص') {
        payload.location = report.lat.toFixed(6) + ' , ' + report.lng.toFixed(6);
      }
    }
    report.uploadState = 'creating';
    let res = null;
    try {
      if (typeof window.syncJsonToBackendWithProgress === 'function') {
        res = await window.syncJsonToBackendWithProgress('reports', payload, pct => setSuccessCodeState(pct));
      } else if (typeof window.syncDataToBackend === 'function') {
        res = await window.syncDataToBackend('reports', payload);
      }
    } catch (e) {
      res = null;
    }
    if (!res || res.success === false) {
      report.uploadState = 'failed';
      report.pendingSync = true;
      if (typeof saveReports === 'function') saveReports(phone);
      if (!(opts && opts.silent)) {
        const reason = (res && res.error) ? String(res.error) : 'ارتباط با سرور برقرار نشد';
        showReportUploadFailed(report, [], phone, reason);
      }
      return false;
    }
    if (res.id) {
      report.backendId = res.id;
      report.id = String(res.id);
    }
    if (res.tracking_code) report.code = res.tracking_code;
    if (res.deduped) {
      /* سرور همین درخواست را از قبل داشت؛ کد تازه‌ای ساخته نشد و همان کد برگشت */
      saveUploadLog({
        time: (new Date()).toLocaleString('fa-IR'),
        text: 'سرور همین درخواست را قبلاً ثبت کرده بود؛ کد پیگیری تکراری ساخته نشد.'
      });
    }
    if (Array.isArray(res.media) && res.media.length) {
      report.media = res.media.map(item => ({
        kind: item.kind,
        url: mediaUrlOf(item.url || item.path),
        name: item.name,
        size: item.size
      }));
    }
    delete report.pendingSync;
    report.uploadState = 'done';
    if (typeof saveReports === 'function') saveReports(phone);
    /* کد پیگیری فقط اینجا — پس از پایان کامل بارگذاری — نشان داده می‌شود */
    const codeEl = document.getElementById('successTrackCode');
    if (codeEl) codeEl.textContent = report.code || '—';
    setSuccessNote('✅ گزارش با عکس/فیلم‌ها ثبت شد و در پنل شهرداری قرار گرفت.');
    clearMediaRetry();
    if (typeof loadReportsFromBackend === 'function') {
      loadReportsFromBackend(phone, { silent: true });
    }
    if (typeof window.refreshNotificationsNow === 'function') {
      try { window.refreshNotificationsNow(); } catch (e) {}
    }
    return true;
  }

  let reportSubmitInFlight = false;    /* دو ضربه روی «ثبت نهایی» = یک درخواست */
  let reportSubmitWatchdog = null;     /* نگهبان: اگر ارسال گیر کرد، قفل باز شود */

  /* ── وضعیت «کد پیگیری» در صفحه‌ی موفقیت ──────────────────────────────
     تا وقتی عکس و فیلم کامل بارگذاری نشده‌اند، هیچ کدی نشان داده نمی‌شود. */
  function setSuccessCodeState(state, code) {
    const codeEl = document.getElementById('successTrackCode');
    if (!codeEl) return;
    if (state === 'done' && code) {
      codeEl.textContent = code;
      return;
    }
    if (state === 'failed') {
      codeEl.textContent = 'صادر نشد';
      return;
    }
    /* در حال بارگذاری: جای کد، وضعیت پیشرفت نوشته می‌شود */
    const pct = (typeof state === 'number') ? Math.max(1, Math.round(state)) : 0;
    codeEl.textContent = pct > 0
      ? ('در حال بارگذاری… ' + toPersianDigits(pct) + '٪')
      : 'در حال بارگذاری…';
  }

  /* پیام وضعیت بارگذاری در صفحه‌ی موفقیت (بالای دکمه‌ها) */
  function setSuccessNote(text) {
    const el = document.getElementById('reportUploadStatus');
    if (!el) return;
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }

  /* ── نمودار پیشرفت «هر فایل» (core/upload-progress.js) ───────────────────
     هر عکس/فیلم یک نوار درصدی دارد؛ پس از آپلود، نوار می‌رود و فقط
     «فایل آپلود شد» می‌ماند. این نمودار در دو جا دیده می‌شود:
       ۱) صفحه‌ی «گزارش ثبت شد» (همان لحظه‌ی ارسال)
       ۲) جزئیات گزارش، زیر «روند رسیدگی» ← گام «ثبت گزارش» */
  function uploadTracker() {
    return window.EplakUploadProgress || null;
  }

  /* قلاب‌های نمودار برای فایل‌هایی که از «صف گوشی» دوباره فرستاده می‌شوند */
  function uploadHooksForRef(ref) {
    const tracker = uploadTracker();
    if (!tracker || !ref) return null;
    return {
      begin: (metas) => tracker.begin(ref, metas),
      onFile: (idx, ev) => tracker.apply(ref, idx, ev)
    };
  }

  let successUploadUnbind = null;
  let detailUploadUnbind = null;
  let uploadRetryBusy = false;

  function bindSuccessUploadList(ref) {
    if (successUploadUnbind) { try { successUploadUnbind(); } catch (e) {} successUploadUnbind = null; }
    const el = document.getElementById('reportUploadList');
    const tracker = uploadTracker();
    if (!el || !tracker || !ref) return;
    /* دکمه‌ی «تلاش دوباره»ی همین صفحه یکی است؛ ردیف‌ها دکمه‌ی جدا نمی‌گیرند */
    successUploadUnbind = tracker.bind(el, ref, { retry: false });
  }

  /* نمودار زیر «روند رسیدگی» در جزئیات گزارش */
  function bindDetailUploads(report) {
    if (detailUploadUnbind) { try { detailUploadUnbind(); } catch (e) {} detailUploadUnbind = null; }
    const el = document.getElementById('flowUploads');
    const tracker = uploadTracker();
    if (!el || !tracker || !report) return;
    const ref = String(report.clientRef || '');
    if (ref && tracker.has(ref)) {
      detailUploadUnbind = tracker.bind(el, ref, { onRetry: retryUploadByRef });
      return;
    }
    /* گزارش‌های قدیمی‌تر: فایل‌های ذخیره‌شده روی سرور = «فایل آپلود شد» */
    tracker.renderStatic(el, tracker.itemsFromMedia(report.media));
  }

  /* «تلاش دوباره» از داخل ردیف ناموفقِ جزئیات گزارش */
  async function retryUploadByRef(ref) {
    if (uploadRetryBusy) return;
    const report = reports.find(r => String(r.clientRef || '') === String(ref));
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    if (!report || !phone) return;
    uploadRetryBusy = true;
    try {
      await retryReportWithMedia(report, [], phone);
    } finally {
      uploadRetryBusy = false;
    }
  }

  /* ── ارسال عکس/فیلم پیش از ساخته شدن گزارش («در انتظار اتصال») ───────
     هر فایل با شناسه‌ی یکتای درخواست ذخیره می‌شود و هنگام ساخت گزارش،
     خودکار به آن متصل می‌گردد؛ پس گزارش همیشه «با» پیوست‌هایش ساخته
     می‌شود و کد پیگیری تنها پس از پایان بارگذاری صادر می‌شود. */
  async function uploadStagedMedia(report, files, phone) {
    if (!files.length) return { ok: true, media: [], errors: [] };
    const total = files.length;
    const ref = String(report.clientRef || '');
    const tracker = uploadTracker();
    /* نمودار پیشرفت هر فایل: همین حالا (پیش از اولین بایت) ردیف‌ها دیده می‌شوند */
    if (tracker && ref) {
      tracker.begin(ref, files);
      bindSuccessUploadList(ref);
    }
    setSuccessNote('در حال بارگذاری ' + toPersianDigits(total) + ' عکس/فیلم… تا پایان بارگذاری، کد پیگیری صادر نمی‌شود.');
    if (typeof window.uploadReportMediaChunked !== 'function') {
      if (tracker && ref) files.forEach((f, i) => tracker.apply(ref, i, { type: 'fail', note: 'ارسال پیوست‌ها روی این نسخه ممکن نیست' }));
      return { ok: false, media: [], errors: ['ارسال پیوست‌ها روی این نسخه ممکن نیست'], note: 'ارسال پیوست‌ها ممکن نشد' };
    }
    let res = null;
    try {
      res = await window.uploadReportMediaChunked(0, phone, files, pct => {
        setSuccessCodeState(pct);
        setSuccessNote('در حال بارگذاری ' + toPersianDigits(total) + ' عکس/فیلم… ' + toPersianDigits(Math.max(1, pct)) + '٪');
      }, {
        clientRef: report.clientRef,
        onFile: (idx, ev) => { if (tracker && ref) tracker.apply(ref, idx, ev); }
      });
    } catch (e) {
      res = { ok: false, media: [], failed: files.map(f => f.name || ''), error: (e && e.message) || 'خطای شبکه', status: 0 };
      /* استثنای ناگهانی: هر ردیفی که هنوز «در حال ارسال» مانده، ناموفق نشان داده شود */
      if (tracker && ref) {
        tracker.items(ref).forEach(it => {
          if (it.state !== 'done') tracker.apply(ref, it.id, { type: 'fail', note: res.error });
        });
      }
    }
    const saved = (res && Array.isArray(res.media)) ? res.media : [];
    const failed = (res && Array.isArray(res.failed)) ? res.failed : [];
    saveUploadLog({
      time: (new Date()).toLocaleString('fa-IR'),
      text: 'بارگذاری پیوست‌ها (پیش از ثبت گزارش) — ' + toPersianDigits(total) + ' فایل • ذخیره‌شده: '
        + toPersianDigits(saved.length) + ' • ناموفق: ' + toPersianDigits(failed.length)
        + (res && res.status ? (' • کد سرور: ' + toPersianDigits(res.status)) : '')
        + (res && res.error ? (' • پیام: ' + res.error) : '')
    });
    if (saved.length) {
      report.media = saved.map(item => ({
        kind: item.kind,
        url: mediaUrlOf(item.url || item.path),
        name: item.name,
        size: item.size
      }));
    }
    return {
      ok: failed.length === 0 && (saved.length === total || (res && res.ok === true && saved.length > 0)),
      media: saved,
      errors: (res && res.error) ? [String(res.error)] : [],
      note: (res && res.error) ? String(res.error) : ''
    };
  }

  /* ── پیام شکست: بدون کد پیگیری (گزارش ساخته نشده) + دکمه‌ی تلاش دوباره ── */
  function showReportUploadFailed(report, files, phone, note) {
    setSuccessCodeState('failed');
    setSuccessNote('⚠️ ' + (note || 'ارسال عکس/فیلم کامل نشد')
      + ' — تا وقتی عکس و فیلم کامل بارگذاری نشوند، کد پیگیری صادر نمی‌شود. پیوست‌ها در گوشی نگه داشته شدند و خودکار دوباره ارسال می‌شوند.');
    offerMediaRetry(files, phone, report);
    offerUploadDetailsButton();
    if (typeof window.eplakQueuePendingMedia === 'function') {
      window.eplakQueuePendingMedia(report.backendId || 0, phone, files, report.clientRef).catch(function () {});
    }
  }

  async function submitNewReport() {
    if (reportSubmitInFlight) {
      return;                        /* ثبت قبلی در جریان است؛ دوباره نساز */
    }
    reportSubmitInFlight = true;
    clearTimeout(reportSubmitWatchdog);
    reportSubmitWatchdog = setTimeout(() => { reportSubmitInFlight = false; }, 120000);

    const iconMap = { 'سایر': 'info', 'نظافت': 'waste', 'زیرساخت': 'tools', 'زیرسبز': 'leaf', 'روشنایی': 'services' };
    const currentPhone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    const title = (reportDraft.desc || '').slice(0, 28) || (reportDraft.type + ' - گزارش جدید');
    const nowIso = new Date().toISOString();

    /* شناسه‌ی یکتای درخواست — با همه‌ی تلاش‌های ارسال می‌رود تا سرور فقط یک
       گزارش بسازد و همان یک کد پیگیری برگردد. */
    const clientRef = 'EPL-' + Date.now().toString(36).toUpperCase() + '-'
      + Math.random().toString(36).slice(2, 8).toUpperCase();

    const newReport = {
      id: `r${reportIdCounter++}`,
      clientRef,
      code: '',                      /* ← هیچ کد ساختگی محلی؛ کد فقط از سرور می‌آید */
      title,
      location: reportDraft.location || 'نامشخص',
      lat: (reportDraft.geo && typeof reportDraft.geo.lat === 'number') ? reportDraft.geo.lat : null,
      lng: (reportDraft.geo && typeof reportDraft.geo.lng === 'number') ? reportDraft.geo.lng : null,
      rawDate: nowIso,
      date: formatReportDate(nowIso),
      dateTime: formatReportDateTime(nowIso),
      status: 'pending',
      icon: iconMap[reportDraft.type] || 'report',
      iconBg: 'rgba(0,201,167,0.12)',
      desc: reportDraft.desc || 'بدون توضیحات',
      department: reportDraft.department || '',
      subDepartment: reportDraft.subDepartment || '',
      reply: '',
      timeline: [],
      /* پیش‌نمایش محلی فایل‌ها تا در جزئیات گزارش بلافاصله دیده شوند */
      media: (reportDraft.photos || []).map(item => ({
        kind: item.kind,
        url: item.previewUrl,
        local: true,
        name: item.name,
        size: item.size
      })),
      pendingSync: true,
      uploadState: 'uploading'
    };

    /* ۱) ثبت محلی فوری (بدون کد پیگیری نمایشی) و نمایش صفحه‌ی پیشرفت */
    reports.unshift(newReport);
    uploadsInFlight.add(clientRef);   /* تا پایان ارسال، همگام‌سازی گزارش را نمی‌سازد */
    if (typeof saveReports === 'function') saveReports(currentPhone);
    setSuccessCodeState('loading');
    setSuccessNote('در حال آماده‌سازی ارسال…');
    if (window.soundManager && typeof window.soundManager.playDing === 'function') {
      window.soundManager.playDing();
    }
    showScreen('screen-report-success');

    /* ۲) پاک‌سازی فرم پیش‌نویس (فایل‌ها قبل از پاک‌سازی نگه داشته می‌شوند) */
    const draftPhotos = (reportDraft.photos || []).slice();
    resetReportDraft();

    try {
      if (!currentPhone) {
        newReport.uploadState = 'failed';
        setSuccessNote('⚠️ شماره‌ی کاربر مشخص نیست؛ گزارش در گوشی ذخیره شد.');
        return;
      }

      const filesToUpload = (draftPhotos || []).map(item => item.file).filter(Boolean);
      /* همان فایل‌ها در حافظه نگه داشته می‌شوند تا «تلاش دوباره» بدون فایل نماند */
      if (filesToUpload.length) lastMediaAttempt = { ref: clientRef, files: filesToUpload, phone: currentPhone };

      /* ══ مرحله ۱: بارگذاری کامل عکس و فیلم (بدون کد پیگیری) ══════════ */
      if (filesToUpload.length) {
        const mediaRes = await uploadStagedMedia(newReport, filesToUpload, currentPhone);
        if (!mediaRes.ok) {
          newReport.uploadState = 'failed';
          newReport.pendingSync = true;
          if (typeof saveReports === 'function') saveReports(currentPhone);
          showReportUploadFailed(newReport, filesToUpload, currentPhone, mediaRes.note || (mediaRes.errors[0] || ''));
          return;
        }
        setSuccessNote('✅ عکس/فیلم‌ها بارگذاری شد؛ در حال ثبت نهایی گزارش…');
      }

      /* ══ مرحله ۲: ساخت گزارش و گرفتن «یک» کد پیگیری ═════════════════ */
      const created = await finalizePendingReport(newReport, currentPhone);
      if (created) {
        showToast('گزارش با موفقیت ثبت شد ✅');
      }
    } finally {
      uploadsInFlight.delete(clientRef);
      clearTimeout(reportSubmitWatchdog);
      reportSubmitInFlight = false;
    }
  }
  window.submitNewReport = submitNewReport;

  /* ═══════════════════════════════════════════════════════════
     تازه‌سازی خودکار وضعیت گزارش‌ها
     -----------------------------------------------------------
     وقتی مدیر شهرداری وضعیت گزارش را در پنل ادمین تغییر می‌دهد، کاربر
     باید بدون بستن و باز کردن اپ، وضعیت تازه را ببیند. هر ۴۵ ثانیه
     (و هر بار که اپ از پس‌زمینه برمی‌گردد) فهرست گزارش‌ها از سرور
     خوانده و صفحه‌ی جاری دوباره رندر می‌شود.
  ═══════════════════════════════════════════════════════════ */
  const REPORTS_REFRESH_MS = 45000;
  let reportsRefreshTimer = null;

  function currentReportsFilter() {
    const active = document.querySelector('#reportsFilterTabs .filter-tab.active');
    const value = active && active.dataset ? active.dataset.filter : 'all';
    return (value === 'done' || value === 'pending' || value === 'review' || value === 'all') ? value : 'all';
  }

  function repaintReportsScreens() {
    const listWrap = document.getElementById('reportsListWrap');
    if (listWrap && typeof renderReportsList === 'function') {
      renderReportsList(currentReportsFilter(), { skipBackend: true });
    }
    if (typeof renderProfileReportsSummary === 'function' && document.getElementById('profileReportsList')) {
      renderProfileReportsSummary({ skipBackend: true });
    }
    /* اگر جزئیات یک گزارش باز است، همان گزارش با داده‌ی تازه دوباره نشان
       داده می‌شود تا وضعیت/پاسخ تازه فوراً دیده شود. */
    if (activeReportId && document.getElementById('screen-report-detail')
        && document.getElementById('screen-report-detail').classList.contains('active')) {
      openReportDetail(activeReportId);
    }
  }

  async function refreshReportsNow(options) {
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    if (!phone) return false;
    const opts = options || {};
    const requireVisible = (typeof opts.onlyIfVisible === 'boolean') ? opts.onlyIfVisible : true;
    if (requireVisible && document.visibilityState === 'hidden') {
      return false;   /* اپ در پس‌زمینه است؛ درخواست بی‌فایده نزن */
    }
    const before = JSON.stringify(reports.map(r => [String(r.id), normalizeStatusValue(r.status), r.reply || '', (r.media || []).length]));
    await loadReportsFromBackend(phone, { silent: true });
    const after = JSON.stringify(reports.map(r => [String(r.id), normalizeStatusValue(r.status), r.reply || '', (r.media || []).length]));
    if (before !== after || opts.forceRender) repaintReportsScreens();
    return true;
  }
  window.refreshReportsNow = refreshReportsNow;

  function startReportsAutoRefresh() {
    if (reportsRefreshTimer) return;
    reportsRefreshTimer = setInterval(function () {
      if (!getCurrentPhone()) return;
      refreshReportsNow().catch(function () {});
    }, REPORTS_REFRESH_MS);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      refreshReportsNow().catch(function () {});
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startReportsAutoRefresh);
  } else {
    startReportsAutoRefresh();
  }

  /* ── ارسال خودکار پیوست‌های جامانده ──────────────────────────────────
     فایل‌هایی که قبلاً نرسیده‌اند، از حافظه‌ی گوشی خوانده و در اولین فرصت
     (باز شدن اپ، برگشتن اینترنت یا تازه‌سازی دوره‌ای) دوباره فرستاده می‌شوند. */
  let pendingFlushBusy = false;
  async function flushPendingUploads() {
    if (pendingFlushBusy) return;
    if (typeof window.eplakFlushPendingMedia !== 'function') return;
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    if (!phone) return;
    if (document.visibilityState === 'hidden') return;
    pendingFlushBusy = true;
    try {
      const flushTracker = uploadTracker();
      const flushHooks = {
        skip: (group) => !!(group.clientRef && uploadsInFlight.has(String(group.clientRef))),
        begin: (group, metas) => { if (flushTracker && group.clientRef) flushTracker.begin(group.clientRef, metas); },
        onFile: (group, idx, ev) => { if (flushTracker && group.clientRef) flushTracker.apply(group.clientRef, idx, ev); }
      };
      const result = await window.eplakFlushPendingMedia(function (reportId, clientRef, count) {
        saveUploadLog({
          time: (new Date()).toLocaleString('fa-IR'),
          text: 'ارسال خودکار پیوست‌های جامانده — ' + toPersianDigits(count) + ' فایل'
            + (reportId ? (' برای گزارش شماره ' + toPersianDigits(reportId))
                        : (' برای درخواست ' + String(clientRef || '—')))
        });
      }, flushHooks);
      if (result && result.sent > 0) {
        showToast('✅ ' + toPersianDigits(result.sent) + ' پیوست جامانده خودکار ارسال شد');
        /* فایل‌ها که رسیدند، گزارشِ در انتظار ساخته می‌شود و «یک» کد پیگیری
           صادر می‌گردد؛ وگرنه پیوست‌ها روی سرور می‌ماندند و کدی دیده نمی‌شد. */
        try { await flushPendingCreates(phone); } catch (e) { /* دفعه‌ی بعد */ }
        if (typeof loadReportsFromBackend === 'function') {
          loadReportsFromBackend(phone, { silent: true }).catch(function () {});
        }
      }
    } catch (e) {
      console.warn('[reports] pending media flush note:', e);
    } finally {
      pendingFlushBusy = false;
    }
  }
  window.flushPendingUploads = flushPendingUploads;

  /* گزارش نتیجه‌ی انتخاب فایل از سمت اندروید (اگر اندروید فایلی را کپی کرده
     باشد) — برای عیب‌یابی سریع روشن می‌کند که فایل به‌دست صفحه رسیده یا نه. */
  window.eplakNativeFilesPicked = function (copied, total) {
    saveUploadLog({
      time: (new Date()).toLocaleString('fa-IR'),
      text: 'انتخاب فایل از گالری — ' + toPersianDigits(total) + ' فایل • آماده‌سازی موفق: ' + toPersianDigits(copied)
    });
  };

  window.addEventListener('online', function () { flushPendingUploads(); });
  setTimeout(flushPendingUploads, 2500);

  /* با باز شدن صفحه‌ی «موقعیت»، نقشه ساخته می‌شود و با بازگشت به آن،
     کاشی‌ها یک‌بار دیگر هم‌اندازه‌گیری می‌شوند تا کامل دیده شوند. */
  window.addEventListener('eplak-screen-shown', function (ev) {
    const id = ev && ev.detail ? ev.detail.id : '';
    if (id !== 'screen-report-step2') return;
    let tries = 0;
    const build = function () {
      tries++;
      const map = initReportMap(false);
      if (map) {
        map.refresh();
      } else if (tries < 6) {
        /* ارتفاع کادر نقشه ممکن است کمی دیر تعیین شود (انیمیشن ورود صفحه) */
        setTimeout(build, 200);
      }
      coordsText();
    };
    setTimeout(build, 60);
  });


  /* =========================================================
     Reports List / Filter / Detail
  ========================================================= */
  function renderReportsList(filter, options = {}) {
    const wrap = document.getElementById('reportsListWrap');
    if (!wrap) return;

    const normalizedFilter = normalizeStatusValue(filter ?? 'all');

    const doRender = () => {
      const list = normalizedFilter === 'all'
        ? reports
        : reports.filter(r => normalizeStatusValue(r.status) === normalizedFilter || (normalizeStatusValue(r.status) === 'in_progress' && normalizedFilter === 'in_progress'));

      const countBadge = document.getElementById('reportsCountBadge');
      if (countBadge) countBadge.textContent = toPersianDigits(reports.length);

      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');
      const deleteWord = isEn ? 'Delete' : 'حذف';
      const emptyMsg = isEn ? 'No reports found in this category' : 'گزارشی در این دسته یافت نشد';

      if (list.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">${emptyMsg}</div>`;
        return;
      }
      wrap.innerHTML = list.map(r => {
        const statusMeta = getStatusMeta(r.status);
        const displayDate = r.dateTime || r.date || '—';
        return `
          <div class="report-swipe">
            <div class="report-delete-bg" onpointerdown="event.stopPropagation()" onclick="deleteReport('${r.id}', event)">
              <div class="delete-action" style="color:#ef4444;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6 L19,20 a2,2 0 0 1 -2,2 H7 a2,2 0 0 1 -2,-2 L5,6"/><path d="M8,6 V4 a2,2 0 0 1 2,-2 h4 a2,2 0 0 1 2,2 v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span style="color:#ef4444; font-weight:800;">${deleteWord}</span>
              </div>
            </div>
            <div class="report-swipe-item" onclick="openReportDetail('${r.id}')">
              <div class="report-item">
                <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
                <div class="report-info">
                  <h4>${escapeHtml(r.title)}</h4>
                  <p>${escapeHtml(r.location)} - ${displayDate}</p>
                  ${r.timelineCount ? `<span class="report-steps-chip">${toPersianDigits(r.timelineCount)} گام رسیدگی</span>` : ''}
                </div>
                <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      initReportSwipe();
    };

    // رندر آنی بدون تاخیر از حافظه موجود
    doRender();

    // همگام‌سازی نامحسوس در پس‌زمینه با سرور
    const phone = getCurrentPhone();
    renderUserTicketsList();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(err => {
        console.warn('[reports] silent reload note:', err);
      });
      loadTicketsFromBackend(phone).then(() => {
        renderUserTicketsList();
      }).catch(() => {});
    }
  }
  window.renderReportsList = renderReportsList;

  async function deleteReport(id, e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const targetId = String(id || activeReportId || '').trim();
    if (!targetId) return;

    const idx = reports.findIndex(r => String(r.id).trim() === targetId || String(r.code).trim() === targetId);
    if (idx === -1) {
      console.warn('[reports] report to delete not found:', targetId);
      return;
    }

    const removedReport = reports[idx];
    const backendId = getReportBackendId(removedReport);
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';

    /* ۱. قبل از هر چیز شناسه در فهرست «در انتظار حذف» ثبت می‌شود تا
          همگام‌سازی پس‌زمینه (هر ۳.۵ ثانیه) گزارش را برنگرداند. */
    if (backendId !== null) {
      pendingDeleteIds.add(String(backendId));
      savePendingDeletes();
    }

    /* ۲. حذف آنی از حافظه و رابط کاربری */
    reports.splice(idx, 1);
    if (activeReportId === removedReport.id) activeReportId = null;
    if (typeof saveReports === 'function') {
      saveReports(phone);
    }

    const rerenderAll = () => {
      const activeTab = document.querySelector('#reportsFilterTabs .filter-tab.active');
      const filter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
      renderReportsList(filter, { skipBackend: true });
      if (typeof renderProfileReportsSummary === 'function') {
        renderProfileReportsSummary({ skipBackend: true });
      }
      if (typeof renderProfileTrackingQuick === 'function') {
        renderProfileTrackingQuick({ skipBackend: true });
      }
      if (typeof renderTrackRecent === 'function') {
        renderTrackRecent({ skipBackend: true });
      }
    };
    rerenderAll();

    /* ۳. حذف قطعی در سرور (فقط برای گزارش‌هایی که در سرور ثبت شده‌اند) */
    if (phone && backendId !== null) {
      try {
        await requestBackendDelete(backendId, phone);
        pendingDeleteIds.delete(String(backendId));
        savePendingDeletes();
      } catch (err) {
        /* شناسه در فهرست «در انتظار حذف» می‌ماند و در همگام‌سازی بعدی
           دوباره تلاش می‌شود؛ تا آن زمان هم به لیست برنمی‌گردد. */
        console.warn('[reports] backend delete deferred:', err && err.message ? err.message : err);
      }
    }

    showToast('گزارش با موفقیت حذف شد');
  }

  window.deleteReport = deleteReport;
  window.deleteCurrentOpenReport = function() {
    if (!activeReportId) return;
    deleteReport(activeReportId);
    if (typeof goBack === 'function') goBack();
  };

  /* =========================================================
     Swipe-to-delete gesture for report items
  ========================================================= */
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.report-swipe')) return;
    document.querySelectorAll('#reportsListWrap .report-swipe-item.open, #userTicketsListWrap .report-swipe-item.open').forEach(el => {
      el.style.transform = 'translateX(0)';
      el.classList.remove('open');
    });
  });

  function initReportSwipe() {
    const SWIPE_OPEN = -88; // px the item shifts to reveal the delete action
    const items = document.querySelectorAll('#reportsListWrap .report-swipe-item, #userTicketsListWrap .report-swipe-item');

    function closeSwipeItem(el) {
      el.style.transform = 'translateX(0)';
      el.classList.remove('open');
    }

    function closeAllExcept(except) {
      document.querySelectorAll('#reportsListWrap .report-swipe-item.open, #userTicketsListWrap .report-swipe-item.open').forEach(el => {
        if (el !== except) closeSwipeItem(el);
      });
    }

    items.forEach(item => {
      let startX = 0;
      let baseX = 0;
      let dragging = false;
      let moved = false;

      item.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        baseX = item.classList.contains('open') ? SWIPE_OPEN : 0;
        item.classList.add('swiping');
        closeAllExcept(item);
        try { item.setPointerCapture(e.pointerId); } catch (err) {}
      });

      item.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        if (Math.abs(delta) > 6) moved = true;
        let next = baseX + delta;
        if (next > 0) next = next * 0.25; // rubber-band past the resting point
        if (next < SWIPE_OPEN) next = SWIPE_OPEN + (next - SWIPE_OPEN) * 0.2; // rubber-band past open
        item.style.transform = `translateX(${next}px)`;
      });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        item.classList.remove('swiping');
        const match = /translateX\((-?\d+\.?\d*)px\)/.exec(item.style.transform || '');
        const x = match ? parseFloat(match[1]) : 0;
        if (x < SWIPE_OPEN / 2) {
          item.style.transform = `translateX(${SWIPE_OPEN}px)`;
          item.classList.add('open');
        } else {
          closeSwipeItem(item);
        }
      }

      item.addEventListener('pointerup', endDrag);
      item.addEventListener('pointercancel', endDrag);

      // Prevent the tap-to-open-detail click from firing right after a swipe,
      // and let a tap on an already-open item close it instead of navigating.
      item.addEventListener('click', (e) => {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
        if (item.classList.contains('open')) {
          e.preventDefault();
          e.stopPropagation();
          closeSwipeItem(item);
        }
      }, true);
    });
  }

  function filterReports(filter, btn) {
    const safeFilter = normalizeStatusValue(filter ?? 'all');
    document.querySelectorAll('#reportsFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReportsList(safeFilter);
  }

  function openReportDetail(id) {
    const r = reports.find(x => String(x.id) === String(id) || String(x.code) === String(id));
    if (!r) return;
    const safeStatus = normalizeStatusValue(r.status);
    const statusMeta = getStatusMeta(safeStatus);
    const replyText = (r.reply || r.admin_reply || r.response || '').trim();
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const translateText = text => (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(text) : text;

    // قالب‌بندی کامل تاریخ همراه با ساعت برای بخش روند رسیدگی زیر ثبت گزارش
    const submitDateTime = formatReportDateTime(r.rawDate || r.created_at || r.dateTime || r.date);

    /* ── روند رسیدگی (چهار مرحله، هم‌خوان با پنل ادمین) ─────────────────
       مراحل: ثبت گزارش → در حال انتظار → در حال رسیدگی → انجام شد
       جزئیات هر مرحله (تاریخ و متن) از گام‌های واقعی سرور می‌آید؛ اگر گزارش
       هنوز گامی نداشته باشد، از روی وضعیت فعلی ساخته می‌شود. */
    const FLOW_ICON = {
      created: 'file-plus',
      pending: 'clock',
      in_progress: 'tools',
      done: 'check-circle'
    };
    const FLOW_LABEL = {
      created: 'ثبت گزارش',
      pending: 'در حال انتظار',
      in_progress: 'در حال رسیدگی',
      done: 'انجام شد'
    };
    const ICON = (name, size) => (window.EplakIcons ? window.EplakIcons.get(name, { size: size || 18 }) : '');

    const flowFromStatus = () => {
      const reached = { pending: ['created'], in_progress: ['created', 'pending'], done: ['created', 'pending', 'in_progress', 'done'] };
      const current = { pending: 'pending', in_progress: 'in_progress', done: '' }[safeStatus] || 'pending';
      const doneList = reached[safeStatus] || ['created'];
      return Object.keys(FLOW_LABEL).map(key => ({
        key: key,
        label: FLOW_LABEL[key],
        state: current === key ? 'current' : (doneList.indexOf(key) > -1 ? 'done' : 'waiting'),
        date: key === 'created' ? submitDateTime : '',
        notes: key === 'created'
          ? [{ date: submitDateTime, text: 'درخواست شهروند ثبت شد.' }]
          : (key === 'in_progress' && replyText ? [{ date: '', text: replyText }] : [])
      }));
    };

    const flowStages = (Array.isArray(r.flow) && r.flow.length === 4)
      ? r.flow.map(stage => ({
          key: stage.key,
          label: stage.label || FLOW_LABEL[stage.key] || '',
          state: stage.state === 'current' ? 'current' : (stage.state === 'done' ? 'done' : 'waiting'),
          date: stage.date || '',
          notes: Array.isArray(stage.notes) ? stage.notes : []
        }))
      : flowFromStatus();

    const flowHtml = flowStages.map((stage, idx) => {
      const isLast = idx === flowStages.length - 1;
      const stateClass = stage.state === 'current' ? 'is-current' : (stage.state === 'done' ? 'is-done' : 'is-waiting');
      const dateText = stage.date ? formatReportDateTime(stage.date) : '';
      const notesHtml = (stage.notes || []).slice(-3).map(note => {
        const noteDate = note && note.date ? formatReportDateTime(note.date) : '';
        const text = note && note.text ? String(note.text) : '';
        if (!text && !noteDate) return '';
        return `<p class="flow-note">${text ? escapeHtml(text) : ''}${noteDate ? `<span class="flow-note-date">${escapeHtml(noteDate)}</span>` : ''}</p>`;
      }).join('');
      return `
        <div class="flow-step ${stateClass}">
          <div class="flow-marker">
            <div class="flow-dot">${stage.state === 'done' ? ICON('check', 14) : ICON(FLOW_ICON[stage.key] || 'info', 16)}</div>
            ${!isLast ? `<div class="flow-line ${stage.state === 'done' ? 'done' : ''}"></div>` : ''}
          </div>
          <div class="flow-body">
            <div class="flow-head">
              <h5>${escapeHtml(stage.label)}</h5>
              ${stage.state === 'current' ? '<span class="flow-badge current">در جریان</span>' : ''}
              ${stage.state === 'done' ? `<span class="flow-badge done">${stage.key === 'done' ? 'انجام شد' : 'سپری شد'}</span>` : ''}
              ${stage.state === 'waiting' ? '<span class="flow-badge waiting">در انتظار</span>' : ''}
            </div>
            ${notesHtml}
            ${stage.key === 'created' ? '<div class="flow-uploads" id="flowUploads" style="display:none;"></div>' : ''}
            ${dateText ? `<p class="flow-date">${escapeHtml(dateText)}</p>` : ''}
          </div>
        </div>`;
    }).join('');

    const timelineEl = document.getElementById('detailTimeline');
    if (timelineEl) {
      timelineEl.innerHTML = flowHtml;
      /* نمودار درصدی بارگذاری هر عکس/فیلم، زیر گام «ثبت گزارش» */
      bindDetailUploads(r);
    }

    /* ── کارت وضعیت: همان چیزی که در ستون وضعیت پنل ادمین است ─────────── */
    const summaryEl = document.getElementById('detailStatusSummary');
    if (summaryEl) {
      const doneCount = flowStages.filter(x => x.state === 'done').length;
      const waiting = safeStatus !== 'done';
      summaryEl.innerHTML = `
        <div class="status-summary-box ${statusMeta.className}">
          <div class="status-summary-main">
            <span class="status-summary-icon">${waiting ? ICON('clock', 22) : ICON('check-circle', 22)}</span>
            <div>
              <p class="status-summary-label">وضعیت فعلی</p>
              <p class="status-summary-value">${escapeHtml(statusMeta.label)}</p>
            </div>
          </div>
          <div class="status-summary-side">
            <p class="status-summary-label">مراحل رسیدگی</p>
            <p class="status-summary-value">${toPersianDigits(doneCount)} از ${toPersianDigits(flowStages.length)}</p>
          </div>
        </div>`;
    }

    activeReportId = id;
    document.getElementById('detailIconBox').style.background = r.iconBg;
    document.getElementById('detailIconBox').innerHTML = window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon;
    document.getElementById('detailTitle').textContent = r.title;
    document.getElementById('detailDate').textContent = submitDateTime;
    const statusEl = document.getElementById('detailStatus');
    statusEl.className = 'report-status ' + statusMeta.className;
    statusEl.textContent = statusMeta.label;
    document.getElementById('detailCode').textContent = reportCodeLabel(r);
    document.getElementById('detailLocation').textContent = r.location;
    document.getElementById('detailDept').textContent = (r.department && r.subDepartment)
      ? (r.department + ' / ' + r.subDepartment) : '—';
    document.getElementById('detailDesc').textContent = r.desc;

    /* ── عکس‌ها و فیلم‌های ارسالی برای این گزارش ──────────────────────
       نمایش به‌صورت «گالری»: عکس‌های مربعی کوچک و مرتب (بدون به‌هم‌ریختگی
       صفحه)، فیلم‌ها با پیش‌نمایش و آیکن پخش، و با ضربه روی هر کدام، نمایش
       تمام‌صفحه (لایت‌باکس) باز می‌شود. */
    const mediaWrap = document.getElementById('detailMediaWrap');
    if (mediaWrap) {
      const mediaList = (Array.isArray(r.media) ? r.media : [])
        .filter(m => m && (m.url || m.previewUrl))
        .map(m => ({
          kind: m.kind === 'video' ? 'video' : 'image',
          url: mediaUrlOf(m.url || m.previewUrl || ''),
          name: m.name || '',
          size: m.size || 0,
          local: !!m.local
        }));

      if (!mediaList.length) {
        mediaWrap.style.display = 'none';
        mediaWrap.innerHTML = '';
        detailMediaList = [];
      } else {
        const images = mediaList.filter(m => m.kind === 'image');
        const videos = mediaList.filter(m => m.kind === 'video');
        detailMediaList = mediaList;
        mediaWrap.style.display = 'block';
        mediaWrap.innerHTML = `
          <div class="section-title" style="padding:0 4px;">
            ${translateText('تصاویر و فیلم‌های ارسالی')}
            <span class="media-count-chip">${toPersianDigits(mediaList.length)}</span>
          </div>
          <div class="glass-card media-card">
            ${images.length ? `
              <div class="media-strip">
                ${images.map((m, i) => `
                  <button type="button" class="media-tile" onclick="openReportMedia(${mediaList.indexOf(m)})">
                    <img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.name)}" loading="lazy"
                         onerror="this.parentNode.classList.add('media-tile-broken');">
                  </button>`).join('')}
              </div>` : ''}
            ${videos.length ? `
              <div class="media-video-grid">
                ${videos.map(m => `
                  <button type="button" class="media-video-card" onclick="openReportMedia(${mediaList.indexOf(m)})">
                    <video src="${escapeHtml(m.url)}" preload="metadata" playsinline muted></video>
                    <span class="media-play-badge">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                    </span>
                    <span class="media-video-meta">${escapeHtml(formatFileSize(m.size || 0))}</span>
                  </button>`).join('')}
              </div>` : ''}
            ${mediaList.some(m => m.local) ? `
              <p class="media-note">${window.EplakIcons ? window.EplakIcons.get('lock', { size: 13 }) : ''} چند پیوست هنوز فقط روی گوشی شما ذخیره شده است؛ با وصل بودن اینترنت، خودکار به سرور می‌رود.</p>` : ''}
            <p class="media-hint">برای دیدن اندازه‌ی کامل، روی عکس یا فیلم بزنید.</p>
          </div>`;
      }
    }

    const replyWrap = document.getElementById('detailReplyWrap');
    if (replyWrap) {
      if (replyText) {
        replyWrap.style.display = 'block';
        replyWrap.innerHTML = `
          <div style="text-align:right;">
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">${translateText('پاسخ مدیریت')}</p>
            <p style="font-size:13px; line-height:1.8; color:var(--text-primary);">${escapeHtml(replyText)}</p>
          </div>
        `;
      } else {
        replyWrap.style.display = 'none';
        replyWrap.innerHTML = '';
      }
    }

    showScreen('screen-report-detail');
  }


  /* ═══════════════════════════════════════════════════════════
     گالری عکس و فیلم گزارش (نمایش تمام‌صفحه / لایت‌باکس)
     -----------------------------------------------------------
     کاربر با ضربه روی هر عکس یا فیلم، آن را بزرگ و تمام‌صفحه می‌بیند؛
     با دکمه‌ی «بستن» یا ضربه روی پس‌زمینه برمی‌گردد و می‌تواند بین
     پیوست‌ها جلو/عقب برود.
  ═══════════════════════════════════════════════════════════ */
  let detailMediaList = [];
  let mediaViewerIndex = 0;

  function ensureMediaViewer() {
    let box = document.getElementById('reportMediaViewer');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'reportMediaViewer';
    box.className = 'media-viewer';
    box.innerHTML = `
      <button type="button" class="media-viewer-close" onclick="closeReportMedia()" aria-label="بستن">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </button>
      <button type="button" class="media-viewer-nav prev" onclick="stepReportMedia(-1)" aria-label="قبلی">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,5 8,12 15,19"/></svg>
      </button>
      <button type="button" class="media-viewer-nav next" onclick="stepReportMedia(1)" aria-label="بعدی">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,5 16,12 9,19"/></svg>
      </button>
      <div class="media-viewer-stage" id="reportMediaStage"></div>
      <div class="media-viewer-foot" id="reportMediaFoot"></div>`;
    box.addEventListener('click', function (ev) {
      /* ضربه روی پس‌زمینه (نه روی خود عکس/فیلم) = بستن */
      if (ev.target === box || (ev.target && ev.target.className === 'media-viewer-stage')) {
        closeReportMedia();
      }
    });
    document.body.appendChild(box);
    return box;
  }

  function renderMediaViewer() {
    const box = ensureMediaViewer();
    const stage = document.getElementById('reportMediaStage');
    const foot = document.getElementById('reportMediaFoot');
    const item = detailMediaList[mediaViewerIndex];
    if (!item || !stage) return;
    stage.innerHTML = (item.kind === 'video')
      ? `<video src="${escapeHtml(item.url)}" controls autoplay playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">`;
    if (foot) {
      const counter = toPersianDigits(mediaViewerIndex + 1) + ' از ' + toPersianDigits(detailMediaList.length);
      const meta = (item.kind === 'video' ? 'فیلم' : 'عکس')
        + (item.size ? ' • ' + formatFileSize(item.size) : '');
      foot.textContent = counter + ' — ' + meta;
    }
    const prev = box.querySelector('.media-viewer-nav.prev');
    const next = box.querySelector('.media-viewer-nav.next');
    const many = detailMediaList.length > 1;
    if (prev) prev.style.display = many ? 'flex' : 'none';
    if (next) next.style.display = many ? 'flex' : 'none';
  }

  let mediaViewerOpen = false;

  function openReportMedia(index) {
    if (!Array.isArray(detailMediaList) || !detailMediaList.length) return;
    mediaViewerIndex = Math.max(0, Math.min(detailMediaList.length - 1, Number(index) || 0));
    mediaViewerOpen = true;
    const box = ensureMediaViewer();
    box.classList.add('open');
    document.body.classList.add('media-viewer-locked');
    renderMediaViewer();
  }
  window.openReportMedia = openReportMedia;

  function closeReportMedia() {
    const box = document.getElementById('reportMediaViewer');
    if (!box) return;
    box.classList.remove('open');
    document.body.classList.remove('media-viewer-locked');
    const stage = document.getElementById('reportMediaStage');
    if (stage) stage.innerHTML = '';   /* پخش فیلم قطع می‌شود */
    mediaViewerOpen = false;
  }
  window.closeReportMedia = closeReportMedia;

  function stepReportMedia(delta) {
    if (!mediaViewerOpen || detailMediaList.length < 2) return;
    mediaViewerIndex = (mediaViewerIndex + delta + detailMediaList.length) % detailMediaList.length;
    renderMediaViewer();
  }
  window.stepReportMedia = stepReportMedia;

  /* با دکمه‌ی بازگشت گوشی، اول گالری بسته شود (نه صفحه) */
  document.addEventListener('keydown', function (ev) {
    if (!mediaViewerOpen) return;
    if (ev.key === 'Escape') closeReportMedia();
    else if (ev.key === 'ArrowLeft') stepReportMedia(1);
    else if (ev.key === 'ArrowRight') stepReportMedia(-1);
  });

  /* =========================================================
     Track Request
  ========================================================= */
  function getTrackingInputElement() {
    const primary = document.getElementById('trackCodeInput');
    if (primary) return primary;
    const profileInput = document.getElementById('profileTrackCodeInput');
    if (profileInput) return profileInput;
    return document.getElementById('homeTrackCodeInput');
  }

  function getTrackingResultBox() {
    const primary = document.getElementById('trackResultBox');
    if (primary) return primary;
    const profileBox = document.getElementById('profileTrackResultBox');
    if (profileBox) return profileBox;
    return document.getElementById('homeTrackResultBox');
  }

  function renderProfileReportsSummary(options = {}) {
    const wrap = document.getElementById('profileReportsList');
    if (!wrap) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');

      if (!reports.length) {
        const msg = isEn ? 'No reports submitted yet.' : 'هنوز گزارشی ثبت نشده است.';
        wrap.innerHTML = `<div style="padding:14px 0; color:var(--text-muted); font-size:13px; text-align:center;">${msg}</div>`;
        return;
      }

      wrap.innerHTML = reports.slice(0, 3).map(r => {
        const statusMeta = getStatusMeta(r.status);
        return `
          <div class="report-item" onclick="openReportDetail('${r.id}')">
            <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
            <div class="report-info">
              <h4>${escapeHtml(r.title)}</h4>
              <p>${escapeHtml(reportCodeLabel(r))}${r.timelineCount ? ` • ${toPersianDigits(r.timelineCount)} گام رسیدگی` : ''}</p>
            </div>
            <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
          </div>
        `;
      }).join('');
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function renderHomeReportsSummary() {
    return renderProfileReportsSummary();
  }

  function renderReportListCards(items, box) {
    if (!box) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    if (!Array.isArray(items) || !items.length) {
      const msg = isEn ? 'No reports to display at the moment.' : 'در حال حاضر گزارشی برای نمایش وجود ندارد.';
      box.innerHTML = `<div style="padding:12px 0; color:var(--text-muted); font-size:12.5px; text-align:center;">${msg}</div>`;
      return;
    }

    box.innerHTML = items.map(r => {
      const statusMeta = getStatusMeta(r.status);
      return `
        <div class="report-item" onclick="openReportDetail('${r.id}')">
          <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
          <div class="report-info">
            <h4>${escapeHtml(r.title)}</h4>
            <p>${escapeHtml(reportCodeLabel(r))}</p>
          </div>
          <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
        </div>
      `;
    }).join('');
  }

  function renderProfileTrackingQuick(options = {}) {
    const box = document.getElementById('profileTrackResultBox');
    if (!box) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');

      const input = document.getElementById('profileTrackCodeInput');
      if (!input || !input.value.trim()) {
        renderReportListCards(reports, box);
        return;
      }

      const code = input.value.trim();
      if (!code) return;
      const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
      const found = reports.find(r => {
        const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
        const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
        return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
      });
      if (!found) {
        const notFoundMsg = isEn ? 'No report found with this tracking code' : 'گزارشی با این کد پیگیری یافت نشد';
        box.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted);">${notFoundMsg}</div>`;
        return;
      }
      renderReportListCards([found], box);
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function renderHomeTrackingQuick() {
    return renderProfileTrackingQuick();
  }

    /* =========================================================
     Request & Ticket Tracking (پیگیری درخواست‌ها و تیکت‌ها)
  ========================================================= */
  let activeTrackFilter = 'all';

  function filterTrackList(filter, btnEl) {
    activeTrackFilter = filter;
    document.querySelectorAll('#trackFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderTrackRecent({ skipBackend: true });
  }

  function renderTrackRecent(options = {}) {
    const wrap = document.getElementById('trackRecentList');
    const resultBox = getTrackingResultBox();
    if (!wrap) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');
      const noItemsMsg = isEn ? 'No requests or tickets to display.' : 'در حال حاضر گزارش یا تیکتی برای پیگیری وجود ندارد.';

      let items = [];

      if (activeTrackFilter === 'all' || activeTrackFilter === 'reports') {
        reports.forEach(r => {
          items.push({
            type: 'report',
            id: r.id,
            code: r.code || '—',
            title: r.title,
            sub: r.location ? `${r.location} • ${r.dateTime || r.date || '—'}` : (r.dateTime || r.date || '—'),
            status: r.status,
            created_at: r.rawDate || r.created_at || r.date || '',
            dateTime: r.dateTime || r.date || '—',
            icon: r.icon,
            iconBg: r.iconBg,
            raw: r
          });
        });
      }

      if (activeTrackFilter === 'all' || activeTrackFilter === 'tickets') {
        tickets.forEach(t => {
          items.push({
            type: 'ticket',
            id: t.id,
            code: t.code || '—',
            title: t.title,
            sub: `${t.department || 'پشتیبانی شهرداری'} • ${t.dateTime || formatReportDateTime(t.created_at)}`,
            status: t.status,
            reply: t.reply,
            created_at: t.created_at || '',
            dateTime: t.dateTime || formatReportDateTime(t.created_at),
            icon: 'ticket',
            iconBg: 'rgba(0,201,167,0.18)',
            raw: t
          });
        });
      }

      // مرتب‌سازی بر اساس تازه‌ترین تاریخ و ساعت
      items.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime() || 0;
        const timeB = new Date(b.created_at).getTime() || 0;
        return timeB - timeA;
      });

      if (!items.length) {
        wrap.innerHTML = `<div style="padding:22px 0; color:var(--text-muted); font-size:13px; text-align:center;">${noItemsMsg}</div>`;
        return;
      }

      wrap.innerHTML = items.map(item => {
        const isTicket = item.type === 'ticket';
        const hasReply = !!(isTicket && item.reply && item.reply.trim());
        let statusMeta = getStatusMeta(item.status);
        let statusLabel = statusMeta.label;
        if (isTicket) {
          if (hasReply) {
            statusLabel = 'پاسخ داده شده';
          } else if (item.status === 'pending') {
            statusLabel = 'در حال انتظار';
          }
        }

        const typeBadge = isTicket
          ? `<span style="font-size:10.5px; font-weight:800; background:rgba(0,201,167,0.15); color:var(--teal); padding:2px 7px; border-radius:8px;">🎫 تیکت</span>`
          : `<span style="font-size:10.5px; font-weight:800; background:rgba(59,130,246,0.15); color:#3b82f6; padding:2px 7px; border-radius:8px;">📋 گزارش</span>`;

        const onClickCall = isTicket ? `openTicketDetail('${item.id}')` : `openReportDetail('${item.id}')`;
        const hasReplyBadge = hasReply
          ? `<span style="font-size:10.5px; font-weight:700; color:#10b981; background:rgba(16,185,129,0.12); padding:2px 6px; border-radius:6px;">پاسخ شهرداری</span>`
          : '';

        return `
          <div class="report-item track-item-card" onclick="${onClickCall}" style="align-items:flex-start; padding:13px 14px;">
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; flex-shrink:0;">
              <span class="report-status ${statusMeta.className}">${statusLabel}</span>
              ${hasReplyBadge}
            </div>
            <div class="report-info" style="flex:1; text-align:right;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; justify-content:flex-end;">
                ${typeBadge}
                <span style="font-size:11px; font-weight:700; color:var(--teal); direction:ltr; font-family:monospace;">${escapeHtml(item.code)}</span>
              </div>
              <h4 style="font-size:13.5px; font-weight:800; margin:0 0 4px; color:var(--text-primary); line-height:1.5;">${escapeHtml(item.title)}</h4>
              <p style="font-size:11px; color:var(--text-muted); margin:0;">${escapeHtml(item.sub)}</p>
            </div>
            <div class="report-icon-box" style="background:${item.iconBg}; align-self:center; font-size:18px;">
              ${window.EplakIcons ? window.EplakIcons.get(isTicket ? 'ticket' : item.icon) : (isTicket ? '🎫' : item.icon)}
            </div>
          </div>
        `;
      }).join('');
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      Promise.all([
        loadReportsFromBackend(phone, { silent: true }),
        loadTicketsFromBackend(phone, { silent: true })
      ]).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function searchByTrackCode() {
    const input = getTrackingInputElement();
    const resultBox = getTrackingResultBox();
    const code = (input ? input.value.trim() : '');

    // واژه کلیدی مستقیم برای ورود به پنل ادمین
    const lowerCode = code.toLowerCase();
    if (lowerCode === 'admin' || lowerCode === 'panel' || lowerCode === 'modir' || code === 'مدیر') {
      window.location.href = '/admin';
      return;
    }

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    if (!code) {
      renderTrackRecent({ skipBackend: true });
      if (resultBox) resultBox.innerHTML = '';
      return;
    }

    const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
    
    // ۱. جستجو در تیکت‌ها
    const foundTicket = tickets.find(t => {
      const tCode = String(t.code || '').toLowerCase().replace(/\s+/g, '');
      const tTitle = String(t.title || '').toLowerCase().replace(/\s+/g, '');
      return tCode === normalizedCode || tTitle.includes(normalizedCode);
    });
    if (foundTicket) {
      openTicketDetail(foundTicket.id);
      return;
    }

    // ۲. جستجو در گزارش‌ها
    const foundReport = reports.find(r => {
      const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
      const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
      return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
    });

    if (foundReport) {
      openReportDetail(foundReport.id);
      return;
    }

    const phone = getCurrentPhone();
    if (phone) {
      Promise.all([
        loadReportsFromBackend(phone, { silent: true }),
        loadTicketsFromBackend(phone, { silent: true })
      ]).then(() => {
        const foundTicketAfter = tickets.find(t => {
          const tCode = String(t.code || '').toLowerCase().replace(/\s+/g, '');
          const tTitle = String(t.title || '').toLowerCase().replace(/\s+/g, '');
          return tCode === normalizedCode || tTitle.includes(normalizedCode);
        });
        if (foundTicketAfter) {
          openTicketDetail(foundTicketAfter.id);
          return;
        }

        const foundReportAfter = reports.find(r => {
          const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
          const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
          return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
        });
        if (foundReportAfter) {
          openReportDetail(foundReportAfter.id);
          return;
        }

        if (resultBox) {
          const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
          resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
        }
      }).catch(() => {
        if (resultBox) {
          const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
          resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
        }
      });
    } else {
      if (resultBox) {
        const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
        resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
      }
    }
  }


    /* =========================================================
     Ticket System (ثبت تیکت، مدیریت، تفکیک تب‌ها و حذف تیکت)
  ========================================================= */
  let tickets = [];
  window.tickets = tickets;
  let activeTicketId = null;
  window.activeTicketId = activeTicketId;
  let activeTicketFilter = 'all';
  let activeReportsMainTab = 'reports';

  function switchReportsMainTab(section, btnEl) {
    activeReportsMainTab = section;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const indicator = document.getElementById('reportsSwitcherIndicator');
    const btns = document.querySelectorAll('#reportsMainSwitcher .reports-switcher-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (btnEl) {
      btnEl.classList.add('active');
    } else {
      const activeBtn = document.getElementById(section === 'tickets' ? 'tabBtnTickets' : 'tabBtnReports');
      if (activeBtn) activeBtn.classList.add('active');
    }

    if (indicator) {
      if (section === 'tickets') {
        indicator.style.transform = isEn ? 'translateX(100%)' : 'translateX(-100%)';
      } else {
        indicator.style.transform = 'translateX(0)';
      }
    }

    const paneReports = document.getElementById('sectionReportsPane');
    const paneTickets = document.getElementById('sectionTicketsPane');

    if (section === 'tickets') {
      if (paneReports) paneReports.style.display = 'none';
      if (paneTickets) {
        paneTickets.style.display = 'flex';
        renderUserTicketsList(activeTicketFilter);
      }
    } else {
      if (paneTickets) paneTickets.style.display = 'none';
      if (paneReports) {
        paneReports.style.display = 'flex';
        renderReportsList('all');
      }
    }
  }

    function filterUserTickets(filter, btnEl) {
    activeTicketFilter = filter;
    document.querySelectorAll('#ticketsFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderUserTicketsList(filter);
  }

  function renderUserTicketsList(filter = activeTicketFilter) {
    const wrap = document.getElementById('userTicketsListWrap');
    if (!wrap) return;

    const countBadge = document.getElementById('userTicketsCountBadge');
    if (countBadge) countBadge.textContent = toPersianDigits(tickets.length);
    const repBadge = document.getElementById('reportsCountBadge');
    if (repBadge) repBadge.textContent = toPersianDigits(reports.length);

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const deleteWord = isEn ? 'Delete' : 'حذف';
    const emptyMsg = isEn ? 'No tickets found in this category' : 'تیکتی در این دسته یافت نشد';

    let filtered = tickets;
    if (filter === 'pending') {
      filtered = tickets.filter(t => (!t.reply || !t.reply.trim()) && (t.status === 'pending' || !t.status));
    } else if (filter === 'done' || filter === 'answered') {
      filtered = tickets.filter(t => (t.reply && t.reply.trim()) || t.status === 'done' || t.status === 'answered');
    } else if (filter === 'review' || filter === 'in_progress') {
      filtered = tickets.filter(t => t.status === 'in_progress' || t.status === 'review');
    }

    if (filtered.length === 0) {
      wrap.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">${emptyMsg}</div>`;
      return;
    }

    wrap.innerHTML = filtered.map(t => {
      const hasReply = !!(t.reply && t.reply.trim());
      let statusMeta = getStatusMeta(t.status);
      let statusLabel = statusMeta.label;
      if (hasReply) {
        statusLabel = isEn ? 'Answered' : 'پاسخ داده شده';
      } else if (t.status === 'pending') {
        statusLabel = isEn ? 'Waiting' : 'در حال انتظار';
      } else if (t.status === 'in_progress' || t.status === 'review') {
        statusLabel = isEn ? 'In Progress' : 'در حال رسیدگی';
      }
      const displayDate = t.dateTime || formatReportDateTime(t.created_at);

      return `
        <div class="report-swipe">
          <div class="report-delete-bg" onpointerdown="event.stopPropagation()" onclick="confirmDeleteTicket('${t.id}', event)">
            <div class="delete-action" style="color:#ef4444;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6 L19,20 a2,2 0 0 1 -2,2 H7 a2,2 0 0 1 -2,-2 L5,6"/><path d="M8,6 V4 a2,2 0 0 1 2,-2 h4 a2,2 0 0 1 2,2 v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              <span style="color:#ef4444; font-weight:800;">${deleteWord}</span>
            </div>
          </div>
          <div class="report-swipe-item" onclick="openTicketDetail('${t.id}')">
            <div class="report-item">
              <span class="report-status ${statusMeta.className}">${statusLabel}</span>
              <div class="report-info">
                <h4>${escapeHtml(t.title)}</h4>
                <p>${escapeHtml(t.department || 'پشتیبانی شهرداری')} - ${displayDate}${hasReply ? ' <span style="color:#10b981; font-weight:700;">(پاسخ شهرداری)</span>' : ''}</p>
              </div>
              <div class="report-icon-box" style="background:rgba(0,201,167,0.16); color:var(--teal);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20M2 14.5h20"/></svg>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    initReportSwipe();
  }

  function openTicketDetail(id) {
    const t = tickets.find(x => String(x.id) === String(id) || String(x.code) === String(id));
    if (!t) return;
    activeTicketId = t.id;

    const statusMeta = getStatusMeta(t.status);
    const priorityLabels = {
      low: 'پایین',
      medium: 'متوسط',
      high: 'بالا',
      critical: 'بحرانی'
    };

    const titleEl = document.getElementById('ticketDetailTitle');
    const statusEl = document.getElementById('ticketDetailStatus');
    const codeEl = document.getElementById('ticketDetailCode');
    const dateEl = document.getElementById('ticketDetailDate');
    const deptEl = document.getElementById('ticketDetailDept');
    const prioEl = document.getElementById('ticketDetailPriority');
    const descEl = document.getElementById('ticketDetailDesc');
    const replyCard = document.getElementById('ticketDetailReplyCard');
    const replyEl = document.getElementById('ticketDetailReply');

    if (titleEl) titleEl.textContent = t.title || 'بدون عنوان';
    if (statusEl) {
      statusEl.className = 'report-status ' + statusMeta.className;
      statusEl.textContent = (t.reply && t.reply.trim()) ? 'پاسخ داده شده' : statusMeta.label;
    }
    if (codeEl) codeEl.textContent = t.code || '—';
    if (dateEl) dateEl.textContent = t.dateTime || formatReportDateTime(t.created_at);
    if (deptEl) deptEl.textContent = t.department || 'پشتیبانی شهرداری';
    if (prioEl) prioEl.textContent = priorityLabels[t.priority] || 'متوسط';
    if (descEl) descEl.textContent = t.description || '—';

    if (replyCard && replyEl) {
      if (t.reply && t.reply.trim()) {
        replyEl.textContent = t.reply;
        replyCard.style.display = 'flex';
      } else {
        replyCard.style.display = 'none';
        replyEl.textContent = '';
      }
    }

    showScreen('screen-ticket-detail');
  }

  /* =========================================================
     Ticket Deletion Logic (حذف تیکت همراه با تایید و هماهنگی سرور)
  ========================================================= */
  function deleteCurrentOpenTicket() {
    if (!activeTicketId) return;
    confirmDeleteTicket(activeTicketId, null, true);
  }

  function confirmDeleteTicket(id, e, isFromDetail = false) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    const targetId = String(id || activeTicketId || '').trim();
    if (!targetId) return;

    const t = tickets.find(x => String(x.id).trim() === targetId || String(x.code).trim() === targetId);
    const title = t ? t.title : 'این تیکت';

    if (window.confirm(`آیا از حذف تیکت «${title}» اطمینان دارید؟`)) {
      deleteTicketById(targetId);
      if (isFromDetail && typeof goBack === 'function') {
        goBack();
      }
    }
  }

  async function deleteTicketById(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return;

    const idx = tickets.findIndex(t => String(t.id).trim() === targetId || String(t.code).trim() === targetId);
    if (idx === -1) return;

    const removedTicket = tickets[idx];
    const backendId = getReportBackendId(removedTicket);
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';

    if (backendId !== null) {
      pendingTicketDeleteIds.add(String(backendId));
      savePendingTicketDeletes();
    }

    tickets.splice(idx, 1);
    if (activeTicketId === removedTicket.id) activeTicketId = null;
    saveTickets(phone);

    // ارسال به بک‌اند جهت حذف قطعی از دیتابیس (با اعتبارسنجی مالکیت)
    if (phone && backendId !== null) {
      try {
        await requestTicketBackendDelete(backendId, phone);
        pendingTicketDeleteIds.delete(String(backendId));
        savePendingTicketDeletes();
      } catch (err) {
        console.warn('[tickets] backend delete deferred:', err && err.message ? err.message : err);
      }
    }

    renderUserTicketsList(activeTicketFilter);
    if (typeof renderTrackRecent === 'function') {
      renderTrackRecent({ skipBackend: true });
    }
    if (typeof showToast === 'function') {
      showToast('تیکت با موفقیت حذف شد');
    }
  }

  // مقداردهی اولیه تیکت‌ها از حافظه محلی
  /* در نسخه‌های قبلی این تابع فراخوانی می‌شد ولی هیچ‌جا تعریف نشده بود؛
     ReferenceError حاصل، اجرای بقیهٔ این فایل (تمام window.* exportها از جمله
     window.tickets، renderTrackRecent و searchByTrackCode) را از کار می‌انداخت. */
  /* کلید ذخیره‌ی تیکت‌ها به‌ازای هر شماره جداست تا کاربران مختلف روی یک
     دستگاه تیکت‌های یکدیگر را نبینند (قبلاً یک کلید مشترک بود). */
  function ticketsStorageKey(phone) {
    const p = phone || ((typeof getCurrentPhone === 'function') ? getCurrentPhone() : '');
    return p ? ('eplak_tickets_' + p) : '';
  }
  function loadSavedTickets(phone) {
    try {
      const key = ticketsStorageKey(phone);
      if (!key || !window.localStorage) return;
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && Array.isArray(tickets)) {
        tickets.length = 0;
        saved.forEach(t => { if (t && t.id) tickets.push(t); });
      }
    } catch (e) { /* حافظه محلی در دسترس نیست — نادیده بگیر */ }
  }
  window.loadSavedTickets = loadSavedTickets;
  window.clearTicketsInMemory = function () { if (Array.isArray(tickets)) tickets.length = 0; };
  /* دکمه «+ ثبت تیکت جدید» در تب تیکت‌ها — در نسخه‌های قبلی تعریف نشده بود و دکمه مرده بود */
  function startNewTicket() {
    if (typeof showScreen === 'function') showScreen('screen-ticket-new');
  }
  /* شمارندهٔ کاراکترهای متن تیکت (ticketCharCount = 0/800) — قبلاً تعریف نشده بود */
  function updateTicketCount(el) {
    try {
      const counter = document.getElementById('ticketCharCount');
      if (counter && el) counter.textContent = String(el.value.length) + '/800';
    } catch (e) { /* ignore */ }
  }

  /* ── همگام‌سازی تیکت‌ها با سرور (قبلاً export می‌شد ولی تعریف نداشت) ── */
  function mapTicketRow(item) {
    const created = item.created_at || item.createdAt || '';
    return {
      id: String(item.id),
      backendId: item.id,
      code: item.code || ('TK-1403-' + String(Number(item.id) + 1000).padStart(4, '0')),
      title: item.title || 'تیکت',
      description: item.description || '',
      category: item.category || '',
      department: item.department || '',
      priority: item.priority || 'medium',
      status: normalizeStatusValue(item.status || 'pending'),
      reply: item.reply || '',
      user_phone: item.user_phone || '',
      created_at: created,
      dateTime: formatReportDateTime(created)
    };
  }

  /* حذف‌های ناتمام تیکت‌ها (همان سازوکار گزارش‌ها) */
  const pendingTicketDeleteIds = new Set();
  const PENDING_TICKET_DELETE_KEY = 'eplak_pending_ticket_deletes';
  let ticketsSyncInFlight = null;
  try {
    const raw = window.localStorage ? window.localStorage.getItem(PENDING_TICKET_DELETE_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(id => pendingTicketDeleteIds.add(String(id)));
  } catch (e) { /* ignore */ }
  function savePendingTicketDeletes() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(PENDING_TICKET_DELETE_KEY, JSON.stringify(Array.from(pendingTicketDeleteIds)));
      }
    } catch (e) { /* ignore */ }
  }
  async function requestTicketBackendDelete(backendId, phone) {
    const response = await fetch(`${apiBase()}/tickets.php?action=delete&id=${encodeURIComponent(backendId)}&phone=${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: backendId, phone })
    });
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (response.status === 404) return true;
    if (!response.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `delete failed (${response.status})`);
    }
    return true;
  }
  async function flushPendingTicketDeletes(phone) {
    if (!phone || !pendingTicketDeleteIds.size) return;
    for (const id of Array.from(pendingTicketDeleteIds)) {
      try {
        await requestTicketBackendDelete(id, phone);
        pendingTicketDeleteIds.delete(id);
      } catch (e) { /* retry next time */ }
    }
    savePendingTicketDeletes();
  }

  async function loadTicketsFromBackend(phone = getCurrentPhone(), options = {}) {
    const { silent = false } = options;
    if (!phone) return [];
    if (ticketsSyncInFlight) return ticketsSyncInFlight;
    ticketsSyncInFlight = (async () => {
    try {
      await flushPendingTicketDeletes(phone);
      const response = await fetch(`${apiBase()}/tickets.php?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('tickets fetch failed');
      const data = await response.json();
      const rows = (Array.isArray(data?.tickets) ? data.tickets : [])
        .filter(item => !pendingTicketDeleteIds.has(String(item.id)));
      const mapped = rows.map(mapTicketRow);
      tickets.length = 0;
      mapped.forEach(t => tickets.push(t));
      if (typeof saveTickets === 'function') saveTickets(phone);
      return tickets;
    } catch (error) {
      if (!silent) console.warn('[tickets] backend sync failed', error);
      return tickets;
    } finally {
      ticketsSyncInFlight = null;
    }
    })();
    return ticketsSyncInFlight;
  }

  /* ── ثبت تیکت جدید از فرم «ثبت تیکت جدید» (قبلاً دکمه بدون عملکرد بود) ── */
  async function submitNewTicket() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const toast = (m) => { if (typeof showToast === 'function') showToast(m); };

    const titleEl = document.getElementById('ticketTitleInput');
    const descEl = document.getElementById('ticketDescInput');
    const deptEl = document.getElementById('ticketDeptSelect');
    const prioEl = document.getElementById('ticketPrioritySelect');

    const title = titleEl ? titleEl.value.trim() : '';
    const description = descEl ? descEl.value.trim() : '';
    const department = deptEl ? (deptEl.value || '').trim() : '';
    const priority = prioEl ? (prioEl.value || 'medium').trim() : 'medium';

    if (!title) { toast(isEn ? 'Please enter the ticket title' : 'لطفاً عنوان تیکت را وارد فرمایید'); return; }
    if (!description) { toast(isEn ? 'Please enter the ticket text' : 'لطفاً متن تیکت را وارد فرمایید'); return; }

    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    if (!phone) { toast(isEn ? 'Please login first' : 'برای ثبت تیکت ابتدا وارد حساب خود شوید'); return; }


    const btnBusy = (isEn ? 'Sending…' : 'در حال ارسال…');
    const sendBtn = document.querySelector('#screen-ticket-new .btn-teal span');
    const sendBtnHtml = sendBtn ? sendBtn.textContent : '';
    if (sendBtn) sendBtn.textContent = btnBusy;

    try {
      const response = await fetch(`${apiBase()}/tickets.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: phone,
          name: (window.currentUserName || (window.authUser && window.authUser.name) || ''),
          title: title,
          description: description,
          category: 'درخواست اداری',
          department: department,
          priority: priority,
          status: 'pending'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'ticket submit failed');

      const t = mapTicketRow(data.ticket || { ...data, title, description, department, priority, status: 'pending' });
      tickets.unshift(t);
      if (typeof saveTickets === 'function') saveTickets(phone);
      if (typeof renderUserTicketsList === 'function') renderUserTicketsList(activeTicketFilter);
      if (typeof renderTrackRecent === 'function') renderTrackRecent({ skipBackend: true });

      const codeElem = document.getElementById('successTicketCode');
      if (codeElem) codeElem.textContent = t.code;

      if (titleEl) titleEl.value = '';
      if (descEl) { descEl.value = ''; updateTicketCount(descEl); }

      if (window.soundManager && typeof window.soundManager.playDing === 'function') window.soundManager.playDing();
      showScreen('screen-ticket-success');
    } catch (err) {
      console.warn('[tickets] submit failed', err);
      toast(isEn ? 'Ticket submission failed. Please try again' : 'ثبت تیکت ناموفق بود — دوباره تلاش کنید');
    } finally {
      if (sendBtn) sendBtn.textContent = sendBtnHtml;
    }
  }
  /* جفت ذخیره‌سازی محلی — services.js (فرم ملاقات با شهردار) صدایش می‌زند */
  function saveTickets(phone) {
    try {
      const key = ticketsStorageKey(phone);
      if (key && window.localStorage && Array.isArray(tickets)) {
        window.localStorage.setItem(key, JSON.stringify(tickets.slice(0, 50)));
      }
    } catch (e) { /* ignore */ }
  }
  loadSavedTickets();

  // Window exports
  window.switchReportsMainTab = switchReportsMainTab;
  window.filterUserTickets = filterUserTickets;
  window.confirmDeleteTicket = confirmDeleteTicket;
  window.deleteCurrentOpenTicket = deleteCurrentOpenTicket;
  window.deleteTicketById = deleteTicketById;
  window.filterTrackList = filterTrackList;
  window.startNewTicket = startNewTicket;
  window.updateTicketCount = updateTicketCount;
  window.submitNewTicket = submitNewTicket;
  window.loadTicketsFromBackend = loadTicketsFromBackend;
  window.renderUserTicketsList = renderUserTicketsList;
  window.openTicketDetail = openTicketDetail;
  window.tickets = tickets;

  window.submitNewReport = submitNewReport;
  window.renderReportsList = renderReportsList;
  window.filterReports = filterReports;
  window.openReportDetail = openReportDetail;
  window.renderProfileReportsSummary = renderProfileReportsSummary;
  window.renderHomeReportsSummary = renderHomeReportsSummary;
  window.renderProfileTrackingQuick = renderProfileTrackingQuick;
  window.renderHomeTrackingQuick = renderHomeTrackingQuick;
  window.renderTrackRecent = renderTrackRecent;
  window.searchByTrackCode = searchByTrackCode;

  /* دوربین داخل اپ + تلاش دوباره‌ی پیوست‌ها (دور ۲۵) */
  window.openReportCamera = openReportCamera;
  window.addCapturedFiles = addCapturedFiles;
  window.prepareCapturedFiles = prepareCapturedFiles;
  window.retryReportWithMedia = retryReportWithMedia;
  window.offerMediaReattach = offerMediaReattach;
  window.eplakCameraLog = function (text) {
    try {
      saveUploadLog({ time: (new Date()).toLocaleString('fa-IR'), text: 'دوربین — ' + String(text || '') });
    } catch (e) { /* بی‌اهمیت */ }
  };


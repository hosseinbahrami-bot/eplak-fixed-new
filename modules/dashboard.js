/* modules/dashboard.js — پیشخوان: اخبار، پرداخت عوارض، نقشه شهر و اعلان‌ها */
/* استخراج‌شده عیناً از فایل اصلی app_01.html بدون تغییر منطق */

  /* =========================================================
     تبدیل تاریخ میلادی به شمسی (الگوریتم جلالی)
  ========================================================= */
  function toJalali(gy, gm, gd) {
    const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    let gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100))
             + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    let jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }

  const JALALI_MONTHS = [
    'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
    'مهر','آبان','آذر','دی','بهمن','اسفند'
  ];
  const JALALI_WEEKDAYS = ['یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
  /* تقویمِ اپ در هر دو زبان شمسی است؛ در رابط انگلیسی نام ماه‌های شمسی به
     انگلیسی و رقم‌ها لاتین نوشته می‌شوند (نه تاریخ میلادی). */
  const JALALI_MONTHS_EN = [
    'Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar',
    'Mehr','Aban','Azar','Dey','Bahman','Esfand'
  ];
  const JALALI_WEEKDAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function getJalaliDateStr(date) {
    const [jy, jm, jd] = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const weekday = JALALI_WEEKDAYS[date.getDay()];
    const short = toPersianDigits(jy) + '/' + toPersianDigits(String(jm).padStart(2,'0')) + '/' + toPersianDigits(String(jd).padStart(2,'0'));
    const full  = toPersianDigits(jd) + ' ' + JALALI_MONTHS[jm - 1] + ' ' + toPersianDigits(jy);
    const shortEn = jy + '/' + String(jm).padStart(2,'0') + '/' + String(jd).padStart(2,'0');
    const fullEn  = jd + ' ' + JALALI_MONTHS_EN[jm - 1] + ' ' + jy;
    return { short, full, weekday, shortEn, fullEn, weekdayEn: JALALI_WEEKDAYS_EN[date.getDay()] };
  }

  /* ساعت زنده — هر ثانیه به‌روز می‌شود */
  let _dashClockTimer = null;
  function startDashClock() {
    if (_dashClockTimer) clearInterval(_dashClockTimer);
    const EN_WEEKDAYS = JALALI_WEEKDAYS_EN;   /* نام روزها انگلیسی، تقویم شمسی */

    function tick() {
      const now  = (typeof window.eplakNow === 'function' ? window.eplakNow() : new Date());
      const hh   = String(now.getHours()).padStart(2, '0');
      const mm   = String(now.getMinutes()).padStart(2, '0');
      const ss   = String(now.getSeconds()).padStart(2, '0');
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');

      const clkEl = document.getElementById('dashLiveClock');
      if (clkEl) {
        if (isEn) {
          clkEl.innerHTML = hh + ':' + mm + '<span class="dash-clock-secs" id="dashClockSecs">:' + ss + '</span>';
        } else {
          clkEl.innerHTML = toPersianDigits(hh) + ':' + toPersianDigits(mm) +
            '<span class="dash-clock-secs" id="dashClockSecs">:' + toPersianDigits(ss) + '</span>';
        }
      }

      const fullEl = document.getElementById('dashFullDate');
      const wdEl = document.getElementById('dashWeekDay');

      const jalali = getJalaliDateStr(now);
      if (isEn) {
        if (fullEl) fullEl.textContent = jalali.fullEn;
        if (wdEl) wdEl.textContent = jalali.weekdayEn;
      } else {
        if (fullEl) fullEl.textContent = jalali.full;
        if (wdEl) wdEl.textContent = jalali.weekday;
      }
    }
    tick();
    _dashClockTimer = setInterval(tick, 1000);
  }

  /* =========================================================
     Personal Dashboard (تب پیشخوان در نوار پایین)
  ========================================================= */
  function renderDashboard() {
    /* راه‌اندازی ساعت زنده */
    startDashClock();

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const pendingCount = reports.filter(r => r.status === 'pending').length;
    const doneCount = reports.filter(r => r.status === 'done').length;
    const debt = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    const unreadCount = notifications.filter(n => !n.read).length;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('dashPendingCount', isEn ? String(pendingCount) : toPersianDigits(pendingCount));
    setText('dashDoneCount', isEn ? String(doneCount) : toPersianDigits(doneCount));
    setText('dashDebtAmount', debt > 0 ? formatToman(debt) : (isEn ? 'No Dues' : 'بدون بدهی'));
    setText('dashNotifCount', isEn ? String(unreadCount) : toPersianDigits(unreadCount));

    const dot = document.getElementById('dashNotifDot');
    if (dot) dot.style.display = unreadCount > 0 ? 'block' : 'none';

    const newsWrap = document.getElementById('dashNewsWrap');
    if (newsWrap) {
      const list = isEn ? (window.newsData_EN || newsData) : newsData;
      newsWrap.innerHTML = list.slice(0, 2).map(n => `
        <div class="mini-news-card" onclick="openNewsDetail('${n.id}')">
          <div class="mini-news-text" style="text-align:${isEn ? 'left' : 'right'};">
            <h4>${escapeHtml(n.title)}</h4>
            <p>${escapeHtml(n.date || '')}</p>
          </div>
          ${n.image
            ? `<div class="mini-news-icon" style="padding:0; overflow:hidden;"><img src="${escapeHtml(n.image)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;"></div>`
            : `<div class="mini-news-icon">${window.EplakIcons ? window.EplakIcons.get(n.icon) : escapeHtml(n.icon)}</div>`}
        </div>
      `).join('');
    }
  }

  function filterReportsAndGo(filter) {
    showScreen('screen-reports');
    const tab = document.querySelector(`#reportsFilterTabs .filter-tab[data-filter="${filter}"]`);
    if (tab) filterReports(filter, tab);
    else renderReportsList(filter);
  }

  /* =========================================================
     News
  ========================================================= */
  function renderNewsList() {
    const wrap = document.getElementById('newsListWrap');
    if (!wrap) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const list = isEn ? (window.newsData_EN || newsData) : newsData;

    /* فهرست خالی = مدیر هنوز مطلبی ثبت نکرده (یا سرور در دسترس نیست و نمونه‌ی
       پیش‌فرض هم پاک شده). به‌جای صفحه‌ی سفید، کارتِ راهنما نشان می‌دهیم. */
    if (!Array.isArray(list) || !list.length) {
      wrap.innerHTML = (typeof window.eplakEmptyContentCard === 'function')
        ? window.eplakEmptyContentCard('خبر یا اطلاعیه‌ای ثبت نشده است')
        : '<div class="glass-card" style="padding:22px 16px; text-align:center;">📭</div>';
      return;
    }

    wrap.innerHTML = list.map(n => `
      <div class="glass-card" style="padding:14px; display:flex; gap:12px; align-items:center; cursor:pointer;" onclick="openNewsDetail('${n.id}')">
        ${n.image
          ? `<div class="promo-img" style="width:60px; height:60px; flex-shrink:0; overflow:hidden;">
               <img src="${escapeHtml(n.image)}" alt="" loading="lazy"
                    style="width:100%; height:100%; object-fit:cover; border-radius:inherit;"
                    onerror="this.style.display='none'">
             </div>`
          : `<div class="promo-img" style="width:60px; height:60px; flex-shrink:0;">
               <div class="promo-img-bg">${window.EplakIcons ? window.EplakIcons.get(n.icon) : escapeHtml(n.icon)}</div>
             </div>`}
        <div style="flex:1; text-align:${isEn ? 'left' : 'right'};">
          <h4 style="font-size:13px; font-weight:700; line-height:1.5;">${escapeHtml(n.title)}</h4>
          ${n.badge ? `<span style="font-size:10px; color:var(--teal);">${escapeHtml(n.badge)}</span>` : ''}
          <p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.5;">${escapeHtml(n.summary || '')}</p>
          <p style="font-size:10px; color:var(--text-muted); margin-top:6px;">${escapeHtml(n.date || '')}</p>
        </div>
      </div>
    `).join('');
  }

  function openNewsDetail(id) {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const list = isEn ? (window.newsData_EN || newsData) : newsData;
    const n = list.find(x => x.id === id) || newsData.find(x => x.id === id);
    if (!n) return;
    const imgBox = document.getElementById('newsDetailImg');
    if (imgBox) {
      /* اگر مطلب تصویر دارد (از پنل آپلود شده)، تصویر بزرگ نشان داده می‌شود؛
         وگرنه همان آیکون/ایموجی. تصویرِ آپلودشده در اپ با نشانی مطلق سرور
         خوانده می‌شود (modules/live.js ← resolveNewsImage). */
      const src = n.image || (typeof window.eplakResolveNewsImage === 'function' ? window.eplakResolveNewsImage(n) : '');
      if (src) {
        imgBox.innerHTML = '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(n.title) + '"'
          + ' style="width:100%; height:100%; object-fit:cover; border-radius:inherit;"'
          + ' onerror="this.parentNode.innerHTML=window.EplakIcons ? window.EplakIcons.get(\'' + escapeHtml(n.icon || '📰') + '\') : \'' + escapeHtml(n.icon || '📰') + '\'">';
      } else {
        imgBox.innerHTML = window.EplakIcons ? window.EplakIcons.get(n.icon) : escapeHtml(n.icon || '📰');
      }
    }
    const dTitle = document.getElementById('newsDetailTitle');
    if (dTitle) dTitle.textContent = n.title;
    const dDate = document.getElementById('newsDetailDate');
    if (dDate) dDate.textContent = [n.badge, n.date].filter(Boolean).join(' · ');
    const dBody = document.getElementById('newsDetailBody');
    /* متن با \n\n پاراگراف می‌شود؛ white-space:pre-line آن را حفظ می‌کند */
    if (dBody) dBody.textContent = n.body;
    showScreen('screen-news-detail');
  }

  /* =========================================================
     News screen — tab switcher (دانستنی‌های ورامین / اخبار و اطلاعات)
  ========================================================= */
  function switchNewsTab(tab, btnEl) {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const indicator = document.getElementById('newsTabsIndicator');
    const tabs = document.querySelectorAll('#newsTabs .news-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    if (indicator) {
      if (tab === 'news') {
        indicator.style.transform = isEn ? 'translateX(100%)' : 'translateX(-100%)';
      } else {
        indicator.style.transform = 'translateX(0)';
      }
    }

    document.getElementById('newsPanelKnowledge').classList.toggle('active', tab === 'knowledge');
    document.getElementById('newsPanelNews').classList.toggle('active', tab === 'news');
  }

  /* =========================================================
     Heritage knowledge cards (مسجد جامع / برج علاءالدوله)
  ========================================================= */
  const heritageData = {
    mosque: {
      img: 'assets/img/varamin-mosque.jpg',
      photoClass: '',
      pin: '۷۲۲ ه.ق · دوره ایلخانی',
      title: 'مسجد جامع ورامین',
      body: 'مسجد جامع ورامین، معروف به مسجد جمعه ورامین، یکی از کهن‌ترین و باشکوه‌ترین بناهای برجامانده از دوره ایلخانی در ایران است. ساخت آن در روزگار سلطان محمد خدابنده (الجایتو) آغاز شد و در دوران فرزند و جانشین او، ابوسعید بهادرخان، در سال ۷۲۲ هجری قمری به پایان رسید.\n\nاین مسجد با نقشه‌ای مستطیلی به ابعاد تقریبی ۶۶ در ۴۳ متر، تنها نمونه کامل و یکپارچه مساجد چهارایوانی در ایران است؛ سبکی که از سلجوقیان آغاز شده و در این بنا به اوج پختگی خود رسیده است. گنبدخانه مسجد با گذر از فیل‌پوش‌ها از مربع به هشت‌ضلعی و سپس شانزده‌ضلعی، به گنبدی باشکوه ختم می‌شود.\n\nسردر بلند و کشیده ورودی، کاشی‌کاری‌های معرق فیروزه‌ای و لاجوردی، گچ‌بری‌های ظریف گرداگرد محراب و کتیبه‌های تاریخی به خط ثلث و کوفی، این بنا را به یکی از مهم‌ترین آثار هنری و معماری دوران اسلامی ایران بدل کرده‌اند. در دوران معاصر، استاد محمدکریم پیرنیا، پدر معماری سنتی ایران، مرمت این اثر گران‌بها را بر عهده داشت.',
      tags: ['مسجد جامع', 'معماری ایلخانی', 'میراث ملی']
    },
    tower: {
      img: 'assets/img/varamin-tower.jpg',
      photoClass: ' heritage-photo-tower',
      pin: '۶۸۸ ه.ق · آرامگاهی',
      title: 'برج علاءالدوله ورامین',
      body: 'برج علاءالدوله، که با نام برج علاءالدین نیز شناخته می‌شود، یکی از قدیمی‌ترین برج‌های آرامگاهی به‌جامانده از ایران است. این بنا در سال ۶۸۸ هجری قمری، در اواخر سده هفتم هجری، به دستور فخرالدین بر فراز آرامگاه پدرش، حسن علاءالدوله، حاکم وقت شهر ری، ساخته شد.\n\nبرج از بدنه‌ای استوانه‌ای آجری با چین‌خوردگی‌های عمودی شکل گرفته که در ارتفاعی نزدیک به ۱۷ متر به گنبدی مخروطی و بلند ختم می‌شود؛ ترکیبی که سیمای منحصربه‌فرد و شناخته‌شده این بنا را در میدان مرکزی ورامین رقم زده است. در محل اتصال بخش استوانه‌ای به مخروطی، کتیبه‌ای آجری با خطوط کوفی برگ‌دار حک شده که نام بانی، تاریخ بنا و دعایی برای آرامش روح علاءالدوله را در خود دارد.\n\nنمای بیرونی برج با شمسه‌های آجری و کاشی‌های فیروزه‌ای و لاجوردی تزئین شده است. این اثر در ۱۵ دی ماه ۱۳۱۰ با شماره ثبت ۱۷۷ در فهرست آثار ملی ایران به ثبت رسید و امروزه یکی از نمادهای شناخته‌شده شهر ورامین و مقصد علاقه‌مندان به تاریخ و معماری ایرانی است.',
      tags: ['برج آرامگاهی', 'دوره ایلخانی', 'میراث ملی']
    }
  };

  const heritageData_EN = {
    mosque: {
      img: 'assets/img/varamin-mosque.jpg',
      photoClass: '',
      pin: '722 AH · Ilkhanate Era',
      title: 'Varamin Jameh Mosque',
      body: 'Varamin Jameh Mosque (Friday Mosque) is one of the oldest and most magnificent historic monuments from the Ilkhanate era in Iran. Commissioned under Sultan Mohammad Khodabandeh (Oljeitu) and completed under Abu Sa\'id Bahadur Khan in 722 AH (1322 CE).\n\nWith a rectangular layout of roughly 66 by 43 meters, it stands as the only complete, unified four-iwan mosque in Iran; an architectural style that began under the Seljuks and reached mature perfection here. The central dome transitions through squinches from square to octagonal and sixteen-sided before culminating in a soaring brick dome.\n\nThe elongated entrance portal, turquoise and lapis mosaic tilework, delicate plaster stucco carvings around the mihrab, and historic Kufic and Thuluth epigraphy make this a masterpiece of Islamic architecture. In modern times, renowned traditional architect Mohammad-Karim Pirnia supervised its meticulous restoration.',
      tags: ['Jameh Mosque', 'Ilkhanate Architecture', 'National Heritage']
    },
    tower: {
      img: 'assets/img/varamin-tower.jpg',
      photoClass: ' heritage-photo-tower',
      pin: '688 AH · Mausoleum',
      title: 'Varamin Alaeddin Tower',
      body: 'The Alaeddin Tower (also known as Ala\' od-Dowleh Tower) is one of the earliest preserved funerary tomb towers in Iran. Built in 688 AH (1289 CE) at the close of the 7th century Hijri by Fakhr al-Din above the tomb of his father, Hasan Ala\' od-Dowleh, the governor of Ray.\n\nThe tower features a cylindrical brick shaft with 32 sharp vertical flutings, rising approximately 17 meters and topped by a tall conical tent-shaped roof. Below the conical roof, a decorative brick frieze in floriated Kufic calligraphy records the patron, construction date, and prayers.\n\nThe exterior is adorned with geometric brickwork and turquoise glazed tile inserts. Officially registered as National Monument #177 on January 5, 1932, it remains a beloved civic symbol of Varamin for historians and architecture enthusiasts alike.',
      tags: ['Tomb Tower', 'Ilkhanate Era', 'National Heritage']
    }
  };
  if (typeof window !== 'undefined') window.heritageData_EN = heritageData_EN;
  /* نسخه‌ی فارسی برای استفاده‌ی سایر ماژول‌ها (مثلاً حالت بدون اینترنتِ
     modules/live.js که کارت‌های دانستنی‌ها را از سرور می‌گیرد) */
  if (typeof window !== 'undefined') window.__EPLAK_HERITAGE__ = heritageData;

  function openHeritageDetail(key) {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const source = (isEn && window.heritageData_EN) ? window.heritageData_EN : heritageData;
    const h = source[key] || heritageData[key];
    if (!h) return;
    const imgEl = document.getElementById('heritageDetailImg');
    imgEl.src = h.img;
    imgEl.alt = h.title;
    imgEl.className = 'heritage-photo' + h.photoClass;
    document.getElementById('heritageDetailPin').textContent = h.pin;
    document.getElementById('heritageDetailTitle').textContent = h.title;
    document.getElementById('heritageDetailBody').textContent = h.body;
    document.getElementById('heritageDetailTags').innerHTML = h.tags.map(t => `<span class="vsc-tag">${escapeHtml(t)}</span>`).join('');
    showScreen('screen-heritage-detail');
  }



  /* =========================================================
     Payments
  ========================================================= */
  const payments_EN = [
    { id: '1', title: '1403 Municipal Renovation Tax', amount: 450000, due: '2024-10-21', status: 'pending', code: 'BILL-8821-44' },
    { id: '2', title: 'Urban Waste Management Fee', amount: 180000, due: '2024-09-30', status: 'done', code: 'BILL-9932-11' }
  ];

  /* «مهلت پرداخت» هم شمسی نشان داده می‌شود: مقدارِ سرور/داده‌ی نمونه میلادی است
     (2024-10-21) و پیش از این خام چاپ می‌شد. */
  function faDueDate(value) {
    if (!value) return '—';
    if (typeof window.eplakFaDate === 'function') return window.eplakFaDate(value, String(value));
    if (typeof window.eplakFaDateLocal === 'function') return window.eplakFaDateLocal(value, String(value));
    return String(value);
  }

  function formatToman(n) {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    if (isEn) {
      return Number(n || 0).toLocaleString('en-US') + ' Tomans';
    }
    return toPersianDigits(n.toLocaleString('en-US')) + ' تومان';
  }

  function renderPaymentList() {
    const wrap = document.getElementById('paymentListWrap');
    if (!wrap) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const total = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    document.getElementById('paymentTotalDebt').textContent = formatToman(total);

    wrap.innerHTML = payments.map((p, idx) => {
      const enItem = payments_EN[idx];
      const title = (isEn && enItem) ? enItem.title : p.title;
      const dueText = isEn ? ('Due: ' + faDueDate(p.due)) : ('مهلت: ' + faDueDate(p.due));
      const statusText = p.status === 'done' ? (isEn ? 'Paid' : 'پرداخت‌شده') : (isEn ? 'Unpaid' : 'پرداخت‌نشده');
      return `
        <div class="report-item" onclick="openPaymentDetail('${p.id}')">
          <span class="report-status ${p.status === 'done' ? 'status-done' : 'status-pending'}">${statusText}</span>
          <div class="report-info" style="text-align:${isEn ? 'left' : 'right'};">
            <h4>${escapeHtml(title)}</h4>
            <p>${dueText}</p>
          </div>
          <div class="report-icon-box" style="background:rgba(150,80,255,0.12);">${window.EplakIcons ? window.EplakIcons.get('payment') : '💳'}</div>
        </div>
      `;
    }).join('');
  }

  function openPaymentDetail(id) {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    pendingPaymentId = id;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const enItem = payments_EN.find(x => x.id === id);
    const title = (isEn && enItem) ? enItem.title : p.title;

    document.getElementById('payDetailTitle').textContent = title;
    document.getElementById('payDetailCode').textContent = p.code;
    document.getElementById('payDetailDue').textContent = faDueDate(p.due);
    const statusEl = document.getElementById('payDetailStatus');
    statusEl.className = 'report-status ' + (p.status === 'done' ? 'status-done' : 'status-pending');
    statusEl.textContent = p.status === 'done' ? (isEn ? 'Paid' : 'پرداخت‌شده') : (isEn ? 'Unpaid' : 'پرداخت‌نشده');
    document.getElementById('payDetailAmount').textContent = formatToman(p.amount);
    const payBtn = document.getElementById('payNowBtn');
    if (p.status === 'done') {
      payBtn.textContent = isEn ? 'This bill has been paid' : 'این قبض قبلاً پرداخت شده است';
      payBtn.style.opacity = '0.6';
      payBtn.style.pointerEvents = 'none';
    } else {
      payBtn.textContent = isEn ? 'Pay Online' : 'پرداخت آنلاین';
      payBtn.style.opacity = '1';
      payBtn.style.pointerEvents = 'auto';
    }
    showScreen('screen-payment-detail');
  }

  function payInvoice() {
    const p = payments.find(x => x.id === pendingPaymentId);
    if (!p) return;
    p.status = 'done';
    if (typeof savePayments === 'function') savePayments();
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    showToast(isEn ? 'Payment completed successfully' : 'پرداخت با موفقیت انجام شد');
    openPaymentDetail(p.id);
  }


  /* نقشه و اماکن شهری: modules/city-map.js (renderMapPlaces را آن‌جا تعریف می‌کند) */


  /* =========================================================
     Notifications
  ========================================================= */
  const notifications_EN = [
    { id: '1', title: 'Report Status Update', body: 'Civil engineering crew dispatched to the site', time: '10 min ago', read: false, icon: '🚧' },
    { id: '2', title: 'Tree Pruning Announcement', body: 'Seasonal branch pruning in Central District next week', time: 'Yesterday', read: true, icon: '🌳' },
    { id: '3', title: 'Renovation Tax Reminder', body: '10% early payment discount until end of month', time: '3 days ago', read: true, icon: '💳' }
  ];

  /* چرا فهرست خالی است؟ — یک خط توضیح کوتاه برای کاربر.
     پیش‌تر اگر سرور خطا می‌داد یا درخواست به سرور نمی‌رسید، اپ «اعلانی وجود
     ندارد» نشان می‌داد و کاربر هیچ راهی برای فهمیدن دلیل نداشت (همان شکایتِ
     «در APK هیچ اعلانی دیده نمی‌شود»). حالا خودِ اپ می‌گوید چه اتفاقی افتاده. */
  function notifEmptyReason(status, isEn) {
    if (!status || !status.at) return '';
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (v => String(v == null ? '' : v));
    const when = (() => {
      try {
        if (typeof faTime === 'function') return faTime(new Date(status.at));
      } catch (e) {}
      return '';
    })();
    const outcome = String(status.outcome || '');
    let text = '';
    if (status.notice) {
      text = String(status.notice);
    } else if (outcome.indexOf('ok:') === 0) {
      const phone = String(status.phone || '');
      text = isEn
        ? ('The server answered but has no notification for ' + (phone || 'this device') + ' yet.')
        : ('سرور پاسخ داد ولی تا حالا اعلانی برای ' + (phone ? ('شماره‌ی «' + phone + '»') : 'این دستگاه') + ' ثبت نشده است.');
    } else if (outcome.indexOf('http:') === 0) {
      text = (isEn ? 'The server answered with error ' : 'سرور اعلان‌ها پاسخ خطا داد (کد ') + outcome.slice(5) + (isEn ? '.' : ').');
    } else if (outcome.indexOf('net:') === 0 || outcome === 'json' || outcome === 'fail') {
      text = isEn ? 'Could not reach the notifications server.' : 'ارتباط با سرور اعلان‌ها برقرار نشد.';
    }
    if (!text) return '';
    const suffix = isEn
      ? ''
      : ' هر ۳.۵ ثانیه دوباره تلاش می‌شود؛ اگر تکرار شد، در پنل مدیریت → تنظیمات «ضربان اپ‌ها» را ببینید.';
    return `<div style="text-align:center; padding:2px 10px 14px; color:var(--text-muted); font-size:12px; line-height:1.9;">`
      + `<div style="font-size:13px;">⚠️ ${esc(text)}</div>`
      + `${suffix ? '<div style="opacity:0.85;">' + esc(suffix.trim()) + '</div>' : ''}`
      + (when ? `<div style="opacity:0.7;">${isEn ? 'Last check' : 'آخرین بررسی'}: ${esc(when)}</div>` : '')
      + `</div>`;
  }

  function renderNotifications() {
    const wrap = document.getElementById('notifListWrap');
    if (!wrap) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    /* ترجمه‌ی محلی: اگر core/i18n.js (نسخه‌ی کش‌شده‌ی قدیمی یا ناقص) تابع t را
       نساخته باشد، قبلاً همین یک خط خطا می‌داد و کل فهرست اعلان‌ها خالی می‌ماند
       (اعلان روی سرور بود ولی کاربر هیچ‌چیز نمی‌دید). حالا متن جانشین می‌آید. */
    const tr = (key, fallback) => {
      try {
        if (typeof t === 'function') return t(key, fallback);
      } catch (e) {}
      return fallback;
    };
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : (v => String(v == null ? '' : v));

    const status = (typeof window.eplakNotificationStatus === 'function')
      ? window.eplakNotificationStatus() : null;

    /* پیام سرور (دیتابیس قدیمی/خطای خواندن) — یک خط کوتاه بالای فهرست.
       بدون دکمه و بدون کادر اضافه؛ فقط تا زمانی که مشکل هست نشان داده می‌شود. */
    let noticeHtml = '';
    if (status && status.notice) {
      noticeHtml = `<div style="margin:0 0 10px; padding:9px 12px; border-radius:12px; `
        + `background:rgba(255,153,0,0.10); border:1px solid rgba(255,153,0,0.28); color:#B26A00; `
        + `font-size:12.5px; line-height:1.9; text-align:${isEn ? 'left' : 'right'};">⚠️ ${esc(status.notice)}</div>`;
    }

    let bodyHtml = '';
    try {
      if (notifications.length === 0) {
        bodyHtml = `<div style="text-align:center; padding:30px 10px 6px; color:var(--text-muted); font-size:13px;">${isEn ? 'No notifications to display' : 'اعلانی وجود ندارد'}</div>`
          + notifEmptyReason(status, isEn);
      } else {
        bodyHtml = notifications.map((n, idx) => {
          const enItem = (!String(n.id).startsWith('srv-') && idx < notifications_EN.length) ? notifications_EN[idx] : null;
          const title = (isEn && enItem) ? enItem.title : n.title;
          const body = (isEn && enItem) ? enItem.body : n.body;
          const time = (isEn && enItem) ? enItem.time : (n.time || n.date || '');
          const deleteLabel = tr('notif_delete_one', isEn ? 'Delete this notification' : 'حذف این اعلان');
          return `
          <div class="report-item" onclick="markNotifRead('${n.id}')" style="${n.read ? 'opacity:0.6;' : ''}">
            ${!n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--orange);flex-shrink:0;"></span>' : '<span style="width:8px;height:8px;flex-shrink:0;"></span>'}
            <div class="report-info" style="text-align:${isEn ? 'left' : 'right'};">
              <h4>${escapeHtml(title)}</h4>
              <p>${escapeHtml(body)} · ${time}</p>
            </div>
            <div class="report-icon-box" style="background:rgba(0,201,167,0.12);">${window.EplakIcons ? window.EplakIcons.get(n.icon || '🔔') : (n.icon || '🔔')}</div>
            <button type="button" class="notif-delete-btn" title="${deleteLabel}" aria-label="${deleteLabel}"
                    onclick="event.stopPropagation(); deleteNotif('${n.id}');"
                    style="flex-shrink:0; width:34px; height:34px; border-radius:10px; border:1px solid rgba(255,60,60,0.28); background:rgba(255,60,60,0.10); color:#FF6666; display:grid; place-items:center; cursor:pointer;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `;
        }).join('');
      }
    } catch (err) {
      /* ایمنی آخر: هر خطای غیرمنتظره در ساخت فهرست، به‌جای «فهرست خالیِ
         بی‌توضیح»، همان‌جا نشان داده می‌شود (پیش‌تر catch بیرونی در live.js
         خطا را می‌خورد و کاربر هیچ‌چیز نمی‌فهمید). */
      bodyHtml = `<div style="text-align:center; padding:26px 10px; color:#C0392B; font-size:12.5px; line-height:2;">`
        + `⚠️ ${isEn ? 'Could not display notifications: ' : 'نمایش اعلان‌ها با خطا متوقف شد: '}${esc(String((err && err.message) || err))}</div>`;
    }
    wrap.innerHTML = noticeHtml + bodyHtml;
    updateNotifDot();
  }

  /* صف گزارش‌هایی که به‌خاطر قطعی اینترنت ارسال نشدند */
  const pendingReadReports = [];

  /* وضعیت «خوانده شد» علاوه بر گوشی، به سرور هم اطلاع داده می‌شود تا در پنل
     ادمین (فهرست گیرندگان اعلان) درست نمایش داده شود. */
  function reportReadToServer(idOrNull, all) {
    try {
      if (typeof window.markNotificationsRead === 'function') {
        window.markNotificationsRead(idOrNull, !!all).then(function (result) {
          if (result && result.ok === false && result.reason === 'network') {
            /* اتصال قطع است؛ دفعه‌ی بعد که اپ باز شد دوباره تلاش می‌شود */
            pendingReadReports.push({ id: idOrNull, all: !!all });
          }
        });
      }
    } catch (e) {}
  }

  function flushPendingReadReports() {
    if (!pendingReadReports.length || typeof window.markNotificationsRead !== 'function') return;
    const queue = pendingReadReports.splice(0, pendingReadReports.length);
    queue.forEach(function (item) {
      try { window.markNotificationsRead(item.id, item.all); } catch (e) {}
    });
  }

  function markNotifRead(id) {
    const n = notifications.find(x => x.id === id);
    if (n) n.read = true;
    if (typeof saveNotifications === 'function') saveNotifications();
    renderNotifications();
    reportReadToServer(id, false);
  }

  function deleteAllNotifs() {
    var isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    if (!notifications.length) {
      showToast(isEn ? 'No notifications to delete' : 'اعلانی برای حذف وجود ندارد');
      return;
    }
    const question = isEn ? 'Delete all notifications?' : 'همه‌ی اعلان‌ها حذف شوند؟';
    if (typeof confirm === 'function' && !confirm(question)) return;
    var done = function () {
      notifications.length = 0;
      if (typeof saveNotifications === 'function') saveNotifications();
      renderNotifications();
      showToast(isEn ? 'All notifications deleted' : 'همه‌ی اعلان‌ها حذف شدند');
    };
    try {
      if (typeof window.deleteAllNotifications === 'function') {
        window.deleteAllNotifications().then(done).catch(done);
        return;
      }
    } catch (e) {}
    done();
  }

  function markAllNotifsRead() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    notifications.forEach(n => n.read = true);
    if (typeof saveNotifications === 'function') saveNotifications();
    renderNotifications();
    reportReadToServer(null, true);
    showToast(isEn ? 'All notifications marked as read' : 'همه اعلان‌ها خوانده شد');
  }


  function updateNotifDot() {
    const hasUnread = notifications.some(n => !n.read);
    const dot = document.getElementById('homeNotifDot');
    if (dot) dot.style.display = hasUnread ? 'block' : 'none';
    const dashDot = document.getElementById('dashNotifDot');
    if (dashDot) dashDot.style.display = hasUnread ? 'block' : 'none';
  }

  window.flushPendingReadReports = flushPendingReadReports;
  window.deleteAllNotifs = deleteAllNotifs;


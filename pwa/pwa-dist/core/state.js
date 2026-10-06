/* core/state.js — وضعیت سراسری و داده‌های اپلیکیشن ای‌پلاک */
/* استخراج‌شده عیناً از فایل اصلی app_01.html بدون تغییر منطق */

  /* =========================================================
     ای‌پلاک — Application State & Data
  ========================================================= */

  /* برچسب‌های وضعیت — دقیقاً چهار مرحله‌ی روند رسیدگی:
     ثبت گزارش → در حال انتظار → در حال رسیدگی → انجام شد */
  const STATUS_LABEL = {
    all: 'همه',
    pending: 'در حال انتظار',
    in_progress: 'در حال رسیدگی',
    review: 'در حال رسیدگی',
    done: 'انجام شد'
  };
  const STATUS_LABEL_EN = {
    all: 'All',
    pending: 'Pending',
    in_progress: 'In Progress',
    review: 'In Progress',
    done: 'Completed'
  };
  const STATUS_CLASS = {
    all: 'status-review',
    pending: 'status-pending',
    in_progress: 'status-review',
    review: 'status-review',
    done: 'status-done'
  };
  /* نام‌های آیکون هر وضعیت در پک آیکون حرفه‌ای */
  const STATUS_ICON = {
    pending: 'hourglass',
    in_progress: 'search',
    review: 'search',
    done: 'check-circle'
  };

  function normalizeStatusValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 'pending';
    const normalized = raw.toLowerCase();
    const normalizedSafe = normalized.replace(/\s+/g, '').replace(/[_-]+/g, '');
    const map = {
      all: 'all',
      همه: 'all',
      'در انتظار': 'pending',
      pending: 'pending',
      wait: 'pending',
      waiting: 'pending',
      'در حال بررسی': 'in_progress',
      'درحال‌بررسی': 'in_progress',
      in_progress: 'in_progress',
      review: 'in_progress',
      بررسی: 'in_progress',
      'پاسخ داده شده': 'done',
      'پاسخ‌داده‌شده': 'done',
      'انجام شده': 'done',
      'انجام‌شده': 'done',
      done: 'done',
      completed: 'done',
      answered: 'done',
      'answereddone': 'done'
    };

    if (map[raw] !== undefined) return map[raw];
    if (map[normalized] !== undefined) return map[normalized];
    if (map[normalizedSafe] !== undefined) return map[normalizedSafe];
    return 'pending';
  }

  function getStatusMeta(status) {
    const key = normalizeStatusValue(status);
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const label = isEn
      ? (STATUS_LABEL_EN[key] || 'Pending')
      : (STATUS_LABEL[key] || 'در حال انتظار');
    return {
      key,
      label,
      className: STATUS_CLASS[key] || 'status-pending'
    };
  }

  // الگوی معتبر شماره موبایل ایران: 09 + پیش‌شماره اپراتور معتبر + ۷ رقم باقیمانده
  // پیش‌شماره‌های پذیرفته‌شده: 090, 091, 092, 093, 099 (طبق تخصیص رگولاتوری ایران)
  const IRAN_MOBILE_REGEX = /^09(0[0-9]|1[0-9]|2[0-9]|3[0-9]|9[0-9])\d{7}$/;

  function isValidIranMobile(phone) {
    return typeof phone === 'string' && IRAN_MOBILE_REGEX.test(phone);
  }

  // Current logged-in user (mutable demo data) — مقداردهی اولیه از پروفایل ذخیره‌شده (در صورت وجود)
  const userProfile = {
    name: 'شهروند',
    phone: '',
    rawPhone: ''
  };

  // Reports — آرایه خالی؛ داده‌های واقعی هر کاربر از localStorage بارگذاری می‌شود (core/storage.js)
  let reports = [];
  let reportIdCounter = 1;

  const newsData = [
    { id: 'n1', title: 'افتتاح پارک جدید در منطقه شمالی ورامین', date: '۱۴۰۳/۰۳/۱۲', icon: '🌳',
      summary: 'پارک جدید شهر با امکانات ورزشی و فضای سبز گسترده افتتاح شد.',
      body: 'پارک جدید شهرداری ورامین با مساحت بیش از ۵ هکتار و امکاناتی شامل زمین‌های ورزشی، مسیر پیاده‌روی، فضای بازی کودکان و فضای سبز گسترده، آماده بهره‌برداری شهروندان عزیز شده است. این پروژه با مشارکت شهروندان و در راستای ارتقای کیفیت زندگی شهری اجرا شده است.' },
    { id: 'n2', title: 'اطلاعیه نوبت‌دهی پرداخت عوارض نوسازی', date: '۱۴۰۳/۰۳/۰۸', icon: '📋',
      summary: 'مهلت پرداخت عوارض نوسازی سال جاری تا پایان خرداد ماه تمدید شد.',
      body: 'به اطلاع شهروندان محترم می‌رساند مهلت پرداخت عوارض نوسازی سال جاری تا پایان خرداد ماه تمدید گردیده است. شهروندان می‌توانند از طریق بخش «پرداخت عوارض» همین برنامه نسبت به پرداخت بدهی خود اقدام نمایند.' },
    { id: 'n3', title: 'برگزاری جشنواره فرهنگی شهر ورامین', date: '۱۴۰۳/۰۲/۲۵', icon: '🎉',
      summary: 'جشنواره فرهنگی و هنری شهر با حضور هنرمندان محلی برگزار می‌شود.',
      body: 'شهرداری ورامین با همکاری اداره فرهنگ و ارشاد اسلامی، جشنواره فرهنگی و هنری شهر را با حضور هنرمندان محلی و برنامه‌های متنوع برای خانواده‌ها برگزار می‌کند. زمان و مکان دقیق برگزاری متعاقباً اعلام خواهد شد.' },
    { id: 'n4', title: 'آغاز طرح بازآفرینی بافت فرسوده مرکز شهر', date: '۱۴۰۳/۰۲/۱۰', icon: '🏗️',
      summary: 'طرح نوسازی و بازآفرینی بافت فرسوده مرکز شهر آغاز شد.',
      body: 'با هدف ارتقای کیفیت بصری و کالبدی مرکز شهر، طرح بازآفرینی بافت فرسوده با همکاری شهرداری و سازمان نوسازی شهری آغاز شده و طی فازهای مختلف تا پایان سال ادامه خواهد داشت.' }
  ];

  const newsData_EN = [
    { id: 'n1', title: 'Grand Opening of New Northern Varamin Municipal Park', date: '2024/06/01', icon: '🌳',
      summary: 'New city park opened featuring wide sports facilities and green recreational grounds.',
      body: 'The new Varamin Municipal Park covering more than 5 hectares is now open to citizens, featuring athletic fields, walking tracks, children playgrounds, and extensive landscaped areas. Built in partnership with citizens to enhance urban quality of life.' },
    { id: 'n2', title: 'Notice: Municipal Renovation Tax Payment Deadline Extended', date: '2024/05/28', icon: '📋',
      summary: 'Deadline for paying annual municipal renovation dues extended through next month.',
      body: 'Citizens are informed that the deadline for paying municipal renovation and development duties has been extended. Dues can be queried and settled directly through the Pay Taxes section of this app.' },
    { id: 'n3', title: 'Varamin City Annual Cultural & Arts Festival', date: '2024/05/14', icon: '🎉',
      summary: 'Regional cultural and arts festival to be held featuring local artists and performances.',
      body: 'Varamin Municipality in cooperation with the Department of Culture & Arts hosts the city festival with diverse cultural programs and family activities. Schedules and venues will be announced.' },
    { id: 'n4', title: 'Downtown Historic Urban Regeneration Plan Launched', date: '2024/04/29', icon: '🏗️',
      summary: 'Comprehensive renewal project initiated to revitalize historic downtown commercial corridors.',
      body: 'Aiming to improve visual and physical urban quality in central districts, the historic downtown regeneration project has commenced in phases in partnership with urban renewal authorities.' }
  ];
  if (typeof window !== 'undefined') window.newsData_EN = newsData_EN;

  // Payments — آرایه خالی؛ داده‌های هر کاربر از localStorage بارگذاری می‌شود
  let payments = [];

  /* فهرست اماکن «نقشه و اماکن شهری» حالا در core/places-data.js است (مختصات واقعی ورامین) */

  // Notifications — آرایه خالی؛ داده‌های هر کاربر از localStorage بارگذاری می‌شود
  let notifications = [];

  // Favorites: ids reference home & city services
  const allServices = [
    { id: 's1', icon: '📋', bg: 'rgba(0,201,167,0.16)', title: 'ثبت درخواست', sub: 'گزارش و پیگیری مشکلات شهری', screen: 'screen-report', group: 'گزارشات' },
    { id: 's2', icon: '🔍', bg: 'rgba(59,130,246,0.16)', title: 'پیگیری درخواست', sub: 'استعلام وضعیت گزارش‌ها', screen: 'screen-track', group: 'گزارشات' },
    { id: 'pay_renovation', icon: '🏢', bg: 'rgba(139,92,246,0.16)', title: 'عوارض نوسازی', sub: 'استعلام و تسویه عوارض سالیانه املاک', screen: 'screen-payment', serviceId: 'pay_renovation', group: 'عوارض' },
    { id: 'pay_waste', icon: '🗑️', bg: 'rgba(139,92,246,0.16)', title: 'عوارض پسماند', sub: 'بهای خدمات مدیریت پسماند شهری', serviceId: 'pay_waste', group: 'عوارض' },
    { id: 'pay_business', icon: '🏪', bg: 'rgba(139,92,246,0.16)', title: 'عوارض کسب و پیشه', sub: 'عوارض صنفی واحدهای تجاری ورامین', serviceId: 'pay_business', group: 'عوارض' },
    { id: 'pay_auto', icon: '🚗', bg: 'rgba(139,92,246,0.16)', title: 'عوارض خودرو', sub: 'استعلام سالیانه و پرداخت پلاک', serviceId: 'pay_auto', group: 'عوارض' },
    { id: 'trans_inspection', icon: '🚘', bg: 'rgba(234,88,12,0.16)', title: 'معاینه فنی', sub: 'نوبت‌دهی مکانیزه مرکز معاینه فنی ورامین', serviceId: 'trans_inspection', group: 'حمل و نقل' },
    { id: 'trans_taxi', icon: '🚕', bg: 'rgba(234,88,12,0.16)', title: 'تاکسیرانی', sub: 'کرایه مصوب، خطوط و ثبت شکایات', serviceId: 'trans_taxi', group: 'حمل و نقل' },
    { id: 'cem_grave_reserve', icon: '🪦', bg: 'rgba(13,148,136,0.16)', title: 'رزرو آرامستان', sub: 'خرید و رزرو قطعات آرامستان ورامین', serviceId: 'cem_grave_reserve', group: 'آرامستان‌ها' },
    { id: 'cem_search', icon: '🕊️', bg: 'rgba(13,148,136,0.16)', title: 'جستجوی مزار و متوفی', sub: 'یافتن دقیق قطعه، ردیف و شماره مزار', serviceId: 'cem_search', group: 'آرامستان‌ها' },
    { id: 'cem_tariffs', icon: '📊', bg: 'rgba(13,148,136,0.16)', title: 'تعرفه متوفیات', sub: 'هزینه‌های مصوب شورا، غسل و کفن و آمبولانس', serviceId: 'cem_tariffs', group: 'آرامستان‌ها' },
    { id: 'env_drywaste', icon: '♻️', bg: 'rgba(16,185,129,0.16)', title: 'تفکیک پسماند خشک', sub: 'تحویل درب منزل با جمع‌آوری مکانیزه', serviceId: 'env_drywaste', group: 'محیط زیست' },
    { id: 'env_pruning', icon: '🌳', bg: 'rgba(16,185,129,0.16)', title: 'هرس درختان', sub: 'درخواست هرس و بهسازی فضای سبز معابر', serviceId: 'env_pruning', group: 'محیط زیست' },
    { id: 'tender_projects', icon: '📑', bg: 'rgba(2,132,199,0.16)', title: 'مناقصات و مزایدات', sub: 'پروژه‌های عمرانی و واگذاری‌های رسمی شهرداری', serviceId: 'tender_projects', group: 'مناقصات' },
    { id: 'biz_permit', icon: '📜', bg: 'rgba(217,119,6,0.16)', title: 'پروانه کسب', sub: 'استعلام صدور و تمدید پروانه‌های تجاری', serviceId: 'biz_permit', group: 'کسب و کار' },
    { id: 's3', icon: '📢', bg: 'rgba(245,158,11,0.16)', title: 'اخبار و اطلاعیه‌ها', sub: 'آخرین مصوبات، اطلاعیه‌ها و اخبار شهر', screen: 'screen-news', group: 'اطلاعات' },
    { id: 's5', icon: '🗺️', bg: 'rgba(0,201,167,0.16)', title: 'نقشه شهر', sub: 'اماکن مهم ورامین و مسیریابی با نشان', screen: 'screen-map', group: 'عمومی' },
    { id: 's6', icon: '📞', bg: 'rgba(20,184,166,0.16)', title: 'تماس با ما', sub: 'سامانه ارتباط مستقیم ۱۳۷ و مدیران', screen: 'screen-contact', group: 'عمومی' },
    { id: 's7', icon: '🤝', bg: 'rgba(168,85,247,0.16)', title: 'ملاقات با مسئولان', sub: 'ثبت نوبت دیدار حضوری با شهردار و شورای شهر', action: 'openMayorMeetingModal', group: 'مدیریت' },
    { id: 's4', icon: '✨', bg: 'rgba(150,80,255,0.16)', title: 'سامانه خدمات شهری', sub: 'مشاهده لیست کامل تمام سرویس‌های شهرداری', screen: 'screen-services', group: 'عمومی' }
  ];

  const allServices_EN = [
    { id: 's1', icon: '📋', bg: 'rgba(0,201,167,0.16)', title: 'Submit Request', sub: 'Report municipal issues', screen: 'screen-report', group: 'Reports' },
    { id: 's2', icon: '🔍', bg: 'rgba(59,130,246,0.16)', title: 'Track Request', sub: 'Check reports status', screen: 'screen-track', group: 'Reports' },
    { id: 'pay_renovation', icon: '🏢', bg: 'rgba(139,92,246,0.16)', title: 'Renovation Tax', sub: 'Inquiry and pay annual property tax', screen: 'screen-payment', serviceId: 'pay_renovation', group: 'Taxes' },
    { id: 'pay_waste', icon: '🗑️', bg: 'rgba(139,92,246,0.16)', title: 'Waste Management', sub: 'Urban waste collection dues', serviceId: 'pay_waste', group: 'Taxes' },
    { id: 'pay_business', icon: '🏪', bg: 'rgba(139,92,246,0.16)', title: 'Business Tax', sub: 'Commercial unit municipal dues', serviceId: 'pay_business', group: 'Taxes' },
    { id: 'pay_auto', icon: '🚗', bg: 'rgba(139,92,246,0.16)', title: 'Vehicle Toll', sub: 'Annual vehicle toll inquiry', serviceId: 'pay_auto', group: 'Taxes' },
    { id: 'trans_inspection', icon: '🚘', bg: 'rgba(234,88,12,0.16)', title: 'Vehicle Inspection', sub: 'Book inspection appointment', serviceId: 'trans_inspection', group: 'Transport' },
    { id: 'trans_taxi', icon: '🚕', bg: 'rgba(234,88,12,0.16)', title: 'Taxi Service', sub: 'Fares, routes & complaints', serviceId: 'trans_taxi', group: 'Transport' },
    { id: 'cem_grave_reserve', icon: '🪦', bg: 'rgba(13,148,136,0.16)', title: 'Cemetery Plots', sub: 'Plot purchase and reservation', serviceId: 'cem_grave_reserve', group: 'Cemetery' },
    { id: 'cem_search', icon: '🕊️', bg: 'rgba(13,148,136,0.16)', title: 'Find Grave', sub: 'Deceased search and grave locator', serviceId: 'cem_search', group: 'Cemetery' },
    { id: 'cem_tariffs', icon: '📊', bg: 'rgba(13,148,136,0.16)', title: 'Cemetery Tariffs', sub: 'Official funeral and ambulance tariffs', serviceId: 'cem_tariffs', group: 'Cemetery' },
    { id: 'env_drywaste', icon: '♻️', bg: 'rgba(16,185,129,0.16)', title: 'Dry Waste Recycling', sub: 'Doorstep pickup and eco rewards', serviceId: 'env_drywaste', group: 'Environment' },
    { id: 'env_pruning', icon: '🌳', bg: 'rgba(16,185,129,0.16)', title: 'Tree Pruning', sub: 'Urban greenery pruning request', serviceId: 'env_pruning', group: 'Environment' },
    { id: 'tender_projects', icon: '📑', bg: 'rgba(2,132,199,0.16)', title: 'Tenders & Auctions', sub: 'Municipal projects and official tenders', serviceId: 'tender_projects', group: 'Tenders' },
    { id: 'biz_permit', icon: '📜', bg: 'rgba(217,119,6,0.16)', title: 'Business Permit', sub: 'Permit renewal and licensing', serviceId: 'biz_permit', group: 'Business' },
    { id: 's3', icon: '📢', bg: 'rgba(245,158,11,0.16)', title: 'News & Notices', sub: 'Latest civic news and announcements', screen: 'screen-news', group: 'News' },
    { id: 's5', icon: '🗺️', bg: 'rgba(0,201,167,0.16)', title: 'City Map', sub: 'Key places in Varamin & Neshan routing', screen: 'screen-map', group: 'General' },
    { id: 's6', icon: '📞', bg: 'rgba(20,184,166,0.16)', title: 'Contact Us', sub: 'Direct line and 137 helpline', screen: 'screen-contact', group: 'General' },
    { id: 's7', icon: '🤝', bg: 'rgba(168,85,247,0.16)', title: 'Mayor Meeting', sub: 'Request meeting with Mayor & Council', action: 'openMayorMeetingModal', group: 'Management' },
    { id: 's4', icon: '✨', bg: 'rgba(150,80,255,0.16)', title: 'All Services', sub: 'View full catalog of city services', screen: 'screen-services', group: 'General' }
  ];
  if (typeof window !== 'undefined') {
    window.allServices = allServices;
    window.allServices_EN = allServices_EN;
  }
  // Favorites — آرایه خالی؛ داده‌های هر کاربر از localStorage بارگذاری می‌شود
  let favoriteIds = [];

  // Multi-step report form draft
  let reportDraft = { type: 'سایر', department: '', subDepartment: '', desc: '', location: '', photos: [] };
  let activeReportId = null; // for detail screen
  let pendingPaymentId = null;


  /* =========================================================
     Helpers
  ========================================================= */
  function toPersianDigits(input) {
    if (window.i18n && (window.i18n.currentLang === 'en' || (typeof window.i18n.getLanguage === 'function' && window.i18n.getLanguage() === 'en'))) {
      return String(input ?? '');
    }
    const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return String(input ?? '').replace(/[0-9]/g, d => fa[d]);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


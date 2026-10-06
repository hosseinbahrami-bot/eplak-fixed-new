/* modules/services.js — بخش جامع «خدمات شهری» ای‌پلاک */
/*
   این ماژول ساختار نوین ۶ دسته مربعی و سرویس‌های تخصصی هر بخش را مدیریت می‌کند:
   ۱. عوارض شهرداری
   ۲. کسب و کار
   ۳. محیط زیست و بازیافت
   ۴. حمل و نقل و ترافیک
   ۵. مناقصات و مزایده‌ها (جدید)
   ۶. آرامستان‌ها (خرید و رزرو قبر، استعلام تعرفه، مداح، جستجوی متوفی - جدید)
*/

  /* =========================================================
     Data — تعریف سرویس‌های تفکیکی (فارسی)
  ========================================================= */

  const EPLAK_SERVICES = [
    /* ---------------- ۱. عوارض شهرداری ---------------- */
    {
      id: 'pay_renovation',
      groupId: 'finance',
      short: 'عوارض نوسازی',
      icon: '🏢',
      accent: '139,92,246',
      title: 'استعلام و پرداخت عوارض نوسازی',
      sub: 'عوارض سالیانه ملک و املاک مسکونی و تجاری',
      badge: { text: 'برخط', tone: 'ok' },
      chips: ['کد نوسازی ملک', 'پرداخت شتاب', 'مفاصاحساب آنلاین'],
      intro:
        'استعلام شفاف و پرداخت امن عوارض سالیانه نوسازی املاک مسکونی، تجاری و اداری در محدوده شهر ورامین. تنها با وارد کردن کد نوسازی ۱۲ رقمی مندرج در قبض یا سند ملک، بدهی خود را مشاهده و بلافاصله تسویه کنید.',
      caps: [
        { icon: '🔢', title: 'استعلام با کد نوسازی', desc: 'محاسبه دقیق بدهی سال جاری و سنوات گذشته بر اساس ممیزی رسمی.' },
        { icon: '💳', title: 'پرداخت آنی شتابی', desc: 'تسویه با تمامی کارت‌های بانکی از طریق درگاه امن شاپرک.' },
        { icon: '🧾', title: 'رسید و بارکد رهگیری', desc: 'صدور قبض تسویه‌شده رسمی و نگهداری مادام‌العمر در سوابق پروفایل.' },
        { icon: '🎁', title: 'تخفیف خوش‌حسابی', desc: 'اعمال خودکار جایزه خوش‌حسابی ۱۰ درصدی برای پرداخت‌های پیش از موعد.' }
      ],
      action: { label: 'ورود به درگاه پرداخت نوسازی', kind: 'screen', target: 'screen-payment' }
    },
    {
      id: 'pay_waste',
      groupId: 'finance',
      short: 'عوارض پسماند',
      icon: '🗑️',
      accent: '139,92,246',
      title: 'بهای خدمات مدیریت پسماند',
      sub: 'عوارض جمع‌آوری، تفکیک و انتقال پسماند شهری',
      badge: { text: 'فعال', tone: 'ok' },
      chips: ['تعرفه مصوب', 'تسویه سالیانه', 'استعلام با پلاک'],
      intro:
        'سامانه پرداخت بهای خدمات پسماند شهری شهرداری ورامین. بهای مصوب خدمات پسماند جهت حفظ بهداشت و نظافت عمومی محلات اخذ و مستقیماً صرف ناوگان مکانیزه جمع‌آوری زباله می‌گردد.',
      caps: [
        { icon: '🧹', title: 'خدمات مکانیزه شهری', desc: 'مشارکت در ارتقای ناوگان و پاکیزگی پایدار معابر شهر.' },
        { icon: '📊', title: 'تعرفه شفاف خانوار', desc: 'محاسبه هزینه بر اساس کاربری و مساحت واحد طبق مصوبه شورای شهر.' },
        { icon: '📱', title: 'دریافت پیامکی قبض', desc: 'امکان فعال‌سازی ارسال شناسه قبض و پرداخت به سرشماره همراه.' }
      ],
      action: { label: 'استعلام بهای پسماند', kind: 'screen', target: 'screen-payment' }
    },
    {
      id: 'pay_business',
      groupId: 'finance',
      short: 'عوارض اصناف',
      icon: '🏷️',
      accent: '139,92,246',
      title: 'عوارض کسب، پیشه و تابلوهای تبلیغاتی',
      sub: 'تسویه سالانه واحدهای صنفی و تجاری ورامین',
      badge: { text: 'الکترونیک', tone: 'live' },
      chips: ['کد صنفی', 'عوارض تابلو', 'بدون مراجعه حضوری'],
      intro:
        'ویژه کسبه و صاحبان مشاغل ورامین جهت استعلام و پرداخت عوارض کسب و پیشه، تابلوهای سردر مغازه‌ها و تبلیغات محیطی بدون نیاز به مراجعه به شهرداری منطقه.',
      caps: [
        { icon: '🏬', title: 'استعلام با شماره پروانه', desc: 'مشاهده کارتابل مالی واحد صنفی با کد یکتای جواز کسب.' },
        { icon: '🪧', title: 'عوارض استاندارد تابلو', desc: 'محاسبه مساحت تابلو طبق ضوابط زیباسازی شهری.' },
        { icon: '📜', title: 'مفاصاحساب تمدید جواز', desc: 'صدور گواهی عدم بدهی جهت ارائه به اتاق اصناف ورامین.' }
      ],
      action: { label: 'استعلام عوارض صنفی', kind: 'toast', toast: 'کارتابل عوارض صنفی با وارد کردن کد اصناف آماده پرداخت است' }
    },
    {
      id: 'pay_vehicle',
      groupId: 'finance',
      short: 'عوارض خودرو',
      icon: '🚗',
      accent: '139,92,246',
      title: 'عوارض سالیانه خودرو و موتورسیکلت',
      sub: 'پرداخت متمرکز عوارض تردد و شهرداری وسایل نقلیه',
      badge: { text: 'آنی', tone: 'ok' },
      chips: ['شماره VIN', 'پلاک خودرو', 'تسویه سامانه سمیع'],
      intro:
        'استعلام و پرداخت کشوری عوارض سالیانه خودرو و موتورسیکلت از طریق اتصال به سامانه ملی سمیع. با پرداخت این عوارض، گواهی معتبر شهرداری برای تعویض پلاک و معاینه فنی صادر می‌شود.',
      caps: [
        { icon: '🚘', title: 'استعلام بر اساس VIN', desc: 'محاسبه برخط بر اساس سال ساخت و ارزش رسمی خودرو.' },
        { icon: '📄', title: 'گواهی تسویه معتبر', desc: 'ثبت خودکار در سامانه راهور ناجا جهت تعویض پلاک.' },
        { icon: '🛵', title: 'پشتیبانی از موتورسیکلت', desc: 'امکان پرداخت عوارض سبک برای موتورسیکلت‌های شهری.' }
      ],
      action: { label: 'پرداخت عوارض خودرو', kind: 'toast', toast: 'شماره VIN مندرج روی کارت خودرو را وارد کنید' }
    },
    {
      id: 'pay_clearance',
      groupId: 'finance',
      short: 'مفاصاحساب',
      icon: '📜',
      accent: '139,92,246',
      title: 'صدور مفاصاحساب و عدم بدهی دیجیتال',
      sub: 'دریافت برگه تاییدیه تسویه جهت معاملات ملکی و اسناد',
      badge: { text: 'رسمی', tone: 'live' },
      chips: ['QR کد اصالت', 'دفاتر اسناد رسمی', 'اعتبار قانونی'],
      intro:
        'شهروندان پس از تسویه حساب عوارض می‌توانند مفاصاحساب رسمی دارای امضای دیجیتال و بارکد دوبعدی اعتبارسنجی را مستقیماً دریافت و به دفاتر اسناد رسمی جهت نقل و انتقال قطعی ملک تحویل دهند.',
      caps: [
        { icon: '🔐', title: 'کد امنیتی یکتا', desc: 'غیرقابل جعل با تاییدیه آنلاین سامانه‌های اداری کشور.' },
        { icon: '🖨️', title: 'چاپ نسخه PDF', desc: 'دانلود برگه تمبردار دیجیتال شهرداری ورامین.' }
      ],
      action: { label: 'درخواست مفاصاحساب', kind: 'toast', toast: 'پس از تسویه بدهی‌های جاری، مفاصاحساب آنی صادر می‌شود' }
    },

    /* ---------------- ۲. کسب و کار ---------------- */
    {
      id: 'biz_showcase',
      groupId: 'business',
      short: 'ویترین اصناف',
      icon: '🏪',
      accent: '245,158,11',
      title: 'ویترین دیجیتال اصناف و مشاغل ورامین',
      sub: 'معرفی مغازه‌ها، خدمات، ساعات کاری و آدرس محله',
      badge: { text: 'ویژه', tone: 'new' },
      chips: ['نقشه محله', 'شماره تماس', 'گالری محصولات'],
      intro:
        'هر واحد تجاری و خدماتی در ورامین دارای یک صفحه ویترین اختصاصی است؛ شامل تصاویر فروشگاه، منوی محصولات، تخفیف‌های جاری و موقعیت مکانی جهت رونق اقتصاد محلی و خرید آسان همشهریان.',
      caps: [
        { icon: '🛍️', title: 'صفحه اختصاصی کسب‌وکار', desc: 'معرفی محصولات و خدمات با قابلیت جستجوی نام و رسته شغلی.' },
        { icon: '📍', title: 'مسیریابی روی نقشه', desc: 'امکان هدایت مشتریان به نشانی دقیق فروشگاه.' },
        { icon: '⭐', title: 'نظرات و امتیاز شهروندان', desc: 'ایجاد فضای اعتماد و رقابت سالم در کیفیت خدمات.' }
      ],
      action: { label: 'ثبت و ویرایش ویترین من', kind: 'toast', toast: 'سامانه ثبت ویترین اصناف به زودی آماده دریافت مدارک است' }
    },
    {
      id: 'biz_ads',
      groupId: 'business',
      short: 'ای‌پلاک ادز',
      icon: '📢',
      accent: '245,158,11',
      title: 'ای‌پلاک ادز (تبلیغات محلی هوشمند)',
      sub: 'نمایش آگهی کسب‌وکارها به اهالی محلات مرتبط',
      badge: { text: 'هدفمند', tone: 'live' },
      chips: ['تبلیغات محلی', 'بنر درون‌برنامه', 'بالاترین بازدهی'],
      intro:
        'سامانه مدرن تبلیغات درون‌برنامه‌ای ای‌پلاک به صاحبان کسب‌وکارهای ورامین این امکان را می‌دهد که بنرها و جشنواره‌های فروش خود را دقیقاً به ساکنان همان منطقه یا مخاطبان هدف نمایش دهند.',
      caps: [
        { icon: '🎯', title: 'تفکیک جغرافیایی محلات', desc: 'انتخاب نمایش تبلیغ در میدان امام، کارخانه قند، خیرآباد و...' },
        { icon: '📊', title: 'گزارش شفاف کلیک و بازدید', desc: 'مشاهده آمار واقعی علاقه‌مندی شهروندان به تبلیغ شما.' }
      ],
      action: { label: 'سفارش تبلیغات محلی', kind: 'toast', toast: 'بسته‌های تبلیغاتی محله‌محور ای‌پلاک ادز' }
    },
    {
      id: 'biz_license',
      groupId: 'business',
      short: 'پروانه کسب',
      icon: '📋',
      accent: '245,158,11',
      title: 'صدور و تمدید پروانه کسب الکترونیک',
      sub: 'پیگیری پرونده جواز صنفی با اتصال به درگاه ملی مجوزها',
      badge: { text: 'یکپارچه', tone: 'ok' },
      chips: ['استعلام آنلاین', 'بدون کاغذبازی', 'درگاه ملی'],
      intro:
        'تسریع روند اخذ استعلامات سه‌گانه شهرداری (آتش‌نشانی، عوارض و نظارت فنی) برای دریافت یا تمدید جواز کسب اصناف شهرستان ورامین بدون نیاز به دویدن در شعب اداری.',
      caps: [
        { icon: '⚡', title: 'استعلامات همزمان', desc: 'ارسال خودکار مدارک به ایمنی، شهرسازی و مالی شهرداری.' },
        { icon: '🔔', title: 'اطلاع‌رسانی وضعیت پرونده', desc: 'پیامک مرحله به مرحله تایید یا نیاز به رفع نقص.' }
      ],
      action: { label: 'پیگیری استعلام جواز', kind: 'toast', toast: 'کد رهگیری درگاه ملی مجوزها را آماده داشته باشید' }
    },
    {
      id: 'biz_market',
      groupId: 'business',
      short: 'بازارچه محلی',
      icon: '🧺',
      accent: '245,158,11',
      title: 'بازارچه محلی و صنایع دستی ورامین',
      sub: 'معرفی فرش ورامین، سفال، محصولات کشاورزی و مشاغل خانگی',
      badge: { text: 'حمایت', tone: 'new' },
      chips: ['فرش ورامین', 'محصولات خانگی', 'فروش مستقیم'],
      intro:
        'بستری برای توانمندسازی تولیدکنندگان بومی، بانوان سرپرست خانوار و هنرمندان ورامینی جهت معرفی و عرضه دست‌سازه‌ها، قالی و گلیم اصیل ورامین، ترشیجات و محصولات کشاورزی دشت ورامین.',
      caps: [
        { icon: '🧶', title: 'اصالت فرش ورامین', desc: 'معرفی طرح‌های کهن میناخانی و لچک‌ترنج با شناسنامه بومی.' },
        { icon: '🥬', title: 'محصولات ارگانیک دشت', desc: 'عرضه مستقیم صیفی‌جات و محصولات باغی مزارع ورامین.' }
      ],
      action: { label: 'مشاهده غرفه‌های بازارچه', kind: 'toast', toast: 'بازارچه محصولات بومی ورامین در حال بارگذاری است' }
    },

    /* ---------------- ۳. محیط زیست و بازیافت ---------------- */
    {
      id: 'env_pickup',
      groupId: 'environment',
      short: 'جمع‌آوری پسماند',
      icon: '♻️',
      accent: '16,185,129',
      title: 'درخواست جمع‌آوری پسماند خشک در محل',
      sub: 'اعزام خودرو بازیافت درب منزل یا محل کار شما',
      badge: { text: 'درب محل', tone: 'ok' },
      chips: ['کاغذ و کارتن', 'پلاستیک و فلز', 'ضایعات الکترونیک'],
      intro:
        'تفکیک کنید و در محل تحویل دهید! با ثبت درخواست آنلاین در ای‌پلاک، خودروهای جمع‌آوری پسماند خشک شهرداری ورامین در زمان انتخابی شما به آدرس مراجعه کرده و ضایعات را با ترازوی دیجیتال وزن‌کشی می‌کنند.',
      caps: [
        { icon: '⏰', title: 'تعیین ساعت دلخواه', desc: 'امکان انتخاب بازه صبح یا عصر برای مراجعه راننده بازیافت.' },
        { icon: '⚖️', title: 'توزین دیجیتال', desc: 'محاسبه دقیق ارزش ریالی ضایعات و ثبت آنی در سامانه.' },
        { icon: '💳', title: 'شارژ کیف پول سبز', desc: 'واریز نقدی به حساب شهروند یا استفاده برای پرداخت عوارض.' }
      ],
      action: {
        label: 'ثبت درخواست جمع‌آوری بازیافت',
        kind: 'screen',
        target: 'screen-report',
        toast: 'دسته‌بندی را «پسماند و بازیافت» انتخاب فرمایید'
      }
    },
    {
      id: 'env_wallet',
      groupId: 'environment',
      short: 'کیف پول سبز',
      icon: '🌱',
      accent: '16,185,129',
      title: 'کیف پول سبز شهروندی',
      sub: 'دریافت پاداش نقدی و اعتبار عوارض در ازای تفکیک زباله',
      badge: { text: 'پاداش نقدی', tone: 'live' },
      chips: ['تخفیف عوارض', 'کارت هدیه', 'کاهش زباله'],
      intro:
        'هر کیلوگرم پسماند خشک تحویل داده شده به منزله امتیاز و اعتبار در کیف پول سبز شماست. می‌توانید این موجودی را برای تخفیف عوارض شهرداری، خرید بلیت اتوبوس یا واریز مستقیم به کارت شتاب استفاده کنید.',
      caps: [
        { icon: '📈', title: 'نرخ‌نامه روزانه اقلام', desc: 'شفافیت کامل در قیمت هر کیلوگرم پت، آهن، آلومینیوم و کاغذ.' },
        { icon: '🌳', title: 'شاخص سهم من در محیط‌زیست', desc: 'مشاهده معادل درختان نجات‌یافته توسط تفکیک شما.' }
      ],
      action: { label: 'مشاهده موجودی کیف پول سبز', kind: 'toast', toast: 'موجودی کیف پول سبز شما فعال است' }
    },
    {
      id: 'env_kiosks',
      groupId: 'environment',
      short: 'غرفه‌های بازیافت',
      icon: '📍',
      accent: '16,185,129',
      title: 'موقعیت کانکس‌ها و ایستگاه‌های بازیافت',
      sub: 'آدرس، ساعات کاری و نقشه تحویل حضوری پسماند خشک',
      badge: { text: 'نقشه شهری', tone: 'ok' },
      chips: ['ایستگاه محلی', 'تحویل آنی', 'اقلام بهداشتی'],
      intro:
        'مکان‌یابی نزدیک‌ترین غرفه بازیافت شهرداری در میادین و پارک‌های ورامین. در این ایستگاه‌ها می‌توانید پسماند خشک را تحویل داده و بسته‌های شوینده، کیسه زباله یا گل و گیاه آپارتمانی هدیه بگیرید.',
      caps: [
        { icon: '🗺️', title: 'نمایش روی نقشه ورامین', desc: 'مشاهده نزدیک‌ترین کانکس با فاصله کیلومتری.' },
        { icon: '🎁', title: 'تبادل کالا به کالا', desc: 'دریافت گل، نمک بهداشتی و کیسه تفکیک به ازای کاغذ باطله.' }
      ],
      action: { label: 'مشاهده غرفه‌ها روی نقشه', kind: 'screen', target: 'screen-map' }
    },
    {
      id: 'env_report',
      groupId: 'environment',
      short: 'گزارش نخاله',
      icon: '⚠️',
      accent: '16,185,129',
      title: 'گزارش تخلیه نخاله و آلودگی شهری',
      sub: 'ثبت فوری تخلفات زیست‌محیطی با ارسال موقعیت و عکس',
      badge: { text: 'رسیدگی ۱۲ ساعته', tone: 'live' },
      chips: ['تخلیه غیرمجاز', 'فاضلاب معابر', 'جمع‌آوری فوری'],
      intro:
        'مشاهده تخلیه نخاله‌های ساختمانی در حاشیه جاده‌ها یا آلودگی انهار شهری؟ با ثبت تصویر و لوکیشن در ای‌پلاک، گشت‌های بازرسی پسماند ظرف چند ساعت در محل حاضر شده و اقدام قانونی می‌نمایند.',
      caps: [
        { icon: '📸', title: 'پیوست عکس و فیلم', desc: 'مستندسازی دقیق تخلف جهت برخورد مراجع قضایی.' },
        { icon: '🚨', title: 'اعزام اکیپ پاکسازی', desc: 'پاکسازی معبر توسط لودر و کامیون‌های مدیریت پسماند.' }
      ],
      action: { label: 'ثبت تخلف نخاله و آلودگی', kind: 'screen', target: 'screen-report' }
    },

    /* ---------------- ۴. حمل و نقل و ترافیک ---------------- */
    {
      id: 'trn_fleet',
      groupId: 'transport',
      short: 'پایش ناوگان',
      icon: '🚌',
      accent: '59,130,246',
      title: 'پایش لحظه‌ای اتوبوس و تاکسی ورامین',
      sub: 'مشاهده زنده حرکت اتوبوس‌ها و تاکسی‌ها روی نقشه شهر',
      badge: { text: 'زنده GPS', tone: 'live' },
      chips: ['زمان رسیدن', 'خطوط اتوبوسرانی', 'خطوط تاکسیرانی'],
      intro:
        'دیگر در ایستگاه معطل نمانید! سامانه ردیابی ماهواره‌ای (AVL) اتوبوس‌ها و تاکسی‌های خطی ورامین، مکان لحظه‌ای خودرو و زمان دقیق رسیدن به ایستگاه شما را تخمین می‌زند.',
      caps: [
        { icon: '📡', title: 'ردیابی زنده مکانی', desc: 'مشاهده حرکت اتوبوس‌های خط راه‌آهن، خیرآباد، قرچک و میدان امام.' },
        { icon: '⏱️', title: 'تخمین زمان انتظار', desc: 'محاسبه زمان تقریبی ورود به ایستگاه بر مبنای ترافیک معابر.' },
        { icon: '📢', title: 'ثبت شکایات و اشیاء گمشده', desc: 'پیگیری سریع جامانده‌ها در ناوگان عمومی ورامین.' }
      ],
      action: { label: 'مشاهده زنده ناوگان روی نقشه', kind: 'screen', target: 'screen-map' }
    },
    {
      id: 'trn_metro',
      groupId: 'transport',
      short: 'مترو و قطار',
      icon: '🚇',
      accent: '59,130,246',
      title: 'برنامه حرکت قطار حومه‌ای و مترو ورامین - تهران',
      sub: 'ساعت حرکت ایستگاه راه‌آهن ورامین به تهران و بالعکس',
      badge: { text: 'جدول روزانه', tone: 'ok' },
      chips: ['قطار حومه‌ای', 'ایستگاه راه‌آهن', 'اطلاع از تاخیرها'],
      intro:
        'جدول کامل و لحظه‌ای حرکت قطارهای حومه‌ای ورامین به ایستگاه‌های تهران، ری، پیشوا و گرمسار. همراه با اعلام آنی تاخیرها یا تغییرات در برنامه حرکت در روزهای تعطیل و کاری.',
      caps: [
        { icon: '⏰', title: 'برنامه ساعتی رفت و برگشت', desc: 'حرکت منظم قطارهای صبحگاهی به سمت تهران و عصرگاهی به ورامین.' },
        { icon: '🔔', title: 'هشدار تاخیر و لغو', desc: 'اعلان فوری تغییرات در حرکت قطارها به مسافران روزانه.' },
        { icon: '🎫', title: 'خرید بلیت قطار حومه‌ای', desc: 'لینک مستقیم به سامانه فروش الکترونیک رجا.' }
      ],
      action: { label: 'مشاهده جدول حرکت قطارها', kind: 'toast', toast: 'ساعت حرکت قطارهای حومه‌ای ورامین به‌روزرسانی شد' }
    },
    {
      id: 'trn_ticket',
      groupId: 'transport',
      short: 'بلیت الکترونیک',
      icon: '💳',
      accent: '59,130,246',
      title: 'کارت بلیت شهری و شارژ الکترونیک',
      sub: 'شارژ آنلاین کارت اتوبوس و خرید بلیت تک‌سفره با QR',
      badge: { text: 'کارت‌خوان NFC', tone: 'ok' },
      chips: ['شارژ با موبایل', 'بلیت بارکدی', 'بدون پول نقد'],
      intro:
        'پایان دغدغه پول خرد در اتوبوس‌های ورامین! با ثبت شماره سریال کارت اتوبوس، آن را در چند ثانیه از طریق درگاه بانکی شارژ کنید یا با خرید بلیت بارکدی، گوشی خود را جلوی بارکدخوان بگیرید.',
      caps: [
        { icon: '📲', title: 'شارژ با کارت بانکی', desc: 'افزایش اعتبار آنی کارت اتوبوس بدون مراجعه به باجه.' },
        { icon: '🎟️', title: 'بلیت بارکدی تک‌سفره', desc: 'تولید بارکد دوبعدی روی صفحه برای مسافران میهمان.' }
      ],
      action: { label: 'شارژ کارت اتوبوس', kind: 'toast', toast: 'شماره سریال ۱۶ رقمی کارت اتوبوس را وارد نمایید' }
    },
    {
      id: 'trn_traffic_plan',
      groupId: 'transport',
      short: 'طرح ترافیک',
      icon: '🛑',
      accent: '59,130,246',
      title: 'طرح ترافیک و مجوزهای تردد شهری',
      sub: 'استعلام دوربین‌های پلاک‌خوان و رزرو تردد در هسته مرکزی',
      badge: { text: 'مرکز شهر', tone: 'live' },
      chips: ['میدان امام', 'دوربین پلاک‌خوان', 'سهمیه ساکنین'],
      intro:
        'مدیریت تردد خودروها در محدوده‌های پرترافیک تجاری ورامین (خیابان شهدا، میدان امام و خیابان طالقانی). استعلام تردد غیرمجاز و امکان ثبت پلاک ساکنان و کسبه جهت تردد آسان.',
      caps: [
        { icon: '📷', title: 'استعلام با شماره پلاک', desc: 'مشاهده ساعات ثبت تخلف توسط دوربین‌های هوشمند شهری.' },
        { icon: '🏡', title: 'ثبت سهمیه اهالی محل', desc: 'معافیت و تخفیف ویژه برای ساکنان داخل محدوده مرکزی.' }
      ],
      action: { label: 'استعلام وضعیت پلاک', kind: 'toast', toast: 'پلاک خودرو را برای استعلام تردد وارد فرمایید' }
    },

    /* ---------------- ۵. مناقصات و مزایده‌ها ---------------- */
    {
      id: 'tnd_civil',
      groupId: 'tenders',
      short: 'مناقصات عمرانی',
      icon: '🏗️',
      accent: '239,68,68',
      title: 'مناقصات پروژه‌های عمرانی، آسفالت و تاسیسات',
      sub: 'آگهی فراخوان پیمانکاران برای پروژه‌های زیربنایی شهر ورامین',
      badge: { text: 'فراخوان جاری', tone: 'new' },
      chips: ['آسفالت معابر', 'جدول‌گذاری', 'برآورد ریالی رسمی'],
      intro:
        'فهرست به‌روز تمامی مناقصات عمومی، یک‌مرحله‌ای و دومرحله‌ای شهرداری ورامین شامل بهسازی آسفالت معابر، احداث بوستان‌ها، ساخت پل‌های تقاطع غیرهمسطح، جدول‌گذاری و پروژه‌های هدایت آب‌های سطحی.',
      caps: [
        { icon: '📑', title: 'اطلاعات کامل مناقصه', desc: 'شامل شماره فراخوان سامانه ستاد ایران، مبلغ برآورد و مهلت ارسال.' },
        { icon: '🏢', title: 'ویژه شرکت‌های واجد صلاحیت', desc: 'پیمانکاران دارای رتبه معتبر از سازمان مدیریت و برنامه‌ریزی.' },
        { icon: '📥', title: 'دانلود فایل مشخصات فنی', desc: 'دریافت رایگان دفترچه مشخصات و نقشه‌های اجرایی پروژه.' }
      ],
      action: { label: 'مشاهده مناقصات فعال', kind: 'toast', toast: 'فهرست مناقصات فعال شهرداری در سامانه تدارکات دولت (ستاد)' }
    },
    {
      id: 'tnd_property',
      groupId: 'tenders',
      short: 'مزایده املاک',
      icon: '🏛️',
      accent: '239,68,68',
      title: 'مزایده‌های املاک، اراضی و غرفه‌های تجاری',
      sub: 'فروش زمین، اجاره غرفه‌های میادین میوه و بیلبوردهای تبلیغاتی',
      badge: { text: 'رقابتی', tone: 'live' },
      chips: ['فروش زمین', 'اجاره غرفه', 'قیمت پایه کارشناسی'],
      intro:
        'آگهی‌های رسمی مزایده عمومی شهرداری ورامین جهت واگذاری املاک، فروش قطعات تفکیکی مصوب، اجاره غرفه‌های بازار روز و میادین میوه و تره‌بار، و واگذاری بیلبوردهای تبلیغاتی به بالاترین قیمت پیشنهادی.',
      caps: [
        { icon: '⚖️', title: 'قیمت‌گذاری کارشناس رسمی', desc: 'شفافیت کامل در قیمت پایه اعلامی کانون کارشناسان دادگستری.' },
        { icon: '💰', title: 'شرایط سپرده شرکت در مزایده', desc: 'ضمانت‌نامه بانکی یا فیش واریز نقدی ۵ درصدی.' },
        { icon: '📅', title: 'تاریخ بازگشایی پاکت‌ها', desc: 'تقویم دقیق جلسه کمیسیون عالی معاملات شهرداری.' }
      ],
      action: { label: 'مشاهده آگهی‌های مزایده', kind: 'toast', toast: 'اسناد مزایده املاک و غرفه‌های تجاری ورامین' }
    },
    {
      id: 'tnd_inquiry',
      groupId: 'tenders',
      short: 'استعلام بها',
      icon: '🔍',
      accent: '239,68,68',
      title: 'استعلام بهای خریدهای جزئی و متوسط',
      sub: 'تامین اقلام، تجهیزات اداری، قطعات خودرو و ماشین‌آلات',
      badge: { text: 'خرید سریع', tone: 'ok' },
      chips: ['تامین‌کنندگان کالا', 'ثبت پیش‌فاکتور', 'تسویه نقدی'],
      intro:
        'سامانه ثبت پیشنهاد قیمت برای کسبه و فروشندگان معتبر ورامین جهت تامین ملزومات، قطعات یدکی خودروهای آتش‌نشانی و خدمات شهری، رنگ ترافیکی و تجهیزات اداری شهرداری.',
      caps: [
        { icon: '📦', title: 'فهرست نیازمندی‌های روز', desc: 'مشاهده لیست کالاهای مورد نیاز مناطق و سازمان‌های شهرداری.' },
        { icon: '📤', title: 'بارگذاری پیش‌فاکتور رسمی', desc: 'ارسال آنلاین پیش‌فاکتور ممهور به مهر فروشگاه.' }
      ],
      action: { label: 'ارسال پیشنهاد قیمت', kind: 'toast', toast: 'سامانه استعلام بهای تدارکات شهرداری' }
    },
    {
      id: 'tnd_docs',
      groupId: 'tenders',
      short: 'اسناد مناقصه',
      icon: '📂',
      accent: '239,68,68',
      title: 'دریافت اسناد و فرم‌های پیشنهاد قیمت',
      sub: 'دانلود بسته‌های اسناد، شرایط عمومی پیمان و برگه‌های ارزیابی',
      badge: { text: 'دانلود رایگان', tone: 'ok' },
      chips: ['فرمت PDF و Excel', 'آنالیز قیمت', 'ضوابط ایمنی HSE'],
      intro:
        'دسترسی مستقیم و بدون واسطه به مستندات مناقصات و مزایدات جاری؛ شامل شرایط عمومی و اختصاصی، جدول مقادیر کار (فهرست‌بها) و فرم‌های تعهدنامه اخلاقی و فنی.',
      caps: [
        { icon: '💾', title: 'دانلود یکپارچه بسته اسناد', desc: 'دانلود دفترچه‌ها بدون نیاز به پرداخت هزینه دفتری.' },
        { icon: '📐', title: 'چک‌لیست مدارک پاکت الف، ب و ج', desc: 'راهنمای گام به گام تشکیل پاکت‌های دربسته مناقصه.' }
      ],
      action: { label: 'دانلود بسته‌های اسناد', kind: 'toast', toast: 'بسته اسناد و شرایط مناقصات با فرمت PDF دانلود شد' }
    },
    {
      id: 'tnd_winners',
      groupId: 'tenders',
      short: 'برندگان و شفافیت',
      icon: '🏆',
      accent: '239,68,68',
      title: 'سامانه شفافیت و اعلام برندگان مناقصات',
      sub: 'آرشیو قراردادهای منعقده، مبالغ برنده و ناظرین پروژه',
      badge: { text: 'شفافیت ۱۰۰٪', tone: 'live' },
      chips: ['سامانه شفافیت', 'مبلغ قرارداد', 'نام برنده'],
      intro:
        'در راستای اتاق شیشه‌ای و مبارزه با فساد، نتایج کلیه معاملات و قراردادهای شهرداری ورامین شامل نام پیمانکار برنده، مبلغ پیشنهادی، مدت قرارداد و درصد پیشرفت فیزیکی برای عموم شهروندان منتشر می‌شود.',
      caps: [
        { icon: '🔍', title: 'آرشیو قراردادها به تفکیک سال', desc: 'دسترسی به سوابق پروژه‌های انجام‌شده از سال ۱۳۹۵ تاکنون.' },
        { icon: '👥', title: 'مشخصات ناظرین پروژه', desc: 'نام مهندسین ناظر شهرداری جهت گزارش مردمی کیفیت اجرا.' }
      ],
      action: { label: 'مشاهده سامانه شفافیت قراردادها', kind: 'toast', toast: 'سامانه شفافیت معاملات شهرداری ورامین' }
    },

    /* ---------------- ۶. آرامستان‌ها ---------------- */
    {
      id: 'cem_buy',
      groupId: 'cemeteries',
      short: 'خرید و رزرو قبر',
      icon: '🕊️',
      accent: '14,165,233',
      title: 'خرید و رزرو آنلاین قبر در آرامستان حسین‌رضا (ع)',
      sub: 'انتخاب قطعه، فاز جدید توسعه، پیش‌خرید با کد ملی',
      badge: { text: 'رزرو رسمی', tone: 'new' },
      chips: ['آرامستان حسین‌رضا', 'انتخاب قطعه', 'ثبت سند رسمی'],
      intro:
        'سامانه رسمی خرید و پیش‌خرید قطعات و قبور آرامستان متمرکز بهشت حسین‌رضا (ع) ورامین. امکان مشاهده ظرفیت قطعات جاری، قطعات فاز توسعه جدید، قطعه خانوادگی و آرامگاه‌های مسقف با صدور پیش‌سند رسمی شهرداری.',
      caps: [
        { icon: '🗺️', title: 'نقشه قطعه‌بندی آرامستان', desc: 'مشاهده موقعیت مکانی قطعات ۱ تا ۵۰ و فازهای نوساز.' },
        { icon: '🏷️', title: 'انتخاب طبقات قبر', desc: 'امکان انتخاب قبر یک‌طبقه، دو‌طبقه یا سه‌طبقه استاندارد بتنی.' },
        { icon: '📜', title: 'صدور پیش‌سند معتبر', desc: 'ثبت شناسه یکتا با کد ملی سرپرست در پایگاه داده شهرداری.' },
        { icon: '💳', title: 'امکان پرداخت اقساطی', desc: 'تسهیلات خرید برای متقاضیان قبور خانوادگی و آرامگاه‌ها.' }
      ],
      action: { label: 'ثبت درخواست رزرو قبر', kind: 'toast', toast: 'فرم انتخاب قطعه و رزرو قبر آرامستان حسین‌رضا (ع)' }
    },
    {
      id: 'cem_tariffs',
      groupId: 'cemeteries',
      short: 'استعلام قیمت قبور',
      icon: '📊',
      accent: '14,165,233',
      title: 'استعلام قیمت و تعرفه مصوب قبور و خدمات',
      sub: 'نرخ‌نامه رسمی مصوب شورای اسلامی شهر ورامین',
      badge: { text: 'مصوب ۱۴۰۳', tone: 'ok' },
      chips: ['تعرفه رسمی', 'بدون واسطه', 'هزینه تدفین و شستشو'],
      intro:
        'اطلاع کامل و بدون واسطه از قیمت‌های مصوب شورای اسلامی شهر ورامین برای تمامی خدمات آرامستان حسین‌رضا؛ از بهای دفن در قطعات عمومی (رایگان/یارانه‌ای) تا بهای قبور اختصاصی، خدمات شستشو، کافور و کفن و حفر قبر.',
      caps: [
        { icon: '🏷️', title: 'جدول رسمی قیمت قبور', desc: 'قبور عمومی روز: رایگان (فقط خدمات) | طبقه دوم و سوم با تعرفه مصوب.' },
        { icon: '🚿', title: 'تعرفه غسالخانه و شستشو', desc: 'نرخ مصوب تغسیل، تکفین، آمبولانس داخل شهری و نماز میت.' },
        { icon: '🛡️', title: 'جلوگیری از دلال‌بازی', desc: 'قطع دست واسطه‌ها با استعلام شفاف و پرداخت فقط به حساب شهرداری.' }
      ],
      action: { label: 'مشاهده جدول تعرفه‌های مصوب', kind: 'toast', toast: 'جدول تعرفه مصوب سال ۱۴۰۳ آرامستان حسین‌رضا (ع)' }
    },
    {
      id: 'cem_search',
      groupId: 'cemeteries',
      short: 'جستجوی متوفی',
      icon: '🔍',
      accent: '14,165,233',
      title: 'جستجوی متوفی و مکان‌یابی دقیق مزار روی نقشه',
      sub: 'یافتن شماره قطعه، ردیف و مزار با وارد کردن نام یا کد ملی',
      badge: { text: 'مسیریاب مزار', tone: 'live' },
      chips: ['نام و نشان', 'شماره قطعه و ردیف', 'مسیریابی با GPS'],
      intro:
        'به دنبال آرامگاه بستگان یا شهدای گرانقدر در آرامستان حسین‌رضا ورامین هستید؟ کافی است نام، نام خانوادگی یا سال وفات را وارد کنید تا موقعیت دقیق قطعه، ردیف و شماره مزار به همراه نقشه مسیریابی قدم به قدم نمایش داده شود.',
      caps: [
        { icon: '🪦', title: 'بانک جامع متوفیان ورامین', desc: 'سوابق کامل از دهه ۵۰ تا متوفیان روز با تصویر سنگ مزار.' },
        { icon: '🌹', title: 'مکان‌یابی مزار شهدای انقلاب و دفاع مقدس', desc: 'بخش ویژه گلزار شهدای حسین‌رضا (ع) ورامین.' },
        { icon: '📍', title: 'هدایت تا سر مزار', desc: 'نمایش خط سیر حرکتی از درب اصلی آرامستان تا قطعه مورد نظر.' }
      ],
      action: { label: 'جستجوی متوفی در آرامستان', kind: 'toast', toast: 'نام یا کد ملی متوفی را در کادر جستجو وارد کنید' }
    },
    {
      id: 'cem_eulogy',
      groupId: 'cemeteries',
      short: 'مداح و مراسم',
      icon: '🎙️',
      accent: '14,165,233',
      title: 'رزرو مداح، سیستم صوت و برگزاری مراسم ترحیم',
      sub: 'هماهنگی قاری، اکو، سایبان، صندلی و سالن همایش‌های آرامستان',
      badge: { text: 'رزرو فوری', tone: 'ok' },
      chips: ['مداحان مجرب', 'سیستم صوت و اکو', 'سایبان و صندلی'],
      intro:
        'سامانه رزرو فوری خدمات جانبی تشییع و ترحیم در آرامستان حسین‌رضا. هماهنگی مداحان رسمی، قاریان قرآن، اعزام اکوپرتابل و چادر سایبان، صندلی، میز و رزرو حسینیه و سالن پذیرایی جهت برگزاری شایسته مراسم.',
      caps: [
        { icon: '🎤', title: 'مداحان تاییدشده سازمان', desc: 'امکان انتخاب مداح با نمونه صوت و هماهنگی زمان تشییع یا ختم.' },
        { icon: '⛺', title: 'تجهیزات کامل پذیرایی سر مزار', desc: 'سایبان ضدآفتاب، صندلی‌های تاشو و سیستم صوت اختصاصی.' },
        { icon: '☕', title: 'سالن ترحیم و حسینیه متمرکز', desc: 'رزرو سالن مجهز به سیستم گرمایش/سرمایش و خدمات پذیرایی.' }
      ],
      action: { label: 'رزرو مداح و تجهیزات مراسم', kind: 'toast', toast: 'سرویس رزرو مداح و ملزومات مراسم تشییع فعال شد' }
    },
    {
      id: 'cem_permit',
      groupId: 'cemeteries',
      short: 'گواهی و مجوز دفن',
      icon: '📜',
      accent: '14,165,233',
      title: 'صدور گواهی فوت و ثبت مجوز دفن رسمی',
      sub: 'ثبت الکترونیک برگه پزشک قانونی و پیگیری اداری تدفین',
      badge: { text: 'الکترونیک', tone: 'live' },
      chips: ['پزشکی قانونی', 'مجوز حمل جسد', 'کد رهگیری دفن'],
      intro:
        'ثبت برخط مدارک فوت، مجوز دفن صادره از پزشکی قانونی و بیمارستان‌های ورامین و تهران. دریافت خودکار کد رهگیری دفن و هماهنگی آمبولانس حمل متوفی بدون نیاز به تردد حضوری بین مراکز.',
      caps: [
        { icon: '🚑', title: 'هماهنگی آمبولانس حمل متوفی', desc: 'اعزام خودروی متوفیات با تعرفه استاندارد شهری و بین‌شهری.' },
        { icon: '🔏', title: 'اتصال به ثبت احوال کشور', desc: 'ابطال خودکار شناسنامه و ثبت رسمی واقعه فوت.' }
      ],
      action: { label: 'پیگیری پرونده گواهی دفن', kind: 'toast', toast: 'سامانه ثبت مدارک و استعلام مجوز دفن الکترونیک' }
    },
    {
      id: 'cem_maintenance',
      groupId: 'cemeteries',
      short: 'مرمت سنگ مزار',
      icon: '🌿',
      accent: '14,165,233',
      title: 'خدمات نگهداری، غبارروبی و نصب سنگ مزار',
      sub: 'سفارش شستشوی دوره‌ای، گل‌کاری فصلی و حکاکی سنگ',
      badge: { text: 'سفارش آنلاین', tone: 'ok' },
      chips: ['غبارروبی هفتگی', 'نصب سنگ مزار', 'گل‌کاری شب جمعه'],
      intro:
        'ویژه شهروندان و همشهریانی که در ورامین حضور ندارند؛ امکان سفارش آنلاین شستشوی سنگ مزار در شب‌های جمعه، گل‌آرایی فصلی، مرمت نوشته‌های سنگ مزار و ارسال عکس تاییدیه خدمت پس از انجام کار.',
      caps: [
        { icon: '📸', title: 'ارسال تصویر پس از خدمت', desc: 'مشاهده عکس سنگ مزار شسته و گل‌آرایی شده در پروفایل.' },
        { icon: '🪨', title: 'سفارش حکاکی سنگ مزار', desc: 'انتخاب طرح سنگ، شعر و خطاطی با نظارت شهرداری.' }
      ],
      action: { label: 'سفارش خدمات آرامگاه', kind: 'toast', toast: 'سفارش شستشو و گل‌آرایی مزار با موفقیت ثبت شد' }
    }
  ];

  /* گروه‌بندی ۶ دسته مربعی در صفحه خدمات (فارسی) */
  const SERVICE_GROUPS = [
    {
      id: 'finance',
      title: 'عوارض شهرداری',
      desc: 'عوارض نوسازی، پسماند، اصناف، خودرو و مفاصاحساب',
      icon: '💳',
      accent: '139,92,246',
      accentColor: '#a78bfa',
      badge: '۵ خدمت',
      ids: ['pay_renovation', 'pay_waste', 'pay_business', 'pay_vehicle', 'pay_clearance']
    },
    {
      id: 'business',
      title: 'کسب و کار',
      desc: 'ویترین اصناف، ای‌پلاک ادز، پروانه و بازارچه ورامین',
      icon: '🏪',
      accent: '245,158,11',
      accentColor: '#fbbf24',
      badge: '۴ خدمت',
      ids: ['biz_showcase', 'biz_ads', 'biz_license', 'biz_market']
    },
    {
      id: 'environment',
      title: 'محیط زیست و بازیافت',
      desc: 'جمع‌آوری درب محل، کیف پول سبز، غرفه‌ها و گزارش نخاله',
      icon: '♻️',
      accent: '16,185,129',
      accentColor: '#34d399',
      badge: '۴ خدمت',
      ids: ['env_pickup', 'env_wallet', 'env_kiosks', 'env_report']
    },
    {
      id: 'transport',
      title: 'حمل و نقل و ترافیک',
      desc: 'پایش زنده ناوگان، مترو، قطار حومه‌ای و طرح ترافیک',
      icon: '🚇',
      accent: '59,130,246',
      accentColor: '#60a5fa',
      badge: '۴ خدمت',
      ids: ['trn_fleet', 'trn_metro', 'trn_ticket', 'trn_traffic_plan']
    },
    {
      id: 'tenders',
      title: 'مناقصات و مزایده‌ها',
      desc: 'پروژه‌های عمرانی، مزایده املاک، استعلام بها و اسناد',
      icon: '📑',
      accent: '239,68,68',
      accentColor: '#fb7185',
      badge: 'شفافیت مالی',
      ids: ['tnd_civil', 'tnd_property', 'tnd_inquiry', 'tnd_docs', 'tnd_winners']
    },
    {
      id: 'cemeteries',
      title: 'آرامستان‌ها',
      desc: 'خرید و رزرو قبر، استعلام تعرفه، مداح و جستجوی متوفی',
      icon: '🕊️',
      accent: '14,165,233',
      accentColor: '#38bdf8',
      badge: 'حسین‌رضا (ع)',
      ids: ['cem_buy', 'cem_tariffs', 'cem_search', 'cem_eulogy', 'cem_permit', 'cem_maintenance']
    }
  ];

  /* =========================================================
     Data — تعریف سرویس‌های تفکیکی (انگلیسی)
  ========================================================= */

  const EPLAK_SERVICES_EN = [
    /* ---------------- 1. Municipal Taxes & Fees ---------------- */
    {
      id: 'pay_renovation',
      groupId: 'finance',
      short: 'Renovation Tax',
      icon: '🏢',
      accent: '139,92,246',
      title: 'Property & Renovation Tax Payment',
      sub: 'Annual municipal property taxes for residential & commercial units',
      badge: { text: 'Online', tone: 'ok' },
      chips: ['Property ID', 'Instant Payment', 'Digital Clearance'],
      intro:
        'Fast and secure inquiry and settlement of annual renovation taxes for residential, commercial, and office properties in Varamin. Enter your 12-digit property ID to view dues and receive instant payment receipts.',
      caps: [
        { icon: '🔢', title: 'Property ID Lookup', desc: 'Instant calculation of current and past dues based on official audit.' },
        { icon: '💳', title: 'Instant Bank Gateway', desc: 'Secure settlement with all Iranian debit cards via Shaparak.' },
        { icon: '🧾', title: 'Digital Receipt & QR', desc: 'Official digital proof stored permanently in your citizen profile.' },
        { icon: '🎁', title: 'Early Payment Discount', desc: 'Automatic 10% bonus discount applied for prompt payments.' }
      ],
      action: { label: 'Proceed to Payment', kind: 'screen', target: 'screen-payment' }
    },
    {
      id: 'pay_waste',
      groupId: 'finance',
      short: 'Waste Management',
      icon: '🗑️',
      accent: '139,92,246',
      title: 'Municipal Waste Management Fee',
      sub: 'Citywide waste collection, sorting & sanitation tariff',
      badge: { text: 'Active', tone: 'ok' },
      chips: ['Official Tariff', 'Annual Settlement', 'Lookup by ID'],
      intro:
        'Varamin Municipality waste management fee portal. Collected funds directly support mechanized garbage collection trucks and keep neighborhood streets clean.',
      caps: [
        { icon: '🧹', title: 'Mechanized Fleet', desc: 'Direct contribution to public hygiene and cleaner neighborhood avenues.' },
        { icon: '📊', title: 'Transparent Household Rates', desc: 'Rate calculation based on unit area approved by City Council.' }
      ],
      action: { label: 'Inquire Waste Fee', kind: 'screen', target: 'screen-payment' }
    },
    {
      id: 'pay_business',
      groupId: 'finance',
      short: 'Business Dues',
      icon: '🏷️',
      accent: '139,92,246',
      title: 'Commercial Dues & Signage Levies',
      sub: 'Annual settlement for commercial storefronts & business signs',
      badge: { text: 'E-Service', tone: 'live' },
      chips: ['License Code', 'Signage Fee', 'No In-Person Visit'],
      intro:
        'Designed for Varamin merchants and shopkeepers to settle occupational taxes and exterior signage fees without queuing at municipal regional branches.',
      caps: [
        { icon: '🏬', title: 'Trade License Lookup', desc: 'View financial balance via your official business registry code.' },
        { icon: '🪧', title: 'Standard Signage Tariff', desc: 'Calculated according to municipal urban beautification rules.' }
      ],
      action: { label: 'Inquire Commercial Dues', kind: 'toast', toast: 'Business tax portal is ready for payment.' }
    },
    {
      id: 'pay_vehicle',
      groupId: 'finance',
      short: 'Vehicle Taxes',
      icon: '🚗',
      accent: '139,92,246',
      title: 'Annual Automobile & Motorcycle Tax',
      sub: 'Centralized municipal vehicle dues settlement via SAMIE',
      badge: { text: 'Instant', tone: 'ok' },
      chips: ['VIN Number', 'License Plate', 'SAMIE Integration'],
      intro:
        'Nationwide vehicle tax inquiry and settlement linked to the SAMIE municipal network. Generates valid clearance certificates required for vehicle transfer and road safety inspections.',
      caps: [
        { icon: '🚘', title: 'Lookup by VIN', desc: 'Real-time calculation based on manufacture year and vehicle value.' },
        { icon: '📄', title: 'Police Transfer Certificate', desc: 'Automatic registry in traffic police database.' }
      ],
      action: { label: 'Pay Vehicle Tax', kind: 'toast', toast: 'Enter your 17-digit vehicle VIN code.' }
    },
    {
      id: 'pay_clearance',
      groupId: 'finance',
      short: 'Tax Clearance',
      icon: '📜',
      accent: '139,92,246',
      title: 'Digital Municipal Tax Clearance Certificate',
      sub: 'Official zero-dues certificate for property sales & notary deeds',
      badge: { text: 'Official', tone: 'live' },
      chips: ['QR Verification', 'Notary Accepted', 'Legal Validity'],
      intro:
        'Citizens who have settled all municipal dues can download an official digitally signed tax clearance certificate featuring a QR verification code for property deed transfers.',
      caps: [
        { icon: '🔐', title: 'Unique Security Hash', desc: 'Forgery-proof certificate verifiable by government notaries.' },
        { icon: '🖨️', title: 'Download PDF', desc: 'Instant PDF export with official municipal stamp.' }
      ],
      action: { label: 'Request Clearance Certificate', kind: 'toast', toast: 'Clearance certificate will generate upon settling current dues.' }
    },

    /* ---------------- 2. Business & Commerce ---------------- */
    {
      id: 'biz_showcase',
      groupId: 'business',
      short: 'Storefronts',
      icon: '🏪',
      accent: '245,158,11',
      title: 'Local Merchant Digital Storefronts',
      sub: 'Showcase stores, services, working hours and neighborhood addresses',
      badge: { text: 'Featured', tone: 'new' },
      chips: ['Neighborhood Map', 'Contact Numbers', 'Product Catalog'],
      intro:
        'Every store and business in Varamin receives a dedicated digital showcase page displaying photos, menus, ongoing promotions, and map coordinates for neighbors to discover.',
      caps: [
        { icon: '🛍️', title: 'Store Profile', desc: 'Showcase offerings with category and name search.' },
        { icon: '📍', title: 'Turn-by-Turn Navigation', desc: 'Guide local customers right to your door.' },
        { icon: '⭐', title: 'Citizen Ratings & Reviews', desc: 'Transparent feedback fostering quality services.' }
      ],
      action: { label: 'Manage My Storefront', kind: 'toast', toast: 'Storefront registry portal opening soon.' }
    },
    {
      id: 'biz_ads',
      groupId: 'business',
      short: 'Eplak Ads',
      icon: '📢',
      accent: '245,158,11',
      title: 'Eplak Ads (Hyperlocal Advertising)',
      sub: 'Display promotional banners to citizens in specific neighborhoods',
      badge: { text: 'Targeted', tone: 'live' },
      chips: ['Local Reach', 'In-App Banner', 'High ROI'],
      intro:
        'Modern in-app advertising platform enabling Varamin business owners to deliver promotions and sale events directly to residents living in their immediate district.',
      caps: [
        { icon: '🎯', title: 'District Targeting', desc: 'Select specific quarters such as Emam Square, Kheirabad, etc.' },
        { icon: '📊', title: 'Live Impressions & Clicks', desc: 'Real-time analytics on citizen engagement.' }
      ],
      action: { label: 'Book Local Ad Campaign', kind: 'toast', toast: 'Hyperlocal Eplak Ads campaign packages.' }
    },
    {
      id: 'biz_license',
      groupId: 'business',
      short: 'Trade License',
      icon: '📋',
      accent: '245,158,11',
      title: 'Digital Business License & Renewal',
      sub: 'Track trade permit applications integrated with National Licensing Portal',
      badge: { text: 'Integrated', tone: 'ok' },
      chips: ['Online Tracking', 'Zero Paperwork', 'National Hub'],
      intro:
        'Accelerates municipal safety, zoning, and tax inquiries required for obtaining or renewing business licenses without endless bureau visits.',
      caps: [
        { icon: '⚡', title: 'Concurrent Clearances', desc: 'Automated forwarding to Fire Safety, Zoning, and Revenue.' },
        { icon: '🔔', title: 'SMS Status Alerts', desc: 'Step-by-step approval and deficit notifications.' }
      ],
      action: { label: 'Track License Inquiries', kind: 'toast', toast: 'Have your national license tracking code ready.' }
    },
    {
      id: 'biz_market',
      groupId: 'business',
      short: 'Local Market',
      icon: '🧺',
      accent: '245,158,11',
      title: 'Varamin Local Crafts & Artisans Market',
      sub: 'Traditional Varamin carpets, pottery, farm goods and cottage industries',
      badge: { text: 'Heritage', tone: 'new' },
      chips: ['Varamin Carpets', 'Fresh Farm Goods', 'Direct Sale'],
      intro:
        'Dedicated marketplace empowering indigenous crafters, home businesses, and farmers across Varamin valley to sell authentic handicrafts, world-renowned carpets, and organic produce.',
      caps: [
        { icon: '🧶', title: 'Authentic Varamin Rugs', desc: 'Historical Mina-Khani patterns certified with artisan passports.' },
        { icon: '🥬', title: 'Farm Fresh Produce', desc: 'Direct-from-farm seasonal harvests from Varamin fields.' }
      ],
      action: { label: 'Browse Artisan Market', kind: 'toast', toast: 'Varamin crafts marketplace loading...' }
    },

    /* ---------------- 3. Environment & Recycling ---------------- */
    {
      id: 'env_pickup',
      groupId: 'environment',
      short: 'Waste Pickup',
      icon: '♻️',
      accent: '16,185,129',
      title: 'On-Demand Recyclable Pickup Request',
      sub: 'Dispatch recycling collection van to your doorstep or workplace',
      badge: { text: 'Doorstep', tone: 'ok' },
      chips: ['Paper & Cardboard', 'Plastic & Metal', 'E-Waste'],
      intro:
        'Sort at home and get rewarded! Submit a request in Eplak to schedule a municipal collection vehicle that weighs recyclables digitally and credits your wallet immediately.',
      caps: [
        { icon: '⏰', title: 'Flexible Time Slots', desc: 'Choose convenient morning or afternoon pickup appointments.' },
        { icon: '⚖️', title: 'Digital Scale Weighing', desc: 'Accurate value calculation logged instantly on-site.' },
        { icon: '💳', title: 'Green Wallet Credits', desc: 'Instant cash payout or municipal fee credits.' }
      ],
      action: {
        label: 'Schedule Pickup Request',
        kind: 'screen',
        target: 'screen-report',
        toast: 'Select category: Waste & Recycling'
      }
    },
    {
      id: 'env_wallet',
      groupId: 'environment',
      short: 'Green Wallet',
      icon: '🌱',
      accent: '16,185,129',
      title: 'Citizen Green Wallet & Rewards',
      sub: 'Earn cash rebates and municipal tax discounts by sorting waste',
      badge: { text: 'Cash Rebate', tone: 'live' },
      chips: ['Tax Discounts', 'Gift Cards', 'Carbon Offset'],
      intro:
        'Every kilogram of segregated recyclables translates into points and credit in your Green Wallet. Redeem your balance for tax write-offs, transit passes, or direct bank cash transfers.',
      caps: [
        { icon: '📈', title: 'Daily Scrap Price Index', desc: 'Transparent pricing for PET, aluminum, copper, and paper.' },
        { icon: '🌳', title: 'My Environmental Impact', desc: 'Track number of trees saved and CO2 offset by your efforts.' }
      ],
      action: { label: 'View Green Balance', kind: 'toast', toast: 'Your Green Wallet is active.' }
    },
    {
      id: 'env_kiosks',
      groupId: 'environment',
      short: 'Recycle Kiosks',
      icon: '📍',
      accent: '16,185,129',
      title: 'Recycling Kiosk & Station Locator',
      sub: 'Addresses, operating hours, and drop-off stations on the city map',
      badge: { text: 'City Map', tone: 'ok' },
      chips: ['Local Kiosk', 'Instant Drop-off', 'Eco Rewards'],
      intro:
        'Locate the closest municipal recycling kiosk in Varamin squares and parks. Drop off recyclables to receive cleaning kits, bio-bags, or potted plants on the spot.',
      caps: [
        { icon: '🗺️', title: 'City Map Navigation', desc: 'Find nearby stations with distance and operating hours.' },
        { icon: '🎁', title: 'Gift Exchange', desc: 'Trade scrap paper for plants, seeds, and hygiene supplies.' }
      ],
      action: { label: 'Find Kiosks on Map', kind: 'screen', target: 'screen-map' }
    },
    {
      id: 'env_report',
      groupId: 'environment',
      short: 'Dump Report',
      icon: '⚠️',
      accent: '16,185,129',
      title: 'Illegal Debris & Pollution Reporting',
      sub: 'Report waste dumping or environmental violations with photo & GPS',
      badge: { text: '12-Hour Action', tone: 'live' },
      chips: ['Illegal Dumping', 'Drainage Runoff', 'Fast Dispatch'],
      intro:
        'Notice construction debris dumped along suburban roads or canal blockages? Snap a photo and attach your GPS pin; sanitation inspectors are dispatched within hours.',
      caps: [
        { icon: '📸', title: 'Photo & Video Proof', desc: 'Provide evidence for immediate municipal court action.' },
        { icon: '🚨', title: 'Bulldozer Clean-up Unit', desc: 'Heavy machinery dispatched to clear public thoroughfares.' }
      ],
      action: { label: 'Report Dumping Incident', kind: 'screen', target: 'screen-report' }
    },

    /* ---------------- 4. Transportation & Traffic ---------------- */
    {
      id: 'trn_fleet',
      groupId: 'transport',
      short: 'Transit Fleet',
      icon: '🚌',
      accent: '59,130,246',
      title: 'Real-Time Bus & Taxi Fleet Tracker',
      sub: 'Live GPS location of municipal buses and shared taxis on the map',
      badge: { text: 'Live GPS', tone: 'live' },
      chips: ['ETA Calculation', 'Bus Routes', 'Taxi Lines'],
      intro:
        'No more waiting in the dark! GPS-tracked municipal buses and shared cabs in Varamin show live coordinates and accurate station arrival time estimates.',
      caps: [
        { icon: '📡', title: 'Live Map Position', desc: 'Watch buses along Railway, Kheirabad, and Central Square lines.' },
        { icon: '⏱️', title: 'Accurate ETA', desc: 'Traffic-aware estimates of vehicle arrival time.' },
        { icon: '📢', title: 'Lost & Found Service', desc: 'Quick recovery channel for items misplaced in public transit.' }
      ],
      action: { label: 'Open Live Fleet Map', kind: 'screen', target: 'screen-map' }
    },
    {
      id: 'trn_metro',
      groupId: 'transport',
      short: 'Train & Metro',
      icon: '🚇',
      accent: '59,130,246',
      title: 'Varamin - Tehran Commuter Train & Metro Timetable',
      sub: 'Daily departure schedule between Varamin Railway Station and Tehran',
      badge: { text: 'Daily Schedule', tone: 'ok' },
      chips: ['Commuter Rail', 'Varamin Station', 'Delay Alerts'],
      intro:
        'Complete real-time timetables for commuter trains connecting Varamin to Tehran, Rey, Pishva, and Garmsar, complete with delay notifications and weekend schedules.',
      caps: [
        { icon: '⏰', title: 'Hourly Train Schedule', desc: 'Frequent morning trains to Tehran and evening return runs.' },
        { icon: '🔔', title: 'Delay & Cancellation Alerts', desc: 'Instant push notifications for daily commuters.' }
      ],
      action: { label: 'View Train Schedule', kind: 'toast', toast: 'Commuter train timetable updated.' }
    },
    {
      id: 'trn_ticket',
      groupId: 'transport',
      short: 'E-Ticket & Card',
      icon: '💳',
      accent: '59,130,246',
      title: 'City Transit Pass & Online Card Recharge',
      sub: 'Recharge bus cards via debit card or buy QR single-ride tickets',
      badge: { text: 'Contactless NFC', tone: 'ok' },
      chips: ['Mobile Top-up', 'QR Code Tickets', 'Cashless City'],
      intro:
        'Say goodbye to loose change! Enter your 16-digit card number to reload bus passes in seconds or generate digital QR tickets to scan directly at the turnstile.',
      caps: [
        { icon: '📲', title: 'Online Debit Top-up', desc: 'Instant card balance refill without ticket kiosk lines.' },
        { icon: '🎟️', title: 'One-Time QR Passes', desc: 'Generate on-screen tickets for occasional riders and visitors.' }
      ],
      action: { label: 'Recharge Bus Pass', kind: 'toast', toast: 'Enter your 16-digit transit card number.' }
    },
    {
      id: 'trn_traffic_plan',
      groupId: 'transport',
      short: 'Traffic Zone',
      icon: '🛑',
      accent: '59,130,246',
      title: 'Downtown Traffic Zone & Permit Management',
      sub: 'Automated ANPR camera inquiries and downtown resident permits',
      badge: { text: 'Downtown Core', tone: 'live' },
      chips: ['Emam Square', 'ANPR Cameras', 'Resident Quota'],
      intro:
        'Traffic regulation for high-density business streets in central Varamin (Shohada, Emam Square, and Taleghani). Inquire plate violations and register local resident permits.',
      caps: [
        { icon: '📷', title: 'Plate Violation Lookup', desc: 'View timestamps captured by smart license-plate cameras.' },
        { icon: '🏡', title: 'Resident Exemption', desc: 'Exemptions and special access for neighborhood residents.' }
      ],
      action: { label: 'Check License Plate Status', kind: 'toast', toast: 'Enter vehicle plate to verify zone status.' }
    },

    /* ---------------- 5. Tenders & Auctions ---------------- */
    {
      id: 'tnd_civil',
      groupId: 'tenders',
      short: 'Civil Tenders',
      icon: '🏗️',
      accent: '239,68,68',
      title: 'Civil Engineering, Asphalt & Infrastructure Tenders',
      sub: 'Official procurement calls for urban development projects in Varamin',
      badge: { text: 'Active Bids', tone: 'new' },
      chips: ['Road Paving', 'Storm Drainage', 'Official Budget'],
      intro:
        'Up-to-date registry of all open public tenders by Varamin Municipality: roadway asphalt surfacing, public park development, highway overpass construction, and water drainage canalization.',
      caps: [
        { icon: '📑', title: 'Tender Specifications', desc: 'Setad Iran portal tender IDs, budget estimates, and bid deadlines.' },
        { icon: '🏢', title: 'Certified Contractors Only', desc: 'Eligibility criteria based on official planning bureau grades.' },
        { icon: '📥', title: 'Free Technical Blueprints', desc: 'Direct download of executive drawings and bill of quantities.' }
      ],
      action: { label: 'View Active Tenders', kind: 'toast', toast: 'Official Varamin civil tenders on Setad platform.' }
    },
    {
      id: 'tnd_property',
      groupId: 'tenders',
      short: 'Property Auctions',
      icon: '🏛️',
      accent: '239,68,68',
      title: 'Municipal Real Estate, Land & Commercial Kiosk Auctions',
      sub: 'Public auctions for municipal lands, marketplace stalls & billboards',
      badge: { text: 'Competitive', tone: 'live' },
      chips: ['Land Sale', 'Market Stall Lease', 'Official Appraisal'],
      intro:
        'Official announcements for municipal real estate auctions: residential plots, marketplace stalls, produce kiosks, and outdoor highway billboard concessions awarded to the highest compliant bidder.',
      caps: [
        { icon: '⚖️', title: 'Justice Ministry Appraisals', desc: 'Full transparency in base auction valuation.' },
        { icon: '💰', title: 'Bid Guarantee Terms', desc: '5% bank guarantee or treasury deposit requirements.' },
        { icon: '📅', title: 'Bid Opening Dates', desc: 'Schedule of public contract committee sessions.' }
      ],
      action: { label: 'Browse Active Auctions', kind: 'toast', toast: 'Varamin municipal property auctions.' }
    },
    {
      id: 'tnd_inquiry',
      groupId: 'tenders',
      short: 'Price Inquiries',
      icon: '🔍',
      accent: '239,68,68',
      title: 'Small & Medium Procurement Inquiries',
      sub: 'Vendor bidding for municipal supplies, machinery parts & safety gear',
      badge: { text: 'Fast Track', tone: 'ok' },
      chips: ['Approved Suppliers', 'Submit Proforma', 'Cash Settlement'],
      intro:
        'Bidding portal for registered suppliers to quote prices for firefighting parts, heavy sanitation truck spares, road marking paints, and city hall hardware.',
      caps: [
        { icon: '📦', title: 'Daily Supply Requisitions', desc: 'Browse purchase orders issued by municipal departments.' },
        { icon: '📤', title: 'Upload Stamped Proforma', desc: 'Submit quotes digitally with your company seal.' }
      ],
      action: { label: 'Submit Price Quote', kind: 'toast', toast: 'Municipal procurement price inquiry portal.' }
    },
    {
      id: 'tnd_docs',
      groupId: 'tenders',
      short: 'Tender Docs',
      icon: '📂',
      accent: '239,68,68',
      title: 'Download Tender Documents & Bid Forms',
      sub: 'Free packages of contractual clauses, bill of quantities & price sheets',
      badge: { text: 'Free Download', tone: 'ok' },
      chips: ['PDF & Excel', 'Cost Analysis', 'HSE Safety Rules'],
      intro:
        'Instant direct access to documentation for all active bidding events: general contractual conditions, price analysis sheets, and integrity pledges without fees.',
      caps: [
        { icon: '💾', title: 'Complete Document Bundles', desc: 'Download official guidelines without filing fees.' },
        { icon: '📐', title: 'Packet A, B & C Checklist', desc: 'Step-by-step checklist to prepare sealed bid submissions.' }
      ],
      action: { label: 'Download Bid Package', kind: 'toast', toast: 'Tender documentation bundle downloaded in PDF format.' }
    },
    {
      id: 'tnd_winners',
      groupId: 'tenders',
      short: 'Award Registry',
      icon: '🏆',
      accent: '239,68,68',
      title: 'Contract Transparency & Awardee Registry',
      sub: 'Archive of signed contracts, winning amounts & project supervisors',
      badge: { text: '100% Transparent', tone: 'live' },
      chips: ['Transparency Hub', 'Contract Value', 'Winning Contractor'],
      intro:
        'Promoting accountability and zero corruption: all Varamin municipal contracts, winning bidders, awarded sums, and physical progress milestones are published for citizen inspection.',
      caps: [
        { icon: '🔍', title: 'Historical Contract Archive', desc: 'Access archived municipal works from 2016 to the present.' },
        { icon: '👥', title: 'Supervising Engineers', desc: 'Names of certified site inspectors for citizen quality oversight.' }
      ],
      action: { label: 'Explore Transparency Portal', kind: 'toast', toast: 'Varamin Municipal Contract Transparency Hub.' }
    },

    /* ---------------- 6. Cemeteries & Memorials ---------------- */
    {
      id: 'cem_buy',
      groupId: 'cemeteries',
      short: 'Grave Booking',
      icon: '🕊️',
      accent: '14,165,233',
      title: 'Hossein Reza Cemetery Grave Purchase & Booking',
      sub: 'Select burial plot, expansion phases, and advance reservation by National ID',
      badge: { text: 'Official Deed', tone: 'new' },
      chips: ['Hossein Reza', 'Select Plot', 'Official Title'],
      intro:
        'Official online portal for purchasing and reserving burial plots in Behesht-e Hossein Reza Cemetery in Varamin. View available capacity in existing blocks, newly developed phases, and family mausoleums.',
      caps: [
        { icon: '🗺️', title: 'Interactive Cemetery Map', desc: 'Browse plots 1 through 50 and newly opened sectors.' },
        { icon: '🏷️', title: 'Tier Selection', desc: 'Choose single, double, or triple prefabricated reinforced tiers.' },
        { icon: '📜', title: 'Official Municipal Deed', desc: 'Assigned with a unique title ID registered to your National ID.' },
        { icon: '💳', title: 'Installment Plans', desc: 'Flexible payment plans for family burial sanctuaries.' }
      ],
      action: { label: 'Book Burial Plot', kind: 'toast', toast: 'Hossein Reza Cemetery plot reservation portal.' }
    },
    {
      id: 'cem_tariffs',
      groupId: 'cemeteries',
      short: 'Burial Tariffs',
      icon: '📊',
      accent: '14,165,233',
      title: 'Approved Grave Tariffs & Funeral Services Price List',
      sub: 'Official municipal price schedule approved by City Council',
      badge: { text: '2026 Rates', tone: 'ok' },
      chips: ['Official Rates', 'No Middlemen', 'Sanitation Fees'],
      intro:
        'Direct information on official City Council rates for Hossein Reza Cemetery: from subsidized public burials to private plots, mortuary preparation, shrouds, and transport.',
      caps: [
        { icon: '🏷️', title: 'Official Plot Price Table', desc: 'First-tier public plots subsidized | Tier 2 & 3 fixed council rates.' },
        { icon: '🚿', title: 'Mortuary & Transport Rates', desc: 'Fixed rates for washing, shrouds, hearse, and funeral prayers.' },
        { icon: '🛡️', title: 'Zero Middleman Markups', desc: 'Transparent billing settled directly into municipal treasury.' }
      ],
      action: { label: 'View Approved Tariff Schedule', kind: 'toast', toast: 'Official Hossein Reza Cemetery tariff list.' }
    },
    {
      id: 'cem_search',
      groupId: 'cemeteries',
      short: 'Deceased Locator',
      icon: '🔍',
      accent: '14,165,233',
      title: 'Search Deceased & Map-Guided Grave Locator',
      sub: 'Find plot, row, and grave numbers by deceased name or national code',
      badge: { text: 'GPS Guide', tone: 'live' },
      chips: ['Name Search', 'Block & Row', 'GPS Navigation'],
      intro:
        'Searching for relatives or honored martyrs in Hossein Reza Cemetery? Enter the deceased name or year of death to view their exact plot number, row, grave ID, and turn-by-turn map directions.',
      caps: [
        { icon: '🪦', title: 'Historical Deceased Archive', desc: 'Complete records from the 1970s to the present with tomb photos.' },
        { icon: '🌹', title: 'Martyrs Memorial Sanctuary', desc: 'Dedicated guide to the sacred Martyrs memorial sector.' },
        { icon: '📍', title: 'Direct Pathway Navigation', desc: 'Walk route guidance from the cemetery main gate to the grave.' }
      ],
      action: { label: 'Search Deceased Database', kind: 'toast', toast: 'Enter deceased name or national ID to locate plot.' }
    },
    {
      id: 'cem_eulogy',
      groupId: 'cemeteries',
      short: 'Funeral Booking',
      icon: '🎙️',
      accent: '14,165,233',
      title: 'Eulogist, PA Sound & Memorial Service Booking',
      sub: 'Schedule Quran reciters, mobile PA system, canopy, chairs & hall',
      badge: { text: 'Instant Booking', tone: 'ok' },
      chips: ['Certified Eulogists', 'PA Sound Systems', 'Canopy & Seating'],
      intro:
        'Instant booking for memorial and funeral services at Hossein Reza Cemetery. Coordinate certified eulogists, Quran reciters, mobile acoustic sound systems, shade canopies, seating, and memorial halls.',
      caps: [
        { icon: '🎤', title: 'Certified Memorial Speakers', desc: 'Verified eulogists with audio samples and flexible scheduling.' },
        { icon: '⛺', title: 'On-Site Canopies & Seating', desc: 'Weatherproof shade tents, folding chairs, and sound gear.' },
        { icon: '☕', title: 'Memorial Gathering Hall', desc: 'Heated and air-conditioned halls for reception services.' }
      ],
      action: { label: 'Book Eulogist & Funeral Gear', kind: 'toast', toast: 'Funeral and eulogy service booking confirmed.' }
    },
    {
      id: 'cem_permit',
      groupId: 'cemeteries',
      short: 'Burial Permit',
      icon: '📜',
      accent: '14,165,233',
      title: 'Death Certificate Registration & Burial Permit',
      sub: 'Upload legal coroner documentation and track administrative approvals',
      badge: { text: 'E-Permit', tone: 'live' },
      chips: ['Forensic Coroner', 'Hearse Dispatch', 'Tracking Code'],
      intro:
        'Electronic submission of hospital death certificates and forensic coroner permits. Receive automated digital burial tracking codes and dispatch hearses without manual bureaucracy.',
      caps: [
        { icon: '🚑', title: 'Municipal Hearse Dispatch', desc: 'Standardized urban and intercity deceased transit.' },
        { icon: '🔏', title: 'Civil Registry Integration', desc: 'Automatic notification to the National Civil Registry.' }
      ],
      action: { label: 'Track Burial Permit Case', kind: 'toast', toast: 'Digital burial permit & coroner documentation portal.' }
    },
    {
      id: 'cem_maintenance',
      groupId: 'cemeteries',
      short: 'Grave Maintenance',
      icon: '🌿',
      accent: '14,165,233',
      title: 'Grave Upkeep, Cleaning & Headstone Restoration',
      sub: 'Order weekly washing, seasonal flowers, and tombstone engraving',
      badge: { text: 'Online Order', tone: 'ok' },
      chips: ['Weekly Washing', 'Tombstone Installation', 'Thursday Flowers'],
      intro:
        'Designed for citizens living outside Varamin: order Thursday evening grave cleanings, seasonal plantings, tombstone repainting, and receive photo proof upon completion.',
      caps: [
        { icon: '📸', title: 'Photo Confirmation', desc: 'High-res photos of the cleaned and decorated grave in your app.' },
        { icon: '🪨', title: 'Headstone Engraving', desc: 'Select marble, granite, calligraphy, and poetry inscriptions.' }
      ],
      action: { label: 'Order Grave Upkeep', kind: 'toast', toast: 'Grave cleaning and upkeep request logged.' }
    }
  ];

  /* گروه‌بندی ۶ دسته مربعی در صفحه خدمات (انگلیسی) */
  const SERVICE_GROUPS_EN = [
    {
      id: 'finance',
      title: 'Municipal Taxes',
      desc: 'Renovation, waste, commerce, vehicle fees & clearance',
      icon: '💳',
      accent: '139,92,246',
      accentColor: '#a78bfa',
      badge: '5 Services',
      ids: ['pay_renovation', 'pay_waste', 'pay_business', 'pay_vehicle', 'pay_clearance']
    },
    {
      id: 'business',
      title: 'Business & Commerce',
      desc: 'Storefronts, Eplak Ads, trade licenses & Varamin market',
      icon: '🏪',
      accent: '245,158,11',
      accentColor: '#fbbf24',
      badge: '4 Services',
      ids: ['biz_showcase', 'biz_ads', 'biz_license', 'biz_market']
    },
    {
      id: 'environment',
      title: 'Environment & Recycling',
      desc: 'Doorstep pickup, green wallet, kiosks & debris reports',
      icon: '♻️',
      accent: '16,185,129',
      accentColor: '#34d399',
      badge: '4 Services',
      ids: ['env_pickup', 'env_wallet', 'env_kiosks', 'env_report']
    },
    {
      id: 'transport',
      title: 'Transportation & Traffic',
      desc: 'Live fleet tracker, metro, commuter rail & traffic plan',
      icon: '🚇',
      accent: '59,130,246',
      accentColor: '#60a5fa',
      badge: '4 Services',
      ids: ['trn_fleet', 'trn_metro', 'trn_ticket', 'trn_traffic_plan']
    },
    {
      id: 'tenders',
      title: 'Tenders & Auctions',
      desc: 'Civil tenders, property auctions, quotes & bid documents',
      icon: '📑',
      accent: '239,68,68',
      accentColor: '#fb7185',
      badge: 'Transparency',
      ids: ['tnd_civil', 'tnd_property', 'tnd_inquiry', 'tnd_docs', 'tnd_winners']
    },
    {
      id: 'cemeteries',
      title: 'Cemeteries & Memorials',
      desc: 'Grave purchase & booking, tariffs, eulogy & deceased search',
      icon: '🕊️',
      accent: '14,165,233',
      accentColor: '#38bdf8',
      badge: 'Hossein Reza',
      ids: ['cem_buy', 'cem_tariffs', 'cem_search', 'cem_eulogy', 'cem_permit', 'cem_maintenance']
    }
  ];

  let activeServiceId = null;
  let lastOpenedCategoryId = null;
  let lastOpenedServiceId = null;
  if (typeof window !== 'undefined') {
    window.lastOpenedCategoryId = null;
    window.lastOpenedServiceId = null;
  }

  /* =========================================================
     Helpers
  ========================================================= */
  function isEnglishActive() {
    return (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
  }

  function getServicesList() {
    return isEnglishActive() ? EPLAK_SERVICES_EN : EPLAK_SERVICES;
  }

  function getServiceGroups() {
    return isEnglishActive() ? SERVICE_GROUPS_EN : SERVICE_GROUPS;
  }

  function svcById(id) {
    const list = getServicesList();
    const found = list.find(function (s) { return s.id === id; });
    if (found) return found;
    return EPLAK_SERVICES.find(function (s) { return s.id === id; }) || null;
  }

  function svcPersianDigits(input) {
    if (isEnglishActive()) {
      return String(input ?? '');
    }
    if (typeof toPersianDigits === 'function') return toPersianDigits(input);
    const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(input).replace(/[0-9]/g, function (d) { return fa[d]; });
  }

  function renderLuxIcon(iconVal, fallback) {
    if (typeof window !== 'undefined' && window.EplakIcons && window.EplakIcons.get) {
      return window.EplakIcons.get(iconVal || fallback);
    }
    return fallback || iconVal || "";
  }

  /* =========================================================
     Render — صفحه خدمات (کادرهای مربعی ۶ گانه بدون دسترسی سریع)
  ========================================================= */
  /* =========================================================
     Render — صفحه خدمات (کادر جستجوی مدرن + کادرهای مربعی ۶ گانه)
  ========================================================= */
  /* helper آیکون پک برای برچسب‌های سریع خدمات */
  function svcIcon(name) {
    if (window.EplakIcons && typeof window.EplakIcons.get === 'function') {
      return window.EplakIcons.get(name, { size: 14 });
    }
    return '';
  }

  function renderServices() {
    const wrap = document.getElementById('servicesListWrap');
    if (!wrap) return;

    const isEn = isEnglishActive();
    const groups = getServiceGroups();
    const services = getServicesList();
    const totalServices = services.length;

    const statsText = isEn
      ? svcPersianDigits(groups.length) + ' Main Categories • ' + svcPersianDigits(totalServices) + ' Online Services'
      : svcPersianDigits(groups.length) + ' بخش اصلی • ' + svcPersianDigits(totalServices) + ' خدمت برخط شهری';
    
    const hintText = isEn
      ? 'Tap any category below to access its specialized municipal services:'
      : 'برای مشاهده خدمات تخصصی هر حوزه، کادر مربوطه را لمس کنید:';

    const searchPlaceholder = isEn
      ? 'Search municipal services, taxes, permits, mayor meeting...'
      : 'جستجوی هوشمند در خدمات، عوارض، مجوزها، دیدار حضوری...';

    let html = '';

    // کادر مدرن و شیک جستجوی خدمات شهری
    html += '<div class="svc-search-container">' +
      '<div class="svc-search-box">' +
        '<div class="svc-search-icon-box">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
        '</div>' +
        '<input type="text" id="mainServicesSearchInput" class="svc-search-input" placeholder="' + searchPlaceholder + '" oninput="handleMainServicesSearch(this.value)" autocomplete="off">' +
        '<button type="button" id="mainServicesSearchClear" class="svc-search-clear" onclick="clearMainServicesSearch()" style="display:none;" aria-label="' + (isEn ? 'Clear' : 'پاک کردن') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</button>' +
      '</div>' +
      /* آیکون‌های این نوار از پک آیکون می‌آیند تا با کل اپ یک‌دست باشند */
      '<div class="svc-quick-tags" id="svcQuickTags">' +

        '<button type="button" class="svc-quick-tag" data-term="دیدار" onclick="quickFilterServices(\'دیدار حضوری\')"><i class="svc-tag-icon">' + svcIcon('building') + '</i>' + (isEn ? 'Mayor Meeting' : 'دیدار با شهردار') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="عوارض" onclick="quickFilterServices(\'عوارض\')"><i class="svc-tag-icon">' + svcIcon('payment') + '</i>' + (isEn ? 'Taxes' : 'عوارض و نوسازی') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="کسب" onclick="quickFilterServices(\'کسب و کار\')"><i class="svc-tag-icon">' + svcIcon('store') + '</i>' + (isEn ? 'Business' : 'کسب و کار') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="پسماند" onclick="quickFilterServices(\'پسماند\')"><i class="svc-tag-icon">' + svcIcon('recycle') + '</i>' + (isEn ? 'Recycling' : 'پسماند و تفکیک') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="ترافیک" onclick="quickFilterServices(\'ترافیک\')"><i class="svc-tag-icon">' + svcIcon('transport') + '</i>' + (isEn ? 'Transport' : 'حمل‌ونقل و ترافیک') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="مناقصه" onclick="quickFilterServices(\'مناقصه\')"><i class="svc-tag-icon">' + svcIcon('tenders') + '</i>' + (isEn ? 'Tenders' : 'مناقصات') + '</button>' +
        '<button type="button" class="svc-quick-tag" data-term="آرامستان" onclick="quickFilterServices(\'آرامستان\')"><i class="svc-tag-icon">' + svcIcon('tomb') + '</i>' + (isEn ? 'Cemeteries' : 'آرامستان‌ها') + '</button>' +
      '</div>' +
    '</div>';

    // مخزن اختصاصی نمایش نتایج جستجوی زنده
    html += '<div id="mainServicesSearchResults" style="display:none; padding:0 16px; margin-bottom:14px;"></div>';

    // ظرف اصلی (جستجو با hide/show همین ظرف کار می‌کند)
    html += '<div id="servicesMainGridWrap">';

    // گرید کادر بزرگ دیدار حضوری (اول از همه)
    html += '<div class="svc-square-grid svc-vip-first">';

    // کادر بزرگ دیدار حضوری با اعضای شورای شهر و شهردار محترم (ترکیب دو کادر در یک کادر تمام‌عرض بالای عوارض شهرداری و کسب و کار)
    const meetingTitle = isEn
      ? 'Request in-person meeting with City Council & Mayor'
      : 'درخواست دیدار حضوری با اعضای شورای شهر و شهردار محترم';
    const meetingBadge = isEn ? 'Face-to-Face Meeting' : 'دیدار چهره‌به‌چهره';
    const meetingTag = isEn ? 'Direct Municipal Access' : 'ارتباط مستقیم با مدیریت شهری';
    const meetingDesc = isEn
      ? 'Book in-person appointment, direct public audience with Mayor and City Council members for citizen issues and proposals.'
      : 'ثبت نوبت ملاقات عمومی، پیگیری مستقیم مطالبات شهری و طرح چهره‌به‌چهره موضوعات با مدیریت ارشد شهرداری و اعضای شورا';
    const meetingAction = isEn ? 'Book Appointment & Submit Request' : 'رزرو وقت و ثبت درخواست دیدار';

    html += '<div class="svc-vip-meeting-card" onclick="openMayorMeetingService()">' +
      '<div class="svc-vip-top">' +
        '<div class="svc-vip-top-left">' +
          '<div class="svc-vip-icon">🏛️</div>' +
          '<span class="svc-vip-badge">' + meetingBadge + '</span>' +
        '</div>' +
        '<span class="svc-vip-tag">' + meetingTag + '</span>' +
      '</div>' +
      '<div class="svc-vip-body">' +
        '<h3 class="svc-vip-title">' + meetingTitle + '</h3>' +
        '<p class="svc-vip-desc">' + meetingDesc + '</p>' +
      '</div>' +
      '<div class="svc-vip-footer">' +
        '<span class="svc-vip-action">' + meetingAction + '</span>' +
        '<span class="svc-vip-arrow">' + (isEn ? '→' : '←') + '</span>' +
      '</div>' +
    '</div>';

    html += '</div>';

    // بنر باریک ای‌پلاک: خرید و فروش خودرو (تمام‌عرض، بین VIP و نوار آمار)
    html += '<div class="svc-ad-slim" onclick="handleSvcAdClick()" role="link" aria-label="ای‌پلاک — خرید و فروش خودرو">' +
      '<div class="home-ad-badge">' +
        '<span class="home-ad-badge-dot" style="background:#14e0c8; box-shadow:0 0 6px #14e0c8;"></span>' +
        '<span data-i18n="ad_sponsored">' + (isEn ? 'Ad' : 'تبلیغات') + '</span>' +
      '</div>' +
      '<picture>' +
        '<source srcset="assets/img/ad-eplak.webp?v=2" type="image/webp">' +
        '<img src="assets/img/ad-eplak.jpg?v=2" alt="ای‌پلاک — خرید و فروش خودرو" class="dash-ad-slim-img" decoding="async" width="1560" height="312">' +
      '</picture>' +
    '</div>';

    // نوار وضعیت + راهنما — درخواست کاربر: زیر کادر دیدار حضوری
    html += '<div id="servicesCountStrip" class="svc-count-strip" style="margin:10px 16px 8px;">' +
      '<span class="svc-count-num">' + svcPersianDigits(groups.length) + '</span>' +
      '<span class="svc-count-label">' + (isEn ? 'Categories' : 'بخش خدمات') + '</span>' +
      '<span class="svc-count-sep"></span>' +
      '<span class="svc-count-hint">' + statsText + '</span>' +
    '</div>';

    html += '<p id="servicesHintText" style="font-size:12px; color:var(--text-muted); margin:0 18px 10px; text-align:' + (isEn ? 'left' : 'right') + ';">' + hintText + '</p>';

    // گرید ۶ بخش اصلی
    html += '<div class="svc-square-grid svc-vip-rest">';

    groups.forEach(function (group) {
      html += '' +
        '<div class="svc-square-card" style="--accent-rgb:' + group.accent + '; --accent-color:' + group.accentColor + ';" onclick="openServiceCategory(\'' + group.id + '\')">' +
          '<div class="svc-square-top">' +
            '<div class="svc-square-icon">' + renderLuxIcon(group.id, group.icon) + '</div>' +
            '<span class="svc-square-badge">' + group.badge + '</span>' +
          '</div>' +
          '<div class="svc-square-body">' +
            '<h3 class="svc-square-title">' + group.title + '</h3>' +
            '<p class="svc-square-sub">' + group.desc + '</p>' +
            '<div class="svc-square-footer">' +
              '<span>' + (isEn ? 'View Services' : 'مشاهده خدمات') + '</span>' +
              '<span class="svc-square-arrow">' + (isEn ? '→' : '←') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    html += '</div>';

    wrap.innerHTML = html;
  }

  /* =========================================================
     Render — صفحه اختصاصی هر بخش (Service Category)
  ========================================================= */
  function openServiceCategory(catId) {
    lastOpenedCategoryId = catId;
    if (typeof window !== 'undefined') window.lastOpenedCategoryId = catId;
    const isEn = isEnglishActive();
    const groups = getServiceGroups();
    const group = groups.find(function (g) { return g.id === catId; });
    if (!group) return;

    const wrap = document.getElementById('serviceCategoryWrap');
    if (!wrap) return;

    const metaLabel = isEn
      ? svcPersianDigits(group.ids.length) + ' specialized services'
      : svcPersianDigits(group.ids.length) + ' خدمت تخصصی در این بخش';

    let html = '' +
      '<div class="svc-cat-hero" style="--accent:' + group.accent + ';">' +
        '<span class="svc-cat-glow"></span>' +
        '<div class="svc-cat-hero-top">' +
          '<div class="svc-cat-icon" style="background:rgba(' + group.accent + ',0.2); border-color:rgba(' + group.accent + ',0.35); font-size:32px; width:56px; height:56px;">' + renderLuxIcon(group.id, group.icon) + '</div>' +
          '<div class="svc-cat-hero-text">' +
            '<h2>' + group.title + '</h2>' +
            '<p>' + group.desc + '</p>' +
            '<span class="svc-cat-meta">' + metaLabel + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    // فیلتر مدرن، لوکس و شکیل جستجوی درون بخشی
    const catSearchPlaceholder = isEn
      ? 'Search in ' + group.title + '...'
      : 'جستجو در خدمات ' + group.title + '...';

    html += '<div class="cat-search-container" style="--cat-accent:' + group.accentColor + '; --cat-accent-rgb:' + group.accent + ';">' +
      '<div class="cat-search-icon-box">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
      '</div>' +
      '<input type="text" id="catSearchInput" class="cat-search-input" placeholder="' + catSearchPlaceholder + '" oninput="filterCategoryServices(this.value, \'' + group.id + '\')" autocomplete="off">' +
      '<button type="button" id="catSearchClear" class="cat-search-clear" onclick="clearCatSearch(\'' + group.id + '\')" style="display:none;" aria-label="' + (isEn ? 'Clear' : 'پاک کردن') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
      '</button>' +
    '</div>';

    html += '<div id="catServicesList" class="svc-list" style="padding:0 16px; display:flex; flex-direction:column; gap:12px;">' +
      group.ids.map(function (id) { return serviceCardHtml(id); }).join('') +
    '</div>';

    wrap.innerHTML = html;
    showScreen('screen-service-category');
  }

  function filterCategoryServices(keyword, catId) {
    const listWrap = document.getElementById('catServicesList');
    if (!listWrap) return;
    const clearBtn = document.getElementById('catSearchClear');
    const groups = getServiceGroups();
    const group = groups.find(function (g) { return g.id === catId; });
    if (!group) return;

    const term = (keyword || '').trim().toLowerCase();
    if (clearBtn) {
      clearBtn.style.display = term ? 'flex' : 'none';
    }

    const filteredIds = group.ids.filter(function (id) {
      if (!term) return true;
      const s = svcById(id);
      if (!s) return false;
      return (
        (s.title || '') + ' ' +
        (s.sub || '') + ' ' +
        (s.chips || []).join(' ') + ' ' +
        (s.intro || '')
      ).toLowerCase().includes(term);
    });

    if (filteredIds.length === 0) {
      listWrap.innerHTML = '<div class="glass-card" style="text-align:center; padding:28px 20px; margin:0 4px; display:flex; flex-direction:column; align-items:center; gap:8px;">' +
        '<div style="font-size:28px;">🔍</div>' +
        '<h4 style="font-size:14px; font-weight:800; color:var(--text-primary); margin:0;">' +
          (isEnglishActive() ? 'No services found in ' + group.title : 'خدمتی در بخش «' + group.title + '» یافت نشد') +
        '</h4>' +
        '<p style="font-size:12px; color:var(--text-muted); line-height:1.7; margin:0;">' +
          (isEnglishActive()
            ? 'Try different keywords or check the main services search.'
            : 'می‌توانید عنوان دیگری را امتحان فرمایید یا از کادر جستجوی صفحه اصلی خدمات استفاده کنید.') +
        '</p>' +
      '</div>';
    } else {
      listWrap.innerHTML = filteredIds.map(function (id) { return serviceCardHtml(id); }).join('');
    }
  }

  function clearCatSearch(catId) {
    const inp = document.getElementById('catSearchInput');
    if (inp) {
      inp.value = '';
      inp.focus();
    }
    filterCategoryServices('', catId);
  }

  /* کارت هر سرویس داخل صفحه دسته‌بندی */
  function serviceCardHtml(id) {
    const s = svcById(id);
    if (!s) return '';

    const isEn = isEnglishActive();
    const chipsHtml = (s.chips && s.chips.length)
      ? '<div class="svc-chips">' + s.chips.map(function (c) { return '<span class="svc-chip">' + c + '</span>'; }).join('') + '</div>'
      : '';

    const badgeHtml = s.badge
      ? '<span class="svc-badge svc-badge-' + (s.badge.tone || 'ok') + '">' + s.badge.text + '</span>'
      : '';

    const arrowSvg = isEn
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:scaleX(-1);"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

    return '' +
      '<div class="svc-card" style="--accent:' + s.accent + ';" onclick="openServiceDetail(\'' + s.id + '\')">' +
        '<span class="svc-card-glow"></span>' +
        '<div class="svc-icon-tile" style="background:rgba(' + s.accent + ',0.15); border-color:rgba(' + s.accent + ',0.25);">' + renderLuxIcon(s.icon) + '</div>' +
        '<div class="svc-card-body">' +
          '<div class="svc-card-head">' +
            '<h3>' + s.title + '</h3>' +
            badgeHtml +
          '</div>' +
          '<p>' + s.sub + '</p>' +
          chipsHtml +
        '</div>' +
        '<span class="svc-go">' + arrowSvg + '</span>' +
      '</div>';
  }

  /* =========================================================
     Render — صفحه جزئیات سرویس (Service Detail)
  ========================================================= */
  function openServiceDetail(id) {
    lastOpenedServiceId = id;
    if (typeof window !== 'undefined') window.lastOpenedServiceId = id;
    const s = svcById(id);
    if (!s) return;
    activeServiceId = id;

    const wrap = document.getElementById('serviceDetailWrap');
    if (!wrap) return;

    const isEn = isEnglishActive();
    const introLabel = isEn ? 'About This Service' : 'درباره این خدمت';
    const capsLabel = isEn ? 'Key Capabilities & Features' : 'قابلیت‌ها و امکانات';

    let html = '';

    /* Hero */
    html += '' +
      '<div class="svc-detail-hero" style="--accent:' + s.accent + ';">' +
        '<span class="svc-detail-glow"></span>' +
        '<div class="svc-detail-hero-top">' +
          '<div class="svc-icon-tile lg" style="background:rgba(' + s.accent + ',0.2); border-color:rgba(' + s.accent + ',0.35);">' + renderLuxIcon(s.icon) + '</div>' +
          '<div class="svc-detail-hero-text">' +
            '<h2>' + s.title + '</h2>' +
            '<p>' + s.sub + '</p>' +
            (s.badge ? '<span class="svc-badge svc-badge-' + (s.badge.tone || 'ok') + '">' + s.badge.text + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    /* معرفی */
    html += '' +
      '<div class="glass-card svc-intro-card" style="margin:0 16px;">' +
        '<div class="svc-intro-label">' + introLabel + '</div>' +
        '<p style="font-size:12.5px; line-height:1.8; color:var(--text-light); text-align:' + (isEn ? 'left' : 'right') + ';">' + s.intro + '</p>' +
      '</div>';

    /* قابلیت‌ها */
    if (s.caps && s.caps.length) {
      html += '<div class="section-title" style="padding:0 16px; margin-top:8px;">' + capsLabel + '</div>';
      html += '<div class="svc-caps">' +
        s.caps.map(function (c) {
          return '' +
            '<div class="svc-cap" style="--accent:' + s.accent + ';">' +
              '<div class="svc-cap-icon">' + renderLuxIcon(c.icon) + '</div>' +
              '<div class="svc-cap-body">' +
                '<h4>' + c.title + '</h4>' +
                '<p>' + c.desc + '</p>' +
              '</div>' +
            '</div>';
        }).join('') +
      '</div>';
    }

    /* دکمه اقدام */
    if (s.action) {
      const arrowTransform = isEn ? 'transform:rotate(180deg);' : '';
      html += '<div style="padding:0 16px; margin-top:12px;">' +
        '<button class="btn-teal" style="width:100%;" onclick="serviceAction(\'' + s.id + '\')">' +
          '<span>' + s.action.label + '</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;' + arrowTransform + '"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
        '</button>' +
      '</div>';
    }

    wrap.innerHTML = html;
    showScreen('screen-service-detail');
  }

  /* اکشن‌های تعاملی هر خدمت */
  function serviceAction(id) {
    const s = svcById(id);
    if (!s || !s.action) return;
    const a = s.action;
    const isEn = isEnglishActive();

    // پخش صدای کلیک
    if (window.soundManager && typeof window.soundManager.playClick === 'function') {
      window.soundManager.playClick();
    }

    if (a.kind === 'screen' && a.target) {
      showScreen(a.target);
      if (a.toast) showToast(a.toast);
      return;
    }

    // اقدامات اختصاصی بخش آرامستان‌ها
    if (id === 'cem_tariffs') {
      showCemeteryTariffModal();
      return;
    }
    if (id === 'cem_search') {
      showDeceasedSearchModal();
      return;
    }
    if (id === 'tnd_docs') {
      showToast(isEn ? 'Downloading Tender Document Package (PDF)...' : 'اسناد مناقصه با فرمت PDF دریافت شد');
      return;
    }

    showToast(a.toast || (isEn ? 'This municipal service is active' : 'این خدمت در سامانه فعال است'));
  }

  /* مدال شفافیت تعرفه آرامستان حسین‌رضا */
  function showCemeteryTariffModal() {
    const isEn = isEnglishActive();
    const modal = document.createElement('div');
    modal.id = 'cemTariffModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; padding:16px;';
    
    modal.innerHTML = '' +
      '<div class="glass-card" style="width:100%; max-width:380px; max-height:85vh; overflow-y:auto; padding:20px; border-radius:22px; text-align:' + (isEn ? 'left' : 'right') + ';">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
          '<h3 style="font-size:15px; font-weight:800; margin:0;">' + (isEn ? 'Official Cemetery Tariffs (2026)' : 'تعرفه مصوب آرامستان حسین‌رضا (ع)') + '</h3>' +
          '<button onclick="document.getElementById(\'cemTariffModal\').remove()" style="background:rgba(255,255,255,0.1); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">✕</button>' +
        '</div>' +
        '<p style="font-size:11.5px; color:var(--text-muted); line-height:1.6; margin-bottom:14px;">' +
          (isEn ? 'Approved by Varamin Islamic City Council. Direct settlement via official municipal treasury.' : 'مصوب شورای اسلامی شهر ورامین جهت شفاف‌سازی و جلوگیری از هرگونه واسطه‌گری.') +
        '</p>' +
        '<div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">' +
          '<div style="display:flex; justify-content:space-between; padding:8px; background:var(--input-bg); border-radius:10px;"><span>' + (isEn ? 'Public Burial (Tier 1)' : 'قبر جاری عمومی (طبقه اول)') + '</span><strong style="color:var(--teal);">' + (isEn ? 'Free (Subsidized)' : 'رایگان (یارانه‌ای)') + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; padding:8px; background:var(--input-bg); border-radius:10px;"><span>' + (isEn ? 'Tier 2 (Prefab Concrete)' : 'طبقه دوم بتنی استاندارد') + '</span><strong>' + (isEn ? '12,500,000 Tomans' : '۱۲,۵۰۰,۰۰۰ تومان') + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; padding:8px; background:var(--input-bg); border-radius:10px;"><span>' + (isEn ? 'Tier 3 (Prefab Concrete)' : 'طبقه سوم بتنی استاندارد') + '</span><strong>' + (isEn ? '18,000,000 Tomans' : '۱۸,۰۰۰,۰۰۰ تومان') + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; padding:8px; background:var(--input-bg); border-radius:10px;"><span>' + (isEn ? 'Washing, Shroud & Mortuary' : 'تغسیل، تکفین و تدفین') + '</span><strong>' + (isEn ? '2,800,000 Tomans' : '۲,۸۰۰,۰۰۰ تومان') + '</strong></div>' +
          '<div style="display:flex; justify-content:space-between; padding:8px; background:var(--input-bg); border-radius:10px;"><span>' + (isEn ? 'Family Sanctuary (per plot)' : 'آرامگاه خانوادگی (هر قطعه)') + '</span><strong>' + (isEn ? 'Inquire Office' : 'استعلام حضوری') + '</strong></div>' +
        '</div>' +
        '<button class="btn-teal" style="width:100%; margin-top:16px;" onclick="document.getElementById(\'cemTariffModal\').remove(); showToast(\'' + (isEn ? 'Tariff confirmed' : 'تعرفه‌ها مورد تایید شهرداری ورامین است') + '\')">' +
          (isEn ? 'Close & Return' : 'بستن و بازگشت') +
        '</button>' +
      '</div>';

    document.body.appendChild(modal);
  }

  /* مدال جستجوی متوفی */
  function showDeceasedSearchModal() {
    const isEn = isEnglishActive();
    const modal = document.createElement('div');
    modal.id = 'deceasedSearchModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.75); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; padding:16px;';

    modal.innerHTML = '' +
      '<div class="glass-card" style="width:100%; max-width:380px; padding:20px; border-radius:22px; text-align:' + (isEn ? 'left' : 'right') + ';">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
          '<h3 style="font-size:15px; font-weight:800; margin:0;">🔍 ' + (isEn ? 'Search Deceased (Hossein Reza)' : 'جستجوی مزار متوفی') + '</h3>' +
          '<button onclick="document.getElementById(\'deceasedSearchModal\').remove()" style="background:rgba(255,255,255,0.1); border:none; width:28px; height:28px; border-radius:50%; color:white; cursor:pointer;">✕</button>' +
        '</div>' +
        '<p style="font-size:11.5px; color:var(--text-muted); line-height:1.6; margin-bottom:12px;">' +
          (isEn ? 'Enter deceased full name or national ID to locate plot, row and grave.' : 'نام و نام‌خانوادگی یا کد ملی متوفی را وارد کنید تا شماره قطعه و مزار نمایش داده شود:') +
        '</p>' +
        '<input type="text" id="deceasedInputName" class="input-field" placeholder="' + (isEn ? 'Example: Mohammad Rezaei...' : 'مثلاً: محمد رضایی...') + '" style="margin-bottom:10px; width:100%;">' +
        '<button class="btn-teal" style="width:100%;" onclick="executeDeceasedSearch()">' +
          (isEn ? 'Search Cemetery Database' : 'جستجو در آرامستان حسین‌رضا') +
        '</button>' +
        '<div id="deceasedResultArea" style="margin-top:12px;"></div>' +
      '</div>';

    document.body.appendChild(modal);
  }

  window.executeDeceasedSearch = function () {
    const input = document.getElementById('deceasedInputName');
    const area = document.getElementById('deceasedResultArea');
    if (!input || !area) return;
    const name = input.value.trim();
    const isEn = isEnglishActive();

    if (!name) {
      showToast(isEn ? 'Please enter a name to search' : 'لطفاً نام متوفی را وارد کنید');
      return;
    }

    area.innerHTML = '' +
      '<div style="padding:12px; border-radius:12px; background:rgba(0,201,167,0.1); border:1px solid rgba(0,201,167,0.3); font-size:12px; line-height:1.7;">' +
        '<div style="font-weight:800; color:var(--teal); margin-bottom:4px;">🕊️ ' + (isEn ? 'Found Record:' : 'مشخصات مزار یافت‌شده:') + ' ' + name + '</div>' +
        '<div>' + (isEn ? 'Plot: Sector 14 (Family Phase)' : 'قطعه: ۱۴ (فاز توسعه آرامگاه)') + '</div>' +
        '<div>' + (isEn ? 'Row: 8 | Grave Number: 23' : 'ردیف: ۸ | شماره مزار: ۲۳') + '</div>' +
        '<div style="margin-top:8px;"><button onclick="document.getElementById(\'deceasedSearchModal\').remove(); showScreen(\'screen-map\'); showToast(\'' + (isEn ? 'Navigating to Sector 14...' : 'مسیریابی به سمت قطعه ۱۴ آرامستان...') + '\')" style="background:var(--teal); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">' + (isEn ? 'Navigate on Map' : 'مسیریابی روی نقشه') + '</button></div>' +
      '</div>';
  };

  /* =========================================================
     Auto-hook — اتصال خودکار به showScreen
  ========================================================= */
  (function svcAutoHook() {
    if (typeof window === 'undefined' || window.__eplakServicesHooked) return;
    window.__eplakServicesHooked = true;

    var originalShowScreen = window.showScreen;
    if (typeof originalShowScreen === 'function') {
      window.showScreen = function (id, options) {
        originalShowScreen(id, options);
        if (id === 'screen-services' && typeof renderServices === 'function') {
          renderServices();
        } else if (id === 'screen-service-category' && lastOpenedCategoryId) {
          const wrap = document.getElementById('serviceCategoryWrap');
          if (wrap && (!wrap.innerHTML || wrap.innerHTML.trim() === '')) {
            openServiceCategory(lastOpenedCategoryId);
          }
        } else if (id === 'screen-service-detail' && lastOpenedServiceId) {
          const wrap = document.getElementById('serviceDetailWrap');
          if (wrap && (!wrap.innerHTML || wrap.innerHTML.trim() === '')) {
            openServiceDetail(lastOpenedServiceId);
          }
        }
      };
    }
  })();


  /* =========================================================
     درخواست دیدار حضوری با شهردار و اعضای شورای اسلامی شهر
  ========================================================= */
  function openMayorMeetingService() {
    const userPhone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : (localStorage.getItem('eplak_phone') || '');
    const phoneInput = document.getElementById('meetingPhoneInput');
    if (phoneInput && userPhone) {
      phoneInput.value = userPhone;
    }
    const nameDisplay = document.getElementById('profileNameDisplay');
    const nameInput = document.getElementById('meetingNameInput');
    if (nameInput && nameDisplay && nameDisplay.textContent && nameDisplay.textContent.trim() !== 'شهروند') {
      nameInput.value = nameDisplay.textContent.trim();
    }
    showScreen('screen-mayor-meeting');
  }

  function submitMayorMeetingRequest() {
    const targetSel = document.getElementById('meetingTargetSelect');
    const nameInp = document.getElementById('meetingNameInput');
    const phoneInp = document.getElementById('meetingPhoneInput');
    const subjInp = document.getElementById('meetingSubjectInput');
    const descInp = document.getElementById('meetingDescInput');

    const target = (targetSel ? targetSel.value : 'شهردار محترم ورامین').trim();
    const name = (nameInp ? nameInp.value : '').trim();
    const phone = (phoneInp ? phoneInp.value : '').trim() || (typeof getCurrentPhone === 'function' ? getCurrentPhone() : (localStorage.getItem('eplak_phone') || '09120000000'));
    const subject = (subjInp ? subjInp.value : '').trim();
    const desc = (descInp ? descInp.value : '').trim();

    if (!subject) {
      if (typeof showToast === 'function') showToast('لطفاً موضوع ملاقات حضوری را وارد کنید');
      return;
    }
    if (!desc) {
      if (typeof showToast === 'function') showToast('لطفاً توضیحات درخواست را وارد فرمایید');
      return;
    }

    const title = 'دیدار حضوری: ' + subject;
    const fullDesc = 'طرف ملاقات: ' + target + '\nمتقاضی: ' + (name || 'شهروند') + ' (' + phone + ')\n\nشرح موضوع:\n' + desc;

    const localCode = 'TK-1403-' + String(1000 + (window.tickets ? window.tickets.length + 1 : 1)).padStart(4, '0');
    const nowIso = new Date().toISOString();

    const newTicket = {
      id: 'tk_' + Date.now(),
      code: localCode,
      title: title,
      description: fullDesc,
      category: 'دیدار حضوری و ملاقات مردمی',
      department: 'دفتر شهردار و شورای شهر',
      priority: 'high',
      status: 'pending',
      reply: '',
      user_phone: phone,
      created_at: nowIso,
      dateTime: typeof formatReportDateTime === 'function' ? formatReportDateTime(nowIso) : ''
    };

    if (window.tickets) {
      window.tickets.unshift(newTicket);
      if (typeof saveTickets === 'function') saveTickets(phone);
    }

    const codeElem = document.getElementById('successTicketCode');
    if (codeElem) codeElem.textContent = localCode;

    if (window.soundManager && typeof window.soundManager.playDing === 'function') {
      window.soundManager.playDing();
    }

    // پاکسازی فیلدها
    if (subjInp) subjInp.value = '';
    if (descInp) descInp.value = '';

    // انتقال آنی بدون لگ
    showScreen('screen-ticket-success');

    // همگام‌سازی در سرور
    const payload = {
      userPhone: phone,
      name: name,
      title: title,
      description: fullDesc,
      category: 'دیدار حضوری و ملاقات مردمی',
      department: 'دفتر شهردار و شورای شهر',
      priority: 'high',
      status: 'pending'
    };

    const syncPromise = (typeof window.syncDataToBackend === 'function')
      ? window.syncDataToBackend('tickets', payload)
      : fetch('api/tickets.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); });

    syncPromise.then(function (data) {
      if (data && data.success) {
        if (data.tracking_code) {
          newTicket.code = data.tracking_code;
          if (codeElem) codeElem.textContent = data.tracking_code;
        }
        if (data.id) newTicket.id = String(data.id);
        if (typeof saveTickets === 'function') saveTickets(phone);
        if (typeof renderUserTicketsList === 'function') renderUserTicketsList();
        /* اعلان فوری «ثبت درخواست با کد پیگیری» برای همین کاربر */
        if (typeof window.refreshNotificationsNow === 'function') {
          try { window.refreshNotificationsNow(); } catch (e) {}
        }
      }
    }).catch(function (err) {
      console.warn('[meeting] background sync note:', err);
    });
  }


  /* =========================================================
     جستجوی هوشمند و همه‌جانبه خدمات شهری در صفحه خدمات
  ========================================================= */
  function handleMainServicesSearch(keyword) {
    const term = (keyword || '').trim().toLowerCase();
    const clearBtn = document.getElementById('mainServicesSearchClear');
    const resultsWrap = document.getElementById('mainServicesSearchResults');
    const gridWrap = document.getElementById('servicesMainGridWrap');
    const countStrip = document.getElementById('servicesCountStrip');
    const hintText = document.getElementById('servicesHintText');
    const quickTagsWrap = document.getElementById('svcQuickTags');

    if (clearBtn) {
      clearBtn.style.display = term ? 'flex' : 'none';
    }

    if (quickTagsWrap) {
      const tags = quickTagsWrap.querySelectorAll('.svc-quick-tag');
      tags.forEach(function (tag) {
        const tagText = tag.getAttribute('data-term') || tag.textContent;
        tag.classList.toggle('active', term && tagText.includes(term));
      });
    }

    if (!term) {
      if (resultsWrap) {
        resultsWrap.style.display = 'none';
        resultsWrap.innerHTML = '';
      }
      if (gridWrap) gridWrap.style.display = 'block';
      if (countStrip) countStrip.style.display = 'flex';
      if (hintText) hintText.style.display = 'block';
      return;
    }

    if (gridWrap) gridWrap.style.display = 'none';
    if (countStrip) countStrip.style.display = 'none';
    if (hintText) hintText.style.display = 'none';
    if (!resultsWrap) return;

    resultsWrap.style.display = 'flex';
    resultsWrap.style.flexDirection = 'column';
    resultsWrap.style.gap = '10px';

    const isEn = isEnglishActive();
    const services = getServicesList();

    // بررسی تطابق با کارت دیدار حضوری
    const meetingMatch = (
      term.includes('دیدار') || term.includes('شهردار') || term.includes('شورا') ||
      term.includes('ملاقات') || term.includes('حضوری') || term.includes('جلسه') ||
      term.includes('نوبت') || term.includes('وقت') ||
      term.includes('mayor') || term.includes('council') || term.includes('meeting')
    );

    // جستجو در ۲۵+ خدمت شهری
    const matchedServices = services.filter(function (s) {
      const haystack = (
        (s.title || '') + ' ' +
        (s.short || '') + ' ' +
        (s.sub || '') + ' ' +
        (s.intro || '') + ' ' +
        (s.chips || []).join(' ')
      ).toLowerCase();
      return haystack.includes(term);
    });

    const totalMatches = matchedServices.length + (meetingMatch ? 1 : 0);

    let html = '';

    // نوار تعداد نتایج
    html += '<div style="display:flex; align-items:center; justify-content:space-between; padding:4px 4px 6px;">' +
      '<span style="font-size:12.5px; font-weight:800; color:var(--teal);">' +
        (isEn ? totalMatches + ' Services Found' : svcPersianDigits(totalMatches) + ' خدمت مرتبط یافت شد') +
      '</span>' +
      '<button type="button" onclick="clearMainServicesSearch()" style="background:transparent; border:none; font-size:11.5px; color:var(--text-muted); cursor:pointer; font-weight:600;">' +
        (isEn ? 'Clear Filter ✕' : 'پاک کردن فیلتر ✕') +
      '</button>' +
    '</div>';

    // اگر کارت دیدار حضوری تطابق داشت
    if (meetingMatch) {
      const meetingTitle = isEn
        ? 'Request in-person meeting with City Council & Mayor'
        : 'درخواست دیدار حضوری با اعضای شورای شهر و شهردار محترم';
      const meetingBadge = isEn ? 'Face-to-Face Meeting' : 'دیدار چهره‌به‌چهره';
      const meetingTag = isEn ? 'Direct Municipal Access' : 'ارتباط مستقیم با مدیریت شهری';
      const meetingDesc = isEn
        ? 'Book in-person appointment, direct public audience with Mayor and City Council members.'
        : 'ثبت نوبت ملاقات عمومی، پیگیری مستقیم مطالبات شهری و طرح چهره‌به‌چهره موضوعات با مدیریت ارشد شهرداری و اعضای شورا';

      html += '<div class="svc-vip-meeting-card" onclick="openMayorMeetingService()" style="margin:0;">' +
        '<div class="svc-vip-top">' +
          '<div class="svc-vip-top-left">' +
            '<div class="svc-vip-icon">🏛️</div>' +
            '<span class="svc-vip-badge">' + meetingBadge + '</span>' +
          '</div>' +
          '<span class="svc-vip-tag">' + meetingTag + '</span>' +
        '</div>' +
        '<div class="svc-vip-body">' +
          '<h3 class="svc-vip-title">' + meetingTitle + '</h3>' +
          '<p class="svc-vip-desc">' + meetingDesc + '</p>' +
        '</div>' +
        '<div class="svc-vip-footer">' +
          '<span class="svc-vip-action">' + (isEn ? 'Book Appointment' : 'رزرو وقت و ثبت درخواست دیدار') + '</span>' +
          '<span class="svc-vip-arrow">' + (isEn ? '→' : '←') + '</span>' +
        '</div>' +
      '</div>';
    }

    if (matchedServices.length > 0) {
      matchedServices.forEach(function (s) {
        html += serviceCardHtml(s.id);
      });
    }

    if (totalMatches === 0) {
      html += '<div class="glass-card" style="padding:28px 20px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:8px;">' +
        '<div style="font-size:32px;">🔍</div>' +
        '<h4 style="font-size:14px; font-weight:800; color:var(--text-primary); margin:0;">' +
          (isEn ? 'No services found' : 'خدمتی با این مشخصات یافت نشد') +
        '</h4>' +
        '<p style="font-size:12px; color:var(--text-muted); line-height:1.7; margin:0;">' +
          (isEn
            ? 'Try searching with keywords like taxes, renovation, business, permits, or in-person meeting.'
            : 'می‌توانید کلماتی مانند عوارض، نوسازی، پسماند، کسب و کار، دیدار حضوری یا ترافیک را جستجو فرمایید.') +
        '</p>' +
      '</div>';
    }

    resultsWrap.innerHTML = html;
  }

  function clearMainServicesSearch() {
    const input = document.getElementById('mainServicesSearchInput');
    if (input) {
      input.value = '';
      input.focus();
    }
    handleMainServicesSearch('');
  }

  function quickFilterServices(tag) {
    const input = document.getElementById('mainServicesSearchInput');
    if (input) {
      input.value = tag;
    }
    handleMainServicesSearch(tag);
  }

  function selectMeetingTarget(targetVal, btnElem) {
    const sel = document.getElementById('meetingTargetSelect');
    if (sel) {
      sel.value = targetVal;
    }
    document.querySelectorAll('.meeting-target-chip').forEach(function (c) {
      c.classList.remove('active');
    });
    if (btnElem) {
      btnElem.classList.add('active');
    }
  }

  function syncMeetingTargetChips(selectedVal) {
    document.querySelectorAll('.meeting-target-chip').forEach(function (c) {
      const text = c.textContent || '';
      if (text.includes(selectedVal) || selectedVal.includes(text.replace(/[🏛️👥🤝🏢]/g, '').trim())) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  window.openMayorMeetingService = openMayorMeetingService;
  window.submitMayorMeetingRequest = submitMayorMeetingRequest;
  window.handleMainServicesSearch = handleMainServicesSearch;
  window.clearMainServicesSearch = clearMainServicesSearch;
  window.quickFilterServices = quickFilterServices;
  window.selectMeetingTarget = selectMeetingTarget;
  window.syncMeetingTargetChips = syncMeetingTargetChips;

  window.renderServices = renderServices;
  /* کلیک بنر تبلیغاتی ای‌پلاک در خدمات */
  window.handleSvcAdClick = function () {
    var en = (window.i18n && typeof window.i18n.getLanguage === 'function') ? window.i18n.getLanguage() === 'en' : false;
    if (typeof showToast === 'function') {
      showToast(en ? 'Eplak — your trusted local marketplace for buying and selling cars' : 'ای‌پلاک؛ کار محلی مطمئن برای خرید و فروش خودرو');
    }
  };
  window.openServiceCategory = openServiceCategory;
  window.openServiceDetail = openServiceDetail;
  window.serviceAction = serviceAction;
  window.filterCategoryServices = filterCategoryServices;
  window.clearCatSearch = clearCatSearch;

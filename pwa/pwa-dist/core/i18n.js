/* core/i18n.js — سیستم جامع دوزبانه (فارسی / انگلیسی) اپلیکیشن ای‌پلاک */
(function (root, factory) {
  var instance = factory();
  if (typeof define === 'function' && define.amd) {
    define([], function () { return instance; });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = instance;
  }
  if (root) {
    root.i18n = instance;
    root.t = function(key, fallback) { return instance.t(key, fallback); };
  }
  if (typeof window !== 'undefined') {
    window.i18n = instance;
    window.t = function(key, fallback) { return instance.t(key, fallback); };
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)), function () {
  'use strict';

  var STORAGE_KEY = 'eplak_lang';

  /* =========================================================
     فرهنگ لغات جامع (Translations Dictionary)
  ========================================================= */
  var TRANSLATIONS = {
    fa: {
      /* هویت اپلیکیشن */
      'app_name': 'ای‌پلاک',
      'app_subtitle': 'سامانه خدمات یکپارچه شهروندی ورامین',
      'city_title': 'شهرداری ورامین',

      /* ورود و احراز هویت */
      'login_title': 'ورود شهروندان',
      'login_phone_label': 'شماره تلفن همراه',
      'login_phone_ph': '۰۹۱۲۳۴۵۶۷۸۹',
      'login_btn': 'ورود / ثبت‌نام',
      'login_demo_btn': 'ورود سریع آزمایشی',
      'login_terms': 'با ورود به سامانه، شرایط و قوانین خدمات را می‌پذیرید.',
      'otp_title': 'تایید شماره همراه',
      'otp_desc': 'کد تایید را وارد کنید',
      'otp_desc_prefix': 'کد ۴ رقمی به شماره ',
      'otp_desc_suffix': ' پیامک شد',
      'otp_ph': 'کد ۴ رقمی',
      'otp_verify': 'تایید و ورود',
      'otp_resend': 'ارسال مجدد کد',
      'otp_change_phone': 'تغییر شماره همراه',

      /* نویگیشن و دکمه‌های مشترک */
      'nav_home': 'خانه',
      'nav_dashboard': 'پیشخوان',
      'nav_services': 'خدمات',
      'nav_reports': 'گزارش‌ها',
      'nav_profile': 'پروفایل',
      'back': 'بازگشت',
      'save': 'ذخیره تغییرات',
      'cancel': 'انصراف',
      'confirm': 'تایید',
      'search': 'جستجو',
      'delete': 'حذف',
      'edit': 'ویرایش',
      'view_all': 'مشاهده همه',
      'retry': 'تلاش مجدد',
      'submit': 'ثبت نهایی',
      'next': 'مرحله بعد',
      'prev': 'مرحله قبل',
      'logout': 'خروج از حساب',

      /* صفحه خانه */
      'home_banner_title': 'سامانه مدیریت شهری ورامین',
      'home_banner_sub': 'خدمات هوشمند شهروندی در دسترس شماست.',
      'home_quick_access': 'دسترسی سریع',
      'home_services_title': 'خدمات پرکاربرد',
      'home_latest_news': 'آخرین اخبار و اطلاعیه‌ها',
      'service_submit_report': 'ثبت درخواست',
      'service_submit_report_sub': 'گزارش مشکل',
      'service_track_report': 'پیگیری درخواست',
      'service_track_report_sub': 'وضعیت گزارش‌ها و تیکت‌ها',
      'service_all_services': 'خدمات الکترونیک',
      'service_all_services_sub': 'سرویس‌های شهری',
      'service_news': 'اخبار و اطلاعیه‌ها',
      'service_news_sub': 'آخرین اخبار شهرداری',
      'service_payment': 'پرداخت عوارض',
      'service_payment_sub': 'عوارض و خدمات',
      'service_map': 'نقشه شهری',
      'service_map_sub': 'مکان‌یابی شهری',
      'service_contact': 'تماس با ما',
      'service_contact_sub': 'سامانه ۱۳۷ و پشتیبانی',
      'service_heritage': 'میراث ورامین',
      'service_heritage_sub': 'گردشگری و تاریخ',

      /* پیشخوان */
      'dash_title': 'پیشخوان شهروندی',
      'dash_hello': 'سلام،',
      'dash_welcome': 'خوش آمدید',
      'dash_today': 'امروز',
      'dash_stat_pending': 'در حال انتظار',
      'dash_stat_in_progress': 'در حال رسیدگی',
      'dash_stat_done': 'انجام شد',
      'dash_stat_debt': 'عوارض نوسازی',
      'dash_stat_nodebt': 'بدون بدهی',
      'dash_recent_activity': 'گزارش‌های اخیر',
      'dash_no_activity': 'هنوز فعالیتی ثبت نشده است',
      'dash_weather_title': 'وضعیت آب و هوا',
      'dash_aqi_title': 'شاخص کیفیت هوا',
      'mayor_meeting_header': 'درخواست دیدار حضوری',
      'mayor_meeting_card_title': 'درخواست دیدار حضوری با اعضای شورای شهر و شهردار محترم',

      /* ثبت گزارش */
      'report_new_title': 'ثبت گزارش مردمی',
      'report_step1_title': 'مرحله ۱ از ۴: انتخاب موضوع',
      'report_header_new': 'ثبت درخواست جدید',
      'report_header_location': 'موقعیت مکانی مشکل',
      'report_header_media': 'افزودن عکس یا فیلم',
      'report_header_review': 'بازبینی و تایید نهایی',
      'report_step1_hint': 'موضوع مشکل شهری را انتخاب کنید:',
      'report_step2_title': 'مرحله ۲ از ۴: واحد شهرداری',
      'report_step2_hint': 'واحد مربوطه را انتخاب کنید:',
      'report_step3_title': 'مرحله ۳ از ۴: شرح و مستندات',
      'report_step4_title': 'مرحله ۴ از ۴: تایید نهایی',
      'report_title_label': 'عنوان گزارش',
      'report_title_ph': 'مثال: خرابی آسفالت کوچه پنجم',
      'report_desc_label': 'شرح دقیق مشکل',
      'report_desc_ph': 'لطفاً شرح کامل مشکل را بنویسید...',
      'report_loc_label': 'موقعیت مکانی',
      'report_loc_ph': 'آدرس دقیق یا توضیحات محل...',
      'report_pick_map': 'انتخاب موقعیت روی نقشه',
      'report_attach_photo': 'پیوست تصویر (اختیاری)',
      'report_add_photo': 'افزودن تصویر',
      'report_summary_title': 'خلاصه اطلاعات گزارش',
      'report_field_cat': 'دسته‌بندی:',
      'report_field_dept': 'واحد شهرداری:',
      'report_field_subdept': 'زیرواحد:',
      'report_field_title': 'عنوان:',
      'report_field_desc': 'شرح:',
      'report_field_loc': 'موقعیت:',
      'report_field_photos': 'تصاویر پیوست:',
      'report_submit_final': 'ثبت نهایی گزارش',
      'report_success_title': 'گزارش با موفقیت ثبت شد!',
      'report_success_track': 'کد پیگیری شما:',
      'report_success_hint': 'کد رهگیری را جهت پیگیری‌های بعدی یادداشت فرمایید.',
      'report_view_in_reports': 'مشاهده در گزارش‌های من',
      'report_back_home': 'بازگشت به صفحه اصلی',

      /* دسته‌بندی‌های گزارش */
      'cat_asphalt': 'عمران، آسفالت و معابر',
      'cat_green': 'فضای سبز و بوستان‌ها',
      'cat_waste': 'پسماند، نظافت و تفکیک زباله',
      'cat_obstruction': 'سد معبر و تخلفات شهری',
      'cat_lighting': 'روشنایی و تاسیسات معابر',
      'cat_traffic': 'ترافیک و حمل‌ونقل شهری',
      'cat_other': 'سایر موضوعات شهری',

      /* گزارش‌های من */
      'my_reports_title': 'گزارش‌های من',
      'filter_all': 'همه',
      'filter_pending': 'در حال انتظار',
      'filter_in_progress': 'در حال رسیدگی',
      'filter_done': 'انجام شد',
      'reports_empty': 'هنوز گزارشی ثبت نشده است',
      'reports_empty_filter': 'گزارشی در این دسته یافت نشد',
      'report_detail_title': 'جزئیات گزارش',
      'report_tracking_code': 'کد پیگیری',
      'report_location': 'موقعیت',
      'report_dept': 'واحد مربوطه',
      'report_description': 'توضیحات',
      'report_timeline_title': 'روند رسیدگی',
      'report_delete_action': 'حذف این گزارش',
      'report_back_to_list': 'بازگشت به لیست گزارش‌ها',

      /* وضعیت‌ها */
      'status_pending': 'در حال انتظار',
      'status_in_progress': 'در حال رسیدگی',
      'status_done': 'انجام شد',

      /* مراحل تایم‌لاین */
      'timeline_step1': 'ثبت گزارش',
      'timeline_step2': 'بررسی اولیه',
      'timeline_step3': 'ارجاع به واحد مربوطه',
      'timeline_step4': 'پاسخ مدیریت',

      /* پیگیری درخواست */
      'track_title': 'پیگیری درخواست',
      'track_ph': 'کد پیگیری یا عنوان را وارد کنید...',
      'track_profile_ph': 'مثلاً EP-1403-0021 یا TK-1403-0012',
      'track_no_reports': 'در حال حاضر گزارشی برای نمایش وجود ندارد.',
      'track_not_found': 'گزارشی با این کد پیگیری یافت نشد',
      'track_recent_title': 'گزارش‌های اخیر',

      /* پروفایل */
      'profile_title': 'پروفایل شهروندی',
      'profile_default_name': 'شهروند',
      'profile_no_phone': 'شماره ثبت نشده',
      'profile_no_nid': 'کد ملی ثبت نشده',
      'profile_no_addr': 'آدرس ثبت نشده',
      'profile_edit_menu': 'ویرایش مشخصات',
      'profile_edit_title': 'ویرایش پروفایل',
      'profile_reports_menu': 'گزارش‌های من',
      'profile_favs_menu': 'علاقه‌مندی‌ها',
      'profile_settings_menu': 'تنظیمات',
      'profile_dark_mode': 'حالت شب',
      'profile_sound': 'افکت‌های صوتی',
      'profile_app_language': 'زبان برنامه',
      'profile_logout': 'خروج از حساب',
      'profile_user_title': 'پروفایل کاربری',
      'profile_no_reports_yet': 'هنوز گزارشی ثبت نشده است.',
      'profile_view_all_reports': 'مشاهده همه گزارش‌ها',
      'profile_change_photo': 'تغییر عکس',
      'profile_remove_photo': 'حذف عکس',
      'profile_full_name': 'نام و نام خانوادگی',
      'profile_phone': 'شماره موبایل',
      'profile_nid': 'کد ملی',
      'profile_address': 'آدرس محل سکونت',
      'profile_address_ph': 'آدرس خود را وارد کنید...',

      /* تنظیمات */
      'settings_title': 'تنظیمات',
      'settings_push_notif': 'اعلان‌های پوش',
      'settings_sms_notif': 'اعلان‌های پیامکی',
      'settings_location_access': 'دسترسی به موقعیت مکانی',
      'settings_sound': 'صدای اعلان‌ها',
      'settings_support': 'پشتیبانی و تماس با ما',
      'settings_terms': 'قوانین و مقررات',
      'settings_app_version': 'نسخه برنامه',

      /* علاقه‌مندی‌ها و اعلان‌ها */
      'favs_title': 'علاقه‌مندی‌ها',
      'fav_title': 'علاقه‌مندی‌ها',
      'favs_empty': 'هنوز خدمتی را به علاقه‌مندی‌ها اضافه نکرده‌اید',
      'notifs_title': 'اعلان‌ها',
      'notif_title': 'اعلان‌ها',
      'notifs_empty': 'اعلانی برای نمایش وجود ندارد',
      'notif_read_all': 'خواندن همه',
      'notif_delete_all': 'حذف همه',
      'notif_delete_one': 'حذف این اعلان',
      'notif_deleted': 'اعلان حذف شد',
      'notif_deleted_all': 'همه‌ی اعلان‌ها حذف شدند',
      /* اتصال اینترنت */
      'offline_title': 'بدون اینترنت اتصال ممکن نیست',
      'offline_desc': 'این برنامه فقط در حالت آنلاین کار می‌کند. اتصال اینترنت گوشی را بررسی کنید و دوباره تلاش کنید.',
      'offline_retry': 'تلاش مجدد',
      'offline_checking': 'در حال بررسی اتصال…',
      'offline_toast': 'اینترنت قطع است؛ پس از وصل شدن دوباره تلاش کنید',
      'edit_profile_title': 'ویرایش پروفایل',
      'map_nearby_title': 'اماکن و خدمات نزدیک',

      /* تماس با ما */
      'contact_title': 'تماس با شهرداری',
      'contact_137_title': 'سامانه مدیریت شهری ۱۳۷',
      'contact_137_desc': 'تماس ۲۴ ساعته با مرکز ارتباطات مردمی',
      'contact_direct_phone': 'تلفن مستقیم شهرداری:',
      'contact_email': 'پست الکترونیک:',
      'contact_address': 'آدرس:',
      'contact_address_val': 'ورامین، میدان امام خمینی، بلوار شهرداری، ساختمان مرکزی شهرداری ورامین',

      /* نقشه و اماکن */
      'map_title': 'نقشه و اماکن شهری',
      'map_search_ph': 'جستجوی اماکن ورامین...',

      /* خدمات الکترونیک */
      'services_title': 'خدمات الکترونیک',
      'services_search_ph': 'جستجو در خدمات...',
      'services_tab_all': 'تمام خدمات',
      'services_tab_urban': 'شهرسازی',
      'services_tab_city': 'خدمات شهری',
      'services_tab_culture': 'فرهنگی و ورزشی',
      'services_tab_finance': 'مالی و عوارض',

      /* پرداخت */
      'payment_title': 'پرداخت عوارض و خدمات',
      'payment_renovation': 'عوارض نوسازی و عمران',
      'payment_car': 'عوارض خودرو',
      'payment_waste': 'عوارض پسماند',
      'payment_btn': 'پرداخت آنلاین',
      'payment_total_debt': 'مجموع بدهی',
      'pay_detail_header': 'جزئیات قبض',
      'pay_title_label': 'عنوان',
      'pay_code_label': 'شماره قبض',
      'pay_due_label': 'مهلت پرداخت',
      'pay_status_label': 'وضعیت',
      'pay_amount_label': 'مبلغ قابل پرداخت',

      /* خدمات و اخبار */
      'svc_hero_badge': 'سوپر‌اپلیکیشن خدمات شهری',
      'svc_hero_title': 'خدمات ای‌پلاک',
      'svc_hero_sub': 'از پرداخت عوارض و بازیافت تا حمل‌ونقل، گردشگری و زندگی شهری هوشمند؛ همه در یک جا.',
      'service_cat_header': 'بخش خدمات',
      'service_detail_header': 'جزئیات سرویس',
      'news_tab_knowledge': 'دانستنی‌های ورامین',
      'news_tab_news': 'اخبار و اطلاعات',
      'heritage_mosque_pin': '۷۲۲ ه.ق · دوره ایلخانی',
      'heritage_mosque_title': 'مسجد جامع ورامین',
      'heritage_mosque_desc': 'تنها نمونه کامل مساجد چهارایوانی ایران؛ شاهکاری از کاشی‌کاری معرق، گچ‌بری و آجرکاری دوران ایلخانی که با همت سلطان محمد خدابنده آغاز و در روزگار فرزندش ابوسعید بهادرخان به پایان رسید.',
      'heritage_tower_pin': '۶۸۸ ه.ق · آرامگاهی',
      'heritage_tower_title': 'برج علاءالدوله ورامین',
      'heritage_tower_desc': 'برج آرامگاهی استوانه‌ای با گنبدی مخروطی بلند، یادگار فخرالدین برای پدرش حسن علاءالدوله، حاکم ری؛ از قدیمی‌ترین آثار ثبت‌شده ملی ایران با تزئینات آجرکاری و کاشی فیروزه‌ای.',
      'heritage_note_text': 'هر دو بنا از میراث فرهنگی ثبت‌شده ورامین هستند و در فهرست آثار ملی ایران قرار دارند.',
      'read_more_arrow': 'مطالعه بیشتر ←',
      'back_to_knowledge': 'بازگشت به دانستنی‌ها',
      'back_to_news': 'بازگشت به اخبار',

      /* داده‌های زنده شهر، ویترین و تماس */
      'city_my_varamin': 'شهر من — ورامین',
      'city_card_aqi': 'شاخص آلودگی هوا',
      'city_card_aqi_sub': 'بر پایهٔ شاخص استاندارد AQI',
      'city_card_weather': 'آب و هوا',
      'city_name_varamin': 'ورامین',
      'city_card_prayer': 'اوقات شرعی',
      'dash_clock_label': 'ساعت',
      'dash_date_label': 'تاریخ امروز',
      'dash_stat_notif': 'اعلان جدید',
      'dash_latest_news': 'آخرین اخبار',
      'contact_direct_sub': 'ارتباط مستقیم',
      'contact_direct_title': 'ارتباط مستقیم',
      'contact_direct_desc': 'با واحدهای شهرداری ورامین در تماس باشید',
      'contact_137_name': 'سامانه ۱۳۷',
      'contact_137_time': 'پاسخگویی شبانه‌روزی',
      'contact_email_name': 'ایمیل شهرداری',
      'contact_support_name': 'پشتیبانی آنلاین',
      'contact_support_desc': 'چت مستقیم با پشتیبان',
      'contact_address_name': 'آدرس شهرداری',
      'contact_address_val2': 'ورامین، میدان شهرداری',
      'ad_sponsored': 'تبلیغات',
      'vsc_eyebrow': 'شهر ما، خانه‌ ما',
      'vsc_mosque_title': 'مسجد جامع ورامین',
      'vsc_mosque_desc': 'از دل تاریخ تا امروز؛ بنایی اصیل از میراث فرهنگی ورامین',
      'vsc_tower_title': 'برج علاءالدوله ورامین',
      'vsc_tower_desc': 'یادگار معماری ایلخانی؛ نمادی برافراشته از تاریخ کهن ورامین',
      'learn_more': 'بیشتر بدانیم',
      'tag_jameh_mosque': 'مسجد جامع',
      'tag_world_heritage': 'میراث جهانی',
      'tag_historic_tower': 'برج تاریخی',
      'tag_national_heritage': 'میراث ملی',

      /* پیام‌ها و توست‌ها */
      'toast_lang_changed': 'زبان با موفقیت به فارسی تغییر یافت',
      'toast_profile_saved': 'اطلاعات با موفقیت ذخیره شد',
      'toast_report_deleted': 'گزارش با موفقیت حذف شد',
      'toast_report_added': 'گزارش با موفقیت ثبت شد',
      'toast_logout': 'از حساب کاربری خارج شدید',
      'toast_invalid_phone': 'شماره موبایل وارد شده معتبر نمی‌باشد',
      'toast_invalid_code': 'کد تایید وارد شده نامعتبر است',
      'toast_fill_required': 'لطفاً فیلدهای الزامی را تکمیل کنید',
      'toast_fav_removed': 'از علاقه‌مندی‌ها حذف شد',
      'toast_settings_saved': 'تنظیمات ذخیره شد',
      'toast_coming_soon': 'این بخش به‌زودی فعال می‌شود'
    },

    en: {
      /* App Identity */
      'app_name': 'E-Pelak',
      'app_subtitle': 'Varamin Integrated Citizen Services',
      'city_title': 'Varamin Municipality',

      /* Login & Auth */
      'login_title': 'Citizen Login',
      'login_phone_label': 'Mobile Phone Number',
      'login_phone_ph': '09123456789',
      'login_btn': 'Login / Register',
      'login_demo_btn': 'Quick Demo Login',
      'login_terms': 'By logging in, you agree to the Terms of Service & Privacy Policy.',
      'otp_title': 'Verify Mobile Number',
      'otp_desc': 'Enter Verification Code',
      'otp_desc_prefix': 'A 4-digit code was sent to ',
      'otp_desc_suffix': ' via SMS',
      'otp_ph': '4-digit code',
      'otp_verify': 'Verify & Login',
      'otp_resend': 'Resend Code',
      'otp_change_phone': 'Change Mobile Number',

      /* Navigation & Common Actions */
      'nav_home': 'Home',
      'nav_dashboard': 'Dashboard',
      'nav_services': 'Services',
      'nav_reports': 'Reports',
      'nav_profile': 'Profile',
      'back': 'Back',
      'save': 'Save Changes',
      'cancel': 'Cancel',
      'confirm': 'Confirm',
      'search': 'Search',
      'delete': 'Delete',
      'edit': 'Edit',
      'view_all': 'View All',
      'retry': 'Retry',
      'submit': 'Submit',
      'next': 'Next Step',
      'prev': 'Previous Step',
      'logout': 'Sign Out',

      /* Home Screen */
      'home_banner_title': 'Varamin Urban Management',
      'home_banner_sub': 'Smart municipal citizen services at your fingertips.',
      'home_quick_access': 'Quick Actions',
      'home_services_title': 'Popular Services',
      'home_latest_news': 'Latest News & Updates',
      'service_submit_report': 'Submit Request',
      'service_submit_report_sub': 'Report an issue',
      'service_track_report': 'Track Request',
      'service_track_report_sub': 'Status of reports & tickets',
      'service_all_services': 'E-Services',
      'service_all_services_sub': 'Municipal services',
      'service_news': 'News & Updates',
      'service_news_sub': 'City announcements',
      'service_payment': 'Pay Taxes',
      'service_payment_sub': 'Tolls & duties',
      'service_map': 'City Map',
      'service_map_sub': 'Find city places',
      'service_contact': 'Contact Us',
      'service_contact_sub': '137 Hotline & support',
      'service_heritage': 'Varamin Heritage',
      'service_heritage_sub': 'Tourism & history',

      /* Citizen Dashboard */
      'dash_title': 'Citizen Dashboard',
      'dash_hello': 'Hello,',
      'dash_welcome': 'Welcome',
      'dash_today': 'Today',
      'dash_stat_pending': 'Pending Review',
      'dash_stat_in_progress': 'In Progress',
      'dash_stat_done': 'Completed',
      'dash_stat_debt': 'Renovation Dues',
      'dash_stat_nodebt': 'No Dues',
      'dash_recent_activity': 'Recent Reports',
      'dash_no_activity': 'No activities recorded yet',
      'dash_weather_title': 'Weather Forecast',
      'dash_aqi_title': 'Air Quality Index',
      'mayor_meeting_header': 'Request In-Person Meeting',
      'mayor_meeting_card_title': 'Request in-person meeting with City Council & Mayor',

      /* Report Registration */
      'report_new_title': 'Submit Citizen Report',
      'report_step1_title': 'Step 1 of 4: Category',
      'report_header_new': 'Submit New Request',
      'report_header_location': 'Issue Location',
      'report_header_media': 'Add Photo or Video',
      'report_header_review': 'Review & Confirm',
      'report_step1_hint': 'Select the urban issue category:',
      'report_step2_title': 'Step 2 of 4: Department',
      'report_step2_hint': 'Select the relevant department:',
      'report_step3_title': 'Step 3 of 4: Details & Media',
      'report_step4_title': 'Step 4 of 4: Confirmation',
      'report_title_label': 'Report Title',
      'report_title_ph': 'e.g., Pothole on 5th Street',
      'report_desc_label': 'Detailed Description',
      'report_desc_ph': 'Please describe the problem in detail...',
      'report_loc_label': 'Location',
      'report_loc_ph': 'Exact address or local directions...',
      'report_pick_map': 'Select Location on Map',
      'report_attach_photo': 'Attach Photos (Optional)',
      'report_add_photo': 'Add Photo',
      'report_summary_title': 'Report Summary',
      'report_field_cat': 'Category:',
      'report_field_dept': 'Department:',
      'report_field_subdept': 'Sub-Unit:',
      'report_field_title': 'Title:',
      'report_field_desc': 'Description:',
      'report_field_loc': 'Location:',
      'report_field_photos': 'Attached Photos:',
      'report_submit_final': 'Submit Final Report',
      'report_success_title': 'Report Submitted Successfully!',
      'report_success_track': 'Your Tracking Code:',
      'report_success_hint': 'Please save this tracking code for future inquiries.',
      'report_view_in_reports': 'View in My Reports',
      'report_back_home': 'Back to Home',

      /* Report Categories */
      'cat_asphalt': 'Civil, Asphalt & Streets',
      'cat_green': 'Parks & Green Spaces',
      'cat_waste': 'Waste & Street Cleaning',
      'cat_obstruction': 'Obstructions & Violations',
      'cat_lighting': 'Lighting & Street Utilities',
      'cat_traffic': 'Traffic & Public Transit',
      'cat_other': 'Other Urban Issues',

      /* My Reports */
      'my_reports_title': 'My Reports',
      'filter_all': 'All',
      'filter_pending': 'Pending',
      'filter_in_progress': 'In Progress',
      'filter_done': 'Completed',
      'reports_empty': 'No reports submitted yet',
      'reports_empty_filter': 'No reports found in this category',
      'report_detail_title': 'Report Details',
      'report_tracking_code': 'Tracking Code',
      'report_location': 'Location',
      'report_dept': 'Department',
      'report_description': 'Description',
      'report_timeline_title': 'Progress Timeline',
      'report_delete_action': 'Delete This Report',
      'report_back_to_list': 'Back to Reports List',

      /* Status Badges */
      'status_pending': 'Pending',
      'status_in_progress': 'In Progress',
      'status_done': 'Completed',

      /* Timeline Steps */
      'timeline_step1': 'Report Submitted',
      'timeline_step2': 'Initial Review',
      'timeline_step3': 'Referred to Unit',
      'timeline_step4': 'Official Response',

      /* Request Tracking */
      'track_title': 'Track Request',
      'track_ph': 'Enter tracking code or title...',
      'track_profile_ph': 'e.g. EP-1403-0021 or TK-1403-0012',
      'track_no_reports': 'No reports to display at the moment.',
      'track_not_found': 'No report found with this tracking code',
      'track_recent_title': 'Recent Reports',

      /* Profile */
      'profile_title': 'Citizen Profile',
      'profile_default_name': 'Citizen',
      'profile_no_phone': 'No phone registered',
      'profile_no_nid': 'National ID not registered',
      'profile_no_addr': 'Address not registered',
      'profile_edit_menu': 'Edit Profile',
      'profile_edit_title': 'Edit Profile',
      'profile_reports_menu': 'My Reports',
      'profile_favs_menu': 'Favorites',
      'profile_settings_menu': 'Settings',
      'profile_dark_mode': 'Dark Mode',
      'profile_sound': 'Sound Effects',
      'profile_app_language': 'App Language',
      'profile_logout': 'Sign Out',
      'profile_user_title': 'User Profile',
      'profile_no_reports_yet': 'No reports submitted yet.',
      'profile_view_all_reports': 'View All Reports',
      'profile_change_photo': 'Change Photo',
      'profile_remove_photo': 'Remove Photo',
      'profile_full_name': 'Full Name',
      'profile_phone': 'Mobile Phone',
      'profile_nid': 'National ID',
      'profile_address': 'Home Address',
      'profile_address_ph': 'Enter your address...',

      /* Settings */
      'settings_title': 'Settings',
      'settings_push_notif': 'Push Notifications',
      'settings_sms_notif': 'SMS Notifications',
      'settings_location_access': 'Location Access',
      'settings_sound': 'Notification Sounds',
      'settings_support': 'Support & Contact Us',
      'settings_terms': 'Terms & Privacy Policy',
      'settings_app_version': 'App Version',

      /* Favorites & Notifications */
      'favs_title': 'Favorites',
      'fav_title': 'Favorites',
      'favs_empty': 'No services added to favorites yet',
      'notifs_title': 'Notifications',
      'notif_title': 'Notifications',
      'notifs_empty': 'No notifications to display',
      'notif_read_all': 'Mark all read',
      'notif_delete_all': 'Delete all',
      'notif_delete_one': 'Delete this notification',
      'notif_deleted': 'Notification deleted',
      'notif_deleted_all': 'All notifications deleted',
      /* Connection */
      'offline_title': 'No internet connection',
      'offline_desc': 'This app only works online. Check your phone internet and try again.',
      'offline_retry': 'Try again',
      'offline_checking': 'Checking connection…',
      'offline_toast': 'You are offline; try again once the connection is back',
      'edit_profile_title': 'Edit Profile',
      'map_nearby_title': 'Nearby Places & Services',

      /* Contact Us */
      'contact_title': 'Contact Municipality',
      'contact_137_title': '137 Urban Management Hotline',
      'contact_137_desc': '24/7 hotline for citizen requests & complaints',
      'contact_direct_phone': 'Direct Municipal Phone:',
      'contact_email': 'Email:',
      'contact_address': 'Address:',
      'contact_address_val': 'Varamin, Imam Khomeini Sq., Shahrdari Blvd., Central Building',

      /* Map & Places */
      'map_title': 'City Map & Places',
      'map_search_ph': 'Search places in Varamin...',

      /* Electronic Services */
      'services_title': 'Electronic Services',
      'services_search_ph': 'Search services...',
      'services_tab_all': 'All Services',
      'services_tab_urban': 'Urban Planning',
      'services_tab_city': 'Municipal Services',
      'services_tab_culture': 'Culture & Sports',
      'services_tab_finance': 'Finance & Taxes',

      /* Payment */
      'payment_title': 'Pay Taxes & Fees',
      'payment_renovation': 'Renovation & Development Tax',
      'payment_car': 'Vehicle Tax',
      'payment_waste': 'Waste Management Fee',
      'payment_btn': 'Pay Online',
      'payment_total_debt': 'Total Outstanding Balance',
      'pay_detail_header': 'Bill Details',
      'pay_title_label': 'Title',
      'pay_code_label': 'Bill Number',
      'pay_due_label': 'Payment Due',
      'pay_status_label': 'Status',
      'pay_amount_label': 'Amount Payable',

      /* Services & News */
      'svc_hero_badge': 'Smart Municipal SuperApp',
      'svc_hero_title': 'E-Pelak Services',
      'svc_hero_sub': 'From tax payments and recycling to transport, tourism, and smart city living; all in one unified place.',
      'service_cat_header': 'Service Category',
      'service_detail_header': 'Service Details',
      'news_tab_knowledge': 'Varamin Heritage',
      'news_tab_news': 'News & Info',
      'heritage_mosque_pin': '722 AH · Ilkhanate Era',
      'heritage_mosque_title': 'Varamin Jameh Mosque',
      'heritage_mosque_desc': 'The only complete four-iwan mosque in Iran; a masterwork of Ilkhanate brickwork, mosaic tiles, and delicate plasterwork begun under Sultan Mohammad Khodabandeh and completed under Abu Sa\'id Bahadur Khan.',
      'heritage_tower_pin': '688 AH · Mausoleum',
      'heritage_tower_title': 'Varamin Alaeddin Tower',
      'heritage_tower_desc': 'A cylindrical funerary tower topped by a soaring conical dome, built by Fakhr al-Din for his father Hasan Ala\' od-Dowleh; one of Iran\'s earliest registered national monuments with turquoise glazed tilework.',
      'heritage_note_text': 'Both monuments are officially registered National Cultural Heritage sites in Iran.',
      'read_more_arrow': 'Read More →',
      'back_to_knowledge': 'Back to Heritage',
      'back_to_news': 'Back to News',

      /* City Live, Showcase & Contact */
      'city_my_varamin': 'My City — Varamin',
      'city_card_aqi': 'Air Quality Index',
      'city_card_aqi_sub': 'Based on standard AQI',
      'city_card_weather': 'Weather',
      'city_name_varamin': 'Varamin',
      'city_card_prayer': 'Prayer Times',
      'dash_clock_label': 'Time',
      'dash_date_label': "Today's Date",
      'dash_stat_notif': 'New Notification',
      'dash_latest_news': 'Latest News',
      'contact_direct_sub': 'Direct Contact',
      'contact_direct_title': 'Direct Contact',
      'contact_direct_desc': 'Get in touch with Varamin Municipal departments',
      'contact_137_name': '137 Hotline',
      'contact_137_time': '24/7 Citizen Support',
      'contact_email_name': 'Municipal Email',
      'contact_support_name': 'Online Support',
      'contact_support_desc': 'Direct chat with support',
      'contact_address_name': 'Municipal Address',
      'contact_address_val2': 'Varamin, Shahrdari Square',
      'ad_sponsored': 'Sponsored',
      'vsc_eyebrow': 'Our City, Our Home',
      'vsc_mosque_title': 'Varamin Jameh Mosque',
      'vsc_mosque_desc': 'From history to today; an authentic gem of Varamin heritage',
      'vsc_tower_title': 'Varamin Alaeddin Tower',
      'vsc_tower_desc': 'An Ilkhanate architectural marvel; an enduring historic symbol',
      'learn_more': 'Learn More',
      'tag_jameh_mosque': 'Jameh Mosque',
      'tag_world_heritage': 'World Heritage',
      'tag_historic_tower': 'Historic Tower',
      'tag_national_heritage': 'National Heritage',

      /* Messages & Toasts */
      'toast_lang_changed': 'Language changed to English',
      'toast_profile_saved': 'Profile updated successfully',
      'toast_report_deleted': 'Report deleted successfully',
      'toast_report_added': 'Report submitted successfully',
      'toast_logout': 'Signed out successfully',
      'toast_invalid_phone': 'Please enter a valid mobile number',
      'toast_invalid_code': 'Invalid verification code',
      'toast_fill_required': 'Please fill in required fields',
      'toast_fav_removed': 'Removed from favorites',
      'toast_settings_saved': 'Settings saved successfully',
      'toast_coming_soon': 'This feature will be available soon'
    }
  };

  /* =========================================================
     نقشه مستقیم عبارات فارسی به انگلیسی برای ترجمه خودکار
  ========================================================= */
  var PHRASE_MAP_FA_TO_EN = {
    'بدون اینترنت اتصال ممکن نیست': 'No internet connection',
    'تلاش مجدد': 'Try again',
    'حذف همه': 'Delete all',
    'خواندن همه': 'Mark all read',
    'حذف این اعلان': 'Delete this notification',
    'خانه': 'Home',
    'پیشخوان': 'Dashboard',
    'خدمات': 'Services',
    'گزارش‌ها': 'Reports',
    'گزارش ها': 'Reports',
    'پروفایل': 'Profile',
    'بازگشت': 'Back',
    'جستجو': 'Search',
    'حذف': 'Delete',
    'حذف این گزارش': 'Delete This Report',
    'ویرایش': 'Edit',
    'مشاهده همه': 'View All',
    'مشاهده همه گزارش‌ها': 'View All Reports',
    'مشاهده گزارش‌های من': 'View My Reports',
    'مشاهده جزئیات': 'View Details',
    'در انتظار': 'Pending',
    'در انتظار بررسی': 'Pending Review',
    'در حال انتظار': 'Waiting',
    'در حال بررسی': 'In Progress',
    'در حال رسیدگی': 'In Progress',
    'در حال پیگیری': 'In Progress',
    'انجام شد': 'Completed',
    'ثبت گزارش': 'Report Submitted',
    'روند رسیدگی': 'Processing Flow',
    'پاسخ داده شده': 'Completed',
    'انجام شده': 'Completed',
    'همه': 'All',
    'تمام خدمات': 'All Services',
    'شهرسازی': 'Urban Planning',
    'خدمات شهری': 'Municipal Services',
    'فرهنگی و ورزشی': 'Culture & Sports',
    'مالی و عوارض': 'Finance & Taxes',
    'ثبت درخواست': 'Submit Request',
    'گزارش مشکل': 'Report Issue',
    'پیگیری درخواست': 'Track Request',
    'وضعیت گزارش‌ها': 'Reports Status',
    'خدمات الکترونیک': 'E-Services',
    'سرویس‌های شهری': 'Municipal Services',
    'اخبار و اطلاعیه‌ها': 'News & Updates',
    'آخرین اخبار شهرداری': 'Municipal News',
    'پرداخت عوارض': 'Pay Taxes',
    'عوارض و خدمات': 'Taxes & Services',
    'نقشه شهری': 'City Map',
    'نقشه شهر': 'City Map',
    'مسجد جامع': 'Jameh Mosque',
    'مکان‌یابی شهری': 'City Map',
    'تماس با ما': 'Contact Us',
    'تماس با شهرداری': 'Contact Municipality',
    'سامانه ۱۳۷ و پشتیبانی': '137 Support',
    'میراث ورامین': 'Varamin Heritage',
    'گردشگری و تاریخ': 'Tourism & History',
    'دسترسی سریع': 'Quick Actions',
    'خدمات پرکاربرد': 'Popular Services',
    'آخرین اخبار و اطلاعیه‌ها': 'Latest News & Updates',
    'آخرین اخبار و رویدادها': 'Latest News & Events',
    'پیشخوان شهروندی': 'Citizen Dashboard',
    'گزارش‌های من': 'My Reports',
    'هنوز گزارشی ثبت نشده': 'No reports submitted yet',
    'هنوز گزارشی ثبت نشده است': 'No reports submitted yet',
    'هنوز گزارشی ثبت نشده است.': 'No reports submitted yet.',
    'لطفاً مشکل را با جزئیات توضیح دهید...': 'Please describe the problem in detail...',
    'مثلاً: خیابان امام خمینی، نرسیده به میدان اصلی': 'e.g., Imam Khomeini St., near main square',
    '۰۰۰۰۰۰۰۰۰۰': '0000000000',
    'مثلاً EP-1403-0021': 'e.g. EP-1403-0021',
    'در حال حاضر گزارشی برای نمایش وجود ندارد.': 'No reports to display at the moment.',
    'گزارشی با این کد پیگیری یافت نشد': 'No report found with this tracking code',
    'گزارشی در این دسته یافت نشد': 'No reports found in this category',
    'اعلانی برای نمایش وجود ندارد': 'No notifications to display',
    'هنوز خدمتی را به علاقه‌مندی‌ها اضافه نکرده‌اید': 'No services added to favorites yet',
    'پروفایل کاربری': 'User Profile',
    'پروفایل شهروندی': 'Citizen Profile',
    'ویرایش پروفایل': 'Edit Profile',
    'ویرایش مشخصات': 'Edit Profile',
    'علاقه‌مندی‌ها': 'Favorites',
    'تنظیمات': 'Settings',
    'حالت شب': 'Dark Mode',
    'زبان برنامه': 'App Language',
    'خروج از حساب': 'Sign Out',
    'تغییر عکس': 'Change Photo',
    'حذف عکس': 'Remove Photo',
    'نام و نام خانوادگی': 'Full Name',
    'شماره موبایل': 'Mobile Phone',
    'شماره تماس': 'Mobile Phone',
    'کد ملی': 'National ID',
    'آدرس محل سکونت': 'Home Address',
    'آدرس خود را وارد کنید...': 'Enter your address...',
    'ذخیره تغییرات': 'Save Changes',
    'انصراف': 'Cancel',
    'کد ملی ثبت نشده': 'National ID not registered',
    'آدرس ثبت نشده': 'Address not registered',
    'شماره ثبت نشده': 'No phone registered',
    'شهروند': 'Citizen',
    'کاربر سامانه': 'Citizen User',
    'ثبت گزارش جدید': 'Submit New Report',
    '+ ثبت گزارش جدید': '+ Submit New Report',
    'ثبت گزارش مردمی': 'Submit Citizen Report',
    'مرحله ۱ از ۴: دسته‌بندی موضوع': 'Step 1 of 4: Category',
    'مرحله ۱ از ۴: انتخاب موضوع': 'Step 1 of 4: Category',
    'موضوع مشکل شهری را انتخاب کنید:': 'Select urban issue category:',
    'مرحله ۲ از ۴: واحد شهرداری': 'Step 2 of 4: Department',
    'مرحله ۳ از ۴: شرح و مستندات': 'Step 3 of 4: Details & Media',
    'مرحله ۴ از ۴: تایید نهایی': 'Step 4 of 4: Confirmation',
    'واحد مربوطه را انتخاب کنید:': 'Select the relevant department:',
    'واحد مربوطه را انتخاب کنید': 'Select the relevant department',
    'انتخاب واحد شهرداری': 'Select Municipal Department',
    'انتخاب زیرواحد': 'Select Sub-Department',
    'واحد مربوطه': 'Department',
    'واحد شهرداری': 'Municipal Department',
    'عنوان گزارش': 'Report Title',
    'شرح دقیق مشکل': 'Detailed Description',
    'موقعیت مکانی': 'Location',
    'موقعیت مکانی مشکل': 'Issue Location',
    'انتخاب موقعیت روی نقشه': 'Pick Location on Map',
    'پیوست تصویر (اختیاری)': 'Attach Photos (Optional)',
    'افزودن تصویر': 'Add Photos',
    'افزودن عکس یا فیلم': 'Add Photo or Video',
    'برای افزودن عکس یا فیلم ضربه بزنید': 'Tap to add photo or video',
    'حداکثر ۳ تصویر': 'Up to 3 photos',
    'حداکثر ۳ فایل — عکس یا فیلم': 'Up to 3 files — photo or video',
    'حداکثر ۳ فایل (عکس یا فیلم)': 'Up to 3 files (photo or video)',
    'فایل (عکس/فیلم)': 'files (photo/video)',
    'تصاویر و فیلم‌های ارسالی': 'Attached Photos & Videos',
    'پیوست': 'Attachment',
    'رد کردن و ادامه بدون تصویر': 'Skip & Continue Without Photo',
    'استفاده از موقعیت فعلی من': 'Use My Current Location',
    'یا آدرس را وارد کنید': 'Or enter address manually',
    'نقشه موقعیت انتخابی (نمایشی)': 'Selected location map (demo)',
    'بازبینی و تایید نهایی': 'Review & Final Confirmation',
    'تصاویر پیوست': 'Attached Photos',
    'توضیحات': 'Details',
    'موقعیت': 'Location',
    'تصاویر': 'Photos',
    'تایید': 'Confirm',
    'خلاصه گزارش': 'Report Summary',
    'خلاصه اطلاعات گزارش': 'Report Summary',
    'دسته‌بندی:': 'Category:',
    'موضوع:': 'Category:',
    'واحد شهرداری:': 'Department:',
    'زیرواحد:': 'Sub-Unit:',
    'عنوان:': 'Title:',
    'شرح:': 'Description:',
    'موقعیت:': 'Location:',
    'تصاویر پیوست:': 'Attached Photos:',
    'ثبت نهایی گزارش': 'Submit Final Report',
    'مرحله بعد': 'Next Step',
    'مرحله قبل': 'Previous Step',
    'گزارش با موفقیت ثبت شد!': 'Report Submitted Successfully!',
    'کد رهگیری شما:': 'Your Tracking Code:',
    'کد پیگیری شما:': 'Your Tracking Code:',
    'کد رهگیری را جهت پیگیری‌های بعدی یادداشت فرمایید.': 'Save tracking code for future inquiries.',
    'مشاهده در گزارش‌های من': 'View in My Reports',
    'بازگشت به صفحه اصلی': 'Back to Home',
    'بازگشت به خانه': 'Back to Home',
    'جزئیات گزارش': 'Report Details',
    'کد پیگیری': 'Tracking Code',
    'کد پیگیری:': 'Tracking Code:',
    'روند رسیدگی': 'Review Timeline',
    'بازگشت به لیست گزارش‌ها': 'Back to Reports List',
    'ثبت گزارش': 'Report Submitted',
    'ثبت اولیه': 'Initial Submission',
    'بررسی اولیه': 'Initial Review',
    'ارجاع به واحد مربوطه': 'Referred to Department',
    'پاسخ مدیریت': 'Official Response',
    'پایان عملیات': 'Operation Completed',
    'اعلان‌های پوش': 'Push Notifications',
    'اعلان‌های پیامکی': 'SMS Notifications',
    'دسترسی به موقعیت مکانی': 'Location Access',
    'صدای اعلان‌ها': 'Notification Sounds',
    'پشتیبانی و تماس با ما': 'Support & Contact Us',
    'قوانین و مقررات': 'Terms & Conditions',
    'نسخه برنامه': 'App Version',
    'سامانه مدیریت شهری ۱۳۷': '137 Urban Management Hotline',
    'تماس ۲۴ ساعته با مرکز ارتباطات مردمی': '24/7 hotline for citizen requests & complaints',
    'تلفن مستقیم شهرداری:': 'Direct Phone:',
    'پست الکترونیک:': 'Email:',
    'آدرس:': 'Address:',
    'ورود / ثبت‌نام': 'Login / Register',
    'ورود سریع آزمایشی': 'Quick Demo Login',
    'ورود شهروندان': 'Citizen Login',
    'شماره تلفن همراه': 'Mobile Phone Number',
    'دریافت کد تایید': 'Get Verification Code',
    'تایید شماره همراه': 'Verify Mobile Number',
    'تایید شماره موبایل': 'Verify Mobile Number',
    'تایید و ورود': 'Verify & Login',
    'تایید و ادامه': 'Verify & Continue',
    'ارسال مجدد کد': 'Resend Code',
    'تغییر شماره همراه': 'Change Number',
    'پرداخت آنلاین': 'Pay Online',
    'مبلغ قابل پرداخت': 'Payable Amount',
    'مجموع بدهی': 'Total Outstanding Balance',
    'جزئیات قبض': 'Bill Details',
    'شماره قبض': 'Bill Number',
    'مهلت پرداخت': 'Payment Due',
    'پرداخت‌شده': 'Paid',
    'پرداخت‌نشده': 'Unpaid',
    'این قبض قبلاً پرداخت شده است': 'This bill has been paid',
    'بازگشت به اخبار': 'Back to News',
    'بازگشت به دانستنی‌ها': 'Back to Info',
    'ورود به بخش پرداخت': 'Proceed to Payment',
    'شهر ما، خانه‌ ما': 'Our City, Our Home',
    'شهر ما، خانه ما': 'Our City, Our Home',
    'بیشتر بدانیم': 'Learn More',
    'میراث جهانی': 'World Heritage',
    'میراث ملی': 'National Heritage',
    'برج تاریخی': 'Historic Tower',
    'اماکن و خدمات شهری': 'City Places & Services',
    'ارتباط مستقیم': 'Direct Contact',
    'با واحدهای شهرداری ورامین در تماس باشید': 'Get in touch with Varamin Municipal departments',
    'سامانه ۱۳۷': '137 Hotline',
    'پاسخگویی شبانه‌روزی': '24/7 Citizen Support',
    'ایمیل شهرداری': 'Municipal Email',
    'پشتیبانی آنلاین': 'Online Support',
    'چت مستقیم با پشتیبان': 'Direct chat with support',
    'آدرس شهرداری': 'Municipal Address',
    'ورامین، میدان شهرداری': 'Varamin, Shahrdari Square',
    'شهر من — ورامین': 'My City — Varamin',
    'شاخص آلودگی هوا': 'Air Quality Index',
    'بر پایهٔ شاخص استاندارد AQI': 'Based on standard AQI',
    'ورامین': 'Varamin',
    'آب و هوا': 'Weather',
    'اوقات شرعی': 'Prayer Times',
    'ساعت': 'Time',
    'تاریخ امروز': "Today's Date",
    'اعلان جدید': 'New Notification',
    'آخرین فعالیت‌ها': 'Recent Activities',
    'آخرین اخبار': 'Latest News',
    'از دل تاریخ تا امروز؛ بنایی اصیل از میراث فرهنگی ورامین': 'From history to today; an authentic gem of Varamin heritage',
    'یادگار معماری ایلخانی؛ نمادی برافراشته از تاریخ کهن ورامین': 'An Ilkhanate architectural marvel; an enduring historic symbol',
    'بدهی عوارض': 'Renovation Dues',
    'انجام‌شده': 'Completed',
    'انجام شده': 'Completed',
    'در انتظار بررسی': 'Pending Review',
    'افتتاح پارک جدید در منطقه شمالی ورامین': 'Grand Opening of New Northern Varamin Municipal Park',
    'اطلاعیه نوبت‌دهی پرداخت عوارض نوسازی': 'Notice: Municipal Renovation Tax Payment Deadline Extended',
    'برگزاری جشنواره فرهنگی شهر ورامین': 'Varamin City Annual Cultural & Arts Festival',
    'آغاز طرح بازآفرینی بافت فرسوده مرکز شهر': 'Downtown Historic Urban Regeneration Plan Launched',
    'سوپر‌اپلیکیشن خدمات شهری': 'Smart Municipal SuperApp',
    'خدمات ای‌پلاک': 'E-Pelak Services',
    'از پرداخت عوارض و بازیافت تا حمل‌ونقل، گردشگری و زندگی شهری هوشمند؛ همه در یک جا.': 'From tax payments and recycling to transport, tourism, and smart city living; all in one unified place.',
    'دانستنی‌های ورامین': 'Varamin Heritage',
    'اخبار و اطلاعات': 'News & Info',
    'مطالعه بیشتر ←': 'Read More →',
    'مطالعه بیشتر': 'Read More',
    'بخش خدمات': 'Service Category',
    'جزئیات سرویس': 'Service Details',
    'سرویس در ۵ بخش': 'Services in 5 Categories',
    'برای ورود به هر بخش، روی کادر آن بزنید': 'Tap on any category card to view its services',
    'ورود مستقیم': 'Direct Access',
    'این سرویس چیست؟': 'About This Service',
    'ماژول‌های این سرویس': 'Service Modules',
    'چه چیزهایی ارائه می‌دهد؟': 'Features & Capabilities',
    'سرویس‌های این بخش': 'Services in This Category',
    'مالی و عوارض شهری': 'Municipal Finance & Taxes',
    'استعلام و پرداخت عوارض، قبوض و بدهی‌های شهری': 'Inquire and pay urban tolls, utility bills, and municipal dues',
    'کسب‌وکار و بوم‌گردی': 'Local Business & Tourism',
    'ویترین اصناف، تبلیغات محله‌محور و معرفی ظرفیت‌های گردشگری هر شهر': 'Local merchant storefronts, targeted ads, and tourism promotion',
    'محیط‌زیست و بازیافت': 'Environment & Recycling',
    'تفکیک از مبدأ، فروش به پایلوت و درخواست آنلاین جمع‌آوری': 'Source separation, sales to certified pilots, and pickup requests',
    'زندگی شهری هوشمند': 'Smart Urban Living',
    'ماژول‌های روزمره و دسترسی برخط به نقشه‌های مصوب شهری و روستایی': 'Everyday lifestyle modules and online access to master zoning plans',
    'حمل‌ونقل و ترافیک': 'Transport & Traffic',
    'برنامه حرکت قطارها، پرداخت عوارض تردد و پایش لحظه‌ای ناوگان': 'Train timetables, congestion fees, and live transit fleet tracking',
    'پایش ناوگان عمومی و خرید بلیت': 'Live Transit Fleet & E-Tickets',
    'موقعیت لحظه‌ای تاکسیرانی، اتوبوسرانی و مترو برای عموم': 'Live bus, taxi & metro tracking with digital ticketing',
    'دیسپلی کسب‌وکارهای محلی': 'Local Business Showcase',
    'ویترین دیجیتال اصناف همراه با ای‌پلاک ادز': 'Digital shopfronts with E-Pelak Ads',
    'بوم‌گردی و گردشگری شهری': 'Ecotourism & Urban Travel',
    'معرفی و گسترش بوم‌گردی هر شهر': 'Promoting local heritage and tourism',
    'بازیافت و تفکیک پسماند': 'Waste Recycling & Sorting',
    'خرید توسط پایلوت و ثبت آنلاین درخواست جمع‌آوری': 'Scheduled doorstep collection & Green Wallet rewards',
    'مکمل‌های سوپراپلیکیشن ای‌پلاک': 'E-Pelak SuperApp Add-ons',
    'آب‌وهوا، آلودگی هوا، اوقات شرعی و مدیریت ساختمان': 'Weather, Air Quality, Prayer Times & Building Management',
    'نقشه طرح هادی روستایی': 'Rural Master Plan Map',
    'نقشه آنلاین و یکپارچه به تفکیک هر آبادی': 'Integrated online zoning map for rural settlements',
    'مترو و قطارهای شهری و بین‌شهری': 'Metro & Regional Rail',
    'برنامه حرکت، وضعیت خطوط و برنامه‌ریزی سفر': 'Timetables, line status & route planning',
    'پرداخت طرح ترافیک و آلودگی هوا': 'Congestion & LEZ Fee Payment',
    'عوارض تردد در کلان‌شهرها، کاملاً آنلاین': 'Metropolitan congestion & low-emission zone tolls, 100% online',
    'مسجد جامع ورامین': 'Varamin Jameh Mosque',
    'برج علاءالدوله ورامین': 'Varamin Alaeddin Tower',
    '۷۲۲ ه.ق · دوره ایلخانی': '722 AH · Ilkhanate Era',
    '۶۸۸ ه.ق · آرامگاهی': '688 AH · Mausoleum',
    'عمران، آسفالت و معابر': 'Civil, Asphalt & Streets',
    'فضای سبز و بوستان‌ها': 'Parks & Green Spaces',
    'پسماند، نظافت و تفکیک زباله': 'Waste & Street Cleaning',
    'سد معبر و تخلفات شهری': 'Obstructions & Violations',
    'روشنایی و تاسیسات معابر': 'Lighting & Street Utilities',
    'ترافیک و حمل‌ونقل شهری': 'Traffic & Public Transport',
    'سایر موضوعات شهری': 'Other Urban Issues',
    'عمران و آسفالت': 'Civil & Asphalt',
    'فضای سبز': 'Green Spaces',
    'پسماند و نظافت': 'Waste & Cleaning',
    'سد معبر': 'Obstruction',
    'روشنایی معابر': 'Street Lighting',
    'ترافیک': 'Traffic',
    'سایر': 'Other',
    /* اداره‌ها و واحدها */
    'حوزه شهردار': "Mayor's Office",
    'دفتر شهردار ورامین': 'Office of the Mayor of Varamin',
    'روابط عمومی و امور بین‌الملل': 'Public Relations & International Affairs',
    'بازرسی و ارزیابی عملکرد': 'Inspection & Performance Evaluation',
    'حراست شهرداری': 'Municipal Security',
    'امور حقوقی': 'Legal Affairs',
    'شورای مشاوران': 'Advisory Council',
    'معاونت اداری و مالی': 'Administrative & Financial Affairs',
    'منابع انسانی': 'Human Resources',
    'امور اداری': 'Administrative Services',
    'امور مالی و حسابداری': 'Finance & Accounting',
    'بودجه و برنامه‌ریزی': 'Budget & Planning',
    'تدارکات و پشتیبانی': 'Procurement & Support',
    'فناوری اطلاعات (IT)': 'Information Technology (IT)',
    'معاونت فنی و عمرانی': 'Technical & Civil Engineering',
    'طراحی و اجرای پروژه‌های عمرانی': 'Civil Projects Design & Execution',
    'ساخت و نگهداری معابر': 'Street Construction & Maintenance',
    'پل‌ها و تونل‌ها': 'Bridges & Tunnels',
    'ساختمان‌های عمومی': 'Public Buildings',
    'تأسیسات شهری': 'Urban Utilities',
    'معاونت شهرسازی و معماری': 'Urban Planning & Architecture',
    'صدور پروانه ساختمانی': 'Building Permits',
    'پایان کار ساختمان': 'Building Completion Certificates',
    'کنترل و نظارت ساختمانی': 'Building Inspection & Oversight',
    'طرح‌های توسعه شهری': 'Urban Development Plans',
    'کمیسیون‌های شهرسازی': 'Urban Planning Commissions',
    'معاونت خدمات شهری': 'Municipal & Urban Services',
    'نظافت شهری': 'Street Cleaning & Sanitation',
    'مدیریت پسماند': 'Waste Management',
    'زیباسازی شهر': 'City Beautification',
    'آرامستان‌ها': 'Cemeteries',
    'کنترل حیوانات شهری': 'Urban Animal Control',
    'معاونت حمل‌ونقل و ترافیک': 'Transport & Traffic Affairs',
    'مدیریت ترافیک': 'Traffic Management',
    'پارکینگ‌ها': 'Parking Services',
    'حمل‌ونقل عمومی': 'Public Transit',
    'پایانه‌ها': 'Transit Terminals',
    'ایمنی و علائم راهنمایی': 'Road Safety & Signage',
    'معاونت فرهنگی و اجتماعی': 'Cultural & Social Affairs',
    'فرهنگسراها': 'Cultural Centers',
    'کتابخانه‌ها': 'Public Libraries',
    'امور جوانان': 'Youth Affairs',
    'امور بانوان': "Women's Affairs",
    'مشارکت‌های مردمی': 'Civic Engagement',
    'ورزش همگانی': 'Public Sports',
    'معاونت برنامه‌ریزی و توسعه': 'Planning & Development',
    'آمار و اطلاعات': 'Statistics & Information',
    'پژوهش و نوآوری': 'Research & Innovation',
    'مدیریت پروژه': 'Project Management',
    'هوشمندسازی شهر': 'Smart City Development',
    'سازمان‌ها و شرکت‌های وابسته': 'Affiliated Organizations & Companies',
    'سازمان مدیریت پسماند': 'Waste Management Organization',
    'سازمان آتش‌نشانی و خدمات ایمنی': 'Fire Department & Safety Services',
    'سازمان پارک‌ها و فضای سبز': 'Parks & Green Space Organization',
    'سازمان زیباسازی': 'City Beautification Organization',
    'سازمان حمل‌ونقل بار و مسافر': 'Passenger & Cargo Transport Org',
    'سازمان میادین و بازارها': 'City Markets & Bazaars Org',
    'سازمان آرامستان‌ها': 'Cemeteries Organization',
    'سازمان فناوری اطلاعات و ارتباطات': 'ICT Organization',
    'سازمان فرهنگی، اجتماعی و ورزشی': 'Cultural, Social & Sports Org',
    'سازمان سرمایه‌گذاری و مشارکت‌های مردمی': 'Investment & Civic Participation Org',
    'شرکت بهره‌برداری مترو': 'Metro Operating Company',
    'شرکت واحد اتوبوسرانی': 'City Bus Transit Company',
    'شرکت نوسازی و بهسازی شهری': 'Urban Renovation Company',
    /* پیام‌ها */
    'اطلاعات با موفقیت ذخیره شد': 'Profile updated successfully',
    'گزارش با موفقیت ثبت شد': 'Report submitted successfully',
    'گزارش حذف شد': 'Report deleted successfully',
    'گزارش با موفقیت حذف شد': 'Report deleted successfully',
    'تنظیمات ذخیره شد': 'Settings saved successfully',
    'از علاقه‌مندی‌ها حذف شد': 'Removed from favorites',
    'به علاقه‌مندی‌ها افزوده شد': 'Added to favorites',
    'از حساب کاربری خارج شدید': 'Signed out successfully',
    'این بخش به‌زودی فعال می‌شود': 'This feature will be available soon',
    'شماره موبایل وارد شده معتبر نمی‌باشد': 'Please enter a valid mobile number',
    'کد تایید وارد شده نامعتبر است': 'Invalid verification code',
    'لطفاً فیلدهای الزامی را تکمیل کنید': 'Please fill in required fields',
    'لطفاً موضوع گزارش را انتخاب کنید': 'Please select a report category',
    'لطفاً واحد مربوطه را انتخاب کنید': 'Please select a department',
    'لطفاً عنوان و شرح گزارش را وارد کنید': 'Please enter title and description',
    'لطفاً موقعیت مکانی را مشخص کنید': 'Please specify the location',
    /* نمودار پیشرفت بارگذاری هر عکس/فیلم */
    'فایل آپلود شد': 'File uploaded',
    'ارسال نشد': 'Upload failed',
    'در صف ارسال': 'Waiting to upload',
    'تلاش دوباره…': 'Retrying…',
    'تلاش دوباره': 'Try again'
  };

  /* ساخت معکوس انگلیسی به فارسی برای بازگشت بدون افت کیفیت */
  var PHRASE_MAP_EN_TO_FA = {};
  Object.keys(PHRASE_MAP_FA_TO_EN).forEach(function (faKey) {
    var enVal = PHRASE_MAP_FA_TO_EN[faKey];
    PHRASE_MAP_EN_TO_FA[enVal] = faKey;
  });

  /* =========================================================
     هسته وضعیت و توابع زبان
  ========================================================= */
  var currentLang = 'fa';

  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fa') {
      currentLang = saved;
    }
  } catch (e) {}

  function getLanguage() {
    return currentLang;
  }

  function t(keyOrText, fallback) {
    if (!keyOrText) return '';
    var trimmed = String(keyOrText).trim();

    // ۱. بررسی کلید رسمی در دیکشنری
    if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][trimmed] !== undefined) {
      return TRANSLATIONS[currentLang][trimmed];
    }

    // ۲. بررسی عبارت مستقیم فارسی به انگلیسی
    if (currentLang === 'en') {
      if (PHRASE_MAP_FA_TO_EN[trimmed]) {
        return PHRASE_MAP_FA_TO_EN[trimmed];
      }
      // اگر از قبل انگلیسی است
      if (PHRASE_MAP_EN_TO_FA[trimmed]) {
        return trimmed;
      }
    } else {
      // ۳. بررسی عبارت انگلیسی به فارسی
      if (PHRASE_MAP_EN_TO_FA[trimmed]) {
        return PHRASE_MAP_EN_TO_FA[trimmed];
      }
    }

    return fallback !== undefined ? fallback : keyOrText;
  }

  /* اعمال تغییرات زبان در DOM */
  function applyCurrentLanguage(root) {
    var container = root || document;
    var isEn = (currentLang === 'en');

    // ۱. تگ HTML و جهت
    if (document.documentElement) {
      document.documentElement.setAttribute('lang', currentLang);
      document.documentElement.setAttribute('dir', isEn ? 'ltr' : 'rtl');
    }

    // ۲. کلاس‌های بادی
    if (document.body) {
      if (isEn) {
        document.body.classList.add('lang-en');
        document.body.classList.remove('lang-fa');
      } else {
        document.body.classList.add('lang-fa');
        document.body.classList.remove('lang-en');
      }
    }

    // ۳. المان‌های دارای data-i18n صریح
    var i18nElements = container.querySelectorAll('[data-i18n]');
    i18nElements.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key) {
        var translated = t(key);
        if (translated && translated !== key) {
          el.textContent = translated;
        }
      }
    });

    // ۴. پلیس‌هولدرها با data-i18n-ph
    var phElements = container.querySelectorAll('[data-i18n-ph]');
    phElements.forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      if (key) {
        var translated = t(key);
        if (translated && translated !== key) {
          el.placeholder = translated;
        }
      }
    });

    // ۵. دکمه بازگشت (متن داخل span)
    var backSpans = container.querySelectorAll('.app-back-btn span');
    backSpans.forEach(function (span) {
      span.textContent = isEn ? 'Back' : 'بازگشت';
    });

    // ۶. نویگیشن بار پایینی
    var navButtons = container.querySelectorAll('.nav-bar .nav-item');
    navButtons.forEach(function (btn) {
      var childNodes = btn.childNodes;
      for (var i = childNodes.length - 1; i >= 0; i--) {
        if (childNodes[i].nodeType === Node.TEXT_NODE) {
          var raw = childNodes[i].textContent.trim();
          if (raw) {
            var trans = t(raw);
            childNodes[i].textContent = '\n        ' + trans + '\n      ';
            break;
          }
        }
      }
    });

    // ۷. تب‌های فیلتر گزارش‌ها
    var filterTabs = container.querySelectorAll('.filter-tab');
    filterTabs.forEach(function (tab) {
      var raw = tab.textContent.trim();
      if (raw) {
        tab.textContent = t(raw);
      }
    });

    // ۸. برچسب‌های منوهای پروفایل و تنظیمات
    var menuLabels = container.querySelectorAll('.menu-item-label');
    menuLabels.forEach(function (lbl) {
      var raw = lbl.textContent.trim();
      if (raw) {
        lbl.textContent = t(raw);
      }
    });

    // ۹. نمایشگر زبان در پروفایل
    var langDisplay = document.getElementById('langValueDisplay');
    if (langDisplay) {
      langDisplay.textContent = isEn ? 'English' : 'فارسی';
    }

    // ۱۰. عناوین هدر صفحات
    var headers = container.querySelectorAll('.top-header > div:not(.theme-toggle):not(.header-spacer)');
    headers.forEach(function (h) {
      var raw = h.textContent.trim();
      if (raw && !h.querySelector('button') && !h.querySelector('img')) {
        h.textContent = t(raw);
      }
    });

    // ۱۱. دکمه‌های اصلی و ورودی‌ها
    var tealButtons = container.querySelectorAll('.btn-teal, .btn-sm-teal');
    tealButtons.forEach(function (btn) {
      // اگر اسپان‌های متنی دارد، اسپان‌ها را ترجمه کن
      var spans = btn.querySelectorAll('span');
      if (spans.length > 0) {
        spans.forEach(function (sp) {
          var rawSp = sp.textContent.trim();
          if (rawSp === '←' || rawSp === '→') {
            sp.textContent = isEn ? '→' : '←';
          } else if (rawSp && rawSp !== '✓' && rawSp !== '📡') {
            sp.textContent = t(rawSp);
          }
        });
      } else {
        var raw = btn.textContent.trim();
        if (raw && !btn.querySelector('svg') && !btn.querySelector('input')) {
          btn.textContent = t(raw);
        }
      }
    });

    // ۱۲. برچسب‌های فرم (labels)
    var labels = container.querySelectorAll('label, .form-title, .step-label');
    labels.forEach(function (lbl) {
      var raw = lbl.textContent.trim();
      if (raw && !lbl.querySelector('input') && !lbl.querySelector('svg')) {
        lbl.textContent = t(raw);
      }
    });

    // ۱۳. بخش‌های سرویس صفحه خانه
    var homeServiceCards = container.querySelectorAll('.service-card h3, .service-card p');
    homeServiceCards.forEach(function (el) {
      var raw = el.textContent.trim();
      if (raw) {
        el.textContent = t(raw);
      }
    });

    // ۱۴. عناوین بخش‌ها
    var sectionTitles = container.querySelectorAll('.section-title, .section-link');
    sectionTitles.forEach(function (st) {
      var raw = st.textContent.trim();
      if (raw) {
        st.textContent = t(raw);
      }
    });

    // ۱۵. پلیس‌هولدر اینپوت‌ها و تکست‌آریاها
    var searchInputs = container.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], textarea');
    searchInputs.forEach(function (inp) {
      if (inp.placeholder) {
        var rawPh = inp.placeholder.trim();
        inp.placeholder = t(rawPh);
      }
    });

    // ۱۶. فلش‌های جهت در هدر فرم‌ها (← در فارسی، → در انگلیسی)
    var formHeaderArrows = container.querySelectorAll('.form-header span');
    formHeaderArrows.forEach(function (sp) {
      var txt = sp.textContent.trim();
      if (txt === '←' || txt === '→') {
        sp.textContent = isEn ? '→' : '←';
      }
    });

    // ۱۷. برچسب‌های متنی داخل کارت‌ها
    var cardTexts = container.querySelectorAll('.glass-card p, .glass-card span, .glass-card div');
    cardTexts.forEach(function (el) {
      if (el.children.length === 0) {
        var raw = el.textContent.trim();
        if (raw && (PHRASE_MAP_FA_TO_EN[raw] || PHRASE_MAP_EN_TO_FA[raw])) {
          el.textContent = t(raw);
        }
      }
    });

    // ۱۸. به‌روزرسانی زیرنویس صفحه کد تایید OTP
    if (typeof updateOtpDescription === 'function') {
      try { updateOtpDescription(); } catch (e) {}
    }
  }

  /* تغییر زبان به همراه رندر مجدد و پیام کاربر */
  function setLanguage(lang, silent) {
    if (lang !== 'fa' && lang !== 'en') return;
    currentLang = lang;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (e) {}

    if (typeof document !== 'undefined') {
      applyCurrentLanguage(document);
    }

    // به‌روزرسانی ماژول‌های فعال
    try {
      if (typeof updateProfileUI === 'function') updateProfileUI();
      if (typeof renderProfileReportsSummary === 'function') renderProfileReportsSummary({ skipBackend: true });
      if (typeof renderReportsList === 'function') {
        var activeFilter = 'all';
        var activeTab = (typeof document !== 'undefined') ? document.querySelector('.filter-tab.active') : null;
        if (activeTab) {
          activeFilter = activeTab.getAttribute('data-filter') || 'all';
        }
        renderReportsList(activeFilter, { skipBackend: true });
      }
      if (typeof renderFavorites === 'function') renderFavorites();
      if (typeof renderDepartments === 'function' && typeof window !== 'undefined' && window.DEFAULT_DEPARTMENTS) {
        renderDepartments(window.DEFAULT_DEPARTMENTS);
      }
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof startDashClock === 'function') startDashClock();
      if (typeof renderServices === 'function') renderServices();
      if (typeof renderNewsList === 'function') renderNewsList();
      if (typeof renderPaymentList === 'function') renderPaymentList();
      if (typeof renderMapPlaces === 'function') renderMapPlaces();
      if (typeof renderNotifications === 'function') renderNotifications();
      if (typeof renderTips === 'function') renderTips();
      if (typeof window !== 'undefined' && typeof window.renderCityLive === 'function') {
        window.renderCityLive();
      }
      if (typeof window !== 'undefined' && typeof window.renderDashStrip === 'function') {
        var dashNewsList = (lang === 'en' && window.newsData_EN) ? window.newsData_EN : (window.newsData || []);
        window.renderDashStrip(dashNewsList);
      }

      var activeScreen = (typeof document !== 'undefined' && typeof document.querySelector === 'function') ? document.querySelector('.screen.active') : null;
      if (activeScreen) {
        if (activeScreen.id === 'screen-service-category' && typeof openServiceCategory === 'function' && typeof lastOpenedCategoryId !== 'undefined' && lastOpenedCategoryId) {
          openServiceCategory(lastOpenedCategoryId);
        } else if (activeScreen.id === 'screen-service-detail' && typeof openServiceDetail === 'function' && typeof lastOpenedServiceId !== 'undefined' && lastOpenedServiceId) {
          openServiceDetail(lastOpenedServiceId);
        } else if (activeScreen.id === 'screen-news' && typeof activeScreen.querySelector === 'function') {
          var activeTab = activeScreen.querySelector('#newsTabs .news-tab.active');
          var tabName = activeTab ? activeTab.getAttribute('data-tab') : 'knowledge';
          if (typeof switchNewsTab === 'function') switchNewsTab(tabName, activeTab);
        }
      }
    } catch (err) {
      console.warn('[i18n] module refresh note:', err);
    }

    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: lang } }));
      }
    } catch (e) {}

    if (!silent && typeof showToast === 'function') {
      var toastMsg = lang === 'en' ? 'Language set to English' : 'زبان به فارسی تغییر یافت';
      showToast(toastMsg);
    }
  }

  /* تعویض میان دو زبان */
  function toggleLanguage() {
    var nextLang = currentLang === 'fa' ? 'en' : 'fa';
    setLanguage(nextLang, false);
  }

  /* راه‌اندازی اولیه */
  function init() {
    if (typeof document !== 'undefined') {
      applyCurrentLanguage(document);

      // اطمینان از تنظیم دقیق در بارگذاری کامل صفحه
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          applyCurrentLanguage(document);
        });
      }
    }

    // به‌روزرسانی وضعیت در سوئیچینگ صفحات
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('popstate', function () {
        if (typeof document !== 'undefined') {
          setTimeout(function () { applyCurrentLanguage(document); }, 50);
        }
      });
    }
  }

  // راه‌اندازی فوری
  init();

  return {
    get currentLang() { return currentLang; },
    set currentLang(val) { setLanguage(val, true); },
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    toggleLanguage: toggleLanguage,
    applyCurrentLanguage: applyCurrentLanguage,
    t: t,
    init: init,
    translations: TRANSLATIONS,
    phraseMapFaToEn: PHRASE_MAP_FA_TO_EN,
    phraseMapEnToFa: PHRASE_MAP_EN_TO_FA
  };
}));

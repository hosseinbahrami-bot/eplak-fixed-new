/* ============================================================================
   core/places-data.js — فهرست اماکن مهم شهر ورامین (برای «نقشه و اماکن شهری»)

   این فایل «فقط داده» است؛ منطق در core/places.js و ظاهر در modules/city-map.js است.
   افزودن/اصلاح یک مکان = یک خط در آرایه‌ی places (docs/CITY_MAP_FA.md را ببینید).

   منبع مختصات: OpenStreetMap (© مشارکت‌کنندگان OpenStreetMap، پروانه‌ی ODbL)؛ برداشت از
   پایگاه داده‌ی زنده‌ی OSM در ۱۴۰۵/۰۷/۰۹ (2026-10-01). نشانی‌ها از برچسب‌های OSM یا منبع رسمی
   (سایت فرمانداری/شهرداری ورامین) است. تلفن‌ها: شماره‌های ملی (۱۱۰، ۱۲۳، ۱۲۵، ۱۳۷) یا شماره‌ای که
   دست‌کم دو فهرست مستقل (مثلاً دکتریاب و دکترساینا، سلامتی۲۴ و بلد) برای همان مرکز داده‌اند.
   approx: 1  یعنی موقعیت از روی قرائن (نشانی رسمی + نقشه) برآورد شده و باید بازدید میدانی شود.
   چند اثر ملیِ ثبت‌شده (امامزاده حسین‌رضا، آرامگاه سید فتح‌الله، قلعه باجک، تصفیه‌خانه قند) در OSM نام‌گذاری
   نشده‌اند؛ مختصات‌شان از ویکی‌داده (CC0) است و چون منبع دومی ندارند approx: 1 دارند.

   فیلدها:  id (یکتا)، cat (دسته)، fa/en (نام)، lat/lng، also (دسته‌ی دوم برای فیلتر)،
            addr/addrEn (نشانی کوتاه)، tel (شماره‌ی تماس)، note/noteEn (توضیح کوتاه)، approx.
   ============================================================================ */
(function (root) {
  'use strict';

  var DATA = {
    version: '2026-10-01',
    center: { lat: 35.3300, lng: 51.6430, zoom: 13 },
    /* مرز تقریبی شهر ورامین؛ برای آزمون صحت مختصات و محدود کردن نقشه */
    bounds: { south: 35.3050, west: 51.5950, north: 35.3980, east: 51.6850 },
    categories: [
      {"id": "health", "fa": "درمانی و بهداشتی", "en": "Health", "color": "#ef4444", "ink": "#ffffff"},
      {"id": "mosque", "fa": "مساجد و اماکن مذهبی", "en": "Mosques & Shrines", "color": "#10b981", "ink": "#ffffff"},
      {"id": "culture", "fa": "فرهنگی و تاریخی", "en": "Culture & Heritage", "color": "#a855f7", "ink": "#ffffff"},
      {"id": "office", "fa": "ادارات و سازمان‌ها", "en": "Offices", "color": "#3b82f6", "ink": "#ffffff"},
      {"id": "safety", "fa": "انتظامی و امدادی", "en": "Police & Rescue", "color": "#f97316", "ink": "#ffffff"},
      {"id": "edu", "fa": "آموزشی", "en": "Education", "color": "#0ea5e9", "ink": "#ffffff"},
      {"id": "park", "fa": "پارک و ورزش", "en": "Parks & Sports", "color": "#84cc16", "ink": "#1a2e05"},
      {"id": "transport", "fa": "حمل‌ونقل", "en": "Transport", "color": "#6366f1", "ink": "#ffffff"},
      {"id": "area", "fa": "محله‌ها و میدان‌ها", "en": "Neighborhoods & Squares", "color": "#eab308", "ink": "#3b2a00"},
    ],
    places: [
      /* ── درمانی ── */
      {"id": "mofatteh-hospital", "cat": "health", "fa": "بیمارستان شهید دکتر مفتح", "en": "Dr. Mofatteh Hospital", "lat": 35.32837, "lng": 51.66248, "addr": "میدان رازی، بلوار امام رضا", "addrEn": "Razi Sq., Imam Reza Blvd.", "tel": "02136223011"},
      {"id": "15khordad-hospital", "cat": "health", "fa": "بیمارستان شهدای ۱۵ خرداد", "en": "Shohada-ye 15 Khordad Hospital", "lat": 35.36933, "lng": 51.6178, "tel": "02136234926", "addr": "نرسیده به میدان ولیعصر، ابتدای ورودی شهر", "addrEn": "Before Valiasr Sq., city entrance"},
      {"id": "tajik-clinic", "cat": "health", "fa": "درمانگاه شبانه‌روزی شهید محمد تاجیک", "en": "Shahid Mohammad Tajik 24-hour Clinic", "lat": 35.33988, "lng": 51.63445},
      {"id": "kheyrabad-clinic", "cat": "health", "fa": "درمانگاه شبانه‌روزی مرکزی خیرآباد", "en": "Kheyrabad Central 24-hour Clinic", "lat": 35.38402, "lng": 51.6081, "addr": "خیرآباد، جاده تهران – ورامین", "addrEn": "Kheyrabad, Tehran–Varamin Rd."},
      {"id": "health-network", "cat": "health", "fa": "شبکه بهداشت و درمان ورامین", "en": "Varamin Health Network", "lat": 35.32915, "lng": 51.64142},
      {"id": "social-emergency", "cat": "health", "fa": "اورژانس اجتماعی (۱۲۳)", "en": "Social Emergency (123)", "lat": 35.3286, "lng": 51.64124, "tel": "123"},
      {"id": "kheyrabad-health", "cat": "health", "fa": "شبکه بهداشت خیرآباد", "en": "Kheyrabad Health Center", "lat": 35.38348, "lng": 51.60857},
      {"id": "modarres-health", "cat": "health", "fa": "شبکه بهداشت شهرک مدرس", "en": "Shahrak-e Modarres Health Center", "lat": 35.37173, "lng": 51.61022, "addr": "شهرک مدرس، گلستان ۱۰", "addrEn": "Shahrak-e Modarres, Golestan 10"},
      {"id": "kheyrabad-pharmacy24", "cat": "health", "fa": "داروخانه شبانه‌روزی دکتر علیرضائی", "en": "Dr. Alirezaei 24-hour Pharmacy", "lat": 35.38377, "lng": 51.60866, "addr": "خیرآباد، بلوار شهید سلیمانی", "addrEn": "Kheyrabad, Shahid Soleimani Blvd."},
      /* ── مساجد و اماکن مذهبی ── */
      {"id": "jame-mosque", "cat": "mosque", "fa": "مسجد جامع ورامین", "en": "Jame Mosque of Varamin", "lat": 35.32213, "lng": 51.64164, "also": "culture", "note": "از زیباترین مساجد چهارایوانی ایران؛ یادگار دوره ایلخانی", "noteEn": "One of Iran's finest four-iwan mosques, dating from the Ilkhanid era"},
      {"id": "imamzadeh-yahya", "cat": "mosque", "fa": "امامزاده یحیی (ع)", "en": "Imamzadeh Yahya", "lat": 35.31615, "lng": 51.6483, "also": "culture", "addr": "محله کهنه‌گل", "addrEn": "Kohneh Gol neighborhood", "note": "از مهم‌ترین زیارتگاه‌های ورامین؛ بقعه‌ای از سال ۷۰۷ هجری قمری و ثبت‌شده در آثار ملی (شماره‌ی ۱۹۹)", "noteEn": "One of Varamin's most important shrines; a shrine building from 707 AH, registered as a national monument (no. 199)"},
      {"id": "imamzadeh-hossein-reza", "cat": "mosque", "fa": "امامزاده حسین‌رضا (ع)", "en": "Imamzadeh Hossein Reza", "lat": 35.33822, "lng": 51.64375, "also": "culture", "approx": 1, "note": "برج آرامگاهی تاریخی؛ اثر ثبت‌شده در فهرست آثار ملی ایران (مختصات از ویکی‌داده)", "noteEn": "A historic tomb tower, registered on Iran's National Heritage list (coordinates from Wikidata)"},
      {"id": "seyyed-fathollah-tomb", "cat": "mosque", "fa": "آرامگاه سید فتح‌الله", "en": "Tomb of Seyyed Fathollah", "lat": 35.32381, "lng": 51.64839, "also": "culture", "approx": 1, "note": "امامزاده و برج آرامگاهی؛ اثر ثبت‌شده در فهرست آثار ملی ایران (مختصات از ویکی‌داده)", "noteEn": "An imamzadeh and tomb tower, registered on Iran's National Heritage list (coordinates from Wikidata)"},
      {"id": "imamzadeh-zeid", "cat": "mosque", "fa": "امامزاده زید ابوالحسن حسینی ورامینی", "en": "Imamzadeh Zeid Abolhasan Hosseini", "lat": 35.32081, "lng": 51.64198},
      {"id": "imamzadeh-abdollah", "cat": "mosque", "fa": "امامزاده عبدالله (مرکز شهر)", "en": "Imamzadeh Abdollah (City Center)", "lat": 35.32068, "lng": 51.64401, "addr": "خیابان امامزاده عبدالله", "addrEn": "Imamzadeh Abdollah St."},
      {"id": "imamzadeh-abdollah-kolahdooz", "cat": "mosque", "fa": "امامزاده عبدالله (خیابان کلاهدوز)", "en": "Imamzadeh Abdollah (Kolahdooz St.)", "lat": 35.32633, "lng": 51.61736, "addr": "خیابان کلاهدوز", "addrEn": "Kolahdooz St."},
      {"id": "imamzadeh-kokab", "cat": "mosque", "fa": "امامزاده کوکب‌الدین", "en": "Imamzadeh Kokab al-Din", "lat": 35.32738, "lng": 51.64376},
      {"id": "imamzadeh-sakineh", "cat": "mosque", "fa": "امامزاده سکینه بانو", "en": "Imamzadeh Sakineh Banoo", "lat": 35.31576, "lng": 51.65757},
      {"id": "imamzadeh-mohsen", "cat": "mosque", "fa": "امامزاده محسن", "en": "Imamzadeh Mohsen", "lat": 35.32677, "lng": 51.6095, "addr": "خیابان کلاهدوز", "addrEn": "Kolahdooz St."},
      {"id": "imamzadeh-taher", "cat": "mosque", "fa": "امامزاده طاهر و مطهر (ع)", "en": "Imamzadeh Taher & Motahar", "lat": 35.38628, "lng": 51.61949, "addr": "خیرآباد", "addrEn": "Kheyrabad"},
      {"id": "chahardah-masoom-mosque", "cat": "mosque", "fa": "مسجد چهارده معصوم", "en": "Chahardah Masoom Mosque", "lat": 35.32747, "lng": 51.64741},
      {"id": "sahebzaman-mosque", "cat": "mosque", "fa": "مسجد صاحب‌الزمان", "en": "Sahib al-Zaman Mosque", "lat": 35.32441, "lng": 51.64491},
      {"id": "imam-hadi-mosque", "cat": "mosque", "fa": "مسجد امام هادی", "en": "Imam Hadi Mosque", "lat": 35.32019, "lng": 51.65167},
      {"id": "amir-almomenin-mosque", "cat": "mosque", "fa": "مسجد امیرالمؤمنین", "en": "Amir al-Mu'minin Mosque", "lat": 35.32216, "lng": 51.65099},
      {"id": "bani-fatemeh-mosque", "cat": "mosque", "fa": "مسجد بنی‌فاطمه", "en": "Bani Fatemeh Mosque", "lat": 35.32223, "lng": 51.65081},
      {"id": "razavi-mosque", "cat": "mosque", "fa": "مسجد رضوی", "en": "Razavi Mosque", "lat": 35.33439, "lng": 51.64458},
      {"id": "imam-reza-mosque", "cat": "mosque", "fa": "مسجد امام رضا", "en": "Imam Reza Mosque", "lat": 35.34862, "lng": 51.64518},
      {"id": "imam-hossein-mosque-north", "cat": "mosque", "fa": "مسجد امام حسین (شمال شهر)", "en": "Imam Hossein Mosque (North)", "lat": 35.35802, "lng": 51.63633},
      {"id": "imam-hossein-mosque-center", "cat": "mosque", "fa": "مسجد امام حسین (مرکز شهر)", "en": "Imam Hossein Mosque (Center)", "lat": 35.33163, "lng": 51.64964},
      {"id": "modarres-jame-mosque", "cat": "mosque", "fa": "مسجد جامع صاحب‌الزمان (شهرک مدرس)", "en": "Sahib al-Zaman Jame Mosque (Shahrak-e Modarres)", "lat": 35.37424, "lng": 51.61045, "addr": "شهرک مدرس", "addrEn": "Shahrak-e Modarres"},
      {"id": "al-yasin-mosque", "cat": "mosque", "fa": "مسجد آل‌یاسین (شهرک مدرس)", "en": "Al-Yasin Mosque (Shahrak-e Modarres)", "lat": 35.37566, "lng": 51.60856, "addr": "شهرک مدرس، شهید باهنر", "addrEn": "Shahrak-e Modarres, Shahid Bahonar"},
      {"id": "kheyrabad-sahebzaman-mosque", "cat": "mosque", "fa": "مسجد صاحب‌الزمان (خیرآباد)", "en": "Sahib al-Zaman Mosque (Kheyrabad)", "lat": 35.38753, "lng": 51.61145, "addr": "خیرآباد", "addrEn": "Kheyrabad"},
      {"id": "abolfazl-mosque", "cat": "mosque", "fa": "مسجد ابوالفضل", "en": "Abolfazl Mosque", "lat": 35.38901, "lng": 51.61634},
      {"id": "ashura-mosque", "cat": "mosque", "fa": "مسجد عاشورا", "en": "Ashura Mosque", "lat": 35.38551, "lng": 51.60606},
      {"id": "hayat-14masoom", "cat": "mosque", "fa": "هیئت چهارده معصوم (ع)", "en": "Chahardah Masoom Congregation Hall", "lat": 35.38536, "lng": 51.60764},
      {"id": "sarallah-hosseiniyeh", "cat": "mosque", "fa": "حسینیه ثارالله", "en": "Tharallah Hosseiniyeh", "lat": 35.32116, "lng": 51.64544},
      {"id": "hossein-reza-cemetery", "cat": "mosque", "fa": "گلزار شهدای حسین‌رضا", "en": "Hossein Reza Martyrs' Cemetery", "lat": 35.33962, "lng": 51.64241},
      /* ── فرهنگی و تاریخی ── */
      {"id": "alaeddin-tower", "cat": "culture", "fa": "برج علاءالدوله", "en": "Alaeddin Tower", "lat": 35.32503, "lng": 51.64559, "note": "برج آرامگاهی آجری با کتیبه‌های کوفی و کاشی‌کاری؛ از آثار ملی ایران", "noteEn": "A brick tomb tower with Kufic inscriptions and tilework; a registered national monument"},
      {"id": "iraj-castle", "cat": "culture", "fa": "قلعه ایرج (گبری)", "en": "Iraj (Gabri) Castle", "lat": 35.34229, "lng": 51.67966, "note": "از قلعه‌های تاریخی معروف به «گبری» در ورامین", "noteEn": "A historic fortress among Varamin's 'Gabri' castles"},
      {"id": "bajak-castle", "cat": "culture", "fa": "بقایای قلعه باجک", "en": "Remains of Bajak Castle", "lat": 35.32408, "lng": 51.61044, "approx": 1, "note": "اثر ثبت‌شده در فهرست آثار ملی ایران (مختصات از ویکی‌داده)", "noteEn": "Registered on Iran's National Heritage list (coordinates from Wikidata)"},
      {"id": "sugar-refinery", "cat": "culture", "fa": "تصفیه‌خانه قند ورامین", "en": "Varamin Sugar Refinery (heritage site)", "lat": 35.34689, "lng": 51.63528, "approx": 1, "note": "بنای صنعتی؛ اثر ثبت‌شده در فهرست آثار ملی ایران (مختصات از ویکی‌داده)", "noteEn": "An industrial heritage building, registered on Iran's National Heritage list (coordinates from Wikidata)"},
      {"id": "razi-culture-center", "cat": "culture", "fa": "فرهنگسرای رازی", "en": "Razi Cultural Center", "lat": 35.32255, "lng": 51.65452},
      {"id": "razi-library", "cat": "culture", "fa": "کتابخانه رازی", "en": "Razi Library", "lat": 35.32237, "lng": 51.65414},
      /* ── ادارات و سازمان‌ها ── */
      {"id": "governorate", "cat": "office", "fa": "فرمانداری ورامین", "en": "Varamin Governorate", "lat": 35.32798, "lng": 51.64129, "approx": 1, "tel": "02136253164", "addr": "میدان امام حسین (ع)، خیابان شهید بهشتی، روبروی شهرداری", "addrEn": "Emam Hossein Sq., Shahid Beheshti St., opposite the Municipality"},
      {"id": "municipality", "cat": "office", "fa": "شهرداری ورامین (ساختمان مرکزی)", "en": "Varamin Municipality (Main Building)", "lat": 35.32831, "lng": 51.64017, "tel": "137", "addr": "ابتدای خیابان شهید بهشتی، میدان شهرداری، روبروی فرمانداری", "addrEn": "Beginning of Shahid Beheshti St., Municipality Sq., opposite the Governorate"},
      {"id": "municipality-district1", "cat": "office", "fa": "شهرداری ناحیه یک ورامین", "en": "Municipality – District 1", "lat": 35.31973, "lng": 51.65047, "tel": "137", "addr": "خیابان شهید بهشتی", "addrEn": "Shahid Beheshti St."},
      {"id": "municipality-zone2", "cat": "office", "fa": "شهرداری منطقه دو ورامین", "en": "Municipality – Zone 2", "lat": 35.37081, "lng": 51.62043, "tel": "137"},
      {"id": "courthouse", "cat": "office", "fa": "دادگستری ورامین", "en": "Varamin Courthouse", "lat": 35.3331, "lng": 51.64017},
      {"id": "revolution-court", "cat": "office", "fa": "دادگاه انقلاب ورامین", "en": "Varamin Revolutionary Court", "lat": 35.32928, "lng": 51.63767},
      {"id": "registry", "cat": "office", "fa": "اداره ثبت اسناد و املاک ورامین", "en": "Varamin Property & Deeds Registry", "lat": 35.33315, "lng": 51.64198},
      {"id": "water", "cat": "office", "fa": "اداره آب و فاضلاب", "en": "Water & Wastewater Office", "lat": 35.32809, "lng": 51.6395},
      {"id": "electricity", "cat": "office", "fa": "اداره برق", "en": "Electricity Office", "lat": 35.32888, "lng": 51.63846},
      {"id": "gas", "cat": "office", "fa": "اداره گاز شهرستان ورامین", "en": "Varamin Gas Company Office", "lat": 35.32559, "lng": 51.63726},
      {"id": "social-security", "cat": "office", "fa": "اداره تأمین اجتماعی ورامین", "en": "Varamin Social Security Office", "lat": 35.32519, "lng": 51.63752},
      {"id": "education-office", "cat": "office", "fa": "آموزش و پرورش منطقه ورامین", "en": "Varamin Education Department", "lat": 35.32581, "lng": 51.63638},
      {"id": "telecom", "cat": "office", "fa": "مخابرات ورامین", "en": "Varamin Telecommunications Office", "lat": 35.32871, "lng": 51.63923},
      {"id": "agri-jihad", "cat": "office", "fa": "جهاد کشاورزی ورامین", "en": "Varamin Agricultural Jihad Organization", "lat": 35.3243, "lng": 51.65969},
      {"id": "forensic", "cat": "office", "fa": "پزشکی قانونی ورامین", "en": "Varamin Legal Medicine Office", "lat": 35.33054, "lng": 51.64897},
      {"id": "welfare", "cat": "office", "fa": "بهزیستی (مرکز خیرآباد)", "en": "Welfare Organization (Kheyrabad center)", "lat": 35.38563, "lng": 51.61664, "addr": "خیرآباد", "addrEn": "Kheyrabad"},
      {"id": "plate-center", "cat": "office", "fa": "مرکز تعویض پلاک ورامین", "en": "Varamin Vehicle Plate Center", "lat": 35.32749, "lng": 51.66901},
      {"id": "weather-office", "cat": "office", "fa": "اداره هواشناسی ورامین", "en": "Varamin Meteorological Office", "lat": 35.34384, "lng": 51.63226},
      /* ── انتظامی و امدادی ── */
      {"id": "police-hq", "cat": "safety", "fa": "ستاد فرماندهی انتظامی شهرستان ورامین", "en": "Varamin Police Command HQ", "lat": 35.32011, "lng": 51.64801, "tel": "110", "addr": "خیابان بهشتی", "addrEn": "Beheshti St."},
      {"id": "kelantari-11", "cat": "safety", "fa": "کلانتری ۱۱ قدوسی", "en": "Police Station 11 (Ghoddousi)", "lat": 35.34704, "lng": 51.63261, "tel": "110"},
      {"id": "police-agahi", "cat": "safety", "fa": "پلیس آگاهی ورامین", "en": "Varamin Criminal Investigation Police", "lat": 35.34705, "lng": 51.63227, "tel": "110"},
      {"id": "kelantari-13", "cat": "safety", "fa": "کلانتری ۱۳ شهید بهشتی", "en": "Police Station 13 (Beheshti)", "lat": 35.31567, "lng": 51.63874, "tel": "110"},
      {"id": "traffic-police", "cat": "safety", "fa": "پلیس راهنمایی و رانندگی شهرستان ورامین", "en": "Varamin Traffic Police", "lat": 35.36414, "lng": 51.62065, "tel": "110"},
      {"id": "traffic-police-east", "cat": "safety", "fa": "پلیس راهنمایی و رانندگی شرق استان تهران", "en": "East Tehran Province Traffic Police", "lat": 35.3228, "lng": 51.67509, "tel": "110"},
      {"id": "east-police-hq", "cat": "safety", "fa": "ستاد فرماندهی انتظامی شرق استان تهران", "en": "East Tehran Province Police Command", "lat": 35.3678, "lng": 51.61292, "tel": "110", "addr": "خیابان احمدیه", "addrEn": "Ahmadiyeh St."},
      {"id": "fata-police", "cat": "safety", "fa": "پلیس فتا شرق استان تهران", "en": "East Tehran Province Cyber Police (FATA)", "lat": 35.36789, "lng": 51.61262, "tel": "110"},
      {"id": "fire-1", "cat": "safety", "fa": "ایستگاه ۱ آتش‌نشانی ورامین", "en": "Varamin Fire Station 1", "lat": 35.33776, "lng": 51.63669, "tel": "125"},
      {"id": "fire-2", "cat": "safety", "fa": "ایستگاه ۲ آتش‌نشانی ورامین", "en": "Varamin Fire Station 2", "lat": 35.37059, "lng": 51.62045, "tel": "125", "addr": "جاده تهران – ورامین", "addrEn": "Tehran–Varamin Rd."},
      {"id": "fire-3", "cat": "safety", "fa": "ایستگاه ۳ آتش‌نشانی ورامین", "en": "Varamin Fire Station 3", "lat": 35.32422, "lng": 51.65574, "tel": "125"},
      {"id": "fire-4", "cat": "safety", "fa": "ایستگاه ۴ آتش‌نشانی ورامین", "en": "Varamin Fire Station 4", "lat": 35.36146, "lng": 51.64712, "tel": "125"},
      /* ── آموزشی ── */
      {"id": "sama-university", "cat": "edu", "fa": "دانشگاه آزاد اسلامی سما ورامین", "en": "Islamic Azad University – Sama Varamin", "lat": 35.31403, "lng": 51.67078},
      {"id": "azad-agri", "cat": "edu", "fa": "دانشکده کشاورزی دانشگاه آزاد اسلامی ورامین – پیشوا", "en": "Azad University Varamin–Pishva (Agriculture Faculty)", "lat": 35.31885, "lng": 51.65926},
      {"id": "applied-science-center", "cat": "edu", "fa": "مرکز علمی‌کاربردی شهرداری ورامین", "en": "Varamin Municipality Applied Science Center", "lat": 35.32672, "lng": 51.65363},
      {"id": "hawzeh-imam-sadegh", "cat": "edu", "fa": "حوزه علمیه امام صادق (ع)", "en": "Imam Sadegh Seminary", "lat": 35.32049, "lng": 51.64678},
      {"id": "hawzeh-kowsar", "cat": "edu", "fa": "حوزه علمیه کوثر (خواهران)", "en": "Kowsar Seminary (Women)", "lat": 35.3172, "lng": 51.6453},
      {"id": "health-higher-ed", "cat": "edu", "fa": "مجتمع آموزش عالی سلامت ورامین", "en": "Varamin Higher Education Complex of Health", "lat": 35.36679, "lng": 51.62513},
      {"id": "agri-research-center", "cat": "edu", "fa": "مرکز تحقیقات و آموزش کشاورزی و منابع طبیعی استان تهران", "en": "Tehran Province Agricultural & Natural Resources Research and Education Center", "lat": 35.35234, "lng": 51.63299, "note": "وابسته به وزارت جهاد کشاورزی", "noteEn": "Operated by the Ministry of Agriculture Jihad"},
      /* ── پارک و ورزش ── */
      {"id": "park-zeytoon", "cat": "park", "fa": "پارک زیتون", "en": "Zeytoon Park", "lat": 35.35731, "lng": 51.624},
      {"id": "park-moshahir", "cat": "park", "fa": "بوستان مشاهیر", "en": "Moshahir Park", "lat": 35.32288, "lng": 51.65453},
      {"id": "park-mosafer", "cat": "park", "fa": "بوستان مسافر", "en": "Mosafer Park", "lat": 35.3924, "lng": 51.6023},
      {"id": "park-azadegan", "cat": "park", "fa": "بوستان آزادگان", "en": "Azadegan Park", "lat": 35.32194, "lng": 51.6723},
      {"id": "park-shaghayegh", "cat": "park", "fa": "پارک شقایق", "en": "Shaghayegh Park", "lat": 35.32416, "lng": 51.67304},
      {"id": "park-15khordad", "cat": "park", "fa": "پارک ۱۵ خرداد", "en": "15 Khordad Park", "lat": 35.34183, "lng": 51.6331},
      {"id": "park-ghobadi", "cat": "park", "fa": "بوستان قبادی", "en": "Ghobadi Park", "lat": 35.33257, "lng": 51.63663},
      {"id": "park-javan", "cat": "park", "fa": "بوستان جوان", "en": "Javan Park", "lat": 35.32087, "lng": 51.63945},
      {"id": "park-aftab", "cat": "park", "fa": "بوستان آفتاب", "en": "Aftab Park", "lat": 35.34189, "lng": 51.64018},
      {"id": "park-fakhari", "cat": "park", "fa": "بوستان شهید فخاری", "en": "Shahid Fakhari Park", "lat": 35.31979, "lng": 51.63574},
      {"id": "park-ghadir-kheyrabad", "cat": "park", "fa": "پارک غدیر خیرآباد", "en": "Ghadir Park (Kheyrabad)", "lat": 35.38379, "lng": 51.60006},
      {"id": "park-khanevadeh", "cat": "park", "fa": "بوستان خانواده", "en": "Khanevadeh (Family) Park", "lat": 35.32424, "lng": 51.65702},
      {"id": "park-ahmadiyeh", "cat": "park", "fa": "بوستان شهدای احمدیه", "en": "Shohada-ye Ahmadiyeh Park", "lat": 35.37071, "lng": 51.61317},
      {"id": "park-bagh-fadak", "cat": "park", "fa": "پارک باغ فدک", "en": "Bagh-e Fadak Park", "lat": 35.37288, "lng": 51.61577, "addr": "شهرک مدرس", "addrEn": "Shahrak-e Modarres"},
      {"id": "park-laleh", "cat": "park", "fa": "پارک لاله", "en": "Laleh Park", "lat": 35.37157, "lng": 51.61937, "addr": "جاده تهران – ورامین", "addrEn": "Tehran–Varamin Rd."},
      {"id": "stadium-shohada", "cat": "park", "fa": "ورزشگاه شهدا (پنج‌هزار نفری)", "en": "Shohada Stadium (5,000 seats)", "lat": 35.31504, "lng": 51.63656},
      {"id": "hall-rajaei", "cat": "park", "fa": "سالن ورزشی شهید رجایی", "en": "Shahid Rajaei Sports Hall", "lat": 35.31784, "lng": 51.64488},
      {"id": "hall-ghobadi", "cat": "park", "fa": "سالن ورزشی قبادی", "en": "Ghobadi Sports Hall", "lat": 35.33893, "lng": 51.6436},
      {"id": "hall-tajik", "cat": "park", "fa": "سالن ورزشی تاجیک", "en": "Tajik Sports Hall", "lat": 35.38147, "lng": 51.61498},
      {"id": "hall-ahmadiyeh", "cat": "park", "fa": "سالن ورزشی شهدای احمدیه", "en": "Shohada-ye Ahmadiyeh Sports Hall", "lat": 35.37117, "lng": 51.61268},
      /* ── حمل‌ونقل ── */
      {"id": "bus-terminal", "cat": "transport", "fa": "ترمینال مسافربری ورامین", "en": "Varamin Bus Terminal", "lat": 35.36365, "lng": 51.62716},
      {"id": "railway-station", "cat": "transport", "fa": "ایستگاه راه‌آهن ورامین", "en": "Varamin Railway Station", "lat": 35.33521, "lng": 51.64453},
      {"id": "taxi-modarres", "cat": "transport", "fa": "ایستگاه تاکسی شهرک مدرس", "en": "Shahrak-e Modarres Taxi Stand", "lat": 35.37815, "lng": 51.61407},
      /* ── محله‌ها و میدان‌ها ── */
      {"id": "kheyrabad", "cat": "area", "fa": "خیرآباد", "en": "Kheyrabad", "lat": 35.38469, "lng": 51.61138},
      {"id": "shahrak-modarres", "cat": "area", "fa": "شهرک مدرس", "en": "Shahrak-e Modarres", "lat": 35.37449, "lng": 51.61095},
      {"id": "kohnehgol", "cat": "area", "fa": "کهنه‌گل", "en": "Kohneh Gol", "lat": 35.31673, "lng": 51.64623},
      {"id": "bagh-saleh", "cat": "area", "fa": "باغ صالح", "en": "Bagh-e Saleh", "lat": 35.32948, "lng": 51.65731},
      {"id": "hesarak", "cat": "area", "fa": "حصارک", "en": "Hesarak", "lat": 35.31028, "lng": 51.65877},
      {"id": "dehvin", "cat": "area", "fa": "دهوین", "en": "Dehvin", "lat": 35.32694, "lng": 51.65962},
      {"id": "deh-sharifa", "cat": "area", "fa": "ده شریفا", "en": "Deh Sharifa", "lat": 35.32234, "lng": 51.66433},
      {"id": "shahrak-chahad", "cat": "area", "fa": "شهرک چهاد", "en": "Shahrak-e Chahad", "lat": 35.32312, "lng": 51.66112},
      {"id": "kazemabad", "cat": "area", "fa": "کاظم‌آباد", "en": "Kazemabad", "lat": 35.36102, "lng": 51.64595},
      {"id": "shahrak-zeytoon", "cat": "area", "fa": "شهرک مسکونی زیتون", "en": "Zeytoon Residential Town", "lat": 35.33457, "lng": 51.62889},
      {"id": "shahrak-valiasr", "cat": "area", "fa": "شهرک ولیعصر (عج)", "en": "Shahrak-e Valiasr", "lat": 35.3619, "lng": 51.62293},
      {"id": "shahrak-fajr", "cat": "area", "fa": "شهرک فجر", "en": "Shahrak-e Fajr", "lat": 35.36059, "lng": 51.63463},
      {"id": "shahrak-fatemiyeh", "cat": "area", "fa": "شهرک فاطمیه", "en": "Shahrak-e Fatemiyeh", "lat": 35.37301, "lng": 51.62309},
      {"id": "sq-imam-khomeini", "cat": "area", "fa": "میدان امام خمینی", "en": "Imam Khomeini Square", "lat": 35.32549, "lng": 51.64568},
      {"id": "sq-imam-hossein", "cat": "area", "fa": "میدان امام حسین (ع)", "en": "Imam Hossein Square", "lat": 35.33179, "lng": 51.64057},
      {"id": "sq-razi", "cat": "area", "fa": "میدان رازی", "en": "Razi Square", "lat": 35.32294, "lng": 51.65578},
      {"id": "sq-valiasr", "cat": "area", "fa": "میدان ولیعصر", "en": "Valiasr Square", "lat": 35.36648, "lng": 51.62343},
      {"id": "sq-basij", "cat": "area", "fa": "میدان بسیج", "en": "Basij Square", "lat": 35.32565, "lng": 51.67278},
      {"id": "sq-khalabanan", "cat": "area", "fa": "میدان خلبانان", "en": "Khalabanan Square", "lat": 35.31629, "lng": 51.66464},
      {"id": "sq-madar", "cat": "area", "fa": "میدان مادر", "en": "Madar Square", "lat": 35.32024, "lng": 51.63764},
      {"id": "sq-farhang", "cat": "area", "fa": "میدان فرهنگ", "en": "Farhang Square", "lat": 35.32427, "lng": 51.63878},
      {"id": "sq-daneshjoo", "cat": "area", "fa": "میدان دانشجو", "en": "Daneshjoo Square", "lat": 35.33421, "lng": 51.63228},
      {"id": "sq-amirkabir", "cat": "area", "fa": "میدان امیرکبیر", "en": "Amirkabir Square", "lat": 35.32549, "lng": 51.63967},
      {"id": "sq-police", "cat": "area", "fa": "میدان پلیس", "en": "Police Square", "lat": 35.31921, "lng": 51.653},
      {"id": "sq-defenders", "cat": "area", "fa": "میدان مدافعان حرم", "en": "Modafean-e Haram Square", "lat": 35.31495, "lng": 51.64127},
      {"id": "sq-ghavvas", "cat": "area", "fa": "میدان شهدای غواص", "en": "Shohada-ye Ghavvas Square", "lat": 35.31715, "lng": 51.64908},
      {"id": "sq-nobovat", "cat": "area", "fa": "میدان نبوت", "en": "Nobovvat Square", "lat": 35.35329, "lng": 51.62828},
      {"id": "sq-sajjad", "cat": "area", "fa": "میدان سجاد", "en": "Sajjad Square", "lat": 35.35097, "lng": 51.64105},
      {"id": "sq-ghadir", "cat": "area", "fa": "میدان الغدیر", "en": "Al-Ghadir Square", "lat": 35.36168, "lng": 51.62162},
      {"id": "sq-varzesh", "cat": "area", "fa": "میدان ورزش", "en": "Varzesh Square", "lat": 35.3603, "lng": 51.63385},
      {"id": "sq-ali-ebn-abitaleb", "cat": "area", "fa": "میدان علی‌بن‌ابی‌طالب", "en": "Ali ibn Abi Talib Square", "lat": 35.36217, "lng": 51.6381},
    ]
  };

  root.EPLAK_PLACES_DATA = DATA;
  if (typeof module === 'object' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : this);

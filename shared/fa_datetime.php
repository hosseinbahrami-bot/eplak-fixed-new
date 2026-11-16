<?php
/* ============================================================================
   shared/fa_datetime.php — تاریخ و ساعت فارسی (شمسی) برای متن اعلان‌ها

   چرا این فایل لازم شد؟
   متن اعلان‌های رویدادی باید «تاریخ و ساعت» ثبت را به کاربر بگوید
   (مثلاً «درخواست شما با کد پیگیری EP-1403-0012 در تاریخ ۱۴۰۵/۰۷/۰۸ ساعت ۱۶:۰۵ ثبت شد»).
   سرور هاست با ساعت گرینویچ کار می‌کند؛ این توابع ساعت را به وقت تهران
   و تقویم را به شمسی تبدیل می‌کنند و رقم‌ها را فارسی می‌نویسند.
   ============================================================================ */

/** تبدیل تاریخ میلادی به شمسی: [سال, ماه, روز] */
function eplakGregorianToJalali(int $gy, int $gm, int $gd): array
{
    $gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    $gy2  = ($gm > 2) ? ($gy + 1) : $gy;
    $days = 355666 + (365 * $gy)
          + (int) (($gy2 + 3) / 4)
          - (int) (($gy2 + 99) / 100)
          + (int) (($gy2 + 399) / 400)
          + $gd + $gDaysInMonth[$gm - 1];

    $jy = -1595 + (33 * (int) ($days / 12053));
    $days %= 12053;
    $jy += 4 * (int) ($days / 1461);
    $days %= 1461;
    if ($days > 365) {
        $jy += (int) (($days - 1) / 365);
        $days = ($days - 1) % 365;
    }
    if ($days < 186) {
        $jm = 1 + (int) ($days / 31);
        $jd = 1 + ($days % 31);
    } else {
        $jm = 7 + (int) (($days - 186) / 30);
        $jd = 1 + (($days - 186) % 30);
    }
    return [$jy, $jm, $jd];
}

/** رقم‌های لاتین را به رقم فارسی تبدیل می‌کند */
function eplakFaDigits(string $text): string
{
    $latin = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    $fa    = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return str_replace($latin, $fa, $text);
}

/**
 * تاریخ و ساعت همین لحظه به وقت تهران و تقویم شمسی.
 * مثال خروجی: ۱۴۰۵/۰۷/۰۸ ساعت ۱۶:۰۵
 */
function eplakFaDateTime(?string $timezone = 'Asia/Tehran', ?int $timestamp = null): string
{
    try {
        $zone = new DateTimeZone($timezone ?: 'Asia/Tehran');
    } catch (Throwable $e) {
        $zone = new DateTimeZone('UTC');
    }
    try {
        $now = new DateTime('now', $zone);
    } catch (Throwable $e) {
        $now = new DateTime('now');
    }
    if ($timestamp !== null && $timestamp > 0) {
        try {
            $now = (new DateTime('@' . $timestamp))->setTimezone($zone);
        } catch (Throwable $e) {
            /* همان «اکنون» می‌ماند */
        }
    }

    [$jy, $jm, $jd] = eplakGregorianToJalali(
        (int) $now->format('Y'),
        (int) $now->format('n'),
        (int) $now->format('j')
    );

    $stamp = sprintf('%04d/%02d/%02d ساعت %02d:%02d', $jy, $jm, $jd, (int) $now->format('G'), (int) $now->format('i'));
    return function_exists('eplakFaDigits') ? eplakFaDigits($stamp) : $stamp;
}

/* ────────────────────────────────────────────────────────────────────────────
   نمایش تاریخِ «ذخیره‌شده در دیتابیس» به شمسی
   ----------------------------------------------------------------------------
   چرا؟ تاریخ گزارش‌ها، تیکت‌ها، کاربران، اعلان‌ها، اخبار و لاگ‌ها در پنل
   مدیریت مستقیم از دیتابیس چاپ می‌شد (۲۰۲۶-۱۰-۱۱ ۱۳:۲۴:۰۵)؛ اسکریپت
   persian-digits.js فقط رقم‌ها را فارسی می‌کرد و تقویم همان میلادی می‌ماند.
   حالا همه‌جا با این توابع به شمسی (و وقت تهران) نمایش داده می‌شود.

   قرارداد منطقه‌ی زمانی (از این نسخه: «یک ساعتِ واحد = تهران»):
   ستون‌های created_at از نوع TIMESTAMP هستند و MySQL آن‌ها را با time_zoneِ
   نشست جابه‌جا می‌کند؛ به همین دلیل پیش از این، بسته به ساعتِ هاست، همان رویداد
   در پنل و اپ ۳ ساعت جلو یا عقب دیده می‌شد. حالا:
     • shared/bootstrap.php ساعت PHP را روی display_timezone (تهران) می‌گذارد،
     • نشست MySQL با «SET time_zone = '+03:30'» پین می‌شود ⇒ NOW()/CURRENT_TIMESTAMP
       تهران می‌نویسند و خوانده‌های TIMESTAMP هم تهران‌اند،
     • پس مقدارهای دیتابیس «وقت تهران» هستند و هنگام نمایش جابه‌جا نمی‌شوند
       (db_timezone = Asia/Tehran).
   اگر دیتابیسِ قدیمی‌تان با ساعت UTC پر شده و نمی‌خواهید نشست عوض شود، یک‌بار
   در shared/config.php یا متغیر محیطی بگذارید:
       EPLAK_DB_TIMEZONE=UTC
   تا مثل قبل ۳:۳۰ ساعت به وقت تهران برده شوند.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * خواندن یک تنظیمِ منطقه‌ی زمانی: اول متغیر محیطی، بعد shared/config.php
 * (همان اولویتی که بقیه‌ی تنظیم‌های پروژه دارند)، و در آخر مقدار پیش‌فرض.
 */
function eplakTimezoneSetting(string $envKey, string $configKey, string $fallback): DateTimeZone
{
    static $cache = [];
    if (isset($cache[$envKey]) && $cache[$envKey] instanceof DateTimeZone) {
        return $cache[$envKey];
    }
    $name = $fallback;
    try {
        $env = getenv($envKey);
        if (is_string($env) && trim($env) !== '') {
            $name = trim($env);
        } elseif (function_exists('eplakConfigValue')) {
            /* این فایل گاهی تنها require می‌شود (آزمون/اسکریپت) ⇒ وجود تابع چک می‌شود */
            $cfg = eplakConfigValue($configKey, null);
            if (is_string($cfg) && trim($cfg) !== '') {
                $name = trim($cfg);
            }
        }
        $cache[$envKey] = new DateTimeZone($name);
    } catch (Throwable $e) {
        $cache[$envKey] = new DateTimeZone($fallback);
    }
    return $cache[$envKey];
}

/** منطقه‌ی زمانیِ مقدارهای ذخیره‌شده در دیتابیس (پیش‌فرض: تهران — همان که
 *   نشست MySQL روی آن پین می‌شود، پس مقدارها بدون جابه‌جایی نمایش داده می‌شوند) */
function eplakDbTimezone(): DateTimeZone
{
    return eplakTimezoneSetting('EPLAK_DB_TIMEZONE', 'db_timezone', 'Asia/Tehran');
}

/**
 * اختلافِ یک منطقه‌ی زمانی با UTC به شکلِ «+03:30» — برای «SET time_zone» در
 * MySQL. شکلِ عددی استفاده می‌شود چون جدولِ نام‌های زمانیِ MySQL روی هاست‌های
 * اشتراکی معمولاً بارگذاری نشده و «Asia/Tehran» خطا می‌دهد.
 */
function eplakTimezoneOffsetString(DateTimeZone $zone): string
{
    try {
        $seconds = $zone->getOffset(new DateTimeImmutable('@' . time()));
    } catch (Throwable $e) {
        $seconds = 0;
    }
    $sign    = ($seconds < 0) ? '-' : '+';
    $seconds = abs((int) $seconds);
    return sprintf('%s%02d:%02d', $sign, intdiv($seconds, 3600), intdiv($seconds % 3600, 60));
}

/**
 * «اکنون» به شکلِ مقدارِ دیتابیس (منطقه‌ی زمانیِ db_timezone) — برای جاهایی که
 * همان لحظه در پاسخِ API به اپ برمی‌گردد و باید با آنچه دیتابیس می‌نویسد یکی
 * باشد (وگرنه رکوردِ تازه‌ساخته ۳ ساعت جابه‌جا دیده می‌شد).
 */
function eplakDbNow(): string
{
    try {
        return (new DateTimeImmutable('now', eplakDbTimezone()))->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
        return date('Y-m-d H:i:s');
    }
}

/**
 * «اکنون» با ساعتِ خودِ دیتابیس.
 * هر جا مقدارِ نوشته‌شده در دیتابیس با زمانِ حال مقایسه یا نوشته می‌شود
 * (پنجره‌ی تکراری‌یابی، سقفِ درخواست، پاک‌سازی، آمارِ «۷ روز اخیر») باید از
 * همین استفاده کرد: ساعتِ PHP روی تهران پین شده اما ساعتِ دیتابیس می‌تواند
 * چیزِ دیگری باشد (SQLite ستون CURRENT_TIMESTAMP را همیشه UTC می‌نویسد و
 * time_zone ندارد) و آمیختنِ این دو، رکوردها را ۳:۳۰ پیرتر/جوان‌تر نشان می‌دهد.
 */
function eplakDbNowString(?PDO $pdo = null): string
{
    if ($pdo !== null) {
        try {
            $sqlite = function_exists('eplakIsSqlite') ? eplakIsSqlite($pdo) : false;
            $value  = $pdo->query($sqlite ? "SELECT datetime('now')" : 'SELECT NOW()')->fetchColumn();
            if (is_string($value) && trim($value) !== '') {
                return substr(trim($value), 0, 19);
            }
        } catch (Throwable $e) {
            /* پرس‌وجو نشد ⇒ ساعتِ PHP (همان منطقه‌ی زمانیِ db_timezone) */
        }
    }
    return eplakDbNow();
}

/** «چند ثانیه پیش» با ساعتِ دیتابیس — برای مقایسه با ستون‌های created_at. */
function eplakDbAgoString(int $seconds, ?PDO $pdo = null): string
{
    $seconds = max(0, $seconds);
    $ts      = strtotime(eplakDbNowString($pdo));
    if ($ts === false) {
        return date('Y-m-d H:i:s', time() - $seconds);
    }
    return date('Y-m-d H:i:s', $ts - $seconds);
}

/**
 * فاصله‌ی یک مقدارِ دیتابیس تا «اکنون» به ثانیه (−۱ ⇒ مقدار نامعتبر).
 * مقدارهای بدون منطقه‌ی زمانی با ساعتِ خودِ دیتابیس سنجیده می‌شوند و مقدارهایی
 * که منطقه‌ی زمانیِ صریح دارند (Z یا ‎+03:30) یا عددی‌اند، مطلق‌اند.
 */
function eplakDbAgeSeconds($value, ?PDO $pdo = null): int
{
    $raw = is_scalar($value) ? trim((string) $value) : '';
    if ($raw === '') {
        return -1;
    }
    if (preg_match('/(Z|[+-]\d{2}:?\d{2})$/i', $raw)) {
        $ts = strtotime($raw);
        return $ts === false ? -1 : time() - $ts;
    }
    if (ctype_digit($raw)) {
        $ts = (int) $raw;
        return time() - ($ts > 100000000000 ? intdiv($ts, 1000) : $ts);
    }
    $ts = strtotime(substr($raw, 0, 19));
    if ($ts === false) {
        return -1;
    }
    $nowTs = strtotime(eplakDbNowString($pdo));
    return $nowTs === false ? time() - $ts : $nowTs - $ts;
}

/** منطقه‌ی زمانیِ نمایش (وقت تهران — همان که کاربر انتظار دارد) */
function eplakDisplayTimezone(): DateTimeZone
{
    return eplakTimezoneSetting('EPLAK_DISPLAY_TIMEZONE', 'display_timezone', 'Asia/Tehran');
}

/**
 * خواندن یک مقدار تاریخ از دیتابیس و برگرداندنش در منطقه‌ی زمانیِ نمایش.
   پذیرش: «2026-10-11 13:24:05» · «2026-10-11T13:24:05Z» · «2026-10-11» ·
   timestamp عددی · null/خالی (⇒ null)
 */
function eplakParseDbDateTime($value): ?DateTimeImmutable
{
    if ($value === null) {
        return null;
    }
    if (is_int($value) || is_float($value)) {
        $value = (string) $value;
    }
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    if ($value === '' || strpos($value, '0000-00-00') === 0 || strpos($value, '0001-01-01') === 0) {
        return null;
    }
    try {
        /* timestamp عددی (مثلاً از لاگ‌ها) */
        if (ctype_digit($value)) {
            $ts = (int) $value;
            /* ثانیه یا میلی‌ثانیه؟ */
            if ($ts > 100000000000) {
                $ts = intdiv($ts, 1000);
            }
            return (new DateTimeImmutable('@' . $ts))->setTimezone(eplakDisplayTimezone());
        }
        /* اگر منطقه‌ی زمانی در خود مقدار هست (Z یا ‎+03:30) همان ملاک است */
        if (preg_match('/(Z|[+-]\d{2}:?\d{2})$/i', $value)) {
            return (new DateTimeImmutable($value))->setTimezone(eplakDisplayTimezone());
        }
        /* در غیر این‌صورت: مقدار با ساعتِ دیتابیس (پیش‌فرض UTC) تفسیر می‌شود */
        return (new DateTimeImmutable(str_replace(' ', 'T', $value), eplakDbTimezone()))
            ->setTimezone(eplakDisplayTimezone());
    } catch (Throwable $e) {
        try {
            $ts = strtotime($value);
            if ($ts === false) {
                return null;
            }
            return (new DateTimeImmutable('@' . $ts))->setTimezone(eplakDisplayTimezone());
        } catch (Throwable $e2) {
            return null;
        }
    }
}

/** مهرِ شمسیِ یک DateTime: «۱۴۰۴/۰۷/۱۹» یا «۱۴۰۴/۰۷/۱۹ ساعت ۱۶:۵۴» */
function eplakJalaliStamp(DateTimeImmutable $dt, bool $withTime = true): string
{
    [$jy, $jm, $jd] = eplakGregorianToJalali(
        (int) $dt->format('Y'),
        (int) $dt->format('n'),
        (int) $dt->format('j')
    );
    $stamp = sprintf('%04d/%02d/%02d', $jy, $jm, $jd);
    if ($withTime) {
        /* همان شکلی که اپ سال‌هاست نشان می‌دهد («۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴») تا
           تاریخ یک رویداد در اپ و پنل ادمین مو‌به‌مو یکی باشد. */
        $stamp .= sprintf(' - ساعت %02d:%02d', (int) $dt->format('G'), (int) $dt->format('i'));
    }
    return eplakFaDigits($stamp);
}

/**
 * فقط تاریخِ شمسیِ یک مقدار دیتابیس — برای ستون‌ها و «عضو از».
 * اگر مقدار خوانده نشود، همان $fallback برمی‌گردد (صفحه خالی/خطا نمی‌شود).
 */
function eplakFaDate($value, string $fallback = '—'): string
{
    $dt = eplakParseDbDateTime($value);
    return $dt === null ? $fallback : eplakJalaliStamp($dt, false);
}

/** تاریخ و ساعتِ شمسیِ یک مقدار دیتابیس — برای جزئیات و لاگ‌ها */
function eplakFaDateTimeOf($value, string $fallback = '—'): string
{
    $dt = eplakParseDbDateTime($value);
    return $dt === null ? $fallback : eplakJalaliStamp($dt, true);
}

/**
 * «همین لحظه» به شمسی و وقت تهران — برای جاهایی که مقدارِ دیتابیس خالی است
 * (مثلاً «آخرین بروزرسانی» گزارشی که هنوز ویرایش نشده).
 */
function eplakFaNow(bool $withTime = true): string
{
    try {
        $dt = new DateTimeImmutable('now', eplakDisplayTimezone());
    } catch (Throwable $e) {
        $dt = new DateTimeImmutable('now');
    }
    return eplakJalaliStamp($dt, $withTime);
}

/* ════════════════════════════════════════════════════════════════════════════
   ماه‌های شمسی، تبدیلِ معکوس (شمسی ← میلادی) و پنجره‌ی ماهانه
   ────────────────────────────────────────────────────────────────────────────
   چرا این بخش لازم شد؟
   نمودارِ «روند ماهانهٔ گزارش‌ها» در داشبورد، برچسبِ ماه‌ها را از آرایه‌ی
   «ژانویه … دسامبر» می‌گرفت و سطل‌ها را هم با DATE_FORMAT('%Y-%m') میلادی
   می‌ساخت؛ نتیجه روی صفحه‌ی مدیر این بود: «۰ژوئن ۰ژوئیه ۰اوت ۰سپتامبر
   ۰اکتبر ۴نوامبر». تنها عوض‌کردنِ نام‌ها کافی نبود: هر ماهِ شمسی با دو ماهِ
   میلادی هم‌پوشانی دارد، پس «گروه‌بندی» هم باید شمسی شود وگرنه شمارِ هر ستون
   غلط می‌ماند.

   نکته‌ی طراحیِ تبدیلِ معکوس:
   الگوریتمِ بسته‌formِ شمسی←میلادی روی بازه‌های زمانیِ دور، روزها را جابه‌جا
   می‌کند (در آزمونِ ۲۹٬۰۰۰ روزه، ۱۴٬۹۵۷ خطا داشت). پس اینجا «حدس + تصحیح»
   استفاده می‌شود: یک حدسِ تقریبی از روزِ میلادی زده می‌شود و سپس با همین
   eplakGregorianToJalali() (که مرجعِ کلِ سامانه است) سنجیده و پله‌پله دقیق
   می‌شود. یعنی نتیجه «به‌طورِ سازنده‌ای» با تابعِ رفت هم‌خوان است و هیچ
   قانونِ کبیسه‌ی دومی در کد وجود ندارد که بتواند از آن جدا بیفتد.
   ════════════════════════════════════════════════════════════════════════════ */

/** نامِ ماه‌های شمسی — یک منبع برای همه‌ی نمودارها، خروجی‌ها و برچسب‌ها */
function eplakFaMonthNames(): array
{
    return ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
            'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
}

/**
 * شماره‌ی روزِ «تقریبی و یکنوا» در تقویمِ شمسی — فقط برایِ پیمایش/حدس.
 * صحتِ نهایی هرگز به این تابع تکیه نمی‌کند (با eplakGregorianToJalali سنجیده
 * می‌شود)، پس تقریبی بودنش بی‌ضرر است.
 */
function eplakJalaliApproxDays(int $jy, int $jm, int $jd): int
{
    $jm = max(1, min(12, $jm));
    $cum = 0;
    $mDays = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30];
    for ($i = 1; $i < $jm; $i++) {
        $cum += $mDays[$i];
    }
    /* چرخه‌ی ۳۳ ساله با ۸ سالِ کبیسه — همان تقریبی که jalaali استفاده می‌کند */
    $leaps = intdiv($jy, 33) * 8 + intdiv(($jy % 33) + 3, 4);
    return ($jy * 365) + $leaps + $cum + $jd;
}

/**
 * تبدیلِ شمسی ← میلادی (معکوسِ eplakGregorianToJalali).
 * روش: حدسِ تقریبی از یک لنگرِ مطمئن، سپس تصحیحِ پله‌ای با خودِ تابعِ رفت.
 * حتی اگر لنگر اشتباه باشد، حلقه‌ی تصحیح نتیجه را دقیق می‌کند.
 *
 * @return array{0:int,1:int,2:int} [سال, ماه, روز] میلادی
 */
function eplakJalaliToGregorian(int $jy, int $jm, int $jd): array
{
    $jm = max(1, min(12, $jm));
    $jd = max(1, min(31, $jd));
    $target = eplakJalaliApproxDays($jy, $jm, $jd);

    /* لنگر: ۱ فروردین ۱۴۰۰ = ۲۱ مارس ۲۰۲۱ (ساعتِ ظهر تا مرزِ روز جابه‌جا نشود) */
    $anchorTs = mktime(12, 0, 0, 3, 21, 2021);
    if ($anchorTs === false) {
        $anchorTs = 1616328000;                     /* 2021-03-21 12:00 UTC */
    }
    $ts = $anchorTs + (($target - eplakJalaliApproxDays(1400, 1, 1)) * 86400);

    $gy = (int) date('Y', $ts);
    $gm = (int) date('n', $ts);
    $gd = (int) date('j', $ts);
    for ($i = 0; $i < 8; $i++) {
        $gy = (int) date('Y', $ts);
        $gm = (int) date('n', $ts);
        $gd = (int) date('j', $ts);
        [$ky, $km, $kd] = eplakGregorianToJalali($gy, $gm, $gd);
        if ($ky === $jy && $km === $jm && $kd === $jd) {
            return [$gy, $gm, $gd];
        }
        $delta = $target - eplakJalaliApproxDays($ky, $km, $kd);
        if ($delta === 0) {
            $delta = ($ky < $jy || ($ky === $jy && $km < $jm)) ? 1 : -1;
        }
        $ts += $delta * 86400;
    }
    return [$gy, $gm, $gd];
}

/**
 * تعدادِ روزهای یک ماهِ شمسی (اسفند ۲۹ یا ۳۰).
 * از اختلافِ روزِ میلادیِ «اولِ این ماه» و «اولِ ماهِ بعد» حساب می‌شود تا
 * هیچ قاعده‌ی کبیسه‌ی جداگانه‌ای لازم نباشد.
 */
function eplakJalaliMonthDays(int $jy, int $jm): int
{
    $jm = max(1, min(12, $jm));
    $ny = ($jm === 12) ? $jy + 1 : $jy;
    $nm = ($jm === 12) ? 1 : $jm + 1;
    try {
        [$gy, $gm, $gd]     = eplakJalaliToGregorian($jy, $jm, 1);
        [$gy2, $gm2, $gd2] = eplakJalaliToGregorian($ny, $nm, 1);
        $a = mktime(12, 0, 0, $gm, $gd, $gy);
        $b = mktime(12, 0, 0, $gm2, $gd2, $gy2);
        if ($a === false || $b === false || $b <= $a) {
            return ($jm <= 6) ? 31 : (($jm <= 11) ? 30 : 29);
        }
        $days = (int) round(($b - $a) / 86400);
        return ($days >= 29 && $days <= 31) ? $days : (($jm <= 6) ? 31 : (($jm <= 11) ? 30 : 29));
    } catch (Throwable $e) {
        return ($jm <= 6) ? 31 : (($jm <= 11) ? 30 : 29);
    }
}

/** برچسبِ فارسیِ یک ماهِ شمسی: «آبان ۱۴۰۵» یا فقط «آبان» */
function eplakJalaliMonthLabel(int $jy, int $jm, bool $withYear = true): string
{
    $names = eplakFaMonthNames();
    $jm = max(1, min(12, $jm));
    $label = $names[$jm - 1];
    return $withYear ? $label . ' ' . eplakFaDigits((string) $jy) : $label;
}

/**
 * پنجره‌ی «N ماهِ شمسیِ آخر» از قدیم به جدید — پایه‌ی نمودارهای ماهانه.
 * هر عضو:
 *   ['key'=>'1405-08', 'label'=>'آبان', 'full'=>'آبان ۱۴۰۵', 'jy'=>1405, 'jm'=>8,
 *    'gfrom'=>'2026-10-23', 'gto'=>'2026-11-21']
 * gfrom/gto همان ماهِ شمسی به میلادی‌اند تا بتوان در WHERE کوئری گذاشت
 * (ستون‌های created_at در دیتابیس میلادی‌اند).
 *
 * @param string|null $todayDb «اکنون» با ساعتِ خودِ دیتابیس (eplakDbNowString)؛
 *        اگر null باشد از ساعتِ تهرانِ PHP خوانده می‌شود.
 */
function eplakJalaliMonthWindow(int $months, ?string $todayDb = null): array
{
    $months = max(1, min(240, $months));
    $today  = trim((string) $todayDb);
    $dt     = $today !== '' ? eplakParseDbDateTime($today) : null;
    if ($dt === null) {
        try {
            $dt = new DateTimeImmutable('now', eplakDisplayTimezone());
        } catch (Throwable $e) {
            $dt = new DateTimeImmutable('now');
        }
    }
    [$jy, $jm] = eplakGregorianToJalali((int) $dt->format('Y'), (int) $dt->format('n'), (int) $dt->format('j'));

    $names = eplakFaMonthNames();
    $out   = [];
    for ($i = $months - 1; $i >= 0; $i--) {
        /* پیمایشِ ماه‌ها در فضای شمسی (بدونِ DateTime، تا سالِ کبیسه‌ی شمسی
           و مرزِ اسفند/فروردین درست بماند) */
        $total = ($jy * 12) + ($jm - 1) - $i;
        $y = intdiv($total, 12);
        $m = ($total % 12) + 1;
        if ($m < 1 || $m > 12 || $y < 1) {
            continue;
        }
        $gfrom = $gto = '';
        try {
            [$gy, $gm, $gd] = eplakJalaliToGregorian($y, $m, 1);
            $gfrom = sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
            $last  = eplakJalaliMonthDays($y, $m);
            [$ey, $em, $ed] = eplakJalaliToGregorian($y, $m, $last);
            $gto   = sprintf('%04d-%02d-%02d', $ey, $em, $ed);
        } catch (Throwable $e) {
            /* بازه‌ی میلادی نشد ⇒ فقط برچسبِ شمسی می‌ماند */
        }
        $out[] = [
            'key'   => sprintf('%04d-%02d', $y, $m),
            'label' => $names[$m - 1],
            'full'  => eplakJalaliMonthLabel($y, $m),
            'jy'    => $y,
            'jm'    => $m,
            'gfrom' => $gfrom,
            'gto'   => $gto,
        ];
    }
    return $out;
}

/** کلیدِ «سال-ماه» شمسیِ یک مقدار دیتابیس: '1405-08' (اگر خوانده نشود: '') */
function eplakJalaliMonthKey($value): string
{
    $dt = eplakParseDbDateTime($value);
    if ($dt === null) {
        return '';
    }
    [$jy, $jm] = eplakGregorianToJalali((int) $dt->format('Y'), (int) $dt->format('n'), (int) $dt->format('j'));
    return sprintf('%04d-%02d', $jy, $jm);
}

/** تاریخِ شمسی با رقمِ لاتین (1405-08-22) — برای نامِ فایل‌ها و ASCII */
function eplakJalaliIsoDate($dbDateTime = null): string
{
    $dt = ($dbDateTime === null || trim((string) $dbDateTime) === '') ? null : eplakParseDbDateTime($dbDateTime);
    if ($dt === null) {
        try {
            $dt = new DateTimeImmutable('now', eplakDisplayTimezone());
        } catch (Throwable $e) {
            $dt = new DateTimeImmutable('now');
        }
    }
    [$jy, $jm, $jd] = eplakGregorianToJalali((int) $dt->format('Y'), (int) $dt->format('n'), (int) $dt->format('j'));
    return sprintf('%04d-%02d-%02d', $jy, $jm, $jd);
}

/** رقم‌های فارسی/عربی ← لاتین (برای خواندنِ تاریخی که مدیر تایپ کرده) */
function eplakLatinDigits(string $text): string
{
    $fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return str_replace(array_merge($fa, $ar), ['0','1','2','3','4','5','6','7','8','9'], $text);
}

/**
 * تاریخِ واردشده توسط مدیر ← «Y-m-d» میلادی برای کوئری.
 * هم شمسی را می‌پذیرد (1405/08/22 یا ۱۴۰۵/۰۸/۲۲ یا 1405-8-22 یا 1405/08) و هم
 * میلادی (2026-11-13) تا نشانک‌ها و لینک‌های قدیمی نشکنند. معیارِ تفکیک،
 * بزرگیِ سال است (سال < ۱۷۰۰ ⇒ شمسی). ورودیِ نامعتبر ⇒ '' یعنی «فیلتر نکن».
 */
function eplakParseUserDate(?string $raw): string
{
    $raw = eplakLatinDigits(trim((string) $raw));
    $raw = str_replace(['٬', ',', '٫', ' ', "\u{200C}", "\u{200F}"], '', $raw);
    if ($raw === '') {
        return '';
    }
    if (preg_match('/^(\d{4})[\-\/.](\d{1,2})(?:[\-\/.](\d{1,2}))?$/', $raw, $m)) {
        $y  = (int) $m[1];
        $mo = (int) $m[2];
        $d  = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : 1;
    } else {
        return '';
    }
    if ($y < 1000 || $y > 3000 || $mo < 1 || $mo > 12 || $d < 1 || $d > 31) {
        return '';
    }
    if ($y < 1700) {                                   /* شمسی */
        $d = min($d, eplakJalaliMonthDays($y, $mo));
        [$gy, $gm, $gd] = eplakJalaliToGregorian($y, $mo, $d);
        return sprintf('%04d-%02d-%02d', $gy, $gm, $gd);
    }
    /* میلادی: روز را به طولِ واقعیِ همان ماه محدود کن (۲۰۲۶/۰۲/۳۱ ⇒ ۲۸ فوریه) */
    $dim = (int) date('t', mktime(12, 0, 0, $mo, 1, $y));
    if ($dim < 1) {
        $dim = 31;
    }
    return sprintf('%04d-%02d-%02d', $y, $mo, min($d, $dim));
}

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

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

   قرارداد منطقه‌ی زمانی: مقدارهای دیتابیس با NOW()/CURRENT_TIMESTAMP نوشته
   می‌شوند و ساعت هاست معمولاً UTC است؛ همان قراردادی که متن اعلان‌ها
   (eplakFaDateTime) دارد. اگر هاست شما ساعت دیتابیس را روی تهران گذاشته است،
   یک‌بار در shared/config.php یا متغیر محیطی تنظیم کنید:
       EPLAK_DB_TIMEZONE=Asia/Tehran
   تا زمان‌ها ۳:۳۰ ساعت جابه‌جا نشوند.
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

/** منطقه‌ی زمانیِ مقدارهای ذخیره‌شده در دیتابیس (پیش‌فرض: UTC = ساعت هاست) */
function eplakDbTimezone(): DateTimeZone
{
    return eplakTimezoneSetting('EPLAK_DB_TIMEZONE', 'db_timezone', 'UTC');
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

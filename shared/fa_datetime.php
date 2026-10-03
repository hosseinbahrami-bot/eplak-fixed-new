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

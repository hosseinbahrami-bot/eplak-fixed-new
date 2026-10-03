<?php
/* ============================================================================
   shared/notify_events.php — «اعلان رویدادی»

   وقتی خودِ کاربر کاری در اپ انجام می‌دهد (مثلاً درخواست/گزارشی ثبت می‌کند)،
   بلافاصله یک اعلان شخصی برای همان کاربر ساخته می‌شود تا:
     ۱) در فهرست اعلان‌های خودش (اپ و سایت) دیده شود،
     ۲) و اگر اپ بسته باشد، از مسیر فایربیس (اگر تنظیم شده باشد) به گوشی برسد.

   این اعلان «اختصاصی» است (user_phone = شماره‌ی همان کاربر)، پس وضعیت
   خوانده‌شده/حذف‌شده‌اش به بقیه‌ی کاربران ربطی ندارد.
   ============================================================================ */

require_once __DIR__ . '/fa_datetime.php';
if (file_exists(__DIR__ . '/fcm.php')) {
    require_once __DIR__ . '/fcm.php';
}

/**
 * شماره‌ی کاربر به همان قالبی که اپ و جدول گوشی‌ها استفاده می‌کنند (09xxxxxxxxx).
 *
 * چرا؟ اپ گزارش‌ها و اعلان‌ها را با شماره‌ی «09…» می‌خواند و گوشی هم با همین قالب
 * ثبت می‌شود (api/_common.php → eplakNormalizePhone). اگر شماره‌ی گزارش با رقم
 * فارسی یا «+98…» ذخیره شده باشد (مثلاً گزارشی که مدیر دستی ساخته)، اعلان زیر
 * شماره‌ای دیگر ذخیره می‌شد و نه در فهرست اپ دیده می‌شد و نه گوشی پیدا می‌شد.
 * شماره‌ای که شبیه موبایل ایران نباشد، فقط تمیز می‌شود (رفتار قبلی).
 */
function eplakNotifyNormalizePhone(string $phone): string
{
    $fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    $en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    $p  = str_replace($ar, $en, str_replace($fa, $en, trim($phone)));
    $p  = preg_replace('/[^0-9+]/', '', $p) ?? '';
    if (preg_match('/^\+?98(9\d{9})$/', $p, $m) || preg_match('/^(9\d{9})$/', $p, $m)) {
        return '0' . $m[1];
    }
    return $p;
}

/**
 * ثبت یک اعلان رویدادی برای کاربر.
 *
 * @param PDO    $pdo
 * @param string $phone  شماره‌ی کاربر (اگر خالی باشد فقط در لاگ ثبت می‌شود)
 * @param string $title  عنوان اعلان (مثلاً «✅ ثبت درخواست»)
 * @param string $body   متن کامل اعلان
 * @param array  $extra  داده‌های همراه برای کلیک روی اعلان (اختیاری)
 * @return array{ok:bool,id:int,pushed:bool,error:string,push:array}
 *         push = خلاصه‌ی ارسال به گوشی (outcome/devices/sent/failed/error/hint) —
 *         همان چیزی که در push_log ثبت و در پنل ادمین نمایش داده می‌شود.
 */
function eplakNotifyUser(PDO $pdo, string $phone, string $title, string $body, array $extra = []): array
{
    $out = ['ok' => false, 'id' => 0, 'pushed' => false, 'error' => '', 'push' => []];

    $phone = eplakNotifyNormalizePhone($phone);
    if ($phone === '' || $phone === 'all') {
        $out['error'] = 'no_phone';
        return $out;
    }

    $title = eplakNotifyTrim($title, 250);
    $body  = eplakNotifyTrim($body, 900);

    /* ۱) ذخیره در جدول اعلان‌ها (برای فهرست داخل اپ و سایت) */
    try {
        $stmt = $pdo->prepare('INSERT INTO notifications (user_phone, title, body, read_flag) VALUES (:phone, :title, :body, 0)');
        try {
            $stmt->execute([':phone' => $phone, ':title' => $title, ':body' => $body]);
        } catch (Throwable $first) {
            /* اگر جدول با utf8 سه‌بایتی ساخته شده باشد، ایموجی چهاربایتی (مثل 📣 در
               عنوان یا 👍 در متن پاسخ مدیر) ذخیره نمی‌شود و کل اعلان بی‌صدا از بین
               می‌رفت. یک‌بار بدون آن نویسه‌ها دوباره تلاش می‌کنیم. */
            $safeTitle = eplakStripAstralChars($title);
            $safeBody  = eplakStripAstralChars($body);
            if ($safeTitle === $title && $safeBody === $body) {
                throw $first;
            }
            error_log('[eplak-notify-event] ذخیره‌ی اعلان با ایموجی ناموفق بود؛ بدون ایموجی ذخیره شد: ' . $first->getMessage());
            $title = $safeTitle;
            $body  = $safeBody;
            /* دستور تازه (اجرای دوباره‌ی دستورِ خطادار روی بعضی درایورها خطای «API misuse» می‌دهد) */
            $retry = $pdo->prepare('INSERT INTO notifications (user_phone, title, body, read_flag) VALUES (:phone, :title, :body, 0)');
            $retry->execute([':phone' => $phone, ':title' => $title, ':body' => $body]);
        }
        $out['id'] = (int) $pdo->lastInsertId();
        $out['ok'] = true;
    } catch (Throwable $e) {
        $out['error'] = $e->getMessage();
        error_log('[eplak-notify-event] ذخیره‌ی اعلان ناموفق: ' . $e->getMessage());
        return $out;
    }

    /* ۲) ارسال فوری به گوشی از مسیر فایربیس (اگر پروژه تنظیم شده باشد).
          اگر اپ باز باشد، فهرست اعلان‌ها خودش اعلان را نشان می‌دهد.
          نتیجه (چند گوشی؟ رسید؟ خطای گوگل؟) همیشه در push_log ثبت می‌شود تا
          مدیر بتواند علت «اعلان نیامد» را از داخل پنل ببیند. */
    if (function_exists('eplakFcmSend')) {
        try {
            $payload = array_merge([
                'id'    => (string) $out['id'],
                'url'   => 'index.html#screen-notifications',
            ], $extra);
            $tokens = eplakFcmTokens($pdo, [$phone]);
            $res    = eplakFcmSend($pdo, $tokens, $title, $body, $payload, 10);
            $summary = eplakFcmSummarize($res, count($tokens));

            $out['push']   = $summary;
            $out['pushed'] = $summary['sent'] > 0;

            eplakPushLogAdd($pdo, [
                'notification_id' => $out['id'],
                'user_phone'      => $phone,
                'kind'            => (string) ($extra['kind'] ?? ''),
                'code'            => (string) ($extra['code'] ?? ''),
                'title'           => $title,
                'channel'         => 'fcm',
                'devices'         => $summary['devices'],
                'sent'            => $summary['sent'],
                'failed'          => $summary['failed'],
                'outcome'         => $summary['outcome'],
                'error'           => $summary['error'],
            ]);
        } catch (Throwable $e) {
            error_log('[eplak-notify-event] ارسال فوری فایربیس ناموفق: ' . $e->getMessage());
            $out['push'] = ['outcome' => 'failed', 'devices' => 0, 'sent' => 0, 'failed' => 0,
                            'error' => $e->getMessage(), 'hint' => 'خطای داخلی هنگام ارسال اعلان گوشی.'];
        }
    }

    return $out;
}

/**
 * اعلان «ثبت درخواست/گزارش» — الگوی آماده برای رویدادهای اپ.
 *
 * @param string $kindLabel مثل «درخواست» یا «تیکت»
 * @param string $code      کد پیگیری
 */
function eplakNotifyRequestCreated(PDO $pdo, string $phone, string $kindLabel, string $code): array
{
    $when  = eplakFaDateTime();
    $title = '✅ ثبت ' . $kindLabel;
    $body  = $kindLabel . ' شما با کد پیگیری ' . $code . ' در تاریخ ' . $when . ' ثبت شد.'
           . ' نتیجه‌ی بررسی از همین‌جا به شما اطلاع داده می‌شود.';

    return eplakNotifyUser($pdo, $phone, $title, $body, [
        'code' => $code,
        'kind' => 'request_created',
    ]);
}

/** کوتاه‌کردن متن برای ستون‌های دیتابیس */
function eplakNotifyTrim(string $text, int $max): string
{
    $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max, 'UTF-8');
    }
    return substr($text, 0, $max);
}

/**
 * اعلان «پاسخ مدیریت» و «تغییر وضعیت» — هم برای گزارش و هم برای تیکت.
 *
 * چرا این تابع؟ قبلاً پاسخ‌دادن به تیکت در پنل ادمین فقط دیتابیس را به‌روز
 * می‌کرد و هیچ اعلانی نمی‌ساخت؛ کاربر در اپ هیچ خبری نمی‌گرفت. حالا هر دو
 * مسیر (گزارش/تیکت) از همین یک تابع رد می‌شوند تا:
 *   ۱) اعلان در فهرست اعلان‌های خود کاربر (اپ و سایت) ثبت شود،
 *   ۲) اگر اپ بسته باشد، از مسیر فایربیس به گوشی برسد،
 *   ۳) متن اعلان تاریخ/ساعت فارسی و خلاصه‌ی پاسخ را داشته باشد.
 *
 * @param string $kindLabel  مثل «درخواست» یا «تیکت»
 * @param string $code       کد پیگیری (مثلاً EP-1403-0021)
 * @param string $statusKey  کلید وضعیت: pending | in_progress | done
 * @param string $reply      متن پاسخ مدیریت (می‌تواند خالی باشد)
 * @param ?bool  $statusChanged  true = وضعیت عوض شده · false = فقط پاسخ تازه آمده
 *                               (متن اعلان «وضعیت تغییر کرد» نمی‌گوید) · null = نامشخص
 */
function eplakNotifyReply(PDO $pdo, string $phone, string $kindLabel, string $code, string $statusKey, string $reply = '', ?bool $statusChanged = null): array
{
    $phone = eplakNotifyNormalizePhone($phone);
    if ($phone === '') {
        return ['ok' => false, 'id' => 0, 'pushed' => false, 'error' => 'no_phone'];
    }

    $labels = [
        'pending'     => 'در حال انتظار',
        'in_progress' => 'در حال رسیدگی',
        'done'        => 'انجام شد',
        'rejected'    => 'رد شد',
    ];
    $statusFa = $labels[$statusKey] ?? $statusKey;
    $reply    = trim($reply);
    $when     = eplakFaDateTime();

    $title = '📣 پاسخ ' . $kindLabel . ' ' . $code;
    if ($statusChanged === false && $reply !== '') {
        /* وضعیت همان قبلی است و فقط پاسخ تازه ثبت شده */
        $body = 'پاسخ جدیدی برای ' . $kindLabel . ' شما ثبت شد (وضعیت: «' . $statusFa . '»).' . "\n";
    } else {
        $body = 'وضعیت ' . $kindLabel . ' شما به «' . $statusFa . '» تغییر کرد.' . "\n";
    }
    if ($reply !== '') {
        $body .= 'پاسخ شهرداری: ' . mb_substr($reply, 0, 180) . "\n";
    }
    $body .= 'زمان: ' . $when;

    /* اعلان درون‌برنامه‌ای + فایربیس (اگر تنظیم شده باشد) در یک جا */
    $res = eplakNotifyUser($pdo, $phone, $title, $body, [
        'code'   => $code,
        'kind'   => 'reply',
        'status' => $statusKey,
        'url'    => 'index.html#screen-notifications',
    ]);

    /* اگر فایربیس تنظیم نشده بود، اینترنتی/وب‌پوش را هم امتحان می‌کنیم تا
       اعلان در هر حالتی روی گوشی دیده شود. */
    if (empty($res['pushed']) && function_exists('eplakPushNotifyPhone')) {
        try {
            $push = eplakPushNotifyPhone($pdo, $phone, $title, $body, [
                'url'  => 'index.html#screen-notifications',
                'tag'  => 'eplak-' . ($kindLabel === 'تیکت' ? 'ticket' : 'report') . '-' . $code,
                'kind' => 'reply',
            ]);
            $res['pushed'] = ((int) ($push['sent'] ?? 0)) > 0;
            if ($res['pushed']) {
                /* اعلان از راه مرورگر (وب‌پوش) رسید؛ برای مدیر «ارسال شد» حساب می‌شود */
                $res['push'] = array_merge($res['push'] ?? [], [
                    'outcome' => 'sent_web',
                    'sent'    => (int) ($push['sent'] ?? 0),
                    'hint'    => '',
                ]);
            }
        } catch (Throwable $e) {
            error_log('[eplak-notify-reply] پوش ناموفق: ' . $e->getMessage());
        }
    }

    return $res;
}

/**
 * پیام فارسیِ کوتاه از روی نتیجه‌ی ارسال، برای نمایش به مدیر (پس از «ثبت پاسخ»
 * یا تغییر وضعیت). خروجی: ['type'=>'success'|'warning'|'danger', 'text'=>string]
 */
function eplakNotifyDescribe(array $notify): array
{
    if (empty($notify)) {
        return ['type' => 'warning', 'text' => 'اعلان برای کاربر ساخته نشد (شماره‌ی کاربر خالی است).'];
    }
    if (empty($notify['ok'])) {
        $why = (string) ($notify['error'] ?? '');
        return ['type' => 'danger', 'text' => 'ساخت اعلان برای کاربر ناموفق بود' . ($why !== '' && $why !== 'no_phone' ? ': ' . $why : '.')];
    }

    $push    = is_array($notify['push'] ?? null) ? $notify['push'] : [];
    $outcome = (string) ($push['outcome'] ?? '');
    $sent    = (int) ($push['sent'] ?? 0);
    $devices = (int) ($push['devices'] ?? 0);
    $hint    = trim((string) ($push['hint'] ?? ''));

    $inApp = 'اعلان در فهرست اعلان‌های اپ کاربر ثبت شد';

    switch ($outcome) {
        case 'sent':
            return ['type' => 'success', 'text' => $inApp . ' و اعلان گوشی هم به ' . $sent . ' دستگاه ارسال شد.'];
        case 'sent_web':
            return ['type' => 'success', 'text' => $inApp . ' و اعلان از راه مرورگر کاربر ارسال شد.'];
        case 'partial':
            return ['type' => 'warning', 'text' => $inApp . '؛ اعلان گوشی به ' . $sent . ' از ' . $devices . ' دستگاه رسید. ' . $hint];
        case 'no_device':
            return ['type' => 'warning', 'text' => $inApp . '، ولی اعلان سیستمی به گوشی نرفت: ' . $hint];
        case 'fcm_off':
            return ['type' => 'warning', 'text' => $inApp . '، ولی اعلان گوشی ارسال نشد: ' . $hint];
        case 'google_error':
        case 'failed':
            return ['type' => 'danger', 'text' => $inApp . '، ولی اعلان گوشی ارسال نشد. ' . $hint];
        default:
            return ['type' => 'success', 'text' => $inApp . '.'];
    }
}

/**
 * ارسال دوبارهٔ «آخرین اعلانِ» یک گزارش/تیکت به گوشی‌های کاربر.
 *
 * کاربرد: وقتی اعلان در زمان تغییر وضعیت به گوشی نرسید (مثلاً چون گوشی هنوز ثبت
 * نشده بود)، مدیر بعد از رفع مشکل همین را می‌زند تا بدون دست‌کاری وضعیت، همان
 * اعلان دوباره روی گوشی بنشیند. ردیف تازه‌ای در فهرست اعلان‌های اپ ساخته نمی‌شود.
 *
 * @return array{ok:bool,id:int,pushed:bool,error:string,push:array}
 */
function eplakNotifyResendLast(PDO $pdo, string $phone, string $code): array
{
    $out = ['ok' => false, 'id' => 0, 'pushed' => false, 'error' => '', 'push' => []];
    $phone = eplakNotifyNormalizePhone($phone);
    if ($phone === '' || $code === '') {
        $out['error'] = 'no_phone';
        return $out;
    }
    try {
        $stmt = $pdo->prepare('SELECT id, title, body FROM notifications WHERE user_phone = :p AND title LIKE :c ORDER BY id DESC LIMIT 1');
        $stmt->execute([':p' => $phone, ':c' => '%' . $code . '%']);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        $out['error'] = $e->getMessage();
        return $out;
    }
    if (!$row) {
        $out['error'] = 'no_notification';
        return $out;
    }

    $out['ok'] = true;
    $out['id'] = (int) $row['id'];
    $tokens = eplakFcmTokens($pdo, [$phone]);
    $res = eplakFcmSend($pdo, $tokens, (string) $row['title'], (string) $row['body'], [
        'id'  => (string) $row['id'],
        'url' => 'index.html#screen-notifications',
        'tag' => 'eplak-resend-' . $code,
    ], 12);
    $summary = eplakFcmSummarize($res, count($tokens));
    $out['push']   = $summary;
    $out['pushed'] = $summary['sent'] > 0;

    eplakPushLogAdd($pdo, [
        'notification_id' => $out['id'],
        'user_phone'      => $phone,
        'kind'            => 'resend',
        'code'            => $code,
        'title'           => (string) $row['title'],
        'channel'         => 'fcm',
        'devices'         => $summary['devices'],
        'sent'            => $summary['sent'],
        'failed'          => $summary['failed'],
        'outcome'         => $summary['outcome'],
        'error'           => $summary['error'],
    ]);
    return $out;
}

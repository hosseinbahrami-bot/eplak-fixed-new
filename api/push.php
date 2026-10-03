<?php
/* api/push.php — ثبت و مدیریت «اعلان پس‌زمینه» (Web Push + فایربیس) برای اپلیکیشن شهروندی

   GET  ?action=config                        → کلید عمومی VAPID + وضعیت فعال بودن
   GET  ?action=status&phone=09xxxxxxxxx      → تعداد دستگاه‌های ثبت‌شده‌ی این شماره
        &token=…  (اختیاری)                    → وضعیت «همین گوشی» (ثبت‌شده؟ فعال؟ خطای آخر؟)
   POST action=subscribe  {phone, subscription:{endpoint, keys:{p256dh, auth}}}
   POST action=unsubscribe {endpoint}
   POST action=register_fcm {phone, token, platform, detach?}
                                              → ثبت توکن فایربیس اپ اندروید
                                                 (detach=1: جدا کردن گوشی از شماره — خروج از حساب)
   POST action=unregister_fcm {token}
   POST action=test {token}  یا  {phone}      → ارسال اعلان آزمایشی (فایربیس + وب‌پوش)

   قالب بدنه: هم JSON و هم فرم ساده (application/x-www-form-urlencoded) پذیرفته
   می‌شود. اپ اندروید فرم ساده می‌فرستد؛ همین قالب پیش‌تر نادیده گرفته می‌شد و
   هیچ گوشی‌ای ثبت نمی‌شد (ریشه‌ی «اعلان‌های پنل به گوشی نمی‌رسد»).

   نکته: اعلان‌های «درون‌برنامه‌ای» (in-app) همیشه کار می‌کنند؛ این اندپوینت مسیر
   «نوتیفیکیشن سیستمی گوشی» را اضافه می‌کند تا اعلان حتی در حالت قفل بودن صفحه و
   بسته بودن برنامه به کاربر برسد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/webpush.php';
require_once __DIR__ . '/../shared/fcm.php';

eplakApiHeaders();

$input = eplakRequestInput();

/* مقدار متنی یک کلید ورودی (آرایه/آبجکت نادیده گرفته می‌شود) */
$in = static function (string $key) use ($input): string {
    $value = $input[$key] ?? '';
    return is_scalar($value) ? trim((string) $value) : '';
};

$action = strtolower($in('action'));
if ($action === '') {
    $action = 'config';
}

$phone = eplakNormalizePhone($in('phone'));
if ($phone === '') {
    /* کاربر مهمان: اعلان‌های عمومی را می‌گیرد (same as notifications.php 'all') */
    $phone = '';
}

try {
    switch ($action) {
        case 'config': {
            $vapid = eplakVapidKeys($pdo);
            $fcm   = eplakFcmConfig($pdo);
            eplakJson([
                'success'         => true,
                'enabled'         => $vapid['ready'] && eplakPushEnabled(),
                'vapid_public_key' => $vapid['public'],
                'reason'          => $vapid['ready'] ? '' : $vapid['error'],
                'secure_context_required' => true,
                /* مسیر اعلان سیستمی برای اپ اندروید (فایربیس) */
                'fcm_ready'       => $fcm['ready'],
                'fcm_reason'      => $fcm['ready'] ? '' : $fcm['error'],
            ]);
        }

        case 'status': {
            $token = $in('token');
            if ($phone === '' && $token === '') {
                eplakJsonError('شماره موبایل معتبر الزامی است', 400);
            }
            $subs   = $phone !== '' ? eplakPushSubscriptions($pdo, [$phone]) : [];
            $tokens = $phone !== '' ? eplakFcmTokens($pdo, [$phone]) : [];

            /* وضعیت «همین گوشی»: اپ با این پاسخ می‌فهمد ثبت شده یا نه */
            $device = null;
            if ($token !== '') {
                $row = eplakFcmTokenInfo($pdo, $token);
                $device = [
                    'registered'  => $row !== null,
                    'active'      => $row !== null && (int) ($row['is_active'] ?? 0) === 1,
                    'attached'    => $row !== null && (string) ($row['user_phone'] ?? '') !== '',
                    'phone_match' => $row !== null && $phone !== '' && (string) ($row['user_phone'] ?? '') === $phone,
                    'last_error'  => $row !== null ? (string) ($row['last_error'] ?? '') : '',
                    'last_seen_at' => $row !== null ? (string) ($row['last_seen_at'] ?? '') : '',
                ];
            }

            eplakJson([
                'success'       => true,
                'devices'       => count($subs) + count($tokens),
                'browser_devices' => count($subs),
                'app_devices'   => count($tokens),
                'push_enabled'  => eplakPushEnabled(),
                'fcm_ready'     => eplakFcmConfig($pdo)['ready'],
                'device'        => $device,
            ]);
        }

        case 'subscribe': {
            $subscription = $input['subscription'] ?? null;
            if (!is_array($subscription)) {
                eplakJsonError('اطلاعات اشتراک نامعتبر است', 400);
            }
            if (!eplakPushEnabled()) {
                eplakJson(['success' => false, 'error' => 'امکان اعلان پس‌زمینه روی این سرور فعال نیست.', 'enabled' => false], 200);
            }

            $userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
            if (!eplakPushSaveSubscription($pdo, $phone, $subscription, $userAgent)) {
                eplakJsonError('ذخیره‌ی اشتراک ناموفق بود', 400);
            }

            /* کلیدهای VAPID را همین‌جا هم بساز (تا اولین ارسال بدون تأخیر باشد) */
            eplakVapidKeys($pdo);

            eplakJson([
                'success'  => true,
                'saved'    => true,
                'devices'  => count(eplakPushSubscriptions($pdo, $phone === '' ? [] : [$phone], $phone === '')),
            ]);
        }

        case 'register_fcm': {
            /* ثبت دستگاه اپ اندروید. برخلاف مرورگر، اپ شماره‌ی کاربر را می‌داند
               و توکن فایربیس را از خود اندروید می‌گیرد. */
            $token = $in('token');
            if ($token === '') {
                eplakJsonError('توکن دستگاه الزامی است', 400);
            }
            $detach = in_array(strtolower($in('detach')), ['1', 'true', 'yes'], true);
            $platform = $in('platform') !== '' ? $in('platform') : 'android';
            if (!eplakFcmSaveToken($pdo, $phone, $token, $platform, $detach)) {
                eplakJsonError('ذخیره‌ی توکن دستگاه ناموفق بود', 400);
            }
            $fcm  = eplakFcmConfig($pdo);
            $info = eplakFcmTokenInfo($pdo, $token);
            eplakJson([
                'success'   => true,
                'saved'     => true,
                'detached'  => $detach,
                /* اتصال این گوشی به شماره‌ی کاربر (برای اعلان‌های شخصی) */
                'attached'  => $info !== null && (string) ($info['user_phone'] ?? '') !== '',
                'devices'   => $phone !== '' ? count(eplakFcmTokens($pdo, [$phone])) : 0,
                'fcm_ready' => $fcm['ready'],
                'fcm_reason' => $fcm['ready'] ? '' : $fcm['error'],
            ]);
        }

        case 'unregister_fcm': {
            $token = $in('token');
            if ($token === '') {
                eplakJsonError('توکن دستگاه الزامی است', 400);
            }
            eplakFcmDeleteToken($pdo, $token);
            eplakJson(['success' => true, 'removed' => true]);
        }

        case 'unsubscribe': {
            $endpoint = $in('endpoint');
            if ($endpoint === '') {
                eplakJsonError('نشانی اشتراک الزامی است', 400);
            }
            eplakPushDeleteSubscription($pdo, $endpoint);
            eplakJson(['success' => true, 'removed' => true]);
        }

        case 'test': {
            $token = $in('token');
            if ($phone === '' && $token === '') {
                eplakJsonError('برای ارسال آزمایشی، شماره موبایل یا توکن دستگاه الزامی است', 400);
            }

            /* ── سقف تعداد: این اندپوینت عمومی است؛ هر شماره/گوشی هر ۱۵ ثانیه
                  فقط یک اعلان آزمایشی می‌گیرد تا کسی نتواند کاربر را پیام‌باران کند. */
            $limitKey = $token !== '' ? 'tok:' . substr(hash('sha256', $token), 0, 16) : $phone;
            $recent = eplakPushLogRecent($pdo, ['phone' => $limitKey], 1);
            if ($recent && (string) ($recent[0]['kind'] ?? '') === 'test') {
                $ageSec = time() - (int) (strtotime((string) ($recent[0]['created_at'] ?? '')) ?: 0);
                if ($ageSec >= 0 && $ageSec < 15) {
                    eplakJson([
                        'success' => false,
                        'error'   => 'چند ثانیه صبر کنید و دوباره امتحان کنید.',
                        'retry_after' => 15 - $ageSec,
                    ], 429);
                }
            }

            $title = 'اعلان آزمایشی — ای‌پلاک';
            $body  = 'این پیام برای بررسی رسیدن اعلان در حالت قفل/بسته بودن برنامه ارسال شده است.';
            $meta  = ['url' => 'index.html', 'tag' => 'eplak-test-' . time()];

            /* ── حالت «همین گوشی»: فقط به توکن خودِ درخواست‌دهنده می‌فرستیم ── */
            if ($token !== '') {
                $row = eplakFcmTokenInfo($pdo, $token);
                if ($row === null) {
                    eplakJson([
                        'success' => false,
                        'devices' => 0,
                        'outcome' => 'no_device',
                        'error'   => 'این گوشی هنوز در سرور ثبت نشده است.',
                        'hint'    => 'چند ثانیه صبر کنید تا ثبت خودکار انجام شود؛ اگر نشد اینترنت را بررسی کنید و اپ را دوباره باز کنید.',
                    ], 200);
                }
                /* توکنی که قبلاً «باطل» علامت خورده، با درخواست تازه‌ی خود گوشی دوباره فعال می‌شود */
                eplakFcmSaveToken($pdo, '', $token, (string) ($row['platform'] ?? 'android'));
                $row = eplakFcmTokenInfo($pdo, $token) ?: $row;

                $send = eplakFcmSend($pdo, [$row], $title, $body, $meta, 12);
                $sum  = eplakFcmSummarize($send, 1);
                eplakPushLogAdd($pdo, [
                    'user_phone' => $limitKey,
                    'kind'       => 'test',
                    'title'      => $title,
                    'channel'    => 'fcm',
                    'devices'    => 1,
                    'sent'       => $sum['sent'],
                    'failed'     => $sum['failed'],
                    'outcome'    => $sum['outcome'],
                    'error'      => $sum['error'],
                ]);
                eplakJson([
                    'success' => $sum['sent'] > 0,
                    'sent'    => $sum['sent'],
                    'failed'  => $sum['failed'],
                    'devices' => 1,
                    'outcome' => $sum['outcome'],
                    'error'   => $sum['error'],
                    'hint'    => $sum['hint'],
                ]);
            }

            /* ── حالت قدیمی: همه‌ی دستگاه‌های یک شماره ── */

            /* مسیر ۱: مرورگر / افزودن به صفحه اصلی (Web Push) */
            $subscriptions = eplakPushSubscriptions($pdo, [$phone]);
            $browser = $subscriptions
                ? eplakWebPushSend($pdo, $subscriptions, $title, $body, $meta)
                : ['sent' => 0, 'failed' => 0, 'errors' => []];

            /* مسیر ۲: اپ اندروید (فایربیس/FCM) */
            $tokens = eplakFcmTokens($pdo, [$phone]);
            $app    = $tokens
                ? eplakFcmSend($pdo, $tokens, $title, $body, $meta, 12)
                : ['sent' => 0, 'failed' => 0, 'errors' => [], 'skipped' => ''];

            $sent  = (int) $browser['sent'] + (int) $app['sent'];
            $total = count($subscriptions) + count($tokens);

            $sum = eplakFcmSummarize($app, count($tokens));
            eplakPushLogAdd($pdo, [
                'user_phone' => $phone,
                'kind'       => 'test',
                'title'      => $title,
                'channel'    => 'fcm',
                'devices'    => count($tokens),
                'sent'       => $sum['sent'],
                'failed'     => $sum['failed'],
                'outcome'    => $sum['outcome'],
                'error'      => $sum['error'],
            ]);

            if ($total === 0) {
                eplakJson([
                    'success' => false,
                    'error'   => 'برای این شماره هیچ دستگاهی ثبت نشده است. ابتدا در اپلیکیشن اجازه‌ی اعلان را فعال کنید.',
                    'devices' => 0,
                    'outcome' => 'no_device',
                ], 200);
            }

            eplakJson([
                'success' => $sent > 0,
                'sent'    => $sent,
                'failed'  => (int) $browser['failed'] + (int) $app['failed'],
                'devices' => $total,
                'browser_devices' => count($subscriptions),
                'app_devices'     => count($tokens),
                'errors'  => array_merge($browser['errors'], $app['errors']),
                'fcm_skipped' => $app['skipped'] ?? '',
                'outcome' => $sum['outcome'],
                'hint'    => $sum['hint'],
            ]);
        }

        default:
            eplakJsonError('عملیات نامعتبر است', 400);
    }
} catch (Throwable $e) {
    eplakServerError($e, 'push');
}

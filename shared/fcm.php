<?php
/* shared/fcm.php — اعلان سیستمی گوشی برای اپ اندروید از طریق فایربیس (FCM)

   چرا لازم است؟
   اپ اندروید سایت را در WebView نشان می‌دهد و اندروید در WebView نه «Push API»
   دارد و نه «Notification API». پس برای رسیدن اعلان در حالت «بسته بودن کامل
   اپلیکیشن» باید از سرویس استاندارد گوگل (Firebase Cloud Messaging) استفاده شود.

   این فایل روی سرور (بدون هیچ کتابخانه‌ی بیرونی) اعلان را به گوگل می‌فرستد:
     ۱) ساخت توکن دسترسی از «کلید سرویس» حساب فایربیس
        (امضای JWT با RS256 و سپس گرفتن access_token از oauth2.googleapis.com)
     ۲) ارسال پیام به هر دستگاه با FCM HTTP v1
        (https://fcm.googleapis.com/v1/projects/{project}/messages:send)

   کلید سرویس در پنل ادمین → تنظیمات → بخش «اعلان گوشی در اپ اندروید» وارد
   می‌شود و در جدول app_settings ذخیره می‌گردد (خارج از کد و خارج از گیت).
   ============================================================================ */

require_once __DIR__ . '/webpush.php';   /* استفاده از eplakHttpPost و توابع base64 */

/* ── پروژه‌ی فایربیسِ خودِ اپ اندروید ───────────────────────────────────────
   APK این مخزن با فایل android-app/app/google-services.json ساخته می‌شود و آن
   فایل به یک پروژه‌ی مشخص فایربیس گره خورده است. کلید سرویسی که در پنل وارد
   می‌شود باید دقیقاً از «همان» پروژه باشد؛ وگرنه گوگل هر ارسال را با
   «HTTP 403 PERMISSION_DENIED … SenderId mismatch» رد می‌کند و هیچ اعلانی به
   APK نمی‌رسد — در حالی که همان کلید برای پروژه‌ی خودش کاملاً معتبر است و
   گام‌های «توکن دسترسی» و «اعتبارسنجی پیام» سبز می‌مانند.
   (آزمون push.test.mjs هم‌خوانیِ این مقدارها با google-services.json را می‌سنجد.)
   در محیط آزمون با EPLAK_APP_FCM_PROJECT یا تنظیم app_fcm_project قابل تغییر است. */
if (!defined('EPLAK_APP_FCM_PROJECT_ID')) define('EPLAK_APP_FCM_PROJECT_ID', 'eplak-7e6ed');
if (!defined('EPLAK_APP_FCM_SENDER_ID'))  define('EPLAK_APP_FCM_SENDER_ID', '221915268820');
if (!defined('EPLAK_APP_PACKAGE'))        define('EPLAK_APP_PACKAGE', 'com.eplak');

/** پروژه‌ای که اپ اندروید (APK) با آن ساخته شده است */
function eplakFcmAppProject(): array
{
    $project = trim((string) (getenv('EPLAK_APP_FCM_PROJECT') ?: ''));
    $source  = $project !== '' ? 'env' : '';
    if ($project === '' && function_exists('eplakConfigValue')) {
        try {
            $project = trim((string) eplakConfigValue('app_fcm_project', ''));
        } catch (\Throwable $e) {
            $project = '';
        }
        if ($project !== '') $source = 'config';
    }
    if ($project === '') {
        $project = EPLAK_APP_FCM_PROJECT_ID;
        $source  = 'apk';
    }
    $sender = trim((string) (getenv('EPLAK_APP_FCM_SENDER') ?: ''));
    if ($sender === '' && $project === EPLAK_APP_FCM_PROJECT_ID) $sender = EPLAK_APP_FCM_SENDER_ID;

    return [
        'project_id' => $project,
        'sender_id'  => $sender,
        'package'    => EPLAK_APP_PACKAGE,
        'source'     => $source,
    ];
}

/** متن فارسیِ «کلید از پروژه‌ی دیگری است» با راه حل گام‌به‌گام */
function eplakFcmProjectMismatchText(string $keyProject, string $appProject = ''): string
{
    if ($appProject === '') $appProject = eplakFcmAppProject()['project_id'];
    $key = $keyProject !== '' ? $keyProject : 'نامشخص';
    return 'کلید سرویس فایربیس برای پروژه‌ی «' . $key . '» است، ولی اپ اندروید (APK) با پروژه‌ی «'
        . $appProject . '» ساخته شده؛ گوگل ارسال را با «SenderId mismatch» رد می‌کند و هیچ اعلانی به اپ اندروید نمی‌رسد. '
        . 'راه حل: در Firebase Console پروژه‌ی «' . $appProject . '» را باز کنید → Project settings → Service accounts → '
        . 'Generate new private key، و محتوای همان فایل JSON را این‌جا (پنل → تنظیمات → کلید سرویس فایربیس) بچسبانید. '
        . '(کلید پروژه‌ی «' . $key . '» فقط وقتی به کار می‌آید که APK با google-services.json همان پروژه دوباره ساخته شود.)';
}

/** وضعیت آماده بودن موتور: افزونه‌های لازم + کلید سرویس وارد شده */
function eplakFcmConfig(PDO $pdo): array
{
    $app = eplakFcmAppProject();
    $out = [
        'ready'         => false,
        'configured'    => false,
        'project_id'    => '',
        'client_email'  => '',
        'private_key'   => '',
        'error'         => '',
        /* هم‌خوانی پروژه‌ی کلید با پروژه‌ی APK (null = هنوز کلیدی نیست که مقایسه شود) */
        'app_project'   => $app['project_id'],
        'app_sender'    => $app['sender_id'],
        'package'       => $app['package'],
        'project_match' => null,
        'warning'       => '',
    ];

    if (!function_exists('openssl_sign') || !function_exists('openssl_get_privatekey')) {
        $out['error'] = 'افزونه‌ی OpenSSL روی سرور فعال نیست.';
        return $out;
    }
    if (!function_exists('curl_init') && !ini_get('allow_url_fopen')) {
        $out['error'] = 'برای ارسال اعلان به گوگل، یکی از curl یا allow_url_fopen لازم است.';
        return $out;
    }

    $raw = (string) eplakAppSetting($pdo, 'fcm_service_account', '');
    if (trim($raw) === '') {
        $out['error'] = 'کلید سرویس فایربیس وارد نشده است.';
        return $out;
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        $out['error'] = 'فایل کلید سرویس قابل خواندن نیست (JSON نامعتبر).';
        return $out;
    }

    $project = trim((string) ($json['project_id'] ?? ''));
    $email   = trim((string) ($json['client_email'] ?? ''));
    $key     = (string) ($json['private_key'] ?? '');

    if ($project === '' || $email === '' || $key === '') {
        $out['error'] = 'کلید سرویس ناقص است (project_id / client_email / private_key).';
        return $out;
    }
    if (strpos($key, 'BEGIN PRIVATE KEY') === false) {
        $out['error'] = 'کلید خصوصی نامعتبر است. محتوای فایل JSON را کامل و بدون تغییر وارد کنید.';
        return $out;
    }

    $out['project_id']   = $project;
    $out['client_email'] = $email;
    $out['private_key']  = $key;
    $out['configured']   = true;
    $out['ready']        = true;

    /* کلید معتبر است؛ ولی اگر از پروژه‌ی دیگری باشد، به APK این مخزن نمی‌رسد.
       ready همچنان true می‌ماند (ارسال به پروژه‌ی خودِ کلید ممکن است)؛ پنل و
       اپ از project_match/warning می‌فهمند که باید کلید عوض شود. */
    $out['project_match'] = ($app['project_id'] === '' || $project === $app['project_id']);
    if (!$out['project_match']) {
        $out['warning'] = eplakFcmProjectMismatchText($project, $app['project_id']);
    }

    return $out;
}

/**
 * توکن دسترسی گوگل (OAuth2) — یک ساعت معتبر است و در دیتابیس کش می‌شود.
 *
 * خروجی: ['token'=>string, 'error'=>string, 'network'=>bool]
 *   network = true یعنی «سرور اصلاً به گوگل نرسید» (فایروال/فیلتر/DNS) — نه اینکه
 *   گوگل کلید را رد کرده باشد.
 *
 * وقتی سرور به گوگل نمی‌رسد، هر بار ارسال اعلان چند ثانیه منتظر می‌ماند و پنل
 * ادمین (مثلاً زدن «در حال رسیدگی») کند می‌شد. برای همین، یک «کلید قطع‌کن» داریم:
 * پس از یک شکست شبکه‌ای، تا ۶۰ ثانیه تلاش دوباره نمی‌کنیم. ($force آن را رد می‌کند.)
 */
function eplakFcmAccessToken(PDO $pdo, bool $force = false, int $timeout = 15): array
{
    $out = ['token' => '', 'error' => '', 'network' => false];

    if (!$force) {
        $cached = (string) eplakAppSetting($pdo, 'fcm_access_token', '');
        $expiry = (int) eplakAppSetting($pdo, 'fcm_access_token_exp', '0');
        if ($cached !== '' && $expiry > time() + 60) {
            $out['token'] = $cached;
            return $out;
        }

        $failedAt = (int) eplakAppSetting($pdo, 'fcm_net_fail_at', '0');
        if ($failedAt > 0 && time() - $failedAt >= 0 && time() - $failedAt < 60) {
            $out['error']   = 'ارتباط سرور با گوگل برقرار نیست (آخرین تلاش ' . (time() - $failedAt) . ' ثانیه پیش شکست خورد).';
            $out['network'] = true;
            return $out;
        }
    }

    $cfg = eplakFcmConfig($pdo);
    if (!$cfg['ready']) {
        $out['error'] = $cfg['error'];
        return $out;
    }

    $now    = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss'   => $cfg['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ];

    $input = eplakB64UrlEncode((string) json_encode($header, JSON_UNESCAPED_SLASHES))
        . '.' . eplakB64UrlEncode((string) json_encode($claims, JSON_UNESCAPED_SLASHES));

    $key = @openssl_get_privatekey($cfg['private_key']);
    if ($key === false) {
        $out['error'] = 'کلید خصوصی فایربیس قابل استفاده نیست.';
        return $out;
    }

    $signature = '';
    if (!@openssl_sign($input, $signature, $key, OPENSSL_ALGO_SHA256)) {
        $out['error'] = 'امضای درخواست فایربیس ناموفق بود.';
        return $out;
    }
    $assertion = $input . '.' . eplakB64UrlEncode($signature);

    $response = eplakHttpPost(
        'https://oauth2.googleapis.com/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $assertion,
        ]),
        $timeout
    );

    if ($response['status'] === 0) {
        /* به گوگل نرسیدیم؛ کلید قطع‌کن را روشن می‌کنیم */
        $out['network'] = true;
        try {
            eplakSetAppSetting($pdo, 'fcm_net_fail_at', (string) time());
        } catch (\Throwable $e) {
        }
    }

    if ($response['status'] !== 200) {
        $detail = '';
        $body   = json_decode((string) $response['body'], true);
        if (is_array($body)) {
            $detail = (string) ($body['error_description'] ?? $body['error'] ?? '');
        }
        $out['error'] = 'گرفتن توکن دسترسی گوگل ناموفق بود'
            . ($response['status'] ? ' (کد ' . $response['status'] . ')' : '')
            . ($detail !== '' ? ': ' . $detail : ($response['error'] !== '' ? ': ' . $response['error'] : ''));
        return $out;
    }

    $data = json_decode((string) $response['body'], true);
    $token = is_array($data) ? (string) ($data['access_token'] ?? '') : '';
    if ($token === '') {
        $out['error'] = 'پاسخ گوگل توکن دسترسی نداشت.';
        return $out;
    }

    $expiresIn = is_array($data) ? (int) ($data['expires_in'] ?? 3600) : 3600;
    try {
        eplakSetAppSetting($pdo, 'fcm_access_token', $token);
        eplakSetAppSetting($pdo, 'fcm_access_token_exp', (string) ($now + max(60, $expiresIn)));
        eplakSetAppSetting($pdo, 'fcm_net_fail_at', '0');
    } catch (\Throwable $e) {
        /* کش ناموفق مهم نیست */
    }

    $out['token'] = $token;
    return $out;
}

/**
 * ثبت/به‌روزرسانی توکن یک دستگاه اندروید. خروجی: true در صورت موفقیت.
 *
 * قاعده‌ی شماره:
 *   • شماره‌ی معتبر      → دستگاه به همان شماره وصل می‌شود (اعلان‌های شخصی همان کاربر).
 *   • شماره‌ی خالی       → «ثبتِ مهمان». اگر این توکن قبلاً به یک شماره وصل بوده، آن
 *                          اتصال پاک نمی‌شود؛ فقط «زنده بودن دستگاه» تازه می‌شود.
 *                          (اپ پس از هر بالا آمدنِ تازه، پیش از ورود با کد تایید، یک ثبتِ
 *                          مهمان می‌فرستد؛ اگر آن ثبت شماره را پاک می‌کرد، کاربری که اپ را
 *                          بسته و منتظر نتیجه‌ی گزارشش است دیگر اعلانی نمی‌گرفت.)
 *   • $detach = true     → اتصال شماره عمداً پاک می‌شود (خروج کاربر از حساب).
 */
function eplakFcmSaveToken(PDO $pdo, string $phone, string $token, string $platform = 'android', bool $detach = false, string $appProject = ''): bool
{
    $token = trim($token);
    if ($token === '' || strlen($token) > 400) {
        return false;
    }
    /* پروژه‌ی فایربیسی که خودِ اپ گزارش می‌دهد (از google-services.json داخل APK) */
    $appProject = eplakFcmCleanProjectId($appProject);

    $phone = preg_replace('/[^0-9+]/', '', $phone) ?? '';
    if (strlen($phone) > 20) {
        $phone = substr($phone, 0, 20);
    }
    $platform = mb_substr(preg_replace('/[^a-z]/', '', strtolower($platform)) ?? 'android', 0, 20, 'UTF-8');
    if ($platform === '') {
        $platform = 'android';
    }

    try {
        $find = $pdo->prepare('SELECT id FROM device_tokens WHERE token = :token LIMIT 1');
        $find->execute([':token' => $token]);
        $id = (int) $find->fetchColumn();

        if ($id > 0) {
            if ($phone === '' && !$detach) {
                $upd = $pdo->prepare('UPDATE device_tokens SET platform = :platform, is_active = 1, fail_count = 0, last_error = "", last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
                $upd->execute([':platform' => $platform, ':id' => $id]);
            } else {
                $upd = $pdo->prepare('UPDATE device_tokens SET user_phone = :phone, platform = :platform, is_active = 1, fail_count = 0, last_error = "", last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
                $upd->execute([':phone' => $phone, ':platform' => $platform, ':id' => $id]);
            }
            eplakFcmStoreAppProject($pdo, $id, $appProject);
            return true;
        }

        $ins = $pdo->prepare('INSERT INTO device_tokens (user_phone, token, platform, is_active, last_seen_at) VALUES (:phone, :token, :platform, 1, CURRENT_TIMESTAMP)');
        $ins->execute([':phone' => $phone, ':token' => $token, ':platform' => $platform]);
        eplakFcmStoreAppProject($pdo, (int) $pdo->lastInsertId(), $appProject);
        return true;
    } catch (\Throwable $e) {
        error_log('[eplak-fcm] ذخیره‌ی توکن ناموفق: ' . $e->getMessage());
        return false;
    }
}

/** شناسه‌ی پروژه‌ی فایربیس فقط با نویسه‌های مجاز (حروف لاتین، رقم، نقطه، خط تیره) */
function eplakFcmCleanProjectId(string $value): string
{
    $value = trim($value);
    if ($value === '') return '';
    $value = preg_replace('/[^A-Za-z0-9._-]/', '', $value) ?? '';
    return substr($value, 0, 80);
}

/** ستون device_tokens.app_project — روی دیتابیس‌های قدیمی خودکار اضافه می‌شود */
function eplakFcmProjectColumnReady(PDO $pdo): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    $ready = false;
    try {
        if (function_exists('eplakEnsureColumn')) {
            $ready = eplakEnsureColumn($pdo, 'device_tokens', 'app_project', "VARCHAR(80) NOT NULL DEFAULT ''");
        }
    } catch (\Throwable $e) {
        $ready = false;
    }
    return $ready;
}

/** پروژه‌ی گزارش‌شده‌ی اپ را روی ردیف دستگاه می‌نویسد (بی‌صدا؛ هرگز ثبت را خراب نمی‌کند) */
function eplakFcmStoreAppProject(PDO $pdo, int $id, string $appProject): void
{
    if ($id <= 0 || $appProject === '' || !eplakFcmProjectColumnReady($pdo)) return;
    try {
        $upd = $pdo->prepare('UPDATE device_tokens SET app_project = :p WHERE id = :id');
        $upd->execute([':p' => $appProject, ':id' => $id]);
    } catch (\Throwable $e) {
        /* ستون اختیاری است */
    }
}

/** ردیف یک توکن (برای «وضعیت اعلان» داخل اپ) یا null اگر ثبت نشده باشد */
function eplakFcmTokenInfo(PDO $pdo, string $token): ?array
{
    $token = trim($token);
    if ($token === '') {
        return null;
    }
    try {
        $stmt = $pdo->prepare('SELECT * FROM device_tokens WHERE token = :token LIMIT 1');
        $stmt->execute([':token' => $token]);
        $row = $stmt->fetch();
        return $row ?: null;
    } catch (\Throwable $e) {
        return null;
    }
}

/** همه‌ی گوشی‌های یک شماره (فعال و غیرفعال) — برای نمایش وضعیت به مدیر */
function eplakFcmDevicesOf(PDO $pdo, string $phone, int $limit = 8): array
{
    $phone = trim($phone);
    if ($phone === '') {
        return [];
    }
    try {
        $stmt = $pdo->prepare('SELECT id, platform, is_active, fail_count, last_error, last_seen_at FROM device_tokens WHERE user_phone = :p ORDER BY id DESC LIMIT ' . max(1, min(50, $limit)));
        $stmt->execute([':p' => $phone]);
        return $stmt->fetchAll() ?: [];
    } catch (\Throwable $e) {
        return [];
    }
}

/** توکن‌های فعال — اگر شماره‌ها داده شود فقط همان‌ها، وگرنه همه */
function eplakFcmTokens(PDO $pdo, array $phones = [], bool $includeGuests = false): array
{
    try {
        if (!$phones) {
            return $pdo->query('SELECT * FROM device_tokens WHERE is_active = 1 ORDER BY id DESC')->fetchAll();
        }

        $clean = [];
        foreach ($phones as $phone) {
            $phone = trim((string) $phone);
            if ($phone === '' || $phone === 'all') {
                continue;
            }
            $clean[] = $phone;
        }
        if (!$clean && !$includeGuests) {
            return [];
        }

        $params = [];
        $where  = [];
        foreach ($clean as $i => $phone) {
            $key = ':p' . $i;
            $where[] = 'user_phone = ' . $key;
            $params[$key] = $phone;
        }
        if ($includeGuests) {
            $where[] = "user_phone = ''";
        }

        $sql  = 'SELECT * FROM device_tokens WHERE is_active = 1 AND (' . implode(' OR ', $where) . ') ORDER BY id DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }
}

/** تعداد دستگاه‌های ثبت‌شده */
function eplakFcmCount(PDO $pdo, bool $onlyActive = true): int
{
    try {
        $sql = 'SELECT COUNT(*) FROM device_tokens' . ($onlyActive ? ' WHERE is_active = 1' : '');
        return (int) $pdo->query($sql)->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
}

/** حذف توکن (وقتی کاربر اعلان را خاموش می‌کند) */
function eplakFcmDeleteToken(PDO $pdo, string $token): void
{
    try {
        $stmt = $pdo->prepare('DELETE FROM device_tokens WHERE token = :token');
        $stmt->execute([':token' => trim($token)]);
    } catch (\Throwable $e) {
        /* بی‌صدا */
    }
}

/** خطاهایی که یعنی «این دستگاه دیگر معتبر نیست» و باید غیرفعال شود */
function eplakFcmErrorIsFatal(string $status, int $httpCode): bool
{
    $status = strtoupper(trim($status));
    if (in_array($status, ['UNREGISTERED', 'NOT_FOUND', 'SENDER_ID_MISMATCH'], true)) {
        return true;
    }
    return $httpCode === 404;
}

/** نشانی ارسال پیام FCM (HTTP v1) برای یک پروژه */
function eplakFcmEndpoint(string $projectId): string
{
    return 'https://fcm.googleapis.com/v1/projects/' . rawurlencode($projectId) . '/messages:send';
}

/** ارسال به یک دستگاه. خروجی: ['ok'=>bool, 'fatal'=>bool, 'error'=>string] */
function eplakFcmSendOne(PDO $pdo, array $device, string $accessToken, string $projectId, string $title, string $body, array $extra = [], int $timeout = 15): array
{
    $out = ['ok' => false, 'fatal' => false, 'error' => '', 'http' => 0];

    $token = trim((string) ($device['token'] ?? ''));
    if ($token === '') {
        $out['error'] = 'توکن دستگاه خالی است.';
        $out['fatal'] = true;
        return $out;
    }

    /* داده‌های همراه پیام باید رشته باشند */
    $data = [
        'url' => (string) ($extra['url'] ?? 'index.html'),
    ];
    if (isset($extra['id'])) {
        $data['id'] = (string) $extra['id'];
    }
    if (isset($extra['tag'])) {
        $data['tag'] = (string) $extra['tag'];
    }

    $message = [
        'message' => [
            'token'        => $token,
            'notification' => ['title' => $title, 'body' => $body],
            'android'      => [
                'priority'     => 'high',
                'notification' => [
                    'channel_id' => 'eplak_alerts',
                    'sound'      => 'default',
                    /* اولویت بالا: اعلان در حالت خواب/بسته بودن اپ هم فوراً می‌رسد */
                    'notification_priority' => 'PRIORITY_HIGH',
                    /* توجه: click_action عمداً تنظیم نمی‌شود. اگر اکشن داده شود و
                       اپ فیلتر intent متناظر را نداشته باشد، اندروید اعلان را
                       کلاً نمایش نمی‌دهد (همین باعث می‌شد اعلان در حالت بسته
                       بودن اپ نرسد). بدون click_action، لمس اعلان خود اپ را
                       باز می‌کند که همان نتیجه‌ی مطلوب است. */
                ],
            ],
            'apns'         => [
                'headers' => ['apns-priority' => '10'],
            ],
            'data'     => $data,
        ],
    ];

    $response = eplakHttpPost(
        eplakFcmEndpoint($projectId),
        [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json; charset=utf-8',
        ],
        (string) json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $timeout
    );
    $out['http'] = (int) $response['status'];

    if ($response['status'] === 200) {
        $out['ok'] = true;
        return $out;
    }

    $status = '';
    $detail = '';
    $code   = '';
    $parsed = json_decode((string) $response['body'], true);
    if (is_array($parsed) && isset($parsed['error']) && is_array($parsed['error'])) {
        $status = (string) ($parsed['error']['status'] ?? '');
        $detail = (string) ($parsed['error']['message'] ?? '');
        /* کد دقیق FCM در details (type.googleapis.com/google.firebase.fcm.v1.FcmError):
           UNREGISTERED / SENDER_ID_MISMATCH / INVALID_ARGUMENT / … — status کلی‌تر است
           (مثلاً برای SenderId mismatch فقط PERMISSION_DENIED می‌گوید). */
        foreach ((array) ($parsed['error']['details'] ?? []) as $d) {
            if (is_array($d) && !empty($d['errorCode'])) {
                $code = strtoupper((string) $d['errorCode']);
                break;
            }
        }
    }
    if ($code === '' && preg_replace('/[\s_-]+/', '', strtoupper($detail)) === 'SENDERIDMISMATCH') {
        $code = 'SENDER_ID_MISMATCH';
    }
    $out['code'] = $code;

    $out['error'] = trim(($response['status'] ? 'HTTP ' . $response['status'] . ' ' : '') . $status . ' ' . $detail);
    if ($out['error'] === '') {
        $out['error'] = $response['error'] !== '' ? $response['error'] : 'خطای نامشخص در ارسال به گوگل';
    }
    $out['fatal'] = eplakFcmErrorIsFatal($status, (int) $response['status']) || eplakFcmErrorIsFatal($code, (int) $response['status']);
    if ($code === 'SENDER_ID_MISMATCH') {
        /* سرنوشت این خطا (توکنِ کهنه یا کلیدِ اشتباه) در eplakFcmSend تصمیم گرفته می‌شود */
        $out['fatal'] = false;
    }

    return $out;
}

/**
 * ارسال اعلان به چند دستگاه.
 * خروجی: ['sent'=>int, 'failed'=>int, 'errors'=>array, 'skipped'=>string,
 *         'skipped_kind'=>'config'|'network'|'auth'|'', 'devices'=>int]
 *
 *  skipped        اگر پر باشد یعنی هیچ پیامی به گوگل داده نشد و دلیلش همین متن است.
 *  skipped_kind   config = کلید فایربیس تنظیم نشده · network = سرور به گوگل نمی‌رسد ·
 *                 auth = گوگل کلید را نپذیرفت.
 */
function eplakFcmSend(PDO $pdo, array $devices, string $title, string $body, array $extra = [], int $timeout = 12): array
{
    $result = ['sent' => 0, 'failed' => 0, 'errors' => [], 'skipped' => '', 'skipped_kind' => '', 'devices' => count($devices)];

    if (!$devices) {
        return $result;
    }

    $cfg = eplakFcmConfig($pdo);
    if (!$cfg['ready']) {
        $result['skipped']      = $cfg['error'];
        $result['skipped_kind'] = 'config';
        return $result;
    }

    /* توکن کش‌شده یا تازه؛ اگر گوگل بعداً ۴۰۱ داد، همان‌جا یک‌بار تازه می‌شود
       (دیگر پس از هر شکست، بی‌دلیل دوباره از گوگل توکن نمی‌گیریم). */
    $auth = eplakFcmAccessToken($pdo, false, $timeout);
    if ($auth['token'] === '') {
        $result['skipped']      = $auth['error'];
        $result['skipped_kind'] = !empty($auth['network']) ? 'network' : 'auth';
        return $result;
    }
    $accessToken = $auth['token'];
    $refreshed   = false;
    $netFailure  = '';

    foreach ($devices as $device) {
        if ($netFailure !== '') {
            /* به گوگل نرسیدیم؛ تلاش برای بقیه‌ی گوشی‌ها فقط وقت را (چند برابرِ مهلت) تلف می‌کند */
            $result['failed']++;
            $result['errors'][] = $netFailure;
            continue;
        }

        /* گوشی خودش گفته با کدام پروژه‌ی فایربیس ساخته شده؛ اگر با پروژه‌ی کلید
           یکی نباشد، گوگل قطعاً «SenderId mismatch» می‌دهد — پس بی‌جهت به گوگل
           نمی‌رویم و همان دلیل دقیق را روی ردیف دستگاه می‌نویسیم.
             • کلید از پروژه‌ی دیگری است (project_match=false) ⇒ اشتباه از کلید است؛ توکن فعال
               می‌ماند و با عوض شدن کلید همین توکن دوباره کار می‌کند.
             • کلید همان پروژه‌ی APK فعلی است (project_match=true) ⇒ این گوشی هنوز APK قدیمی
               (پروژه‌ی قبلی) را دارد؛ توکنش برای پروژه‌ی تازه هرگز کار نمی‌کند ⇒ غیرفعال می‌شود
               تا هر ارسال، یک «ناموفق» بی‌دلیل نسازد. با نصب/باز شدن APK جدید توکن تازه ثبت می‌شود. */
        $deviceProject = eplakFcmCleanProjectId((string) ($device['app_project'] ?? ''));
        if ($deviceProject !== '' && $deviceProject !== (string) $cfg['project_id']) {
            $stale = ($cfg['project_match'] === true);
            if ($stale) {
                $mismatch = 'SENDER_ID_MISMATCH: توکن از نسخه‌ی قدیمی اپ (پروژه‌ی «' . $deviceProject . '») است؛ کلید فعلی برای پروژه‌ی APK جدید «'
                    . $cfg['project_id'] . '» درست است — کاربر باید APK جدید را نصب و باز کند تا دوباره ثبت شود';
            } else {
                $mismatch = 'SENDER_ID_MISMATCH: اپ با پروژه‌ی «' . $deviceProject . '» ساخته شده ولی کلید سرویس برای پروژه‌ی «' . $cfg['project_id'] . '» است';
            }
            $result['failed']++;
            $result['errors'][] = $mismatch;
            try {
                $upd = $pdo->prepare($stale
                    ? 'UPDATE device_tokens SET is_active = 0, last_error = :err, fail_count = fail_count + 1 WHERE id = :id'
                    : 'UPDATE device_tokens SET last_error = :err, fail_count = fail_count + 1 WHERE id = :id');
                $upd->execute([':err' => mb_substr($mismatch, 0, 250, 'UTF-8'), ':id' => (int) $device['id']]);
            } catch (\Throwable $e) {}
            continue;
        }

        $one = eplakFcmSendOne($pdo, $device, $accessToken, $cfg['project_id'], $title, $body, $extra, $timeout);

        if (!$one['ok'] && (int) ($one['http'] ?? 0) === 401 && !$refreshed) {
            /* توکن دسترسی کش‌شده باطل شده است */
            $refreshed = true;
            $fresh = eplakFcmAccessToken($pdo, true, $timeout);
            if ($fresh['token'] !== '') {
                $accessToken = $fresh['token'];
                $one = eplakFcmSendOne($pdo, $device, $accessToken, $cfg['project_id'], $title, $body, $extra, $timeout);
            }
        }

        if ($one['ok']) {
            $result['sent']++;
            try {
                $upd = $pdo->prepare('UPDATE device_tokens SET fail_count = 0, last_error = "" WHERE id = :id');
                $upd->execute([':id' => (int) $device['id']]);
            } catch (\Throwable $e) {}
            continue;
        }

        /* گوگل خودش «SenderId mismatch» داد (گوشی پروژه‌اش را گزارش نکرده بود یا هم‌خوان بود):
             • کلید همان پروژه‌ی APK فعلی است ⇒ توکن از نسخه/پروژه‌ی قدیمی اپ مانده و دیگر هرگز
               کار نمی‌کند ⇒ غیرفعال می‌شود (با باز شدن APK جدید، توکن تازه ثبت می‌شود).
             • کلید از پروژه‌ی دیگری است ⇒ اشتباه از کلید است، نه گوشی ⇒ توکن فعال می‌ماند و
               دلیل دقیق روی ردیف می‌نشیند تا مدیر کلید را عوض کند. */
        if (($one['code'] ?? '') === 'SENDER_ID_MISMATCH') {
            if ($cfg['project_match'] !== false && $deviceProject === '') {
                $one['fatal'] = true;
                $one['error'] = 'SENDER_ID_MISMATCH: توکن از نسخه/پروژه‌ی قدیمی اپ است (کلید فعلی برای پروژه‌ی «' . $cfg['project_id'] . '» درست است)؛ کاربر باید APK جدید را باز کند تا دوباره ثبت شود';
            } else {
                $one['fatal'] = false;
                $one['error'] = 'SENDER_ID_MISMATCH: اپ با پروژه‌ی «' . ($deviceProject !== '' ? $deviceProject : $cfg['app_project'])
                    . '» ساخته شده ولی کلید سرویس برای پروژه‌ی «' . $cfg['project_id'] . '» است (پاسخ گوگل: ' . $one['error'] . ')';
            }
        }

        $result['failed']++;
        $result['errors'][] = $one['error'];
        if ((int) ($one['http'] ?? 0) === 0 && empty($one['fatal'])) {
            $netFailure = (string) $one['error'];
        }

        try {
            if ($one['fatal']) {
                $upd = $pdo->prepare('UPDATE device_tokens SET is_active = 0, last_error = :err, fail_count = fail_count + 1 WHERE id = :id');
            } else {
                $upd = $pdo->prepare('UPDATE device_tokens SET last_error = :err, fail_count = fail_count + 1 WHERE id = :id');
            }
            $upd->execute([':err' => mb_substr($one['error'], 0, 250, 'UTF-8'), ':id' => (int) $device['id']]);
        } catch (\Throwable $e) {}
    }

    return $result;
}

/**
 * توضیح فارسیِ قابل‌فهم برای خطای گوگل/شبکه.
 * مدیر پنل به هاست دسترسی ندارد؛ این جمله به او می‌گوید «مشکل دقیقاً کجاست و چه کنم».
 */
function eplakFcmExplainError(string $error): string
{
    $e = strtoupper($error);

    if ($e === '') {
        return '';
    }
    if (strpos($e, 'UNREGISTERED') !== false || strpos($e, 'NOT_FOUND') !== false || strpos($e, 'HTTP 404') !== false) {
        return 'توکن این گوشی دیگر معتبر نیست (برنامه حذف/دوباره نصب شده). کاربر باید یک‌بار اپ را باز کند و وارد شود تا دوباره ثبت شود.';
    }
    /* گوگل این خطا را به چند شکل می‌نویسد: «SenderId mismatch» (متن واقعی پاسخ ۴۰۳)،
       «SENDER_ID_MISMATCH» (کد خطای قدیمی) … همه یعنی یک چیز: کلید از پروژه‌ی دیگری است. */
    $compact = preg_replace('/[\s_-]+/', '', $e) ?? $e;
    if (strpos($compact, 'SENDERIDMISMATCH') !== false && (strpos($error, 'نسخه/پروژه‌ی قدیمی اپ') !== false || strpos($error, 'نسخه‌ی قدیمی اپ') !== false)) {
        /* کلید درست است؛ خودِ گوشی هنوز APK قدیمی (پروژه‌ی قبلی) را دارد */
        $app = eplakFcmAppProject();
        return 'این گوشی هنوز نسخه‌ی قدیمی اپ را دارد که با پروژه‌ی قبلی فایربیس ساخته شده بود؛ توکنش برای پروژه‌ی فعلی («' . $app['project_id']
            . '») کار نمی‌کند و غیرفعال شد. کلید سرویس درست است — کاربر باید APK جدید را نصب و یک‌بار باز کند تا گوشی دوباره ثبت شود.';
    }
    if (strpos($compact, 'SENDERIDMISMATCH') !== false) {
        $app = eplakFcmAppProject();
        return 'کلید سرویس فایربیس برای پروژه‌ی دیگری است و اپ اندروید (APK) با پروژه‌ی «' . $app['project_id']
            . '» ساخته شده؛ گوگل ارسال را با «SenderId mismatch» رد می‌کند. در Firebase Console پروژه‌ی «'
            . $app['project_id'] . '» → Project settings → Service accounts → Generate new private key را بزنید و فایل تازه را در پنل → تنظیمات → «کلید سرویس فایربیس» بچسبانید.';
    }
    if (strpos($e, 'SERVICE_DISABLED') !== false || strpos($e, 'HAS NOT BEEN USED') !== false || strpos($e, 'IS DISABLED') !== false) {
        return 'سرویس Firebase Cloud Messaging API در پروژه‌ی گوگل فعال نیست. در Google Cloud Console → APIs → «Firebase Cloud Messaging API» را Enable کنید.';
    }
    if (strpos($e, 'PERMISSION_DENIED') !== false || strpos($e, 'HTTP 403') !== false) {
        return 'گوگل اجازه‌ی ارسال نداد. معمولاً یعنی کلید سرویس نقش «Firebase Cloud Messaging Admin» ندارد یا مربوط به پروژه‌ی دیگری است.';
    }
    if (strpos($e, 'INVALID_GRANT') !== false || strpos($e, 'INVALID_CLIENT') !== false || strpos($e, 'INVALID_SIGNATURE') !== false || strpos($e, 'JWT') !== false) {
        return 'گوگل کلید سرویس را نپذیرفت (کلید باطل/حذف‌شده است یا ساعت سرور درست نیست). یک کلید تازه بسازید و در تنظیمات بچسبانید.';
    }
    if (strpos($e, 'HTTP 401') !== false || strpos($e, 'UNAUTHENTICATED') !== false) {
        return 'گوگل هویت درخواست را تأیید نکرد؛ کلید سرویس را دوباره بسازید و در تنظیمات ذخیره کنید.';
    }
    if (strpos($e, 'QUOTA') !== false || strpos($e, 'HTTP 429') !== false) {
        return 'سقف ارسال گوگل پر شده است؛ چند دقیقه بعد دوباره امتحان کنید.';
    }
    if (strpos($e, 'INVALID_ARGUMENT') !== false || strpos($e, 'HTTP 400') !== false) {
        return 'گوگل درخواست یا توکن گوشی را نامعتبر دانست. کاربر باید اپ را دوباره باز کند تا توکن تازه ثبت شود.';
    }
    if (strpos($e, 'HTTP 5') !== false || strpos($e, 'UNAVAILABLE') !== false || strpos($e, 'INTERNAL') !== false) {
        return 'سرویس گوگل موقتاً در دسترس نبود؛ دوباره امتحان کنید.';
    }
    if (preg_match('/\(کد 5\d\d\)/u', $error)) {
        return 'سرویس گوگل موقتاً در دسترس نبود؛ دوباره امتحان کنید.';
    }
    if (strpos($e, 'ارتباط سرور با گوگل') !== false
        || strpos($e, 'TIMED OUT') !== false || strpos($e, 'TIMEOUT') !== false
        || strpos($e, 'RESOLVE HOST') !== false || strpos($e, 'COULD NOT RESOLVE') !== false
        || strpos($e, 'CONNECTION') !== false || strpos($e, 'CURL') !== false
        || strpos($e, 'SSL') !== false || strpos($e, 'گرفتن توکن دسترسی گوگل') !== false) {
        return 'سرور سایت به گوگل (fcm.googleapis.com / oauth2.googleapis.com) دسترسی ندارد. این یک محدودیت شبکه‌ی هاست است (فایروال/فیلتر/DNS)؛ از پشتیبانی هاست بخواهید خروجی HTTPS به دامنه‌های گوگل را باز کند.';
    }
    return '';
}

/**
 * نتیجه‌ی ارسال به دستگاه‌های یک شماره را به یک خلاصه‌ی استاندارد تبدیل می‌کند.
 *
 * outcome:
 *   sent         همه‌ی دستگاه‌ها پیام را به گوگل سپردند
 *   partial      بعضی بله، بعضی نه
 *   failed       گوگل همه را رد کرد
 *   no_device    هیچ گوشی‌ای برای این شماره ثبت نیست (اپ هنوز توکن نفرستاده)
 *   fcm_off      کلید سرویس فایربیس در پنل تنظیم نشده
 *   google_error سرور به گوگل نرسید یا گوگل کلید را نپذیرفت
 */
function eplakFcmSummarize(array $send, int $deviceCount): array
{
    $sent   = (int) ($send['sent'] ?? 0);
    $failed = (int) ($send['failed'] ?? 0);
    $error  = '';

    if (!empty($send['errors'])) {
        $error = (string) $send['errors'][0];
    }

    if ($deviceCount <= 0) {
        $outcome = 'no_device';
        $hint    = 'هیچ گوشی‌ای از این کاربر در سرور ثبت نشده است؛ کاربر باید یک‌بار اپ (آخرین نسخه) را باز کند و با شماره‌اش وارد شود.';
    } elseif (!empty($send['skipped'])) {
        $kind    = (string) ($send['skipped_kind'] ?? '');
        $error   = (string) $send['skipped'];
        $outcome = $kind === 'config' ? 'fcm_off' : 'google_error';
        $hint    = $kind === 'config'
            ? 'کلید سرویس فایربیس در پنل (تنظیمات ← اعلان فایربیس) تنظیم نشده است.'
            : (eplakFcmExplainError($error) ?: 'ارسال به گوگل ممکن نشد.');
    } elseif ($sent > 0 && $failed === 0) {
        $outcome = 'sent';
        $hint    = '';
    } elseif ($sent > 0) {
        $outcome = 'partial';
        $hint    = eplakFcmExplainError($error);
    } else {
        $outcome = 'failed';
        $hint    = eplakFcmExplainError($error) ?: 'گوگل ارسال را نپذیرفت.';
    }

    return [
        'outcome' => $outcome,
        'devices' => $deviceCount,
        'sent'    => $sent,
        'failed'  => $failed,
        'error'   => mb_substr($error, 0, 400, 'UTF-8'),
        'hint'    => $hint,
    ];
}

/**
 * حذف نویسه‌های «چهاربایتی» یونیکد (ایموجی‌هایی مثل 📣 و 👍).
 * اگر جدول دیتابیس با utf8 سه‌بایتی ساخته شده باشد (پیش‌فرض بعضی هاست‌ها)،
 * ذخیره‌ی این نویسه‌ها خطا می‌دهد؛ و چون خطا بی‌صدا گرفته می‌شد، اعلانِ پاسخ
 * مدیر (که با 📣 شروع می‌شود) اصلاً ساخته نمی‌شد. این تابع برای «تلاش دوباره‌ی
 * امن» است.
 */
if (!function_exists('eplakStripAstralChars')) {
    function eplakStripAstralChars(string $text): string
    {
        $clean = preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $text);
        return $clean === null ? $text : trim((string) preg_replace('/\s{2,}/u', ' ', $clean));
    }
}

/**
 * ثبت نتیجه‌ی هر ارسال در «push_log».
 * ادمین از روی همین ردیف‌ها می‌بیند چرا اعلانِ «در حال رسیدگی/انجام شد» به گوشی
 * رسیده یا نرسیده است، بدون اینکه به لاگ هاست دسترسی داشته باشد.
 * هرگز استثنا پرتاب نمی‌کند (ثبت لاگ نباید ارسال اعلان را خراب کند).
 */
function eplakPushLogAdd(PDO $pdo, array $row): int
{
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO push_log (notification_id, user_phone, kind, code, title, channel, devices, sent, failed, outcome, error)
             VALUES (:nid, :phone, :kind, :code, :title, :channel, :devices, :sent, :failed, :outcome, :error)'
        );
        $params = [
            ':nid'     => (int) ($row['notification_id'] ?? 0),
            ':phone'   => mb_substr((string) ($row['user_phone'] ?? ''), 0, 20, 'UTF-8'),
            ':kind'    => mb_substr((string) ($row['kind'] ?? ''), 0, 30, 'UTF-8'),
            ':code'    => mb_substr((string) ($row['code'] ?? ''), 0, 40, 'UTF-8'),
            ':title'   => mb_substr((string) ($row['title'] ?? ''), 0, 250, 'UTF-8'),
            ':channel' => mb_substr((string) ($row['channel'] ?? 'fcm'), 0, 20, 'UTF-8'),
            ':devices' => (int) ($row['devices'] ?? 0),
            ':sent'    => (int) ($row['sent'] ?? 0),
            ':failed'  => (int) ($row['failed'] ?? 0),
            ':outcome' => mb_substr((string) ($row['outcome'] ?? ''), 0, 30, 'UTF-8'),
            ':error'   => mb_substr((string) ($row['error'] ?? ''), 0, 400, 'UTF-8'),
        ];
        try {
            $stmt->execute($params);
        } catch (\Throwable $e) {
            /* جدول utf8 سه‌بایتی + ایموجی چهاربایتی در عنوان ← بدون ایموجی دوباره */
            $params[':title'] = eplakStripAstralChars($params[':title']);
            $params[':error'] = eplakStripAstralChars($params[':error']);
            $stmt = $pdo->prepare(
                'INSERT INTO push_log (notification_id, user_phone, kind, code, title, channel, devices, sent, failed, outcome, error)
                 VALUES (:nid, :phone, :kind, :code, :title, :channel, :devices, :sent, :failed, :outcome, :error)'
            );
            $stmt->execute($params);
        }
        /* فقط ۴۰۰ ردیف آخر نگه داشته می‌شود تا جدول بی‌پایان بزرگ نشود */
        $id = (int) $pdo->lastInsertId();
        if ($id > 400 && $id % 50 === 0) {
            $pdo->exec('DELETE FROM push_log WHERE id < ' . ($id - 400));
        }
        return $id;
    } catch (\Throwable $e) {
        error_log('[eplak-push-log] ' . $e->getMessage());
        return 0;
    }
}

/** آخرین ردیف‌های push_log؛ فیلتر اختیاری: phone و/یا code */
function eplakPushLogRecent(PDO $pdo, array $filter = [], int $limit = 8): array
{
    try {
        $where  = [];
        $params = [];
        if (!empty($filter['phone'])) {
            $where[]           = 'user_phone = :phone';
            $params[':phone']  = (string) $filter['phone'];
        }
        if (!empty($filter['code'])) {
            $where[]          = 'code = :code';
            $params[':code']  = (string) $filter['code'];
        }
        $sql = 'SELECT * FROM push_log' . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY id DESC LIMIT ' . max(1, min(100, $limit));
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    } catch (\Throwable $e) {
        return [];
    }
}

/** پروژه‌هایی که گوشی‌های فعال خودشان گزارش کرده‌اند: ['project_id' => تعداد] */
function eplakFcmReportedProjects(PDO $pdo): array
{
    if (!eplakFcmProjectColumnReady($pdo)) return [];
    try {
        $stmt = $pdo->query("SELECT app_project, COUNT(*) AS n FROM device_tokens WHERE is_active = 1 AND app_project <> '' GROUP BY app_project ORDER BY n DESC");
        $out = [];
        foreach ($stmt->fetchAll() ?: [] as $row) {
            $proj = eplakFcmCleanProjectId((string) ($row['app_project'] ?? ''));
            if ($proj !== '') $out[$proj] = (int) ($row['n'] ?? 0);
        }
        return $out;
    } catch (\Throwable $e) {
        return [];
    }
}

/**
 * عیب‌یابی زنجیره‌ی اعلان، گام‌به‌گام و بدون نیاز به هیچ گوشی:
 *   ۱) کلید سرویس فایربیس   ۲) اتصال به گوگل و گرفتن مجوز   ۳) اتصال به سرویس
 *   ارسال فایربیس (درخواست «آزمایشی» validate_only؛ هیچ پیامی ارسال نمی‌شود)
 *   ۴) گوشی‌های ثبت‌شده.
 * هر گام: ['name'=>…, 'ok'=>bool, 'detail'=>…, 'hint'=>…]
 */
function eplakFcmDiagnose(PDO $pdo): array
{
    $steps = [];
    $add = static function (string $name, bool $ok, string $detail = '', string $hint = '') use (&$steps): void {
        $steps[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail, 'hint' => $hint];
    };

    $cfg = eplakFcmConfig($pdo);
    $add('کلید سرویس فایربیس در پنل', $cfg['ready'], $cfg['ready'] ? 'پروژه: ' . $cfg['project_id'] : $cfg['error'],
        $cfg['ready'] ? '' : 'کلید JSON را در همین صفحه (بخش «کلید سرویس فایربیس») بچسبانید و ذخیره کنید.');
    if (!$cfg['ready']) {
        return $steps;
    }

    /* مهم‌ترین گام: کلید باید از همان پروژه‌ای باشد که APK با آن ساخته شده.
       گام‌های بعدی (مجوز، سرویس ارسال) با کلیدِ پروژه‌ی اشتباه هم «سبز» می‌شوند؛
       فقط موقع ارسال واقعی، گوگل «SenderId mismatch» می‌دهد. */
    $match  = $cfg['project_match'] !== false;
    $detail = 'کلید: ' . $cfg['project_id'] . ' · اپ اندروید (APK): ' . $cfg['app_project'];
    $reported = eplakFcmReportedProjects($pdo);
    if ($reported) {
        $parts = [];
        foreach ($reported as $proj => $n) $parts[] = $proj . ' (' . $n . ' گوشی)';
        $detail .= ' · گزارش خودِ گوشی‌ها: ' . implode('، ', $parts);
        foreach ($reported as $proj => $n) {
            if ($proj !== $cfg['project_id']) $match = false;
        }
    }
    $add('هم‌خوانی پروژه‌ی کلید با پروژه‌ی اپ اندروید', $match, $detail,
        $match ? '' : eplakFcmProjectMismatchText($cfg['project_id'], $cfg['app_project']));

    $auth = eplakFcmAccessToken($pdo, true, 12);
    $authOk = $auth['token'] !== '';
    $add('اتصال به گوگل و گرفتن مجوز (oauth2.googleapis.com)', $authOk,
        $authOk ? 'برقرار است' : $auth['error'],
        $authOk ? '' : eplakFcmExplainError($auth['error']));
    if (!$authOk) {
        return $steps;
    }

    /* درخواست «خشک» (validate_only) با توکنی که عمداً ساختگی است: گوگل مجوز، فعال‌بودن
       API و پروژه را می‌سنجد ولی هیچ پیامی نمی‌فرستد. پاسخ‌های ۴۰۰/۴۰۴ «توکن ساختگی
       است» یعنی همه‌چیز تا اینجا سالم است. */
    $body = (string) json_encode([
        'validate_only' => true,
        'message'       => [
            'token'        => 'eplak-diagnose-' . str_repeat('x', 140),
            'notification' => ['title' => 'diagnose', 'body' => 'diagnose'],
        ],
    ], JSON_UNESCAPED_SLASHES);
    $resp = eplakHttpPost(
        eplakFcmEndpoint($cfg['project_id']),
        ['Authorization: Bearer ' . $auth['token'], 'Content-Type: application/json; charset=utf-8'],
        $body,
        12
    );
    $http = (int) $resp['status'];
    $raw  = '';
    $parsed = json_decode((string) $resp['body'], true);
    if (is_array($parsed) && isset($parsed['error']) && is_array($parsed['error'])) {
        $raw = trim((string) ($parsed['error']['status'] ?? '') . ' ' . (string) ($parsed['error']['message'] ?? ''));
    }
    if ($http === 200 || $http === 400 || $http === 404) {
        $add('اتصال به سرویس ارسال فایربیس (fcm.googleapis.com)', true,
            'برقرار است (HTTP ' . $http . ($raw !== '' ? ' — ' . mb_substr($raw, 0, 120, 'UTF-8') : '') . ')');
    } else {
        $err = $http > 0 ? ('HTTP ' . $http . ' ' . $raw) : (string) $resp['error'];
        $add('اتصال به سرویس ارسال فایربیس (fcm.googleapis.com)', false, mb_substr(trim($err), 0, 250, 'UTF-8'),
            eplakFcmExplainError($err) ?: 'پاسخ غیرمنتظره از گوگل.');
    }

    $active = eplakFcmCount($pdo);
    $add('گوشی‌های ثبت‌شده‌ی اپ', $active > 0, $active . ' گوشی فعال',
        $active > 0 ? '' : 'هیچ گوشی‌ای ثبت نیست: کاربران باید اپ را (آخرین نسخه) باز کنند و با شماره‌شان وارد شوند.');

    return $steps;
}

/** ارسال آزمایشی به دستگاه‌های یک شماره */
function eplakFcmNotifyPhone(PDO $pdo, string $phone, string $title, string $body, array $extra = []): array
{
    return eplakFcmSend($pdo, eplakFcmTokens($pdo, [$phone]), $title, $body, $extra);
}

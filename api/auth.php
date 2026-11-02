<?php
require_once __DIR__ . '/_common.php';
/* تنها ارائه‌دهنده‌ی پیامکِ پروژه: «ملی پیامک» (shared/payamak.php).
   آموت‌اس‌ام‌اس به درخواست کارفرما کاملاً حذف شده است. */
require_once __DIR__ . '/../shared/payamak.php';

eplakApiHeaders();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    eplakJsonError('روش درخواست پشتیبانی نمی‌شود.', 405);
}

$input = eplakRequestInput();
$action = (string)($_GET['action'] ?? $input['action'] ?? '');
$pdo = eplakGetPdo();
$sqlite = eplakIsSqlite($pdo);

if ($sqlite) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS otp_challenges (
        challenge_id TEXT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        source_hash VARCHAR(64) NOT NULL,
        code_hash VARCHAR(255) NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_created ON otp_challenges (phone, created_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_otp_challenges_source_created ON otp_challenges (source_hash, created_at)');
} else {
    $pdo->exec("CREATE TABLE IF NOT EXISTS otp_challenges (
        challenge_id VARCHAR(64) PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        source_hash VARCHAR(64) NOT NULL,
        code_hash VARCHAR(255) NOT NULL DEFAULT '',
        attempts INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        INDEX idx_otp_challenges_phone_created (phone, created_at),
        INDEX idx_otp_challenges_source_created (source_hash, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

$now = time();
/* استفاده از ساعت ملی (تهران) برای بررسی انقضا */
$iranNow = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tehran')))->getTimestamp();
$pdo->prepare('DELETE FROM otp_challenges WHERE expires_at < :cutoff')
    ->execute([':cutoff' => $iranNow - 86400]);

if ($action === 'send') {
    $phone = eplakNormalizePhone($input['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر نیست.', 400);
    }

    $fileConfig = [];
    $configPath = dirname(__DIR__) . '/shared/config.php';
    if (is_file($configPath)) {
        $loaded = include $configPath;
        if (is_array($loaded)) {
            $fileConfig = $loaded;
        }
    }
    $host = strtolower((string)parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
    $remoteAddress = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    $testCode = trim((string)($fileConfig['otp_test_code'] ?? ''));
    $isLocalTest = $testCode !== ''
        && in_array($host, ['localhost', '127.0.0.1', '::1'], true)
        && in_array($remoteAddress, ['127.0.0.1', '::1'], true);
    if ($isLocalTest && !preg_match('/^\d{4}$/', $testCode)) {
        error_log('[eplak-otp] Local OTP test code must contain exactly four digits.');
        eplakJsonError('تنظیم کد آزمایشی محلی معتبر نیست.', 503);
    }

    $sourceHash = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    if (!$isLocalTest) {
        $rate = $pdo->prepare('SELECT COUNT(*) FROM otp_challenges WHERE phone = :phone AND created_at >= :since');
        $rate->execute([':phone' => $phone, ':since' => $iranNow - 600]);
        if ((int)$rate->fetchColumn() >= 3) {
            eplakJsonError('تعداد درخواست کد زیاد است؛ چند دقیقه دیگر دوباره تلاش کنید.', 429);
        }
        $lastRequest = $pdo->prepare('SELECT MAX(created_at) FROM otp_challenges WHERE phone = :phone');
        $lastRequest->execute([':phone' => $phone]);
        $lastRequestAt = (int)$lastRequest->fetchColumn();
        $resendWait = 120 - ($iranNow - $lastRequestAt);
        if ($lastRequestAt > 0 && $resendWait > 0) {
            eplakJsonError('برای درخواست کد تازه، ' . $resendWait . ' ثانیه دیگر صبر کنید.', 429);
        }
        $ipRate = $pdo->prepare('SELECT COUNT(*) FROM otp_challenges WHERE source_hash = :source AND created_at >= :since');
        $ipRate->execute([':source' => $sourceHash, ':since' => $iranNow - 600]);
        if ((int)$ipRate->fetchColumn() >= 10) {
            eplakJsonError('تعداد درخواست کد از این اتصال زیاد است؛ کمی بعد دوباره تلاش کنید.', 429);
        }
    }

    $payamakUsername = trim((string)(getenv('PAYAMAK_USERNAME') ?: ($fileConfig['payamak_username'] ?? '')));
    /* «کلید API» ملی پیامک همان مقداری است که باید در فیلد passwordِ وب‌سرویس
       فرستاده شود؛ رمز عبورِ پنل با خطای ۱۱۰- («الزام استفاده از ApiKey») رد
       می‌شود. ترتیبِ خواندن یک‌جا در shared/payamak.php است:
       PAYAMAK_API_KEY ← payamak_api_key ← PAYAMAK_PASSWORD ← payamak_password
       یعنی تنظیمِ قدیمیِ هاست (payamak_password) هم بی‌تغییر کار می‌کند. */
    $payamakPassword = eplakPayamakSecret($fileConfig);
    $payamakSecretSource = eplakPayamakSecretSource($fileConfig);
    /* شناسه‌ی «متن تأییدشده» (bodyId) ملی پیامک. اگر در تنظیمات خالی باشد،
       شناسه‌ی پیش‌فرضِ پروژه (573639) استفاده می‌شود تا روی هاست تازه
       «کد تایید» بی‌دلیل از کار نیفتد. */
    $payamakTemplateId = trim((string)(getenv('PAYAMAK_TEMPLATE_ID') ?: ($fileConfig['payamak_template_id'] ?? '')));
    if ($payamakTemplateId === '') {
        $payamakTemplateId = eplakPayamakDefaultTemplate();
    }
    $hasPayamakCredentials = $payamakUsername !== '' && $payamakPassword !== '';
    $payamakEnabled = $hasPayamakCredentials && preg_match('/^\d+$/', $payamakTemplateId) === 1;

    if (!$isLocalTest && ($payamakUsername !== '') !== ($payamakPassword !== '')) {
        /* نیمه‌تنظیم‌شده از تنظیم‌نشده بدتر است: کاربر فکر می‌کند کار تمام است */
        error_log('[eplak-otp] Melli Payamak half-configured (username=' . ($payamakUsername !== '' ? 'set' : 'empty')
            . ' secret=' . ($payamakSecretSource !== '' ? $payamakSecretSource : 'empty') . ').');
        eplakJsonError('تنظیمات پنل ملی پیامک کامل نیست: نام کاربری و «کلید API» هر دو لازم‌اند.', 503);
    }

    if (!$isLocalTest && $hasPayamakCredentials && !$payamakEnabled) {
        error_log('[eplak-otp] A numeric Melli Payamak template ID (bodyId) must be configured.');
        eplakJsonError('شناسه متن تأییدشده پنل ملی پیامک باید رقمی باشد.', 503);
    }

    if (!$isLocalTest && !function_exists('curl_init')) {
        error_log('[eplak-otp] PHP cURL extension is not available.');
        eplakJsonError('امکان اتصال به سامانه پیامک روی سرور فعال نیست.', 503);
    }

    /* تنها مسیرِ ارسال، ملی پیامک است؛ پس اگر آماده نباشد دلیلش صریح گفته
       می‌شود (نه پیامِ کلی «پیکربندی نشده») تا هم در اپ و هم در api/status.php
       و هم در setup.php همان یک جمله دیده شود. */
    if (!$isLocalTest && !$payamakEnabled) {
        error_log('[eplak-otp] Melli Payamak is not configured (username=' . ($payamakUsername !== '' ? 'set' : 'empty')
            . ' secret=' . ($payamakSecretSource !== '' ? $payamakSecretSource : 'empty') . ').');
        eplakJsonError('پنل ملی پیامک تنظیم نشده است؛ نام کاربری و «کلید API» را در setup.php وارد کنید.', 503);
    }

    $challengeId = bin2hex(random_bytes(32));
    $insert = $pdo->prepare(
        'INSERT INTO otp_challenges (challenge_id, phone, source_hash, code_hash, attempts, created_at, expires_at)
         VALUES (:id, :phone, :source, \'\', 0, :created, :expires)'
    );
    $insert->execute([
        ':id' => $challengeId,
        ':phone' => $phone,
        ':source' => $sourceHash,
        ':created' => $iranNow,
        ':expires' => $iranNow + 300,
    ]);

    if ($isLocalTest) {
        $pdo->prepare('UPDATE otp_challenges SET expires_at = :now WHERE phone = :phone AND challenge_id <> :id')
            ->execute([':now' => $iranNow, ':phone' => $phone, ':id' => $challengeId]);
        $pdo->prepare('UPDATE otp_challenges SET code_hash = :hash WHERE challenge_id = :id')
            ->execute([':hash' => password_hash($testCode, PASSWORD_DEFAULT), ':id' => $challengeId]);
        eplakJson([
            'success' => true,
            'challenge_id' => $challengeId,
            'expires_in' => 300,
            'resend_after' => 120,
            'test_mode' => true,
            'test_code' => $testCode,
        ]);
    }

    /* ارسال با «ملی پیامک» از یک تابعِ مشترک (shared/payamak.php → eplakPayamakSendCode).
       همان تابعی است که «پیامک آزمایشی» پنل ادمین هم صدا می‌زند، پس نتیجه‌ی آزمایش
       دقیقاً همان مسیری است که کاربر موقع ورود طی می‌کند.
       • text     = کد چهاررقمیِ تصادفی (متغیرِ الگوی تأییدشده)
       • bodyId   = شناسه‌ی «متن تأییدشده» (پیش‌فرضِ پروژه 573639)
       • password = «کلید API» پنل — نه رمز عبور؛ رمز عبور با خطای ۱۱۰- رد می‌شود */
    $providerCode = '';
    if ($payamakEnabled) {
        $providerCode = (string)random_int(1000, 9999);
        $sms = eplakPayamakSendCode($fileConfig, $phone, $providerCode, [
            'username' => $payamakUsername,
            'secret'   => $payamakPassword,
            'bodyId'   => $payamakTemplateId,
        ]);

        /* هر ارسال — موفق یا ناموفق — دقیقاً یک خط گزارش می‌گیرد: کدِ HTTP،
           RetStatus/StrRetStatus، ترجمه‌ی فارسیِ کد، شناسه‌ی رکوردِ ارسال،
           مقصدِ پوشیده و اینکه کلید از کدام تنظیم خوانده شده است.
           هیچ کلید یا رمزی در error_log نمی‌آید. */
        error_log('[eplak-otp] ' . $sms['log'] . ' result=' . ($sms['ok'] ? 'sent' : 'rejected'));

        if (!$sms['ok'] || !preg_match('/^\d{4}$/', $providerCode)) {
            /* بدون کد جلو نمی‌رویم: چیزی هش نمی‌شود و پیامِ «فارسیِ دلیلِ واقعی»
               به اپ برمی‌گردد (مثلاً «کلید API پذیرفته نشد» به‌جای پیامِ کلی). */
            $providerCode = '';
            eplakJsonError(
                $sms['fa'] !== '' ? $sms['fa'] : 'ارسال کد پیامکی انجام نشد؛ لطفاً کمی بعد دوباره تلاش کنید.',
                502
            );
        }
    } else {
        /* به این شاخه نمی‌رسیم: اگر ملی پیامک آماده نباشد، چند خط بالاتر
           پاسخ خطا داده شده و اجرا تمام شده است. این فقط برای اطمینان است که
           هرگز «بی‌کد» جلو نرویم و چیزی در دیتابیس ننویسیم. */
        error_log('[eplak-otp] Melli Payamak was not enabled; OTP was not sent.');
        eplakJsonError('پنل ملی پیامک تنظیم نشده است؛ نام کاربری و «کلید API» را در setup.php وارد کنید.', 503);
    }

    $pdo->prepare('UPDATE otp_challenges SET expires_at = :now WHERE phone = :phone AND challenge_id <> :id')
        ->execute([':now' => $iranNow, ':phone' => $phone, ':id' => $challengeId]);
    $pdo->prepare('UPDATE otp_challenges SET code_hash = :hash WHERE challenge_id = :id')
        ->execute([':hash' => password_hash($providerCode, PASSWORD_DEFAULT), ':id' => $challengeId]);

    eplakJson([
        'success' => true,
        'challenge_id' => $challengeId,
        'expires_in' => 300,
        'resend_after' => 120,
    ]);
}

if ($action === 'verify') {
    $challengeId = (string)($input['challenge_id'] ?? '');
    $code = eplakNormalizeOtpDigits((string)($input['code'] ?? ''));
    $code = preg_replace('/\D+/', '', $code);
    if (!preg_match('/^[a-f0-9]{64}$/', $challengeId) || !preg_match('/^\d{4}$/', $code)) {
        eplakJsonError('کد تایید معتبر نیست.', 400);
    }

    $select = $pdo->prepare('SELECT code_hash, attempts, expires_at FROM otp_challenges WHERE challenge_id = :id LIMIT 1');
    $select->execute([':id' => $challengeId]);
    $challenge = $select->fetch();
    if (!$challenge || (int)$challenge['expires_at'] < $iranNow || (string)$challenge['code_hash'] === '') {
        eplakJsonError('کد تایید منقضی شده است؛ کد تازه درخواست کنید.', 410);
    }
    if ((int)$challenge['attempts'] >= 5) {
        $pdo->prepare('DELETE FROM otp_challenges WHERE challenge_id = :id')->execute([':id' => $challengeId]);
        eplakJsonError('تعداد تلاش‌های تایید بیش از حد مجاز است؛ کد تازه درخواست کنید.', 429);
    }

    $pdo->prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE challenge_id = :id')
        ->execute([':id' => $challengeId]);
    if (!password_verify($code, (string)$challenge['code_hash'])) {
        if ((int)$challenge['attempts'] + 1 >= 5) {
            $pdo->prepare('DELETE FROM otp_challenges WHERE challenge_id = :id')->execute([':id' => $challengeId]);
        }
        eplakJsonError('کد تایید اشتباه است.', 400);
    }

    $pdo->prepare('DELETE FROM otp_challenges WHERE challenge_id = :id')->execute([':id' => $challengeId]);
    eplakJson(['success' => true]);
}

eplakJsonError('درخواست نامعتبر است.', 400);

function eplakNormalizeOtpDigits(string $value): string {
    return strtr($value, [
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
        '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
        '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    ]);
}

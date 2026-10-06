<?php
require_once __DIR__ . '/_common.php';

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
    $payamakPassword = trim((string)(getenv('PAYAMAK_PASSWORD') ?: ($fileConfig['payamak_password'] ?? '')));
    $payamakTemplateId = trim((string)(getenv('PAYAMAK_TEMPLATE_ID') ?: ($fileConfig['payamak_template_id'] ?? '')));
    $hasPayamakCredentials = $payamakUsername !== '' && $payamakPassword !== '';
    $payamakEnabled = $hasPayamakCredentials && preg_match('/^\d+$/', $payamakTemplateId) === 1;

    if (!$isLocalTest && ($payamakUsername !== '') !== ($payamakPassword !== '')) {
        error_log('[eplak-otp] Payamak username and password must both be configured.');
        eplakJsonError('تنظیمات پنل پیامک کامل نیست.', 503);
    }

    if (!$isLocalTest && $hasPayamakCredentials && !$payamakEnabled) {
        error_log('[eplak-otp] A numeric Payamak template ID must be configured.');
        eplakJsonError('شناسه متن تأییدشده پنل پیامک تنظیم نشده است.', 503);
    }

    if (!$isLocalTest && !function_exists('curl_init')) {
        error_log('[eplak-otp] PHP cURL extension is not available.');
        eplakJsonError('امکان اتصال به سامانه پیامک روی سرور فعال نیست.', 503);
    }

    if (!$isLocalTest && !$payamakEnabled) {
        $token = trim((string)(getenv('AMOOTSMS_TOKEN') ?: ($fileConfig['amootsms_token'] ?? '')));
        if ($token === '') {
            error_log('[eplak-otp] AMOOTSMS_TOKEN is not configured.');
            eplakJsonError('ارسال پیامک فعلاً پیکربندی نشده است.', 503);
        }
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

    $providerCode = '';
    if ($payamakEnabled) {
        $payamakData = [
            'username' => $payamakUsername,
            'password' => $payamakPassword,
            'text' => (string)random_int(1000, 9999),
            'to' => $phone,
            'bodyId' => $payamakTemplateId,
        ];
        $postData = http_build_query($payamakData);
        $curl = curl_init('https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => [
                'content-type: application/x-www-form-urlencoded',
            ],
            CURLOPT_POSTFIELDS => $postData,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);
        $responseBody = curl_exec($curl);
        $curlError = curl_error($curl);
        $httpStatus = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($responseBody === false || $httpStatus < 200 || $httpStatus >= 300) {
            error_log('[eplak-otp] Payamak request failed; HTTP ' . $httpStatus . ($curlError !== '' ? ', cURL error: ' . $curlError : ''));
            eplakJsonError('ارسال کد پیامکی انجام نشد؛ لطفاً کمی بعد دوباره تلاش کنید.', 502);
        }

        $payamakResponse = json_decode((string)$responseBody, true);
        $providerCode = (string)$payamakData['text'];
        $providerPayload = is_array($payamakResponse) ? $payamakResponse : [];
        $isPayamakSuccess = (string)($providerPayload['RetStatus'] ?? '') === '1';
        if (!$isPayamakSuccess || !preg_match('/^\d{4}$/', $providerCode)) {
            $providerStatus = (string)($providerPayload['RetStatus'] ?? 'invalid_response');
            error_log('[eplak-otp] Payamak rejected OTP request; status=' . $providerStatus);
            eplakJsonError('سامانه پیامک نتوانست کد را ارسال کند؛ شماره و وضعیت خط پیامکی را بررسی کنید.', 502);
        }
    } else {
        $mobile = '98' . substr($phone, 1);
        $fields = http_build_query([
            'Token' => $token,
            'SendDateTime' => (new DateTimeImmutable('now', new DateTimeZone('Asia/Tehran')))->format('n/j/Y g:i:s A'),
            'SMSMessageText' => 'کد تایید شما:',
            'LineNumber' => 'public',
            'Mobile' => $mobile,
            'CodeLength' => '4',
        ]);

        $curl = curl_init('https://portal.amootsms.com/rest/SendOTP');
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/x-www-form-urlencoded',
            ],
            CURLOPT_POSTFIELDS => $fields,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $responseBody = curl_exec($curl);
        $curlError = curl_error($curl);
        $httpStatus = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($responseBody === false || $httpStatus < 200 || $httpStatus >= 300) {
            error_log('[eplak-otp] AmootSMS request failed; HTTP ' . $httpStatus . ($curlError !== '' ? ', cURL error: ' . $curlError : ''));
            eplakJsonError('ارسال کد پیامکی انجام نشد؛ لطفاً کمی بعد دوباره تلاش کنید.', 502);
        }

        $providerResponse = json_decode((string)$responseBody, true);
        $providerStatus = is_array($providerResponse) ? strtolower(trim((string)($providerResponse['Status'] ?? ''))) : '';
        $providerData = is_array($providerResponse) && is_array($providerResponse['Data'] ?? null)
            ? $providerResponse['Data']
            : [];
        $providerDataStatus = strtolower(trim((string)($providerData['Status'] ?? '')));
        $providerCodeValue = $providerData['Code'] ?? '';
        $providerCode = is_int($providerCodeValue)
            ? str_pad((string)$providerCodeValue, 4, '0', STR_PAD_LEFT)
            : trim((string)$providerCodeValue);
        if ($providerStatus !== 'success' || $providerDataStatus !== 'success' || !preg_match('/^\d{4}$/', $providerCode)) {
            error_log('[eplak-otp] AmootSMS rejected OTP request; status=' . ($providerStatus !== '' ? $providerStatus : 'invalid_response'));
            eplakJsonError('سامانه پیامک نتوانست کد را ارسال کند؛ شماره و وضعیت خط پیامکی را بررسی کنید.', 502);
        }
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

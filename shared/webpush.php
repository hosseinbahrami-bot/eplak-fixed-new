<?php
/* ============================================================================
   shared/webpush.php — موتور «اعلان پس‌زمینه» (Web Push) بدون هیچ کتابخانه‌ی خارجی

   هدف: وقتی مدیر از پنل اعلان می‌فرستد، اعلان روی گوشیِ شهروند — حتی در حالت
   «قفل بودن صفحه» و «بسته بودن برنامه/تب» — به‌صورت نوتیفیکیشن سیستمی برسد.
   (نسخه‌ی قبلی فقط وقتی برنامه باز بود و درخواست polling جواب می‌گرفت اعلان
   نشان می‌داد؛ این فایل مسیر سرور↔سرویس‌پوش را اضافه می‌کند.)

   پیاده‌سازی مطابق استانداردها:
     • RFC 8291 — Message Encryption for Web Push (aes128gcm)
     • RFC 8188 — Encrypted Content-Encoding for HTTP
     • RFC 8292 — VAPID (کلید امضا: ES256 روی P-256)

   نکات مهم:
     ۱) کلیدهای VAPID در اولین استفاده ساخته و در جدول app_settings ذخیره
        می‌شوند (نیازی به تنظیم دستی نیست).
     ۲) همه‌ی توابع در نبود OpenSSL/curl به‌صورت «غیرفعال» برمی‌گردند و هیچ
        خطایی به کاربر نشان داده نمی‌شود؛ اعلان‌های داخل برنامه (in-app) همیشه
        کار می‌کنند و این لایه فقط یک مسیر «اضافه» برای حالت پس‌زمینه است.
     ۳) سرویس‌پوش‌های عمومی (FCM، Mozilla، Apple) معمولاً بدنه‌ی حداکثر ~۴KB
        را می‌پذیرند؛ متن اعلان پیش از رمزنگاری برش داده می‌شود.
   ============================================================================ */

/* حداکثر اندازه‌ی بدنه‌ی رمزنگاری‌شده (یک رکورد). متن بلندتر برش داده می‌شود. */
if (!defined('EPLAK_PUSH_MAX_PAYLOAD')) {
    define('EPLAK_PUSH_MAX_PAYLOAD', 3000);
}

/* ────────────────────────── پایه: base64url و DER ────────────────────────── */

function eplakB64UrlEncode(string $binary): string {
    return rtrim(strtr(base64_encode($binary), '+/', '-_'), '=');
}

function eplakB64UrlDecode(string $encoded): string {
    $encoded = strtr(trim($encoded), '-_', '+/');
    $pad = strlen($encoded) % 4;
    if ($pad > 0) {
        $encoded .= str_repeat('=', 4 - $pad);
    }
    $decoded = base64_decode($encoded, true);
    return $decoded === false ? '' : $decoded;
}

function eplakDerLength(int $length): string {
    if ($length < 0x80) {
        return chr($length);
    }
    $bytes = '';
    while ($length > 0) {
        $bytes = chr($length & 0xFF) . $bytes;
        $length >>= 8;
    }
    return chr(0x80 | strlen($bytes)) . $bytes;
}

function eplakDerTlv(int $tag, string $value): string {
    return chr($tag) . eplakDerLength(strlen($value)) . $value;
}

function eplakDerSequence(string ...$parts): string {
    return eplakDerTlv(0x30, implode('', $parts));
}

/* نقطه‌ی عمومی ۶۵ بایتی (0x04 || X || Y) → کلید عمومی OpenSSL */
function eplakEcPublicKeyFromRaw(string $point) {
    if (strlen($point) !== 65 || $point[0] !== "\x04" || !function_exists('openssl_pkey_get_public')) {
        return false;
    }
    $algorithm = eplakDerSequence(
        eplakDerTlv(0x06, hex2bin('2A8648CE3D0201')), // id-ecPublicKey
        eplakDerTlv(0x06, hex2bin('2A8648CE3D030107')) // prime256v1
    );
    $spki = eplakDerSequence($algorithm, eplakDerTlv(0x03, "\x00" . $point));
    $pem  = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $key  = @openssl_pkey_get_public($pem);
    return $key === false ? false : $key;
}

/* امضای DER (ECDSA) → رشته‌ی خام ۶۴ بایتی r||s مطابق JWS */
function eplakDerEcdsaToRaw(string $der): string {
    $length = strlen($der);
    if ($length < 8 || ord($der[0]) !== 0x30) {
        return '';
    }
    $offset = 1;
    if (ord($der[$offset]) & 0x80) {
        $offset += 1 + (ord($der[$offset]) & 0x7F);
    } else {
        $offset += 1;
    }

    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        if ($offset + 1 >= $length || ord($der[$offset]) !== 0x02) {
            return '';
        }
        $offset++;
        $len = ord($der[$offset]);
        $offset++;
        if ($len & 0x80) {
            $n = $len & 0x7F;
            if ($n < 1 || $n > 4) {
                return '';
            }
            $len = 0;
            for ($k = 0; $k < $n; $k++) {
                $len = ($len << 8) | ord($der[$offset + $k]);
            }
            $offset += $n;
        }
        if ($len <= 0 || $offset + $len > $length) {
            return '';
        }
        $int = ltrim(substr($der, $offset, $len), "\x00");
        $offset += $len;
        if (strlen($int) > 32) {
            return '';
        }
        $parts[] = str_pad($int, 32, "\x00", STR_PAD_LEFT);
    }

    return implode('', $parts);
}

/* ──────────────────────────── HKDF (RFC 5869) ─────────────────────────────── */

function eplakHkdfExtract(string $salt, string $ikm): string {
    return hash_hmac('sha256', $ikm, $salt, true);
}

function eplakHkdfExpand(string $prk, string $info, int $length): string {
    $output = '';
    $block  = '';
    $counter = 1;
    while (strlen($output) < $length) {
        $block   = hash_hmac('sha256', $block . $info . chr($counter), $prk, true);
        $output .= $block;
        $counter++;
        if ($counter > 255) {
            break;
        }
    }
    return substr($output, 0, $length);
}

/* ─────────────────────── کلیدهای VAPID (ساخت و ذخیره) ─────────────────────── */

/* خروجی: ['pem' => string, 'public' => base64url(point65), 'ready' => bool, 'error' => string] */
function eplakVapidKeys(PDO $pdo, bool $createIfMissing = true): array {
    $result = ['pem' => '', 'public' => '', 'ready' => false, 'error' => ''];

    if (!function_exists('openssl_pkey_new') || !function_exists('openssl_sign')) {
        $result['error'] = 'افزونه‌ی OpenSSL روی این سرور فعال نیست؛ برای اعلان پس‌زمینه باید openssl فعال شود.';
        return $result;
    }

    $pem    = (string) eplakAppSetting($pdo, 'vapid_pem', '');
    $public = (string) eplakAppSetting($pdo, 'vapid_public', '');
    if ($pem !== '' && $public !== '') {
        $result['pem']    = $pem;
        $result['public'] = $public;
        $result['ready']  = true;
        return $result;
    }

    if (!$createIfMissing) {
        $result['error'] = 'کلیدهای اعلان پس‌زمینه هنوز ساخته نشده‌اند.';
        return $result;
    }

    $key = @openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_EC,
        'curve_name'       => 'prime256v1',
    ]);
    if ($key === false) {
        $result['error'] = 'ساخت کلید ECDSA ناموفق بود: ' . (string) openssl_error_string();
        return $result;
    }

    $details = openssl_pkey_get_details($key);
    if (empty($details['ec']['x']) || empty($details['ec']['y'])) {
        $result['error'] = 'خواندن مختصات کلید ساخته‌شده ناموفق بود.';
        return $result;
    }

    $point = "\x04"
        . str_pad((string) $details['ec']['x'], 32, "\x00", STR_PAD_LEFT)
        . str_pad((string) $details['ec']['y'], 32, "\x00", STR_PAD_LEFT);

    $exported = '';
    if (!openssl_pkey_export($key, $exported) || $exported === '') {
        $result['error'] = 'استخراج کلید خصوصی ناموفق بود.';
        return $result;
    }

    $publicB64 = eplakB64UrlEncode($point);
    eplakSetAppSetting($pdo, 'vapid_pem', $exported);
    eplakSetAppSetting($pdo, 'vapid_public', $publicB64);

    $result['pem']    = $exported;
    $result['public'] = $publicB64;
    $result['ready']  = true;
    return $result;
}

/* توکن VAPID (JWT با امضای ES256) — audience باید origin سرویس‌پوش باشد */
function eplakVapidToken(string $audience, string $subject, string $vapidPem): string {
    $key = @openssl_pkey_get_private($vapidPem);
    if ($key === false) {
        return '';
    }

    $header  = ['typ' => 'JWT', 'alg' => 'ES256'];
    $payload = ['aud' => $audience, 'exp' => time() + 3600, 'sub' => $subject];
    $input   = eplakB64UrlEncode((string) json_encode($header, JSON_UNESCAPED_SLASHES))
        . '.' . eplakB64UrlEncode((string) json_encode($payload, JSON_UNESCAPED_SLASHES));

    $der = '';
    if (!@openssl_sign($input, $der, $key, OPENSSL_ALGO_SHA256)) {
        return '';
    }
    $raw = eplakDerEcdsaToRaw($der);
    if (strlen($raw) !== 64) {
        return '';
    }

    return $input . '.' . eplakB64UrlEncode($raw);
}

/* ───────────────────── رمزنگاری بدنه (RFC 8291 / aes128gcm) ───────────────── */

/* خروجی: ['body' => string, 'error' => string] */
function eplakWebPushEncrypt(string $payload, string $userPublicRaw, string $authSecret): array {
    $out = ['body' => '', 'error' => ''];

    if (strlen($userPublicRaw) !== 65) {
        $out['error'] = 'کلید عمومی مرورگر نامعتبر است.';
        return $out;
    }
    if (strlen($authSecret) !== 16) {
        $out['error'] = 'کلید احراز مرورگر نامعتبر است.';
        return $out;
    }
    if (!function_exists('openssl_pkey_derive')) {
        $out['error'] = 'تابع openssl_pkey_derive در دسترس نیست (PHP پیش از ۷.۳).';
        return $out;
    }

    /* برش متن تا در یک رکورد جا شود (۴۰۷۹ بایت ظرفیت یک رکورد ۴۰۹۶ بایتی) */
    if (strlen($payload) > EPLAK_PUSH_MAX_PAYLOAD) {
        $payload = substr($payload, 0, EPLAK_PUSH_MAX_PAYLOAD);
    }

    $ephemeral = @openssl_pkey_new([
        'private_key_type' => OPENSSL_KEYTYPE_EC,
        'curve_name'       => 'prime256v1',
    ]);
    if ($ephemeral === false) {
        $out['error'] = 'ساخت کلید موقت ناموفق بود.';
        return $out;
    }
    $ephDetails = openssl_pkey_get_details($ephemeral);
    if (empty($ephDetails['ec']['x']) || empty($ephDetails['ec']['y'])) {
        $out['error'] = 'خواندن کلید موقت ناموفق بود.';
        return $out;
    }
    $asPublic = "\x04"
        . str_pad((string) $ephDetails['ec']['x'], 32, "\x00", STR_PAD_LEFT)
        . str_pad((string) $ephDetails['ec']['y'], 32, "\x00", STR_PAD_LEFT);

    $userKey = eplakEcPublicKeyFromRaw($userPublicRaw);
    if ($userKey === false) {
        $out['error'] = 'کلید عمومی مرورگر قابل خواندن نبود.';
        return $out;
    }

    $sharedSecret = @openssl_pkey_derive($userKey, $ephemeral);
    if (!is_string($sharedSecret) || $sharedSecret === '') {
        $out['error'] = 'محاسبه‌ی کلید مشترک (ECDH) ناموفق بود.';
        return $out;
    }

    $salt = random_bytes(16);

    /* IKM = HKDF(auth_secret, ecdh, "WebPush: info\x00" || ua_public || as_public) */
    $prkKey = eplakHkdfExtract($authSecret, $sharedSecret);
    $ikm    = eplakHkdfExpand($prkKey, "WebPush: info\x00" . $userPublicRaw . $asPublic, 32);

    $prk   = eplakHkdfExtract($salt, $ikm);
    $cek   = eplakHkdfExpand($prk, "Content-Encoding: aes128gcm\x00", 16);
    $nonce = eplakHkdfExpand($prk, "Content-Encoding: nonce\x00", 12);

    $plaintext = $payload . "\x02";               // جداکننده‌ی رکورد آخر
    $tag       = '';
    $ciphertext = @openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if (!is_string($ciphertext) || strlen($tag) !== 16) {
        $out['error'] = 'رمزنگاری بدنه‌ی اعلان ناموفق بود.';
        return $out;
    }

    $recordSize = 4096;
    $out['body'] = $salt
        . pack('N', $recordSize)
        . chr(strlen($asPublic))
        . $asPublic
        . $ciphertext
        . $tag;

    return $out;
}

/* ────────────────────────────── ارسال درخواست ─────────────────────────────── */

/* یک درخواست POST خام — با curl در صورت وجود، وگرنه با استریم ساده */
function eplakHttpPost(string $url, array $headers, string $body, int $timeout = 15): array {
    $result = ['status' => 0, 'body' => '', 'error' => ''];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HEADER         => false,
        ]);
        $response = curl_exec($ch);
        $status   = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        $result['status'] = $status;
        $result['body']   = is_string($response) ? $response : '';
        $result['error']  = $status === 0 ? (string) $error : '';
        return $result;
    }

    if (!ini_get('allow_url_fopen')) {
        $result['error'] = 'نه curl و نه allow_url_fopen در دسترس نیست.';
        return $result;
    }

    $context = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => implode("\r\n", $headers),
            'content'       => $body,
            'timeout'       => $timeout,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        $result['error'] = 'ارسال درخواست به سرویس‌پوش ناموفق بود.';
        return $result;
    }
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', (string) $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    $result['status'] = $status;
    $result['body']   = (string) $response;
    return $result;
}

/* ───────────────────── لایه‌ی پایگاه‌داده‌ای اشتراک‌ها و ارسال ──────────────── */

function eplakPushEnabled(): bool {
    return function_exists('openssl_pkey_new')
        && function_exists('openssl_pkey_derive')
        && function_exists('openssl_sign')
        && (function_exists('curl_init') || (bool) ini_get('allow_url_fopen'));
}

/* ذخیره/به‌روزرسانی یک اشتراک. خروجی: true در صورت موفقیت */
function eplakPushSaveSubscription(PDO $pdo, string $phone, array $subscription, string $userAgent = ''): bool {
    $endpoint = trim((string) ($subscription['endpoint'] ?? ''));
    $keys     = is_array($subscription['keys'] ?? null) ? $subscription['keys'] : [];
    $p256dh   = trim((string) ($keys['p256dh'] ?? ''));
    $auth     = trim((string) ($keys['auth'] ?? ''));

    if ($endpoint === '' || $p256dh === '' || $auth === '' || stripos($endpoint, 'http') !== 0) {
        return false;
    }
    if (mb_strlen($endpoint) > 500) {
        return false;
    }

    $phone = preg_replace('/[^0-9+]/', '', $phone) ?? '';
    if (strlen($phone) > 20) {
        $phone = substr($phone, 0, 20);
    }
    $userAgent = mb_substr($userAgent, 0, 250, 'UTF-8');

    try {
        /* اگر همین endpoint قبلاً ثبت شده، فقط تازه‌سازی می‌شود (پیوند به شماره‌ی
           جدید هم به‌روز می‌شود تا با ورود کاربر دیگری روی همان مرورگر درست بماند) */
        $find = $pdo->prepare('SELECT id FROM push_subscriptions WHERE endpoint = :endpoint LIMIT 1');
        $find->execute([':endpoint' => $endpoint]);
        $existingId = (int) $find->fetchColumn();

        if ($existingId > 0) {
            $update = $pdo->prepare(
                'UPDATE push_subscriptions
                 SET user_phone = :phone, p256dh = :p256dh, auth_key = :auth, user_agent = :ua,
                     is_active = 1, fail_count = 0, last_error = "", last_seen_at = CURRENT_TIMESTAMP
                 WHERE id = :id'
            );
            $update->execute([
                ':phone'  => $phone,
                ':p256dh' => $p256dh,
                ':auth'   => $auth,
                ':ua'     => $userAgent,
                ':id'     => $existingId,
            ]);
            return true;
        }

        $insert = $pdo->prepare(
            'INSERT INTO push_subscriptions (user_phone, endpoint, p256dh, auth_key, user_agent, last_seen_at)
             VALUES (:phone, :endpoint, :p256dh, :auth, :ua, CURRENT_TIMESTAMP)'
        );
        $insert->execute([
            ':phone'    => $phone,
            ':endpoint' => $endpoint,
            ':p256dh'   => $p256dh,
            ':auth'     => $auth,
            ':ua'       => $userAgent,
        ]);
        return true;
    } catch (\Throwable $e) {
        error_log('[eplak-push] save subscription failed: ' . $e->getMessage());
        return false;
    }
}

function eplakPushDeleteSubscription(PDO $pdo, string $endpoint): void {
    try {
        $stmt = $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = :endpoint');
        $stmt->execute([':endpoint' => $endpoint]);
    } catch (\Throwable $e) {
        /* بی‌صدا */
    }
}

/* اشتراک‌های فعال — اگر $phones داده شود فقط همان شماره‌ها.
   شماره‌ی خالی یعنی «کاربر مهمان» که اعلان‌های عمومی را می‌گیرد. */
function eplakPushSubscriptions(PDO $pdo, array $phones = [], bool $includeGuests = false): array {
    try {
        if (!$phones) {
            $stmt = $pdo->query('SELECT * FROM push_subscriptions WHERE is_active = 1 ORDER BY id DESC');
            return $stmt->fetchAll();
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

        $placeholders = [];
        $params = [];
        foreach ($clean as $i => $phone) {
            $key = ':p' . $i;
            $placeholders[] = $key;
            $params[$key] = $phone;
        }

        $sql = 'SELECT * FROM push_subscriptions WHERE is_active = 1';
        if ($placeholders) {
            $sql .= ' AND (user_phone IN (' . implode(', ', $placeholders) . ')';
            $sql .= $includeGuests ? ' OR user_phone = "" OR user_phone IS NULL)' : ')';
        } else {
            $sql .= ' AND (user_phone = "" OR user_phone IS NULL)';
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }
}

function eplakPushCount(PDO $pdo, bool $onlyActive = true): int {
    try {
        $sql = 'SELECT COUNT(*) FROM push_subscriptions' . ($onlyActive ? ' WHERE is_active = 1' : '');
        return (int) $pdo->query($sql)->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
}

/* ارسال یک اعلان به یک اشتراک مشخص */
function eplakPushSendOne(PDO $pdo, array $subscription, array $payload, string $vapidPem, string $vapidPublic): array {
    $endpoint = (string) ($subscription['endpoint'] ?? '');
    $result = ['ok' => false, 'status' => 0, 'error' => ''];

    $parts   = parse_url($endpoint);
    $origin  = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');
    if (!empty($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }

    $subject = (string) eplakAppSetting($pdo, 'vapid_subject', '');
    if ($subject === '') {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'eplak.ir');
        $host = preg_replace('/[^a-zA-Z0-9\.\-:]/', '', $host) ?? 'eplak.ir';
        $subject = 'mailto:admin@' . preg_replace('/:\d+$/', '', $host);
    }

    $token = eplakVapidToken($origin, $subject, $vapidPem);
    if ($token === '') {
        $result['error'] = 'ساخت توکن VAPID ناموفق بود.';
        return $result;
    }

    $userPublic = eplakB64UrlDecode((string) $subscription['p256dh']);
    $authSecret = eplakB64UrlDecode((string) $subscription['auth_key']);
    $encrypted  = eplakWebPushEncrypt((string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $userPublic, $authSecret);
    if ($encrypted['body'] === '') {
        $result['error'] = $encrypted['error'] !== '' ? $encrypted['error'] : 'رمزنگاری ناموفق بود.';
        return $result;
    }

    $headers = [
        'Content-Type: application/octet-stream',
        'Content-Encoding: aes128gcm',
        'Content-Length: ' . strlen($encrypted['body']),
        /* TTL طولانی: اگر گوشی خاموش/آفلاین باشد، سرویس‌پوش تا ۲۸ روز نگه می‌دارد
           و به‌محض آنلاین شدن (یا باز شدن قفل) تحویل می‌دهد. */
        'TTL: 2419200',
        'Urgency: high',
        'Authorization: vapid t=' . $token . ', k=' . $vapidPublic,
    ];

    $response = eplakHttpPost($endpoint, $headers, $encrypted['body']);

    if ($response['status'] >= 200 && $response['status'] < 300) {
        $result['ok'] = true;
        $result['status'] = $response['status'];
        return $result;
    }

    $result['status'] = $response['status'];
    $result['error']  = $response['error'] !== ''
        ? $response['error']
        : ('HTTP ' . $response['status'] . ' ' . mb_substr(trim((string) $response['body']), 0, 180));

    /* 404/410 یعنی اشتراک باطل شده (کاربر اپ را حذف/اجازه را لغو کرده) → غیرفعال شود */
    if (in_array((int) $response['status'], [404, 410], true)) {
        try {
            $stmt = $pdo->prepare('UPDATE push_subscriptions SET is_active = 0, last_error = :err WHERE id = :id');
            $stmt->execute([':err' => mb_substr($result['error'], 0, 250), ':id' => (int) $subscription['id']]);
        } catch (\Throwable $e) {
        }
    } else {
        try {
            $stmt = $pdo->prepare('UPDATE push_subscriptions SET fail_count = fail_count + 1, last_error = :err WHERE id = :id');
            $stmt->execute([':err' => mb_substr($result['error'], 0, 250), ':id' => (int) $subscription['id']]);
        } catch (\Throwable $e) {
        }
    }

    return $result;
}

/**
 * ارسال گروهی اعلان.
 * $subscriptions: ردیف‌های push_subscriptions
 * خروجی: ['sent' => int, 'failed' => int, 'errors' => string[], 'enabled' => bool]
 */
function eplakWebPushSend(PDO $pdo, array $subscriptions, string $title, string $body, array $extra = []): array {
    $summary = ['sent' => 0, 'failed' => 0, 'errors' => [], 'enabled' => true, 'total' => count($subscriptions)];

    if (!$subscriptions) {
        return $summary;
    }

    $vapid = eplakVapidKeys($pdo);
    if (!$vapid['ready']) {
        $summary['enabled'] = false;
        if ($vapid['error'] !== '') {
            $summary['errors'][] = $vapid['error'];
        }
        return $summary;
    }

    $payload = [
        'title' => $title,
        'body'  => $body,
        'url'   => (string) ($extra['url'] ?? 'index.html'),
        'icon'  => (string) ($extra['icon'] ?? 'assets/img/logo.png'),
        'tag'   => (string) ($extra['tag'] ?? ('eplak-' . time())),
        'id'    => (int) ($extra['id'] ?? 0),
    ];

    foreach ($subscriptions as $subscription) {
        $result = eplakPushSendOne($pdo, $subscription, $payload, $vapid['pem'], $vapid['public']);
        if ($result['ok']) {
            $summary['sent']++;
        } else {
            $summary['failed']++;
            if (count($summary['errors']) < 5 && $result['error'] !== '') {
                $summary['errors'][] = $result['error'];
            }
        }
    }

    return $summary;
}

/* ارسال به یک شماره (اختصاصی) — برای پاسخ گزارش و پیام‌های تک‌نفره */
function eplakPushNotifyPhone(PDO $pdo, string $phone, string $title, string $body, array $extra = []): array {
    $phone = trim($phone);
    if ($phone === '') {
        return ['sent' => 0, 'failed' => 0, 'errors' => [], 'enabled' => true, 'total' => 0];
    }
    return eplakWebPushSend($pdo, eplakPushSubscriptions($pdo, [$phone]), $title, $body, $extra);
}

/* ارسال عمومی (همه‌ی اشتراک‌های ثبت‌شده) */
function eplakPushNotifyAll(PDO $pdo, string $title, string $body, array $extra = []): array {
    return eplakWebPushSend($pdo, eplakPushSubscriptions($pdo), $title, $body, $extra);
}

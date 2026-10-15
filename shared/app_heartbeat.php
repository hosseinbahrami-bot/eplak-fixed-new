<?php
/* shared/app_heartbeat.php — «ضربان اپ‌ها»: آخرین باری که هر اپ فهرست اعلان‌ها را گرفت

   چرا؟
   وقتی کاربر می‌گوید «اعلان داخل APK نمی‌آید ولی در PWA می‌آید»، مدیر پنل هیچ
   راهی برای دیدن کنسول گوشی ندارد. این ماژول با هر درخواستِ GET فهرست اعلان‌ها
   (api/notifications.php) یک خلاصه‌ی کوچک در app_settings می‌نویسد:
     کلید:  app_poll:<platform>:<شماره | guest:<شناسه‌ی دستگاه>>
     مقدار: {"at":زمان سرور,"count":تعداد در پاسخ,"unread":…,"rows":ردیف‌های دیتابیس,
             "hidden":حذف‌شده‌های کاربر,"degraded":[…],"v":نسخه‌ی اسکریپت اپ,
             "prev":نتیجه‌ی درخواست قبلی از نگاه اپ,"ua":مرورگر/WebView}
   پنل → تنظیمات → «ضربان اپ‌ها» همین ردیف‌ها را نشان می‌دهد؛ پس بدون دسترسی به
   گوشی معلوم می‌شود:
     • اپ اصلاً به سرور می‌رسد یا نه (ردیفی هست؟ چند ثانیه پیش؟)
     • با کدام شماره وارد شده (شماره‌ی ردیف)
     • سرور برایش چند اعلان برمی‌گرداند (count) — صفر یعنی مشکل سمت دیتابیس/شماره
     • اپ پاسخ قبلی را توانسته بخواند یا نه (prev: ok:N / http:S / json / net:…)
   نوشتن حداکثر هر ۱۰ ثانیه برای هر کلید انجام می‌شود (اپ هر ۳٫۵ ثانیه می‌پرسد).
   ============================================================================ */

if (!defined('EPLAK_HEARTBEAT_PREFIX')) define('EPLAK_HEARTBEAT_PREFIX', 'app_poll:');
if (!defined('EPLAK_HEARTBEAT_MIN_GAP')) define('EPLAK_HEARTBEAT_MIN_GAP', 10);

/** نام سکو فقط از فهرست شناخته‌شده ('' = اپ قدیمی که سکویش را نمی‌گوید → ثبت نمی‌شود) */
function eplakHeartbeatPlatform(string $raw): string
{
    $p = strtolower(trim($raw));
    return in_array($p, ['android', 'ios', 'web'], true) ? $p : '';
}

/** کلید ردیف در app_settings (حداکثر ۱۰۰ نویسه = اندازه‌ی ستون setting_key) */
function eplakHeartbeatKey(string $platform, string $phone, string $device): string
{
    $who = $phone !== '' ? $phone : ('guest:' . ($device !== '' ? substr($device, 0, 40) : 'unknown'));
    return substr(EPLAK_HEARTBEAT_PREFIX . $platform . ':' . $who, 0, 100);
}

/**
 * ثبت ضربان؛ هرگز استثنا نمی‌دهد و هرگز پاسخ اصلی را کند/خراب نمی‌کند.
 * $info: platform, phone, device, count, unread, rows, hidden, degraded, v, prev
 */
function eplakHeartbeatRecord(PDO $pdo, array $info): bool
{
    try {
        $platform = eplakHeartbeatPlatform((string) ($info['platform'] ?? ''));
        if ($platform === '') return false;
        $phone  = preg_replace('/[^0-9+]/', '', (string) ($info['phone'] ?? '')) ?? '';
        $device = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($info['device'] ?? '')) ?? '';
        if ($phone === '' && $device === '') return false;
        /* مهمانِ وب (هر بازدیدکننده‌ی سایت یک شناسه‌ی دستگاه تازه دارد) ثبت نمی‌شود تا
           app_settings با هزاران ردیف بی‌فایده پر نشود؛ مهمانِ APK/IPA مهم است (اپ نصب‌شده
           که هنوز وارد نشده) و ثبت می‌شود. */
        if ($phone === '' && $platform === 'web') return false;

        $key = eplakHeartbeatKey($platform, $phone, $device);
        $now = time();

        /* سقف نوشتن: هر ۱۰ ثانیه یک‌بار برای هر کلید */
        $existing = eplakAppSetting($pdo, $key, null);
        if ($existing !== null) {
            $old = json_decode($existing, true);
            if (is_array($old) && (int) ($old['at'] ?? 0) > $now - EPLAK_HEARTBEAT_MIN_GAP) {
                return false;
            }
        }

        $prev = preg_replace('/[^A-Za-z0-9:_.\- ]/', '', (string) ($info['prev'] ?? '')) ?? '';
        $ver  = preg_replace('/[^A-Za-z0-9._-]/', '', (string) ($info['v'] ?? '')) ?? '';
        $ua   = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
        $ua   = preg_replace('/[^\x20-\x7E]/', '', $ua) ?? '';

        $payload = [
            'at'       => $now,
            'platform' => $platform,
            'phone'    => $phone,
            'device'   => $device !== '' ? substr($device, 0, 40) : '',
            'count'    => (int) ($info['count'] ?? 0),
            'unread'   => (int) ($info['unread'] ?? 0),
            'rows'     => (int) ($info['rows'] ?? 0),
            'hidden'   => (int) ($info['hidden'] ?? 0),
            'degraded' => array_values(array_map('strval', (array) ($info['degraded'] ?? []))),
            'v'        => substr($ver, 0, 20),
            'prev'     => substr($prev, 0, 60),
            'ua'       => substr($ua, 0, 160),
        ];
        eplakSetAppSetting($pdo, $key, (string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        /* هرازگاهی ردیف‌های کهنه (اپ‌هایی که ۳۰ روز است سر نزده‌اند) پاک می‌شوند */
        if (random_int(1, 50) === 1) eplakHeartbeatPrune($pdo, 30);
        return true;
    } catch (\Throwable $e) {
        return false;
    }
}

/** حذف ضربان‌های قدیمی‌تر از n روز (بی‌صدا) */
function eplakHeartbeatPrune(PDO $pdo, int $days = 30): void
{
    $days = max(1, $days);
    try {
        $sql = (function_exists('eplakIsSqlite') && eplakIsSqlite($pdo))
            ? "DELETE FROM app_settings WHERE setting_key LIKE :p AND updated_at < datetime('now', '-{$days} days')"
            : "DELETE FROM app_settings WHERE setting_key LIKE :p AND updated_at < (NOW() - INTERVAL {$days} DAY)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':p' => EPLAK_HEARTBEAT_PREFIX . '%']);
    } catch (\Throwable $e) {
        /* اختیاری */
    }
}

/** فهرست آخرین ضربان‌ها (تازه‌ترین اول) برای پنل مدیریت */
function eplakHeartbeatList(PDO $pdo, int $limit = 30): array
{
    $limit = max(1, min(200, $limit));
    try {
        $stmt = $pdo->prepare('SELECT setting_key, setting_value, updated_at FROM app_settings WHERE setting_key LIKE :p ORDER BY updated_at DESC LIMIT ' . $limit);
        $stmt->execute([':p' => EPLAK_HEARTBEAT_PREFIX . '%']);
        $rows = $stmt->fetchAll() ?: [];
    } catch (\Throwable $e) {
        return [];
    }
    $now = time();
    $out = [];
    foreach ($rows as $row) {
        $data = json_decode((string) ($row['setting_value'] ?? ''), true);
        if (!is_array($data)) continue;
        $at  = (int) ($data['at'] ?? 0);
        $age = $at > 0 ? max(0, $now - $at) : -1;
        $out[] = [
            'key'      => (string) ($row['setting_key'] ?? ''),
            'platform' => (string) ($data['platform'] ?? ''),
            'phone'    => (string) ($data['phone'] ?? ''),
            'device'   => (string) ($data['device'] ?? ''),
            'at'       => $at,
            'age'      => $age,
            'age_text' => eplakHeartbeatAgeText($age),
            'count'    => (int) ($data['count'] ?? 0),
            'unread'   => (int) ($data['unread'] ?? 0),
            'rows'     => (int) ($data['rows'] ?? 0),
            'hidden'   => (int) ($data['hidden'] ?? 0),
            'degraded' => (array) ($data['degraded'] ?? []),
            'v'        => (string) ($data['v'] ?? ''),
            'prev'     => (string) ($data['prev'] ?? ''),
            'ua'       => (string) ($data['ua'] ?? ''),
            'updated_at' => (string) ($row['updated_at'] ?? ''),
        ];
    }
    usort($out, static fn(array $a, array $b) => $b['at'] <=> $a['at']);
    return $out;
}

/** «۱۲ ثانیه پیش» / «۳ دقیقه پیش» / «۲ ساعت پیش» / «۳ روز پیش» */
function eplakHeartbeatAgeText(int $age): string
{
    if ($age < 0) return 'نامشخص';
    if ($age < 60) return $age . ' ثانیه پیش';
    if ($age < 3600) return (int) floor($age / 60) . ' دقیقه پیش';
    if ($age < 86400) return (int) floor($age / 3600) . ' ساعت پیش';
    return (int) floor($age / 86400) . ' روز پیش';
}

/** برچسب فارسی سکو برای جدول پنل */
function eplakHeartbeatPlatformLabel(string $platform): string
{
    switch ($platform) {
        case 'android': return 'اپ اندروید (APK)';
        case 'ios':     return 'اپ آیفون (IPA)';
        case 'web':     return 'وب / PWA';
        default:        return $platform;
    }
}

/** توضیح کوتاه نتیجه‌ی قبلی از نگاه اپ (prev) برای مدیر */
function eplakHeartbeatPrevText(string $prev): string
{
    $prev = trim($prev);
    if ($prev === '') return '—';
    if (strpos($prev, 'ok:') === 0) return 'پاسخ قبلی سالم خوانده شد (' . substr($prev, 3) . ' اعلان)';
    if (strpos($prev, 'http:') === 0) return 'پاسخ قبلی با خطای HTTP ' . substr($prev, 5) . ' برگشت';
    if ($prev === 'json') return 'پاسخ قبلی JSON نبود (صفحه‌ی HTML/فایروال؟)';
    if (strpos($prev, 'net') === 0) return 'درخواست قبلی به سرور نرسید (' . $prev . ')';
    if ($prev === 'first') return 'اولین درخواست پس از باز شدن اپ';
    return $prev;
}

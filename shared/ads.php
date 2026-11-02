<?php
/* ════════════════════════════════════════════════════════════════════════════
   shared/ads.php — تبلیغاتِ داخل اپ (سه جای بنر) + آمار کلیک
   ----------------------------------------------------------------------------
   چرا این فایل؟
     پیش از این، تبلیغاتِ اپ سه بنرِ «ثابت» در index.html بودند (حاجی اعلا و
     آی‌باتری) که نه از پنل قابل تغییر بودند و نه لینک داشتند. حالا همان سه
     «جای بنر» (placement) از دیتابیس خوانده می‌شوند:
         home_top  → خانه، بنرِ بزرگِ بالای شبکه‌ی خدمات
         home_mid  → خانه، بنرِ میانیِ بالای «میراث ورامین»
         dash_slim → داشبورد، بنرِ باریکِ زیر آب‌وهوا
     هر جای بنر می‌تواند **چند تصویر** داشته باشد؛ تصاویر به ترتیبِ
     sort_order نمایش داده می‌شوند و خودکار می‌چرخند (modules/ads.js).

   قاعده‌ها:
     • هرگز خطای ۵۰۰ نمی‌دهد: اگر جدول `ads` نباشد یا ستونی کم باشد، خروجی
       «خالی + degraded» است و اپ همان بنرهای ثابتِ داخل بسته را نشان می‌دهد.
     • تصویرِ آپلودشده (uploads/ads/…) با **نشانی مطلق** به اپ می‌رسد (اپ صفحه
       را از file:// باز می‌کند)؛ ولی assets/… نسبی می‌ماند تا آفلاین کار کند.
     • لینک فقط http/https پذیرفته می‌شود (javascript: و data: رد می‌شوند).
     • کلیک فقط برای تبلیغِ «فعال» شمرده می‌شود و از یک IP برای یک تبلیغ،
       بیش از یک بار در چند ثانیه ثبت نمی‌شود (ضدِ تورمِ آمار).
   ════════════════════════════════════════════════════════════════════════════ */

if (!defined('EPLAK_ADS_TABLE')) {
    define('EPLAK_ADS_TABLE', 'ads');
}

if (!defined('EPLAK_ADS_CLICKS_TABLE')) {
    define('EPLAK_ADS_CLICKS_TABLE', 'ads_clicks');
}

/* سه جای بنر، به همان ترتیبی که در اپ دیده می‌شوند */
if (!defined('EPLAK_ADS_PLACEMENTS')) {
    define('EPLAK_ADS_PLACEMENTS', 'home_top,home_mid,dash_slim');
}

/* حداقل فاصله‌ی دو کلیکِ شمرده‌شده از یک IP روی یک تبلیغ (ثانیه).
   کلیکِ دوباره‌ی همان نفر در کمتر از این فاصله «باز می‌شود» ولی آمار را باد
   نمی‌کند (دوبار زدنِ پیاپی، رفرش، …). */
if (!defined('EPLAK_ADS_CLICK_THROTTLE')) {
    define('EPLAK_ADS_CLICK_THROTTLE', 60);
}

/* لاگِ کلیک‌ها تا چند روز نگه داشته شود (بعد از آن پاک می‌شود) */
if (!defined('EPLAK_ADS_CLICK_KEEP_DAYS')) {
    define('EPLAK_ADS_CLICK_KEEP_DAYS', 180);
}

/** فهرست جای بنرها */
function eplakAdsPlacements(): array
{
    $out = [];
    foreach (explode(',', EPLAK_ADS_PLACEMENTS) as $p) {
        $p = trim($p);
        if ($p !== '' && !in_array($p, $out, true)) {
            $out[] = $p;
        }
    }
    return $out;
}

/** نامِ فارسیِ جای بنر (برای پنل ادمین) */
function eplakAdsPlacementLabel(string $placement): string
{
    switch ($placement) {
        case 'home_top':
            return 'خانه — بنر بزرگ (بالای شبکه‌ی خدمات)';
        case 'home_mid':
            return 'خانه — بنر میانی (بالای میراث ورامین)';
        case 'dash_slim':
            return 'داشبورد — بنر باریک (زیر آب‌وهوا)';
        default:
            return $placement === '' ? '—' : $placement;
    }
}

/** جای بنرِ معتبر یا رشته‌ی خالی */
function eplakAdsNormalizePlacement(?string $placement): string
{
    $p = strtolower(trim((string) $placement));
    return in_array($p, eplakAdsPlacements(), true) ? $p : '';
}

/**
 * آیا این لینک برای تبلیغ مجاز است؟
 * رشته‌ی خالی = «بدون لینک» (بنر فقط نمایش داده می‌شود) و مجاز است.
 */
function eplakAdLinkAllowed(?string $url): bool
{
    $url = trim((string) $url);
    if ($url === '') {
        return true;
    }
    if (strlen($url) > 700) {
        return false;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return false;
    }
    /* هیچ نویسه‌ی کنترلی/فاصله‌ای داخل نشانی نباشد */
    return preg_match('/[\s\x00-\x1F\x7F]/u', $url) !== 1;
}

/** ستون‌هایی که واقعاً در جدول ads هست (null = جدول وجود ندارد) */
function eplakAdsTableColumns(PDO $pdo): ?array
{
    if (function_exists('eplakTableColumns')) {
        return eplakTableColumns($pdo, EPLAK_ADS_TABLE);
    }
    return null;
}

/** آیا جدول جدولِ کلیک‌ها هست؟ */
function eplakAdsClicksReady(PDO $pdo): bool
{
    if (!function_exists('eplakTableColumns')) {
        return false;
    }
    $cols = eplakTableColumns($pdo, EPLAK_ADS_CLICKS_TABLE);
    return is_array($cols) && count($cols) > 0;
}

/**
 * نشانی مطلقِ تصویرِ تبلیغ.
 * assets/… داخل بسته‌ی اپ هم هست ⇒ نسبی می‌ماند (آفلاین کار می‌کند).
 * uploads/ads/… ⇒ نشانی کامل سرور (اپ صفحه را از file:// باز می‌کند).
 */
function eplakAdsAbsoluteImage(string $path, int $upLevels = 2): string
{
    $path = trim(str_replace('\\', '/', $path));
    if ($path === '') {
        return '';
    }
    if (preg_match('#^(https?:)?//#i', $path) || strpos($path, 'data:') === 0 || strpos($path, 'blob:') === 0) {
        return $path;
    }
    if (strpos($path, 'assets/') === 0 || strpos($path, '/assets/') === 0) {
        return ltrim($path, '/');
    }
    $https = (($_SERVER['HTTPS'] ?? '') === 'on') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host  = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    if ($host === '') {
        return ltrim($path, '/');
    }
    /* /eplak-fixed/api/ads.php → /eplak-fixed */
    $base = str_replace('\\', '/', dirname($script, $upLevels));
    $base = rtrim($base === '/' || $base === '.' ? '' : $base, '/');
    return ($https ? 'https://' : 'http://') . $host . $base . '/' . ltrim($path, '/');
}

/**
 * فهرست تبلیغ‌ها.
 *
 * @param string $placement  '' = همه‌ی جای بنرها
 * @param bool   $onlyActive فقط فعال‌ها (برای اپ true، برای پنل false)
 * @return array<int,array<string,mixed>>  خروجی: ['items','degraded','hint']
 */
function eplakAdsList(PDO $pdo, string $placement = '', bool $onlyActive = true): array
{
    $out = ['items' => [], 'degraded' => [], 'hint' => ''];
    $cols = eplakAdsTableColumns($pdo);
    if (!is_array($cols) || count($cols) === 0) {
        $out['degraded'][] = 'no_table';
        $out['hint'] = 'جدول تبلیغات ساخته نشده است';
        return $out;
    }
    $has = static function (string $c) use ($cols): bool {
        return in_array($c, $cols, true);
    };

    $select = ['id'];
    foreach (['placement', 'title', 'alt_text', 'image_path', 'image_webp', 'link_url', 'sort_order', 'is_active', 'click_count', 'created_at', 'updated_at'] as $c) {
        if ($has($c)) {
            $select[] = $c;
        }
    }
    $sql = 'SELECT ' . implode(', ', $select) . ' FROM ' . EPLAK_ADS_TABLE;
    $where = [];
    $params = [];
    $p = eplakAdsNormalizePlacement($placement);
    if ($p !== '' && $has('placement')) {
        $where[] = 'placement = ?';
        $params[] = $p;
    }
    if ($onlyActive && $has('is_active')) {
        $where[] = 'is_active = 1';
    }
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    /* ترتیب = همان ترتیبِ نمایش در اپ */
    $orderBy = [];
    if ($has('placement')) {
        $orderBy[] = 'placement';
    }
    $orderBy[] = $has('sort_order') ? 'sort_order' : 'id';
    $orderBy[] = 'id';
    $sql .= ' ORDER BY ' . implode(', ', $orderBy);

    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $out['items'] = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        $out['degraded'][] = 'query_failed';
        $out['hint'] = $e->getMessage();
        error_log('[eplak][ads] eplakAdsList failed: ' . $e->getMessage());
    }
    return $out;
}

/**
 * خروجیِ عمومی برای اپ: تبلیغ‌های فعال، دسته‌بندی‌شده بر اساس جای بنر،
 * با نشانی مطلقِ تصویر. جای بنرِ خالی در خروجی هست (با آرایه‌ی خالی) تا اپ
 * بداند «آنجا تبلیغی نیست» و بنرِ ثابتِ داخل بسته را نشان دهد.
 */
function eplakAdsPublic(PDO $pdo, int $upLevels = 2): array
{
    $placements = eplakAdsPlacements();
    $grouped = [];
    foreach ($placements as $p) {
        $grouped[$p] = [];
    }
    $list = eplakAdsList($pdo, '', true);
    foreach ($list['items'] as $row) {
        $placement = eplakAdsNormalizePlacement((string) ($row['placement'] ?? ''));
        if ($placement === '' || !isset($grouped[$placement])) {
            continue;
        }
        $image = eplakAdsAbsoluteImage((string) ($row['image_path'] ?? ''), $upLevels);
        if ($image === '') {
            continue;   /* تبلیغِ بی‌تصویر چیزی برای نشان دادن ندارد */
        }
        $link = trim((string) ($row['link_url'] ?? ''));
        if (!eplakAdLinkAllowed($link)) {
            $link = '';  /* لینکِ نامعتبر هرگز به اپ نمی‌رود */
        }
        $grouped[$placement][] = [
            'id'      => (int) ($row['id'] ?? 0),
            'title'   => (string) ($row['title'] ?? ''),
            'alt'     => (string) ($row['alt_text'] ?? '') !== '' ? (string) $row['alt_text'] : (string) ($row['title'] ?? ''),
            'image'   => $image,
            'webp'    => eplakAdsAbsoluteImage((string) ($row['image_webp'] ?? ''), $upLevels),
            'link'    => $link,
            'order'   => (int) ($row['sort_order'] ?? 0),
        ];
    }
    return [
        'placements' => $grouped,
        'degraded'   => $list['degraded'],
        'hint'       => $list['hint'],
        'count'      => count($grouped['home_top'] ?? []) + count($grouped['home_mid'] ?? []) + count($grouped['dash_slim'] ?? []),
    ];
}

/**
 * «اثر انگشت» تبلیغ‌ها — با هر تغییر در پنل عوض می‌شود تا اپ بداند داده‌ی
 * کش‌شده‌اش بیات شده است (بدون نیاز به زمان‌بندی).
 */
function eplakAdsFingerprint(PDO $pdo): string
{
    $list = eplakAdsList($pdo, '', false);
    if ($list['degraded']) {
        return 'none';
    }
    $sig = [];
    foreach ($list['items'] as $row) {
        $sig[] = implode('|', [
            (int) ($row['id'] ?? 0),
            (string) ($row['placement'] ?? ''),
            (string) ($row['image_path'] ?? ''),
            (string) ($row['link_url'] ?? ''),
            (int) ($row['sort_order'] ?? 0),
            (int) ($row['is_active'] ?? 1),
            (int) ($row['click_count'] ?? 0),
        ]);
    }
    return substr(sha1(implode(';', $sig)), 0, 12);
}

/** هشِ پایدارِ IP (برای آمار بدون نگه‌داشتنِ IP خام) */
function eplakAdsHashIp(string $ip): string
{
    $ip = trim($ip);
    if ($ip === '') {
        return '';
    }
    $salt = defined('EPLAK_ADS_IP_SALT') ? EPLAK_ADS_IP_SALT : 'eplak-ads';
    return substr(hash_hmac('sha256', $ip, $salt), 0, 32);
}

/** IP درخواست (فقط برای آمار کلیک؛ هش می‌شود و خام ذخیره نمی‌شود) */
function eplakAdsClientIp(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $key) {
        $value = trim((string) ($_SERVER[$key] ?? ''));
        if ($value === '') {
            continue;
        }
        if (strpos($value, ',') !== false) {
            $value = trim(explode(',', $value)[0]);
        }
        if (filter_var($value, FILTER_VALIDATE_IP) !== false) {
            return $value;
        }
    }
    return '';
}

/**
 * ثبتِ کلیک روی یک تبلیغ.
 *
 * @return array{counted:bool,reason:string,total:int}
 *         reason: '' | no_table | not_found | inactive | throttled | failed
 */
function eplakAdsRegisterClick(PDO $pdo, int $adId, ?string $ip = null, ?string $userAgent = null, int $throttle = EPLAK_ADS_CLICK_THROTTLE): array
{
    $result = ['counted' => false, 'reason' => '', 'total' => 0];
    if ($adId <= 0) {
        $result['reason'] = 'not_found';
        return $result;
    }
    $cols = eplakAdsTableColumns($pdo);
    if (!is_array($cols) || count($cols) === 0) {
        $result['reason'] = 'no_table';
        return $result;
    }
    try {
        $st = $pdo->prepare('SELECT id, is_active, click_count FROM ' . EPLAK_ADS_TABLE . ' WHERE id = ? LIMIT 1');
        $st->execute([$adId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['reason'] = 'failed';
        error_log('[eplak][ads] click lookup failed: ' . $e->getMessage());
        return $result;
    }
    if (!$row) {
        $result['reason'] = 'not_found';
        return $result;
    }
    if ((int) ($row['is_active'] ?? 1) !== 1) {
        $result['reason'] = 'inactive';
        return $result;
    }
    $result['total'] = (int) ($row['click_count'] ?? 0);

    $ipHash = eplakAdsHashIp($ip === null ? eplakAdsClientIp() : (string) $ip);

    /* ضدِ تورم: دو کلیکِ پیاپی از یک IP روی یک تبلیغ، یکی شمرده می‌شود */
    if ($ipHash !== '' && $throttle > 0 && eplakAdsClicksReady($pdo)) {
        try {
            $cutoff = function_exists('eplakDbAgoString')
                ? eplakDbAgoString($throttle, $pdo)
                : date('Y-m-d H:i:s', time() - $throttle);
            $st = $pdo->prepare('SELECT id FROM ' . EPLAK_ADS_CLICKS_TABLE . ' WHERE ad_id = ? AND ip_hash = ? AND created_at >= ? LIMIT 1');
            $st->execute([$adId, $ipHash, $cutoff]);
            if ($st->fetch(PDO::FETCH_ASSOC)) {
                /* همین الان از همین IP کلیک شده — شمارنده را بالا نبر */
                $result['reason'] = 'throttled';
                return $result;
            }
        } catch (Throwable $e) {
            /* جدول لاگ مشکل دارد ⇒ فقط کلیک را می‌شماریم */
            error_log('[eplak][ads] throttle check failed: ' . $e->getMessage());
        }
        try {
            $st = $pdo->prepare('INSERT INTO ' . EPLAK_ADS_CLICKS_TABLE . ' (ad_id, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?)');
            $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
            $st->execute([$adId, $ipHash, substr((string) ($userAgent ?? ($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 250), $now]);
            /* پاک‌سازیِ لاگِ کهنه — فقط گاهی، تا هزینه‌ی هر کلیک زیاد نشود */
            if (mt_rand(1, 50) === 1) {
                $stale = function_exists('eplakDbAgoString')
                    ? eplakDbAgoString(EPLAK_ADS_CLICK_KEEP_DAYS * 86400, $pdo)
                    : date('Y-m-d H:i:s', time() - EPLAK_ADS_CLICK_KEEP_DAYS * 86400);
                $pdo->prepare('DELETE FROM ' . EPLAK_ADS_CLICKS_TABLE . ' WHERE created_at < ?')->execute([$stale]);
            }
        } catch (Throwable $e) {
            error_log('[eplak][ads] click log insert failed: ' . $e->getMessage());
        }
    }

    try {
        $pdo->prepare('UPDATE ' . EPLAK_ADS_TABLE . ' SET click_count = click_count + 1 WHERE id = ?')->execute([$adId]);
        $result['counted'] = true;
        $result['total'] = $result['total'] + 1;
    } catch (Throwable $e) {
        $result['reason'] = 'failed';
        error_log('[eplak][ads] click count failed: ' . $e->getMessage());
    }
    return $result;
}

/**
 * آمار کلیک برای پنل: برای هر تبلیغ ⇒ تعداد، آخرین کلیک، تعداد IPِ یکتا.
 *
 * @param int[] $ids
 * @return array<int,array{count:int,last:string,ips:int}>
 */
function eplakAdsClickStats(PDO $pdo, array $ids): array
{
    $stats = [];
    $ids = array_values(array_filter(array_map('intval', $ids), static function ($v) {
        return $v > 0;
    }));
    if (!$ids) {
        return $stats;
    }
    if (!eplakAdsClicksReady($pdo)) {
        return $stats;
    }
    $marks = implode(',', array_fill(0, count($ids), '?'));
    try {
        $st = $pdo->prepare('SELECT ad_id, COUNT(*) AS c, COUNT(DISTINCT ip_hash) AS ips, MAX(created_at) AS last_at FROM ' . EPLAK_ADS_CLICKS_TABLE . ' WHERE ad_id IN (' . $marks . ') GROUP BY ad_id');
        $st->execute($ids);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $stats[(int) $row['ad_id']] = [
                'count' => (int) $row['c'],
                'ips'   => (int) $row['ips'],
                'last'  => (string) ($row['last_at'] ?? ''),
            ];
        }
    } catch (Throwable $e) {
        error_log('[eplak][ads] click stats failed: ' . $e->getMessage());
    }
    return $stats;
}

/**
 * درجِ سه بنرِ فعلیِ اپ به‌عنوان تبلیغِ پیش‌فرض (یک‌بار).
 * تا وقتی مدیر چیزی عوض نکرده، ظاهر اپ دقیقاً مثل قبل می‌ماند.
 */
function eplakSeedDefaultAds(PDO $pdo, ?array &$report = null): int
{
    $report = ['inserted' => 0, 'skipped' => ''];
    if (!function_exists('eplakAppSetting')) {
        return 0;
    }
    if ((string) eplakAppSetting($pdo, 'ads_seeded', '') === '1') {
        $report['skipped'] = 'already_seeded';
        return 0;
    }
    $cols = eplakAdsTableColumns($pdo);
    if (!is_array($cols) || count($cols) === 0) {
        $report['skipped'] = 'no_table';
        return 0;
    }
    $defaults = [
        [
            'placement'  => 'home_top',
            'title'      => 'حاجی اعلا — بازار زعفران، پسته، مس، فرش دستباف و ترمه',
            'alt_text'   => 'حاجی اعلا — بازار زعفران، پسته، مس، فرش دستباف و ترمه',
            'image_path' => 'assets/img/ad-haji.jpg',
            'image_webp' => 'assets/img/ad-haji.webp',
            'link_url'   => '',
            'sort_order' => 1,
        ],
        [
            'placement'  => 'home_mid',
            'title'      => 'آی‌باتری - ibatri',
            'alt_text'   => 'آی‌باتری - ibatri',
            'image_path' => 'assets/img/ad-ibatri-top.jpg',
            'image_webp' => 'assets/img/ad-ibatri-top.webp',
            'link_url'   => '',
            'sort_order' => 1,
        ],
        [
            'placement'  => 'dash_slim',
            'title'      => 'آی‌باتری - باتریت رو ما می‌رسونیم',
            'alt_text'   => 'آی‌باتری - باتریت رو ما می‌رسونیم',
            'image_path' => 'assets/img/ad-slim.jpg',
            'image_webp' => 'assets/img/ad-slim.webp',
            'link_url'   => '',
            'sort_order' => 1,
        ],
    ];
    $inserted = 0;
    foreach ($defaults as $ad) {
        $fields = [];
        $values = [];
        foreach ($ad as $column => $value) {
            if (in_array($column, $cols, true)) {
                $fields[] = $column;
                $values[] = $value;
            }
        }
        if (in_array('is_active', $cols, true)) {
            $fields[] = 'is_active';
            $values[] = 1;
        }
        if (in_array('click_count', $cols, true)) {
            $fields[] = 'click_count';
            $values[] = 0;
        }
        $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
        if (in_array('created_at', $cols, true)) {
            $fields[] = 'created_at';
            $values[] = $now;
        }
        if (in_array('updated_at', $cols, true)) {
            $fields[] = 'updated_at';
            $values[] = $now;
        }
        try {
            $sql = 'INSERT INTO ' . EPLAK_ADS_TABLE . ' (' . implode(', ', $fields) . ') VALUES (' . implode(', ', array_fill(0, count($fields), '?')) . ')';
            $pdo->prepare($sql)->execute($values);
            $inserted++;
        } catch (Throwable $e) {
            error_log('[eplak][ads] seed failed: ' . $e->getMessage());
        }
    }
    /* حتی اگر هیچ‌کدام درج نشد، نشانه را می‌گذاریم تا هر درخواست تلاش نکند */
    try {
        eplakSetAppSetting($pdo, 'ads_seeded', '1');
    } catch (Throwable $e) {
        error_log('[eplak][ads] could not mark ads_seeded: ' . $e->getMessage());
    }
    $report['inserted'] = $inserted;
    return $inserted;
}

/* ════════════════════════════════════════════════════════════════════════════
   بخشِ «مدیریت از پنل» — admin/ads.php از همین تابع‌ها استفاده می‌کند.
   هر تابع به‌جای استثنا، «پیام خطای فارسی» برمی‌گرداند (رشته‌ی خالی = موفق)
   تا صفحه‌ی پنل بتواند همان پیام را به مدیر نشان دهد.
   ════════════════════════════════════════════════════════════════════════════ */

/** یک تبلیغ بر اساس شناسه (یا null) */
function eplakAdsGetById(PDO $pdo, int $adId): ?array
{
    if ($adId <= 0 || !is_array(eplakAdsTableColumns($pdo))) {
        return null;
    }
    try {
        $st = $pdo->prepare('SELECT * FROM ' . EPLAK_ADS_TABLE . ' WHERE id = ? LIMIT 1');
        $st->execute([$adId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) {
        error_log('[eplak][ads] getById failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * اعتبارسنجی و پاک‌سازیِ ورودیِ فرمِ پنل.
 *
 * @param array<string,mixed> $input
 * @return array{ok:bool,error:string,data:array<string,mixed>}
 */
function eplakAdsValidateInput(array $input): array
{
    $out = ['ok' => false, 'error' => '', 'data' => []];

    $placement = eplakAdsNormalizePlacement((string) ($input['placement'] ?? ''));
    if ($placement === '') {
        $out['error'] = 'جای بنر را انتخاب کنید (خانه — بنر بزرگ / خانه — بنر میانی / داشبورد — بنر باریک).';
        return $out;
    }

    $title = trim((string) ($input['title'] ?? ''));
    if ($title === '' ) {
        $out['error'] = 'عنوان تبلیغ الزامی است (در پنل و برای خواندنِ صفحه‌خوانِ گوشی استفاده می‌شود).';
        return $out;
    }
    if (mb_strlen($title) > 255) {
        $out['error'] = 'عنوان تبلیغ بیش از حد بلند است (حداکثر ۲۵۵ نویسه).';
        return $out;
    }

    $image = trim(str_replace('\\', '/', (string) ($input['image_path'] ?? '')));
    if ($image === '') {
        $out['error'] = 'تصویر تبلیغ الزامی است: یا از سیستم آپلود کنید یا نشانی/مسیر تصویر را بنویسید.';
        return $out;
    }
    /* هیچ‌وقت مسیرِ «بالارونده» پذیرفته نشود (../../etc/passwd) */
    if (strpos($image, '..') !== false) {
        $out['error'] = 'مسیر تصویر معتبر نیست.';
        return $out;
    }
    if (mb_strlen($image) > 500) {
        $out['error'] = 'مسیر تصویر بیش از حد بلند است.';
        return $out;
    }

    $link = trim((string) ($input['link_url'] ?? ''));
    if (!eplakAdLinkAllowed($link)) {
        $out['error'] = 'لینک تبلیغ باید با http:// یا https:// شروع شود (یا خالی بماند تا بنر بدون لینک باشد).';
        return $out;
    }

    $alt = trim((string) ($input['alt_text'] ?? ''));
    if (mb_strlen($alt) > 255) {
        $alt = mb_substr($alt, 0, 255);
    }

    $sortOrder = (int) ($input['sort_order'] ?? 0);
    if ($sortOrder < 0) {
        $sortOrder = 0;
    }
    if ($sortOrder > 9999) {
        $sortOrder = 9999;
    }

    $out['ok'] = true;
    $out['data'] = [
        'placement'  => $placement,
        'title'      => $title,
        'alt_text'   => $alt,
        'image_path' => $image,
        'image_webp' => trim(str_replace('\\', '/', (string) ($input['image_webp'] ?? ''))),
        'link_url'   => $link,
        'sort_order' => $sortOrder,
        'is_active'  => !empty($input['is_active']) ? 1 : 0,
    ];
    return $out;
}

/** درجِ یک تبلیغ تازه — خروجی: ['id'=>int,'error'=>string] */
function eplakAdsCreate(PDO $pdo, array $data): array
{
    $cols = eplakAdsTableColumns($pdo);
    if (!is_array($cols) || count($cols) === 0) {
        return ['id' => 0, 'error' => 'جدول تبلیغات در دیتابیس وجود ندارد؛ ابتدا «ترمیم ساختار دیتابیس» را بزنید.'];
    }
    $now = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
    $fields = [];
    $values = [];
    foreach ($data as $column => $value) {
        if (!in_array($column, $cols, true)) {
            continue;
        }
        $fields[] = $column;
        $values[] = $value;
    }
    if (in_array('click_count', $cols, true)) {
        $fields[] = 'click_count';
        $values[] = 0;
    }
    if (in_array('created_at', $cols, true)) {
        $fields[] = 'created_at';
        $values[] = $now;
    }
    if (in_array('updated_at', $cols, true)) {
        $fields[] = 'updated_at';
        $values[] = $now;
    }
    if (!$fields) {
        return ['id' => 0, 'error' => 'ستون‌های جدول تبلیغات با کد نمی‌خواند.'];
    }
    try {
        $sql = 'INSERT INTO ' . EPLAK_ADS_TABLE . ' (' . implode(', ', $fields) . ') VALUES (' . implode(', ', array_fill(0, count($fields), '?')) . ')';
        $pdo->prepare($sql)->execute($values);
        return ['id' => (int) $pdo->lastInsertId(), 'error' => ''];
    } catch (Throwable $e) {
        error_log('[eplak][ads] create failed: ' . $e->getMessage());
        return ['id' => 0, 'error' => 'ذخیره‌ی تبلیغ ناموفق بود: ' . $e->getMessage()];
    }
}

/** ویرایشِ یک تبلیغ — خروجی: ['ok'=>bool,'error'=>string] */
function eplakAdsUpdate(PDO $pdo, int $adId, array $data): array
{
    if (eplakAdsGetById($pdo, $adId) === null) {
        return ['ok' => false, 'error' => 'تبلیغ یافت نشد.'];
    }
    $cols = eplakAdsTableColumns($pdo);
    if (!is_array($cols)) {
        return ['ok' => false, 'error' => 'جدول تبلیغات در دیتابیس وجود ندارد.'];
    }
    $sets = [];
    $values = [];
    foreach ($data as $column => $value) {
        if (!in_array($column, $cols, true)) {
            continue;
        }
        $sets[] = $column . ' = ?';
        $values[] = $value;
    }
    if (!$sets) {
        return ['ok' => false, 'error' => 'چیزی برای ذخیره نبود.'];
    }
    if (in_array('updated_at', $cols, true)) {
        $sets[] = 'updated_at = ?';
        $values[] = function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s');
    }
    $values[] = $adId;
    try {
        $pdo->prepare('UPDATE ' . EPLAK_ADS_TABLE . ' SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($values);
        return ['ok' => true, 'error' => ''];
    } catch (Throwable $e) {
        error_log('[eplak][ads] update failed: ' . $e->getMessage());
        return ['ok' => false, 'error' => 'ذخیره‌ی تغییرها ناموفق بود: ' . $e->getMessage()];
    }
}

/** فعال/غیرفعال کردن — خروجی: پیام خطا یا رشته‌ی خالی */
function eplakAdsSetActive(PDO $pdo, int $adId, bool $active): string
{
    $row = eplakAdsGetById($pdo, $adId);
    if ($row === null) {
        return 'تبلیغ یافت نشد.';
    }
    $cols = (array) eplakAdsTableColumns($pdo);
    if (!in_array('is_active', $cols, true)) {
        return 'ستون «فعال بودن» در جدول تبلیغات نیست؛ «ترمیم ساختار دیتابیس» را بزنید.';
    }
    try {
        $pdo->prepare('UPDATE ' . EPLAK_ADS_TABLE . ' SET is_active = ? WHERE id = ?')->execute([$active ? 1 : 0, $adId]);
        return '';
    } catch (Throwable $e) {
        error_log('[eplak][ads] setActive failed: ' . $e->getMessage());
        return 'تغییر وضعیت ناموفق بود: ' . $e->getMessage();
    }
}

/**
 * جابه‌جاییِ ترتیب: ردیف‌های همان جای بنر به ترتیبِ (sort_order, id) خوانده
 * می‌شوند، جای این تبلیغ با همسایه‌اش عوض می‌شود و شماره‌های ترتیب از نو
 * ۱..N نوشته می‌شوند (پس ترتیبِ تکراری/شکسته هم خودش ترمیم می‌شود).
 *
 * @param int $delta  -1 = بالا (زودتر دیده شود)، +1 = پایین
 * @return string پیام خطا یا رشته‌ی خالی
 */
function eplakAdsMove(PDO $pdo, int $adId, int $delta): string
{
    $row = eplakAdsGetById($pdo, $adId);
    if ($row === null) {
        return 'تبلیغ یافت نشد.';
    }
    $placement = eplakAdsNormalizePlacement((string) ($row['placement'] ?? ''));
    if ($placement === '') {
        return 'جای بنرِ این تبلیغ معتبر نیست.';
    }
    $cols = (array) eplakAdsTableColumns($pdo);
    if (!in_array('sort_order', $cols, true)) {
        return 'ستون «ترتیب» در جدول تبلیغات نیست؛ «ترمیم ساختار دیتابیس» را بزنید.';
    }
    try {
        $st = $pdo->prepare('SELECT id FROM ' . EPLAK_ADS_TABLE . ' WHERE placement = ? ORDER BY sort_order, id');
        $st->execute([$placement]);
        $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $index = array_search($adId, $ids, true);
        if ($index === false) {
            return 'تبلیغ در فهرستِ این جای بنر پیدا نشد.';
        }
        $target = $index + ($delta < 0 ? -1 : 1);
        if ($target < 0 || $target >= count($ids)) {
            return $delta < 0 ? 'این تبلیغ همین حالا اولِ این جای بنر است.' : 'این تبلیغ همین حالا آخرِ این جای بنر است.';
        }
        $tmp = $ids[$index];
        $ids[$index] = $ids[$target];
        $ids[$target] = $tmp;

        $update = $pdo->prepare('UPDATE ' . EPLAK_ADS_TABLE . ' SET sort_order = ? WHERE id = ?');
        $pdo->beginTransaction();
        foreach ($ids as $i => $id) {
            $update->execute([$i + 1, $id]);
        }
        $pdo->commit();
        return '';
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            try {
                $pdo->rollBack();
            } catch (Throwable $ignored) {
                /* بی‌ضرر */
            }
        }
        error_log('[eplak][ads] move failed: ' . $e->getMessage());
        return 'تغییر ترتیب ناموفق بود: ' . $e->getMessage();
    }
}

/**
 * حذفِ یک تبلیغ: لاگِ کلیک‌هایش هم پاک می‌شود و اگر تصویرش «آپلودشده»
 * (uploads/ads/…) بود، فایلش هم برداشته می‌شود. تصویرهای assets/… که بخشی از
 * بسته‌ی اپ‌اند هرگز پاک نمی‌شوند.
 */
function eplakAdsDelete(PDO $pdo, int $adId): string
{
    $row = eplakAdsGetById($pdo, $adId);
    if ($row === null) {
        return 'تبلیغ یافت نشد.';
    }
    try {
        $pdo->prepare('DELETE FROM ' . EPLAK_ADS_TABLE . ' WHERE id = ?')->execute([$adId]);
    } catch (Throwable $e) {
        error_log('[eplak][ads] delete failed: ' . $e->getMessage());
        return 'حذف تبلیغ ناموفق بود: ' . $e->getMessage();
    }
    if (eplakAdsClicksReady($pdo)) {
        try {
            $pdo->prepare('DELETE FROM ' . EPLAK_ADS_CLICKS_TABLE . ' WHERE ad_id = ?')->execute([$adId]);
        } catch (Throwable $e) {
            error_log('[eplak][ads] click log cleanup failed: ' . $e->getMessage());
        }
    }
    eplakAdsDeleteUploadedImage((string) ($row['image_path'] ?? ''));
    eplakAdsDeleteUploadedImage((string) ($row['image_webp'] ?? ''));
    return '';
}

/** پاک کردنِ فایلِ آپلودشده‌ی یک تبلیغ — فقط داخل uploads/ads */
function eplakAdsDeleteUploadedImage(string $path): bool
{
    $path = trim(str_replace('\\', '/', $path));
    if ($path === '' || stripos($path, 'uploads/ads/') !== 0 || strpos($path, '..') !== false) {
        return false;   /* تصویرِ داخل بسته‌ی اپ یا نشانی بیرونی — دست نمی‌زنیم */
    }
    if (!defined('EPLAK_ROOT')) {
        return false;
    }
    $absolute = realpath(EPLAK_ROOT . '/' . ltrim($path, '/'));
    $base = realpath(EPLAK_ROOT . '/uploads/ads');
    if ($absolute === false || $base === false || strpos($absolute, $base . DIRECTORY_SEPARATOR) !== 0) {
        return false;
    }
    return @unlink($absolute);
}

/**
 * ردیف‌های پنل: همه‌ی تبلیغ‌ها (فعال و غیرفعال) به ترتیبِ جای بنر و ترتیب،
 * همراه با آمارِ کلیک.
 *
 * @return array{rows:array<int,array<string,mixed>>,degraded:array<int,string>,hint:string}
 */
function eplakAdsAdminRows(PDO $pdo): array
{
    $list = eplakAdsList($pdo, '', false);
    $rows = $list['items'];
    $ids = [];
    foreach ($rows as $row) {
        $ids[] = (int) ($row['id'] ?? 0);
    }
    $stats = eplakAdsClickStats($pdo, $ids);
    foreach ($rows as &$row) {
        $id = (int) ($row['id'] ?? 0);
        $row['click_stats'] = $stats[$id] ?? ['count' => 0, 'ips' => 0, 'last' => ''];
    }
    unset($row);
    return ['rows' => $rows, 'degraded' => $list['degraded'], 'hint' => $list['hint']];
}

/** نشانیِ نمایشِ تصویر در پنل (نسبی به پوشه‌ی admin) */
function eplakAdsAdminPreviewUrl(string $path): string
{
    $path = trim(str_replace('\\', '/', $path));
    if ($path === '') {
        return '';
    }
    if (preg_match('#^(https?:)?//#i', $path) || strpos($path, 'data:') === 0) {
        return $path;
    }
    return '../' . ltrim($path, '/');
}

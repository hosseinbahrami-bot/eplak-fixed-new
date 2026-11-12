<?php
/* ============================================================================
   shared/analytics.php — «آمارِ سایت و دانلودها» برای پنلِ مدیریت
   ============================================================================
   چرا این فایل هست؟
     کارفرما یک بخشِ کاملِ آمار خواست: بازدیدِ سایت، تعدادِ دانلودها، نمودارهای
     روزانه/ماهانه/سالانه، تعدادِ کاربرها و … . تا پیش از این هیچ‌جا «بازدیدِ
     سایتِ معرفی» شمرده نمی‌شد؛ چون سایتِ روت یک بسته‌ی «فقط خواندنی» است
     (api/*.php هیچ نوشتاری روی دیتابیس انجام نمی‌دهد).

     پس دو تکه لازم بود:
       ۱) یک گردآورِ رویداد در خودِ سامانه: api/track.php (نوشتن فقط این‌جا،
          داخلِ همان bootstrap و همان دیتابیسِ سامانه)
       ۲) یک لایه‌ی خواندن/تجمیع برای پنل: همین فایل + admin/analytics.php

   چه چیزی شمرده می‌شود؟
     view      → بازدیدِ صفحه‌ی معرفی (www.eplak.ir/) با بخش/صفحه‌ی دیده‌شده
     download  → کلیک روی دکمه‌ی «دانلود مستقیمِ اندروید (APK)» یا «نسخه‌ی PWA»
     qr        → کلیک روی کدِ QRِ همان دو نسخه
     (بقیه‌ی آمار — کاربران، گزارش‌ها، تیکت‌ها، دستگاه‌های اعلان، کلیکِ
      تبلیغات — از جدول‌های «موجودِ» سامانه خوانده می‌شود، پس هیچ دستکاریِ
      دیگری در اپ یا APIِ آن لازم نبوده است.)

   قاعده‌هایی که عمداً رعایت شده‌اند
     • IP «خام» ذخیره نمی‌شود؛ فقط هشِ HMAC (مثلِ shared/ads.php برای کلیک‌ها).
     • ضدِ تورم: سه لایه — (الف) بازدیدِ تکراریِ یک نفر از یک صفحه در ۳۰ ثانیه
       یکی شمرده می‌شود، (ب) کلیکِ تکراری در ۱۰ ثانیه، (پ) سقفِ ۳۰۰ رویداد در
       روز برای هر IP (اگر کسی خواست آمار را باد کند، نمودار خراب نشود).
     • ربات‌ها (Googlebot، curl، python و …) اصلاً ذخیره نمی‌شوند.
     • همه‌ی کوئری‌ها «قابلِ حمل»‌اند: همان SQL هم روی MySQL هاست کار می‌کند هم
       روی SQLiteِ آزمون‌ها (بدون DATE_FORMAT/CONCAT/LPAD که فقط MySQL دارد).
     • هیچ تابعی خطا پرتاب نمی‌کند: اگر جدول/ستون/دیتابیس نبود، آمارِ «خالی»
       برمی‌گردد تا صفحه‌ی پنل سفید یا ۵۰۰ نشود (همان درسِ api/news.php).
     • تاریخ‌ها شمسی و ساعت‌ها به وقتِ تهران (shared/fa_datetime.php).
   ============================================================================ */

require_once __DIR__ . '/fa_datetime.php';

if (!defined('EPLAK_ANALYTICS_TABLE'))         define('EPLAK_ANALYTICS_TABLE', 'site_stats');
if (!defined('EPLAK_ANALYTICS_VIEW_DEDUPE'))   define('EPLAK_ANALYTICS_VIEW_DEDUPE', 30);    /* ثانیه */
if (!defined('EPLAK_ANALYTICS_CLICK_DEDUPE'))  define('EPLAK_ANALYTICS_CLICK_DEDUPE', 10);   /* ثانیه */
if (!defined('EPLAK_ANALYTICS_DAILY_CAP'))     define('EPLAK_ANALYTICS_DAILY_CAP', 300);     /* رویداد در روز برای هر IP */
if (!defined('EPLAK_ANALYTICS_KEEP_DAYS'))     define('EPLAK_ANALYTICS_KEEP_DAYS', 1095);    /* ~۳ سال نمودارِ سالانه */
if (!defined('EPLAK_ANALYTICS_ONLINE_WINDOW')) define('EPLAK_ANALYTICS_ONLINE_WINDOW', 300); /* «الان آنلاین» = ۵ دقیقه */
if (!defined('EPLAK_ANALYTICS_IP_SALT'))       define('EPLAK_ANALYTICS_IP_SALT', 'eplak-site-analytics');
if (!defined('EPLAK_ANALYTICS_GH_RELEASE'))    define('EPLAK_ANALYTICS_GH_RELEASE', 'https://api.github.com/repos/hosseinbahrami-bot/eplak-fixed-new/releases/tags/v2.0-eplak-update');
if (!defined('EPLAK_ANALYTICS_GH_ASSET'))      define('EPLAK_ANALYTICS_GH_ASSET', 'eplak-app.apk');
if (!defined('EPLAK_ANALYTICS_GH_CACHE'))      define('EPLAK_ANALYTICS_GH_CACHE', 21600);    /* ۶ ساعت کش */

/** نامِ فارسیِ ماه‌های شمسی (برای برچسبِ نمودارِ ماهانه) */
function eplakAnalyticsFaMonths(): array
{
    return ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
            'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
}

/** نامِ فارسیِ روزهای هفته — کلید، شماره‌ی ISOِ میلادی (N) است */
function eplakAnalyticsFaWeekdays(): array
{
    return [6 => 'شنبه', 7 => 'یکشنبه', 1 => 'دوشنبه', 2 => 'سه‌شنبه',
            3 => 'چهارشنبه', 4 => 'پنجشنبه', 5 => 'جمعه'];
}

/** ترتیبِ نمایشِ روزهای هفته در نقشه‌ی حرارتی (شنبه اول است) */
function eplakAnalyticsWeekdayOrder(): array
{
    return [6, 7, 1, 2, 3, 4, 5];
}

/** نوع‌های رویدادی که گردآور می‌پذیرد (هر چیز دیگر ⇒ 'view') */
function eplakAnalyticsKinds(): array
{
    return ['view', 'download', 'qr'];
}

/** برچسبِ فارسیِ نوعِ رویداد */
function eplakAnalyticsKindLabel(string $kind): string
{
    $labels = ['view' => 'بازدید', 'download' => 'دانلود', 'qr' => 'کدِ QR'];
    return $labels[$kind] ?? $kind;
}

/** برچسبِ فارسیِ هدف (target) — همان چیزی که در جدول و نمودار دیده می‌شود */
function eplakAnalyticsTargetLabel(string $kind, string $target): string
{
    $t = strtolower(trim($target));
    if ($kind === 'download' || $kind === 'qr') {
        $what = $t === 'pwa' ? 'نسخه‌ی PWA' : ($t === 'ipa' ? 'نسخه‌ی iOS' : 'اندروید (APK)');
        return ($kind === 'qr' ? 'کدِ QRِ ' : 'دانلودِ ') . $what;
    }
    if ($t === '' || $t === '/' || $t === 'home') {
        return 'صفحه‌ی اصلی';
    }
    if (strpos($t, '#') === 0) {
        $sections = [
            '#capabilities' => 'بخشِ امکانات',      '#citizen-card' => 'کارتِ شهروندی',
            '#news'         => 'اخبار و اطلاعیه‌ها', '#download'     => 'بخشِ دانلود',
            '#varamin-map'  => 'نقشه‌ی شهر',        '#about'        => 'درباره‌ی ای‌پلاک',
            '#departments'  => 'واحدها',            '#hero'         => 'صفحه‌ی اصلی',
        ];
        return $sections[$t] ?? ('بخشِ ' . str_replace('#', '', $t));
    }
    return $t;
}

/** IPِ درخواست — همان ترتیبِ shared/ads.php (پشتِ پروکسی/کلادفلر هم درست است) */
function eplakAnalyticsClientIp(): string
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

/** هشِ IP — خام ذخیره نمی‌شود (مثلِ آمارِ کلیکِ تبلیغات) */
function eplakAnalyticsHashIp(string $ip): string
{
    $ip = trim($ip);
    return $ip === '' ? '' : substr(hash_hmac('sha256', $ip, EPLAK_ANALYTICS_IP_SALT), 0, 32);
}

/** آیا این User-Agent ربات/ابزار است؟ (ربات‌ها اصلاً ذخیره نمی‌شوند) */
function eplakAnalyticsIsBot(string $ua): bool
{
    $ua = trim($ua);
    if ($ua === '') {
        return true;                      /* بدونِ UA ⇒ شمارش نمی‌شود */
    }
    $signs = ['bot', 'crawl', 'spider', 'slurp', 'curl', 'wget', 'python', 'httpie', 'go-http-client',
              'java/', 'okhttp', 'libwww', 'headless', 'lighthouse', 'phantomjs', 'selenium', 'scrapy',
              'facebookexternalhit', 'whatsapp', 'telegrambot', 'slackbot', 'discordbot', 'twitterbot',
              'linkedinbot', 'preview', 'feedfetcher', 'monitor', 'checker', 'scan', 'probe', 'pingdom',
              'uptime', 'yandex', 'baiduspider', 'duckduck', 'bingpreview', 'google-extended', 'petalbot',
              'mj12bot', 'semrush', 'ahrefs', 'dotbot', 'archive.org_bot', 'wayback'];
    $lower = strtolower($ua);
    foreach ($signs as $s) {
        if (strpos($lower, $s) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * دستگاه/مرورگر/سیستم‌عامل از User-Agent.
 * فقط برای آمار است؛ پس «ساده و خوانا» مهم‌تر از دقتِ صددرصد است.
 *
 * @return array{device:string,browser:string,os:string}
 */
function eplakAnalyticsParseUa(string $ua): array
{
    $u = trim($ua);
    $lower = strtolower($u);

    $device = 'desktop';
    if ($lower === '') {
        $device = 'unknown';
    } elseif (strpos($lower, 'ipad') !== false || strpos($lower, 'tablet') !== false
        || (strpos($lower, 'android') !== false && strpos($lower, 'mobile') === false)) {
        $device = 'tablet';
    } elseif (strpos($lower, 'mobile') !== false || strpos($lower, 'iphone') !== false
        || strpos($lower, 'android') !== false || strpos($lower, 'ipod') !== false) {
        $device = 'mobile';
    }

    /* ترتیب مهم است: Edge و Opera و Samsung هم «Chrome» را در UA دارند */
    $browser = 'دیگر';
    $browsers = [
        'edg'        => 'اج',
        'opr/'       => 'اپرا',
        'opera'      => 'اپرا',
        'samsungbrowser' => 'مرورگر سامسونگ',
        'firefox'    => 'فایرفاکس',
        'fxios'      => 'فایرفاکس',
        'crios'      => 'کروم',
        'chrome'     => 'کروم',
        'safari'     => 'سافاری',
    ];
    foreach ($browsers as $needle => $label) {
        if (strpos($lower, $needle) !== false) {
            $browser = $label;
            break;
        }
    }

    $os = 'دیگر';
    if (strpos($lower, 'windows') !== false) {
        $os = 'ویندوز';
    } elseif (strpos($lower, 'iphone') !== false || strpos($lower, 'ipad') !== false || strpos($lower, 'ios') !== false) {
        $os = 'آیفون/آیپد';
    } elseif (strpos($lower, 'android') !== false) {
        $os = 'اندروید';
    } elseif (strpos($lower, 'mac os') !== false || strpos($lower, 'macintosh') !== false) {
        $os = 'مک';
    } elseif (strpos($lower, 'linux') !== false) {
        $os = 'لینوکس';
    }

    return ['device' => $device, 'browser' => $browser, 'os' => $os];
}

/** برچسبِ فارسیِ دستگاه */
function eplakAnalyticsDeviceLabel(string $device): string
{
    $labels = ['mobile' => 'موبایل', 'tablet' => 'تبلت', 'desktop' => 'دسکتاپ', 'unknown' => 'نامشخص'];
    return $labels[$device] ?? $device;
}

/** فقط «دامنه‌ی» نشانیِ منبع (بدونِ مسیر و پرس‌وجو) — تا referrer چیزی را نشت ندهد */
function eplakAnalyticsRefHost(string $referrer): string
{
    $referrer = trim($referrer);
    if ($referrer === '') {
        return '';
    }
    $host = '';
    if (function_exists('parse_url')) {
        $host = (string) (parse_url($referrer, PHP_URL_HOST) ?: '');
    }
    if ($host === '' && preg_match('~^https?://([^/?#]+)~i', $referrer, $m)) {
        $host = $m[1];
    }
    $host = strtolower(preg_replace('/[^A-Za-z0-9.\-]/', '', $host));
    if ($host === '' || strpos($host, '.') === false) {
        return '';
    }
    if (strpos($host, 'www.') === 0) {
        $host = substr($host, 4);
    }
    return substr($host, 0, 120);
}

/** برچسبِ فارسیِ منبعِ ورود */
function eplakAnalyticsRefLabel(string $host): string
{
    if ($host === '') {
        return 'ورودِ مستقیم';
    }
    $known = ['google.' => 'گوگل', 'bing.' => 'بینگ', 'yandex.' => 'یاندکس', 'duckduckgo.' => 'داک‌داک‌گو',
              'instagram.' => 'اینستاگرام', 'telegram.' => 'تلگرام', 't.me' => 'تلگرام', 'whatsapp.' => 'واتس‌اپ',
              'twitter.' => 'توییتر', 'x.com' => 'توییتر', 'facebook.' => 'فیس‌بوک', 'linkedin.' => 'لینکدین',
              'aparat.' => 'آپارات', 'youtube.' => 'یوتیوب', 'eplak.ir' => 'خودِ سایت'];
    foreach ($known as $needle => $label) {
        if (strpos($host, $needle) !== false) {
            return $label;
        }
    }
    return $host;
}

/** پاک‌سازیِ متنِ آزادِ ارسالی (صفحه/هدف) — بدونِ HTML و بدونِ نویسه‌ی کنترلی */
function eplakAnalyticsCleanText($value, int $max): string
{
    $v = is_string($value) ? $value : '';
    $v = str_replace(["\r", "\n", "\t", "\0"], ' ', $v);
    $v = trim(strip_tags($v));
    $v = preg_replace('/\s+/u', ' ', $v);
    if ($v === null) {
        $v = '';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($v, 0, $max, 'UTF-8');
    }
    return substr($v, 0, $max);
}

/** شناسه‌ی بازدیدکننده: یا همان که سایت می‌فرستد (۳۲ نویسه‌ی هگز) یا هشِ IP+UA */
function eplakAnalyticsVisitorId($raw, string $ip, string $ua): string
{
    $raw = is_string($raw) ? strtolower(trim($raw)) : '';
    if (preg_match('/^[a-f0-9]{16,40}$/', $raw)) {
        return substr($raw, 0, 40);
    }
    $seed = $ip . '|' . substr($ua, 0, 120);
    return $seed === '|' ? '' : substr(hash_hmac('sha256', $seed, EPLAK_ANALYTICS_IP_SALT . '|visitor'), 0, 32);
}

/** آیا جدولِ آمار هست؟ (بدونِ خطا، برای حالتِ «دیتابیس قدیمی/قطع») */
function eplakAnalyticsReady(?PDO $pdo): bool
{
    if (!($pdo instanceof PDO)) {
        return false;
    }
    static $cache = [];
    $key = spl_object_hash($pdo);
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        if (function_exists('eplakIsSqlite') && eplakIsSqlite($pdo)) {
            $st = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name='" . EPLAK_ANALYTICS_TABLE . "'");
            return $cache[$key] = (bool) $st->fetch();
        }
        $st = $pdo->prepare('SHOW TABLES LIKE :t');
        $st->execute([':t' => EPLAK_ANALYTICS_TABLE]);
        return $cache[$key] = (bool) $st->fetchColumn();
    } catch (Throwable $e) {
        return $cache[$key] = false;
    }
}

/** ساختِ جدول + ایندکس‌ها اگر نبودند (برای هاست‌هایی که از پیش نصب شده‌اند) */
function eplakAnalyticsEnsureSchema(PDO $pdo): bool
{
    if (eplakAnalyticsReady($pdo)) {
        return true;
    }
    $sqlite = function_exists('eplakIsSqlite') && eplakIsSqlite($pdo);
    $ddl = $sqlite
        ? 'CREATE TABLE IF NOT EXISTS ' . EPLAK_ANALYTICS_TABLE . " (\n"
            . "    id INTEGER PRIMARY KEY AUTOINCREMENT,\n"
            . "    visit_day VARCHAR(10) NOT NULL DEFAULT '',\n"
            . "    visit_hour INTEGER NOT NULL DEFAULT 0,\n"
            . "    kind VARCHAR(16) NOT NULL DEFAULT 'view',\n"
            . "    target VARCHAR(60) NOT NULL DEFAULT '',\n"
            . "    page VARCHAR(180) NOT NULL DEFAULT '',\n"
            . "    visitor VARCHAR(40) NOT NULL DEFAULT '',\n"
            . "    ip_hash VARCHAR(64) NOT NULL DEFAULT '',\n"
            . "    device VARCHAR(12) NOT NULL DEFAULT '',\n"
            . "    browser VARCHAR(30) NOT NULL DEFAULT '',\n"
            . "    os VARCHAR(30) NOT NULL DEFAULT '',\n"
            . "    ref_host VARCHAR(120) NOT NULL DEFAULT '',\n"
            . "    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n"
            . ')'
        : 'CREATE TABLE IF NOT EXISTS ' . EPLAK_ANALYTICS_TABLE . " (\n"
            . '    id INT AUTO_INCREMENT PRIMARY KEY,' . "\n"
            . "    visit_day VARCHAR(10) NOT NULL DEFAULT '',\n"
            . '    visit_hour INT NOT NULL DEFAULT 0,' . "\n"
            . "    kind VARCHAR(16) NOT NULL DEFAULT 'view',\n"
            . "    target VARCHAR(60) NOT NULL DEFAULT '',\n"
            . "    page VARCHAR(180) NOT NULL DEFAULT '',\n"
            . "    visitor VARCHAR(40) NOT NULL DEFAULT '',\n"
            . "    ip_hash VARCHAR(64) NOT NULL DEFAULT '',\n"
            . "    device VARCHAR(12) NOT NULL DEFAULT '',\n"
            . "    browser VARCHAR(30) NOT NULL DEFAULT '',\n"
            . "    os VARCHAR(30) NOT NULL DEFAULT '',\n"
            . "    ref_host VARCHAR(120) NOT NULL DEFAULT '',\n"
            . '    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP' . "\n"
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    try {
        if (function_exists('eplakCreateTable')) {
            eplakCreateTable($pdo, $ddl);      /* exec + ثبت در فهرستِ همگام‌سازیِ اسکیما */
        } else {
            $pdo->exec($ddl);
        }
    } catch (Throwable $e) {
        error_log('[eplak][analytics] ensure schema failed: ' . $e->getMessage());
        return false;
    }
    foreach ([
        'idx_site_stats_day ON ' . EPLAK_ANALYTICS_TABLE . '(visit_day, kind)',
        'idx_site_stats_visitor ON ' . EPLAK_ANALYTICS_TABLE . '(visitor, visit_day)',
        'idx_site_stats_ip ON ' . EPLAK_ANALYTICS_TABLE . '(ip_hash, visit_day)',
    ] as $idx) {
        try {
            $pdo->exec('CREATE ' . ($sqlite ? 'INDEX IF NOT EXISTS ' : 'INDEX ') . $idx);
        } catch (Throwable $e) {
            /* ایندکس تکراری یا نبودِ اجازه — آمار بدونِ آن هم کار می‌کند */
        }
    }
    return eplakAnalyticsReady($pdo);
}

/**
 * ثبتِ یک رویدادِ آمار.
 *
 * @param array $e کلیدها: kind, target, page, referrer, visitor, ip, ua, now
 * @return array{counted:bool,reason:string,id:int}
 *         reason: '' | bot | bad_kind | no_table | throttled | daily_cap | failed | no_visitor
 */
function eplakAnalyticsTrack(PDO $pdo, array $e): array
{
    $out = ['counted' => false, 'reason' => '', 'id' => 0];

    $kind = strtolower(trim((string) ($e['kind'] ?? 'view')));
    if (!in_array($kind, eplakAnalyticsKinds(), true)) {
        $out['reason'] = 'bad_kind';
        return $out;
    }
    $ua = (string) ($e['ua'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if (eplakAnalyticsIsBot($ua)) {
        $out['reason'] = 'bot';
        return $out;
    }
    if (!eplakAnalyticsEnsureSchema($pdo)) {
        $out['reason'] = 'no_table';
        return $out;
    }

    $ip     = (string) ($e['ip'] ?? eplakAnalyticsClientIp());
    $ipHash = eplakAnalyticsHashIp($ip);
    $parsed = eplakAnalyticsParseUa($ua);
    $target = eplakAnalyticsCleanText($e['target'] ?? '', 60);
    $page   = eplakAnalyticsCleanText($e['page'] ?? '', 180);
    if ($page === '') {
        $page = $target;      /* «پربازدیدترین بخش‌ها» هیچ‌وقت بی‌برچسب نماند */
    }
    $ref    = eplakAnalyticsRefHost((string) ($e['referrer'] ?? ''));
    $visitor = eplakAnalyticsVisitorId($e['visitor'] ?? '', $ip, $ua);
    if ($visitor === '') {
        $out['reason'] = 'no_visitor';
        return $out;
    }
    if ($kind !== 'view') {
        $target = strtolower($target);
        if (!in_array($target, ['apk', 'pwa', 'ipa', 'qr:apk', 'qr:pwa'], true)) {
            $target = strpos($target, 'pwa') !== false ? 'pwa' : 'apk';
        }
    }

    /* زمانِ رویداد از همان ساعتِ دیتابیس (تهران) ⇒ روز/ساعت با created_at یکی است */
    $now = isset($e['now']) && is_string($e['now']) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $e['now'])
        ? $e['now']
        : (function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : date('Y-m-d H:i:s'));
    $day  = substr($now, 0, 10);
    $hour = (int) substr($now, 11, 2);

    try {
        /* ضدِ تورم ۱: سقفِ روزانه‌ی هر IP */
        if ($ipHash !== '') {
            $st = $pdo->prepare('SELECT COUNT(*) FROM ' . EPLAK_ANALYTICS_TABLE
                . ' WHERE ip_hash = ? AND visit_day = ?');
            $st->execute([$ipHash, $day]);
            if ((int) $st->fetchColumn() >= EPLAK_ANALYTICS_DAILY_CAP) {
                $out['reason'] = 'daily_cap';
                return $out;
            }
        }
        /* ضدِ تورم ۲: رویدادِ تکراریِ همان بازدیدکننده در پنجره‌ی کوتاه */
        $window = $kind === 'view' ? EPLAK_ANALYTICS_VIEW_DEDUPE : EPLAK_ANALYTICS_CLICK_DEDUPE;
        if ($window > 0) {
            $cutoff = function_exists('eplakDbAgoString')
                ? eplakDbAgoString($window, $pdo)
                : date('Y-m-d H:i:s', time() - $window);
            $st = $pdo->prepare('SELECT id FROM ' . EPLAK_ANALYTICS_TABLE
                . ' WHERE visitor = ? AND kind = ? AND target = ? AND created_at >= ? LIMIT 1');
            $st->execute([$visitor, $kind, $target, $cutoff]);
            if ($st->fetch(PDO::FETCH_ASSOC)) {
                $out['reason'] = 'throttled';
                return $out;
            }
        }

        $st = $pdo->prepare('INSERT INTO ' . EPLAK_ANALYTICS_TABLE
            . ' (visit_day, visit_hour, kind, target, page, visitor, ip_hash, device, browser, os, ref_host, created_at)'
            . ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute([$day, $hour, $kind, $target, $page, $visitor, $ipHash,
                      $parsed['device'], $parsed['browser'], $parsed['os'], $ref, $now]);
        $out['counted'] = true;
        $out['id'] = (int) $pdo->lastInsertId();
        return $out;
    } catch (Throwable $ex) {
        error_log('[eplak][analytics] track failed: ' . $ex->getMessage());
        $out['reason'] = 'failed';
        return $out;
    }
}

/* ── بازه‌ها ─────────────────────────────────────────────────────────────── */

/** بازه‌های آماده‌ی صفحه (کلید ← روزها و برچسب) */
function eplakAnalyticsRanges(): array
{
    return [
        'today' => ['days' => 1,   'label' => 'امروز'],
        '7'     => ['days' => 7,   'label' => '۷ روز'],
        '30'    => ['days' => 30,  'label' => '۳۰ روز'],
        '90'    => ['days' => 90,  'label' => '۹۰ روز'],
        '365'   => ['days' => 365, 'label' => '۱۲ ماه'],
        'all'   => ['days' => 0,   'label' => 'همه'],
    ];
}

/** امروزِ دیتابیس (تهران) به شکلِ Y-m-d */
function eplakAnalyticsToday(?PDO $pdo = null): string
{
    try {
        $now = $pdo === null
            ? new DateTimeImmutable('now', function_exists('eplakDbTimezone') ? eplakDbTimezone() : new DateTimeZone('Asia/Tehran'))
            : new DateTimeImmutable(function_exists('eplakDbNowString') ? eplakDbNowString($pdo) : 'now',
                function_exists('eplakDbTimezone') ? eplakDbTimezone() : new DateTimeZone('Asia/Tehran'));
        return $now->format('Y-m-d');
    } catch (Throwable $e) {
        return date('Y-m-d');
    }
}

/**
 * بازه‌ی انتخابی ← ['from','to','days','label','key']
 * $range: today|7|30|90|365|all
 */
function eplakAnalyticsDayRange(string $range, ?PDO $pdo = null): array
{
    $ranges = eplakAnalyticsRanges();
    if (!isset($ranges[$range])) {
        $range = '30';
    }
    $to   = eplakAnalyticsToday($pdo);
    $days = (int) $ranges[$range]['days'];
    if ($days <= 0) {
        $from = '2000-01-01';
        try {
            if ($pdo !== null && eplakAnalyticsReady($pdo)) {
                $st = $pdo->query('SELECT MIN(visit_day) FROM ' . EPLAK_ANALYTICS_TABLE);
                $min = (string) $st->fetchColumn();
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $min)) {
                    $from = $min;
                }
            }
        } catch (Throwable $e) {
            /* همان پیش‌فرض */
        }
        $days = max(1, (int) floor((strtotime($to) - strtotime($from)) / 86400) + 1);
    } else {
        $from = date('Y-m-d', strtotime($to) - ($days - 1) * 86400);
    }
    return ['from' => $from, 'to' => $to, 'days' => $days, 'label' => $ranges[$range]['label'], 'key' => $range];
}

/** دانه‌بندیِ مجاز: day|month|year */
function eplakAnalyticsGranularity(string $g): string
{
    $g = strtolower(trim($g));
    return in_array($g, ['day', 'month', 'year'], true) ? $g : 'day';
}

/** برچسبِ دانه‌بندی */
function eplakAnalyticsGranularityLabel(string $g): string
{
    return ['day' => 'روزانه', 'month' => 'ماهانه', 'year' => 'سالانه'][$g] ?? $g;
}

/* ── برچسبِ شمسیِ محورِ نمودار ───────────────────────────────────────────── */

/** «۱۴۰۴/۰۸/۲۱» یا در نمودارِ فشرده «۲۱ آبان» */
function eplakAnalyticsJalaliDay(string $ymd, bool $short = false): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string) $ymd, $m)) {
        return (string) $ymd;
    }
    [$jy, $jm, $jd] = eplakGregorianToJalali((int) $m[1], (int) $m[2], (int) $m[3]);
    if ($short) {
        $months = eplakAnalyticsFaMonths();
        return eplakFaDigits(sprintf('%d %s', $jd, $months[max(1, min(12, $jm)) - 1]));
    }
    return eplakFaDigits(sprintf('%04d/%02d/%02d', $jy, $jm, $jd));
}

/** «آبان ۱۴۰۴» از «2026-11» */
function eplakAnalyticsJalaliMonth(string $ym): string
{
    if (!preg_match('/^(\d{4})-(\d{2})$/', (string) $ym, $m)) {
        return (string) $ym;
    }
    [$jy, $jm] = eplakGregorianToJalali((int) $m[1], (int) $m[2], 15);
    $months = eplakAnalyticsFaMonths();
    return eplakFaDigits($months[max(1, min(12, $jm)) - 1] . ' ' . $jy);
}

/** «۱۴۰۴» از «2026» */
function eplakAnalyticsJalaliYear(string $y): string
{
    if (!preg_match('/^\d{4}$/', (string) $y, $m)) {
        return (string) $y;
    }
    [$jy] = eplakGregorianToJalali((int) $m[0], 6, 15);
    return eplakFaDigits((string) $jy);
}

/** برچسبِ شمسیِ هر کلید، بسته به دانه‌بندی */
function eplakAnalyticsLabel(string $granularity, string $key, bool $short = false): string
{
    if ($granularity === 'month') {
        return eplakAnalyticsJalaliMonth($key);
    }
    if ($granularity === 'year') {
        return eplakAnalyticsJalaliYear($key);
    }
    return eplakAnalyticsJalaliDay($key, $short);
}

/* ── تجمیع‌ها (همه با try/catch ⇒ صفحه هرگز نمی‌شکند) ───────────────────── */

/** کلیدهای SQLِ دوره: day ⇒ visit_day، month ⇒ SUBSTR(…,1,7)، year ⇒ SUBSTR(…,1,4) */
function eplakAnalyticsBucketExpr(string $granularity): string
{
    if ($granularity === 'month') {
        return 'SUBSTR(visit_day, 1, 7)';
    }
    if ($granularity === 'year') {
        return 'SUBSTR(visit_day, 1, 4)';
    }
    return 'visit_day';
}

/** فهرستِ کلیدهای پیوسته‌ی یک بازه (برای پُر کردنِ جایِ خالیِ روزهای بی‌رویداد) */
function eplakAnalyticsBucketKeys(string $granularity, string $from, string $to): array
{
    $keys = [];
    $start = strtotime($from . ' 00:00:00');
    $end   = strtotime($to . ' 00:00:00');
    if ($start === false || $end === false || $end < $start) {
        return $keys;
    }
    if ($granularity === 'year') {
        for ($t = $start; $t <= $end; $t = strtotime('+1 year', $t)) {
            $keys[] = date('Y', $t);
        }
        return $keys;
    }
    if ($granularity === 'month') {
        for ($t = $start; $t <= $end; $t = strtotime('+1 month', $t)) {
            $keys[] = date('Y-m', $t);
        }
        return $keys;
    }
    for ($t = $start; $t <= $end; $t = strtotime('+1 day', $t)) {
        $keys[] = date('Y-m-d', $t);
    }
    return $keys;
}

/**
 * سریِ زمانیِ کامل (با جایِ خالی پُرشده):
 * [['key'=>'2026-11-12','label'=>'۱۴۰۴/۰۸/۲۱','views'=>12,'uniques'=>8,'downloads'=>3,'qr'=>1], …]
 */
function eplakAnalyticsSeries(PDO $pdo, string $granularity, string $from, string $to): array
{
    $keys = eplakAnalyticsBucketKeys($granularity, $from, $to);
    $rows = [];
    foreach ($keys as $k) {
        $rows[$k] = ['key' => $k, 'label' => eplakAnalyticsLabel($granularity, $k, count($keys) > 14),
                     'views' => 0, 'uniques' => 0, 'downloads' => 0, 'qr' => 0];
    }
    if (!eplakAnalyticsReady($pdo)) {
        return array_values($rows);
    }
    $bucket = eplakAnalyticsBucketExpr($granularity);
    try {
        $sql = 'SELECT ' . $bucket . ' AS k, kind, COUNT(*) AS c, COUNT(DISTINCT visitor) AS u'
             . ' FROM ' . EPLAK_ANALYTICS_TABLE
             . ' WHERE visit_day >= ? AND visit_day <= ?'
             . ' GROUP BY ' . $bucket . ', kind';
        $st = $pdo->prepare($sql);
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $k = (string) $r['k'];
            if (!isset($rows[$k])) {
                continue;
            }
            $kind = (string) $r['kind'];
            if ($kind === 'view') {
                $rows[$k]['views']   = (int) $r['c'];
                $rows[$k]['uniques'] = (int) $r['u'];
            } elseif ($kind === 'download') {
                $rows[$k]['downloads'] = (int) $r['c'];
            } elseif ($kind === 'qr') {
                $rows[$k]['qr'] = (int) $r['c'];
            }
        }
        /* «یکتا» در دانه‌بندیِ ماه/سال از رویِ خودِ روزها جمع نمی‌شود (یک نفر در
           چند روز می‌آید) ⇒ یک کوئریِ جدا برایِ یکتای کلِ دوره */
        if ($granularity !== 'day' && count($rows) > 0) {
            $st = $pdo->prepare('SELECT ' . $bucket . ' AS k, COUNT(DISTINCT visitor) AS u'
                . ' FROM ' . EPLAK_ANALYTICS_TABLE
                . ' WHERE visit_day >= ? AND visit_day <= ? AND kind = ?'
                . ' GROUP BY ' . $bucket);
            $st->execute([$from, $to, 'view']);
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
                if (isset($rows[(string) $r['k']])) {
                    $rows[(string) $r['k']]['uniques'] = (int) $r['u'];
                }
            }
        }
    } catch (Throwable $e) {
        error_log('[eplak][analytics] series failed: ' . $e->getMessage());
    }
    return array_values($rows);
}

/** آمارِ کلِ دوره: بازدید، یکتا، دانلودها، QR، سهمِ موبایل */
function eplakAnalyticsTotals(PDO $pdo, string $from, string $to): array
{
    $t = ['views' => 0, 'uniques' => 0, 'downloads' => 0, 'qr' => 0,
          'apk' => 0, 'pwa' => 0, 'mobile' => 0, 'desktop' => 0, 'tablet' => 0, 'events' => 0];
    if (!eplakAnalyticsReady($pdo)) {
        return $t;
    }
    try {
        $st = $pdo->prepare('SELECT kind, COUNT(*) AS c, COUNT(DISTINCT visitor) AS u'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE . ' WHERE visit_day >= ? AND visit_day <= ? GROUP BY kind');
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $t['events'] += (int) $r['c'];
            if ($r['kind'] === 'view') {
                $t['views'] = (int) $r['c'];
                $t['uniques'] = (int) $r['u'];
            } elseif ($r['kind'] === 'download') {
                $t['downloads'] = (int) $r['c'];
            } elseif ($r['kind'] === 'qr') {
                $t['qr'] = (int) $r['c'];
            }
        }
        $st = $pdo->prepare('SELECT target, COUNT(*) AS c FROM ' . EPLAK_ANALYTICS_TABLE
            . " WHERE visit_day >= ? AND visit_day <= ? AND kind IN ('download','qr') GROUP BY target");
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (strpos((string) $r['target'], 'pwa') !== false) {
                $t['pwa'] += (int) $r['c'];
            } else {
                $t['apk'] += (int) $r['c'];
            }
        }
        $st = $pdo->prepare('SELECT device, COUNT(*) AS c FROM ' . EPLAK_ANALYTICS_TABLE
            . " WHERE visit_day >= ? AND visit_day <= ? AND kind = 'view' GROUP BY device");
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $d = (string) $r['device'];
            if (isset($t[$d])) {
                $t[$d] = (int) $r['c'];
            }
        }
    } catch (Throwable $e) {
        error_log('[eplak][analytics] totals failed: ' . $e->getMessage());
    }
    return $t;
}

/** فهرستِ برترین‌ها (صفحه‌ها، مرورگرها، سیستم‌عامل‌ها، منابعِ ورود) */
function eplakAnalyticsTop(PDO $pdo, string $column, string $from, string $to, int $limit = 8, string $kind = 'view'): array
{
    $allowed = ['page', 'target', 'browser', 'os', 'device', 'ref_host'];
    if (!in_array($column, $allowed, true) || !eplakAnalyticsReady($pdo)) {
        return [];
    }
    $limit = max(1, min(50, $limit));
    try {
        $st = $pdo->prepare('SELECT ' . $column . ' AS k, COUNT(*) AS c, COUNT(DISTINCT visitor) AS u'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE
            . ' WHERE visit_day >= ? AND visit_day <= ? AND kind = ?'
            . ' GROUP BY ' . $column . ' ORDER BY c DESC, k ASC LIMIT ' . $limit);
        $st->execute([$from, $to, $kind]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[eplak][analytics] top failed: ' . $e->getMessage());
        return [];
    }
    $out = [];
    foreach ($rows as $r) {
        $key = (string) $r['k'];
        if ($key === '' && $column !== 'ref_host') {
            continue;                      /* صفحه‌ی بی‌نام، آمار را شلوغ نکند */
        }
        $out[] = ['key' => $key, 'count' => (int) $r['c'], 'uniques' => (int) $r['u']];
    }
    return $out;
}

/** توزیعِ ساعت‌های روز (۰..۲۳) — برای «ساعت‌های اوج» */
function eplakAnalyticsHourly(PDO $pdo, string $from, string $to): array
{
    $hours = array_fill(0, 24, 0);
    if (!eplakAnalyticsReady($pdo)) {
        return $hours;
    }
    try {
        $st = $pdo->prepare('SELECT visit_hour AS h, COUNT(*) AS c FROM ' . EPLAK_ANALYTICS_TABLE
            . ' WHERE visit_day >= ? AND visit_day <= ? GROUP BY visit_hour');
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $h = (int) $r['h'];
            if ($h >= 0 && $h <= 23) {
                $hours[$h] = (int) $r['c'];
            }
        }
    } catch (Throwable $e) {
        error_log('[eplak][analytics] hourly failed: ' . $e->getMessage());
    }
    return $hours;
}

/**
 * نقشه‌ی حرارتیِ «روزِ هفته × ساعت» (۷×۲۴).
 * خروجی: ['cells' => [[dow, hour, count], …], 'max' => int, 'days' => int]
 */
function eplakAnalyticsHeatmap(PDO $pdo, string $from, string $to): array
{
    $grid = [];
    foreach (eplakAnalyticsWeekdayOrder() as $dow) {
        for ($h = 0; $h < 24; $h++) {
            $grid[$dow][$h] = 0;
        }
    }
    $max = 0;
    $days = 0;
    if (!eplakAnalyticsReady($pdo)) {
        return ['cells' => $grid, 'max' => 0, 'days' => 0];
    }
    try {
        $st = $pdo->prepare('SELECT visit_day AS d, visit_hour AS h, COUNT(*) AS c'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE
            . ' WHERE visit_day >= ? AND visit_day <= ?'
            . ' GROUP BY visit_day, visit_hour');
        $st->execute([$from, $to]);
        $seen = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $day = (string) $r['d'];
            $ts  = strtotime($day . ' 12:00:00');
            if ($ts === false) {
                continue;
            }
            $seen[$day] = true;
            $dow = (int) date('N', $ts);
            $h   = (int) $r['h'];
            if (!isset($grid[$dow]) || $h < 0 || $h > 23) {
                continue;
            }
            $grid[$dow][$h] += (int) $r['c'];
            if ($grid[$dow][$h] > $max) {
                $max = $grid[$dow][$h];
            }
        }
        $days = count($seen);
    } catch (Throwable $e) {
        error_log('[eplak][analytics] heatmap failed: ' . $e->getMessage());
    }
    return ['cells' => $grid, 'max' => $max, 'days' => $days];
}

/** آخرین رویدادها (برای جدولِ «زنده») */
function eplakAnalyticsRecent(PDO $pdo, int $limit = 15): array
{
    if (!eplakAnalyticsReady($pdo)) {
        return [];
    }
    $limit = max(1, min(100, $limit));
    try {
        $st = $pdo->query('SELECT visit_day, visit_hour, kind, target, page, device, browser, os, ref_host, created_at'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE . ' ORDER BY id DESC LIMIT ' . $limit);
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[eplak][analytics] recent failed: ' . $e->getMessage());
        return [];
    }
}

/** چند نفر در ۵ دقیقه‌ی اخیر رویداد داشته‌اند («الان آنلاین») */
function eplakAnalyticsOnline(PDO $pdo, int $window = EPLAK_ANALYTICS_ONLINE_WINDOW): int
{
    if (!eplakAnalyticsReady($pdo)) {
        return 0;
    }
    try {
        $cutoff = function_exists('eplakDbAgoString')
            ? eplakDbAgoString($window, $pdo)
            : date('Y-m-d H:i:s', time() - $window);
        $st = $pdo->prepare('SELECT COUNT(DISTINCT visitor) FROM ' . EPLAK_ANALYTICS_TABLE . ' WHERE created_at >= ?');
        $st->execute([$cutoff]);
        return (int) $st->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

/** مقایسه با دوره‌ی قبل (برای نشانِ «رشد/افت») */
function eplakAnalyticsDeltas(array $now, array $prev): array
{
    $out = [];
    foreach (['views', 'uniques', 'downloads', 'qr', 'apk', 'pwa'] as $k) {
        $a = (int) ($now[$k] ?? 0);
        $b = (int) ($prev[$k] ?? 0);
        $diff = $a - $b;
        $pct = $b > 0 ? (int) round(($diff / $b) * 100) : ($a > 0 ? 100 : 0);
        $out[$k] = ['now' => $a, 'prev' => $b, 'diff' => $diff, 'pct' => $pct,
                    'dir' => $diff > 0 ? 'up' : ($diff < 0 ? 'down' : 'flat')];
    }
    return $out;
}

/* ── آمارِ «سامانه و اپ» از جدول‌های موجود (بدونِ هیچ گردآوریِ تازه) ─────── */

/** شمارشِ ساده و بی‌خطرِ یک جدول/شرط */
function eplakAnalyticsCount(PDO $pdo, string $sql, array $params = []): ?int
{
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $v = $st->fetchColumn();
        return $v === false ? 0 : (int) $v;
    } catch (Throwable $e) {
        return null;                     /* جدول/ستون نیست ⇒ null (نه صفرِ دروغین) */
    }
}

/**
 * آمارِ سامانه: کاربران، گزارش‌ها، تیکت‌ها، دستگاه‌های اعلان، کلیکِ تبلیغات.
 * مقدارِ null یعنی «این جدول در این دیتابیس نیست».
 */
function eplakAnalyticsAppStats(PDO $pdo, string $today): array
{
    $monthStart = substr($today, 0, 7) . '-01';
    $weekStart  = date('Y-m-d', strtotime($today . ' 00:00:00') - 6 * 86400);

    $usersTotal = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM users');
    $usersToday = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM users WHERE SUBSTR(created_at, 1, 10) = ?', [$today]);
    $usersWeek  = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM users WHERE SUBSTR(created_at, 1, 10) >= ?', [$weekStart]);
    $usersMonth = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM users WHERE SUBSTR(created_at, 1, 10) >= ?', [$monthStart]);

    $reports      = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM reports');
    $reportsPend  = eplakAnalyticsCount($pdo, "SELECT COUNT(*) FROM reports WHERE status = 'pending'");
    $reportsMonth = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM reports WHERE SUBSTR(created_at, 1, 10) >= ?', [$monthStart]);
    $tickets      = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM tickets');
    $ticketsPend  = eplakAnalyticsCount($pdo, "SELECT COUNT(*) FROM tickets WHERE status = 'pending'");
    $news         = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM news');

    $devices = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM device_tokens');
    if ($devices === null) {
        $devices = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM push_subscriptions WHERE is_active = 1');
    }
    $adClicks = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM ads_clicks');
    $sends    = eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM notification_sends');

    return [
        'users_total' => $usersTotal, 'users_today' => $usersToday, 'users_week' => $usersWeek,
        'users_month' => $usersMonth, 'reports' => $reports, 'reports_pending' => $reportsPend,
        'reports_month' => $reportsMonth, 'tickets' => $tickets, 'tickets_pending' => $ticketsPend,
        'news' => $news, 'devices' => $devices, 'ad_clicks' => $adClicks, 'notif_sends' => $sends,
    ];
}

/** رشدِ ماهانه‌ی کاربرانِ سامانه (برای نمودارِ خطی) — SUBSTR هم در MySQL کار می‌کند هم SQLite */
function eplakAnalyticsUserMonths(PDO $pdo, int $months = 6): array
{
    $out = [];
    $today = eplakAnalyticsToday($pdo);
    $keys = [];
    $base = strtotime($today . ' 12:00:00');
    for ($i = $months - 1; $i >= 0; $i--) {
        $keys[] = date('Y-m', strtotime('-' . $i . ' month', $base));
    }
    $keys = array_values(array_unique($keys));
    foreach ($keys as $k) {
        $out[$k] = ['key' => $k, 'label' => eplakAnalyticsJalaliMonth($k), 'count' => 0];
    }
    try {
        $st = $pdo->query('SELECT SUBSTR(created_at, 1, 7) AS k, COUNT(*) AS c FROM users GROUP BY SUBSTR(created_at, 1, 7)');
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (isset($out[(string) $r['k']])) {
                $out[(string) $r['k']]['count'] = (int) $r['c'];
            }
        }
    } catch (Throwable $e) {
        return [];                        /* جدول users نیست ⇒ نمودار نشان داده نمی‌شود */
    }
    return array_values($out);
}

/* ── نگهداری و خروجی ────────────────────────────────────────────────────── */

/** تعدادِ سطرهای جدولِ آمار (برای نمایشِ «حجمِ داده») */
function eplakAnalyticsRowCount(PDO $pdo): int
{
    return eplakAnalyticsReady($pdo) ? (int) (eplakAnalyticsCount($pdo, 'SELECT COUNT(*) FROM ' . EPLAK_ANALYTICS_TABLE) ?? 0) : 0;
}

/** پاک‌سازیِ رویدادهای قدیمی‌تر از $keepDays روز — دستی از پنل، نه خودکار */
function eplakAnalyticsPrune(PDO $pdo, int $keepDays = EPLAK_ANALYTICS_KEEP_DAYS): int
{
    if (!eplakAnalyticsReady($pdo) || $keepDays < 30) {
        return 0;
    }
    try {
        $cutoff = date('Y-m-d', strtotime(eplakAnalyticsToday($pdo) . ' 00:00:00') - $keepDays * 86400);
        $st = $pdo->prepare('DELETE FROM ' . EPLAK_ANALYTICS_TABLE . ' WHERE visit_day < ?');
        $st->execute([$cutoff]);
        return $st->rowCount();
    } catch (Throwable $e) {
        error_log('[eplak][analytics] prune failed: ' . $e->getMessage());
        return 0;
    }
}

/** ردیف‌های خروجیِ CSV (با برچسب‌های فارسی و تاریخِ شمسی) */
function eplakAnalyticsCsvRows(PDO $pdo, string $from, string $to, int $limit = 5000): array
{
    $rows = [];
    if (!eplakAnalyticsReady($pdo)) {
        return $rows;
    }
    $limit = max(1, min(20000, $limit));
    try {
        $st = $pdo->prepare('SELECT created_at, visit_day, visit_hour, kind, target, page, device, browser, os, ref_host'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE
            . ' WHERE visit_day >= ? AND visit_day <= ? ORDER BY id DESC LIMIT ' . $limit);
        $st->execute([$from, $to]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rows[] = [
                function_exists('eplakFaDateTimeOf') ? eplakFaDateTimeOf($r['created_at'], '') : (string) $r['created_at'],
                eplakAnalyticsKindLabel((string) $r['kind']),
                eplakAnalyticsTargetLabel((string) $r['kind'], (string) $r['target']),
                (string) $r['page'],
                eplakAnalyticsDeviceLabel((string) $r['device']),
                (string) $r['browser'],
                (string) $r['os'],
                eplakAnalyticsRefLabel((string) $r['ref_host']),
                (string) $r['visit_day'],
                (string) $r['visit_hour'],
            ];
        }
    } catch (Throwable $e) {
        error_log('[eplak][analytics] csv failed: ' . $e->getMessage());
    }
    return $rows;
}

/** سرستون‌های CSV */
function eplakAnalyticsCsvHead(): array
{
    return ['تاریخ و ساعت', 'نوع', 'هدف', 'صفحه/بخش', 'دستگاه', 'مرورگر', 'سیستم‌عامل', 'منبعِ ورود', 'روز', 'ساعت'];
}

/** یک رویدادِ آزمایشی (دکمه‌ی «ثبتِ رویدادِ آزمایشی» در پنل) تا لوله‌ی آمار آزموده شود */
function eplakAnalyticsTestEvent(PDO $pdo): array
{
    return eplakAnalyticsTrack($pdo, [
        'kind'      => 'view',
        'target'    => 'test',
        'page'      => 'آزمایش از پنلِ مدیریت',
        'visitor'   => substr(hash('sha256', 'eplak-admin-test-' . microtime(true) . mt_rand()), 0, 32),
        'ip'        => '203.0.113.7',
        'ua'        => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'referrer'  => '',
    ]);
}

/* ── شمارِ واقعیِ دانلود از گیت‌هاب (اختیاری و کش‌شده) ────────────────────
   فایلِ APK روی «ریلیزِ گیت‌هاب» است و گیت‌هاب خودش تعدادِ دانلودِ هر فایل را
   می‌شمارد. این‌جا همان عدد خوانده می‌شود؛ چون در ایران گاهی api.github.com از
   روی هاست باز نمی‌شود، همه‌چیز کش و اختیاری است:
     • در بارگذاریِ صفحه هیچ درخواستِ شبکه‌ای نمی‌رود (فقط کش خوانده می‌شود)
     • به‌روزرسانی فقط با کلیک روی دکمه (POST + توکنِ CSRF)
     • اگر شبکه/curl نبود ⇒ عددِ کش‌شده + پیامِ خوانا می‌ماند و صفحه نمی‌شکند */

/** تجزیه‌ی پاسخِ ریلیزِ گیت‌هاب (تابعِ «خالص» ⇒ بدونِ شبکه آزمون می‌شود) */
function eplakAnalyticsParseGithubRelease(?string $json): array
{
    $out = ['ok' => false, 'apk' => 0, 'all' => 0, 'tag' => '', 'assets' => [], 'error' => ''];
    $data = json_decode((string) $json, true);
    if (!is_array($data)) {
        $out['error'] = 'پاسخِ گیت‌هاب خوانده نشد';
        return $out;
    }
    if (isset($data['message']) && !isset($data['assets'])) {
        $out['error'] = 'گیت‌هاب: ' . (string) $data['message'];
        return $out;
    }
    $out['tag'] = (string) ($data['tag_name'] ?? '');
    $assets = isset($data['assets']) && is_array($data['assets']) ? $data['assets'] : [];
    foreach ($assets as $a) {
        if (!is_array($a)) {
            continue;
        }
        $name  = (string) ($a['name'] ?? '');
        $count = (int) ($a['download_count'] ?? 0);
        $out['all'] += $count;
        $out['assets'][$name] = $count;
        if ($name === EPLAK_ANALYTICS_GH_ASSET) {
            $out['apk'] = $count;
        }
    }
    $out['ok'] = $out['tag'] !== '';
    if (!$out['ok'] && $out['error'] === '') {
        $out['error'] = 'ریلیزِ گیت‌هاب پیدا نشد';
    }
    return $out;
}

/** خواندنِ کشِ شمارِ دانلود (بدونِ هیچ درخواستِ شبکه‌ای) */
function eplakAnalyticsGithubCached(PDO $pdo): array
{
    $get = function (string $key, string $default = '') use ($pdo): string {
        try {
            return (string) eplakAppSetting($pdo, $key, $default);
        } catch (Throwable $e) {
            return $default;
        }
    };
    return [
        'apk'       => (int) $get('analytics_gh_apk', '0'),
        'all'       => (int) $get('analytics_gh_all', '0'),
        'tag'       => $get('analytics_gh_tag'),
        'checked_at' => $get('analytics_gh_checked_at'),
        'error'     => $get('analytics_gh_error'),
        'stale'     => (int) $get('analytics_gh_checked_at', '0') + EPLAK_ANALYTICS_GH_CACHE < time(),
    ];
}

/**
 * به‌روزرسانیِ شمارِ دانلود از گیت‌هاب — فقط با $force (دکمه‌ی پنل).
 * در آزمون‌ها و در بارگذاریِ صفحه هرگز curl اجرا نمی‌شود (php-wasm را می‌خواباند).
 */
function eplakAnalyticsGithubRefresh(PDO $pdo, bool $force = false): array
{
    $cached = eplakAnalyticsGithubCached($pdo);
    if (!$force) {
        return $cached;
    }
    $set = function (string $key, string $value) use ($pdo): void {
        try {
            eplakSetAppSetting($pdo, $key, $value);
        } catch (Throwable $e) {
            /* بی‌ضرر */
        }
    };
    if (!function_exists('curl_init')) {
        $cached['error'] = 'اکستنشن curl روی این هاست فعال نیست؛ عددِ قبلی نگه داشته شد.';
        $set('analytics_gh_error', $cached['error']);
        return $cached;
    }
    $body = '';
    $err  = '';
    try {
        $ch = curl_init(EPLAK_ANALYTICS_GH_RELEASE);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 12,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 2,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'eplak-admin-analytics',
            CURLOPT_HTTPHEADER     => ['Accept: application/vnd.github+json'],
        ]);
        $body = (string) curl_exec($ch);
        if ($body === '') {
            $err = (string) curl_error($ch);
        }
        curl_close($ch);
    } catch (Throwable $e) {
        $err = $e->getMessage();
    }
    $parsed = eplakAnalyticsParseGithubRelease($body);
    if (!$parsed['ok']) {
        $cached['error'] = $err !== '' ? ('ارتباط با گیت‌هاب برقرار نشد: ' . $err)
            : ($parsed['error'] !== '' ? $parsed['error'] : 'خطای نامشخص');
        $set('analytics_gh_error', $cached['error']);
        return $cached;
    }
    $set('analytics_gh_apk', (string) $parsed['apk']);
    $set('analytics_gh_all', (string) $parsed['all']);
    $set('analytics_gh_tag', (string) $parsed['tag']);
    $set('analytics_gh_checked_at', (string) time());
    $set('analytics_gh_error', '');
    return eplakAnalyticsGithubCached($pdo);
}

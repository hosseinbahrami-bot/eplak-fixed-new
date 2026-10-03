<?php
/* ============================================================================
   shared/tiles.php — کاشی‌های نقشه از «سرور خودِ ای‌پلاک» (پروکسی + کش دیسکی)

   چرا؟
   نقشه‌ی «موقعیت» در اپ اندروید، کاشی‌ها را مستقیم از tile.openstreetmap.org
   می‌گرفت. صفحه‌ی اپ از file:///android_asset باز می‌شود و مرورگرِ درونِ اپ از
   چنین صفحه‌ای هیچ «Referer» نمی‌فرستد؛ سرورهای OpenStreetMap هم طبق سیاست
   استفاده‌شان درخواستِ بی‌Referer را مسدود می‌کنند. نتیجه: نقشه خالی می‌ماند.
   (علاوه بر آن، در ایران دسترسی مستقیم گوشی به سرورهای نقشه‌ی خارجی بعضی وقت‌ها
   کند یا قطع است.)

   اسنپ و نشان هم نقشه‌ی خود را بر پایه‌ی داده‌های OpenStreetMap و از «سرور
   خودشان» می‌دهند؛ این فایل همان الگو را برای ای‌پلاک پیاده می‌کند:
     اپ  →  https://eplak.ir/…/api/tiles.php?z=&x=&y=   (همان سرورِ آپلود عکس)
     سرور → اولین بار از OpenStreetMap می‌گیرد (با User-Agent و Referer درست)،
            روی دیسک نگه می‌دارد و دفعه‌های بعد مستقیم از دیسک می‌دهد.

   ایمنی (تا سرور تبدیل به «پروکسی باز» نشود و آی‌پی‌اش از OSM بلاک نشود):
     • فقط عددهای z/x/y پذیرفته می‌شوند و آدرس مقصد ثابت است (بدون SSRF).
     • فقط محدوده‌ی ایران (قابل تغییر) برای زوم‌های بالا.
     • سقف تعداد «دریافت تازه از بیرون» در دقیقه + سقف حجم کش دیسکی.
     • فقط پاسخ ۲۰۰ با تصویر معتبر (PNG/JPEG/WebP) و حجم کم ذخیره می‌شود.

   تنظیم (اختیاری) در shared/config.php:
     'tile_upstreams' => ['https://…/{z}/{x}/{y}.png?apiKey={key}', …],
     'tile_api_key'   => '…',          // جایگزین {key}
   مثلاً اگر شهرداری «سرویس تایل رستر مستقیم نشان» را بگیرد، فقط همین دو خط
   لازم است؛ کلید روی سرور می‌ماند و هرگز داخل اپ نمی‌رود.
   ============================================================================ */

if (!defined('EPLAK_TILE_ROOT')) {
    define('EPLAK_TILE_ROOT', defined('EPLAK_ROOT') ? EPLAK_ROOT : dirname(__DIR__));
}

/* مقادیر پیش‌فرض (با shared/config.php و در آزمون‌ها با $GLOBALS['EPLAK_TILE_OVERRIDES'] قابل تغییر) */
function eplakTileDefaults(): array {
    return [
        'tile_upstreams' => [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
        ],
        'tile_api_key'          => '',
        'tile_user_agent'       => 'EplakVaramin/2.0 (+https://eplak.ir; citizen reports app)',
        'tile_referer'          => 'https://eplak.ir/',
        /* [کمترین عرض, کمترین طول, بیشترین عرض, بیشترین طول] — ایران با حاشیه؛ null = بدون محدودیت */
        'tile_bbox'             => [24.0, 43.0, 40.5, 64.5],
        'tile_bbox_min_zoom'    => 7,
        'tile_min_zoom'         => 3,
        'tile_max_zoom'         => 19,
        'tile_ttl'              => 7 * 86400,     /* OSM: دست‌کم ۷ روز کش */
        'tile_max_bytes'        => 300 * 1024,
        'tile_fetch_per_minute' => 90,
        'tile_cache_budget_mb'  => 400,
        'tile_timeout'          => 5,
        'tile_http_driver'      => 'auto',        /* auto | curl | stream (برای آزمون) */
    ];
}

function eplakTileConfig(): array {
    $cfg = eplakTileDefaults();
    $path = __DIR__ . '/config.php';
    if (is_file($path)) {
        $file = @include $path;
        if (is_array($file)) {
            foreach ($file as $key => $value) {
                if (is_string($key) && strpos($key, 'tile_') === 0) {
                    $cfg[$key] = $value;
                }
            }
        }
    }
    if (isset($GLOBALS['EPLAK_TILE_OVERRIDES']) && is_array($GLOBALS['EPLAK_TILE_OVERRIDES'])) {
        $cfg = array_merge($cfg, $GLOBALS['EPLAK_TILE_OVERRIDES']);
    }
    return $cfg;
}

function eplakTileCacheDir(): string {
    return rtrim((string) EPLAK_TILE_ROOT, '/') . '/uploads/tiles';
}

/* مختصات گوشه‌ی بالا-چپ یک کاشی (WGS84) */
function eplakTileCorner(int $x, int $y, int $z): array {
    $n = 2 ** $z;
    $lng = $x / $n * 360.0 - 180.0;
    $lat = rad2deg(atan(sinh(M_PI * (1 - 2 * $y / $n))));
    return [$lat, $lng];
}

/* آیا z/x/y معتبر و داخل محدوده‌ی مجاز است؟ خروجی: [ok, کد وضعیت HTTP, پیام] */
function eplakTileValidate($z, $x, $y, array $cfg): array {
    foreach ([$z, $x, $y] as $v) {
        if (!is_scalar($v) || !preg_match('/^\d{1,8}$/', (string) $v)) {
            return [false, 400, 'bad-params'];
        }
    }
    $z = (int) $z; $x = (int) $x; $y = (int) $y;
    if ($z < (int) $cfg['tile_min_zoom'] || $z > (int) $cfg['tile_max_zoom']) {
        return [false, 400, 'bad-zoom'];
    }
    $max = (2 ** $z) - 1;
    if ($x > $max || $y > $max) {
        return [false, 400, 'bad-tile'];
    }
    $box = $cfg['tile_bbox'] ?? null;
    if (is_array($box) && count($box) === 4 && $z >= (int) $cfg['tile_bbox_min_zoom']) {
        [$north, $west] = eplakTileCorner($x, $y, $z);
        [$south, $east] = eplakTileCorner($x + 1, $y + 1, $z);
        $outside = ($north < (float) $box[0]) || ($south > (float) $box[2])
                || ($east < (float) $box[1]) || ($west > (float) $box[3]);
        if ($outside) {
            return [false, 404, 'out-of-area'];
        }
    }
    return [true, 200, ''];
}

/* نوع تصویر از روی بایت‌های ابتدایی (فقط PNG/JPEG/WebP) */
function eplakTileSniff(string $bytes): ?string {
    if (strlen($bytes) < 12) {
        return null;
    }
    if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) {
        return 'image/png';
    }
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if (strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    return null;
}

/* آدرس واقعیِ یک کاشی از قالب (قالب از تنظیمات است، نه از ورودی کاربر) */
function eplakTileUpstreamUrl(string $template, int $z, int $x, int $y, array $cfg): string {
    $subs = ['a', 'b', 'c'];
    return strtr($template, [
        '{z}'   => (string) $z,
        '{x}'   => (string) $x,
        '{y}'   => (string) $y,
        '{s}'   => $subs[($x + $y) % 3],
        '{key}' => rawurlencode((string) ($cfg['tile_api_key'] ?? '')),
    ]);
}

/* دریافت یک آدرس HTTP(S) — cURL اگر بود، وگرنه stream. خروجی: [کد وضعیت, بدنه] */
function eplakTileHttpGet(string $url, array $cfg): array {
    $ua = (string) $cfg['tile_user_agent'];
    $ref = (string) $cfg['tile_referer'];
    $timeout = max(2, (int) $cfg['tile_timeout']);
    $limit = (int) $cfg['tile_max_bytes'];

    $driver = (string) ($cfg['tile_http_driver'] ?? 'auto');
    if ($driver !== 'stream' && function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch !== false) {
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 2,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_USERAGENT      => $ua,
                CURLOPT_REFERER        => $ref,
                CURLOPT_HTTPHEADER     => ['Accept: image/png,image/*;q=0.8'],
            ];
            if (defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
                $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
                $opts[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
            }
            /* تک‌تک تنظیم می‌شوند: بعضی هاست‌ها یک گزینه را رد می‌کنند و
               curl_setopt_array در همان نقطه می‌ایستد و بقیه (مثل User-Agent) را
               نمی‌گذارد. */
            foreach ($opts as $option => $value) {
                @curl_setopt($ch, $option, $value);
            }
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if (!is_string($body)) {
                return [0, ''];
            }
            return [$code, strlen($body) > $limit ? '' : $body];
        }
    }

    $context = stream_context_create(['http' => [
        'method'          => 'GET',
        'timeout'         => $timeout,
        'ignore_errors'   => true,
        'follow_location' => 1,
        'max_redirects'   => 2,
        'header'          => "User-Agent: {$ua}\r\nReferer: {$ref}\r\nAccept: image/png,image/*;q=0.8\r\n",
    ]]);
    $body = @file_get_contents($url, false, $context, 0, $limit + 1);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', (string) $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }
    if (!is_string($body)) {
        return [0, ''];
    }
    return [$code, strlen($body) > $limit ? '' : $body];
}

/* دریافت کاشی از اولین منبعِ سالم — خروجی: بایت‌های تصویر یا null */
function eplakTileFetchUpstream(int $z, int $x, int $y, array $cfg, ?callable $fetcher = null): ?string {
    $fetch = $fetcher ?? function (string $url) use ($cfg): array {
        return eplakTileHttpGet($url, $cfg);
    };
    $limit = (int) $cfg['tile_max_bytes'];
    foreach ((array) $cfg['tile_upstreams'] as $template) {
        if (!is_string($template) || $template === '') {
            continue;
        }
        $url = eplakTileUpstreamUrl($template, $z, $x, $y, $cfg);
        try {
            $result = $fetch($url);
        } catch (\Throwable $e) {
            continue;
        }
        $code = (int) ($result[0] ?? 0);
        $body = (string) ($result[1] ?? '');
        if ($code === 200 && $body !== '' && strlen($body) <= $limit && eplakTileSniff($body) !== null) {
            return $body;
        }
    }
    return null;
}

/* سقف «دریافت تازه از بیرون» در دقیقه (پنجره‌ی ثابت، با قفل فایل) */
function eplakTileRateAllow(string $dir, int $limitPerMinute): bool {
    if ($limitPerMinute <= 0) {
        return true;
    }
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return true;   /* اگر شمارش ممکن نیست، مسدود نمی‌کنیم */
    }
    $fh = @fopen($dir . '/.rate', 'c+');
    if (!$fh) {
        return true;
    }
    $allowed = true;
    if (flock($fh, LOCK_EX)) {
        $raw = trim((string) stream_get_contents($fh));
        $parts = $raw === '' ? [] : explode(' ', $raw);
        $minute = (int) floor(time() / 60);
        $savedMinute = (int) ($parts[0] ?? 0);
        $count = (int) ($parts[1] ?? 0);
        if ($savedMinute !== $minute) {
            $savedMinute = $minute;
            $count = 0;
        }
        if ($count >= $limitPerMinute) {
            $allowed = false;
        } else {
            $count++;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, $savedMinute . ' ' . $count);
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    return $allowed;
}

/* پاک‌سازی کش وقتی از بودجه‌ی دیسک گذشت: قدیمی‌ترین‌ها اول حذف می‌شوند.
   خروجی: تعداد فایل‌های حذف‌شده. */
function eplakTileCleanup(string $dir, int $budgetBytes): int {
    if (!is_dir($dir) || $budgetBytes <= 0) {
        return 0;
    }
    $files = [];
    $total = 0;
    try {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $info) {
            if (!$info->isFile()) {
                continue;
            }
            $name = $info->getFilename();
            if ($name !== '' && $name[0] === '.') {
                continue;   /* .rate و .htaccess دست نمی‌خورند */
            }
            $size = (int) $info->getSize();
            $files[] = [$info->getPathname(), $size, (int) $info->getMTime()];
            $total += $size;
            if (count($files) > 80000) {
                break;
            }
        }
    } catch (\Throwable $e) {
        return 0;
    }
    if ($total <= $budgetBytes) {
        return 0;
    }
    usort($files, function ($a, $b) {
        return $a[2] <=> $b[2];
    });
    $target = (int) ($budgetBytes * 0.7);
    $removed = 0;
    foreach ($files as $file) {
        if ($total <= $target) {
            break;
        }
        if (@unlink($file[0])) {
            $total -= $file[1];
            $removed++;
        }
    }
    return $removed;
}

function eplakTileResponse(int $status, string $body, string $mime, array $extra = []): array {
    $headers = array_merge([
        'Content-Type'                => $mime,
        'X-Content-Type-Options'      => 'nosniff',
        'Access-Control-Allow-Origin' => '*',
        'Cross-Origin-Resource-Policy' => 'cross-origin',
    ], $extra);
    return ['status' => $status, 'headers' => $headers, 'body' => $body];
}

function eplakTileFail(int $status, string $reason): array {
    return eplakTileResponse($status, $reason, 'text/plain; charset=utf-8', [
        'Cache-Control' => 'no-store',
        'X-Eplak-Tile'  => $reason,
    ]);
}

/* ═══════════════════════════════════════════════════════════════════════
   هسته‌ی اندپوینت: درخواست ($query = $_GET) → ['status','headers','body']
   $fetcher فقط برای آزمون است (جای دریافت واقعی از اینترنت).
   ═══════════════════════════════════════════════════════════════════════ */
function eplakTileHandle(array $query, array $server = [], ?callable $fetcher = null): array {
    $cfg = eplakTileConfig();
    [$ok, $status, $why] = eplakTileValidate($query['z'] ?? null, $query['x'] ?? null, $query['y'] ?? null, $cfg);
    if (!$ok) {
        return eplakTileFail($status, $why);
    }
    $z = (int) $query['z'];
    $x = (int) $query['x'];
    $y = (int) $query['y'];

    $dir = eplakTileCacheDir();
    $path = $dir . '/' . $z . '/' . $x . '/' . $y . '.bin';
    $ttl = max(3600, (int) $cfg['tile_ttl']);

    $cached = null;
    $fresh = false;
    if (is_file($path)) {
        $bytes = @file_get_contents($path);
        if (is_string($bytes) && eplakTileSniff($bytes) !== null) {
            $cached = $bytes;
            $fresh = (time() - (int) @filemtime($path)) < $ttl;
        }
    }

    $note = 'hit';
    $body = $fresh ? $cached : null;

    if ($body === null) {
        if (eplakTileRateAllow($dir, (int) $cfg['tile_fetch_per_minute'])) {
            $got = eplakTileFetchUpstream($z, $x, $y, $cfg, $fetcher);
            if ($got !== null) {
                $body = $got;
                $note = 'miss';
                if (eplakTileEnsureDir($dir . '/' . $z . '/' . $x)) {
                    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
                    if (@file_put_contents($tmp, $got, LOCK_EX) !== false) {
                        if (!@rename($tmp, $path)) {
                            @unlink($tmp);
                        }
                    }
                    /* گاهی بودجه‌ی دیسک بررسی می‌شود */
                    if (random_int(1, 150) === 1) {
                        eplakTileCleanup($dir, (int) $cfg['tile_cache_budget_mb'] * 1048576);
                    }
                }
            }
        } else {
            $note = 'rate-limited';
        }
    }

    if ($body === null && $cached !== null) {
        $body = $cached;     /* منبع بیرونی در دسترس نبود → نسخه‌ی کهنه بهتر از هیچ است */
        $note = 'stale';
    }
    if ($body === null) {
        return eplakTileFail($note === 'rate-limited' ? 429 : 502, $note === 'rate-limited' ? 'rate-limited' : 'upstream-unavailable');
    }

    $mime = eplakTileSniff($body) ?? 'image/png';
    $etag = '"' . substr(md5($body), 0, 16) . '"';
    $headers = [
        'Cache-Control' => 'public, max-age=86400',
        'ETag'          => $etag,
        'X-Eplak-Tile'  => $note,
    ];
    if (isset($server['HTTP_IF_NONE_MATCH']) && trim((string) $server['HTTP_IF_NONE_MATCH']) === $etag) {
        return eplakTileResponse(304, '', $mime, $headers);
    }
    $headers['Content-Length'] = (string) strlen($body);
    return eplakTileResponse(200, $body, $mime, $headers);
}

/* ساخت پوشه‌ی کش (و نگهبان جلوگیری از اجرای اسکریپت داخل uploads) */
function eplakTileEnsureDir(string $absoluteDir): bool {
    if (function_exists('eplakMediaEnsureDir') && defined('EPLAK_ROOT')) {
        return eplakMediaEnsureDir($absoluteDir);
    }
    return is_dir($absoluteDir) || @mkdir($absoluteDir, 0775, true) || is_dir($absoluteDir);
}

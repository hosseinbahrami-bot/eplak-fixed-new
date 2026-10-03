<?php
/* ============================================================================
   shared/places_store.php — «اماکن شهری» قابل‌مدیریت از پنل ادمین

   فهرست پیش‌فرضِ «نقشه و اماکن شهری» داخل خودِ اپ است (core/places-data.js). این فایل
   لایه‌ی «اصلاح‌های ادمین» روی آن فهرست را نگه می‌دارد تا کارمندان شهرداری بدون
   برنامه‌نویس بتوانند:
     • مکان تازه اضافه کنند (مسجد، اداره، فرهنگسرا، …)        ← kind = custom
     • مکانِ پیش‌فرض را اصلاح کنند (نام، مختصات، تلفن، …)       ← kind = override
     • مکانِ پیش‌فرض را از نقشه پنهان کنند                     ← override + hidden = 1
   اپ فقط «تفاوت» را از api/places.php می‌گیرد و روی فهرست پیش‌فرض اعمال می‌کند؛ پس اگر
   سرور در دسترس نباشد یا جدول خالی باشد، همان فهرست پیش‌فرض نمایش داده می‌شود.

   جدول city_places در اولین استفاده ساخته می‌شود (CREATE TABLE IF NOT EXISTS) — عمداً
   در bootstrap نیست، تا اگر روی MySQL هاست مشکلی پیش بیاید فقط همین قابلیت متأثر شود،
   نه کل سایت و اپ.

   سازگار با PHP 7.4 تا 8.5 (بدون str_contains/match و بدون ارسال null به توابع داخلی).
   ============================================================================ */

/* مسیر فهرست پیش‌فرض (همان فایلی که اپ بارگذاری می‌کند) */
function eplakPlacesDataFile(): string
{
    return dirname(__DIR__) . '/core/places-data.js';
}

/**
 * فهرست پیش‌فرض را از core/places-data.js می‌خواند.
 * هر مکان/دسته در آن فایل یک خط JSON است؛ پس نیازی به اجرای JavaScript نیست.
 *
 * @return array{categories: array<string,array>, places: array<string,array>, bounds: array<string,float>}
 */
function eplakPlacesBuiltin(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = [
        'categories' => [],
        'places'     => [],
        'bounds'     => ['south' => 35.305, 'west' => 51.595, 'north' => 35.398, 'east' => 51.685],
    ];
    $raw = @file_get_contents(eplakPlacesDataFile());
    if (!is_string($raw) || $raw === '') {
        return $cache;
    }
    foreach (preg_split('/\r?\n/', $raw) ?: [] as $line) {
        $line = trim((string) $line);
        if ($line === '' || $line[0] !== '{') {
            continue;
        }
        $row = json_decode(rtrim($line, ','), true);
        if (!is_array($row) || !isset($row['id']) || !is_string($row['id']) || $row['id'] === '') {
            continue;
        }
        if (isset($row['cat'])) {
            $cache['places'][$row['id']] = $row;
        } elseif (isset($row['color'])) {
            $cache['categories'][$row['id']] = $row;
        }
    }
    if (preg_match('/bounds:\s*\{\s*south:\s*([\d.]+)\s*,\s*west:\s*([\d.]+)\s*,\s*north:\s*([\d.]+)\s*,\s*east:\s*([\d.]+)/', $raw, $m)) {
        $cache['bounds'] = ['south' => (float) $m[1], 'west' => (float) $m[2], 'north' => (float) $m[3], 'east' => (float) $m[4]];
    }
    return $cache;
}

/* محدوده‌ی مجاز برای مختصات: مرز شهر + حدود ۶ کیلومتر حاشیه (حومه‌ی ورامین) */
function eplakPlacesBox(): array
{
    $b = eplakPlacesBuiltin()['bounds'];
    $pad = 0.06;
    return [
        'south' => $b['south'] - $pad, 'north' => $b['north'] + $pad,
        'west'  => $b['west'] - $pad,  'east'  => $b['east'] + $pad,
    ];
}

/* ── جدول ─────────────────────────────────────────────────────────────── */

/**
 * جدول را (اگر نبود) می‌سازد. false یعنی ساخته نشد (مثلاً دسترسی CREATE نیست).
 * ستون‌ها: ردیف «custom» = مکان افزوده‌شده؛ «override» = اصلاح/پنهان‌سازی مکانِ پیش‌فرض
 * (place_key = همان id در core/places-data.js).
 */
function eplakPlacesEnsureTable(PDO $pdo): bool
{
    static $done = [];
    $oid = spl_object_id($pdo);
    if (isset($done[$oid])) {
        return $done[$oid];
    }
    $columns = "
        place_key VARCHAR(64) NOT NULL%UNIQ%,
        kind VARCHAR(10) NOT NULL DEFAULT 'custom',
        cat VARCHAR(24) NOT NULL DEFAULT '',
        name_fa VARCHAR(200) NOT NULL DEFAULT '',
        name_en VARCHAR(200) NOT NULL DEFAULT '',
        lat DOUBLE NULL,
        lng DOUBLE NULL,
        addr_fa VARCHAR(300) NOT NULL DEFAULT '',
        addr_en VARCHAR(300) NOT NULL DEFAULT '',
        tel VARCHAR(24) NOT NULL DEFAULT '',
        note_fa VARCHAR(500) NOT NULL DEFAULT '',
        note_en VARCHAR(500) NOT NULL DEFAULT '',
        approx TINYINT NOT NULL DEFAULT 0,
        hidden TINYINT NOT NULL DEFAULT 0,
        created_at VARCHAR(25) NOT NULL DEFAULT '',
        updated_at VARCHAR(25) NOT NULL DEFAULT ''";
    try {
        if (eplakIsSqlite($pdo)) {
            $pdo->exec('CREATE TABLE IF NOT EXISTS city_places ('
                . "\n id INTEGER PRIMARY KEY AUTOINCREMENT,"
                . str_replace('%UNIQ%', ' UNIQUE', $columns) . "\n)");
        } else {
            $pdo->exec('CREATE TABLE IF NOT EXISTS city_places ('
                . "\n id INT AUTO_INCREMENT PRIMARY KEY,"
                . str_replace('%UNIQ%', '', $columns)
                . ",\n UNIQUE KEY uq_city_places_key (place_key)\n) DEFAULT CHARSET=utf8mb4");
        }
        return $done[$oid] = true;
    } catch (\Throwable $e) {
        error_log('eplak city_places: ' . $e->getMessage());
        return $done[$oid] = false;
    }
}

/* ── پاک‌سازی و اعتبارسنجی ورودی ───────────────────────────────────────── */

/* ارقام فارسی/عربی → لاتین و جداکننده‌ی اعشار فارسی/عربی → «.» */
function eplakPlacesAsciiDigits(string $s): string
{
    $s = str_replace(
        ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
        ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        $s
    );
    return str_replace(['٫', '،', ','], '.', str_replace('٬', '', $s));
}

/* متن تک‌خطی و تمیز؛ null یعنی UTF-8 نامعتبر */
function eplakPlacesClean($raw): ?string
{
    $s = is_scalar($raw) ? (string) $raw : '';
    if ($s === '') {
        return '';
    }
    if (!preg_match('//u', $s)) {
        return null;
    }
    /* نویسه‌های کنترلی (از جمله خط جدید/Tab) → فاصله؛ کنترل‌های جهت‌نمای یونیکد حذف می‌شوند
       (نیم‌فاصله‌ی فارسی U+200C دست‌نخورده می‌ماند) */
    $s = (string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s);
    $s = (string) preg_replace('/[\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $s);
    $s = (string) preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

/* مختصات: عدد اعشاری معتبر یا null */
function eplakPlacesCoord($raw): ?float
{
    $s = trim(eplakPlacesAsciiDigits(is_scalar($raw) ? (string) $raw : ''));
    if (!preg_match('/^-?\d{1,3}(?:\.\d{1,12})?$/', $s)) {
        return null;
    }
    return round((float) $s, 6);
}

/* شماره‌ی تماس: '' = ندارد، null = نامعتبر، وگرنه فقط رقم (با + اختیاری در ابتدا) */
function eplakPlacesTel($raw): ?string
{
    $s = trim(eplakPlacesAsciiDigits(is_scalar($raw) ? (string) $raw : ''));
    $s = (string) preg_replace('/[\s\-().]/', '', $s);
    if ($s === '') {
        return '';
    }
    return preg_match('/^\+?\d{3,15}$/', $s) ? $s : null;
}

/* ستون‌های متنی ← [برچسب فارسی برای پیام خطا، حداکثر طول] */
function eplakPlacesTextFields(): array
{
    return [
        'name_fa' => ['نام فارسی', 120],
        'name_en' => ['نام انگلیسی', 120],
        'addr_fa' => ['نشانی فارسی', 160],
        'addr_en' => ['نشانی انگلیسی', 160],
        'note_fa' => ['توضیح فارسی', 240],
        'note_en' => ['توضیح انگلیسی', 240],
    ];
}

/* مقدارهای یک مکانِ پیش‌فرض (core/places-data.js) در قالب ستون‌های جدول */
function eplakPlacesFromBuiltin(array $b): array
{
    return [
        'cat'     => (string) ($b['cat'] ?? ''),
        'name_fa' => (string) ($b['fa'] ?? ''),
        'name_en' => (string) ($b['en'] ?? ''),
        'lat'     => isset($b['lat']) ? (float) $b['lat'] : null,
        'lng'     => isset($b['lng']) ? (float) $b['lng'] : null,
        'addr_fa' => (string) ($b['addr'] ?? ''),
        'addr_en' => (string) ($b['addrEn'] ?? ''),
        'tel'     => (string) ($b['tel'] ?? ''),
        'note_fa' => (string) ($b['note'] ?? ''),
        'note_en' => (string) ($b['noteEn'] ?? ''),
        'approx'  => !empty($b['approx']) ? 1 : 0,
    ];
}

/**
 * ورودی فرم/درخواست را اعتبارسنجی و یکدست می‌کند.
 *
 * @return array{errors: string[], values: array}
 */
function eplakPlacesValidate(array $in): array
{
    $errors = [];
    $cats = eplakPlacesBuiltin()['categories'];
    $values = ['cat' => is_scalar($in['cat'] ?? null) ? trim((string) $in['cat']) : ''];

    if (!$cats) {
        $errors[] = 'فهرست دسته‌ها خوانده نشد (فایل core/places-data.js روی سرور پیدا نشد).';
    } elseif (!isset($cats[$values['cat']])) {
        $errors[] = 'دسته را انتخاب کنید.';
    }

    foreach (eplakPlacesTextFields() as $col => $spec) {
        $clean = eplakPlacesClean($in[$col] ?? '');
        if ($clean === null) {
            $errors[] = '«' . $spec[0] . '» نویسه‌ی نامعتبر دارد.';
            $clean = '';
        } elseif (mb_strlen($clean, 'UTF-8') > $spec[1]) {
            $errors[] = '«' . $spec[0] . '» بیش از ' . $spec[1] . ' نویسه است.';
            $clean = mb_substr($clean, 0, $spec[1], 'UTF-8');
        }
        $values[$col] = $clean;
    }
    if ($values['name_fa'] === '' && !array_filter($errors, static function ($e) { return strpos($e, 'نام فارسی') !== false; })) {
        $errors[] = 'نام فارسی مکان الزامی است.';
    }

    $lat = eplakPlacesCoord($in['lat'] ?? '');
    $lng = eplakPlacesCoord($in['lng'] ?? '');
    $box = eplakPlacesBox();
    if ($lat === null || $lng === null) {
        $errors[] = 'موقعیت روی نقشه را مشخص کنید (یا عرض و طول جغرافیایی را درست بنویسید).';
    } elseif ($lat < $box['south'] || $lat > $box['north'] || $lng < $box['west'] || $lng > $box['east']) {
        $errors[] = 'این مختصات بیرون از محدوده‌ی شهر ورامین است؛ دوباره روی نقشه مشخص کنید.';
    }
    $values['lat'] = $lat;
    $values['lng'] = $lng;

    $tel = eplakPlacesTel($in['tel'] ?? '');
    if ($tel === null) {
        $errors[] = 'شماره‌ی تماس فقط می‌تواند رقم باشد (۳ تا ۱۵ رقم، با کد شهر).';
        $tel = '';
    }
    $values['tel'] = $tel;
    $values['approx'] = !empty($in['approx']) ? 1 : 0;

    return ['errors' => $errors, 'values' => $values];
}

/* ── خواندن ───────────────────────────────────────────────────────────── */

/** همه‌ی ردیف‌های جدول، با کلید place_key (جدول نبود یا خطا → آرایه‌ی خالی) */
function eplakPlacesRows(PDO $pdo): array
{
    if (!eplakPlacesEnsureTable($pdo)) {
        return [];
    }
    $out = [];
    try {
        foreach ($pdo->query('SELECT * FROM city_places ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[(string) $row['place_key']] = $row;
        }
    } catch (\Throwable $e) {
        error_log('eplak city_places read: ' . $e->getMessage());
        return [];
    }
    return $out;
}

/* ستون‌های یک ردیف جدول → همان قالب «مقدارها» */
function eplakPlacesRowValues(array $row): array
{
    return [
        'cat'     => (string) $row['cat'],
        'name_fa' => (string) $row['name_fa'],
        'name_en' => (string) $row['name_en'],
        'lat'     => $row['lat'] === null ? null : (float) $row['lat'],
        'lng'     => $row['lng'] === null ? null : (float) $row['lng'],
        'addr_fa' => (string) $row['addr_fa'],
        'addr_en' => (string) $row['addr_en'],
        'tel'     => (string) $row['tel'],
        'note_fa' => (string) $row['note_fa'],
        'note_en' => (string) $row['note_en'],
        'approx'  => (int) $row['approx'] ? 1 : 0,
    ];
}

/* قالب عمومی (همان که اپ می‌خواند: fa/en/addr/addrEn/note/noteEn) */
function eplakPlacesPublicShape(array $v): array
{
    return [
        'cat'    => (string) $v['cat'],
        'fa'     => (string) $v['name_fa'],
        'en'     => (string) $v['name_en'],
        'lat'    => (float) $v['lat'],
        'lng'    => (float) $v['lng'],
        'addr'   => (string) $v['addr_fa'],
        'addrEn' => (string) $v['addr_en'],
        'tel'    => (string) $v['tel'],
        'note'   => (string) $v['note_fa'],
        'noteEn' => (string) $v['note_en'],
        'approx' => (int) $v['approx'] ? 1 : 0,
    ];
}

/**
 * فهرست یکپارچه برای پنل: مکان‌های افزوده‌شده، اصلاح‌شده و پیش‌فرض.
 * source: custom | edited | builtin
 */
function eplakPlacesAdminList(PDO $pdo): array
{
    $builtin = eplakPlacesBuiltin()['places'];
    $rows = eplakPlacesRows($pdo);
    $custom = [];
    $edited = [];
    $plain = [];

    foreach ($rows as $key => $row) {
        if ($row['kind'] === 'custom') {
            $custom[] = ['key' => $key, 'source' => 'custom', 'hidden' => (int) $row['hidden'] === 1,
                'updated_at' => (string) $row['updated_at']] + eplakPlacesRowValues($row);
        }
    }
    $custom = array_reverse($custom);   /* تازه‌ترین اول */

    foreach ($builtin as $id => $b) {
        $row = $rows[$id] ?? null;
        if ($row !== null && $row['kind'] === 'override') {
            $edited[] = ['key' => $id, 'source' => 'edited', 'hidden' => (int) $row['hidden'] === 1,
                'updated_at' => (string) $row['updated_at']] + eplakPlacesRowValues($row);
        } else {
            $plain[] = ['key' => $id, 'source' => 'builtin', 'hidden' => false, 'updated_at' => ''] + eplakPlacesFromBuiltin($b);
        }
    }
    return array_merge($custom, $edited, $plain);
}

/** یک مکان (پیش‌فرض، اصلاح‌شده یا افزوده‌شده) با کلیدش؛ null اگر نبود */
function eplakPlacesFind(PDO $pdo, string $key): ?array
{
    if ($key === '') {
        return null;
    }
    foreach (eplakPlacesAdminList($pdo) as $item) {
        if ($item['key'] === $key) {
            return $item;
        }
    }
    return null;
}

/* ── نوشتن ────────────────────────────────────────────────────────────── */

function eplakPlacesNow(): string
{
    return date('Y-m-d H:i:s');
}

/* آیا مقدارهای فرم دقیقاً همان مکانِ پیش‌فرض است؟ */
function eplakPlacesSameAsBuiltin(array $v, array $b): bool
{
    $base = eplakPlacesFromBuiltin($b);
    foreach ($base as $col => $val) {
        if ($col === 'lat' || $col === 'lng') {
            if ($v[$col] === null || $val === null || abs((float) $v[$col] - (float) $val) > 0.0000011) {
                return false;
            }
        } elseif ((string) $v[$col] !== (string) $val) {
            return false;
        }
    }
    return true;
}

/**
 * ذخیره‌ی فرم.
 *   $key = ''              → مکانِ تازه (custom)
 *   $key = id پیش‌فرض      → اصلاح همان مکان (override)
 *   $key = کلید custom     → ویرایش مکانِ افزوده‌شده
 *
 * @return array{ok: bool, errors: string[], values: array, key?: string, changed?: bool}
 */
function eplakPlacesSave(PDO $pdo, string $key, array $in): array
{
    $check = eplakPlacesValidate($in);
    $values = $check['values'];
    $fail = static function (array $errors) use ($values): array {
        return ['ok' => false, 'errors' => $errors, 'values' => $values];
    };
    if (!eplakPlacesEnsureTable($pdo)) {
        return $fail(['جدول اماکن ساخته نشد (دسترسی CREATE TABLE در دیتابیس را بررسی کنید).']);
    }
    $builtin = eplakPlacesBuiltin()['places'];
    $rows = eplakPlacesRows($pdo);
    $isBuiltin = $key !== '' && isset($builtin[$key]);
    if ($key !== '' && !$isBuiltin && !(isset($rows[$key]) && $rows[$key]['kind'] === 'custom')) {
        return $fail(['این مکان پیدا نشد.']);
    }
    if ($check['errors']) {
        return $fail($check['errors']);
    }

    $now = eplakPlacesNow();
    $params = [
        ':cat' => $values['cat'], ':name_fa' => $values['name_fa'], ':name_en' => $values['name_en'],
        ':lat' => $values['lat'], ':lng' => $values['lng'],
        ':addr_fa' => $values['addr_fa'], ':addr_en' => $values['addr_en'], ':tel' => $values['tel'],
        ':note_fa' => $values['note_fa'], ':note_en' => $values['note_en'],
        ':approx' => $values['approx'], ':now' => $now,
    ];

    try {
        if ($isBuiltin) {
            $existing = $rows[$key] ?? null;
            $hidden = $existing !== null ? (int) $existing['hidden'] : 0;
            if ($hidden === 0 && eplakPlacesSameAsBuiltin($values, $builtin[$key])) {
                /* بدون تغییر: ردیف اصلاحیِ قبلی (اگر بود) هم لازم نیست */
                if ($existing !== null) {
                    $pdo->prepare('DELETE FROM city_places WHERE place_key = :k')->execute([':k' => $key]);
                }
                return ['ok' => true, 'errors' => [], 'values' => $values, 'key' => $key, 'changed' => $existing !== null];
            }
            if ($existing !== null) {
                $pdo->prepare('UPDATE city_places SET cat = :cat, name_fa = :name_fa, name_en = :name_en, lat = :lat, lng = :lng,
                    addr_fa = :addr_fa, addr_en = :addr_en, tel = :tel, note_fa = :note_fa, note_en = :note_en,
                    approx = :approx, updated_at = :now WHERE place_key = :k')->execute($params + [':k' => $key]);
            } else {
                eplakPlacesInsert($pdo, $key, 'override', $params, $hidden, $now);
            }
            return ['ok' => true, 'errors' => [], 'values' => $values, 'key' => $key, 'changed' => true];
        }

        $hidden = empty($in['published']) ? 1 : 0;
        if ($key === '') {
            $key = eplakPlacesNewKey($rows);
            eplakPlacesInsert($pdo, $key, 'custom', $params, $hidden, $now);
        } else {
            $pdo->prepare('UPDATE city_places SET cat = :cat, name_fa = :name_fa, name_en = :name_en, lat = :lat, lng = :lng,
                addr_fa = :addr_fa, addr_en = :addr_en, tel = :tel, note_fa = :note_fa, note_en = :note_en,
                approx = :approx, hidden = :hidden, updated_at = :now WHERE place_key = :k')
                ->execute($params + [':k' => $key, ':hidden' => $hidden]);
        }
        return ['ok' => true, 'errors' => [], 'values' => $values, 'key' => $key, 'changed' => true];
    } catch (\Throwable $e) {
        error_log('eplak city_places save: ' . $e->getMessage());
        return $fail(['ذخیره در دیتابیس انجام نشد.']);
    }
}

function eplakPlacesInsert(PDO $pdo, string $key, string $kind, array $params, int $hidden, string $now): void
{
    $pdo->prepare('INSERT INTO city_places (place_key, kind, cat, name_fa, name_en, lat, lng, addr_fa, addr_en, tel,
            note_fa, note_en, approx, hidden, created_at, updated_at)
        VALUES (:k, :kind, :cat, :name_fa, :name_en, :lat, :lng, :addr_fa, :addr_en, :tel,
            :note_fa, :note_en, :approx, :hidden, :now, :now2)')
        ->execute($params + [':k' => $key, ':kind' => $kind, ':hidden' => $hidden, ':now2' => $now]);
}

/* کلید یکتای مکان افزوده‌شده: «u» + هشت رقم هگز */
function eplakPlacesNewKey(array $rows): string
{
    for ($i = 0; $i < 12; $i++) {
        $key = 'u' . bin2hex(random_bytes(4));
        if (!isset($rows[$key])) {
            return $key;
        }
    }
    return 'u' . bin2hex(random_bytes(8));
}

/**
 * پنهان/نمایان کردن. برای مکانِ پیش‌فرض یک ردیف اصلاحی ساخته می‌شود (با مقدارهای پیش‌فرض)؛
 * برای مکانِ افزوده‌شده «پیش‌نویس/منتشرشده» است.
 */
function eplakPlacesSetHidden(PDO $pdo, string $key, bool $hidden): bool
{
    if (!eplakPlacesEnsureTable($pdo)) {
        return false;
    }
    $builtin = eplakPlacesBuiltin()['places'];
    $rows = eplakPlacesRows($pdo);
    $now = eplakPlacesNow();
    try {
        if (isset($rows[$key])) {
            if ($rows[$key]['kind'] === 'override' && !$hidden) {
                $values = eplakPlacesRowValues($rows[$key]);
                if (isset($builtin[$key]) && eplakPlacesSameAsBuiltin($values, $builtin[$key])) {
                    /* فقط برای پنهان‌سازی ساخته شده بود؛ با نمایان شدن دیگر لازم نیست */
                    $pdo->prepare('DELETE FROM city_places WHERE place_key = :k')->execute([':k' => $key]);
                    return true;
                }
            }
            $pdo->prepare('UPDATE city_places SET hidden = :h, updated_at = :now WHERE place_key = :k')
                ->execute([':h' => $hidden ? 1 : 0, ':now' => $now, ':k' => $key]);
            return true;
        }
        if (isset($builtin[$key]) && $hidden) {
            $v = eplakPlacesFromBuiltin($builtin[$key]);
            eplakPlacesInsert($pdo, $key, 'override', [
                ':cat' => $v['cat'], ':name_fa' => $v['name_fa'], ':name_en' => $v['name_en'],
                ':lat' => $v['lat'], ':lng' => $v['lng'], ':addr_fa' => $v['addr_fa'], ':addr_en' => $v['addr_en'],
                ':tel' => $v['tel'], ':note_fa' => $v['note_fa'], ':note_en' => $v['note_en'],
                ':approx' => $v['approx'], ':now' => $now,
            ], 1, $now);
            return true;
        }
        return isset($builtin[$key]) && !$hidden;   /* پیش‌فرضِ نمایان که اصلاحی ندارد: کاری لازم نیست */
    } catch (\Throwable $e) {
        error_log('eplak city_places hide: ' . $e->getMessage());
        return false;
    }
}

/**
 * حذف ردیف: برای مکانِ افزوده‌شده یعنی «حذف مکان»؛ برای مکانِ پیش‌فرض یعنی «برگرداندن به حالت پیش‌فرض».
 * true اگر ردیفی بود و پاک شد.
 */
function eplakPlacesDelete(PDO $pdo, string $key): bool
{
    if ($key === '' || !eplakPlacesEnsureTable($pdo)) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('DELETE FROM city_places WHERE place_key = :k');
        $stmt->execute([':k' => $key]);
        return $stmt->rowCount() > 0;
    } catch (\Throwable $e) {
        error_log('eplak city_places delete: ' . $e->getMessage());
        return false;
    }
}

/* ── خروجی عمومی برای اپ (api/places.php) ──────────────────────────────── */

/**
 * فقط «تفاوت با فهرست پیش‌فرض اپ»:
 *   custom    — مکان‌های افزوده‌شده‌ی منتشرشده (هر کدام با id یکتای «u…»)
 *   overrides — اصلاح‌ها به‌صورت { idِ پیش‌فرض: مقدارهای کامل }
 *   hidden    — idِ مکان‌های پیش‌فرضی که باید پنهان شوند
 *   v         — اثر انگشت محتوا (اپ با آن می‌فهمد چیزی عوض شده یا نه)
 */
function eplakPlacesPublicPayload(PDO $pdo): array
{
    $ready = eplakPlacesEnsureTable($pdo);
    $builtin = eplakPlacesBuiltin()['places'];
    $custom = [];
    $overrides = [];
    $hidden = [];

    foreach (eplakPlacesRows($pdo) as $key => $row) {
        if ($row['lat'] === null || $row['lng'] === null) {
            continue;
        }
        if ($row['kind'] === 'custom') {
            if ((int) $row['hidden'] === 1) {
                continue;
            }
            $custom[] = ['id' => $key] + eplakPlacesPublicShape(eplakPlacesRowValues($row));
        } elseif (isset($builtin[$key])) {
            if ((int) $row['hidden'] === 1) {
                $hidden[] = $key;
            } else {
                $overrides[$key] = eplakPlacesPublicShape(eplakPlacesRowValues($row));
            }
        }
    }

    $payload = [
        'success'   => true,
        'ready'     => $ready,
        'custom'    => $custom,
        'overrides' => (object) $overrides,   /* همیشه شیء JSON (حتی وقتی خالی است) */
        'hidden'    => $hidden,
    ];
    $payload['v'] = substr(md5((string) json_encode($payload, JSON_UNESCAPED_UNICODE)), 0, 12);
    return $payload;
}

<?php
/* api/media.php — آپلود و سرو کردن امن فایل‌های پیوست (عکس/فیلم گزارش‌ها)

   دو کار انجام می‌دهد:

   ۱) آپلود از مسیر JSON (بدون multipart) — برای هاست‌هایی که ارسال
      multipart/form-data همراه فایل را با کد 403 می‌بندند (فایروال
      ModSecurity/Imunify). مسیر JSON همیشه باز است:
        POST ?action=upload   { phone, reportId, name, mime, data(base64) }
        POST ?action=chunk    { phone, reportId, uploadId, index, total,
                                name, mime, data(base64) }   ← برای فیلم‌های حجیم
      (تکه‌ها پشت سر هم روی سرور به هم می‌چسبند و در تکه‌ی آخر، اعتبارسنجی
       نوع/حجم انجام و ردیف فایل در دیتابیس ثبت می‌شود.)

   ۲) سرو کردن امن فایل ذخیره‌شده:
        api/media.php?f=uploads/reports/2026/09/xxxx.jpg
        api/media.php?id=12           (شناسه‌ی ردیف report_media)

   امنیت: مالکیت گزارش با شماره‌ی موبایل بررسی می‌شود، فقط تصویر/ویدیوی مجاز
   پذیرفته می‌شود، سقف تعداد فایل هر گزارش رعایت می‌شود و برای سرو کردن فقط
   مسیرهای داخل uploads/reports مجاز هستند (هر مسیر خارج از این پوشه رد می‌شود).
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/media.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = strtolower((string) ($_GET['action'] ?? ''));

/* ══════════════════════════════════════════════════════════════════════
   آپلود (JSON + base64) — جایگزین multipart برای هاست‌های محدودشده
   ══════════════════════════════════════════════════════════════════════ */
if ($method === 'POST' && in_array($action, ['upload', 'chunk', 'media_status'], true)) {
    eplakApiHeaders();
    $input = eplakReadJsonBody();
    if (!$input) {
        $input = $_POST;   /* پشتیبانی از فرم ساده هم (بدون فایل) */
    }

    $phone = eplakNormalizePhone($input['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }

    /* ── شناسه‌ی یکتای درخواست ────────────────────────────────────────────
       اپ عکس و فیلم را پیش از ساخته شدن گزارش می‌فرستد (تا کد پیگیری فقط پس
       از پایان بارگذاری صادر شود). در این حالت reportId صفر است و فایل با
       شناسه‌ی یکتا «در انتظار اتصال» ذخیره می‌شود. */
    $clientRef = strtoupper(preg_replace('/[^A-Za-z0-9\-]/', '', (string) ($input['client_ref'] ?? ($input['clientRef'] ?? ''))) ?? '');
    $clientRef = substr($clientRef, 0, 64);
    $staging = ($clientRef !== '') && eplakTableHasColumn($pdo, 'report_media', 'client_ref');

    $reportId = (int) ($input['reportId'] ?? ($input['report_id'] ?? 0));

    if ($reportId <= 0) {
        if (!$staging) {
            eplakJsonError('شناسه‌ی گزارش نامعتبر است', 400);
        }
        /* سقف تعداد فایل هر درخواست در حالت «در انتظار اتصال» هم رعایت می‌شود */
        $existing = eplakMediaStagedCount($pdo, $clientRef);
    } else {
        /* مالکیت: فقط صاحب همان گزارش می‌تواند فایل اضافه کند */
        try {
            $own = $pdo->prepare('SELECT id FROM reports WHERE id = :id AND user_phone = :phone LIMIT 1');
            $own->execute([':id' => $reportId, ':phone' => $phone]);
            if (!$own->fetchColumn()) {
                eplakJson(['success' => false, 'error' => 'گزارش یافت نشد'], 404);
            }
            $stmtCount = $pdo->prepare('SELECT COUNT(*) FROM report_media WHERE report_id = :id');
            $stmtCount->execute([':id' => $reportId]);
            $existing = (int) $stmtCount->fetchColumn();
        } catch (Throwable $e) {
            eplakServerError($e, 'media.owner');
            exit;
        }
    }

    /* پاک‌سازی تکه‌های نیمه‌کاره‌ی قدیمی (بیش از ۶ ساعت) */
    $tmpDir = EPLAK_ROOT . '/uploads/tmp';
    if (is_dir($tmpDir)) {
        foreach ((array) glob($tmpDir . '/*') as $stale) {
            $base = basename((string) $stale);
            if ($base === '.htaccess') {
                continue;
            }
            if (@filemtime((string) $stale) < time() - 21600) {
                @unlink((string) $stale);
            }
        }
    }

    if ($action === 'media_status') {
        $files = eplakMediaForReport($pdo, $reportId);
        eplakJson([
            'success'     => true,
            'media_count' => count($files),
            'max'         => EPLAK_MEDIA_MAX_PER_REPORT,
            'media'       => $files,
        ]);
        exit;
    }

    $name = eplakStr($input['name'] ?? '', 200);
    $mime = eplakStr($input['mime'] ?? ($input['type'] ?? ''), 100);
    if ($name === '') {
        $name = 'attachment';
    }

    if ($existing >= EPLAK_MEDIA_MAX_PER_REPORT) {
        eplakJson([
            'success' => false,
            'error'   => 'حداکثر ' . EPLAK_MEDIA_MAX_PER_REPORT . ' فایل برای هر گزارش پذیرفته می‌شود.',
        ], 400);
    }

    /* ── یک فایل کامل در یک درخواست ─────────────────────────────────── */
    if ($action === 'upload') {
        $data = (string) ($input['data'] ?? ($input['base64'] ?? ''));
        if (strlen($data) > 40 * 1024 * 1024) {
            eplakJson(['success' => false, 'error' => 'فایل بزرگ است؛ از ارسال تکه‌تکه استفاده کنید.'], 413);
        }
        $binary = eplakMediaDecodeBase64($data);
        if ($binary === null || $binary === '') {
            eplakJson(['success' => false, 'error' => 'محتوای فایل قابل خواندن نبود.'], 400);
        }
        $result = eplakMediaStoreBinary($pdo, $reportId, $binary, $name, $mime, ($reportId <= 0) ? $clientRef : '');
        if (!$result['ok']) {
            eplakJson(['success' => false, 'error' => $result['error']], 400);
        }
        $count = ($reportId <= 0)
            ? eplakMediaStagedCount($pdo, $clientRef)
            : count(eplakMediaForReport($pdo, $reportId));
        eplakJson([
            'success'     => true,
            'media'       => $result['media'],
            'media_count' => $count,
            'staged'      => ($reportId <= 0),
        ]);
        exit;
    }

    /* ── ارسال تکه‌تکه (فیلم‌های حجیم) ───────────────────────────────── */
    if ($action !== 'chunk') {
        eplakJson(['success' => false, 'error' => 'کنش نامعتبر است.'], 400);
    }

    $uploadId = strtolower((string) ($input['uploadId'] ?? ($input['upload_id'] ?? '')));
    $uploadId = preg_replace('/[^a-f0-9]/', '', $uploadId) ?? '';
    if (strlen($uploadId) < 8 || strlen($uploadId) > 64) {
        eplakJson(['success' => false, 'error' => 'شناسه‌ی ارسال نامعتبر است.'], 400);
    }

    $index = (int) ($input['index'] ?? 0);
    $total = (int) ($input['total'] ?? 1);
    if ($index < 0 || $total < 1 || $total > EPLAK_MEDIA_MAX_CHUNKS || $index >= $total) {
        eplakJson([
            'success'    => false,
            'error'      => 'شماره‌ی تکه نامعتبر است.',
            'max_chunks' => EPLAK_MEDIA_MAX_CHUNKS,
        ], 400);
    }

    if (!eplakMediaEnsureDir($tmpDir)) {
        eplakJson(['success' => false, 'error' => 'پوشه‌ی موقت سرور قابل نوشتن نیست.'], 500);
    }

    $partPath = $tmpDir . '/' . $uploadId . '.part';
    $metaPath = $tmpDir . '/' . $uploadId . '.json';
    $donePath = $tmpDir . '/' . $uploadId . '.done';
    $doneJsonPath = $tmpDir . '/' . $uploadId . '.done.json';

    /* ── اگر همین ارسال قبلاً کامل شده باشد، دوباره فایل ساخته نمی‌شود ──
       (شبکه‌ی بی‌پاسخ → تلاش دوباره‌ی اپ → جلوگیری از پیوست تکراری) */
    if (is_file($doneJsonPath)) {
        $done = json_decode((string) @file_get_contents($doneJsonPath), true);
        if (is_array($done) && (int) ($done['report_id'] ?? -1) === $reportId) {
            $files = eplakMediaForReport($pdo, $reportId);
            eplakJson([
                'success'     => true,
                'received'    => (int) ($done['total'] ?? $total),
                'total'       => (int) ($done['total'] ?? $total),
                'done'        => true,
                'already'     => true,
                'media'       => $done['media'] ?? [],
                'media_count' => count($files),
            ]);
            exit;
        }
    }

    /* ترتیب تکه‌ها بررسی می‌شود تا فایل خراب ساخته نشود */
    $expected = 0;
    if (is_file($metaPath)) {
        $meta = json_decode((string) @file_get_contents($metaPath), true);
        $expected = (int) ($meta['next'] ?? 0);
        if (is_file($partPath) && (int) ($meta['report_id'] ?? 0) !== $reportId) {
            @unlink($partPath);
            @unlink($metaPath);
            $expected = 0;
        }
    } elseif (is_file($partPath)) {
        @unlink($partPath);
    }

    /* ── تکه‌ی تکراری ───────────────────────────────────────────────────
       اگر پاسخِ تکه‌ی قبلی در راه گم شده (شبکه‌ی ضعیف یا مکث فایروال) و اپ
       همان تکه را دوباره فرستاده، دوباره به فایل چسبانده نمی‌شود؛ همان
       موفقیتِ قبلی برگردانده می‌شود تا ارسال فیلم از اول شروع نشود. */
    if ($expected > 0 && $index === $expected - 1 && is_file($partPath)) {
        eplakJson([
            'success'    => true,
            'received'   => $expected,
            'total'      => $total,
            'done'       => false,
            'duplicate'  => true,
            'max_chunks' => EPLAK_MEDIA_MAX_CHUNKS,
        ]);
        exit;
    }

    if ($index !== $expected) {
        eplakJson(['success' => false, 'error' => 'ترتیب تکه‌ها به هم خورده است؛ ارسال را از اول تکرار کنید.', 'expected' => $expected], 409);
    }

    $chunk = eplakMediaDecodeBase64((string) ($input['data'] ?? ''));
    if ($chunk === null) {
        eplakJson(['success' => false, 'error' => 'تکه‌ی ارسالی قابل خواندن نبود.'], 400);
    }

    /* سقف حجم کل: مبنای نوع فایل (تصویر/ویدیو) */
    $kindGuess = (strpos(strtolower($mime), 'video/') === 0) ? 'video' : 'image';
    $maxBytes = eplakMediaMaxBytes($kindGuess);
    $current = is_file($partPath) ? (int) (filesize($partPath) ?: 0) : 0;
    if ($current + strlen($chunk) > $maxBytes) {
        @unlink($partPath);
        @unlink($metaPath);
        eplakJson(['success' => false, 'error' => 'حجم فایل بیش از حد مجاز است (حداکثر ' . round($maxBytes / 1048576) . ' مگابایت).'], 413);
    }

    $handle = @fopen($partPath, is_file($partPath) ? 'ab' : 'wb');
    if (!$handle || @fwrite($handle, $chunk) === false) {
        if ($handle) {
            @fclose($handle);
        }
        eplakJson(['success' => false, 'error' => 'نوشتن تکه روی سرور ناموفق بود.'], 500);
    }
    @fclose($handle);

    @file_put_contents($metaPath, json_encode([
        'next'      => $index + 1,
        'total'     => $total,
        'report_id' => $reportId,
        'name'      => $name,
        'mime'      => $mime,
        'phone'     => $phone,
    ], JSON_UNESCAPED_UNICODE));

    $isLast = ($index + 1) >= $total;
    if (!$isLast) {
        eplakJson([
            'success'    => true,
            'received'   => $index + 1,
            'total'      => $total,
            'done'       => false,
            'max_chunks' => EPLAK_MEDIA_MAX_CHUNKS,
        ]);
        exit;
    }

    /* تکه‌ی آخر: اعتبارسنجی و ثبت نهایی */
    $stored = eplakMediaStoreFile($pdo, $reportId, [
        'tmp_name' => $partPath,
        'name'     => $name,
        'type'     => $mime,
        'error'    => UPLOAD_ERR_OK,
        'size'     => (int) (filesize($partPath) ?: 0),
    ], ($reportId <= 0) ? $clientRef : '');
    @unlink($metaPath);
    if (!$stored['ok']) {
        @unlink($partPath);
        eplakJson(['success' => false, 'error' => $stored['error']], 400);
    }

    /* نشانه‌ی «این ارسال تمام شد» تا تکه‌ی آخرِ تکراری فایل دوم نسازد */
    @file_put_contents($doneJsonPath, json_encode([
        'report_id' => $reportId,
        'upload_id' => $uploadId,
        'total'     => $total,
        'media'     => $stored['media'],
        'at'        => time(),
    ], JSON_UNESCAPED_UNICODE));

    $files = eplakMediaForReport($pdo, $reportId);
    eplakJson([
        'success'     => true,
        'received'    => $total,
        'total'       => $total,
        'done'        => true,
        'staged'      => ($reportId <= 0),
        'media'       => $stored['media'],
        'media_count' => ($reportId <= 0)
            ? eplakMediaStagedCount($pdo, $clientRef)
            : count($files),
    ]);
    exit;
}

$root = realpath(EPLAK_ROOT . '/uploads/reports');
if ($root === false) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'فایل یافت نشد';
    exit;
}

$requested = '';

$id = (int) ($_GET['id'] ?? 0);
if ($id > 0) {
    try {
        $stmt = $pdo->prepare('SELECT file_path FROM report_media WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $requested = (string) ($stmt->fetchColumn() ?: '');
    } catch (Throwable $e) {
        $requested = '';
    }
}

if ($requested === '') {
    $requested = (string) ($_GET['f'] ?? '');
}

$requested = rawurldecode(trim($requested));
$requested = ltrim(str_replace('\\', '/', $requested), '/');
if (strpos($requested, '..') !== false) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'مسیر نامعتبر';
    exit;
}

/* فقط مسیرهای داخل uploads/reports مجاز هستند */
$relative = preg_replace('#^.*?uploads/reports/#', '', $requested) ?? '';
$absolute = realpath($root . '/' . $relative);

if ($absolute === false || strpos($absolute, $root) !== 0 || !is_file($absolute)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'فایل یافت نشد';
    exit;
}

$mime = 'application/octet-stream';
if (function_exists('finfo_open')) {
    $finfo = @finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
        $detected = (string) @finfo_file($finfo, $absolute);
        @finfo_close($finfo);
        if ($detected !== '') {
            $mime = $detected;
        }
    }
}

$size = (int) (filesize($absolute) ?: 0);

header('Content-Type: ' . $mime);
header('Content-Length: ' . $size);
header('Cache-Control: private, max-age=86400');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . basename($absolute) . '"');

readfile($absolute);

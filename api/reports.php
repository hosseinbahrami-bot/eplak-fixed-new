<?php
/* api/reports.php — گزارش‌های شهروندی

   GET    ?phone=09xxxxxxxxx                      → گزارش‌های همان شماره (همراه فایل‌های پیوست)
   POST   {phone,title,description,…}             → ثبت گزارش جدید
          • JSON:  آرایه‌ی اختیاری media = [{name, mime, data(base64)}]
          • multipart/form-data با فیلدهای media[] (عکس/فیلم)
   POST   ?action=delete&id=..&phone=..  (یا بدنه‌ی JSON با action=delete)
   DELETE ?id=..&phone=..                        → حذف گزارش (فقط توسط مالک)

   نکته‌ی امنیتی: هر عملیات به شماره‌ی مالک مقید است؛ هیچ مسیری برای
   فهرست‌کردن یا حذف گزارش‌های سایر کاربران وجود ندارد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/media.php';

eplakApiHeaders();

/* ── اعتبارسنجی مختصات جغرافیایی (موقعیت دقیق گزارش) ──────────────────
   مقدارهای نامعتبر (خالی، متن، خارج از محدوده‌ی جهانی) به null تبدیل می‌شوند
   تا ثبت گزارش هرگز به‌خاطر مختصات خراب نشود. */
function eplakReportCoord($value, string $axis): ?float {
    if ($value === null || $value === '' || is_array($value)) {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $num = (float) $value;
    if (!is_finite($num)) {
        return null;
    }
    if ($axis === 'lat' && ($num < -90 || $num > 90)) {
        return null;
    }
    if ($axis === 'lng' && ($num < -180 || $num > 180)) {
        return null;
    }
    return round($num, 7);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$query  = $_GET;
$isMultipart = stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false;

/* خطای «حجم بالای post_max_size»: PHP در این حالت $_POST را خالی می‌کند و
   بدون این بررسی، کاربر پیام نامفهوم «Invalid JSON» می‌گیرد. */
if ($isMultipart && !$_POST && !$_FILES && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    $limit = ini_get('post_max_size');
    if ($limit) {
        eplakJsonError('حجم فایل‌های ارسالی بیش از حد مجاز سرور است (post_max_size = ' . $limit . '). فایل‌های سبک‌تری انتخاب کنید.', 413);
    }
}

/* ── فهرست گزارش‌های کاربر ─────────────────────────────────────────── */
if ($method === 'GET') {
    $phone = eplakNormalizePhone($query['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    try {
        /* ستون‌های مختصات ممکن است در دیتابیس‌های قدیمی هنوز ساخته نشده باشند */
        $hasGeo = eplakTableHasColumn($pdo, 'reports', 'lat') && eplakTableHasColumn($pdo, 'reports', 'lng');
        $geoCols = $hasGeo ? ', lat, lng' : '';
        $hasRef  = eplakTableHasColumn($pdo, 'reports', 'client_ref');
        $refCol  = $hasRef ? ', client_ref' : '';
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, category, department, sub_department, location, status, reply, created_at' . $geoCols . $refCol . '
                               FROM reports WHERE user_phone = :phone ORDER BY created_at DESC, id DESC LIMIT 200');
        $stmt->execute([':phone' => $phone]);
        $rows = $stmt->fetchAll();

        $ids = array_map(static fn($r) => (int) $r['id'], $rows);
        $mediaMap = eplakMediaGroupedByReport($pdo, $ids);
        $eventMap = eplakReportEventsGrouped($pdo, $ids);

        $out = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $row['id']   = $id;
            $row['code'] = 'EP-1403-' . str_pad((string) ($id + 1000), 4, '0', STR_PAD_LEFT);
            $row['media'] = $mediaMap[$id] ?? [];
            $row['media_count'] = count($row['media']);
            $row['timeline'] = $eventMap[$id] ?? [];
            $row['timeline_count'] = count($row['timeline']);
            /* شناسه‌ی یکتای درخواست — اپ با همین، رکورد محلی و سروری را
               دقیقاً تطبیق می‌دهد تا یک درخواست دو بار نشان داده نشود. */
            $row['client_ref'] = $hasRef ? (string) ($row['client_ref'] ?? '') : '';
            /* روند رسیدگی چهارمرحله‌ای — ساخته‌شده با همان تابعی که پنل ادمین
               استفاده می‌کند، تا هر دو طرف دقیقاً یک چیز نشان دهند. */
            $row['flow'] = eplakReportFlowStages(
                eplakReportStatusKey((string) ($row['status'] ?? 'pending')),
                $row['timeline'],
                (string) ($row['created_at'] ?? '')
            );
            if ($hasGeo) {
                $row['lat'] = isset($row['lat']) && $row['lat'] !== null ? (float) $row['lat'] : null;
                $row['lng'] = isset($row['lng']) && $row['lng'] !== null ? (float) $row['lng'] : null;
            } else {
                $row['lat'] = null;
                $row['lng'] = null;
            }
            $out[] = $row;
        }

        eplakJson(['success' => true, 'reports' => $out]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.get');
    }
}

/* ── خواندن ورودی (JSON یا فرم چندبخشی) ─────────────────────────────
   نکته: کلاینت اپ، JSON را با Content-Type: text/plain می‌فرستد تا درخواست
   «ساده» باشد و پیش‌پرواز CORS لازم نشود (صفحه‌ی اپ از file:// باز می‌شود و
   origin آن null است). اینجا بدنه صرف‌نظر از Content-Type خوانده می‌شود. */
$input = $isMultipart ? $_POST : eplakReadJsonBody();
if ((!is_array($input) || !$input) && !$isMultipart && $_POST) {
    $input = $_POST;   /* پشتیبانی از فرم ساده (بدون فایل) هم */
}
if (!is_array($input)) {
    $input = [];
}

/* اگر بدنه‌ی درخواست از سقف مجاز هاست (post_max_size) بزرگ‌تر بوده باشد، PHP
   آن را دور می‌ریزد و کلاینت پیام مبهم می‌گیرد؛ اینجا دلیل را روشن می‌گوییم
   تا کاربر بداند مشکل از حجم فایل است، نه از اینترنت. */
if (!$input && !$isMultipart && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    $limit = ini_get('post_max_size');
    eplakJsonError(
        'حجم درخواست بیش از حد مجاز سرور است (post_max_size = ' . ($limit ? $limit : 'نامشخص') . '). فایل‌های سبک‌تری انتخاب کنید.',
        413
    );
}

/* ── افزودن پیوست به گزارش موجود ─────────────────────────────────────
   POST {action:'add_media', phone, reportId, name, mime, data(base64)}
   این کنش همان کار api/media.php?action=upload را انجام می‌دهد ولی از
   دروازه‌ی گزارش‌ها می‌گذرد؛ چون app از همین مسیر (ثبت گزارش) همیشه پاسخ
   می‌گیرد، اگر مسیر تکه‌تکه روی هاست بسته باشد، پیوست‌ها از اینجا می‌روند. */
if ((($input['action'] ?? ($query['action'] ?? '')) === 'add_media')) {
    $reportId = (int) ($input['reportId'] ?? ($input['report_id'] ?? 0));
    $owner    = eplakNormalizePhone($input['phone'] ?? '');

    /* ── حالت «در انتظار اتصال» (staging) ────────────────────────────────
       اپ عکس و فیلم را پیش از ساخت گزارش می‌فرستد تا کد پیگیری فقط پس از
       پایان بارگذاری صادر شود؛ در این حالت reportId صفر است و فایل با شناسه‌ی
       یکتای درخواست ذخیره می‌شود. این دروازه همیشه باز است، پس اگر مسیر
       api/media.php روی هاست بسته باشد، پیوست‌ها از همین‌جا بالا می‌روند. */
    $clientRef = strtoupper(preg_replace('/[^A-Za-z0-9\-]/', '', (string) ($input['client_ref'] ?? ($input['clientRef'] ?? ''))) ?? '');
    $clientRef = substr($clientRef, 0, 64);
    $staging = ($reportId <= 0) && ($clientRef !== '') && eplakTableHasColumn($pdo, 'report_media', 'client_ref');

    if ($owner === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    if ($reportId <= 0 && !$staging) {
        eplakJsonError('شناسه‌ی گزارش و شماره‌ی مالک الزامی است', 400);
    }
    try {
        if (!$staging) {
            $stmt = $pdo->prepare('SELECT id FROM reports WHERE id = :id AND user_phone = :phone');
            $stmt->execute([':id' => $reportId, ':phone' => $owner]);
            if (!$stmt->fetch()) {
                eplakJson(['success' => false, 'error' => 'گزارش یافت نشد'], 404);
            }
        }
        $existing = $staging
            ? array_fill(0, eplakMediaStagedCount($pdo, $clientRef), null)
            : eplakMediaForReport($pdo, $reportId);
        if (count($existing) >= EPLAK_MEDIA_MAX_PER_REPORT) {
            eplakJson(['success' => false, 'error' => 'حداکثر ' . EPLAK_MEDIA_MAX_PER_REPORT . ' فایل برای هر گزارش پذیرفته می‌شود.'], 400);
        }

        $data = (string) ($input['data'] ?? ($input['base64'] ?? ''));
        $declaredMime = (string) ($input['mime'] ?? ($input['type'] ?? ''));
        if (strpos($data, 'data:') === 0 && strpos($data, 'base64,') !== false) {
            [$meta, $data] = explode('base64,', $data, 2);
            if (preg_match('#data:([^;]+)#', $meta, $m)) {
                $declaredMime = $m[1];
            }
        }
        $binary = base64_decode(preg_replace('/\s+/', '', $data) ?? '', true);
        if ($binary === false || $binary === '') {
            eplakJsonError('محتوای فایل قابل خواندن نبود.', 400);
        }

        $result = eplakMediaStoreBinary($pdo, $reportId, $binary, (string) ($input['name'] ?? 'file'), $declaredMime, $staging ? $clientRef : '');
        if (!$result['ok']) {
            eplakJson(['success' => false, 'error' => $result['error']], 400);
        }
        if (!$staging) {
            eplakReportEventAdd($pdo, $reportId, 'media', 'پیوست تازه', 'فایل «' . eplakStr($input['name'] ?? 'پیوست', 120) . '» به گزارش افزوده شد.', 'شهروند');
        }
        $count = $staging
            ? eplakMediaStagedCount($pdo, $clientRef)
            : count(eplakMediaForReport($pdo, $reportId));
        eplakJson([
            'success'     => true,
            'media'       => $result['media'],
            'media_count' => $count,
            'staged'      => $staging,
        ]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.add_media');
    }
}

/* ── حذف (DELETE یا POST با action=delete) ─────────────────────────── */
$isDelete = $method === 'DELETE'
    || (($query['action'] ?? '') === 'delete')
    || ((($input['action'] ?? '')) === 'delete');

if ($isDelete) {
    $id = (int) ($query['id'] ?? 0);
    if ($id <= 0) {
        $id = (int) ($input['id'] ?? 0);
    }
    $phone = eplakNormalizePhone($query['phone'] ?? ($input['phone'] ?? ($input['userPhone'] ?? '')));

    if ($id <= 0) {
        eplakJsonError('شناسه‌ی گزارش نامعتبر است', 400);
    }
    if ($phone === '') {
        eplakJsonError('برای حذف گزارش، شماره‌ی مالک الزامی است', 400);
    }

    try {
        // حذف فقط در صورتی که گزارش متعلق به همین شماره باشد
        $stmt = $pdo->prepare('DELETE FROM reports WHERE id = :id AND user_phone = :phone');
        $stmt->execute([':id' => $id, ':phone' => $phone]);
        if ($stmt->rowCount() === 0) {
            // یا وجود ندارد، یا متعلق به این کاربر نیست — هر دو 404 (بدون افشای وجود رکورد)
            eplakJson(['success' => false, 'error' => 'گزارش یافت نشد', 'deleted_id' => $id], 404);
        }
        /* فایل‌های پیوست هم پاک می‌شوند تا فضای سرور اشغال نماند */
        eplakMediaDeleteForReport($pdo, $id);
        eplakJson(['success' => true, 'deleted_id' => $id]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.delete');
    }
}

if ($method !== 'POST') {
    eplakJsonError('Method not allowed', 405);
}

if (!$input) {
    eplakJsonError('Invalid JSON', 400);
}

/* ── ثبت گزارش جدید ─────────────────────────────────────────────────── */
/* پاک‌سازی فایل‌های «در انتظار اتصال» که بیش از یک روز مانده‌اند (درخواستی
   که هرگز تکمیل نشده است) — تا فضای سرور پر نشود. */
try {
    if (eplakTableHasColumn($pdo, 'report_media', 'client_ref')) {
        eplakMediaCleanupStaged($pdo, 86400);
    }
} catch (Throwable $e) {
    error_log('[eplak-api:reports.cleanup-staged] ' . $e->getMessage());
}

$phone         = eplakNormalizePhone($input['phone'] ?? ($input['userPhone'] ?? ''));
/* شناسه‌ی یکتای درخواست (کلاینت): اگر همین درخواست قبلاً ثبت شده باشد،
   دوباره رکورد و کد پیگیری تازه ساخته نمی‌شود — همان کد قبلی برگردانده
   می‌شود. علت واقعی باگ: وقتی ارسال همراه پیوست در فایروال هاست گیر می‌کرد،
   اپ یک‌بار «با پیوست» و یک‌بار «بدون پیوست» می‌فرستاد و سرور هر دو را
   ثبت می‌کرد؛ نتیجه: دو گزارش با دو کد پیگیری. */
$clientRef     = strtoupper(preg_replace('/[^A-Za-z0-9\-]/', '', (string) ($input['client_ref'] ?? ($input['clientRef'] ?? ''))) ?? '');
$clientRef     = substr($clientRef, 0, 64);
$subject       = eplakStr($input['subject'] ?? ($input['title'] ?? ''), 255);
$details       = eplakStr($input['details'] ?? ($input['description'] ?? ''), 4000);
$reportType    = eplakStr($input['reportType'] ?? ($input['category'] ?? 'سایر'), 100);
$department    = eplakStr($input['department'] ?? ($input['mainDepartment'] ?? ''), 255);
$subDepartment = eplakStr($input['subDepartment'] ?? ($input['sub_department'] ?? ''), 255);
$location      = eplakStr($input['location'] ?? '', 500);
$lat           = eplakReportCoord($input['lat'] ?? ($input['latitude'] ?? null), 'lat');
$lng           = eplakReportCoord($input['lng'] ?? ($input['longitude'] ?? ($input['lon'] ?? null)), 'lng');
$locationAcc   = eplakReportCoord($input['locationAccuracy'] ?? ($input['accuracy'] ?? null), 'lat');
$name          = eplakStr($input['name'] ?? '', 255);
$address       = eplakStr($input['address'] ?? '', 500);
$nid           = eplakStr($input['nid'] ?? '', 20);

if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}
if ($subject === '' || $details === '') {
    eplakJsonError('عنوان و توضیحات گزارش الزامی است', 400);
}
if ($reportType === '') {
    $reportType = 'سایر';
}

$hasGeo = false;   /* بعداً داخل تراکنش مقدار می‌گیرد؛ اینجا برای اطمینان تعریف می‌شود */

/* ── تکراری؟ ──────────────────────────────────────────────────────────
   اگر همین «شناسه‌ی یکتای درخواست» قبلاً ثبت شده باشد، گزارش تازه ساخته
   نمی‌شود؛ فقط پیوست‌های همین درخواست (اگر همراه آمده باشد) به همان گزارش
   اضافه می‌شوند و همان کد پیگیری برمی‌گردد. */
$existingId = 0;
if ($clientRef !== '' && eplakTableHasColumn($pdo, 'reports', 'client_ref')) {
    try {
        $findStmt = $pdo->prepare('SELECT id FROM reports WHERE client_ref = :ref LIMIT 1');
        $findStmt->execute([':ref' => $clientRef]);
        $existingId = (int) ($findStmt->fetchColumn() ?: 0);
    } catch (Throwable $e) {
        $existingId = 0;
    }
}

/* ── تکراری‌یابیِ محتوایی (برای نسخه‌های قدیمی اپ که شناسه نمی‌فرستند) ──
   اگر همین شماره، دقیقاً همین عنوان و توضیح را چند لحظه پیش ثبت کرده باشد،
   همان گزارش برگردانده می‌شود؛ علت: اپ قدیمی در نبود پاسخ، دوباره ارسال
   می‌کرد و دو گزارش با دو کد ساخته می‌شد. پنجره‌ی زمانی کوتاه است تا ثبت
   عمدیِ دو درخواست مشابه توسط کاربر سرکوب نشود. */
if ($existingId === 0 && $clientRef === '') {
    try {
        $windowSeconds = 180;
        $dupeStmt = $pdo->prepare(
            'SELECT id FROM reports
             WHERE user_phone = :phone AND title = :title AND description = :desc
               AND created_at >= :since
             ORDER BY id DESC LIMIT 1'
        );
        $dupeStmt->execute([
            ':phone' => $phone,
            ':title' => $subject,
            ':desc'  => $details,
            ':since' => date('Y-m-d H:i:s', time() - $windowSeconds),
        ]);
        $existingId = (int) ($dupeStmt->fetchColumn() ?: 0);
        if ($existingId > 0) {
            error_log('[eplak-api:reports.dedupe-content] same content within ' . $windowSeconds . 's → report ' . $existingId);
        }
    } catch (Throwable $e) {
        $existingId = 0;
    }
}

if ($existingId > 0) {
    /* پیوست‌های همین تلاش را به گزارش موجود اضافه می‌کنیم تا هیچ عکس/فیلمی
       از دست نرود (اکنون عکس و فیلم با هم فرستاده می‌شوند). */
    $dupMedia = [];
    $dupMediaErrors = [];

    /* فایل‌هایی که پیش از ساخت گزارش «در انتظار اتصال» ذخیره شده‌اند */
    if ($clientRef !== '') {
        $dupMedia = eplakMediaAttachStaged($pdo, $existingId, $clientRef);
    }
    $mediaInput = $input['media'] ?? [];
    if (is_array($mediaInput)) {
        $count = 0;
        foreach ($mediaInput as $item) {
            if (!is_array($item) || $count >= EPLAK_MEDIA_MAX_PER_REPORT) {
                continue;
            }
            $data = (string) ($item['data'] ?? ($item['base64'] ?? ''));
            if ($data === '') {
                continue;
            }
            $declaredMime = (string) ($item['mime'] ?? ($item['type'] ?? ''));
            if (strpos($data, 'data:') === 0 && strpos($data, 'base64,') !== false) {
                [$meta, $data] = explode('base64,', $data, 2);
                if (preg_match('#data:([^;]+)#', $meta, $m)) {
                    $declaredMime = $m[1];
                }
            }
            $binary = base64_decode(preg_replace('/\s+/', '', $data) ?? '', true);
            if ($binary === false || $binary === '') {
                $dupMediaErrors[] = 'محتوای فایل «' . eplakStr($item['name'] ?? 'پیوست', 80) . '» قابل خواندن نبود.';
                continue;
            }
            $result = eplakMediaStoreBinary($pdo, $existingId, $binary, (string) ($item['name'] ?? 'file'), $declaredMime);
            if ($result['ok']) {
                $dupMedia[] = $result['media'];
            } else {
                $dupMediaErrors[] = $result['error'];
            }
            $count++;
        }
    }

    /* اگر پیوست تازه‌ای به گزارش قبلی اضافه شد، همان گام در روند رسیدگی ثبت می‌شود */
    if ($dupMedia) {
        try {
            eplakReportEventAdd(
                $pdo,
                $existingId,
                'media',
                'پیوست‌ها ثبت شد',
                'تعداد ' . count($dupMedia) . ' فایل (عکس/فیلم) به گزارش پیوست شد.',
                'citizen',
                ''
            );
        } catch (Throwable $e) {
            error_log('[eplak-api:reports.dedupe-media] ' . $e->getMessage());
        }
    }

    $dupCode = 'EP-1403-' . str_pad((string) $existingId, 4, '0', STR_PAD_LEFT);
    eplakJson([
        'success'       => true,
        'deduped'       => true,          /* اپ می‌فهمد گزارش تازه ساخته نشده */
        'id'            => $existingId,
        'tracking_code' => $dupCode,
        'media'         => $dupMedia,
        'media_count'   => count($dupMedia),
        'media_errors'  => $dupMediaErrors,
        'timeline'      => eplakReportEvents($pdo, $existingId),
        'flow'          => eplakReportFlowStages(
            eplakReportStatusKey((string) $pdo->query('SELECT status FROM reports WHERE id = ' . $existingId)->fetchColumn()),
            eplakReportEvents($pdo, $existingId),
            ''
        ),
    ]);
    exit;
}

try {
    $pdo->beginTransaction();

    $stmtUser = $pdo->prepare(eplakUsersUpsertSql($pdo, false));
    $stmtUser->execute([
        ':phone'   => $phone,
        ':name'    => $name,
        ':address' => $address,
        ':nid'     => $nid,
    ]);

    /* موقعیت دقیق (GPS گوشی یا نشانگر نقشه) — در صورت وجود ستون‌های lat/lng */
    $hasGeo = ($lat !== null && $lng !== null)
        && eplakTableHasColumn($pdo, 'reports', 'lat')
        && eplakTableHasColumn($pdo, 'reports', 'lng');
    $hasAcc = $hasGeo && eplakTableHasColumn($pdo, 'reports', 'location_accuracy');

    /* اگر ستون شناسه‌ی یکتا وجود دارد، همراه INSERT ثبت می‌شود تا حتی دو
       درخواست هم‌زمان هم نتوانند دو گزارش تکراری بسازند. */
    $hasRef = ($clientRef !== '') && eplakTableHasColumn($pdo, 'reports', 'client_ref');

    if ($hasGeo) {
        $cols = $hasAcc
            ? 'user_phone, title, description, category, department, sub_department, location, lat, lng, location_accuracy, status'
            : 'user_phone, title, description, category, department, sub_department, location, lat, lng, status';
        $vals = $hasAcc
            ? ':phone, :title, :description, :category, :department, :sub_department, :location, :lat, :lng, :accuracy, :status'
            : ':phone, :title, :description, :category, :department, :sub_department, :location, :lat, :lng, :status';
        if ($hasRef) {
            $cols .= ', client_ref';
            $vals .= ', :client_ref';
        }
        $stmtReport = $pdo->prepare('INSERT INTO reports (' . $cols . ') VALUES (' . $vals . ')');
        $params = [
            ':phone'          => $phone,
            ':title'          => $subject,
            ':description'    => $details,
            ':category'       => $reportType,
            ':department'     => $department,
            ':sub_department' => $subDepartment,
            ':location'       => $location,
            ':lat'            => $lat,
            ':lng'            => $lng,
            ':status'         => 'pending',
        ];
        if ($hasAcc) {
            $params[':accuracy'] = $locationAcc;
        }
        if ($hasRef) {
            $params[':client_ref'] = $clientRef;
        }
        $stmtReport->execute($params);
    } else {
        $plainCols = 'user_phone, title, description, category, department, sub_department, location, status';
        $plainVals = ':phone, :title, :description, :category, :department, :sub_department, :location, :status';
        if ($hasRef) {
            $plainCols .= ', client_ref';
            $plainVals .= ', :client_ref';
        }
        $stmtReport = $pdo->prepare('INSERT INTO reports (' . $plainCols . ') VALUES (' . $plainVals . ')');
        $plainParams = [
            ':phone'          => $phone,
            ':title'          => $subject,
            ':description'    => $details,
            ':category'       => $reportType,
            ':department'     => $department,
            ':sub_department' => $subDepartment,
            ':location'       => $location,
            ':status'         => 'pending',
        ];
        if ($hasRef) {
            $plainParams[':client_ref'] = $clientRef;
        }
        $stmtReport->execute($plainParams);
    }
    $insertId = (int) $pdo->lastInsertId();

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    /* اگر دو درخواست دقیقاً هم‌زمان با یک شناسه برسند، قید یکتای client_ref
       درخواست دوم را رد می‌کند؛ به‌جای خطا، همان گزارش ثبت‌شده برگردانده
       می‌شود تا کاربر فقط یک کد پیگیری ببیند. */
    $isDup = ($clientRef !== '')
        && (stripos($e->getMessage(), 'Duplicate') !== false || stripos($e->getMessage(), 'UNIQUE') !== false);
    if ($isDup && eplakTableHasColumn($pdo, 'reports', 'client_ref')) {
        try {
            $findStmt = $pdo->prepare('SELECT id FROM reports WHERE client_ref = :ref LIMIT 1');
            $findStmt->execute([':ref' => $clientRef]);
            $raceId = (int) ($findStmt->fetchColumn() ?: 0);
            if ($raceId > 0) {
                eplakJson([
                    'success'       => true,
                    'deduped'       => true,
                    'id'            => $raceId,
                    'tracking_code' => 'EP-1403-' . str_pad((string) $raceId, 4, '0', STR_PAD_LEFT),
                    'media'         => [],
                    'media_count'   => 0,
                    'timeline'      => eplakReportEvents($pdo, $raceId),
                ]);
            }
        } catch (Throwable $inner) {
            /* اگر پیدا کردن گزارش قبلی ممکن نشد، خطای اصلی گزارش می‌شود */
        }
    }
    eplakServerError($e, 'reports.create');
}

/* ── ذخیره‌ی عکس/فیلم‌های گزارش ─────────────────────────────────────── */
$savedMedia = [];
$mediaErrors = [];

/* ── اتصال فایل‌هایی که پیش از ساخت گزارش فرستاده شده‌اند ──────────────
   اپ نو ابتدا عکس/فیلم را «در انتظار اتصال» می‌فرستد و تنها پس از پایان
   بارگذاری، گزارش را می‌سازد؛ پس اینجا همان فایل‌ها به گزارش وصل می‌شوند. */
if ($clientRef !== '') {
    $staged = eplakMediaAttachStaged($pdo, $insertId, $clientRef);
    foreach ($staged as $item) {
        $savedMedia[] = $item;
    }
}

try {
    if ($isMultipart) {
        $files = eplakMediaNormalizeFiles($_FILES['media'] ?? ($_FILES['photos'] ?? null));
        $count = 0;
        foreach ($files as $file) {
            if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            if ($count >= EPLAK_MEDIA_MAX_PER_REPORT) {
                $mediaErrors[] = 'حداکثر ' . EPLAK_MEDIA_MAX_PER_REPORT . ' فایل برای هر گزارش پذیرفته می‌شود.';
                break;
            }
            $result = eplakMediaStoreFile($pdo, $insertId, $file);
            if ($result['ok']) {
                $savedMedia[] = $result['media'];
            } else {
                $mediaErrors[] = $result['error'];
            }
            $count++;
        }
    } else {
        $mediaInput = $input['media'] ?? [];
        if (is_array($mediaInput)) {
            $count = 0;
            foreach ($mediaInput as $item) {
                if (!is_array($item) || $count >= EPLAK_MEDIA_MAX_PER_REPORT) {
                    continue;
                }
                $data = (string) ($item['data'] ?? ($item['base64'] ?? ''));
                if ($data === '') {
                    continue;
                }
                /* پشتیبانی از data URL: data:image/jpeg;base64,xxxx */
                $declaredMime = (string) ($item['mime'] ?? ($item['type'] ?? ''));
                if (strpos($data, 'data:') === 0 && strpos($data, 'base64,') !== false) {
                    [$meta, $data] = explode('base64,', $data, 2);
                    if (preg_match('#data:([^;]+)#', $meta, $m)) {
                        $declaredMime = $m[1];
                    }
                }
                $binary = base64_decode(preg_replace('/\s+/', '', $data) ?? '', true);
                if ($binary === false || $binary === '') {
                    $mediaErrors[] = 'محتوای فایل «' . eplakStr($item['name'] ?? 'پیوست', 80) . '» قابل خواندن نبود.';
                    continue;
                }
                $result = eplakMediaStoreBinary($pdo, $insertId, $binary, (string) ($item['name'] ?? 'file'), $declaredMime);
                if ($result['ok']) {
                    $savedMedia[] = $result['media'];
                } else {
                    $mediaErrors[] = $result['error'];
                }
                $count++;
            }
        }
    }
} catch (Throwable $e) {
    error_log('[eplak-api:reports.media] ' . $e->getMessage());
    $mediaErrors[] = 'ذخیره‌ی برخی فایل‌ها ناموفق بود.';
}

/* ── اعلان فوری برای خودِ کاربر: «درخواست شما ثبت شد» ─────────────────
   این اعلان هم در فهرست اعلان‌های اپ/سایت دیده می‌شود و هم (اگر فایربیس فعال
   باشد) بلافاصله روی گوشی می‌رسد؛ حتی وقتی برنامه بسته است. */
$trackingCode = 'EP-1403-' . str_pad((string) $insertId, 4, '0', STR_PAD_LEFT);

/* گام‌های آغازین روند رسیدگی: «ثبت شد» و «ارجاع به واحد» */
try {
    eplakReportTimelineBootstrap($pdo, $insertId, [
        'department'     => $department,
        'sub_department' => $subDepartment,
    ]);
} catch (Throwable $e) {
    error_log('[eplak-api:reports.timeline] ' . $e->getMessage());
}

/* اگر پیوست‌ها همین حالا ذخیره شده‌اند، گام آن هم ثبت می‌شود */
if ($savedMedia) {
    eplakReportEventAdd(
        $pdo,
        $insertId,
        'media',
        'پیوست‌ها ثبت شد',
        'تعداد ' . count($savedMedia) . ' فایل (عکس/فیلم) به گزارش پیوست شد.',
        'citizen',
        ''
    );
}

try {
    require_once __DIR__ . '/../shared/notify_events.php';
    eplakNotifyRequestCreated($pdo, $phone, 'درخواست', $trackingCode);
} catch (Throwable $e) {
    error_log('[eplak-api:reports.notify] ' . $e->getMessage());
}

eplakJson([
    'success'       => true,
    'timeline'      => eplakReportEvents($pdo, $insertId),
    'flow'          => eplakReportFlowStages('pending', eplakReportEvents($pdo, $insertId), gmdate('Y-m-d H:i:s')),
    'id'            => $insertId,
    'tracking_code' => $trackingCode,
    'lat'           => $hasGeo ? $lat : null,
    'lng'           => $hasGeo ? $lng : null,
    'media'         => $savedMedia,
    'media_count'   => count($savedMedia),
    'media_errors'  => $mediaErrors,
]);

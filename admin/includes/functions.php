<?php
/* توابع داده‌ای مشترک پنل مدیریت.
   فایل‌های کمکی سراسری (فایل‌های پیوست و اعلان پس‌زمینه) هم از همین‌جا بارگذاری
   می‌شوند تا همه‌ی صفحه‌های پنل به آن‌ها دسترسی داشته باشند. */
require_once dirname(__DIR__, 2) . '/shared/media.php';
require_once dirname(__DIR__, 2) . '/shared/webpush.php';

function getDashboardStats(PDO $pdo): array {
    $reportsCount = $pdo->query('SELECT COUNT(*) as count FROM reports')->fetch();
    $usersCount = $pdo->query('SELECT COUNT(*) as count FROM users')->fetch();
    $ticketsCount = $pdo->query('SELECT COUNT(*) as count FROM tickets')->fetch();
    $pendingReportsCount = $pdo->query("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'")->fetch();
    $doneReportsCount = $pdo->query("SELECT COUNT(*) as count FROM reports WHERE status = 'done'")->fetch();
    $pendingTicketsCount = $pdo->query("SELECT COUNT(*) as count FROM tickets WHERE status = 'pending'")->fetch();

    $newsCount = 0;
    try {
        $newsCount = (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
    } catch (Throwable $e) {
        $newsCount = 0;
    }

    $reportsWithMedia = 0;
    try {
        /* فقط گزارش‌های واقعی — ردیف‌های «در انتظار اتصال» (report_id صفر) شمرده نمی‌شوند */
        $reportsWithMedia = (int) $pdo->query('SELECT COUNT(DISTINCT report_id) FROM report_media WHERE report_id > 0')->fetchColumn();
    } catch (Throwable $e) {
        $reportsWithMedia = 0;
    }

    return [
        'reports_count' => (int)$reportsCount['count'],
        'users_count' => (int)$usersCount['count'],
        'tickets_count' => (int)$ticketsCount['count'],
        'pending_reports_count' => (int)$pendingReportsCount['count'],
        'done_reports_count' => (int)$doneReportsCount['count'],
        'pending_tickets_count' => (int)$pendingTicketsCount['count'],
        'news_count' => $newsCount,
        'reports_with_media' => $reportsWithMedia,
        'push_subscribers' => eplakPushCount($pdo),
    ];
}

function getLatestReports(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getLatestTickets(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("TC-", LPAD(id + 1000, 4, "0")) AS code FROM tickets ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getLatestUsers(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getAllDepartments(PDO $pdo, bool $onlyActive = false): array {
    $sql = 'SELECT * FROM departments';
    if ($onlyActive) {
        $sql .= ' WHERE is_active = 1';
    }
    $sql .= ' ORDER BY parent_id IS NULL DESC, sort_order ASC, name ASC';
    $stmt = $pdo->query($sql);
    return $stmt->fetchAll();
}

function getSubDepartments(PDO $pdo, int $parentId): array {
    $stmt = $pdo->prepare('SELECT * FROM departments WHERE parent_id = :parent_id ORDER BY sort_order ASC, name ASC');
    $stmt->execute([':parent_id' => $parentId]);
    return $stmt->fetchAll();
}

function getDepartmentTree(PDO $pdo): array {
    $rows = getAllDepartments($pdo);
    $index = [];
    foreach ($rows as $row) {
        $row['children'] = [];
        $index[(int)$row['id']] = $row;
    }

    foreach ($rows as $row) {
        $parentId = (int)($row['parent_id'] ?? 0);
        if ($parentId > 0 && isset($index[$parentId])) {
            $index[$parentId]['children'][] = &$index[(int)$row['id']];
        }
    }

    $tree = [];
    foreach ($index as $row) {
        if ((int)($row['parent_id'] ?? 0) === 0) {
            $tree[] = $row;
        }
    }

    return $tree;
}

function getDepartmentById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM departments WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $department = $stmt->fetch();
    return $department ?: null;
}

function createDepartment(PDO $pdo, array $data): int {
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        return 0;
    }

    $parentId = isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null ? (int)$data['parent_id'] : null;
    $sortOrder = isset($data['sort_order']) ? (int)$data['sort_order'] : 0;
    $slug = trim((string)($data['slug'] ?? '')) ?: null;
    $code = trim((string)($data['code'] ?? '')) ?: null;

    $stmt = $pdo->prepare('INSERT INTO departments (name, slug, code, parent_id, sort_order, is_active, description, icon, color) VALUES (:name, :slug, :code, :parent_id, :sort_order, :is_active, :description, :icon, :color)');
    $stmt->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':code' => $code,
        ':parent_id' => $parentId,
        ':sort_order' => $sortOrder,
        ':is_active' => (int)($data['is_active'] ?? 1),
        ':description' => trim((string)($data['description'] ?? '')),
        ':icon' => trim((string)($data['icon'] ?? 'fa-building')) ?: null,
        ':color' => trim((string)($data['color'] ?? '#0f766e')) ?: '#0f766e',
    ]);

    return (int)$pdo->lastInsertId();
}

function updateDepartment(PDO $pdo, int $id, array $data): void {
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        return;
    }

    $parentId = isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null ? (int)$data['parent_id'] : null;
    $sortOrder = isset($data['sort_order']) ? (int)$data['sort_order'] : 0;
    $slug = trim((string)($data['slug'] ?? '')) ?: null;
    $code = trim((string)($data['code'] ?? '')) ?: null;

    $stmt = $pdo->prepare('UPDATE departments SET name = :name, slug = :slug, code = :code, parent_id = :parent_id, sort_order = :sort_order, is_active = :is_active, description = :description, icon = :icon, color = :color WHERE id = :id');
    $stmt->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':code' => $code,
        ':parent_id' => $parentId,
        ':sort_order' => $sortOrder,
        ':is_active' => (int)($data['is_active'] ?? 1),
        ':description' => trim((string)($data['description'] ?? '')),
        ':icon' => trim((string)($data['icon'] ?? 'fa-building')) ?: null,
        ':color' => trim((string)($data['color'] ?? '#0f766e')) ?: '#0f766e',
        ':id' => $id,
    ]);
}

function deleteDepartment(PDO $pdo, int $id): void {
    foreach (getSubDepartments($pdo, $id) as $child) {
        deleteDepartment($pdo, (int)$child['id']);
    }
    $stmt = $pdo->prepare('DELETE FROM departments WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function getAllReports(PDO $pdo): array {
    $stmt = $pdo->query('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports ORDER BY created_at DESC');
    return $stmt->fetchAll();
}

/* وضعیت‌های معتبر (کلیدهای انگلیسی و برچسب‌های فارسی) */
function eplakStatusKeys(): array {
    return ['pending', 'in_progress', 'review', 'done'];
}

function eplakStatusRawValues(): array {
    /* مقادیر خامِ وضعیت که ممکن است در دیتابیس هاست باشند — هم کلیدهای
       انگلیسی، هم برچسب‌های فارسیِ تازه، هم برچسب‌های قدیمی که از قبل
       ذخیره شده‌اند (گزارش‌های قدیمی همیشه درست خوانده شوند). */
    return [
        'pending', 'in_progress', 'review', 'done',
        'در انتظار', 'در انتظار بررسی', 'در حال انتظار',
        'در حال بررسی', 'در حال پیگیری', 'در حال رسیدگی',
        'انجام شده', 'انجام‌شده', 'انجام شد', 'تکمیل شده',
    ];
}

/* تشخیص وضعیت یک ردیف گزارش.
   در برخی ردیف‌های قدیمی، مقدار وضعیت و واحد اداری جابه‌جا ذخیره شده است؛
   این تابع هر دو ستون را بررسی می‌کند و هرکدام شبیه وضعیت بود همان را برمی‌گرداند. */
function reportStatusOf(array $row): string {
    $valid = eplakStatusRawValues();
    foreach (['status', 'department'] as $col) {
        $v = trim((string)($row[$col] ?? ''));
        if ($v === '') {
            continue;
        }
        if (in_array($v, $valid, true)) {
            return normalizeStatusValue($v);
        }
    }
    return 'pending';
}

/** گزارش‌ها بر اساس واحد اداری (برای نمودار ستونی) */
function getReportsByDepartment(PDO $pdo, int $limit = 8): array
{
    $rows = $pdo->query('SELECT department, COUNT(*) AS cnt FROM reports GROUP BY department ORDER BY cnt DESC, department ASC')
                ->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $name = trim((string)$r['department']);
        $out[] = ['label' => $name !== '' ? $name : 'واحد نامشخص', 'count' => (int)$r['cnt']];
    }
    if (count($out) > $limit) {
        $top = array_slice($out, 0, $limit);
        $restCount = 0;
        foreach (array_slice($out, $limit) as $r) { $restCount += $r['count']; }
        $top[] = ['label' => 'سایر', 'count' => $restCount];
        $out = $top;
    }
    return $out;
}

/** روند ماهانهٔ گزارش‌ها — ماه‌های بدون گزارش هم با صفر نمایش داده می‌شوند */
function getReportsMonthly(PDO $pdo, int $months = 6): array
{
    $raw = $pdo->query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS cnt
                        FROM reports
                        WHERE created_at IS NOT NULL AND created_at > '0001-01-01'
                        GROUP BY ym")->fetchAll();
    $map = [];
    foreach ($raw as $r) { $map[(string)$r['ym']] = (int)$r['cnt']; }

    $names = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
              'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

    $out = [];
    $cursor = new DateTime('first day of this month');
    $cursor->modify('-' . ($months - 1) . ' months');
    for ($i = 0; $i < $months; $i++) {
        $key = $cursor->format('Y-m');
        $out[] = [
            'key'   => $key,
            'label' => $names[(int)$cursor->format('n') - 1],
            'year'  => (int)$cursor->format('Y'),
            'count' => $map[$key] ?? 0,
        ];
        $cursor->modify('+1 month');
    }
    return $out;
}

/* آمار وضعیت گزارش‌ها برای نمودار */
function getReportsStatusStats(PDO $pdo): array {
    $rows = $pdo->query('SELECT status, department FROM reports')->fetchAll();
    $stats = ['pending' => 0, 'in_progress' => 0, 'done' => 0];
    $total = 0;
    foreach ($rows as $r) {
        $key = reportStatusOf($r);
        if (!isset($stats[$key])) {
            $stats[$key] = 0;
        }
        $stats[$key]++;
        $total++;
    }
    return ['total' => $total, 'counts' => $stats];
}

function normalizeStatusValue(string $status): string {
    $status = trim($status);
    /* کلیدهای انگلیسی + همه‌ی برچسب‌های فارسی (تازه و قدیمی) تا داده‌های
       ذخیره‌شده‌ی قبلی هم درست شناسایی شوند. */
    $map = [
        'pending' => 'pending',
        'در انتظار' => 'pending',
        'در انتظار بررسی' => 'pending',
        'در حال انتظار' => 'pending',
        'in_progress' => 'in_progress',
        'review' => 'in_progress',
        'در حال بررسی' => 'in_progress',
        'در حال پیگیری' => 'in_progress',
        'در حال رسیدگی' => 'in_progress',
        'done' => 'done',
        'انجام شده' => 'done',
        'انجام‌شده' => 'done',
        'انجام شد' => 'done',
        'تکمیل شده' => 'done',
    ];

    return $map[$status] ?? 'pending';
}

function statusLabel(string $status): string {
    $status = normalizeStatusValue($status);
    /* همان چهار مرحله‌ای که شهروند در اپ می‌بیند */
    $labels = [
        'pending' => 'در حال انتظار',
        'in_progress' => 'در حال رسیدگی',
        'done' => 'انجام شد',
    ];

    return $labels[$status] ?? 'در حال انتظار';
}

function statusClass(string $status): string {
    $status = normalizeStatusValue($status);
    $classes = [
        'pending' => 'status-pending',
        'in_progress' => 'status-progress',
        'done' => 'status-done',
    ];

    return $classes[$status] ?? 'status-pending';
}

function getAllUsers(PDO $pdo): array {
    $stmt = $pdo->query('SELECT u.*, COUNT(r.id) AS report_count FROM users u LEFT JOIN reports r ON u.phone = r.user_phone GROUP BY u.id ORDER BY u.created_at DESC');
    return $stmt->fetchAll();
}

function getUserByPhone(PDO $pdo, string $phone): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE phone = :phone LIMIT 1');
    $stmt->execute([':phone' => $phone]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function getUserById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $user = $stmt->fetch();
    return $user ?: null;
}

function createUser(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO users (phone, name, address, nid) VALUES (:phone, :name, :address, :nid)');
    $stmt->execute([
        ':phone' => trim((string)($data['phone'] ?? '')),
        ':name' => trim((string)($data['name'] ?? '')),
        ':address' => trim((string)($data['address'] ?? '')),
        ':nid' => trim((string)($data['nid'] ?? '')),
    ]);

    return (int)$pdo->lastInsertId();
}

function updateUser(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare('UPDATE users SET phone = :phone, name = :name, address = :address, nid = :nid WHERE id = :id');
    $stmt->execute([
        ':phone' => trim((string)($data['phone'] ?? '')),
        ':name' => trim((string)($data['name'] ?? '')),
        ':address' => trim((string)($data['address'] ?? '')),
        ':nid' => trim((string)($data['nid'] ?? '')),
        ':id' => $id,
    ]);
}

function createReport(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO reports (user_phone, title, description, category, department, sub_department, location, status) VALUES (:user_phone, :title, :description, :category, :department, :sub_department, :location, :status)');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':category' => trim((string)($data['category'] ?? 'سایر')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':sub_department' => trim((string)($data['sub_department'] ?? '')),
        ':location' => trim((string)($data['location'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
    ]);

    return (int)$pdo->lastInsertId();
}

/** کد پیگیری نمایشی گزارش (همان که شهروند در اپ می‌بیند) */
function reportCodeFor(int $id): string {
    return 'EP-1403-' . str_pad((string) ($id + 1000), 4, '0', STR_PAD_LEFT);
}

/**
 * ویرایش کامل گزارش (صفحه‌ی «ویرایش»).
 *
 * اگر در این ویرایش «وضعیت» عوض شده باشد، دقیقاً مثل ثبت پاسخ:
 *   ۱) یک گام «تغییر وضعیت» در روند رسیدگی ثبت می‌شود،
 *   ۲) اعلان شخصی برای شهروند ساخته می‌شود (فهرست اعلان‌های اپ)،
 *   ۳) اعلان سیستمی به گوشی‌های ثبت‌شده‌ی او فرستاده می‌شود.
 * (پیش از این، تغییر وضعیت از صفحه‌ی ویرایش کاملاً بی‌صدا بود.)
 *
 * خروجی: نتیجه‌ی اعلان (eplakNotifyUser)؛ آرایه‌ی خالی یعنی اعلانی لازم نبود.
 */
function updateReport(PDO $pdo, int $id, array $data): array {
    $before = getReportById($pdo, $id);
    $newStatus = normalizeStatusValue((string)($data['status'] ?? 'pending'));
    $stmt = $pdo->prepare('UPDATE reports SET user_phone = :user_phone, title = :title, description = :description, category = :category, department = :department, sub_department = :sub_department, location = :location, status = :status WHERE id = :id');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':category' => trim((string)($data['category'] ?? 'سایر')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':sub_department' => trim((string)($data['sub_department'] ?? '')),
        ':location' => trim((string)($data['location'] ?? '')),
        ':status' => $newStatus,
        ':id' => $id,
    ]);

    $previousStatus = is_array($before) ? normalizeStatusValue((string) ($before['status'] ?? '')) : '';
    $statusChanged  = is_array($before) && $previousStatus !== $newStatus;

    /* روند رسیدگی: تغییرات مهم ویرایش، به زبان شهروند ثبت می‌شود */
    try {
        require_once dirname(__DIR__, 2) . '/shared/media.php';
        eplakReportTimelineBootstrap($pdo, $id, is_array($before) ? $before : []);
        if (is_array($before)) {
            eplakReportEventEdit($pdo, $id, $before, $data);
        }
        if ($statusChanged) {
            eplakReportEventStatus($pdo, $id, $newStatus, '');
        }
    } catch (Throwable $e) {
        /* بی‌اهمیت */
    }

    /* اعلان به شهروند: فقط وقتی وضعیت واقعاً عوض شده باشد */
    $notify = [];
    if ($statusChanged) {
        try {
            $rep   = getReportById($pdo, $id);
            $phone = trim((string) ($rep['user_phone'] ?? ''));
            if ($phone !== '') {
                require_once dirname(__DIR__, 2) . '/shared/notify_events.php';
                $notify = eplakNotifyReply($pdo, $phone, 'گزارش', reportCodeFor($id), $newStatus, '', true);
            }
        } catch (Throwable $e) {
            error_log('[eplak-admin:report.edit-notify] ' . $e->getMessage());
        }
    }
    return $notify;
}

function getReportById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM reports WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $report = $stmt->fetch();
    return $report ?: null;
}

/**
 * ثبت پاسخ/وضعیت گزارش و خبر دادن به شهروند.
 *
 * «تغییر» یعنی یکی از این دو:
 *   • وضعیت با وضعیت ذخیره‌شده فرق دارد،
 *   • متن پاسخ، غیرخالی و با پاسخ ذخیره‌شده فرق دارد.
 * (فهرست گزارش‌ها هنگام تغییر سریع وضعیت، «پاسخ ذخیره‌شده» را بدون تغییر می‌فرستد؛
 *  آن را پاسخ تازه حساب نمی‌کنیم تا در اعلان و روند رسیدگی تکرار نشود.)
 *
 * خروجی: نتیجه‌ی اعلان (eplakNotifyUser: ok/id/pushed/push[...]) برای نمایش به
 * مدیر؛ آرایه‌ی خالی یعنی تغییری نبود و اعلانی ساخته نشد.
 */
function saveReportReply(PDO $pdo, int $id, string $reply, string $status): array {
    $normStatus = normalizeStatusValue($status);

    /* وضعیت و پاسخ پیشین برای تشخیص «تغییر واقعی» */
    $previous = getReportById($pdo, $id);
    $previousStatus = $previous ? normalizeStatusValue((string) ($previous['status'] ?? '')) : '';
    /* مقایسه‌ی پاسخ بدون حساسیت به نوع خط جدید (مرورگر CRLF می‌فرستد، ذخیره‌شده‌ی قدیمی
       ممکن است LF باشد؛ نباید این تفاوت، پاسخ قدیمی را «تازه» نشان دهد) */
    $normText = static fn($t): string => trim(str_replace(["\r\n", "\r"], "\n", (string) $t));
    $previousReply = $previous ? $normText($previous['reply'] ?? '') : '';

    $statusChanged = $previousStatus !== $normStatus;
    $replyIsNew    = $normText($reply) !== '' && $normText($reply) !== $previousReply;

    $stmt = $pdo->prepare('UPDATE reports SET reply = :reply, status = :status WHERE id = :id');
    $stmt->bindValue(':reply', $reply);
    $stmt->bindValue(':status', $normStatus);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    /* ── روند رسیدگی: همان گام‌هایی که شهروند در اپ می‌بیند ─────────────
       گام شروع برای گزارش‌های قدیمی هم ساخته می‌شود و گام تغییر وضعیت
       تنها وقتی ثبت می‌شود که وضعیت واقعاً عوض شده یا پاسخ تازه‌ای آمده
       باشد؛ پس با هر بار ذخیره، روند شلوغ نمی‌شود. */
    try {
        require_once dirname(__DIR__, 2) . '/shared/media.php';
        eplakReportTimelineBootstrap($pdo, $id, is_array($previous) ? $previous : []);
        if ($statusChanged || $replyIsNew) {
            eplakReportEventStatus($pdo, $id, $normStatus, $replyIsNew ? $reply : '');
        }
    } catch (Throwable $e) {
        /* روند رسیدگی هرگز نباید ذخیره‌ی وضعیت را متوقف کند */
    }

    /* ── ارسال خودکار اعلان به شهروند (اگر پاسخ یا وضعیت تازه‌ای آمده) ────
       از همان تابع مشترک تیکت‌ها استفاده می‌کنیم تا اعلان گزارش و تیکت یک
       شکل باشند و هم در فهرست اعلان‌های اپ ثبت شوند و هم (اگر اپ بسته باشد)
       از مسیر فایربیس به گوشی برسند. */
    $notify = [];
    try {
        $rep = getReportById($pdo, $id);
        $phone = trim((string) ($rep['user_phone'] ?? ''));
        if ($phone !== '' && ($statusChanged || $replyIsNew)) {
            require_once dirname(__DIR__, 2) . '/shared/notify_events.php';
            $notify = eplakNotifyReply(
                $pdo, $phone, 'گزارش', reportCodeFor($id), $normStatus,
                $replyIsNew ? $reply : '',
                $statusChanged
            );
        }
    } catch (Throwable $e) {
        /* بدون توقف عملیات اصلی؛ ولی علت در لاگ هاست می‌ماند */
        error_log('[eplak-admin:report.notify] ' . $e->getMessage());
    }
    return $notify;
}

function deleteReportReply(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('UPDATE reports SET reply = NULL, status = :status WHERE id = :id');
    $stmt->bindValue(':status', 'pending');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function getReportsByUser(PDO $pdo, string $userPhone): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports WHERE user_phone = :user_phone ORDER BY created_at DESC');
    $stmt->bindValue(':user_phone', $userPhone);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getTickets(PDO $pdo, string $statusFilter = 'all', string $search = ''): array {
    $query = 'SELECT * FROM tickets WHERE 1=1';
    $params = [];

    if ($statusFilter !== 'all') {
        $query .= ' AND status = :status';
        $params[':status'] = normalizeStatusValue($statusFilter);
    }

    if ($search !== '') {
        $query .= ' AND (title LIKE :search OR user_phone LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }

    $query .= ' ORDER BY created_at DESC';

    $stmt = $pdo->prepare($query);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    return $stmt->fetchAll();
}

function getAllTickets(PDO $pdo): array {
    return getTickets($pdo);
}

function getTicketsByUser(PDO $pdo, string $userPhone): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("TC-", LPAD(id + 1000, 4, "0")) AS code FROM tickets WHERE user_phone = :user_phone ORDER BY created_at DESC');
    $stmt->execute([':user_phone' => $userPhone]);
    return $stmt->fetchAll();
}

function createTicket(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO tickets (user_phone, title, description, status, reply, category, department, priority) VALUES (:user_phone, :title, :description, :status, :reply, :category, :department, :priority)');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? $data['phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
        ':reply' => (string)($data['reply'] ?? ''),
        ':category' => trim((string)($data['category'] ?? '')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':priority' => trim((string)($data['priority'] ?? 'medium')),
    ]);
    return (int)$pdo->lastInsertId();
}

function updateTicket(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare('UPDATE tickets SET user_phone = :user_phone, title = :title, description = :description, status = :status, reply = :reply, category = :category, department = :department, priority = :priority WHERE id = :id');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
        ':reply' => (string)($data['reply'] ?? ''),
        ':category' => trim((string)($data['category'] ?? '')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':priority' => trim((string)($data['priority'] ?? 'medium')),
        ':id' => $id,
    ]);
}

function getTicketById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $ticket = $stmt->fetch();
    return $ticket ?: null;
}

function saveTicketReply(PDO $pdo, int $id, string $reply, string $status): void {
    $normStatus = normalizeStatusValue($status);
    $before = getTicketById($pdo, $id);
    $beforeStatus = $before ? normalizeStatusValue((string) ($before['status'] ?? '')) : '';

    $stmt = $pdo->prepare('UPDATE tickets SET reply = :reply, status = :status WHERE id = :id');
    $stmt->bindValue(':reply', $reply);
    $stmt->bindValue(':status', $normStatus);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    /* ── اعلان به کاربر ─────────────────────────────────────────────────
       پیش از این، پاسخ‌دادن به تیکت در پنل هیچ اعلانی نمی‌ساخت (نه در فهرست
       اعلان‌های اپ، نه روی گوشی)؛ کاربر بی‌خبر می‌ماند. حالا مثل گزارش‌ها،
       اعلان ساخته و به گوشی فرستاده می‌شود. */
    try {
        require_once dirname(__DIR__, 2) . '/shared/notify_events.php';
        $phone = (string) ($before['user_phone'] ?? '');
        if ($phone !== '' && ($beforeStatus !== $normStatus || trim($reply) !== '')) {
            $code = 'TK-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
            eplakNotifyReply($pdo, $phone, 'تیکت', $code, $normStatus, $reply);
        }
    } catch (Throwable $e) {
        error_log('[eplak-admin:ticket.notify] ' . $e->getMessage());
    }
}

function deleteTicketReply(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('UPDATE tickets SET reply = NULL, status = :status WHERE id = :id');
    $stmt->bindValue(':status', 'pending');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function saveTicketDetails(PDO $pdo, int $id, string $title, string $description, string $userPhone, string $reply, string $status, string $category = '', string $department = '', string $priority = 'medium'): void {
    /* وضعیت/پاسخ قبلی برای تشخیص «تغییر واقعی» و ساخت اعلان */
    $before = getTicketById($pdo, $id);
    $beforeStatus = $before ? normalizeStatusValue((string) ($before['status'] ?? '')) : '';
    $beforeReply = $before ? trim((string) ($before['reply'] ?? '')) : '';

    updateTicket($pdo, $id, [
        'title' => $title,
        'description' => $description,
        'user_phone' => $userPhone,
        'reply' => $reply,
        'status' => $status,
        'category' => $category,
        'department' => $department,
        'priority' => $priority,
    ]);

    /* اعلان به کاربر (همان قاعده‌ی saveTicketReply) — این تابع از صفحه‌ی
       جزئیات و صفحه‌ی ویرایش تیکت صدا زده می‌شود. */
    try {
        require_once dirname(__DIR__, 2) . '/shared/notify_events.php';
        $normStatus = normalizeStatusValue($status);
        $phone = trim($userPhone) !== '' ? trim($userPhone) : (string) ($before['user_phone'] ?? '');
        $changed = ($beforeStatus !== $normStatus) || (trim($reply) !== $beforeReply);
        if ($phone !== '' && $changed && (trim($reply) !== '' || $beforeStatus !== $normStatus)) {
            $code = 'TK-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
            eplakNotifyReply($pdo, $phone, 'تیکت', $code, $normStatus, $reply);
        }
    } catch (Throwable $e) {
        error_log('[eplak-admin:ticket.notify-details] ' . $e->getMessage());
    }
}

function deleteReport(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM reports WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function deleteUser(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function deleteTicket(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM tickets WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

/* ============================================================
   اخبار و دانستنی‌ها
   ============================================================ */

function getAllNews(PDO $pdo, string $type = ''): array {
    if ($type === 'news' || $type === 'tip') {
        $stmt = $pdo->prepare('SELECT * FROM news WHERE type = :type ORDER BY sort_order ASC, id DESC');
        $stmt->execute([':type' => $type]);
    } else {
        $stmt = $pdo->query('SELECT * FROM news ORDER BY type ASC, sort_order ASC, id DESC');
    }
    return $stmt->fetchAll();
}

function getNewsById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM news WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function createNews(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare(
        'INSERT INTO news (type, title, summary, body, icon, badge, image_url, published, sort_order)
         VALUES (:type, :title, :summary, :body, :icon, :badge, :image_url, :published, :sort_order)'
    );
    $stmt->execute([
        ':type'      => $data['type'] ?? 'news',
        ':title'     => $data['title'] ?? '',
        ':summary'   => $data['summary'] ?? null,
        ':body'      => $data['body'] ?? '',
        ':icon'      => $data['icon'] ?? null,
        ':badge'     => ($data['badge'] ?? '') !== '' ? $data['badge'] : null,
        ':image_url' => $data['image_url'] ?? null,
        ':published' => !empty($data['published']) ? 1 : 0,
        ':sort_order' => (int)($data['sort_order'] ?? 0),
    ]);
    return (int)$pdo->lastInsertId();
}

function updateNews(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare(
        'UPDATE news SET
            type = :type,
            title = :title,
            summary = :summary,
            body = :body,
            icon = :icon,
            badge = :badge,
            image_url = :image_url,
            published = :published,
            sort_order = :sort_order
         WHERE id = :id'
    );
    $stmt->execute([
        ':type'      => $data['type'] ?? 'news',
        ':title'     => $data['title'] ?? '',
        ':summary'   => $data['summary'] ?? null,
        ':body'      => $data['body'] ?? '',
        ':icon'      => $data['icon'] ?? null,
        ':badge'     => ($data['badge'] ?? '') !== '' ? $data['badge'] : null,
        ':image_url' => $data['image_url'] ?? null,
        ':published' => !empty($data['published']) ? 1 : 0,
        ':sort_order' => (int)($data['sort_order'] ?? 0),
        ':id'        => $id,
    ]);
}

function deleteNews(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM news WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function toggleNewsPublished(PDO $pdo, int $id): void {
    /* پیاده‌سازی سازگار با هر دو درایور (MySQL و SQLite) — تابع IF() در SQLite
       وجود ندارد و قبلاً این عملیات در حالت توسعه خطا می‌داد. */
    $select = $pdo->prepare('SELECT published FROM news WHERE id = :id');
    $select->bindValue(':id', $id, PDO::PARAM_INT);
    $select->execute();
    $current = $select->fetchColumn();
    if ($current === false) {
        return;
    }
    $newValue = ((int) $current) === 1 ? 0 : 1;
    $stmt = $pdo->prepare('UPDATE news SET published = :published WHERE id = :id');
    $stmt->bindValue(':published', $newValue, PDO::PARAM_INT);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

/* ============================================================
   اعلان‌ها (ارسال تکی و گروهی)
   ============================================================ */

/**
 * ارسال اعلان به کاربران.
 * $targetType: 'all' = همه کاربران | 'selected' = شماره‌های مشخص‌شده
 * returns: تعداد گیرندگان
 */
function sendNotification(PDO $pdo, string $title, string $body, string $targetType, array $phones, ?string $createdBy = null): int {
    /* موتور اعلان پس‌زمینه (مرورگر) و اعلان اپ اندروید (فایربیس) */
    require_once __DIR__ . '/../../shared/webpush.php';
    require_once __DIR__ . '/../../shared/fcm.php';

    if ($targetType === 'all') {
        $stmt = $pdo->query('SELECT phone FROM users');
        $phones = array_column($stmt->fetchAll(), 'phone');
        if (!in_array('all', $phones, true)) {
            $phones[] = 'all';
        }
    }

    $phones = array_values(array_unique(array_filter(array_map('trim', $phones), static fn($p) => $p !== '')));
    if (!$phones) {
        return 0;
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO notification_sends (title, body, target_type, recipients_count, created_by)
             VALUES (:title, :body, :target, :count, :by)'
        );
        $stmt->execute([
            ':title' => $title,
            ':body'  => $body,
            ':target' => $targetType === 'all' ? 'all' : 'selected',
            ':count' => count($phones),
            ':by'    => $createdBy,
        ]);
        $sendId = (int)$pdo->lastInsertId();

        $ins = $pdo->prepare(
            'INSERT INTO notifications (user_phone, title, body, send_id) VALUES (:phone, :title, :body, :send)'
        );
        foreach ($phones as $phone) {
            $ins->execute([
                ':phone' => $phone,
                ':title' => $title,
                ':body'  => $body,
                ':send'  => $sendId,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    /* ── اعلان پس‌زمینه (Web Push) ────────────────────────────────────────
       اعلان‌های بالا فقط داخل برنامه دیده می‌شوند؛ این بخش همان پیام را به‌صورت
       نوتیفیکیشن سیستمی گوشی می‌فرستد تا در حالت «قفل بودن صفحه» و «بسته بودن
       برنامه» هم به شهروند برسد. هر خطایی این‌جا فقط ثبت می‌شود و ارسال اعلان
       داخل‌برنامه‌ای را خراب نمی‌کند. */
    try {
        $subscriptions = $targetType === 'all'
            ? eplakPushSubscriptions($pdo, [], true)
            : eplakPushSubscriptions($pdo, $phones, false);

        $pushSummary = eplakWebPushSend(
            $pdo,
            $subscriptions,
            $title,
            $body,
            ['url' => 'index.html', 'tag' => 'eplak-send-' . $sendId, 'id' => $sendId]
        );

        try {
            $upd = $pdo->prepare('UPDATE notification_sends SET push_sent = :sent, push_failed = :failed WHERE id = :id');
            $upd->execute([
                ':sent'   => (int) $pushSummary['sent'],
                ':failed' => (int) $pushSummary['failed'],
                ':id'     => $sendId,
            ]);
        } catch (Throwable $e) {
            /* ستون‌های شمارش پوش در نسخه‌های قدیمی دیتابیس ممکن است نباشند */
        }
    } catch (Throwable $e) {
        error_log('[eplak-push] dispatch failed: ' . $e->getMessage());
    }

    /* ── اعلان گوشی برای اپ اندروید (فایربیس/FCM) ──────────────────────────
       اندروید در WebView اجازه‌ی Web Push نمی‌دهد؛ این مسیر اعلان را در حالت
       «بسته بودن کامل اپ» هم به گوشی می‌رساند. */
    try {
        $devices = $targetType === 'all'
            ? eplakFcmTokens($pdo, [], true)
            : eplakFcmTokens($pdo, $phones, false);

        if ($devices) {
            $fcmSummary = eplakFcmSend(
                $pdo,
                $devices,
                $title,
                $body,
                ['url' => 'index.html', 'tag' => 'eplak-send-' . $sendId, 'id' => $sendId]
            );

            try {
                $upd = $pdo->prepare('UPDATE notification_sends SET fcm_sent = :sent, fcm_failed = :failed WHERE id = :id');
                $upd->execute([
                    ':sent'   => (int) $fcmSummary['sent'],
                    ':failed' => (int) $fcmSummary['failed'],
                    ':id'     => $sendId,
                ]);
            } catch (Throwable $e) {
                /* ستون‌های شمارش فایربیس در دیتابیس‌های قدیمی ممکن است نباشند */
            }
        }
    } catch (Throwable $e) {
        error_log('[eplak-fcm] dispatch failed: ' . $e->getMessage());
    }

    return count($phones);
}

function getNotificationSends(PDO $pdo, int $limit = 50): array {
    $stmt = $pdo->prepare('SELECT * FROM notification_sends ORDER BY id DESC LIMIT ' . (int)$limit);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getNotificationSendById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM notification_sends WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getNotificationRecipients(PDO $pdo, int $sendId): array {
    $stmt = $pdo->prepare('SELECT * FROM notifications WHERE send_id = :id ORDER BY id ASC');
    $stmt->execute([':id' => $sendId]);
    return $stmt->fetchAll();
}

/* ============================================================
   فایل‌های پیوست گزارش‌ها (عکس و فیلم) — نمایش در پنل مدیریت
   ============================================================ */

/** فهرست فایل‌های یک گزارش */
function getReportMedia(PDO $pdo, int $reportId): array {
    return eplakMediaForReport($pdo, $reportId);
}

/** تعداد فایل‌های هر گزارش: [report_id => ['image'=>n,'video'=>n,'total'=>n]] */
function getReportMediaCounts(PDO $pdo, array $reportIds = []): array {
    return eplakMediaCounts($pdo, $reportIds);
}

/** آدرس نمایش فایل از داخل صفحه‌های پوشه‌ی admin (یک پله بالاتر از ریشه‌ی اپ) */
function adminMediaUrl(string $path): string {
    $path = trim($path);
    if ($path === '') {
        return '';
    }
    if (preg_match('#^(https?:)?//#i', $path) || strpos($path, '../') === 0) {
        return $path;
    }
    return '../' . ltrim($path, '/');
}

/** حجم خوانا برای نمایش در پنل */
function formatBytesFa(int $bytes): string {
    if ($bytes <= 0) {
        return '—';
    }
    $units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    $index = 0;
    $value = (float) $bytes;
    while ($value >= 1024 && $index < count($units) - 1) {
        $value /= 1024;
        $index++;
    }
    $text = $index === 0 ? (string) (int) $value : number_format($value, 1, '.', '');
    return $text . ' ' . $units[$index];
}

/* ============================================================
   حساب مدیر: تغییر نام کاربری و رمز عبور
   ============================================================ */

function getAdminById(PDO $pdo, int $id): ?array {
    try {
        $stmt = $pdo->prepare('SELECT * FROM admin_users WHERE id = :id LIMIT 1');
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $admin = $stmt->fetch();
        return $admin ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

function getAdminByUsername(PDO $pdo, string $username): ?array {
    try {
        $stmt = $pdo->prepare('SELECT * FROM admin_users WHERE username = :username LIMIT 1');
        $stmt->execute([':username' => $username]);
        $admin = $stmt->fetch();
        return $admin ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/** آیا نام کاربری برای مدیر دیگری رزرو شده است؟ */
function adminUsernameTaken(PDO $pdo, string $username, int $exceptId = 0): bool {
    $stmt = $pdo->prepare('SELECT id FROM admin_users WHERE username = :username AND id <> :id LIMIT 1');
    $stmt->bindValue(':username', $username);
    $stmt->bindValue(':id', $exceptId, PDO::PARAM_INT);
    $stmt->execute();
    return (bool) $stmt->fetchColumn();
}

/** تغییر نام کاربری مدیر (خروجی: پیام خطا یا رشته‌ی خالی در صورت موفقیت) */
function updateAdminUsername(PDO $pdo, int $id, string $username): string {
    $username = trim($username);
    if ($username === '') {
        return 'نام کاربری نمی‌تواند خالی باشد.';
    }
    if (mb_strlen($username) < 3) {
        return 'نام کاربری باید حداقل ۳ کاراکتر باشد.';
    }
    if (mb_strlen($username) > 60) {
        return 'نام کاربری بیش از حد بلند است (حداکثر ۶۰ کاراکتر).';
    }
    if (!preg_match('/^[A-Za-z0-9._\-@\x{0600}-\x{06FF}]+$/u', $username)) {
        return 'نام کاربری فقط می‌تواند شامل حروف فارسی/انگلیسی، عدد و علامت‌های . _ - @ باشد.';
    }
    if (adminUsernameTaken($pdo, $username, $id)) {
        return 'این نام کاربری قبلاً استفاده شده است.';
    }

    $stmt = $pdo->prepare('UPDATE admin_users SET username = :username WHERE id = :id');
    $stmt->execute([':username' => $username, ':id' => $id]);
    return '';
}

/** تغییر رمز عبور مدیر — بررسی رمز فعلی، سنجش قدرت و ذخیره‌ی هش امن */
function updateAdminPassword(PDO $pdo, int $id, string $currentPassword, string $newPassword, string $confirmPassword): string {
    if ($currentPassword === '' || $newPassword === '') {
        return 'رمز عبور فعلی و رمز جدید الزامی هستند.';
    }
    if ($newPassword !== $confirmPassword) {
        return 'رمز جدید و تکرار آن یکسان نیستند.';
    }
    if (mb_strlen($newPassword) < 8) {
        return 'رمز جدید باید حداقل ۸ کاراکتر باشد.';
    }
    if (!preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword)) {
        return 'رمز جدید باید ترکیبی از حرف و عدد باشد.';
    }

    $admin = getAdminById($pdo, $id);
    if (!$admin) {
        return 'حساب مدیر یافت نشد.';
    }
    if (!password_verify($currentPassword, (string) $admin['password_hash'])) {
        return 'رمز عبور فعلی صحیح نیست.';
    }
    if (password_verify($newPassword, (string) $admin['password_hash'])) {
        return 'رمز جدید باید با رمز قبلی متفاوت باشد.';
    }

    $stmt = $pdo->prepare('UPDATE admin_users SET password_hash = :hash WHERE id = :id');
    $stmt->execute([':hash' => password_hash($newPassword, PASSWORD_DEFAULT), ':id' => $id]);
    return '';
}

/** تعداد اعلان‌های ارسال‌شده و آمار پوش برای صفحه‌ی تنظیمات */
function getPushStats(PDO $pdo): array {
    $stats = [
        'subscribers'  => eplakPushCount($pdo),
        'subscribers_all' => eplakPushCount($pdo, false),
        'last_sent'    => 0,
        'last_failed'  => 0,
        'last_send_title' => '',
        'last_send_at' => '',
    ];
    try {
        $row = $pdo->query('SELECT title, push_sent, push_failed, created_at FROM notification_sends ORDER BY id DESC LIMIT 1')->fetch();
        if ($row) {
            $stats['last_sent']       = (int) ($row['push_sent'] ?? 0);
            $stats['last_failed']     = (int) ($row['push_failed'] ?? 0);
            $stats['last_send_title'] = (string) ($row['title'] ?? '');
            $stats['last_send_at']    = (string) ($row['created_at'] ?? '');
        }
    } catch (Throwable $e) {
    }
    return $stats;
}

/** آخرین خطای ثبت‌شده‌ی اشتراک‌ها (برای عیب‌یابی در پنل) */
function getPushLastErrors(PDO $pdo, int $limit = 5): array {
    try {
        $stmt = $pdo->prepare(
            'SELECT user_phone, last_error, fail_count, updated_at FROM push_subscriptions
             WHERE last_error <> "" ORDER BY updated_at DESC LIMIT ' . (int) $limit
        );
        $stmt->execute();
        return $stmt->fetchAll();
    } catch (Throwable $e) {
        return [];
    }
}

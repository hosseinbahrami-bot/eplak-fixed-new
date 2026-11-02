<?php
/* admin/includes/acl.php — کنترل دسترسی مدیران: «مدیر کل» در برابر «مدیرِ حوزه/معاونت»
   ============================================================================
   چرا این فایل لازم است؟
   پیش از این، جدول admin_users یک ستون role داشت ولی «هیچ‌جا» خوانده نمی‌شد:
   هر کسی که لاگین می‌کرد به همه‌ی صفحات و همه‌ی داده‌ها دسترسی داشت. خواسته‌ی
   کارفرما این است که برای هر حوزه/معاونت یک مدیر با نام کاربری و رمزِ جدا
   ساخته شود و آن مدیر «فقط» پیام‌های (گزارش‌ها و تیکت‌های) همان حوزه را ببیند.

   چه چیزی این‌جا تعریف می‌شود؟
     ۱) دامنه‌ی دسترسی مدیر فعلی: نقش + واحدهای سطح اولِ منتسب (admin_departments)
        + نامِ همان واحدها و نامِ زیرمجموعه‌هایشان (برای تطبیق با reports.department)
     ۲) نگاشتِ «مجوز» به نقش: چه کسی کدام صفحه/عملیات را می‌تواند
     ۳) فیلترِ داده: SQL و بررسیِ ردیف‌به‌ردیف (هر دو — چون پنهان کردنِ لینک
        به‌تنهایی جلوی درخواستِ مستقیم را نمی‌گیرد)
     ۴) منوی کناره‌ی آگاه از دسترسی (به‌جای تکرارِ markup در ۱۵ صفحه)

   تصمیم‌های کارفرما (۲۰۲۶-۱۱-۰۲) که در این فایل پیاده شده:
     • مدیرِ حوزه فقط «گزارش‌ها» و «تیکت‌های» حوزه‌ی خودش: مشاهده + پاسخ + تغییر وضعیت،
       و داشبوردِ محدود به همان حوزه. بدون دسترسی به کاربران، واحدها، مدیران، تبلیغات،
       اخبار، اماکن، اعلان، خروجی اکسل، تنظیمات و بررسی نسخه.
     • انتساب فقط به «واحدهای سطح اول» (حوزه شهردار و معاونت‌ها)؛ زیرمجموعه‌ها
       خودکار زیرمجموعه‌ی همان واحدِ والد شمرده می‌شوند.
     • پیام‌های قدیمیِ «بدون حوزه» فقط برای مدیر کل دیده می‌شوند.

   ⚠️ این فایل هیچ رمزی را چاپ یا برگشت نمی‌دهد؛ فقط password_hash در دیتابیس است.
   ============================================================================ */

/* نقش‌هایی که می‌شناسیم. هر نقشِ ناشناخته «کمترین دسترسی» را می‌گیرد. */
if (!defined('EPLAK_ROLE_SUPER'))  define('EPLAK_ROLE_SUPER', 'super_admin');
if (!defined('EPLAK_ROLE_DEPT'))   define('EPLAK_ROLE_DEPT', 'admin');

if (!defined('EPLAK_DEPT_ADMIN_PERMS')) {
    /* تنها مجوزهایی که مدیرِ حوزه/معاونت دارد (تصمیم کارفرما) */
    define('EPLAK_DEPT_ADMIN_PERMS', 'dashboard,reports.view,reports.edit,tickets.view,tickets.edit');
}

/** نرمال‌سازی نامِ واحد برای مقایسه: نیم‌فاصله/فاصله، ی/ک عربی، اعراب و بزرگیِ لاتین */
function eplakNormalizeDeptName(string $name): string
{
    $s = trim($name);
    if ($s === '') {
        return '';
    }
    /* نویسه‌های نامرئی و نیم‌فاصله → فاصله‌ی معمولی، سپس فاصله‌های پشت‌سرهم یکی */
    $s = str_replace(["\u{200C}", "\u{200D}", "\u{200E}", "\u{200F}", "\xC2\xA0"], ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    /* یکسان‌سازی حروف عربی/فارسی */
    $s = str_replace(
        ['ي', 'ك', 'ة', 'ۀ', 'ﻻ'],
        ['ی', 'ک', 'ه', 'ه', 'لا'],
        (string) $s
    );
    return trim(mb_strtolower((string) $s, 'UTF-8'));
}

/**
 * «کلیدِ حوزه» — شکلِ فشرده‌ی نامِ واحد برای مقایسه.
 * همه‌ی نویزه‌های نامرئی و فاصله‌ها حذف می‌شوند و حروف عربی/فارسی یکسان می‌شوند؛
 * چون نامِ واحد در reports/tickets «متن آزاد» است و گاهی با نیم‌فاصله، گاهی با
 * فاصله‌ی معمولی و گاهی با «ي/ك» عربی نوشته شده است.
 * مهم: eplakScopeSqlExpr() دقیقاً همین تبدیل را در SQL انجام می‌دهد تا نتیجه‌ی
 * فهرست‌ها (که در PHP پالایش می‌شوند) با آمارِ زنده (که در SQL شمرده می‌شود)
 * یکی باشد و هیچ گزارشی گم نشود.
 */
function eplakScopeKey(string $name): string
{
    $s = trim($name);
    if ($s === '') {
        return '';
    }
    $s = str_replace(
        ["\u{200C}", "\u{200D}", "\u{200E}", "\u{200F}", "\xC2\xA0", ' ', "\t", "\r", "\n"],
        '',
        $s
    );
    $s = str_replace(['ي', 'ك', 'ة', 'ۀ', 'ﻻ'], ['ی', 'ک', 'ه', 'ه', 'لا'], $s);
    return mb_strtolower($s, 'UTF-8');
}

/**
 * عبارتِ SQL هم‌ارزِ eplakScopeKey() — فقط با REPLACE و LOWER که هم در MySQL هست
 * و هم در SQLite (هیچ تابعِ مخصوصِ یک دیتابیس به کار نمی‌رود).
 */
function eplakScopeSqlExpr(string $column): string
{
    $map = [
        ["\u{200C}", ''], ["\u{200D}", ''], ["\u{200E}", ''], ["\u{200F}", ''],
        ["\xC2\xA0", ''], [' ', ''], ["\t", ''], ["\r", ''], ["\n", ''],
        ['ي', 'ی'], ['ك', 'ک'], ['ة', 'ه'], ['ۀ', 'ه'], ['ﻻ', 'لا'],
    ];
    $expr = $column;
    foreach ($map as $pair) {
        $expr = "REPLACE($expr, '" . $pair[0] . "', '" . $pair[1] . "')";
    }
    return "LOWER($expr)";
}

/** شناسه‌ی مدیرِ فعلی از نشست */
function eplakAdminId(): int
{
    return (int) ($_SESSION['admin_id'] ?? 0);
}

/** نام کاربری مدیرِ فعلی (برای نمایش) */
function eplakAdminUsername(): string
{
    return (string) ($_SESSION['admin_username'] ?? '');
}

/**
 * اتصال دیتابیسِ موجود در همین درخواست (admin/includes/db.php آن را در $pdo می‌سازد).
 * اگر نبود، null برمی‌گردد و هیچ دسترسیِ بیشتری داده نمی‌شود.
 */
function eplakAclPdo(): ?PDO
{
    if (isset($GLOBALS['pdo']) && $GLOBALS['pdo'] instanceof PDO) {
        return $GLOBALS['pdo'];
    }
    return null;
}

/** نقشِ یک مدیر از خودِ جدول admin_users (نه از نشست) */
function eplakAdminRoleFromDb(int $adminId): string
{
    if ($adminId <= 0) {
        return '';
    }
    $pdo = eplakAclPdo();
    if (!$pdo) {
        return '';
    }
    try {
        $stmt = $pdo->prepare('SELECT role FROM admin_users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $adminId]);
        $role = $stmt->fetchColumn();
        return $role === false ? '' : trim((string) $role);
    } catch (Throwable $e) {
        return '';
    }
}

/**
 * نقشِ مدیرِ فعلی.
 * نخست از نشست؛ اگر نشست نقش نداشت (نشست‌های ساخته‌شده پیش از این نسخه، یا هر
 * جایی که فقط کلیدهای پایه‌ی ورود ساخته شده‌اند) نقش از خودِ دیتابیس خوانده
 * می‌شود. این دو فایده دارد:
 *   ۱) دسترسی همیشه بر پایه‌ی داده‌ی واقعیِ جدول admin_users است؛
 *   ۲) اگر نقشِ مدیری گرفته شود، همان لحظه اثر می‌کند (نه پس از ورود دوباره).
 * نقشِ ناشناخته ⇒ کمترین دسترسی (EPLAK_ROLE_DEPT و آن هم بدون هیچ حوزه‌ای).
 */
function eplakAdminRole(): string
{
    static $cache = [];
    $sessionRole = trim((string) ($_SESSION['admin_role'] ?? ''));
    $key = eplakAdminId() . '|' . $sessionRole;
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    $role = $sessionRole !== '' ? $sessionRole : eplakAdminRoleFromDb(eplakAdminId());
    $cache[$key] = $role !== '' ? $role : EPLAK_ROLE_DEPT;
    return $cache[$key];
}

/**
 * همگام‌سازی نشست با دیتابیس در هر درخواستِ مدیریتی (از admin/auth.php صدا زده می‌شود).
 * اگر حساب پاک یا «غیرفعال» شده باشد، نشست همان‌جا باطل می‌شود و مدیر به صفحه‌ی
 * ورود می‌رود؛ یعنی «غیرفعال کردن» فوراً اثر می‌کند، نه فقط در ورودِ بعدی.
 * اگر خواندن دیتابیس ممکن نبود (مثلاً جدول admin_users در دسترس نیست) هیچ کاری
 * نمی‌کند تا پنل به‌خاطر یک خطای گذرا قفل نشود.
 */
function eplakRefreshAdminSession(): void
{
    $adminId = eplakAdminId();
    if ($adminId <= 0 || empty($_SESSION['admin_logged_in'])) {
        return;
    }
    $pdo = eplakAclPdo();
    if (!$pdo) {
        return;
    }
    $row = null;
    try {
        $stmt = $pdo->prepare('SELECT id, username, role, is_active, full_name FROM admin_users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $adminId]);
        $fetched = $stmt->fetch();
        $row = $fetched === false ? [] : (array) $fetched;
    } catch (Throwable $e) {
        /* ستون‌های تازه (is_active/full_name) روی دیتابیس قدیمی نباشد */
        try {
            $stmt = $pdo->prepare('SELECT id, username, role FROM admin_users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $adminId]);
            $fetched = $stmt->fetch();
            $row = $fetched === false ? [] : (array) $fetched;
        } catch (Throwable $e2) {
            return;   /* خواندن ممکن نیست ⇒ نشست دست‌نخورده می‌ماند */
        }
    }

    if (!$row) {
        eplakAdminLockout('deleted');
        return;
    }
    if (array_key_exists('is_active', $row) && (int) $row['is_active'] !== 1) {
        eplakAdminLockout('disabled');
        return;
    }

    $_SESSION['admin_role'] = (string) ($row['role'] ?? EPLAK_ROLE_DEPT);
    if (isset($row['username']) && (string) $row['username'] !== '') {
        $_SESSION['admin_username'] = (string) $row['username'];
    }
    if (array_key_exists('full_name', $row)) {
        $_SESSION['admin_full_name'] = (string) $row['full_name'];
    }
}

/** بستنِ نشست و فرستادن به صفحه‌ی ورود (حساب پاک/غیرفعال شده) */
function eplakAdminLockout(string $reason): void
{
    $adminId = eplakAdminId();
    error_log('[eplak-admin] نشست باطل شد (حساب ' . $reason . ') برای شناسه‌ی ' . $adminId);
    $_SESSION = [];
    if (function_exists('session_status') && session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    if (function_exists('eplakRedirect')) {
        eplakRedirect('login.php?' . $reason . '=1');
    } else {
        header('Location: login.php?' . $reason . '=1');
    }
    exit;
}

/** آیا مدیر کل است؟ (ناشناخته‌ها هرگز مدیر کل شمرده نمی‌شوند) */
function eplakAdminIsSuper(): bool
{
    return eplakAdminRole() === EPLAK_ROLE_SUPER;
}

/** فهرست مجوزهای یک نقش */
function eplakPermissionsForRole(string $role): array
{
    if ($role === EPLAK_ROLE_SUPER) {
        return ['*'];
    }
    return array_values(array_filter(array_map('trim', explode(',', EPLAK_DEPT_ADMIN_PERMS))));
}

/**
 * آیا مدیرِ فعلی این مجوز را دارد؟
 * مثال: eplakAdminCan('reports.view') · eplakAdminCan('settings')
 */
function eplakAdminCan(string $perm): bool
{
    $perms = eplakPermissionsForRole(eplakAdminRole());
    if (in_array('*', $perms, true)) {
        return true;
    }
    return in_array($perm, $perms, true);
}

/**
 * واحدهای «سطح اول» منتسب به یک مدیر (از جدول admin_departments).
 * خروجی: [['id'=>..,'name'=>..,'code'=>..,'slug'=>..], ...]
 * اگر جدول/ستون‌ها روی دیتابیس قدیمی نبودند، آرایه‌ی خالی برمی‌گردد (خطا نمی‌دهد).
 */
function eplakAdminDepartments(PDO $pdo, ?int $adminId = null): array
{
    $adminId = $adminId ?? eplakAdminId();
    if ($adminId <= 0) {
        return [];
    }
    try {
        $stmt = $pdo->prepare(
            'SELECT d.id, d.name, d.code, d.slug, d.parent_id
               FROM admin_departments ad
               JOIN departments d ON d.id = ad.department_id
              WHERE ad.admin_id = :admin_id
              ORDER BY d.sort_order ASC, d.id ASC'
        );
        $stmt->execute([':admin_id' => $adminId]);
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        return [];
    }
    $out = [];
    foreach ($rows ?: [] as $row) {
        /* انتساب فقط به واحدِ سطح اول معتبر است؛ اگر ردیفی به یک زیرمجموعه اشاره
           کند، والدش مبنا می‌شود تا دامنه ناخواسته تنگ/گشاد نشود. */
        $id = (int) ($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $out[$id] = [
            'id'        => $id,
            'name'      => trim((string) ($row['name'] ?? '')),
            'code'      => trim((string) ($row['code'] ?? '')),
            'slug'      => trim((string) ($row['slug'] ?? '')),
            'parent_id' => (int) ($row['parent_id'] ?? 0),
        ];
    }
    return array_values($out);
}

/**
 * نام‌هایی که این مدیر اجازه‌ی دیدن پیام‌هایشان را دارد:
 * نامِ واحدهای منتسب (سطح اول) + نامِ همه‌ی زیرمجموعه‌هایشان.
 * خروجی: ['raw' => [نام‌ها همان‌طور که در دیتابیس‌اند], 'norm' => [نرمال‌شده],
 *          'key' => [کلیدِ فشرده که هم PHP و هم SQL با آن مقایسه می‌کنند]]
 */
function eplakAdminScopeNames(PDO $pdo, array $departments): array
{
    $raw = [];
    foreach ($departments as $dept) {
        $name = trim((string) ($dept['name'] ?? ''));
        if ($name !== '') {
            $raw[$name] = true;
        }
    }
    if (!$raw) {
        return ['raw' => [], 'norm' => [], 'key' => []];
    }

    /* زیرمجموعه‌های همان واحدها (parent_id) — مثلاً «حراست» زیر «حوزه شهردار» */
    $ids = [];
    foreach ($departments as $dept) {
        if ((int) ($dept['id'] ?? 0) > 0) {
            $ids[] = (int) $dept['id'];
        }
    }
    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        try {
            $stmt = $pdo->prepare("SELECT name FROM departments WHERE parent_id IN ($placeholders)");
            $stmt->execute($ids);
            foreach ($stmt->fetchAll() ?: [] as $row) {
                $name = trim((string) ($row['name'] ?? ''));
                if ($name !== '') {
                    $raw[$name] = true;
                }
            }
        } catch (Throwable $e) {
            /* بی‌صدا — همان نام‌های سطح اول کافی است */
        }
    }

    $rawNames = array_keys($raw);
    $norm = [];
    $keys = [];
    foreach ($rawNames as $name) {
        $n = eplakNormalizeDeptName((string) $name);
        if ($n !== '') {
            $norm[$n] = true;
        }
        /* کلیدِ فشرده (بدون فاصله و نیم‌فاصله) — همان چیزی که SQL هم می‌سازد */
        $k = eplakScopeKey((string) $name);
        if ($k !== '') {
            $keys[$k] = true;
        }
    }
    return ['raw' => $rawNames, 'norm' => array_keys($norm), 'key' => array_keys($keys)];
}

/**
 * دامنه‌ی دسترسی مدیرِ فعلی (یک‌بار در هر درخواست حساب و کش می‌شود).
 * ['is_super','role','admin_id','username','full_name','departments',
 *  'names_raw','names_norm','names_key','unassigned']
 */
function eplakAdminScope(PDO $pdo, ?int $adminId = null): array
{
    static $cache = [];
    $adminId = $adminId ?? eplakAdminId();
    $key = $adminId . '|' . eplakAdminRole();
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $isSuper = eplakAdminIsSuper();
    $scope = [
        'is_super'    => $isSuper,
        'role'        => eplakAdminRole(),
        'admin_id'    => $adminId,
        'username'    => eplakAdminUsername(),
        'full_name'   => '',
        'departments' => [],
        'names_raw'   => [],
        'names_norm'  => [],
        /* کلیدِ فشرده‌ی نام‌ها؛ مقایسه‌ی اصلی با این فهرست است */
        'names_key'   => [],
        /* مدیرِ غیرکل که هیچ حوزه‌ای به او نداده‌اند ⇒ عملاً هیچ پیامی نمی‌بیند */
        'unassigned'  => false,
    ];

    try {
        $stmt = $pdo->prepare('SELECT full_name FROM admin_users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $adminId]);
        $scope['full_name'] = trim((string) ($stmt->fetchColumn() ?: ''));
    } catch (Throwable $e) {
        /* ستون full_name روی دیتابیسِ خیلی قدیمی نباشد — بی‌ضرر */
    }

    if (!$isSuper) {
        $scope['departments'] = eplakAdminDepartments($pdo, $adminId);
        $names = eplakAdminScopeNames($pdo, $scope['departments']);
        $scope['names_raw']  = $names['raw'];
        $scope['names_norm'] = $names['norm'];
        $scope['names_key']  = isset($names['key']) ? $names['key'] : [];
        $scope['unassigned'] = !$scope['departments'];
    }

    $cache[$key] = $scope;
    return $scope;
}

/**
 * برچسب فارسیِ نقش (برای نمایش در پنل).
 * اگر نقش داده نشود، نقشِ مدیرِ فعلیِ نشست خوانده می‌شود.
 */
function eplakAdminRoleLabel(?string $role = null): string
{
    $role = $role === null ? eplakAdminRole() : $role;
    if ($role === EPLAK_ROLE_SUPER) {
        return 'مدیر کل';
    }
    if ($role === EPLAK_ROLE_DEPT) {
        return 'مدیر حوزه/معاونت';
    }
    return $role !== '' ? $role : 'نامشخص';
}

/**
 * آیا این ردیفِ گزارش/تیکت در دامنه‌ی مدیر هست؟
 * قاعده: ستون department (و اگر خالی بود sub_department و category) با یکی از
 * نام‌های مجاز — به‌صورت نرمال‌شده — یکی باشد.
 * ردیفِ «بدون حوزه» فقط برای مدیر کل دیده می‌شود (تصمیم کارفرما).
 */
function eplakScopeAllowsRow(array $row, array $scope): bool
{
    if (!empty($scope['is_super'])) {
        return true;
    }
    /* مقایسه با «کلیدِ فشرده» تا نگارش‌های متفاوتِ یک نام (نیم‌فاصله/ي عربی/
       فاصله‌ی اضافی) یکی شمرده شوند — همان قاعده‌ای که SQL هم دارد. */
    $allowed = $scope['names_key'] ?? [];
    if (!$allowed) {
        return false;
    }
    foreach (['department', 'sub_department', 'category'] as $column) {
        $value = trim((string) ($row[$column] ?? ''));
        if ($value === '') {
            continue;
        }
        /* در ردیف‌های قدیمیِ بعضی دیتابیس‌ها، مقدار وضعیت در ستون department
           نوشته شده است (reportStatusOf همان را می‌شناسد)؛ آن ردیف‌ها حوزه ندارند. */
        if (function_exists('eplakStatusRawValues') && in_array($value, eplakStatusRawValues(), true)) {
            continue;
        }
        if (in_array(eplakScopeKey($value), $allowed, true)) {
            return true;
        }
    }
    return false;
}

/**
 * تکه‌ی SQL برای محدود کردن فهرست گزارش‌ها/تیکت‌ها به حوزه‌ی مدیر.
 * خروجی: ['sql' => ' AND (...)' یا '' , 'params' => [...]]
 * برای مدیر کل رشته‌ی خالی برمی‌گردد (بدون محدودیت).
 */
function eplakScopeSql(array $scope, string $table = 'reports'): array
{
    if (!empty($scope['is_super'])) {
        return ['sql' => '', 'params' => []];
    }
    $names = $scope['names_key'] ?? [];
    if (!$names) {
        /* مدیرِ بدون حوزه: هیچ ردیفی برنمی‌گردد (نه همه‌ی ردیف‌ها!) */
        return ['sql' => ' AND 1=0', 'params' => []];
    }
    $table = $table === 'tickets' ? 'tickets' : 'reports';
    /* هر دو ستون department و sub_department بررسی می‌شوند: اپ گاهی نامِ
       زیرمجموعه را در یکی و نامِ واحد را در دیگری می‌گذارد. */
    $columns = $table === 'tickets' ? ['department'] : ['department', 'sub_department'];

    $sql = ' AND (';
    $params = [];
    $parts = [];
    $i = 0;
    foreach ($columns as $column) {
        /* عبارتِ SQL دقیقاً همان «کلیدِ حوزه» را می‌سازد که eplakScopeKey() در PHP
           می‌سازد؛ پس آمارِ زنده و فهرست‌ها هیچ‌وقت با هم نمی‌جنگند. */
        $expr = eplakScopeSqlExpr($table . '.' . $column);
        foreach ($names as $name) {
            $key = ':sc' . $i;
            $parts[] = "$expr = $key";
            $params[$key] = (string) $name;
            $i++;
        }
    }
    $sql .= implode(' OR ', $parts) . ')';
    return ['sql' => $sql, 'params' => $params];
}

/**
 * محافظِ صفحه: اگر مدیر این مجوز را نداشت، صفحه‌ی «دسترسی ندارید» و پایان.
 * (نه ریدایرکتِ بی‌صدا؛ مدیر باید بفهمد چرا صفحه را نمی‌بیند.)
 */
function eplakRequirePermission(string $perm, string $what = ''): void
{
    if (eplakAdminCan($perm)) {
        return;
    }
    eplakAdminForbidden($what !== '' ? $what : eplakPermissionLabel($perm));
}

/** برچسب فارسیِ مجوز (برای پیامِ «دسترسی ندارید») */
function eplakPermissionLabel(string $perm): string
{
    $labels = [
        'dashboard'      => 'داشبورد',
        'reports.view'   => 'مشاهده‌ی گزارش‌ها',
        'reports.edit'   => 'پاسخ و تغییر وضعیت گزارش‌ها',
        'reports.create' => 'ثبت گزارش جدید',
        'reports.delete' => 'حذف گزارش',
        'tickets.view'   => 'مشاهده‌ی تیکت‌ها',
        'tickets.edit'   => 'پاسخ و تغییر وضعیت تیکت‌ها',
        'tickets.create' => 'ثبت تیکت جدید',
        'tickets.delete' => 'حذف تیکت',
        'users'          => 'مدیریت کاربران',
        'departments'    => 'مدیریت واحدها',
        'admins'         => 'مدیریت مدیران',
        'ads'            => 'مدیریت تبلیغات',
        'news'           => 'مدیریت اخبار و دانستنی‌ها',
        'places'         => 'مدیریت اماکن شهری',
        'notifications'  => 'ارسال اعلان',
        'export'         => 'خروجی اکسل',
        'settings'       => 'تنظیمات',
        'version'        => 'بررسی نسخه',
    ];
    return $labels[$perm] ?? $perm;
}

/** صفحه‌ی «دسترسی ندارید» — ساده، فارسی و بدون افشای داده */
function eplakAdminForbidden(string $what = ''): void
{
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    $safe = htmlspecialchars($what, ENT_QUOTES, 'UTF-8');
    $who  = htmlspecialchars(eplakAdminUsername(), ENT_QUOTES, 'UTF-8');
    $role = htmlspecialchars(eplakAdminRoleLabel(eplakAdminRole()), ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>دسترسی ندارید — پنل ای‌پلاک</title>'
        . '<style>body{font-family:Tahoma,Vazirmatn,sans-serif;background:#0f172a;color:#e2e8f0;'
        . 'margin:0;padding:48px 20px;text-align:center}.card{max-width:520px;margin:0 auto;'
        . 'background:#111c33;border:1px solid #26344f;border-radius:16px;padding:28px}'
        . 'h1{font-size:20px;margin:0 0 12px}p{line-height:2;font-size:14px;margin:8px 0}'
        . 'code{background:#0b1324;padding:2px 8px;border-radius:8px;font-size:12px}'
        . 'a{display:inline-block;margin-top:16px;background:#0f766e;color:#fff;text-decoration:none;'
        . 'padding:10px 18px;border-radius:10px;font-size:14px}</style></head><body>'
        . '<div class="card"><h1>⛔ دسترسی به این بخش را ندارید</h1>'
        . ($safe !== '' ? '<p>بخش درخواستی: <code>' . $safe . '</code></p>' : '')
        . '<p>حساب شما: <code>' . $who . '</code> · نقش: <code>' . $role . '</code></p>'
        . '<p>مدیرِ حوزه/معاونت فقط به «گزارش‌ها»، «تیکت‌ها» و داشبوردِ همان حوزه دسترسی دارد. '
        . 'برای دسترسی بیشتر با مدیر کل سامانه هماهنگ کنید.</p>'
        . '<a href="index.php">بازگشت به داشبورد</a></div></body></html>';
    exit;
}

/**
 * منوی کناره‌ی پنل — فقط آیتم‌هایی که این مدیر مجاز است.
 * $active = کلیدِ صفحه‌ی فعلی (reports, tickets, index, …)
 */
function eplakAdminSidebar(string $active = ''): string
{
    $items = [
        ['key' => 'index',         'href' => 'index.php',         'icon' => 'fa-chart-pie',          'label' => 'داشبورد',                'perm' => 'dashboard'],
        ['key' => 'reports',       'href' => 'reports.php',       'icon' => 'fa-flag',               'label' => 'گزارش‌ها',                 'perm' => 'reports.view'],
        ['key' => 'tickets',       'href' => 'tickets.php',       'icon' => 'fa-ticket-alt',         'label' => 'تیکت‌ها',                  'perm' => 'tickets.view'],
        ['key' => 'users',         'href' => 'users.php',         'icon' => 'fa-users',              'label' => 'کاربران',                'perm' => 'users'],
        ['key' => 'departments',   'href' => 'departments.php',   'icon' => 'fa-sitemap',            'label' => 'واحدها',                 'perm' => 'departments'],
        ['key' => 'admins',        'href' => 'admins.php',        'icon' => 'fa-user-shield',        'label' => 'مدیران',                 'perm' => 'admins'],
        ['key' => 'ads',           'href' => 'ads.php',           'icon' => 'fa-bullhorn',           'label' => 'تبلیغات',                'perm' => 'ads'],
        ['key' => 'news',          'href' => 'news.php',          'icon' => 'fa-newspaper',          'label' => 'اخبار و دانستنی‌ها',      'perm' => 'news'],
        ['key' => 'places',        'href' => 'places.php',        'icon' => 'fa-map-location-dot',   'label' => 'اماکن شهری',             'perm' => 'places'],
        ['key' => 'notifications', 'href' => 'notifications.php', 'icon' => 'fa-bell',               'label' => 'ارسال اعلان',            'perm' => 'notifications'],
        ['key' => 'notif_diag',    'href' => 'notif_diag.php',    'icon' => 'fa-stethoscope',        'label' => 'عیب‌یابی اعلان‌ها',       'perm' => 'notifications'],
        ['key' => 'export',        'href' => 'export.php',        'icon' => 'fa-file-excel',         'label' => 'خروجی اکسل',             'perm' => 'export'],
        ['key' => 'settings',      'href' => 'settings.php',      'icon' => 'fa-cog',                'label' => 'تنظیمات',                'perm' => 'settings'],
        ['key' => 'version',       'href' => 'version.php',       'icon' => 'fa-clipboard-check',    'label' => 'بررسی نسخه',             'perm' => 'version'],
    ];

    $html = '';
    foreach ($items as $item) {
        if (!eplakAdminCan($item['perm'])) {
            continue;
        }
        $cls = ($active !== '' && $active === $item['key']) ? ' class="active"' : '';
        $html .= '        <a' . $cls . ' href="' . htmlspecialchars($item['href'], ENT_QUOTES, 'UTF-8') . '">'
            . '<i class="fas ' . htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8') . '"></i> '
            . '<span>' . htmlspecialchars($item['label'], ENT_QUOTES, 'UTF-8') . '</span></a>' . "\n";
    }
    /* خروج برای همه */
    $cls = ($active === 'logout') ? ' class="active"' : '';
    $html .= '        <a' . $cls . ' href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>' . "\n";
    return $html;
}

/**
 * نشانِ «دامنه‌ی دسترسی» برای نوار بالای صفحه‌ها:
 * مدیر کل → «دسترسی کامل»؛ مدیر حوزه → نام حوزه‌ها (یا هشدارِ «حوزه‌ای اختصاص نیافته»).
 */
function eplakAdminScopeBadge(PDO $pdo): string
{
    /* استایل درون‌خطی: کلاس‌های badge/pill در admin/assets/style.css تعریف نشده‌اند،
       پس نشان باید در هر پوسته‌ای (روشن/تاریک) درست دیده شود. */
    $base = 'display:inline-block;font-size:11px;line-height:1.9;padding:2px 10px;border-radius:999px;'
        . 'border:1px solid rgba(148,163,184,.35);background:rgba(148,163,184,.14);color:inherit;white-space:nowrap;';
    $scope = eplakAdminScope($pdo);
    if (!empty($scope['is_super'])) {
        return '<span style="' . $base . 'border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.14);" '
            . 'data-testid="acl-scope-badge">مدیر کل — دسترسی کامل</span>';
    }
    if (!empty($scope['unassigned'])) {
        return '<span style="' . $base . 'border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.16);" '
            . 'data-testid="acl-scope-badge">⚠️ هیچ حوزه‌ای به این حساب اختصاص نیافته است</span>';
    }
    $names = [];
    foreach ((array) $scope['departments'] as $dept) {
        $names[] = htmlspecialchars((string) ($dept['name'] ?? ''), ENT_QUOTES, 'UTF-8');
    }
    return '<span style="' . $base . 'border-color:rgba(59,130,246,.4);background:rgba(59,130,246,.14);" '
        . 'data-testid="acl-scope-badge">حوزه‌ی دسترسی: ' . implode('، ', array_filter($names)) . '</span>';
}

<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

/* دسترسی: export — مدیرِ حوزه/معاونت به این صفحه نمی‌رسد (admin/includes/acl.php) */
eplakRequirePermission('export');

require_once __DIR__ . '/includes/xlsx.php';

/* ─────────────────────────────────────────────────────────────
   صفحهٔ دریافت خروجی اکسل (xlsx) از داده‌های سامانه
   ───────────────────────────────────────────────────────────── */

/** مقادیر خامِ معادل هر کلید وضعیت (برای فیلتر) */
function exportStatusValues(string $key): array
{
    $map = [
        'pending'     => ['pending', 'در انتظار', 'در انتظار بررسی', 'در حال انتظار'],
        'in_progress' => ['in_progress', 'review', 'در حال رسیدگی', 'در حال بررسی', 'در حال پیگیری'],
        'done'        => ['done', 'انجام شد', 'انجام شده', 'انجام‌شده'],
    ];
    return $map[$key] ?? [$key];
}

/** تاریخ مؤثر یک ردیف: اگر created_at صفر/خالی باشد،
    مقدار زمان‌دار ذخیره‌شده در sub_department (داده‌های قدیمی) استفاده می‌شود */
function reportEffectiveDate(array $row): string
{
    $c = trim((string)($row['created_at'] ?? ''));
    if ($c !== '' && strpos($c, '0000-00-00') === false) { return $c; }
    $s = trim((string)($row['sub_department'] ?? ''));
    if (preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/', $s)) { return $s; }
    return $c === '0000-00-00 00:00:00' ? '' : $c;
}

/** واحد اداریِ واقعیِ یک ردیف (با توجه به جابه‌جایی احتمالی دو ستون) */
function reportDepartmentOf(array $row): string
{
    $valid = eplakStatusRawValues();
    $st = trim((string)($row['status'] ?? ''));
    $dp = trim((string)($row['department'] ?? ''));
    if ($dp !== '' && !in_array($dp, $valid, true)) { return $dp; }
    if ($st !== '' && !in_array($st, $valid, true)) { return $st; }
    return '';   /* واحد نامشخص */
}

$type   = trim((string)($_GET['type'] ?? ''));
$status = trim((string)($_GET['status'] ?? ''));
/* تاریخِ فیلتر را مدیر «شمسی» وارد می‌کند (۱۴۰۵/۰۸/۲۲)؛ ستون‌های دیتابیس
   میلادی‌اند، پس همان‌جا یک‌بار به میلادی تبدیل می‌شود. ورودیِ میلادی هم
   پذیرفته می‌شود تا نشانک‌ها و لینک‌های قدیمی نشکنند. (shared/fa_datetime.php)
   $fromRaw/$toRaw همان چیزی است که مدیر تایپ کرده و در فرم برمی‌گردد. */
$fromRaw = trim((string)($_GET['from'] ?? ''));
$toRaw   = trim((string)($_GET['to'] ?? ''));
$from    = eplakParseUserDate($fromRaw);
$to      = eplakParseUserDate($toRaw);
/* «تاریخِ امروز» برایِ راهنمایِ فرم — شمسی */
$todayFa = function_exists('eplakFaNow') ? eplakFaNow(false) : '';

$validTypes = ['reports', 'users', 'tickets', 'news', 'notifications'];

/* ═══════════════ ارسال فایل ═══════════════ */
if ($type !== '' && in_array($type, $validTypes, true)) {

    $clauses = [];
    $params  = [];
    $hasDate = in_array($type, ['reports', 'users', 'tickets', 'news', 'notifications'], true);

    if ($status !== '' && $type === 'reports') {
        $vals = exportStatusValues($status);
        $ph1 = [];
        $ph2 = [];
        foreach ($vals as $i => $v) {
            $ph1[] = ':s1_' . $i;
            $ph2[] = ':s2_' . $i;
            $params[':s1_' . $i] = $v;
            $params[':s2_' . $i] = $v;
        }
        $clauses[] = '(status IN (' . implode(',', $ph1) . ') OR department IN (' . implode(',', $ph2) . '))';
    }
    /* فیلتر تاریخ: برای داده‌های قدیمی که تاریخ در sub_department ذخیره شده هم درست کار می‌کند */
    $dateExpr = ($type === 'reports')
        ? "IF(created_at > '0001-01-01', created_at, sub_department)"
        : 'created_at';
    if ($hasDate && $from !== '') {
        $clauses[] = $dateExpr . ' >= :dfrom';
        $params[':dfrom'] = $from . ' 00:00:00';
    }
    if ($hasDate && $to !== '') {
        $clauses[] = $dateExpr . ' <= :dto';
        $params[':dto'] = $to . ' 23:59:59';
    }
    $where = $clauses ? ' WHERE ' . implode(' AND ', $clauses) : '';

    $writer = new EplakXlsxWriter();

    if ($type === 'reports') {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, category, department, sub_department, location, status, reply, created_at FROM reports' . $where . ' ORDER BY id DESC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = [['شناسه', 'شماره تماس', 'عنوان', 'توضیحات', 'دسته‌بندی', 'واحد اداری',
                  'زیرمجموعه', 'موقعیت', 'وضعیت', 'پاسخ', 'تاریخ ثبت']];
        foreach ($rows as $r) {
            $data[] = [
                (int)$r['id'],
                (string)$r['user_phone'],
                (string)$r['title'],
                (string)$r['description'],
                (string)$r['category'],
                reportDepartmentOf($r),
                (string)$r['sub_department'],
                (string)$r['location'],
                statusLabel(reportStatusOf($r)),
                (string)$r['reply'],
                eplakFaDateTimeOf(reportEffectiveDate($r), ''),
            ];
        }
        $writer->addSheet('گزارش‌ها', $data);

        /* شیت خلاصهٔ وضعیت‌ها */
        $summary = [['وضعیت', 'تعداد', 'درصد']];
        $cnt = ['done' => 0, 'in_progress' => 0, 'pending' => 0];
        foreach ($rows as $r) {
            $k = reportStatusOf($r);
            if (!isset($cnt[$k])) { $cnt[$k] = 0; }
            $cnt[$k]++;
        }
        $total = count($rows);
        foreach ($cnt as $k => $v) {
            $summary[] = [statusLabel($k), $v, ($total > 0 ? round(($v / $total) * 100, 1) : 0) . '٪'];
        }
        $summary[] = ['مجموع', $total, '100٪'];
        $writer->addSheet('خلاصه وضعیت‌ها', $summary);

        $fname = 'گزارش‌ها-' . eplakFaDigits(eplakJalaliIsoDate()) . '.xlsx';
        $asciiName = 'eplak-reports-' . eplakJalaliIsoDate() . '.xlsx';

    } elseif ($type === 'users') {
        $stmt = $pdo->prepare('SELECT id, phone, name, address, nid, created_at FROM users' . $where . ' ORDER BY id DESC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = [['شناسه', 'شماره تماس', 'نام', 'آدرس', 'کد ملی', 'تاریخ عضویت']];
        foreach ($rows as $r) {
            $data[] = [(int)$r['id'], (string)$r['phone'], (string)$r['name'],
                       (string)$r['address'], (string)$r['nid'], eplakFaDateTimeOf($r['created_at'], '')];
        }
        $writer->addSheet('کاربران', $data);
        $fname = 'کاربران-' . eplakFaDigits(eplakJalaliIsoDate()) . '.xlsx';
        $asciiName = 'eplak-users-' . eplakJalaliIsoDate() . '.xlsx';

    } elseif ($type === 'tickets') {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, category, department, priority, status, reply, created_at FROM tickets' . $where . ' ORDER BY id DESC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = [['شناسه', 'شماره تماس', 'عنوان', 'توضیحات', 'دسته‌بندی', 'واحد اداری',
                  'اولویت', 'وضعیت', 'پاسخ', 'تاریخ ثبت']];
        foreach ($rows as $r) {
            $data[] = [(int)$r['id'], (string)$r['user_phone'], (string)$r['title'],
                       (string)$r['description'], (string)$r['category'], (string)$r['department'],
                       (string)$r['priority'], statusLabel(normalizeStatusValue((string)$r['status'])),
                       (string)$r['reply'], eplakFaDateTimeOf($r['created_at'], '')];
        }
        $writer->addSheet('تیکت‌ها', $data);
        $fname = 'تیکت‌ها-' . eplakFaDigits(eplakJalaliIsoDate()) . '.xlsx';
        $asciiName = 'eplak-tickets-' . eplakJalaliIsoDate() . '.xlsx';

    } elseif ($type === 'news') {
        $stmt = $pdo->prepare('SELECT id, type, title, summary, body, icon, image_url, published, sort_order, created_at FROM news' . $where . ' ORDER BY sort_order ASC, id DESC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = [['شناسه', 'نوع', 'عنوان', 'خلاصه', 'متن', 'آیکون', 'تصویر',
                  'منتشر شده', 'ترتیب', 'تاریخ ثبت']];
        foreach ($rows as $r) {
            $data[] = [(int)$r['id'], ((string)$r['type'] === 'tip' ? 'دانستنی' : 'خبر'),
                       (string)$r['title'], (string)$r['summary'], (string)$r['body'],
                       (string)$r['icon'], (string)$r['image_url'],
                       ((int)$r['published'] === 1 ? 'بله' : 'خیر'),
                       (int)$r['sort_order'], eplakFaDateTimeOf($r['created_at'], '')];
        }
        $writer->addSheet('اخبار و دانستنی‌ها', $data);
        $fname = 'اخبار-و-دانستنی‌ها-' . eplakFaDigits(eplakJalaliIsoDate()) . '.xlsx';
        $asciiName = 'eplak-news-' . eplakJalaliIsoDate() . '.xlsx';

    } else { /* notifications */
        $stmt = $pdo->prepare('SELECT id, user_phone, title, body, read_flag, created_at FROM notifications' . $where . ' ORDER BY id DESC');
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $data = [['شناسه', 'شماره تماس', 'عنوان', 'متن', 'خوانده شده', 'تاریخ']];
        foreach ($rows as $r) {
            $data[] = [(int)$r['id'], (string)$r['user_phone'], (string)$r['title'],
                       (string)$r['body'], ((int)$r['read_flag'] === 1 ? 'بله' : 'خیر'),
                       eplakFaDateTimeOf($r['created_at'], '')];
        }
        $writer->addSheet('اعلان‌ها', $data);
        $fname = 'اعلان‌ها-' . eplakFaDigits(eplakJalaliIsoDate()) . '.xlsx';
        $asciiName = 'eplak-notifications-' . eplakJalaliIsoDate() . '.xlsx';
    }

    $writer->download($fname, $asciiName);
}

/* ═══════════════ نمایش فرم ═══════════════ */
$countReports = (int)$pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn();
$countUsers   = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$countTickets = (int)$pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn();
$countNews    = (int)$pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
$statusStats  = getReportsStatusStats($pdo);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>دریافت خروجی اکسل</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav data-testid="admin-sidebar">
<?php /* منوی آگاه از دسترسی — admin/includes/acl.php */ ?>
<?= eplakAdminSidebar('export') ?>      </nav>
    </aside>

    <main class="content">
      <header class="topbar">
        <h1><i class="fa-solid fa-file-excel"></i> دریافت خروجی اکسل</h1>
        <a class="btn-back" href="index.php"><i class="fa-solid fa-arrow-right"></i> بازگشت به داشبورد</a>
      </header>

      <section class="panel">
        <h2>دانلود سریع</h2>
        <div class="export-grid">
          <a class="export-btn" href="export.php?type=reports">
            <i class="fa-solid fa-file-excel"></i><span>همهٔ گزارش‌ها</span><em><?= $countReports ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=done">
            <i class="fa-solid fa-circle-check"></i><span>گزارش‌های انجام شد</span><em><?= (int)$statusStats['counts']['done'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=in_progress">
            <i class="fa-solid fa-spinner"></i><span>در حال رسیدگی</span><em><?= (int)$statusStats['counts']['in_progress'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=pending">
            <i class="fa-solid fa-clock"></i><span>در انتظار</span><em><?= (int)$statusStats['counts']['pending'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=users">
            <i class="fa-solid fa-users"></i><span>کاربران</span><em><?= $countUsers ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=tickets">
            <i class="fa-solid fa-ticket"></i><span>تیکت‌ها</span><em><?= $countTickets ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=news">
            <i class="fa-solid fa-newspaper"></i><span>اخبار و دانستنی‌ها</span><em><?= $countNews ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=notifications">
            <i class="fa-solid fa-bell"></i><span>اعلان‌ها</span><em>همه</em>
          </a>
        </div>
      </section>

      <section class="panel">
        <h2>خروجی پیشرفته (با فیلتر)</h2>
        <form class="export-form" method="get" action="export.php">
          <div class="export-field">
            <label for="type">نوع داده</label>
            <select id="type" name="type" required>
              <option value="reports">گزارش‌ها</option>
              <option value="users">کاربران</option>
              <option value="tickets">تیکت‌ها</option>
              <option value="news">اخبار و دانستنی‌ها</option>
              <option value="notifications">اعلان‌ها</option>
            </select>
          </div>

          <div class="export-field">
            <label for="status">وضعیت (فقط گزارش‌ها)</label>
            <select id="status" name="status">
              <option value="">همهٔ وضعیت‌ها</option>
              <option value="done">انجام شد</option>
              <option value="in_progress">در حال رسیدگی</option>
              <option value="pending">در انتظار</option>
            </select>
          </div>

          <div class="export-field">
            <label for="from">از تاریخ (شمسی)</label>
            <input type="text" id="from" name="from" inputmode="numeric" dir="ltr"
                   value="<?= htmlspecialchars($fromRaw, ENT_QUOTES, 'UTF-8') ?>"
                   placeholder="مثال: <?= htmlspecialchars(function_exists('eplakFaDigits') ? eplakFaDigits('1405/01/01') : '1405/01/01', ENT_QUOTES, 'UTF-8') ?>">
          </div>

          <div class="export-field">
            <label for="to">تا تاریخ (شمسی)</label>
            <input type="text" id="to" name="to" inputmode="numeric" dir="ltr"
                   value="<?= htmlspecialchars($toRaw, ENT_QUOTES, 'UTF-8') ?>"
                   placeholder="مثال: <?= htmlspecialchars($todayFa !== '' ? str_replace('/', '/', $todayFa) : '1405/12/29', ENT_QUOTES, 'UTF-8') ?>">
          </div>

          <div class="form-actions">
            <button class="btn-primary" type="submit">
              <i class="fa-solid fa-file-arrow-down"></i> دریافت فایل اکسل
            </button>
            <a class="btn-secondary" href="export.php">پاک کردن فیلترها</a>
          </div>
        </form>
        <p class="hint">
          <i class="fa-solid fa-circle-info"></i>
          فایل تولیدشده با فرمت <strong>Excel (xlsx)</strong> و در دو شیت «داده‌ها» و «خلاصه وضعیت‌ها» ارائه می‌شود
          و در Excel، LibreOffice و Google Sheets باز می‌شود. تاریخ‌ها «شمسی» نوشته و شمسی فیلتر می‌شوند
          (۱۴۰۵/۰۸/۲۲ یا 1405/08/22)؛ برایِ سازگاری، قالبِ میلادی هم پذیرفته می‌شود.
        </p>
      </section>
    </main>
  </div>
</body>
</html>

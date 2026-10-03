<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

/* تغییر سریع وضعیت از خود فهرست گزارش‌ها:
   مدیر از همان جدول، وضعیت را عوض می‌کند و روی همین صفحه می‌ماند. */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['quick_status_id'])) {
    eplakRequireCsrf();
    $quickId = (int) $_POST['quick_status_id'];
    $quickStatus = (string) ($_POST['status'] ?? 'pending');
    $quickReply = trim((string) ($_POST['reply'] ?? ''));
    $quickNotify = [];
    $quickFound = $quickId > 0 && getReportById($pdo, $quickId);
    if ($quickFound) {
        $quickNotify = saveReportReply($pdo, $quickId, $quickReply, $quickStatus);
    }
    /* نتیجه‌ی اعلان (رسید؟ گوشی ثبت نیست؟ خطای گوگل؟) را تا بعد از ریدایرکت
       نگه می‌داریم تا مدیر دقیقاً ببیند اعلان به کاربر رسیده یا نه. */
    require_once __DIR__ . '/../shared/notify_events.php';
    $_SESSION['eplak_flash'] = [
        'kind'   => 'quick_status',
        'found'  => $quickFound,
        'code'   => $quickFound ? reportCodeFor($quickId) : '',
        'notify' => $quickNotify,
        'text'   => $quickNotify ? eplakNotifyDescribe($quickNotify) : null,
    ];
    eplakRedirect('reports.php?status_saved=1');
}

$flash = null;
if (isset($_GET['status_saved']) && isset($_SESSION['eplak_flash']) && is_array($_SESSION['eplak_flash'])) {
    $flash = $_SESSION['eplak_flash'];
}
unset($_SESSION['eplak_flash']);

$reports = getAllReports($pdo);

/* تعداد عکس/فیلم هر گزارش — برای نشان دادن پیوست‌های ارسالی شهروند در فهرست */
$reportIds = array_map(static fn($r) => (int) $r['id'], $reports);
$mediaCounts = getReportMediaCounts($pdo, $reportIds);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت گزارش‌ها</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <!-- Font Awesome for icons -->
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav>
        <a href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
        <a class="active" href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
                <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
                <a href="places.php"><i class="fas fa-map-location-dot"></i> <span>اماکن شهری</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
<a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
<a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
<a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1><i class="fas fa-flag" style="color: #0f766e; margin-left: 12px;"></i>مدیریت گزارش‌ها</h1>
          <p>مشاهده و بروزرسانی وضعیت گزارش‌های ثبت‌شده</p>
        </div>
        <div class="topbar-right">
          <a href="report_add.php" class="btn btn-primary">
            <i class="fas fa-plus"></i> گزارش جدید
          </a>
        </div>
      </header>

      <?php if (isset($_GET['status_saved'])): ?>
        <?php
          /* پیام بر پایه‌ی نتیجه‌ی واقعی اعلان؛ نه یک «موفق» ثابت */
          $flashText = is_array($flash) ? ($flash['text'] ?? null) : null;
          if ($flashText) {
              $flashType = $flashText['type'];
              $flashMsg  = 'وضعیت گزارش ' . ($flash['code'] ?? '') . ' تغییر کرد. ' . $flashText['text'];
          } elseif (is_array($flash) && empty($flash['found'])) {
              $flashType = 'danger';
              $flashMsg  = 'گزارش پیدا نشد.';
          } else {
              $flashType = 'info';
              $flashMsg  = 'تغییری در وضعیت ثبت نشد؛ پس اعلان تازه‌ای هم برای کاربر ساخته نشد.';
          }
          $flashIcon = ['success' => 'fa-check-circle', 'warning' => 'fa-exclamation-triangle', 'danger' => 'fa-times-circle', 'info' => 'fa-info-circle'][$flashType] ?? 'fa-info-circle';
        ?>
        <div class="alert alert-<?= htmlspecialchars($flashType) ?>" style="margin:0 20px 14px;" data-testid="status-flash" data-notify-type="<?= htmlspecialchars($flashType) ?>">
          <i class="fas <?= $flashIcon ?>"></i> <?= htmlspecialchars($flashMsg) ?>
          <?php if ($flashType === 'warning' || $flashType === 'danger'): ?>
            <a href="settings.php#fcm-section" style="margin-inline-start:auto; font-size:12px; white-space:nowrap;">بررسی وضعیت اعلان گوشی ←</a>
          <?php endif; ?>
        </div>
      <?php endif; ?>

      <!-- آمار سریع -->
      <div class="stats-mini">
        <div class="stat-item">
          <i class="fas fa-list" style="color: #0f766e;"></i>
          <span>تعداد کل: <strong><?= count($reports) ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-hourglass-half" style="color: #d97706;"></i>
          <span>در انتظار: <strong><?= count(array_filter($reports, fn($r) => reportStatusOf($r) === 'pending')) ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-spinner" style="color: #3b82f6;"></i>
          <span>در حال رسیدگی: <strong><?= count(array_filter($reports, fn($r) => reportStatusOf($r) === 'in_progress')) ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-check-circle" style="color: #16a34a;"></i>
          <span>انجام شد: <strong><?= count(array_filter($reports, fn($r) => reportStatusOf($r) === 'done')) ?></strong></span>
        </div>
      </div>

      <section class="panel">
        <div class="panel-header">
          <h2><i class="fas fa-table" style="color: #0f766e; margin-left: 10px;"></i>لیست گزارش‌ها</h2>
          <div class="panel-actions">
            <input type="text" id="searchReport" placeholder="جستجوی گزارش..." class="search-input">
            <select class="filter-select" id="statusFilter">
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending">در انتظار</option>
              <option value="in_progress">در حال رسیدگی</option>
              <option value="done">انجام شد</option>
            </select>
          </div>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>عنوان</th>
                <th>کاربر</th>
                <th>واحد</th>
                <th>موقعیت</th>
                <th>وضعیت</th>
                <th>پیوست</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($reports as $report): ?>
                <tr>
                  <td><span class="badge-code">#<?= htmlspecialchars($report['code']) ?></span></td>
                  <td><strong><?= htmlspecialchars($report['title']) ?></strong></td>
                  <td><i class="fas fa-user" style="color: #94a3b8; margin-left: 6px;"></i><?= htmlspecialchars($report['user_phone']) ?></td>
                  <td><?= htmlspecialchars($report['department'] ?: $report['category']) ?></td>
                  <td>
                    <?php
                      $rowLat = (isset($report['lat']) && $report['lat'] !== null && $report['lat'] !== '') ? (float) $report['lat'] : null;
                      $rowLng = (isset($report['lng']) && $report['lng'] !== null && $report['lng'] !== '') ? (float) $report['lng'] : null;
                    ?>
                    <?= htmlspecialchars($report['location'] ?: '—') ?>
                    <?php if ($rowLat !== null && $rowLng !== null): ?>
                      <br>
                      <a href="report_detail.php?id=<?= (int) $report['id'] ?>" title="مشاهده روی نقشه"
                         style="display:inline-block; margin-top:4px; font-size:11.5px; color:#0f766e; text-decoration:none;">
                        <i class="fas fa-map-marker-alt" style="color:#ef4444;"></i> موقعیت دقیق روی نقشه
                      </a>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php
                      /* وضعیت‌ها ممکن است با کلید انگلیسی یا برچسب فارسی ذخیره شده
                         باشند؛ با reportStatusOf هر دو حالت درست نمایش داده می‌شود. */
                      $rowStatus = reportStatusOf($report);
                      $statusClass = statusClass($rowStatus);
                    ?>
                    <form method="post" action="reports.php" class="inline-status-form">
                      <?= eplakCsrfField() ?>
                      <input type="hidden" name="quick_status_id" value="<?= (int) $report['id'] ?>">
                      <input type="hidden" name="reply" value="<?= htmlspecialchars((string) ($report['reply'] ?? '')) ?>">
                      <select name="status" class="status-select <?= $statusClass ?>"
                              onchange="this.form.submit()" title="تغییر وضعیت این گزارش">
                        <option value="pending" <?= $rowStatus === 'pending' ? 'selected' : '' ?>>در انتظار</option>
                        <option value="in_progress" <?= $rowStatus === 'in_progress' ? 'selected' : '' ?>>در حال رسیدگی</option>
                        <option value="done" <?= $rowStatus === 'done' ? 'selected' : '' ?>>انجام شد</option>
                      </select>
                    </form>
                  </td>
                  <td>
                    <?php
                      $media = $mediaCounts[(int) $report['id']] ?? ['image' => 0, 'video' => 0, 'total' => 0];
                    ?>
                    <?php if ((int) $media['total'] > 0): ?>
                      <?php if ((int) $media['image'] > 0): ?>
                        <span class="media-badge" title="<?= (int) $media['image'] ?> عکس">
                          <i class="fas fa-image"></i> <?= (int) $media['image'] ?>
                        </span>
                      <?php endif; ?>
                      <?php if ((int) $media['video'] > 0): ?>
                        <span class="media-badge" title="<?= (int) $media['video'] ?> فیلم">
                          <i class="fas fa-video"></i> <?= (int) $media['video'] ?>
                        </span>
                      <?php endif; ?>
                    <?php else: ?>
                      <span class="media-badge none">—</span>
                    <?php endif; ?>
                  </td>
                  <td><?= htmlspecialchars($report['created_at']) ?></td>
                  <td>
                    <div class="action-buttons">
                      <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn-action view" title="مشاهده و پاسخ">
                        <i class="fas fa-eye"></i>
                      </a>
                      <a href="report_edit.php?id=<?= (int)$report['id'] ?>" class="btn-action edit" title="ویرایش گزارش">
                        <i class="fas fa-pen"></i>
                      </a>
                      <a href="actions.php?type=report_delete&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این گزارش اطمینان دارید؟')">
                        <i class="fas fa-trash"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>
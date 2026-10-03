<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$stats = getDashboardStats($pdo);
$latestReports = getLatestReports($pdo, 5);
$latestTickets = getLatestTickets($pdo, 5);
$latestUsers = getLatestUsers($pdo, 5);

/* آمار وضعیت گزارش‌ها برای نمودار دایره‌ای */
$statusStats = getReportsStatusStats($pdo);
$statusCounts = $statusStats['counts'];
$statusTotal = (int)$statusStats['total'];

$chartSegments = [
    ['key' => 'done',        'label' => 'انجام شد',     'color' => '#10b981', 'icon' => 'fa-circle-check'],
    ['key' => 'in_progress', 'label' => 'در حال رسیدگی',  'color' => '#3b82f6', 'icon' => 'fa-spinner'],
    ['key' => 'pending',     'label' => 'در انتظار',     'color' => '#f59e0b', 'icon' => 'fa-clock'],
];
$knownKeys = array_column($chartSegments, 'key');
foreach ($statusCounts as $key => $cnt) {
    if (!in_array($key, $knownKeys, true)) {
        $chartSegments[] = ['key' => $key, 'label' => statusLabel($key), 'color' => '#94a3b8', 'icon' => 'fa-circle'];
    }
}
/* دو نمودار دیگر: بر اساس واحد اداری و روند ماهانه */
$deptStats   = getReportsByDepartment($pdo, 8);
$deptTotal   = array_sum(array_column($deptStats, 'count'));
$deptMax     = 0;
foreach ($deptStats as $d) { $deptMax = max($deptMax, (int)$d['count']); }

$monthly     = getReportsMonthly($pdo, 6);
$monthlyMax  = 0;
$monthlySum  = 0;
foreach ($monthly as $m) { $monthlyMax = max($monthlyMax, (int)$m['count']); $monthlySum += (int)$m['count']; }
$monthlyMax  = max(1, $monthlyMax);

$chartRadius   = 70;
$chartCirc     = 2 * M_PI * $chartRadius;
$chartOffset   = 0.0;
foreach ($chartSegments as $i => $seg) {
    $cnt = (int)($statusCounts[$seg['key']] ?? 0);
    $len = $statusTotal > 0 ? ($cnt / $statusTotal) * $chartCirc : 0.0;
    $chartSegments[$i]['count']  = $cnt;
    $chartSegments[$i]['len']    = $len;
    $chartSegments[$i]['offset'] = $chartOffset;
    $chartSegments[$i]['pct']    = $statusTotal > 0 ? round(($cnt / $statusTotal) * 100, 1) : 0;
    $chartOffset += $len;
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>پنل مدیریت ای‌پلاک</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav>
        <a class="active" href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
        <a href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
        <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
        <a href="places.php"><i class="fas fa-map-location-dot"></i> <span>اماکن شهری</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <h1>داشبورد مدیریت</h1>
        <p>نمایش خلاصه وضعیت پروژه، گزارش‌ها و کاربران</p>
      </header>

      <section class="cards">
        <div class="card">
          <h3>تعداد گزارش‌ها</h3>
          <p><?= $stats['reports_count'] ?></p>
        </div>
        <div class="card">
          <h3>تعداد کاربران</h3>
          <p><?= $stats['users_count'] ?></p>
        </div>
        <div class="card">
          <h3>تعداد تیکت‌ها</h3>
          <p><?= $stats['tickets_count'] ?></p>
        </div>
        <div class="card">
          <h3>تیکت‌های در انتظار</h3>
          <p><?= $stats['pending_tickets_count'] ?></p>
        </div>
        <div class="card">
          <h3><i class="fas fa-paperclip"></i> گزارش‌های دارای عکس/فیلم</h3>
          <p><?= (int) ($stats['reports_with_media'] ?? 0) ?></p>
        </div>
        <div class="card">
          <h3><i class="fas fa-bell"></i> دستگاه‌های اعلان پس‌زمینه</h3>
          <p><?= (int) ($stats['push_subscribers'] ?? 0) ?></p>
          <a href="settings.php" style="font-size:12px;">تنظیمات و ارسال آزمایشی</a>
        </div>
        <div class="card">
          <h3><i class="fas fa-newspaper"></i> مطالب اخبار و دانستنی‌ها</h3>
          <p><?= (int) ($stats['news_count'] ?? 0) ?></p>
          <a href="news.php" style="font-size:12px;">مدیریت مطالب</a>
        </div>
      </section>

      <section class="panel chart-panel">
        <h2><i class="fa-solid fa-chart-pie"></i> نمودار وضعیت گزارش‌ها</h2>
        <div class="status-chart-wrap">

          <div class="donut-holder">
            <svg class="donut" viewBox="0 0 200 200" role="img" aria-label="نمودار وضعیت گزارش‌ها">
              <circle class="donut-track" cx="100" cy="100" r="<?= $chartRadius ?>" fill="none" stroke-width="24"></circle>
<?php foreach ($chartSegments as $seg): if ($seg['count'] <= 0) { continue; } ?>
              <circle class="donut-seg" cx="100" cy="100" r="<?= $chartRadius ?>" fill="none"
                      stroke="<?= $seg['color'] ?>" stroke-width="24" stroke-linecap="butt"
                      stroke-dasharray="0 <?= number_format($chartCirc, 2, '.', '') ?>"
                      data-dash="<?= number_format($seg['len'], 2, '.', '') ?> <?= number_format($chartCirc - $seg['len'], 2, '.', '') ?>"
                      stroke-dashoffset="<?= number_format(-$seg['offset'], 2, '.', '') ?>"
                      transform="rotate(-90 100 100)"></circle>
<?php endforeach; ?>
              <text class="donut-total" x="100" y="97" text-anchor="middle"><?= $statusTotal ?></text>
              <text class="donut-caption" x="100" y="120" text-anchor="middle">کل گزارش‌ها</text>
            </svg>
          </div>

          <ul class="donut-legend">
<?php foreach ($chartSegments as $seg): ?>
            <li>
              <span class="dot" style="background: <?= $seg['color'] ?>"></span>
              <span class="lg-label"><i class="fa-solid <?= $seg['icon'] ?>"></i> <?= htmlspecialchars($seg['label'], ENT_QUOTES, 'UTF-8') ?></span>
              <span class="lg-count"><?= $seg['count'] ?></span>
              <span class="lg-pct"><?= $seg['pct'] ?>٪</span>
              <a class="lg-export" href="export.php?type=reports&amp;status=<?= urlencode($seg['key']) ?>"
                 title="دانلود اکسل <?= htmlspecialchars($seg['label'], ENT_QUOTES, 'UTF-8') ?>">
                <i class="fa-solid fa-file-excel"></i>
              </a>
            </li>
<?php endforeach; ?>
          </ul>

        </div>
      </section>

      <section class="panel charts-2col">

        <div class="chart-col">
          <h2><i class="fa-solid fa-sitemap"></i> گزارش‌ها بر اساس واحد اداری</h2>
<?php if (!$deptStats): ?>
          <p class="empty-note">هنوز گزارشی ثبت نشده است.</p>
<?php else: ?>
          <ul class="hbar-list">
<?php foreach ($deptStats as $d):
        $pct = $deptMax > 0 ? (int)round(($d['count'] / $deptMax) * 100) : 0;
        $share = $deptTotal > 0 ? round(($d['count'] / $deptTotal) * 100) : 0;
?>
            <li>
              <span class="hbar-label" title="<?= htmlspecialchars($d['label'], ENT_QUOTES, 'UTF-8') ?>">
                <?= htmlspecialchars($d['label'], ENT_QUOTES, 'UTF-8') ?>
              </span>
              <span class="hbar-track">
                <span class="hbar-fill" style="width: <?= $pct ?>%"></span>
              </span>
              <span class="hbar-count"><?= (int)$d['count'] ?></span>
              <span class="hbar-share"><?= $share ?>٪</span>
            </li>
<?php endforeach; ?>
          </ul>
<?php endif; ?>
        </div>

        <div class="chart-col">
          <h2><i class="fa-solid fa-chart-line"></i> روند ماهانهٔ گزارش‌ها</h2>
          <svg class="trend-chart" viewBox="0 0 340 165" role="img" aria-label="روند ماهانه گزارش‌ها">
<?php
  $tw = 340; $th = 165; $padB = 30; $padT = 18;
  $n = max(1, count($monthly));
  $slot = $tw / $n;
  $barW = min(32, $slot * 0.5);
  $plotH = $th - $padB - $padT;
  /* خطوط راهنما */
  foreach ([0, 0.5, 1] as $g) {
      $gy = $padT + $plotH * (1 - $g);
      echo '            <line class="trend-grid" x1="0" y1="' . (int)$gy . '" x2="' . $tw . '" y2="' . (int)$gy . '"></line>' . "\n";
  }
  foreach ($monthly as $i => $m) {
      $cnt = (int)$m['count'];
      $h   = ($cnt / $monthlyMax) * $plotH;
      $x   = $i * $slot + ($slot - $barW) / 2;
      $y   = $padT + $plotH - $h;
      $cls = $cnt > 0 ? 'trend-bar' : 'trend-bar trend-bar-zero';
      echo '            <rect class="' . $cls . '" x="' . round($x, 1) . '" y="' . round($y, 1)
         . '" width="' . round($barW, 1) . '" height="' . max(2, round($h, 1)) . '" rx="5"></rect>' . "\n";
      echo '            <text class="trend-value" x="' . round($x + $barW / 2, 1) . '" y="' . round($y - 5, 1)
         . '" text-anchor="middle">' . $cnt . '</text>' . "\n";
      echo '            <text class="trend-label" x="' . round($x + $barW / 2, 1) . '" y="' . ($th - 10)
         . '" text-anchor="middle">' . htmlspecialchars($m['label'], ENT_QUOTES, 'UTF-8') . '</text>' . "\n";
  }
?>
          </svg>
          <p class="chart-note">
            <i class="fa-solid fa-circle-info"></i>
            <?= (int)$monthlySum ?> گزارش در ۶ ماه گذشته — بیشینهٔ ماهانه: <?= (int)$monthlyMax ?>
          </p>
        </div>

      </section>

      <section class="panel export-panel">
        <h2><i class="fa-solid fa-file-excel"></i> دریافت خروجی اکسل</h2>
        <div class="export-grid">
          <a class="export-btn" href="export.php?type=reports">
            <i class="fa-solid fa-file-excel"></i>
            <span>همهٔ گزارش‌ها</span>
            <em><?= (int)$stats['reports_count'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=done">
            <i class="fa-solid fa-circle-check"></i>
            <span>گزارش‌های انجام شد</span>
            <em><?= (int)($statusCounts['done'] ?? 0) ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=in_progress">
            <i class="fa-solid fa-spinner"></i>
            <span>گزارش‌های در حال رسیدگی</span>
            <em><?= (int)($statusCounts['in_progress'] ?? 0) ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=reports&amp;status=pending">
            <i class="fa-solid fa-clock"></i>
            <span>گزارش‌های در انتظار</span>
            <em><?= (int)($statusCounts['pending'] ?? 0) ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=users">
            <i class="fa-solid fa-users"></i>
            <span>کاربران</span>
            <em><?= (int)$stats['users_count'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=tickets">
            <i class="fa-solid fa-ticket"></i>
            <span>تیکت‌ها</span>
            <em><?= (int)$stats['tickets_count'] ?> مورد</em>
          </a>
          <a class="export-btn" href="export.php?type=news">
            <i class="fa-solid fa-newspaper"></i>
            <span>اخبار و دانستنی‌ها</span>
            <em><?= (int)($stats['news_count'] ?? 0) ?> مورد</em>
          </a>
          <a class="export-btn export-btn-more" href="export.php">
            <i class="fa-solid fa-sliders"></i>
            <span>خروجی پیشرفته</span>
            <em>فیلتر تاریخ و وضعیت</em>
          </a>
        </div>
      </section>

      <section class="panel">
        <h2>آخرین تیکت‌ها</h2>
        <table>
          <thead>
            <tr><th>کد</th><th>عنوان</th><th>کاربر</th><th>وضعیت</th><th>تاریخ</th><th>عملیات</th></tr>
          </thead>
          <tbody>
            <?php foreach ($latestTickets as $ticket): ?>
              <tr>
                <td><?= htmlspecialchars($ticket['code']) ?></td>
                <td><?= htmlspecialchars($ticket['title']) ?></td>
                <td><?= htmlspecialchars($ticket['user_phone']) ?></td>
                <td><?= htmlspecialchars($ticket['status']) ?></td>
                <td><?= htmlspecialchars($ticket['created_at']) ?></td>
                <td><a href="ticket_detail.php?id=<?= (int)$ticket['id'] ?>">مشاهده</a></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>آخرین گزارش‌ها</h2>
        <table>
          <thead>
            <tr><th>کد</th><th>عنوان</th><th>وضعیت</th><th>تاریخ</th></tr>
          </thead>
          <tbody>
            <?php foreach ($latestReports as $report): ?>
              <tr>
                <td><?= htmlspecialchars($report['code']) ?></td>
                <td><?= htmlspecialchars($report['title']) ?></td>
                <td><?= htmlspecialchars($report['status']) ?></td>
                <td><?= htmlspecialchars($report['created_at']) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>آخرین کاربران</h2>
        <table>
          <thead>
            <tr><th>نام</th><th>موبایل</th><th>تاریخ ثبت</th></tr>
          </thead>
          <tbody>
            <?php foreach ($latestUsers as $user): ?>
              <tr>
                <td><?= htmlspecialchars($user['name']) ?></td>
                <td><?= htmlspecialchars($user['phone']) ?></td>
                <td><?= htmlspecialchars($user['created_at']) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </section>
    </main>
  </div>

  <script>
  /* انیمیشن رسم نمودار دایره‌ای */
  (function () {
    var segs = document.querySelectorAll('.donut-seg');
    if (!segs.length) { return; }
    function draw() {
      segs.forEach(function (c, i) {
        var dash = c.getAttribute('data-dash');
        setTimeout(function () {
          c.style.transition = 'stroke-dasharray .9s cubic-bezier(.22,.61,.36,1)';
          c.setAttribute('stroke-dasharray', dash);
        }, i * 180);
      });
    }
    if (document.readyState === 'complete') { setTimeout(draw, 120); }
    else { window.addEventListener('load', function () { setTimeout(draw, 120); }); }
  })();
  </script>
</body>
</html>

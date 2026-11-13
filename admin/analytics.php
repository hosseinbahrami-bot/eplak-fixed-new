<?php
/* ============================================================================
   admin/analytics.php — «آمارِ سایت و دانلودها»
   ============================================================================
   خواسته‌ی کارفرما:
     «تو صفحه ادمین ی قسمت درست کن که بشه آمار بازدید سایت و تعداد دانلود هارو
      خیلی قشنگ و شیک و باحال با نمودار های جذاب روزانه ماهانه و سالانه و
      تعداد کاربر و … ی چیز کامل درست کن»

   چه چیزی نشان داده می‌شود
     ۱) سایتِ معرفی (www.eplak.ir): بازدید، بازدیدکننده‌ی یکتا، کلیکِ دانلودِ
        APK/PWA، کلیکِ QRها، «الان آنلاین»، دستگاه/مرورگر/سیستم‌عامل، منابعِ
        ورود، پربازدیدترین بخش‌ها، ساعت‌های اوج و نقشه‌ی حرارتیِ هفته
     ۲) سامانه و اپ (از جدول‌های «موجود»، بدونِ هیچ تغییر در اپ): کاربران و
        رشدِ ماهانه‌شان، گزارش‌ها، تیکت‌ها، دستگاه‌های اعلان، کلیکِ تبلیغات
     ۳) شمارِ «واقعیِ» دانلودِ APK از ریلیزِ گیت‌هاب (اختیاری، با کش)

   دسترسی
     فقط «مدیر کل» (مجوز analytics). مدیرِ حوزه/معاونت همان‌طور که در
     docs/ADMIN_ACCESS_FA.md آمده فقط گزارش‌ها، تیکت‌ها و داشبوردِ حوزه‌ی خودش
     را می‌بیند ⇒ این صفحه برایش ۴۰۳ می‌شود و در منو هم دیده نمی‌شود.

   داده از کجا می‌آید
     api/track.php (گردآورِ رویداد) → جدول site_stats → shared/analytics.php
     سایتِ معرفی رویدادها را با navigator.sendBeacon می‌فرستد؛ اگر بسته‌ی تازه‌ی
     سایت آپلود نشده باشد، این صفحه «خالی ولی سالم» می‌ماند و راهنما نشان
     می‌دهد چه کار باید کرد.

   حریم خصوصی
     IP خام ذخیره نمی‌شود (فقط هشِ HMAC)، شماره‌ی موبایل/نام/نشانی هیچ کاربری
     در این آمار نیست، و ربات‌ها شمرده نمی‌شوند.
   ============================================================================ */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/charts.php';
require_once dirname(__DIR__) . '/shared/analytics.php';

eplakRequirePermission('analytics');

$notice = '';
$error  = '';

/* ── بازه و دانه‌بندی از نشانی (پیش‌فرض: ۳۰ روزِ روزانه) ─────────────────── */
$rangeKey = (string) ($_GET['range'] ?? '30');
if (!isset(eplakAnalyticsRanges()[$rangeKey])) {
    $rangeKey = '30';
}
$g = eplakAnalyticsGranularity((string) ($_GET['g'] ?? ($rangeKey === '365' || $rangeKey === 'all' ? 'month' : 'day')));

$today = eplakAnalyticsToday($pdo);
$range = eplakAnalyticsDayRange($rangeKey, $pdo);

/* دوره‌ی قبل، به همان طول — برای نشانِ «رشد/افت» */
$prevTo   = date('Y-m-d', strtotime($range['from'] . ' 00:00:00') - 86400);
$prevFrom = date('Y-m-d', strtotime($prevTo . ' 00:00:00') - max(0, ($range['days'] - 1)) * 86400);

/* ── عملیات‌ها (فقط POST با توکنِ CSRF) ─────────────────────────────────── */
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST') {
    eplakRequireCsrf();
    $act = (string) ($_POST['act'] ?? '');

    if ($act === 'test') {
        $res = eplakAnalyticsTestEvent($pdo);
        if (!empty($res['counted'])) {
            $notice = 'یک رویدادِ آزمایشی ثبت شد؛ همین حالا در نمودارِ «امروز» دیده می‌شود. '
                . 'اگر دیده نشد، صفحه را تازه کنید.';
        } else {
            $error = 'ثبتِ رویدادِ آزمایشی ناموفق بود (' . eplakAnalyticsKindLabel((string) ($res['reason'] ?? ''))
                . ' ' . htmlspecialchars((string) ($res['reason'] ?? ''), ENT_QUOTES, 'UTF-8') . ').';
        }
    } elseif ($act === 'gh') {
        $gh = eplakAnalyticsGithubRefresh($pdo, true);
        if (!empty($gh['error'])) {
            $error = 'به‌روزرسانیِ شمارِ دانلود از گیت‌هاب: ' . $gh['error'];
        } else {
            $notice = 'شمارِ دانلودِ APK از گیت‌هاب به‌روز شد: ' . eplakChartNum($gh['apk']) . ' بار.';
        }
    } elseif ($act === 'prune') {
        $keep = (int) ($_POST['keep_days'] ?? EPLAK_ANALYTICS_KEEP_DAYS);
        if ($keep < 30) {
            $keep = 30;                     /* کمتر از یک ماه اجازه ندارد (نمودارِ سالانه خراب نشود) */
        }
        $deleted = eplakAnalyticsPrune($pdo, $keep);
        $notice = $deleted > 0
            ? eplakChartNum($deleted) . ' رویدادِ قدیمی‌تر از ' . eplakChartNum($keep) . ' روز پاک شد.'
            : 'چیزی برای پاک‌کردن نبود (همه‌ی رویدادها تازه‌تر از ' . eplakChartNum($keep) . ' روزند).';
    } else {
        $error = 'عملیاتِ ناشناخته.';
    }
}

/* ── خروجیِ CSV (پیش از هر HTML) ───────────────────────────────────────── */
if ((string) ($_GET['export'] ?? '') === 'csv') {
    $csvRows = eplakAnalyticsCsvRows($pdo, $range['from'], $range['to']);
    /* نکته: بافرِ خروجی را «پاک» نمی‌کنیم؛ بعضی محیط‌ها (مثلِ php-wasm در
       آزمون‌ها) پاسخ را در همان بافر می‌گیرند و ob_end_clean بدنهِ CSV را
       دور می‌ریخت. این شاخه پیش از هر HTML اجرا می‌شود، پس خروجیِ ناخواسته‌ای
       در کار نیست. */
    if (headers_sent()) {
        eplakRedirect('analytics.php?range=' . urlencode($rangeKey) . '&g=' . urlencode($g));
        exit;
    }
    header('Content-Type: text/csv; charset=utf-8');
    /* نامِ فایل شمسی باشد (رقمِ لاتین تا ASCII بماند): eplak-analytics-1404-08-22_to_1405-08-22.csv */
    $csvFrom = function_exists('eplakJalaliIsoDate') ? eplakJalaliIsoDate($range['from'] . ' 12:00:00') : $range['from'];
    $csvTo   = function_exists('eplakJalaliIsoDate') ? eplakJalaliIsoDate($range['to'] . ' 12:00:00') : $range['to'];
    header('Content-Disposition: attachment; filename="eplak-analytics-' . $csvFrom . '_to_' . $csvTo . '.csv"');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    echo "\xEF\xBB\xBF";                 /* BOM تا اکسلِ ویندوز فارسی را درست بخواند */
    $fh = fopen('php://output', 'w');
    if ($fh) {
        fputcsv($fh, eplakAnalyticsCsvHead());
        foreach ($csvRows as $row) {
            fputcsv($fh, $row);
        }
        fclose($fh);
    }
    exit;
}

/* ── داده‌ها ───────────────────────────────────────────────────────────── */
$totals     = eplakAnalyticsTotals($pdo, $range['from'], $range['to']);
$prevTotals = eplakAnalyticsTotals($pdo, $prevFrom, $prevTo);
$deltas     = eplakAnalyticsDeltas($totals, $prevTotals);
$series     = eplakAnalyticsSeries($pdo, $g, $range['from'], $range['to']);
$hourly     = eplakAnalyticsHourly($pdo, $range['from'], $range['to']);
$heat       = eplakAnalyticsHeatmap($pdo, $range['from'], $range['to']);
$online     = eplakAnalyticsOnline($pdo);
$recent     = eplakAnalyticsRecent($pdo, 14);
$rowCount   = eplakAnalyticsRowCount($pdo);
$appStats   = eplakAnalyticsAppStats($pdo, $today);
$userMonths = eplakAnalyticsUserMonths($pdo, 6);
$gh         = eplakAnalyticsGithubCached($pdo);

$topPages    = eplakAnalyticsTop($pdo, 'page', $range['from'], $range['to'], 8, 'view');
$topBrowsers = eplakAnalyticsTop($pdo, 'browser', $range['from'], $range['to'], 6, 'view');
$topOs       = eplakAnalyticsTop($pdo, 'os', $range['from'], $range['to'], 6, 'view');
$topRefs     = eplakAnalyticsTop($pdo, 'ref_host', $range['from'], $range['to'], 6, 'view');

/* سریِ دانلودها برای نمودارِ ستونیِ گروهی */
$dlSeries = [];
foreach ($series as $row) {
    $dlSeries[] = ['label' => $row['label'], 'apk' => 0, 'pwa' => 0, 'qr' => 0];
}
if ($rowCount > 0 && eplakAnalyticsReady($pdo)) {
    try {
        $bucket = eplakAnalyticsBucketExpr($g);
        $st = $pdo->prepare('SELECT ' . $bucket . ' AS k, kind, target, COUNT(*) AS c'
            . ' FROM ' . EPLAK_ANALYTICS_TABLE
            . " WHERE visit_day >= ? AND visit_day <= ? AND kind IN ('download','qr')"
            . ' GROUP BY ' . $bucket . ', kind, target');
        $st->execute([$range['from'], $range['to']]);
        $index = [];
        foreach ($dlSeries as $i => $row) {
            $index[$series[$i]['key']] = $i;
        }
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $i = $index[(string) $r['k']] ?? null;
            if ($i === null) {
                continue;
            }
            $isPwa = strpos((string) $r['target'], 'pwa') !== false;
            if ($r['kind'] === 'qr') {
                $dlSeries[$i]['qr'] += (int) $r['c'];
            } elseif ($isPwa) {
                $dlSeries[$i]['pwa'] += (int) $r['c'];
            } else {
                $dlSeries[$i]['apk'] += (int) $r['c'];
            }
        }
    } catch (Throwable $e) {
        /* آمارِ خالی بهتر از صفحه‌ی خطاست */
    }
}

$deviceSegments = [
    ['label' => 'موبایل',  'count' => (int) $totals['mobile'],  'color' => '#10b981'],
    ['label' => 'دسکتاپ',  'count' => (int) $totals['desktop'], 'color' => '#3b82f6'],
    ['label' => 'تبلت',    'count' => (int) $totals['tablet'],  'color' => '#f59e0b'],
];

$hasData    = ($totals['events'] > 0);
$rangeLabel = $range['label'] . ' (' . eplakAnalyticsJalaliDay($range['from']) . ' تا ' . eplakAnalyticsJalaliDay($range['to']) . ')';
$sparkViews = array_map(static function ($r) { return (int) $r['views']; }, $series);
$sparkDl    = array_map(static function ($r) { return (int) $r['downloads'] + (int) $r['qr']; }, $series);
$peakViews  = $sparkViews ? max($sparkViews) : 0;
$avgViews   = count($series) ? (int) round($totals['views'] / count($series)) : 0;
$ghChecked  = ((int) $gh['checked_at']) > 0 ? eplakFaDateTime('Asia/Tehran', (int) $gh['checked_at']) : '';
$esc = static function ($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); };
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>آمارِ سایت و دانلودها — پنل مدیریت ای‌پلاک</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <style>
    /* ── فقط این صفحه: پوسته‌ی نمودارها (با هر دو حالتِ روشن/تاریکِ پنل) ──
       رنگ‌ها از همان متغیرهای style.css می‌آیند تا با بقیه‌ی پنل یکی باشد. */
    .ega-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:22px}
    .ega-seg{display:inline-flex;flex-wrap:wrap;gap:6px;padding:5px;border:1px solid var(--dark-200);border-radius:var(--radius-full);background:var(--dark-50)}
    .ega-seg a,.ega-seg button{padding:7px 15px;border-radius:var(--radius-full);font-size:13px;font-weight:600;text-decoration:none;color:var(--dark-600);border:0;background:transparent;cursor:pointer;white-space:nowrap}
    .ega-seg a.active,.ega-seg button.active{background:var(--primary-500);color:#fff;box-shadow:var(--shadow-sm)}
    .ega-seg a:hover,.ega-seg button:hover{color:var(--primary-600)}
    .ega-seg a.active:hover{color:#fff}
    .ega-cards-8{grid-template-columns:repeat(4,minmax(0,1fr))}
    .ega-card{position:relative;display:flex;flex-direction:column;gap:4px;overflow:hidden}
    .ega-card h3{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--dark-500);margin:0 0 6px}
    .ega-card h3 i{width:34px;height:34px;border-radius:var(--radius-md);display:grid;place-items:center;font-size:15px;background:var(--primary-50);color:var(--primary-600)}
    .ega-card .ega-value{font-size:28px;font-weight:800;color:var(--dark-900);margin:0;direction:ltr;text-align:right}
    .ega-card .ega-sub{font-size:12px;color:var(--dark-500);margin:2px 0 0}
    .ega-spark{width:100%;height:34px;display:block;margin-top:auto;opacity:.95}
    .ega-delta{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:2px 10px;border-radius:var(--radius-full);margin-top:6px;width:max-content}
    .ega-delta em{font-style:normal;font-weight:500;opacity:.75}
    .ega-delta-up{background:var(--success-bg,#dcfce7);color:#047857}
    .ega-delta-down{background:var(--danger-bg,#fee2e2);color:#b91c1c}
    .ega-delta-flat{background:var(--dark-100);color:var(--dark-600)}
    .ega-chart{width:100%;height:auto;display:block;overflow:visible}
    .ega-grid{stroke:var(--dark-100);stroke-width:1;stroke-dasharray:3 4}
    .ega-axis{font-family:var(--font-family);font-size:11px;font-weight:600;fill:var(--dark-500)}
    .ega-area-line{filter:drop-shadow(0 4px 10px rgba(16,185,129,.25))}
    .ega-bar-zero{fill:var(--dark-200)}
    .ega-legend-inline{display:flex;flex-wrap:wrap;gap:16px;margin:10px 0 0;font-size:12px;color:var(--dark-500)}
    .ega-legend-inline span{display:inline-flex;align-items:center;gap:6px}
    .ega-legend-inline i{width:12px;height:12px;border-radius:3px;display:inline-block}
    .ega-donut-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:22px}
    .ega-donut{width:190px;height:190px;flex:0 0 auto;display:block}
    .ega-donut-track{stroke:var(--ch-border,var(--dark-100))}
    .ega-donut-total{font-family:var(--font-family);font-size:26px;font-weight:800;fill:var(--dark-900)}
    .ega-donut-caption{font-family:var(--font-family);font-size:11px;fill:var(--dark-500)}
    .ega-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;flex:1;min-width:190px}
    .ega-legend li{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dark-600)}
    .ega-dot-lg{width:11px;height:11px;border-radius:50%;flex:0 0 auto}
    .ega-lg-label{flex:1}
    .ega-lg-count{font-weight:700;color:var(--dark-900)}
    .ega-lg-pct{color:var(--dark-500);font-size:12px;min-width:44px;text-align:left}
    .ega-hbar-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
    .ega-hbar-list li{display:flex;align-items:center;gap:12px}
    .ega-hbar-label{flex:0 0 132px;font-size:13px;color:var(--dark-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ega-hbar-track{flex:1;height:11px;border-radius:999px;background:var(--dark-100);overflow:hidden;min-width:40px}
    .ega-hbar-fill{display:block;height:100%;border-radius:999px}
    .ega-hbar-count{font-weight:700;font-size:13px;color:var(--dark-900);min-width:52px;text-align:left;direction:ltr}
    .ega-hbar-share{font-size:12px;color:var(--dark-500);min-width:44px;text-align:left}
    .ega-heat{display:flex;flex-direction:column;gap:6px;overflow-x:auto;padding-bottom:6px}
    .ega-heat-hours{display:flex;gap:3px;padding-right:74px}
    .ega-heat-hours span{flex:1;min-width:15px;text-align:center;font-size:10px;color:var(--dark-500)}
    .ega-heat-row{display:flex;align-items:center;gap:3px}
    .ega-heat-day{flex:0 0 71px;font-size:12px;color:var(--dark-600);text-align:left}
    .ega-heat-cells{display:flex;gap:3px;flex:1}
    .ega-heat-cells i{flex:1;min-width:15px;height:22px;border-radius:5px;display:block}
    .ega-heat-scale{display:flex;align-items:center;gap:9px;margin-top:8px;font-size:12px;color:var(--dark-500)}
    .ega-heat-ramp{width:120px;height:9px;border-radius:999px;display:inline-block}
    .ega-heat-scale em{font-style:normal;margin-right:auto}
    .ega-hours{display:flex;align-items:flex-end;gap:4px;height:130px;padding:0 2px}
    .ega-hour{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;height:100%}
    .ega-hour i{width:100%;border-radius:5px 5px 2px 2px;display:block;min-height:3px;opacity:.85}
    .ega-hour em{font-style:normal;font-size:10px;color:var(--dark-500)}
    .ega-hour-peak i{opacity:1;box-shadow:0 0 0 2px rgba(245,158,11,.25)}
    .ega-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:34px 16px;color:var(--dark-400);text-align:center}
    .ega-empty i{font-size:26px;opacity:.6}
    .ega-empty p{margin:0;font-size:14px;font-weight:600}
    .ega-empty small{font-size:12px;color:var(--dark-500);max-width:520px;line-height:1.9}
    .ega-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
    .ega-stat{padding:15px 17px;border:1px solid var(--ch-border,var(--dark-100));border-radius:var(--radius-lg,14px);background:var(--ch-card,var(--dark-50))}
    .ega-stat span{display:block;font-size:12px;color:var(--dark-500);margin-bottom:5px}
    .ega-stat strong{font-size:21px;font-weight:800;color:var(--dark-900);direction:ltr;display:inline-block}
    .ega-stat small{display:block;font-size:11px;color:var(--dark-400);margin-top:4px}
    .ega-tag{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:var(--radius-full);font-size:11.5px;font-weight:700}
    .ega-tag-view{background:var(--primary-50,#e0f2fe);color:var(--primary-600)}
    .ega-tag-download{background:#dcfce7;color:#047857}
    .ega-tag-qr{background:#fef3c7;color:#b45309}
    .ega-note{font-size:12.5px;color:var(--dark-500);line-height:2;margin:10px 0 0}
    .ega-live{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#047857;background:#dcfce7;padding:4px 12px;border-radius:var(--radius-full)}
    .ega-live i{width:8px;height:8px;border-radius:50%;background:#10b981;animation:egaPulse 1.8s ease-in-out infinite}
    @keyframes egaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
    .ega-form-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:6px}
    .ega-form-row input[type=number]{width:96px;padding:9px 12px;border:2px solid var(--dark-200);border-radius:var(--radius-md);background:var(--dark-50);color:var(--dark-700);font-family:var(--font-family)}
    .ega-mini-form{display:inline-flex;align-items:center;gap:9px}
    @media (max-width:1100px){.ega-cards-8{grid-template-columns:repeat(2,minmax(0,1fr))}.charts-2col{grid-template-columns:1fr}}
    @media (max-width:640px){.ega-cards-8{grid-template-columns:minmax(0,1fr)}.ega-hbar-label{flex-basis:96px}.ega-card .ega-value{font-size:24px}}
  </style>
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
<?= eplakAdminSidebar('analytics') ?>      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <h1>آمارِ سایت و دانلودها <?= eplakAdminScopeBadge($pdo) ?></h1>
        <p>بازدیدِ سایتِ معرفی، دانلودِ APK و نسخه‌ی وب، کلیکِ QRها و رشدِ کاربران — روزانه، ماهانه و سالانه</p>
      </header>

<?php if ($notice !== ''): ?>
      <div class="alert alert-success"><i class="fa-solid fa-circle-check"></i> <?= $esc($notice) ?></div>
<?php endif; ?>
<?php if ($error !== ''): ?>
      <div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation"></i> <?= $esc($error) ?></div>
<?php endif; ?>

      <!-- ── فیلترها ─────────────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-filter"></i> بازه و دانه‌بندیِ نمودارها</h2>
            <p class="ega-note" style="margin:6px 0 0"><?= $esc($rangeLabel) ?> · دانه‌بندی: <?= $esc(eplakAnalyticsGranularityLabel($g)) ?></p>
          </div>
          <div class="panel-actions">
            <span class="ega-live"><i></i> الان آنلاین: <?= eplakChartNum($online) ?></span>
            <a class="btn btn-outline btn-sm" href="?range=<?= $esc($rangeKey) ?>&amp;g=<?= $esc($g) ?>&amp;export=csv">
              <i class="fa-solid fa-file-csv"></i> خروجیِ CSV
            </a>
          </div>
        </div>

        <div class="ega-toolbar">
          <span class="ega-seg">
<?php foreach (eplakAnalyticsRanges() as $key => $meta): ?>
            <a class="<?= $key === $rangeKey ? 'active' : '' ?>"
               href="?range=<?= $esc($key) ?>&amp;g=<?= $esc($g) ?>"><?= $esc($meta['label']) ?></a>
<?php endforeach; ?>
          </span>
          <span class="ega-seg">
<?php foreach (['day' => 'روزانه', 'month' => 'ماهانه', 'year' => 'سالانه'] as $key => $label): ?>
            <a class="<?= $key === $g ? 'active' : '' ?>"
               href="?range=<?= $esc($rangeKey) ?>&amp;g=<?= $esc($key) ?>"><?= $esc($label) ?></a>
<?php endforeach; ?>
          </span>
          <form class="ega-mini-form" method="post" action="?range=<?= $esc($rangeKey) ?>&amp;g=<?= $esc($g) ?>">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="act" value="test">
            <button class="btn btn-secondary btn-sm" type="submit" title="یک بازدیدِ آزمایشی ثبت می‌کند تا درستیِ لوله‌ی آمار دیده شود">
              <i class="fa-solid fa-vial"></i> ثبتِ رویدادِ آزمایشی
            </button>
          </form>
        </div>

<?php if (!$hasData): ?>
        <div class="alert alert-info">
          <i class="fa-solid fa-circle-info"></i>
          <div>
            هنوز رویدادی برای این بازه ثبت نشده است. دو دلیلِ رایج:
            <strong>۱)</strong> بسته‌ی تازه‌ی «سایتِ معرفی» (index.htmlِ دارای گردآورِ آمار) روی
            <code>public_html</code> آپلود نشده، یا
            <strong>۲)</strong> همین حالا آپلود شده و هنوز بازدیدی نیامده است.
            با دکمه‌ی «ثبتِ رویدادِ آزمایشی» می‌توانید همین‌جا لوله‌ی آمار را بیازمایید.
          </div>
        </div>
<?php endif; ?>
      </section>

      <!-- ── کارت‌های شاخص ───────────────────────────────────────────── -->
      <section class="cards ega-cards-8">
        <div class="card ega-card">
          <h3><i class="fa-solid fa-eye"></i> بازدیدِ سایت</h3>
          <p class="ega-value"><?= eplakChartNum($totals['views']) ?></p>
          <span class="ega-sub">در <?= $esc($range['label']) ?></span>
          <?= eplakChartDelta($deltas['views']) ?>
          <?= eplakChartSpark($sparkViews, ['color' => '#10b981']) ?>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-user-group"></i> بازدیدکننده‌ی یکتا</h3>
          <p class="ega-value"><?= eplakChartNum($totals['uniques']) ?></p>
          <span class="ega-sub">هر نفر در هر روز یک بار</span>
          <?= eplakChartDelta($deltas['uniques'], 'دوره‌ی قبل') ?>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-download"></i> دانلودِ مستقیم</h3>
          <p class="ega-value"><?= eplakChartNum($totals['downloads']) ?></p>
          <span class="ega-sub">APK: <?= eplakChartNum($totals['apk']) ?> · PWA: <?= eplakChartNum($totals['pwa']) ?></span>
          <?= eplakChartDelta($deltas['downloads']) ?>
          <?= eplakChartSpark($sparkDl, ['color' => '#3b82f6']) ?>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-qrcode"></i> کلیکِ کدِ QR</h3>
          <p class="ega-value"><?= eplakChartNum($totals['qr']) ?></p>
          <span class="ega-sub">روی دو کدِ QRِ بخشِ دانلود</span>
          <?= eplakChartDelta($deltas['qr']) ?>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-mobile-screen-button"></i> سهمِ موبایل</h3>
          <p class="ega-value"><?= eplakChartPct($totals['views'] > 0 ? ($totals['mobile'] / $totals['views'] * 100) : 0) ?></p>
          <span class="ega-sub"><?= eplakChartNum($totals['mobile']) ?> بازدید از گوشی</span>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-users"></i> کاربرانِ سامانه</h3>
          <p class="ega-value"><?= $appStats['users_total'] === null ? '—' : eplakChartNum($appStats['users_total']) ?></p>
          <span class="ega-sub">
            امروز: <?= $appStats['users_today'] === null ? '—' : eplakChartNum($appStats['users_today']) ?>
            · ۳۰ روز: <?= $appStats['users_month'] === null ? '—' : eplakChartNum($appStats['users_month']) ?>
          </span>
          <a class="ega-sub" href="users.php" style="color:var(--primary-600);font-weight:700">مدیریتِ کاربران <i class="fa-solid fa-arrow-left"></i></a>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-solid fa-flag"></i> گزارش‌های شهروندی</h3>
          <p class="ega-value"><?= $appStats['reports'] === null ? '—' : eplakChartNum($appStats['reports']) ?></p>
          <span class="ega-sub">
            در انتظار: <?= $appStats['reports_pending'] === null ? '—' : eplakChartNum($appStats['reports_pending']) ?>
            · این ماه: <?= $appStats['reports_month'] === null ? '—' : eplakChartNum($appStats['reports_month']) ?>
          </span>
        </div>
        <div class="card ega-card">
          <h3><i class="fa-brands fa-github"></i> دانلودِ واقعیِ APK</h3>
          <p class="ega-value"><?= $gh['apk'] > 0 ? eplakChartNum($gh['apk']) : '—' ?></p>
          <span class="ega-sub">
            <?= $ghChecked !== '' ? 'آخرین بررسی: ' . $esc($ghChecked) : 'هنوز از گیت‌هاب خوانده نشده' ?>
          </span>
          <form class="ega-mini-form" method="post" action="?range=<?= $esc($rangeKey) ?>&amp;g=<?= $esc($g) ?>" style="margin-top:6px">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="act" value="gh">
            <button class="btn btn-outline btn-sm" type="submit" title="شمارِ دانلودِ فایلِ APK از ریلیزِ گیت‌هاب خوانده می‌شود">
              <i class="fa-solid fa-rotate"></i> به‌روزرسانی از گیت‌هاب
            </button>
          </form>
        </div>
      </section>

      <!-- ── روندِ بازدیدها ──────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-chart-area"></i> روندِ بازدیدها — <?= $esc(eplakAnalyticsGranularityLabel($g)) ?></h2>
          <div class="panel-actions">
            <span class="ega-note" style="margin:0">
              بیشینه: <?= eplakChartNum($peakViews) ?> · میانگین: <?= eplakChartNum($avgViews) ?>
              در <?= eplakChartNum(count($series)) ?> <?= $g === 'day' ? 'روز' : ($g === 'month' ? 'ماه' : 'سال') ?>
            </span>
          </div>
        </div>
<?= eplakChartArea($series, ['title' => 'روندِ بازدیدِ سایت در بازه‌ی ' . $range['label'], 'color' => '#10b981', 'show_dots' => true]) ?>
        <div class="ega-legend-inline">
          <span><i style="background:#10b981"></i> بازدیدِ صفحه</span>
          <span><i style="background:#3b82f6"></i> بازدیدکننده‌ی یکتا</span>
          <span><i class="fa-solid fa-calendar-days" style="background:none"></i>
            <?= $esc(eplakAnalyticsGranularityLabel($g)) ?> · <?= $esc($range['label']) ?>
          </span>
        </div>
      </section>

      <!-- ── دانلودها ────────────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-cloud-arrow-down"></i> دانلودها و کدهای QR — <?= $esc(eplakAnalyticsGranularityLabel($g)) ?></h2>
          <div class="panel-actions">
            <span class="ega-tag ega-tag-download"><i class="fa-solid fa-android"></i> APK: <?= eplakChartNum($totals['apk']) ?></span>
            <span class="ega-tag ega-tag-view"><i class="fa-solid fa-globe"></i> PWA: <?= eplakChartNum($totals['pwa']) ?></span>
            <span class="ega-tag ega-tag-qr"><i class="fa-solid fa-qrcode"></i> QR: <?= eplakChartNum($totals['qr']) ?></span>
          </div>
        </div>
<?= eplakChartGroupedBars($dlSeries, ['title' => 'دانلودها در بازه‌ی ' . $range['label']]) ?>
        <div class="ega-legend-inline">
          <span><i style="background:#10b981"></i> دانلودِ مستقیمِ APK</span>
          <span><i style="background:#3b82f6"></i> نصبِ نسخه‌ی PWA</span>
          <span><i style="background:#f59e0b"></i> کلیکِ کدِ QR</span>
        </div>
        <p class="chart-note">
          <i class="fa-solid fa-circle-info"></i>
          این سه شمار، «کلیکِ بازدیدکننده روی سایتِ معرفی» است. شمارِ «واقعیِ» دانلودِ فایلِ APK از
          ریلیزِ گیت‌هاب در کارتِ «دانلودِ واقعیِ APK» بالا با دکمه‌ی به‌روزرسانی خوانده می‌شود
          <?= $gh['error'] !== '' ? '— آخرین خطا: ' . $esc($gh['error']) : '' ?>.
        </p>
      </section>

      <!-- ── دستگاه‌ها و ساعت‌های اوج ───────────────────────────────── -->
      <section class="panel charts-2col">
        <div class="chart-col">
          <h2><i class="fa-solid fa-mobile-screen"></i> دستگاهِ بازدیدکنندگان</h2>
<?= eplakChartDonut($deviceSegments, ['caption' => 'بازدید', 'title' => 'سهمِ دستگاه‌ها از بازدیدها']) ?>
        </div>
        <div class="chart-col">
          <h2><i class="fa-regular fa-clock"></i> ساعت‌های اوج (به وقتِ تهران)</h2>
<?= eplakChartHourColumns($hourly, ['color' => '#3b82f6']) ?>
          <p class="chart-note"><i class="fa-solid fa-circle-info"></i>
            ستونِ نارنجی، پرمراجعه‌ترین ساعتِ این بازه است — بهترین زمان برای انتشارِ خبر یا ارسالِ اعلان.</p>
        </div>
      </section>

      <!-- ── نقشه‌ی حرارتیِ هفته ─────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-table-cells"></i> نقشه‌ی حرارتیِ هفته (روز × ساعت)</h2>
          <span class="ega-note" style="margin:0"><?= eplakChartNum($heat['days']) ?> روزِ دارای رویداد</span>
        </div>
<?= eplakChartHeatmap($heat['cells'], (int) $heat['max'], ['color' => '#10b981']) ?>
      </section>

      <!-- ── مرورگر و سیستم‌عامل ─────────────────────────────────────── -->
      <section class="panel charts-2col">
        <div class="chart-col">
          <h2><i class="fa-brands fa-chrome"></i> مرورگرها</h2>
<?= eplakChartHBars($topBrowsers, ['color' => '#10b981', 'empty' => 'هنوز بازدیدی ثبت نشده است.']) ?>
        </div>
        <div class="chart-col">
          <h2><i class="fa-solid fa-desktop"></i> سیستم‌عامل‌ها</h2>
<?= eplakChartHBars($topOs, ['color' => '#3b82f6', 'empty' => 'هنوز بازدیدی ثبت نشده است.']) ?>
        </div>
      </section>

      <!-- ── منابعِ ورود و پربازدیدترین بخش‌ها ───────────────────────── -->
      <section class="panel charts-2col">
        <div class="chart-col">
          <h2><i class="fa-solid fa-share-nodes"></i> بازدیدکنندگان از کجا آمده‌اند</h2>
<?= eplakChartHBars($topRefs, ['color' => '#a855f7', 'label_cb' => 'eplakAnalyticsRefLabel', 'empty_label' => 'ورودِ مستقیم', 'empty' => 'هنوز بازدیدی ثبت نشده است.']) ?>
          <p class="chart-note"><i class="fa-solid fa-shield-halved"></i>
            فقط «دامنه‌ی» نشانیِ منبع نگه داشته می‌شود (نه مسیر و نه پارامترها) و IP فقط به‌صورتِ هش ذخیره می‌شود.</p>
        </div>
        <div class="chart-col">
          <h2><i class="fa-solid fa-layer-group"></i> پربازدیدترین بخش‌های سایت</h2>
<?= eplakChartHBars($topPages, ['color' => '#f59e0b', 'label_cb' => static function ($t) { return eplakAnalyticsTargetLabel('view', $t); }, 'empty' => 'هنوز بازدیدی ثبت نشده است.']) ?>
        </div>
      </section>

      <!-- ── سامانه و اپ ─────────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-users-gear"></i> سامانه و اپِ شهروندی</h2>
          <span class="ega-note" style="margin:0">این آمار از جدول‌های خودِ سامانه خوانده می‌شود؛ اپ هیچ تغییری نکرده است.</span>
        </div>
        <div class="ega-stat-grid">
          <div class="ega-stat"><span>کاربرانِ ثبت‌شده</span>
            <strong><?= $appStats['users_total'] === null ? '—' : eplakChartNum($appStats['users_total']) ?></strong>
            <small>امروز <?= $appStats['users_today'] === null ? '—' : eplakChartNum($appStats['users_today']) ?> · ۷ روز <?= $appStats['users_week'] === null ? '—' : eplakChartNum($appStats['users_week']) ?></small></div>
          <div class="ega-stat"><span>گزارش‌ها</span>
            <strong><?= $appStats['reports'] === null ? '—' : eplakChartNum($appStats['reports']) ?></strong>
            <small>در انتظار <?= $appStats['reports_pending'] === null ? '—' : eplakChartNum($appStats['reports_pending']) ?> · این ماه <?= $appStats['reports_month'] === null ? '—' : eplakChartNum($appStats['reports_month']) ?></small></div>
          <div class="ega-stat"><span>تیکت‌ها</span>
            <strong><?= $appStats['tickets'] === null ? '—' : eplakChartNum($appStats['tickets']) ?></strong>
            <small>در انتظار <?= $appStats['tickets_pending'] === null ? '—' : eplakChartNum($appStats['tickets_pending']) ?></small></div>
          <div class="ega-stat"><span>دستگاه‌های اعلان</span>
            <strong><?= $appStats['devices'] === null ? '—' : eplakChartNum($appStats['devices']) ?></strong>
            <small>گوشی‌هایی که اعلانِ پس‌زمینه می‌گیرند</small></div>
          <div class="ega-stat"><span>کلیکِ تبلیغاتِ اپ</span>
            <strong><?= $appStats['ad_clicks'] === null ? '—' : eplakChartNum($appStats['ad_clicks']) ?></strong>
            <small><a href="ads.php" style="color:var(--primary-600)">مدیریتِ تبلیغات</a></small></div>
          <div class="ega-stat"><span>اعلان‌های ارسالی</span>
            <strong><?= $appStats['notif_sends'] === null ? '—' : eplakChartNum($appStats['notif_sends']) ?></strong>
            <small>از بخشِ «ارسال اعلان»</small></div>
          <div class="ega-stat"><span>مطالبِ اخبار</span>
            <strong><?= $appStats['news'] === null ? '—' : eplakChartNum($appStats['news']) ?></strong>
            <small><a href="news.php" style="color:var(--primary-600)">مدیریتِ مطالب</a></small></div>
          <div class="ega-stat"><span>رویدادهای آمارِ سایت</span>
            <strong><?= eplakChartNum($rowCount) ?></strong>
            <small>سطرهای جدولِ site_stats</small></div>
        </div>
<?php if ($userMonths): ?>
        <h2 style="margin:26px 0 12px;font-size:15px"><i class="fa-solid fa-user-plus"></i> رشدِ ماهانه‌ی کاربرانِ سامانه</h2>
<?= eplakChartGroupedBars($userMonths, [
        'title' => 'کاربرانِ تازه در شش ماهِ اخیر',
        'groups' => [['key' => 'count', 'label' => 'کاربرِ تازه', 'color' => '#14b8a6']],
    ]) ?>
<?php endif; ?>
      </section>

      <!-- ── آخرین رویدادها ──────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-stream"></i> آخرین رویدادها</h2>
          <span class="ega-note" style="margin:0">تاریخ و ساعت شمسی، به وقتِ تهران</span>
        </div>
<?php if (!$recent): ?>
        <div class="empty-state">
          <i class="fa-solid fa-inbox" style="font-size:26px;opacity:.5"></i>
          <p>رویدادی ثبت نشده است.</p>
        </div>
<?php else: ?>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th><i class="fa-regular fa-calendar"></i> زمان</th>
                <th>نوع</th>
                <th>هدف</th>
                <th>صفحه/بخش</th>
                <th><i class="fa-solid fa-mobile-screen"></i> دستگاه</th>
                <th>مرورگر</th>
                <th>سیستم‌عامل</th>
                <th>منبع</th>
              </tr>
            </thead>
            <tbody>
<?php foreach ($recent as $r): ?>
              <tr>
                <td style="white-space:nowrap"><?= $esc(eplakFaDateTimeOf($r['created_at'], '—')) ?></td>
                <td><span class="ega-tag ega-tag-<?= $esc($r['kind']) ?>"><?= $esc(eplakAnalyticsKindLabel((string) $r['kind'])) ?></span></td>
                <td><?= $esc(eplakAnalyticsTargetLabel((string) $r['kind'], (string) $r['target'])) ?></td>
                <td><?= $esc($r['page'] !== '' ? $r['page'] : '—') ?></td>
                <td><?= $esc(eplakAnalyticsDeviceLabel((string) $r['device'])) ?></td>
                <td><?= $esc($r['browser'] !== '' ? $r['browser'] : '—') ?></td>
                <td><?= $esc($r['os'] !== '' ? $r['os'] : '—') ?></td>
                <td><?= $esc(eplakAnalyticsRefLabel((string) $r['ref_host'])) ?></td>
              </tr>
<?php endforeach; ?>
            </tbody>
          </table>
        </div>
<?php endif; ?>
      </section>

      <!-- ── نگهداری و راهنما ────────────────────────────────────────── -->
      <section class="panel">
        <div class="panel-header">
          <h2 class="section-title"><i class="fa-solid fa-broom"></i> نگهداریِ داده‌ی آمار</h2>
        </div>
        <p class="ega-note">
          اکنون <strong><?= eplakChartNum($rowCount) ?></strong> رویداد در جدولِ
          <code>site_stats</code> هست. آمار به‌طورِ خودکار پاک نمی‌شود؛ اگر خواستید
          داده‌ی قدیمی را بردارید، از فرمِ زیر استفاده کنید (حداقل ۳۰ روز نگه داشته می‌شود
          تا نمودارِ ماهانه خراب نشود).
        </p>
        <form class="ega-form-row" method="post" action="?range=<?= $esc($rangeKey) ?>&amp;g=<?= $esc($g) ?>"
              onsubmit="return confirm('رویدادهای قدیمی‌تر از این تعداد روز پاک شوند؟');">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="act" value="prune">
          <label for="keep_days" style="font-size:13px;color:var(--dark-600)">نگه‌داشتنِ رویدادهای</label>
          <input id="keep_days" name="keep_days" type="number" min="30" max="3650" step="30"
                 value="<?= (int) EPLAK_ANALYTICS_KEEP_DAYS ?>">
          <span style="font-size:13px;color:var(--dark-600)">روزِ اخیر</span>
          <button class="btn btn-danger btn-sm" type="submit"><i class="fa-solid fa-trash-can"></i> پاک‌سازیِ داده‌ی قدیمی</button>
        </form>

        <div class="divider"><span style="flex:1;height:1px;background:var(--dark-100);display:block"></span></div>

        <h2 style="font-size:15px;margin:0 0 12px"><i class="fa-solid fa-circle-question"></i> این آمار چطور کار می‌کند</h2>
        <ul class="ega-note" style="margin:0;padding-right:20px">
          <li><strong>گردآوری:</strong> سایتِ معرفی (index.html در <code>public_html</code>) هر بازدید و هر کلیکِ
            دانلود/QR را با <code>navigator.sendBeacon</code> به
            <code>/eplak-fixed/api/track.php</code> می‌فرستد. اگر آن بسته آپلود نشده باشد، آمارِ سایت خالی می‌ماند
            (ولی آمارِ سامانه و اپ همیشه هست).</li>
          <li><strong>ضدِ تورم:</strong> بازدیدِ تکراریِ یک نفر از یک صفحه در <?= (int) EPLAK_ANALYTICS_VIEW_DEDUPE ?> ثانیه یکی
            شمرده می‌شود، کلیکِ تکراری در <?= (int) EPLAK_ANALYTICS_CLICK_DEDUPE ?> ثانیه، و سقفِ
            <?= (int) EPLAK_ANALYTICS_DAILY_CAP ?> رویداد در روز برای هر IP وجود دارد. ربات‌ها
            (Googlebot، curl، python و …) اصلاً ذخیره نمی‌شوند.</li>
          <li><strong>حریمِ خصوصی:</strong> IPِ خام ذخیره نمی‌شود — فقط هشِ آن. هیچ نام، شماره‌ی موبایل یا نشانیِ
            شهروند در این جدول نیست.</li>
          <li><strong>زمان:</strong> همه‌ی روزها و ساعت‌ها به وقتِ تهران و همه‌ی تاریخ‌ها شمسی‌اند
            (همان مبدأِ بقیه‌ی پنل و اپ).</li>
          <li><strong>دسترسی:</strong> این بخش فقط برایِ «مدیر کل» است؛ مدیرِ حوزه/معاونت نه آن را در منو می‌بیند
            و نه می‌تواند با نشانی مستقیم بازش کند (۴۰۳).</li>
          <li><strong>نمودارها:</strong> همه سمتِ سرور با SVG ساخته می‌شوند — بدونِ کتابخانه‌ی بیرونی و بدونِ CDN،
            پس آفلاین و در چاپ هم درست‌اند.</li>
        </ul>
      </section>

    </main>
  </div>
</body>
</html>

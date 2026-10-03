<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$report = getReportById($pdo, $id);
$message = '';
$messageType = '';

require_once __DIR__ . '/../shared/notify_events.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $report) {
    eplakRequireCsrf();
    $formAction = (string) ($_POST['form_action'] ?? 'reply');
    $reportCode = reportCodeFor((int) $report['id']);
    $reportPhone = eplakNotifyNormalizePhone((string) ($report['user_phone'] ?? ''));

    if ($formAction === 'push_resend') {
        /* ارسال دوباره‌ی آخرین اعلان این گزارش به گوشی‌های کاربر */
        $res = eplakNotifyResendLast($pdo, $reportPhone, $reportCode);
        if (($res['error'] ?? '') === 'no_notification') {
            /* هنوز اعلانی برای این گزارش ساخته نشده؛ با وضعیت فعلی یکی می‌سازیم */
            $res = eplakNotifyReply($pdo, $reportPhone, 'گزارش', $reportCode, normalizeStatusValue((string) ($report['status'] ?? 'pending')), '', null);
        }
        $d = eplakNotifyDescribe($res);
        $message = ($d['type'] === 'success' ? '✅ ' : '⚠️ ') . 'ارسال دوباره: ' . $d['text'];
        $messageType = $d['type'];
    } elseif ($formAction === 'push_test') {
        /* اعلان آزمایشی بی‌ربط به وضعیت گزارش، فقط برای سنجش مسیر گوشی این کاربر */
        $tokens = $reportPhone !== '' ? eplakFcmTokens($pdo, [$reportPhone]) : [];
        $title = 'اعلان آزمایشی — ای‌پلاک';
        $sendRes = eplakFcmSend($pdo, $tokens, $title, 'این پیام از پنل مدیریت برای بررسی رسیدن اعلان به گوشی شما ارسال شده است.', ['url' => 'index.html', 'tag' => 'eplak-admin-test-' . time()], 12);
        $sum = eplakFcmSummarize($sendRes, count($tokens));
        eplakPushLogAdd($pdo, [
            'user_phone' => $reportPhone, 'kind' => 'admin_test', 'code' => $reportCode, 'title' => $title,
            'channel' => 'fcm', 'devices' => $sum['devices'], 'sent' => $sum['sent'], 'failed' => $sum['failed'],
            'outcome' => $sum['outcome'], 'error' => $sum['error'],
        ]);
        if ($sum['outcome'] === 'sent') {
            $message = '✅ اعلان آزمایشی به ' . (int) $sum['sent'] . ' گوشی این کاربر ارسال شد.';
            $messageType = 'success';
        } else {
            $message = '⚠️ اعلان آزمایشی ارسال نشد. ' . ($sum['hint'] !== '' ? $sum['hint'] : $sum['error']);
            $messageType = 'warning';
        }
    } else {
        $status = (string) ($_POST['status'] ?? 'pending');
        $reply = trim((string) ($_POST['reply'] ?? ''));
        $notify = saveReportReply($pdo, $id, $reply, $status);
        if ($notify) {
            $d = eplakNotifyDescribe($notify);
            $message = ($d['type'] === 'success' ? '✅ ' : '⚠️ ') . 'تغییر ثبت شد. ' . $d['text'];
            $messageType = $d['type'];
        } else {
            $message = 'ℹ️ وضعیت و پاسخ همان قبلی است؛ تغییری ثبت نشد و اعلان تازه‌ای هم ساخته نشد.';
            $messageType = 'info';
        }
    }
    $report = getReportById($pdo, $id);
}

if ($report && !isset($report['code'])) {
    $report['code'] = 'EP-1403-' . str_pad((string)((int)$report['id'] + 1000), 4, '0', STR_PAD_LEFT);
}

/* پیوست‌های ارسالی شهروند (عکس و فیلم) — از جدول report_media خوانده می‌شوند */
/* موقعیت دقیق گزارش (از GPS گوشی شهروند یا نشانگر نقشه) */
$reportLat = ($report && isset($report['lat']) && $report['lat'] !== null && $report['lat'] !== '') ? (float) $report['lat'] : null;
$reportLng = ($report && isset($report['lng']) && $report['lng'] !== null && $report['lng'] !== '') ? (float) $report['lng'] : null;
$reportAcc = ($report && isset($report['location_accuracy']) && $report['location_accuracy'] !== null && $report['location_accuracy'] !== '') ? (float) $report['location_accuracy'] : null;
$hasGeo    = $reportLat !== null && $reportLng !== null;

/* روند رسیدگی — همان گام‌هایی که شهروند در اپ می‌بیند */
require_once __DIR__ . '/../shared/media.php';
require_once __DIR__ . '/../shared/fa_datetime.php';
$reportEvents = $report ? eplakReportEvents($pdo, (int) $report['id']) : [];

$reportMedia  = $report ? getReportMedia($pdo, (int) $report['id']) : [];
$mediaImages  = array_values(array_filter($reportMedia, static fn($m) => ($m['kind'] ?? 'image') !== 'video'));
$mediaVideos  = array_values(array_filter($reportMedia, static fn($m) => ($m['kind'] ?? 'image') === 'video'));

/* وضعیت اعلان گوشی این کاربر: گوشی‌های ثبت‌شده + نتیجه‌ی ارسال‌های اخیر */
$pushPhone   = $report ? eplakNotifyNormalizePhone((string) ($report['user_phone'] ?? '')) : '';
$pushDevices = $pushPhone !== '' ? eplakFcmDevicesOf($pdo, $pushPhone, 6) : [];
$pushActive  = 0;
foreach ($pushDevices as $dev) {
    if ((int) ($dev['is_active'] ?? 0) === 1) {
        $pushActive++;
    }
}
$pushLogRows = [];
if ($report) {
    $pushLogRows = eplakPushLogRecent($pdo, ['code' => reportCodeFor((int) $report['id'])], 6);
    if (!$pushLogRows && $pushPhone !== '') {
        $pushLogRows = eplakPushLogRecent($pdo, ['phone' => $pushPhone], 4);
    }
}
$pushOutcomeLabels = [
    'sent' => ['ارسال شد', 'ok'], 'partial' => ['بخشی رسید', 'warn'], 'failed' => ['گوگل نپذیرفت', 'bad'],
    'no_device' => ['گوشی ثبت نیست', 'warn'], 'fcm_off' => ['کلید فایربیس نیست', 'warn'],
    'google_error' => ['عدم دسترسی به گوگل', 'bad'], 'sent_web' => ['ارسال شد (مرورگر)', 'ok'],
];

// دریافت اطلاعات کاربر
$userInfo = null;
if ($report && !empty($report['user_phone'])) {
    $userInfo = getUserByPhone($pdo, $report['user_phone']);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جزئیات گزارش</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="../assets/js/ep-map.js?v=4"></script>
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
      <nav>
        <a href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
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
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-file-alt" style="color: var(--primary-500); margin-left: 12px;"></i>
            جزئیات گزارش
          </h1>
          <p>مشاهده گزارش و ثبت پاسخ برای کاربر</p>
        </div>
        <div class="topbar-right">
          <a href="reports.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <?php if ($report): ?>
            <a href="report_edit.php?id=<?= (int)$report['id'] ?>" class="btn btn-warning">
              <i class="fas fa-pen"></i> ویرایش
            </a>
          <?php endif; ?>
        </div>
      </header>

      <?php if ($message): ?>
        <?php $alertType = in_array($messageType, ['success', 'warning', 'info'], true) ? $messageType : 'danger'; ?>
        <div class="alert alert-<?= $alertType ?>" data-testid="reply-flash" data-notify-type="<?= htmlspecialchars((string) $messageType) ?>">
          <?php if ($messageType === 'success'): ?>
            <i class="fas fa-check-circle"></i>
          <?php elseif ($messageType === 'info'): ?>
            <i class="fas fa-info-circle"></i>
          <?php else: ?>
            <i class="fas fa-exclamation-circle"></i>
          <?php endif; ?>
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <?php if ($report): ?>
      
      <!-- ===== بخش اطلاعات کاربر ===== -->
      <?php if ($userInfo): ?>
      <div class="user-profile-card">
        <div class="user-profile-avatar">
          <?= htmlspecialchars(mb_substr($userInfo['name'] ?? 'U', 0, 1)) ?>
        </div>
        <div class="user-profile-info">
          <h3><?= htmlspecialchars($userInfo['name'] ?? 'کاربر ناشناس') ?></h3>
          <div class="user-profile-details">
            <span><i class="fas fa-phone"></i> <?= htmlspecialchars($userInfo['phone']) ?></span>
            <?php if (!empty($userInfo['nid'])): ?>
              <span><i class="fas fa-id-card"></i> <?= htmlspecialchars($userInfo['nid']) ?></span>
            <?php endif; ?>
            <?php if (!empty($userInfo['address'])): ?>
              <span><i class="fas fa-map-pin"></i> <?= htmlspecialchars($userInfo['address']) ?></span>
            <?php endif; ?>
            <span><i class="fas fa-calendar-alt"></i> عضو از: <?= htmlspecialchars($userInfo['created_at'] ?? 'نامشخص') ?></span>
          </div>
        </div>
      </div>
      <?php endif; ?>

      <!-- ===== بخش اطلاعات گزارش ===== -->
      <div class="report-meta-grid">
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--primary-50); color: var(--primary-500);">
            <i class="fas fa-hashtag"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کد گزارش</span>
            <span class="meta-value badge-code">#<?= htmlspecialchars($report['code'] ?? '') ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--warning-bg); color: var(--warning);">
            <i class="fas fa-calendar-day"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">تاریخ ثبت</span>
            <span class="meta-value"><?= htmlspecialchars($report['created_at']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--info-bg); color: var(--info);">
            <i class="fas fa-user"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کاربر</span>
            <span class="meta-value"><?= htmlspecialchars($report['user_phone']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: <?= $report['status'] === 'done' ? 'var(--success-bg)' : 'var(--warning-bg)' ?>; color: <?= $report['status'] === 'done' ? 'var(--success)' : 'var(--warning)' ?>;">
            <i class="fas <?= $report['status'] === 'done' ? 'fa-check-circle' : ($report['status'] === 'in_progress' ? 'fa-spinner fa-spin' : 'fa-hourglass-half') ?>"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">وضعیت</span>
            <span class="meta-value">
              <?php
                $statusClass = $report['status'] === 'done' ? 'status-done' : 
                              ($report['status'] === 'in_progress' ? 'status-progress' : 'status-pending');
                $statusText = $report['status'] === 'done' ? 'انجام شد' :
                             ($report['status'] === 'in_progress' ? 'در حال رسیدگی' : 'در انتظار');
              ?>
              <span class="<?= $statusClass ?>">
                <?php if ($statusText === 'در انتظار'): ?>
                  <i class="fas fa-hourglass-half"></i>
                <?php elseif ($statusText === 'در حال رسیدگی'): ?>
                  <i class="fas fa-spinner fa-spin"></i>
                <?php elseif ($statusText === 'انجام شد'): ?>
                  <i class="fas fa-check-circle"></i>
                <?php endif; ?>
                <?= $statusText ?>
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- ===== اطلاعات کامل گزارش ===== -->
      <section class="panel report-detail-panel">
        <h2>
          <i class="fas fa-info-circle" style="color: var(--primary-500); margin-left: 10px;"></i>
          اطلاعات گزارش
        </h2>
        
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-tag" style="color: var(--dark-400); margin-left: 6px;"></i>عنوان:</span>
            <span class="detail-value"><?= htmlspecialchars($report['title']) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-folder" style="color: var(--dark-400); margin-left: 6px;"></i>دسته‌بندی:</span>
            <span class="detail-value"><?= htmlspecialchars($report['category']) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-building" style="color: var(--dark-400); margin-left: 6px;"></i>واحد مربوطه:</span>
            <span class="detail-value"><?= htmlspecialchars($report['department'] ?: ($report['sub_department'] ?: 'ثبت نشده')) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-sitemap" style="color: var(--dark-400); margin-left: 6px;"></i>زیرواحد:</span>
            <span class="detail-value"><?= htmlspecialchars($report['sub_department'] ?: 'ثبت نشده') ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-map-pin" style="color: var(--dark-400); margin-left: 6px;"></i>موقعیت:</span>
            <span class="detail-value"><?= htmlspecialchars($report['location'] ?: 'ثبت نشده') ?></span>
          </div>
          <?php if ($hasGeo): ?>
          <div class="detail-item full-width">
            <span class="detail-label">
              <i class="fas fa-map-marked-alt" style="color: #ef4444; margin-left: 6px;"></i>
              موقعیت دقیق روی نقشه:
            </span>
            <div id="adminReportMap" style="height: 280px; width: 100%;"></div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:8px;">
              <span style="font-size:12.5px; direction:ltr; font-weight:700; color:var(--teal, #0f766e);">
                📍 <?= htmlspecialchars(number_format($reportLat, 6, '.', '')) ?> , <?= htmlspecialchars(number_format($reportLng, 6, '.', '')) ?>
                <?php if ($reportAcc !== null && $reportAcc > 0): ?>
                  <span style="color: var(--dark-400);">(دقت حدود <?= htmlspecialchars((string) round($reportAcc)) ?> متر)</span>
                <?php endif; ?>
              </span>
              <a class="btn btn-primary" style="font-size:12px;"
                 href="https://www.openstreetmap.org/?mlat=<?= htmlspecialchars((string) $reportLat) ?>&amp;mlon=<?= htmlspecialchars((string) $reportLng) ?>#map=18/<?= htmlspecialchars((string) $reportLat) ?>/<?= htmlspecialchars((string) $reportLng) ?>"
                 target="_blank" rel="noopener">
                <i class="fas fa-external-link-alt"></i> باز کردن در نقشه‌ی کامل
              </a>
            </div>
            <p class="help-text" style="margin-top: 8px;">
              این نقطه همان جایی است که شهروند روی نقشه‌ی برنامه مشخص کرده است؛ برای اعزام اکیپ از همین مختصات استفاده کنید.
            </p>
          </div>
          <?php else: ?>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-map-marked-alt" style="color: var(--dark-400); margin-left: 6px;"></i>موقعیت دقیق روی نقشه:</span>
            <span class="detail-value">مختصات جغرافیایی ثبت نشده است (گزارش‌های قدیمی یا ارسالی بدون نقشه).</span>
          </div>
          <?php endif; ?>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-align-left" style="color: var(--dark-400); margin-left: 6px;"></i>توضیحات:</span>
            <div class="text-block"><?= nl2br(htmlspecialchars($report['description'])) ?></div>
          </div>
          <?php if ($reportMedia): ?>
          <div class="detail-item full-width">
            <span class="detail-label">
              <i class="fas fa-paperclip" style="color: var(--dark-400); margin-left: 6px;"></i>
              فایل‌های پیوست شهروند (<?= count($reportMedia) ?> فایل):
            </span>

            <?php if ($mediaImages): ?>
              <div class="media-strip-admin">
                <?php foreach ($mediaImages as $mi => $media): ?>
                  <?php $imgUrl = adminMediaUrl((string) $media['path']); ?>
                  <figure class="media-chip" role="button" tabindex="0"
                          onclick="eplakAdminMediaOpen('image', '<?= htmlspecialchars($imgUrl, ENT_QUOTES) ?>', '<?= htmlspecialchars($media['name'] ?: 'عکس گزارش', ENT_QUOTES) ?>', <?= $mi ?>)">
                    <img src="<?= htmlspecialchars($imgUrl) ?>" alt="<?= htmlspecialchars($media['name'] ?: 'عکس گزارش') ?>" loading="lazy">
                    <span class="media-chip-size"><?= htmlspecialchars(formatBytesFa((int) $media['size'])) ?></span>
                    <a class="media-chip-dl" href="<?= htmlspecialchars($imgUrl) ?>" download title="دانلود"
                       onclick="event.stopPropagation();"><i class="fas fa-download"></i></a>
                  </figure>
                <?php endforeach; ?>
              </div>
              <p class="media-hint-admin"><i class="fas fa-hand-pointer"></i> برای دیدن اندازه‌ی بزرگ، روی عکس بزنید.</p>
            <?php endif; ?>

            <?php if ($mediaVideos): ?>
              <div class="media-strip-admin media-strip-video">
                <?php foreach ($mediaVideos as $vi => $media): ?>
                  <?php $vidUrl = adminMediaUrl((string) $media['path']); ?>
                  <figure class="media-chip media-chip-video" role="button" tabindex="0"
                          onclick="eplakAdminMediaOpen('video', '<?= htmlspecialchars($vidUrl, ENT_QUOTES) ?>', '<?= htmlspecialchars($media['name'] ?: 'فیلم گزارش', ENT_QUOTES) ?>', <?= $vi ?>)">
                    <video preload="metadata" muted playsinline src="<?= htmlspecialchars($vidUrl) ?>#t=0.4"></video>
                    <span class="media-chip-play"><i class="fas fa-play"></i></span>
                    <span class="media-chip-size"><?= htmlspecialchars(formatBytesFa((int) $media['size'])) ?></span>
                    <a class="media-chip-dl" href="<?= htmlspecialchars($vidUrl) ?>" download title="دانلود فیلم"
                       onclick="event.stopPropagation();"><i class="fas fa-download"></i></a>
                  </figure>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>

            <p class="help-text" style="margin-top: 10px;">
              اگر فایلی نمایش داده نشد، دسترسی پوشه‌ی <code>uploads</code> را بررسی کنید (باید قابل خواندن باشد).
            </p>

            <!-- نمایش تمام‌صفحه‌ی پیوست (بدون باز کردن تب تازه) -->
            <div id="adminMediaViewer" class="admin-media-viewer" onclick="if (event.target === this) eplakAdminMediaClose();">
              <button type="button" class="admin-media-close" onclick="eplakAdminMediaClose()" title="بستن">&times;</button>
              <div id="adminMediaStage" class="admin-media-stage"></div>
              <div id="adminMediaFoot" class="admin-media-foot"></div>
            </div>
            <script>
              function eplakAdminMediaOpen(kind, url, name, index) {
                var box = document.getElementById('adminMediaViewer');
                var stage = document.getElementById('adminMediaStage');
                var foot = document.getElementById('adminMediaFoot');
                if (!box || !stage) return;
                stage.innerHTML = (kind === 'video')
                  ? '<video src="' + url + '" controls autoplay playsinline></video>'
                  : '<img src="' + url + '" alt="' + name + '">';
                if (foot) foot.textContent = (kind === 'video' ? 'فیلم پیوست' : 'عکس پیوست') + ' شماره ' + (index + 1) + ' — ' + name;
                box.classList.add('open');
                document.body.classList.add('admin-media-locked');
              }
              function eplakAdminMediaClose() {
                var box = document.getElementById('adminMediaViewer');
                var stage = document.getElementById('adminMediaStage');
                if (stage) stage.innerHTML = '';
                if (box) box.classList.remove('open');
                document.body.classList.remove('admin-media-locked');
              }
              document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') eplakAdminMediaClose();
              });
            </script>
          </div>
          <?php else: ?>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-paperclip" style="color: var(--dark-400); margin-left: 6px;"></i>فایل‌های پیوست:</span>
            <div class="text-block">شهروند برای این گزارش عکس یا فیلمی ارسال نکرده است.</div>
          </div>
          <?php endif; ?>
        </div>
      </section>

      <!-- ===== بخش پاسخ قبلی ===== -->
      <section class="panel reply-panel">
        <h2>
          <i class="fas fa-reply" style="color: var(--primary-500); margin-left: 10px;"></i>
          پاسخ قبلی
        </h2>
        <?php if ($report['reply'] !== '' && $report['reply'] !== null): ?>
          <div class="text-block reply-text">
            <div class="reply-meta">
              <span><i class="fas fa-user-check" style="color: var(--primary-500);"></i> پاسخ ادمین</span>
              <span><i class="fas fa-clock" style="color: var(--dark-400);"></i> <?= htmlspecialchars($report['updated_at'] ?? date('Y-m-d H:i')) ?></span>
            </div>
            <?= nl2br(htmlspecialchars($report['reply'])) ?>
          </div>
          <div style="margin-top: 16px;">
            <a href="actions.php?type=report_reply_delete&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف پاسخ این گزارش اطمینان دارید؟')">
              <i class="fas fa-trash"></i> حذف پاسخ
            </a>
          </div>
        <?php else: ?>
          <div class="empty-state">
            <i class="fas fa-comment-slash" style="font-size: 48px; color: var(--dark-300);"></i>
            <h3>پاسخی ثبت نشده</h3>
            <p>هنوز پاسخی برای این گزارش ثبت نشده است.</p>
          </div>
        <?php endif; ?>
      </section>

      <!-- ===== روند رسیدگی (چهار مرحله، همان چیزی که شهروند در اپ می‌بیند) ===== -->
      <?php
        $flowStatus = reportStatusOf($report);
        $flowStages = eplakReportFlowStages($flowStatus, $reportEvents, (string) ($report['created_at'] ?? ''));
        $flowIcon = [
            'created'     => 'fa-file-circle-plus',
            'pending'     => 'fa-hourglass-half',
            'in_progress' => 'fa-screwdriver-wrench',
            'done'        => 'fa-circle-check',
        ];
        $flowStateLabel = ['done' => 'سپری شد', 'current' => 'در جریان', 'waiting' => 'در انتظار'];
      ?>
      <section class="panel timeline-panel">
        <h2>
          <i class="fas fa-stream" style="color: var(--primary-500); margin-left: 10px;"></i>
          روند رسیدگی
          <span class="event-count">وضعیت فعلی: <?= htmlspecialchars(statusLabel($flowStatus)) ?></span>
        </h2>

        <div class="flow-list">
          <?php foreach ($flowStages as $stage): ?>
            <div class="flow-step is-<?= htmlspecialchars($stage['state']) ?>">
              <div class="flow-marker">
                <div class="flow-dot"><i class="fas <?= $flowIcon[$stage['key']] ?? 'fa-circle' ?>"></i></div>
                <?php if ($stage['key'] !== 'done'): ?><div class="flow-line <?= $stage['state'] === 'done' ? 'done' : '' ?>"></div><?php endif; ?>
              </div>
              <div class="flow-body">
                <div class="flow-head">
                  <strong><?= htmlspecialchars($stage['label']) ?></strong>
                  <span class="flow-badge <?= htmlspecialchars($stage['state']) ?>"><?= htmlspecialchars($stage['key'] === 'done' && $stage['state'] === 'done' ? 'انجام شد' : ($flowStateLabel[$stage['state']] ?? '')) ?></span>
                  <?php if (!empty($stage['date'])): ?>
                    <span class="flow-date"><i class="far fa-clock"></i> <?= htmlspecialchars(eplakFaDateTime(null, strtotime((string) $stage['date']) ?: null)) ?></span>
                  <?php endif; ?>
                </div>
                <?php foreach (($stage['notes'] ?? []) as $note): ?>
                  <?php if (trim((string) ($note['text'] ?? '')) !== ''): ?>
                    <p class="flow-note"><?= nl2br(htmlspecialchars((string) $note['text'])) ?></p>
                  <?php endif; ?>
                <?php endforeach; ?>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
        <p class="help-text" style="margin-top:10px;">
          هر تغییری که اینجا ثبت کنید (وضعیت یا پاسخ) بی‌درنگ در اپ شهروند دیده می‌شود و برای او اعلان می‌رود.
        </p>
      </section>

      <?php if ($reportEvents): ?>
      <!-- ===== تاریخچه‌ی کامل گام‌ها (برای پیگیری داخلی) ===== -->
      <section class="panel">
        <h2>
          <i class="fas fa-clock-rotate-left" style="color: var(--primary-500); margin-left: 10px;"></i>
          تاریخچه‌ی گام‌ها
          <span class="event-count"><?= htmlspecialchars(eplakFaDigits((string) count($reportEvents))) ?> گام</span>
        </h2>
        <?php
        $eventIcon = [
            'created'  => 'fa-file-signature',
            'assigned' => 'fa-sitemap',
            'status'   => 'fa-arrows-rotate',
            'reply'    => 'fa-comment-dots',
            'edit'     => 'fa-pen',
            'media'    => 'fa-paperclip',
        ];
        ?>
        <div class="event-timeline compact">
          <?php foreach ($reportEvents as $ev): ?>
            <?php $type = (string) ($ev['type'] ?? 'note'); ?>
            <div class="event-row">
              <div class="event-marker"><i class="fas <?= $eventIcon[$type] ?? 'fa-circle-dot' ?>"></i></div>
              <div class="event-body">
                <div class="event-head">
                  <strong><?= htmlspecialchars((string) ($ev['title'] ?? 'گام رسیدگی')) ?></strong>
                  <span class="event-actor actor-<?= htmlspecialchars((string) ($ev['actor'] ?? 'system')) ?>"><?= htmlspecialchars(eplakReportEventActorLabel((string) ($ev['actor'] ?? 'system'))) ?></span>
                </div>
                <?php if (trim((string) ($ev['body'] ?? '')) !== ''): ?>
                  <p><?= nl2br(htmlspecialchars((string) $ev['body'])) ?></p>
                <?php endif; ?>
                <span class="event-date"><i class="far fa-clock"></i> <?= htmlspecialchars(eplakFaDateTime(null, strtotime((string) ($ev['created_at'] ?? '')) ?: null)) ?></span>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
      </section>
      <?php endif; ?>

      <!-- ===== وضعیت اعلان گوشی کاربر ===== -->
      <?php if ($report): ?>
      <section class="panel" id="push-panel" data-testid="push-panel">
        <h2>
          <i class="fas fa-bell" style="color: var(--primary-500); margin-left: 10px;"></i>
          اعلان گوشی این کاربر
        </h2>
        <?php if ($pushPhone === ''): ?>
          <p class="help-text">این گزارش شماره‌ی موبایلی ندارد؛ اعلان شخصی ساخته نمی‌شود.</p>
        <?php else: ?>
          <p style="margin:0 0 10px; line-height:2;" data-testid="push-devices">
            <?php if ($pushActive > 0): ?>
              <span style="background:var(--success-bg); color:var(--success); padding:3px 10px; border-radius:999px; font-weight:600; font-size:12px;">✔ <?= (int) $pushActive ?> گوشی فعال</span>
              اعلان تغییر وضعیت/پاسخ به <?= (int) $pushActive ?> گوشی این کاربر ارسال می‌شود.
            <?php else: ?>
              <span style="background:var(--warning-bg); color:var(--warning); padding:3px 10px; border-radius:999px; font-weight:600; font-size:12px;">⚠ گوشی ثبت نیست</span>
              تا وقتی کاربر اپ (آخرین نسخه) را باز نکند و با این شماره وارد نشود، فقط «اعلان داخل اپ» ثبت می‌شود و اعلان سیستمی به گوشی نمی‌رسد.
            <?php endif; ?>
          </p>
          <?php if ($pushDevices): ?>
            <table style="width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:12px;">
              <thead><tr style="color:var(--dark-500); text-align:right;"><th style="padding:5px 4px;">دستگاه</th><th>وضعیت</th><th>آخرین ثبت</th><th>آخرین خطا</th></tr></thead>
              <tbody>
                <?php foreach ($pushDevices as $dev): ?>
                  <tr style="border-top:1px dashed var(--dark-200);">
                    <td style="padding:5px 4px;"><?= htmlspecialchars((string) ($dev['platform'] ?? 'android')) ?></td>
                    <td><?= (int) $dev['is_active'] === 1 ? 'فعال' : 'غیرفعال' ?></td>
                    <td dir="ltr" style="text-align:right;"><?= htmlspecialchars((string) ($dev['last_seen_at'] ?? '')) ?></td>
                    <td style="color:var(--dark-500); word-break:break-word;"><?= htmlspecialchars((string) ($dev['last_error'] ?? '')) ?: '—' ?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          <?php endif; ?>
          <?php if ($pushLogRows): ?>
            <table style="width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:12px;" data-testid="push-log">
              <thead><tr style="color:var(--dark-500); text-align:right;"><th style="padding:5px 4px;">زمان</th><th>نوع</th><th>نتیجه</th><th>توضیح</th></tr></thead>
              <tbody>
                <?php foreach ($pushLogRows as $r): ?>
                  <?php $lab = $pushOutcomeLabels[(string) $r['outcome']] ?? [(string) $r['outcome'], 'warn']; ?>
                  <tr style="border-top:1px dashed var(--dark-200);">
                    <td dir="ltr" style="text-align:right; padding:5px 4px;"><?= htmlspecialchars((string) ($r['created_at'] ?? '')) ?></td>
                    <td><?= htmlspecialchars(['reply' => 'پاسخ/وضعیت', 'resend' => 'ارسال دوباره', 'admin_test' => 'آزمایشی', 'test' => 'آزمایشی'][(string) $r['kind']] ?? (string) $r['kind']) ?></td>
                    <td><?= htmlspecialchars($lab[0]) ?><?php if ((int) $r['devices'] > 0): ?> (<?= (int) $r['sent'] ?>/<?= (int) $r['devices'] ?>)<?php endif; ?></td>
                    <td style="color:var(--dark-500); word-break:break-word;"><?= htmlspecialchars(mb_substr((string) ($r['error'] ?? ''), 0, 140, 'UTF-8')) ?: '—' ?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          <?php endif; ?>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            <form method="post" style="margin:0;">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="form_action" value="push_resend">
              <button type="submit" class="btn btn-outline"><i class="fas fa-rotate-right"></i> ارسال دوباره‌ی آخرین اعلان</button>
            </form>
            <form method="post" style="margin:0;">
              <?= eplakCsrfField() ?>
              <input type="hidden" name="form_action" value="push_test">
              <button type="submit" class="btn btn-outline"><i class="fas fa-vial"></i> اعلان آزمایشی به گوشی این کاربر</button>
            </form>
            <a href="settings.php#fcm-section" class="btn btn-outline"><i class="fas fa-stethoscope"></i> بررسی اتصال به گوگل</a>
          </div>
        <?php endif; ?>
      </section>
      <?php endif; ?>

      <!-- ===== فرم ثبت پاسخ ===== -->
      <section class="panel reply-form-panel">
        <h2>
          <i class="fas fa-edit" style="color: var(--primary-500); margin-left: 10px;"></i>
          ثبت پاسخ جدید
        </h2>
        <form method="post" class="reply-form">
<?= eplakCsrfField() ?>
          <input type="hidden" name="form_action" value="reply">
          <div class="form-group">
            <label for="status">
              <i class="fas fa-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
              وضعیت گزارش
            </label>
            <div class="input-icon-wrapper">
              <i class="fas fa-flag input-icon"></i>
              <select name="status" id="status" class="form-control">
                <option value="pending" <?= reportStatusOf($report) === 'pending' ? 'selected' : '' ?>>
                  در انتظار
                </option>
                <option value="in_progress" <?= reportStatusOf($report) === 'in_progress' ? 'selected' : '' ?>>
                  در حال رسیدگی
                </option>
                <option value="done" <?= reportStatusOf($report) === 'done' ? 'selected' : '' ?>>
                  انجام شد
                </option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="reply">
              <i class="fas fa-comment" style="color: var(--primary-500); margin-left: 6px;"></i>
              متن پاسخ
            </label>
            <textarea 
              name="reply" 
              id="reply" 
              rows="6" 
              class="form-control" 
              placeholder="پاسخ خود را برای کاربر وارد کنید..."
            ><?= htmlspecialchars($report['reply'] ?? '') ?></textarea>
            <small class="help-text">پاسخ شما برای کاربر نمایش داده خواهد شد</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-paper-plane"></i> ثبت پاسخ
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="reports.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
      
      <?php else: ?>
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i>
          گزارش مورد نظر یافت نشد.
        </div>
        <div style="margin-top: 16px;">
          <a href="reports.php" class="btn btn-primary">
            <i class="fas fa-arrow-right"></i> بازگشت به لیست گزارش‌ها
          </a>
        </div>
      <?php endif; ?>
    </main>
  </div>

  <script>
    // ===== نقشه‌ی موقعیت دقیق گزارش (کاشی‌های OpenStreetMap — بدون کلید API) =====
    document.addEventListener('DOMContentLoaded', function() {
      var mapBox = document.getElementById('adminReportMap');
      var lat = <?= $hasGeo ? json_encode($reportLat) : 'null' ?>;
      var lng = <?= $hasGeo ? json_encode($reportLng) : 'null' ?>;
      if (mapBox && lat !== null && lng !== null && window.EplakMap) {
        var adminMap = window.EplakMap.create(mapBox, { lat: lat, lng: lng, zoom: 17, draggable: true, tileProxy: '../api/tiles.php' });
        adminMap.setPosition(lat, lng);
        /* دکمه‌ی جابه‌جایی دوباره‌ی نشانگر روی نقطه‌ی اصلی */
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn btn-secondary';
        resetBtn.style.cssText = 'font-size:12px; margin-top:8px;';
        resetBtn.innerHTML = '<i class="fas fa-crosshairs"></i> برگشت نشانگر به موقعیت ثبت‌شده';
        resetBtn.addEventListener('click', function () { adminMap.setPosition(lat, lng); adminMap.setZoom(17); });
        mapBox.parentNode.insertBefore(resetBtn, mapBox.nextSibling);
      }
    });

    // ===== پیش‌نمایش وضعیت هنگام انتخاب =====
    document.addEventListener('DOMContentLoaded', function() {
      const statusSelect = document.getElementById('status');
      
      if (statusSelect) {
        // نمایش وضعیت فعلی
        statusSelect.addEventListener('change', function() {
          const selectedOption = this.options[this.selectedIndex];
          const statusText = selectedOption.textContent.trim();
          
          // به‌روزرسانی meta-card وضعیت در بالا
          const statusMetaCard = document.querySelector('.meta-card:last-child .meta-value .status-pending, .meta-card:last-child .meta-value .status-progress, .meta-card:last-child .meta-value .status-done');
          
          if (statusMetaCard) {
            const statusMap = {
              'در انتظار': { class: 'status-pending', icon: 'fa-hourglass-half' },
              'در حال رسیدگی': { class: 'status-progress', icon: 'fa-spinner fa-spin' },
              'انجام شد': { class: 'status-done', icon: 'fa-check-circle' }
            };
            
            const status = statusMap[statusText] || statusMap['در انتظار'];
            statusMetaCard.className = status.class;
            statusMetaCard.innerHTML = `<i class="fas ${status.icon}"></i> ${statusText}`;
          }
        });
      }
    });
  </script>
</body>
</html>
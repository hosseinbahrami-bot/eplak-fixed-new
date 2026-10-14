<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$users = getAllUsers($pdo);
$userCount = count($users);

$message = '';
$messageType = 'danger';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $title = trim($_POST['title'] ?? '');
    $body  = trim($_POST['body'] ?? '');
    $target = ($_POST['target'] ?? 'all') === 'selected' ? 'selected' : 'all';
    $phones = ($target === 'selected') ? ($_POST['phones'] ?? []) : [];

    if ($title === '' || $body === '') {
        $message = '⚠️ عنوان و متن اعلان الزامی هستند.';
    } elseif ($target === 'selected' && empty($phones)) {
        $message = '⚠️ دست‌کم یک کاربر را انتخاب کنید.';
    } else {
        try {
            /* آرگومان هفتم «گزارش ارسال» را برمی‌گرداند: چند ردیف نوشته شد،
               دیتابیس قدیمی بود (و در چه چیزی)، چند پوش/FCM رفت. با همین، اگر
               اعلان در «حالت سازگار» رفته باشد به مدیر خبر می‌دهیم تا ساختار
               دیتابیس را ترمیم کند؛ وگرنه خرابی بی‌صدا می‌ماند. */
            $report = null;
            $count = sendNotification(
                $pdo,
                $title,
                $body,
                $target,
                is_array($phones) ? $phones : [],
                $_SESSION['admin_username'] ?? null,
                $report
            );
            $query = 'notifications.php?sent=' . $count;
            $degraded = array_values(array_filter((array) ($report['degraded'] ?? [])));
            if ($degraded) {
                $query .= '&degraded=' . rawurlencode(implode(',', array_slice($degraded, 0, 5)));
            }
            eplakRedirect($query);
        } catch (Throwable $e) {
            $message = '⚠️ خطا در ارسال: ' . $e->getMessage();
        }
    }
}

$sends = getNotificationSends($pdo, 30);
$sentCount = isset($_GET['sent']) ? (int)$_GET['sent'] : -1;
/* پرچم‌های «حالت سازگار» از sendNotification — یعنی اعلان رفت، ولی دیتابیس
   قدیمی است و باید ترمیم شود. */
$degradedFlags = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) ($_GET['degraded'] ?? ''))
)));
$degradedText = [
    'no_send_id'                    => 'ستون <code>notifications.send_id</code> در دیتابیس نیست؛ اعلان‌ها ذخیره شدند ولی به «ارسال گروهی» گره نخوردند (صفحه‌ی گیرندگان از روی عنوان/متن پیدا می‌کند).',
    'foreign_key'                   => 'کلید خارجی <code>user_phone → users(phone)</code> هنوز هست؛ اعلان عمومی به‌جای یک ردیف «برای همه»، برای هر کاربر جدا ذخیره شد.',
    'no_emoji'                      => 'نویسه‌گان جدول اعلان‌ها سه‌بایتی (<code>utf8</code>) است؛ ایموجی‌ها برای اینکه کل اعلان رد نشود، حذف شدند.',
    'no_read_flag'                  => 'ستون <code>read_flag</code> نیست؛ وضعیت خوانده‌شدن فقط در جدول رسیدها نگه داشته می‌شود.',
    'no_notification_sends'         => 'جدول <code>notification_sends</code> ساخته نشده؛ «تاریخچه‌ی ارسال‌ها» برای این اعلان ثبت نشد.',
    'broadcast_row_blocked'         => 'ردیف عمومی (<code>user_phone=&#039;all&#039;</code>) ذخیره نشد؛ به‌جایش برای هر کاربر ردیف شخصی ساخته شد (مهمان‌های واردنشده این اعلان را در فهرست نمی‌بینند).',
    'fk_bypassed_for_broadcast'     => 'کلید خارجیِ دیتابیس برای همین ارسال موقتاً خاموش شد تا اعلان عمومی ذخیره شود (ترمیم دائم: حذف همان کلید خارجی).',
];
$pushSubscribers = eplakPushCount($pdo);
$pushReady = eplakPushEnabled();
require_once __DIR__ . '/../shared/fcm.php';
$fcmConfigN = eplakFcmConfig($pdo);
$fcmReady   = (bool) $fcmConfigN['ready'];
$fcmError   = trim((string) ($fcmConfigN['error'] ?? ''));
$fcmDevices = eplakFcmCount($pdo);
/* کلید معتبر ولی از پروژه‌ی دیگری (SenderId mismatch): اعلان‌های APK همه رد می‌شوند */
$fcmProjectMismatch = $fcmReady && ($fcmConfigN['project_match'] ?? null) === false;
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ارسال اعلان</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <style>
    .user-picker {
        max-height: 320px;
        overflow-y: auto;
        border: 2px solid var(--dark-200);
        border-radius: var(--radius-md);
        padding: 10px;
        display: grid;
        gap: 6px;
    }
    .user-picker label {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background 0.2s ease;
    }
    .user-picker label:hover { background: var(--dark-50); }
    .user-picker input[type="checkbox"] { width: 18px; height: 18px; }
    .user-picker .up-name { font-weight: 600; }
    .user-picker .up-phone { font-size: 12px; color: var(--dark-500); direction: ltr; }
    .picker-toolbar {
        display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;
    }
  </style>
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
        <a class="active" href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="notif_diag.php"><i class="fas fa-stethoscope"></i> <span>عیب‌یابی اعلان‌ها</span></a>
        <a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-bell" style="color: var(--primary-500); margin-left: 12px;"></i>
            ارسال اعلان
          </h1>
          <p>ارسال تکی به یک کاربر، یا گروهی به چند کاربر و همه کاربران</p>
        </div>
      </header>

      <?php if ($sentCount >= 0): ?>
        <div class="alert alert-success" style="margin: 0 24px 16px;">
          <i class="fas fa-paper-plane"></i> اعلان با موفقیت برای <strong><?= $sentCount ?></strong> کاربر ارسال شد
          <span style="opacity:.85;">(این پیام داخل اپلیکیشن همه‌ی گیرندگان نمایش داده می‌شود. برای کسانی که اعلان گوشی را فعال کرده‌اند، به‌صورت نوتیفیکیشن سیستمی — حتی در حالت قفل — هم می‌رسد.)</span>
        </div>
      <?php endif; ?>

      <?php if ($sentCount >= 0 && $degradedFlags): ?>
        <div class="alert alert-warning" style="margin: 0 24px 16px;">
          <i class="fas fa-triangle-exclamation"></i>
          <strong>اعلان ارسال شد، ولی ساختار دیتابیس قدیمی است</strong>
          <ul style="margin:8px 18px 0; line-height:1.9;">
            <?php foreach ($degradedFlags as $flag): ?>
              <li><?= $degradedText[$flag] ?? htmlspecialchars((string) $flag) ?></li>
            <?php endforeach; ?>
          </ul>
          <p style="margin:10px 0 0;">
            برای ترمیم قطعی: <a href="settings.php#schema"><strong>تنظیمات ← ساختار دیتابیس ← «بررسی و ترمیم ساختار دیتابیس»</strong></a>
            یا اجرای یک‌باره‌ی <code>backend/fix-notifications-db.sql</code> در phpMyAdmin.
            جزئیات کامل: <code>docs/NOTIFICATIONS_FA.md</code>
          </p>
        </div>
      <?php endif; ?>

      <?php if ($fcmProjectMismatch): ?>
        <div class="alert alert-danger" style="margin: 0 24px 16px; line-height:1.9;" data-testid="fcm-project-mismatch-banner">
          <i class="fas fa-triangle-exclamation"></i>
          <strong>اعلانِ اپ اندروید (APK) نمی‌رسد: کلید سرویس فایربیس از پروژه‌ی دیگری است</strong> —
          کلید فعلی برای پروژه‌ی <code dir="ltr"><?= htmlspecialchars((string) $fcmConfigN['project_id']) ?></code> است،
          ولی APK با پروژه‌ی <code dir="ltr"><?= htmlspecialchars((string) $fcmConfigN['app_project']) ?></code> ساخته شده؛
          گوگل هر ارسال را با <code dir="ltr">HTTP 403 PERMISSION_DENIED SenderId mismatch</code> رد می‌کند
          (همان خطایی که در ستون «آخرین خطا»ی گوشی‌ها دیده می‌شود).
          <ol style="margin:8px 0 0; padding-inline-start:20px; font-size:13px;">
            <li>در <span dir="ltr">console.firebase.google.com</span> پروژه‌ی
                <code dir="ltr"><?= htmlspecialchars((string) $fcmConfigN['app_project']) ?></code> را باز کنید.</li>
            <li><strong>Project settings ← Service accounts ← Generate new private key</strong> را بزنید و فایل JSON را دانلود کنید.</li>
            <li>محتوای کاملِ همان فایل را در
                <a href="settings.php#fcm-section"><strong>تنظیمات ← اعلان گوشی برای اپ اندروید (فایربیس)</strong></a>
                به‌جای کلید فعلی بچسبانید و ذخیره کنید؛ سپس «بررسی اتصال» و «ارسال آزمایشی» را بزنید.</li>
          </ol>
          <p style="margin:8px 0 0; font-size:13px;">
            تا آن زمان اعلان‌ها فقط در وب/PWA و داخل خودِ اپ (وقتی باز است) دیده می‌شوند.
          </p>
        </div>
      <?php elseif ($fcmReady): ?>
        <div class="alert alert-success" style="margin: 0 24px 16px;">
          <i class="fas fa-mobile-screen-button"></i>
          <strong>اعلان اپ اندروید (فایربیس) فعال است</strong> —
          <strong><?= (int) $fcmDevices ?></strong> دستگاه ثبت شده است؛ اعلان‌های این صفحه روی گوشی این کاربران
          حتی وقتی اپ بسته باشد نمایش داده می‌شود.
        </div>
      <?php else: ?>
        <!-- پیش از این، وقتی کلید فایربیس نبود هیچ پیامی نمایش داده نمی‌شد و مدیر
             فقط از شکایت کاربر («روی APK اعلان نمی‌آید») می‌فهمید. -->
        <div class="alert alert-danger" style="margin: 0 24px 16px; line-height:1.9;">
          <i class="fas fa-triangle-exclamation"></i>
          <strong>اعلانِ اپ اندروید (APK) غیرفعال است</strong> —
          <?= htmlspecialchars($fcmError !== '' ? $fcmError : 'کلید سرویس فایربیس وارد نشده است.') ?>
          <p style="margin:8px 0 0;">
            تا این کلید وارد نشود، اعلان‌ها فقط در <strong>نسخه‌ی وب/PWA</strong> (Web Push با کلیدِ VAPID
            که خودِ پنل می‌سازد) و <strong>داخلِ خودِ اپ</strong> می‌رسند؛ روی <strong>APK</strong> وقتی اپ
            بسته یا گوشی قفل است اعلانی نمایش داده نمی‌شود. این همان دلیلِ
            «اعلان روی PWA و iOS می‌آید ولی روی APK نمی‌آید» است.
          </p>
          <ol style="margin:8px 0 0; padding-inline-start:20px; font-size:13px;">
            <li>در <span dir="ltr">console.firebase.google.com</span> پروژه‌ی اپ را باز کنید
                (پروژه‌ی APKِ فعلیِ مخزن: <code dir="ltr"><?= htmlspecialchars((string) $fcmConfigN['app_project']) ?></code> — اگر پروژه‌ی دیگری
                ساخته‌اید، APK باید با <code dir="ltr">google-services.json</code> همان پروژه ساخته شود).</li>
            <li><strong>Project settings ← Service accounts ← Generate new private key</strong> را بزنید
                و فایل JSON را دانلود کنید.</li>
            <li>محتوای کاملِ همان فایل را در
                <a href="settings.php#fcm-section"><strong>تنظیمات ← اعلان گوشی برای اپ اندروید (فایربیس)</strong></a>
                بچسبانید و ذخیره کنید (همان‌جا «عیب‌یابی» و «ارسال اعلان آزمایشی» هم هست).</li>
            <li>در گوشی: اجازه‌ی اعلانِ برنامه را بدهید و «صرفه‌جویی باتری» را برای ای‌پلاک خاموش کنید.</li>
          </ol>
          <p style="margin:8px 0 0; font-size:13px;">
            فهرستِ کاملِ دلیل‌ها و راهِ تشخیص هرکدام: <code>docs/NOTIFICATIONS_FA.md</code>
            (بخشِ «چرا اعلان روی APK نمی‌آید»).
          </p>
        </div>
      <?php endif; ?>

      <?php if ($pushReady && $pushSubscribers === 0): ?>
        <div class="alert alert-info" style="margin: 0 24px 16px; line-height:1.9;">
          <i class="fas fa-circle-info"></i>
          <strong>هنوز هیچ دستگاهی برای «اعلان گوشی» ثبت نشده است.</strong>
          تا وقتی شهروندان اجازه‌ی اعلان را تأیید نکنند، پیام‌ها فقط داخل خود برنامه دیده می‌شوند.
          <div style="margin-top:8px; font-size:13px;">
            <strong>شهروند چطور اعلان گوشی را فعال کند؟</strong>
            <ol style="margin:6px 0 0; padding-inline-start:20px;">
              <li>سایت <code dir="ltr">eplak.ir/eplak-fixed</code> را در <strong>مرورگر کروم گوشی</strong> باز کند
                  (داخل اپ اندروید، سیستم‌عامل اجازه‌ی اعلان پس‌زمینه به WebView نمی‌دهد).</li>
              <li>از منوی مرورگر گزینه‌ی <strong>«افزودن به صفحه اصلی»</strong> را انتخاب کند و اجازه‌ی اعلان را تأیید کند.</li>
              <li>در اپ اندروید هم اعلان‌های تازه تا وقتی برنامه باز است، در نوار اعلان گوشی نمایش داده می‌شوند.</li>
            </ol>
          </div>
          <a href="settings.php" style="font-weight:600;">ارسال اعلان آزمایشی و بررسی وضعیت</a>
        </div>
      <?php elseif ($pushReady && $pushSubscribers > 0): ?>
        <div class="alert alert-info" style="margin: 0 24px 16px;">
          <i class="fas fa-bell"></i>
          <strong><?= $pushSubscribers ?></strong> دستگاه آماده‌ی دریافت اعلان پس‌زمینه (نوتیفیکیشن گوشی) است —
          اعلان‌های این صفحه برای آن‌ها روی صفحه‌ی قفل هم نمایش داده می‌شود.
          <a href="settings.php" style="font-weight:600;">ارسال آزمایشی</a>
        </div>
      <?php endif; ?>
      <?php if ($message): ?>
        <div class="alert alert-<?= htmlspecialchars($messageType) ?>" style="margin: 0 24px 16px;">
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-paper-plane"></i> اعلان جدید</h2>
        <form method="post" style="display:grid; gap:18px; margin-top:16px;">
<?= eplakCsrfField() ?>

          <div class="form-group">
            <label for="title">عنوان اعلان <span style="color:var(--danger);">*</span></label>
            <input class="search-input" style="width:100%;" type="text" id="title" name="title" required
                   placeholder="مثال: قطعی آب در برخی مناطق">
          </div>

          <div class="form-group">
            <label for="body">متن اعلان <span style="color:var(--danger);">*</span></label>
            <textarea id="body" name="body" required rows="5"
                      style="width:100%; padding:12px 14px; border:2px solid var(--dark-200); border-radius:12px;
                             font-family: var(--font-family); font-size:14px; line-height:1.9; resize:vertical;"
                      placeholder="متن کامل اعلان را اینجا بنویسید"></textarea>
          </div>

          <div class="form-group">
            <label>گیرندگان</label>
            <div style="display:grid; gap:12px; margin-top:8px;">
              <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:12px;
                            border:2px solid var(--dark-200); border-radius:var(--radius-md);">
                <input type="radio" name="target" value="all" checked
                       onchange="document.getElementById('userPickerWrap').style.display='none'"
                       style="width:18px; height:18px;">
                <span><i class="fas fa-users" style="color:var(--primary-500);"></i>
                  ارسال به <strong>همه کاربران</strong> (<?= $userCount ?> نفر)</span>
              </label>

              <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:12px;
                            border:2px solid var(--dark-200); border-radius:var(--radius-md);">
                <input type="radio" name="target" value="selected"
                       onchange="document.getElementById('userPickerWrap').style.display='block'"
                       style="width:18px; height:18px;">
                <span><i class="fas fa-user-check" style="color:var(--primary-500);"></i>
                  ارسال به <strong>کاربران انتخابی</strong></span>
              </label>
            </div>
          </div>

          <div id="userPickerWrap" style="display:none;">
            <div class="picker-toolbar">
              <input class="search-input" type="text" id="userSearch" placeholder="جستجو بر اساس نام یا شماره…"
                     oninput="filterUsers(this.value)" style="flex:1; min-width:200px;">
              <button type="button" class="btn btn-secondary" onclick="toggleAll(true)">
                <i class="fas fa-check-double"></i> انتخاب همه
              </button>
              <button type="button" class="btn btn-secondary" onclick="toggleAll(false)">
                <i class="fas fa-times"></i> لغو انتخاب
              </button>
              <span id="selectedCount" style="color:var(--dark-500); font-size:13px;">۰ انتخاب شده</span>
            </div>
            <div class="user-picker" id="userPicker">
              <?php foreach ($users as $u): ?>
                <label data-name="<?= htmlspecialchars($u['name']) ?>" data-phone="<?= htmlspecialchars($u['phone']) ?>">
                  <input type="checkbox" name="phones[]" value="<?= htmlspecialchars($u['phone']) ?>" onchange="updateCount()">
                  <span class="up-name"><?= htmlspecialchars($u['name'] ?: 'کاربر بدون نام') ?></span>
                  <span class="up-phone"><?= htmlspecialchars($u['phone']) ?></span>
                </label>
              <?php endforeach; ?>
              <?php if (!$users): ?>
                <p style="text-align:center; color:var(--dark-400); padding:20px;">کاربری ثبت نشده است.</p>
              <?php endif; ?>
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" onclick="return confirmSend()">
              <i class="fas fa-paper-plane"></i> ارسال اعلان
            </button>
          </div>
        </form>
      </section>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-history"></i> اعلان‌های ارسال‌شده</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>عنوان</th>
              <th>نوع ارسال</th>
              <th>تعداد گیرنده</th>
              <th>اعلان گوشی (وبپوش)</th>
              <th>اعلان اپ (فایربیس)</th>
              <th>فرستنده</th>
              <th>زمان</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$sends): ?>
              <tr>
                <td colspan="9" style="text-align:center; padding:26px; color:var(--dark-400);">
                  هنوز اعلانی ارسال نشده است.
                </td>
              </tr>
            <?php else: ?>
              <?php foreach ($sends as $s): ?>
                <tr>
                  <td><span class="badge-code"><?= (int)$s['id'] ?></span></td>
                  <td><strong><?= htmlspecialchars($s['title']) ?></strong></td>
                  <td>
                    <?php if ($s['target_type'] === 'all'): ?>
                      <span class="status-done" style="padding:3px 10px; border-radius:999px; font-size:12px;">همه کاربران</span>
                    <?php else: ?>
                      <span class="status-progress" style="padding:3px 10px; border-radius:999px; font-size:12px;">کاربران انتخابی</span>
                    <?php endif; ?>
                  </td>
                  <td><?= (int)$s['recipients_count'] ?> نفر</td>
                  <td>
                    <?php if ((int)($s['push_sent'] ?? 0) === 0 && (int)($s['push_failed'] ?? 0) === 0): ?>
                      <span style="color: var(--dark-400); font-size: 12px;">—</span>
                    <?php else: ?>
                      <span style="color: var(--success); font-weight: 600;"><?= (int)($s['push_sent'] ?? 0) ?></span>
                      <span style="color: var(--dark-400);">/</span>
                      <span style="color: <?= (int)($s['push_failed'] ?? 0) > 0 ? 'var(--danger)' : 'var(--dark-400)' ?>; font-weight: 600;"><?= (int)($s['push_failed'] ?? 0) ?></span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php if ((int)($s['fcm_sent'] ?? 0) === 0 && (int)($s['fcm_failed'] ?? 0) === 0): ?>
                      <span style="color: var(--dark-400); font-size: 12px;">—</span>
                    <?php else: ?>
                      <span style="color: var(--success); font-weight: 600;"><?= (int)($s['fcm_sent'] ?? 0) ?></span>
                      <span style="color: var(--dark-400);">/</span>
                      <span style="color: <?= (int)($s['fcm_failed'] ?? 0) > 0 ? 'var(--danger)' : 'var(--dark-400)' ?>; font-weight: 600;"><?= (int)($s['fcm_failed'] ?? 0) ?></span>
                    <?php endif; ?>
                  </td>
                  <td><?= htmlspecialchars($s['created_by'] ?: '—') ?></td>
                  <td style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars(eplakFaDateTimeOf($s['created_at'] ?? null, '—')) ?></td>
                  <td>
                    <a class="btn-action view" href="notification_view.php?id=<?= (int)$s['id'] ?>" title="مشاهده گیرندگان">
                      <i class="fas fa-eye"></i>
                    </a>
                  </td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </section>
    </main>
  </div>

  <script>
    /* ارقام فارسی/عربی را به لاتین تبدیل می‌کند تا جستجو با هر دو نوع عدد کار کند */
    function normalizeDigits(value) {
      return String(value == null ? '' : value)
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
    }
    function filterUsers(q) {
      q = normalizeDigits((q || '').trim().toLowerCase());
      document.querySelectorAll('#userPicker label').forEach(function (l) {
        const hay = normalizeDigits(l.dataset.name + ' ' + l.dataset.phone).toLowerCase();
        l.style.display = hay.indexOf(q) > -1 ? '' : 'none';
      });
    }
    function toggleAll(on) {
      document.querySelectorAll('#userPicker input[type="checkbox"]').forEach(function (c) { c.checked = on; });
      updateCount();
    }
    function updateCount() {
      const n = document.querySelectorAll('#userPicker input[type="checkbox"]:checked').length;
      document.getElementById('selectedCount').textContent = n + ' انتخاب شده';
    }
    function confirmSend() {
      const target = document.querySelector('input[name="target"]:checked').value;
      if (target === 'all') {
        return confirm('این اعلان برای همه کاربران ارسال می‌شود. ادامه می‌دهید؟');
      }
      const n = document.querySelectorAll('#userPicker input[type="checkbox"]:checked').length;
      if (n === 0) { alert('دست‌کم یک کاربر را انتخاب کنید.'); return false; }
      return confirm('این اعلان برای ' + n + ' کاربر ارسال می‌شود. ادامه می‌دهید؟');
    }
    updateCount();
  </script>
</body>
</html>

<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$ticket = getTicketById($pdo, $id);
$message = '';
$messageType = '';

if (!$ticket) {
    eplakRedirect('tickets.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $userPhone = trim($_POST['user_phone'] ?? '');
    $reply = trim($_POST['reply'] ?? '');
    $status = $_POST['status'] ?? 'pending';
    $category = trim($_POST['category'] ?? '');
    $department = trim($_POST['department'] ?? '');
    $priority = trim($_POST['priority'] ?? 'medium');

    if ($ticket) {
        saveTicketDetails($pdo, $id, $title, $description, $userPhone, $reply, $status, $category, $department, $priority);
        $message = '✅ اطلاعات تیکت با موفقیت به‌روزرسانی شد.';
        $messageType = 'success';
        $ticket = getTicketById($pdo, $id);
    }
}

// دریافت اطلاعات کاربر
$userInfo = null;
if (!empty($ticket['user_phone'])) {
    $userInfo = getUserByPhone($pdo, $ticket['user_phone']);
}

// تنظیم کد تیکت
if (!isset($ticket['code'])) {
    $ticket['code'] = 'TK-1403-' . str_pad((string)((int)$ticket['id'] + 1000), 4, '0', STR_PAD_LEFT);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جزئیات تیکت</title>
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
      <nav>
        <a href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
        <a href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a class="active" href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
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
            <i class="fas fa-ticket-alt" style="color: var(--primary-500); margin-left: 12px;"></i>
            جزئیات تیکت
          </h1>
          <p>
            <span class="badge-code" style="margin-left: 8px;">#<?= htmlspecialchars($ticket['code'] ?? '') ?></span>
            مشاهده اطلاعات و ثبت پاسخ
          </p>
        </div>
        <div class="topbar-right">
          <a href="tickets.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <a href="ticket_add.php?user_phone=<?= urlencode($ticket['user_phone']) ?>" class="btn btn-primary">
            <i class="fas fa-plus"></i> تیکت جدید
          </a>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= $messageType ?>">
          <?php if ($messageType === 'success'): ?>
            <i class="fas fa-check-circle"></i>
          <?php else: ?>
            <i class="fas fa-exclamation-circle"></i>
          <?php endif; ?>
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

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

      <!-- ===== بخش اطلاعات تیکت ===== -->
      <div class="report-meta-grid">
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--primary-50); color: var(--primary-500);">
            <i class="fas fa-hashtag"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کد تیکت</span>
            <span class="meta-value badge-code">#<?= htmlspecialchars($ticket['code'] ?? '') ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--warning-bg); color: var(--warning);">
            <i class="fas fa-calendar-day"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">تاریخ ثبت</span>
            <span class="meta-value"><?= htmlspecialchars($ticket['created_at']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--info-bg); color: var(--info);">
            <i class="fas fa-user"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کاربر</span>
            <span class="meta-value"><?= htmlspecialchars($ticket['user_phone']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: <?= $ticket['status'] === 'done' ? 'var(--success-bg)' : 'var(--warning-bg)' ?>; color: <?= $ticket['status'] === 'done' ? 'var(--success)' : 'var(--warning)' ?>;">
            <i class="fas <?= $ticket['status'] === 'done' ? 'fa-check-circle' : ($ticket['status'] === 'in_progress' ? 'fa-spinner fa-spin' : 'fa-hourglass-half') ?>"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">وضعیت</span>
            <span class="meta-value">
              <?php
                $statusClass = $ticket['status'] === 'done' ? 'status-done' : 
                              ($ticket['status'] === 'in_progress' ? 'status-progress' : 'status-pending');
                $statusText = $ticket['status'] === 'done' ? 'انجام شد' :
                             ($ticket['status'] === 'in_progress' ? 'در حال رسیدگی' : 'در انتظار');
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

      <!-- ===== اطلاعات کامل تیکت ===== -->
      <section class="panel">
        <h2>
          <i class="fas fa-info-circle" style="color: var(--primary-500); margin-left: 10px;"></i>
          اطلاعات تیکت
        </h2>
        
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-tag" style="color: var(--dark-400); margin-left: 6px;"></i>عنوان:</span>
            <span class="detail-value"><?= htmlspecialchars($ticket['title']) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-folder" style="color: var(--dark-400); margin-left: 6px;"></i>دسته‌بندی:</span>
            <span class="detail-value"><?= htmlspecialchars($ticket['category'] ?? 'ثبت نشده') ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-building" style="color: var(--dark-400); margin-left: 6px;"></i>واحد مربوطه:</span>
            <span class="detail-value"><?= htmlspecialchars($ticket['department'] ?? 'ثبت نشده') ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-flag" style="color: var(--dark-400); margin-left: 6px;"></i>اولویت:</span>
            <span class="detail-value">
              <?php
                $priorityMap = [
                    'low' => ['class' => 'priority-low', 'icon' => 'fa-arrow-down', 'text' => 'پایین'],
                    'medium' => ['class' => 'priority-medium', 'icon' => 'fa-minus', 'text' => 'متوسط'],
                    'high' => ['class' => 'priority-high', 'icon' => 'fa-arrow-up', 'text' => 'بالا'],
                    'critical' => ['class' => 'priority-critical', 'icon' => 'fa-exclamation-triangle', 'text' => 'بحرانی']
                ];
                $priority = $priorityMap[$ticket['priority'] ?? 'medium'] ?? $priorityMap['medium'];
              ?>
              <span class="<?= $priority['class'] ?>">
                <i class="fas <?= $priority['icon'] ?>"></i>
                <?= $priority['text'] ?>
              </span>
            </span>
          </div>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-align-left" style="color: var(--dark-400); margin-left: 6px;"></i>توضیحات:</span>
            <div class="text-block"><?= nl2br(htmlspecialchars($ticket['description'])) ?></div>
          </div>
          <?php if (!empty($ticket['image_path'])): ?>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-image" style="color: var(--dark-400); margin-left: 6px;"></i>تصویر:</span>
            <div class="image-preview">
              <a href="<?= htmlspecialchars($ticket['image_path']) ?>" target="_blank">
                <img src="<?= htmlspecialchars($ticket['image_path']) ?>" alt="تصویر تیکت" class="report-image">
              </a>
            </div>
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
        <?php if ($ticket['reply'] !== '' && $ticket['reply'] !== null): ?>
          <div class="text-block reply-text">
            <div class="reply-meta">
              <span><i class="fas fa-user-check" style="color: var(--primary-500);"></i> پاسخ ادمین</span>
              <span><i class="fas fa-clock" style="color: var(--dark-400);"></i> <?= htmlspecialchars($ticket['updated_at'] ?? date('Y-m-d H:i')) ?></span>
            </div>
            <?= nl2br(htmlspecialchars($ticket['reply'])) ?>
          </div>
          <div style="margin-top: 16px;">
            <a href="actions.php?type=ticket_reply_delete&id=<?= (int)$ticket['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف پاسخ این تیکت اطمینان دارید؟')">
              <i class="fas fa-trash"></i> حذف پاسخ
            </a>
          </div>
        <?php else: ?>
          <div class="empty-state">
            <i class="fas fa-comment-slash" style="font-size: 48px; color: var(--dark-300);"></i>
            <h3>پاسخی ثبت نشده</h3>
            <p>هنوز پاسخی برای این تیکت ثبت نشده است.</p>
          </div>
        <?php endif; ?>
      </section>

      <!-- ===== فرم ویرایش تیکت ===== -->
      <section class="panel">
        <h2>
          <i class="fas fa-edit" style="color: var(--primary-500); margin-left: 10px;"></i>
          ویرایش تیکت
        </h2>
        <form method="post" class="report-form">
<?= eplakCsrfField() ?>
          <!-- ===== ردیف ۱: شماره موبایل و عنوان ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="user_phone">
                <i class="fas fa-phone" style="color: var(--primary-500); margin-left: 6px;"></i>
                شماره موبایل <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-user input-icon"></i>
                <input 
                  type="text" 
                  id="user_phone"
                  name="user_phone" 
                  class="form-control" 
                  value="<?= htmlspecialchars($ticket['user_phone']) ?>" 
                  required 
                  placeholder="مثلاً 09123456789"
                >
              </div>
            </div>

            <div class="form-group">
              <label for="title">
                <i class="fas fa-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
                عنوان تیکت <span class="required">*</span>
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-heading input-icon"></i>
                <input 
                  type="text" 
                  id="title"
                  name="title" 
                  class="form-control" 
                  value="<?= htmlspecialchars($ticket['title']) ?>" 
                  required 
                  placeholder="عنوان تیکت را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۲: دسته‌بندی و واحد ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="category">
                <i class="fas fa-folder" style="color: var(--primary-500); margin-left: 6px;"></i>
                دسته‌بندی
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-folder-open input-icon"></i>
                <select id="category" name="category" class="form-control">
                  <option value="سایر" <?= ($ticket['category'] ?? '') === 'سایر' ? 'selected' : '' ?>>سایر</option>
                  <option value="فنی" <?= ($ticket['category'] ?? '') === 'فنی' ? 'selected' : '' ?>>فنی</option>
                  <option value="اداری" <?= ($ticket['category'] ?? '') === 'اداری' ? 'selected' : '' ?>>اداری</option>
                  <option value="مالی" <?= ($ticket['category'] ?? '') === 'مالی' ? 'selected' : '' ?>>مالی</option>
                  <option value="حقوقی" <?= ($ticket['category'] ?? '') === 'حقوقی' ? 'selected' : '' ?>>حقوقی</option>
                  <option value="پشتیبانی" <?= ($ticket['category'] ?? '') === 'پشتیبانی' ? 'selected' : '' ?>>پشتیبانی</option>
                  <option value="فروش" <?= ($ticket['category'] ?? '') === 'فروش' ? 'selected' : '' ?>>فروش</option>
                  <option value="بازاریابی" <?= ($ticket['category'] ?? '') === 'بازاریابی' ? 'selected' : '' ?>>بازاریابی</option>
                  <option value="منابع انسانی" <?= ($ticket['category'] ?? '') === 'منابع انسانی' ? 'selected' : '' ?>>منابع انسانی</option>
                  <option value="فناوری اطلاعات" <?= ($ticket['category'] ?? '') === 'فناوری اطلاعات' ? 'selected' : '' ?>>فناوری اطلاعات</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="department">
                <i class="fas fa-building" style="color: var(--primary-500); margin-left: 6px;"></i>
                واحد مربوطه
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-building input-icon"></i>
                <input 
                  type="text" 
                  id="department"
                  name="department" 
                  class="form-control" 
                  value="<?= htmlspecialchars($ticket['department'] ?? '') ?>" 
                  placeholder="نام واحد را وارد کنید"
                >
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۳: اولویت و وضعیت ===== -->
          <div class="form-row">
            <div class="form-group">
              <label for="priority">
                <i class="fas fa-flag" style="color: var(--primary-500); margin-left: 6px;"></i>
                اولویت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-signal input-icon"></i>
                <select id="priority" name="priority" class="form-control">
                  <option value="low" <?= ($ticket['priority'] ?? '') === 'low' ? 'selected' : '' ?>>پایین</option>
                  <option value="medium" <?= ($ticket['priority'] ?? 'medium') === 'medium' ? 'selected' : '' ?>>متوسط</option>
                  <option value="high" <?= ($ticket['priority'] ?? '') === 'high' ? 'selected' : '' ?>>بالا</option>
                  <option value="critical" <?= ($ticket['priority'] ?? '') === 'critical' ? 'selected' : '' ?>>بحرانی</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="status">
                <i class="fas fa-check-circle" style="color: var(--primary-500); margin-left: 6px;"></i>
                وضعیت
              </label>
              <div class="input-icon-wrapper">
                <i class="fas fa-flag input-icon"></i>
                <select id="status" name="status" class="form-control">
                  <option value="pending" <?= $ticket['status'] === 'pending' ? 'selected' : '' ?>>در انتظار</option>
                  <option value="in_progress" <?= $ticket['status'] === 'in_progress' ? 'selected' : '' ?>>در حال رسیدگی</option>
                  <option value="done" <?= $ticket['status'] === 'done' ? 'selected' : '' ?>>انجام شد</option>
                </select>
              </div>
            </div>
          </div>

          <!-- ===== ردیف ۴: توضیحات ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="description">
                <i class="fas fa-align-left" style="color: var(--primary-500); margin-left: 6px;"></i>
                توضیحات تیکت <span class="required">*</span>
              </label>
              <textarea 
                id="description"
                name="description" 
                class="form-control" 
                rows="5" 
                required 
                placeholder="توضیحات کامل تیکت را وارد کنید..."
              ><?= htmlspecialchars($ticket['description']) ?></textarea>
            </div>
          </div>

          <!-- ===== ردیف ۵: پاسخ ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <label for="reply">
                <i class="fas fa-comment" style="color: var(--primary-500); margin-left: 6px;"></i>
                پاسخ
              </label>
              <textarea 
                id="reply"
                name="reply" 
                class="form-control" 
                rows="6" 
                placeholder="پاسخ خود را برای کاربر وارد کنید..."
              ><?= htmlspecialchars($ticket['reply'] ?? '') ?></textarea>
              <small class="help-text">پاسخ شما برای کاربر نمایش داده خواهد شد</small>
            </div>
          </div>

          <!-- ===== اطلاعات تکمیلی ===== -->
          <div class="form-row">
            <div class="form-group full-width">
              <div class="report-meta-info">
                <span>
                  <i class="fas fa-hashtag" style="color: var(--dark-400);"></i>
                  کد تیکت: <strong>#<?= htmlspecialchars($ticket['code'] ?? '') ?></strong>
                </span>
                <span>
                  <i class="fas fa-calendar" style="color: var(--dark-400);"></i>
                  تاریخ ثبت: <strong><?= htmlspecialchars($ticket['created_at']) ?></strong>
                </span>
                <?php if (!empty($ticket['updated_at']) && $ticket['updated_at'] !== $ticket['created_at']): ?>
                  <span>
                    <i class="fas fa-edit" style="color: var(--dark-400);"></i>
                    آخرین بروزرسانی: <strong><?= htmlspecialchars($ticket['updated_at']) ?></strong>
                  </span>
                <?php endif; ?>
              </div>
            </div>
          </div>

          <!-- ===== دکمه‌های عملیات ===== -->
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-lg">
              <i class="fas fa-save"></i> ذخیره تغییرات
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="tickets.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
            <a href="actions.php?type=ticket_delete&id=<?= (int)$ticket['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف این تیکت اطمینان دارید؟')">
              <i class="fas fa-trash"></i> حذف تیکت
            </a>
          </div>
        </form>
      </section>
    </main>
  </div>
</body>
</html>
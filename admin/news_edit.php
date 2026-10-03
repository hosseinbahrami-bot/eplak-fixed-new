<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$item = $id > 0 ? getNewsById($pdo, $id) : null;

if (!$item) {
    eplakRedirect('news.php');
}

$message = '';
$messageType = 'danger';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $title = trim($_POST['title'] ?? '');
    $body  = trim($_POST['body'] ?? '');

    if ($title === '' || $body === '') {
        $message = '⚠️ عنوان و متن اصلی الزامی هستند.';
    } else {
        /* تصویر تازه آپلودشده جای تصویر قبلی را می‌گیرد (پوشه‌ی uploads/news) */
        $imageUrl = trim($_POST['image_url'] ?? '');
        if (!empty($_FILES['image_file']['name'])) {
            $upload = eplakMediaStoreSimpleFile($_FILES['image_file'], 'news');
            if ($upload['ok']) {
                $imageUrl = $upload['path'];
            } else {
                $message = '⚠️ ' . $upload['error'];
            }
        }

        if ($message === '') {
            updateNews($pdo, $id, [
                'type'      => ($_POST['type'] ?? 'news') === 'tip' ? 'tip' : 'news',
                'title'     => $title,
                'summary'   => trim($_POST['summary'] ?? '') ?: null,
                'body'      => $body,
                'icon'      => trim($_POST['icon'] ?? '') ?: null,
                'badge'     => trim($_POST['badge'] ?? ''),
                'image_url' => $imageUrl !== '' ? $imageUrl : null,
                'published' => isset($_POST['published']) ? 1 : 0,
                'sort_order' => (int)($_POST['sort_order'] ?? 0),
            ]);
            eplakRedirect('news.php?success=1');
        }
    }
    // در صورت خطا، مقادیر ارسالی را برای نمایش نگه می‌داریم
    $item = array_merge($item, [
        'type'      => ($_POST['type'] ?? 'news') === 'tip' ? 'tip' : 'news',
        'title'     => $title,
        'summary'   => trim($_POST['summary'] ?? '') ?: null,
        'body'      => $body,
        'icon'      => trim($_POST['icon'] ?? '') ?: null,
        'badge'     => trim($_POST['badge'] ?? ''),
        'image_url' => trim($_POST['image_url'] ?? '') ?: null,
        'published' => isset($_POST['published']) ? 1 : 0,
        'sort_order' => (int)($_POST['sort_order'] ?? 0),
    ]);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ویرایش مطلب</title>
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
        <a href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
        <a class="active" href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
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
        <div class="topbar-left">
          <h1>
            <i class="fas fa-edit" style="color: var(--primary-500); margin-left: 12px;"></i>
            ویرایش مطلب
          </h1>
          <p>تغییرات بلافاصله در اپلیکیشن اعمال می‌شود</p>
        </div>
        <div class="topbar-right">
          <a href="news.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= htmlspecialchars($messageType) ?>" style="margin: 0 24px 16px;">
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-pen"></i> اطلاعات مطلب</h2>
        <form method="post" enctype="multipart/form-data" style="display:grid; gap:18px; margin-top:16px;">
<?= eplakCsrfField() ?>

          <div class="form-group">
            <label for="type">بخش</label>
            <select class="filter-select" id="type" name="type" style="width:100%;">
              <option value="news" <?= $item['type'] === 'news' ? 'selected' : '' ?>>📰 اخبار و اطلاعات</option>
              <option value="tip" <?= $item['type'] === 'tip' ? 'selected' : '' ?>>🏛️ دانستنی‌های ورامین</option>
            </select>
          </div>

          <div class="form-group">
            <label for="title">عنوان <span style="color:var(--danger);">*</span></label>
            <input class="search-input" style="width:100%;" type="text" id="title" name="title" required
                   value="<?= htmlspecialchars($item['title']) ?>">
          </div>

          <div class="form-group">
            <label for="summary">خلاصه</label>
            <input class="search-input" style="width:100%;" type="text" id="summary" name="summary"
                   value="<?= htmlspecialchars($item['summary'] ?? '') ?>">
          </div>

          <div class="form-group">
            <label for="body">متن کامل <span style="color:var(--danger);">*</span></label>
            <textarea id="body" name="body" required rows="8"
                      style="width:100%; padding:12px 14px; border:2px solid var(--dark-200); border-radius:12px;
                             font-family: var(--font-family); font-size:14px; line-height:1.9; resize:vertical;"
            ><?= htmlspecialchars($item['body']) ?></textarea>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:18px;">
            <div class="form-group">
              <label for="icon">آیکون (ایموجی)</label>
              <input class="search-input" style="width:100%;" type="text" id="icon" name="icon" maxlength="8"
                     value="<?= htmlspecialchars($item['icon'] ?? '') ?>">
            </div>
            <div class="form-group">
              <label for="sort_order">ترتیب نمایش</label>
              <input class="search-input" style="width:100%;" type="number" id="sort_order" name="sort_order"
                     value="<?= (int)$item['sort_order'] ?>">
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:18px;">
            <div class="form-group">
              <label for="badge">نشان/زیرعنوان (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="text" id="badge" name="badge" maxlength="120"
                     value="<?= htmlspecialchars($item['badge'] ?? '') ?>"
                     placeholder="مثال: ۷۲۲ ه.ق · دوره ایلخانی">
              <p class="help-text">برای دانستنی‌ها روی کارت و بالای تصویر جزئیات نمایش داده می‌شود.</p>
            </div>
            <div class="form-group">
              <label for="image_file">تصویر شاخص جدید (اختیاری)</label>
              <input class="search-input" style="width:100%;" type="file" id="image_file" name="image_file"
                     accept="image/*">
              <p class="help-text">اگر فایلی انتخاب کنید، جای تصویر فعلی را می‌گیرد.</p>
            </div>
          </div>

          <div class="form-group">
            <label for="image_url">نشانی تصویر (اختیاری)</label>
            <input class="search-input" style="width:100%;" type="text" id="image_url" name="image_url" dir="ltr"
                   style="text-align:left;" value="<?= htmlspecialchars($item['image_url'] ?? '') ?>">
            <?php if (!empty($item['image_url'])): ?>
              <div style="margin-top: 10px;">
                <img src="<?= htmlspecialchars(adminMediaUrl((string) $item['image_url'])) ?>" alt="تصویر فعلی"
                     style="max-width: 220px; border-radius: 12px; border: 1px solid var(--dark-200);">
              </div>
            <?php endif; ?>
          </div>

          <div class="form-group">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="checkbox" name="published" id="published" <?= (int)$item['published'] === 1 ? 'checked' : '' ?>
                     style="width:18px; height:18px;">
              <span>در اپلیکیشن منتشر شود</span>
            </label>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-save"></i> ذخیره تغییرات
            </button>
            <a href="news.php" class="btn btn-secondary">انصراف</a>
          </div>
        </form>
      </section>
    </main>
  </div>
</body>
</html>

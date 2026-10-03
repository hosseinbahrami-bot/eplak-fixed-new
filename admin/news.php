<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$type = $_GET['type'] ?? '';
if ($type !== 'news' && $type !== 'tip') {
    $type = '';
}

$rows = getAllNews($pdo, $type);

$countAll  = (int)$pdo->query("SELECT COUNT(*) FROM news")->fetchColumn();
$countNews = (int)$pdo->query("SELECT COUNT(*) FROM news WHERE type = 'news'")->fetchColumn();
$countTip  = (int)$pdo->query("SELECT COUNT(*) FROM news WHERE type = 'tip'")->fetchColumn();

$success = isset($_GET['success']);
$deleted = isset($_GET['deleted']);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>اخبار و دانستنی‌ها</title>
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
            <i class="fas fa-newspaper" style="color: var(--primary-500); margin-left: 12px;"></i>
            اخبار و دانستنی‌ها
          </h1>
          <p>هر تغییری اینجا ذخیره شود، بلافاصله در اپلیکیشن نمایش داده می‌شود</p>
        </div>
        <div class="topbar-right">
          <a href="news_add.php" class="btn btn-primary">
            <i class="fas fa-plus"></i> افزودن مورد جدید
          </a>
        </div>
      </header>

      <?php if ($success): ?>
        <div class="alert alert-success" style="margin: 0 24px 16px;">
          <i class="fas fa-check-circle"></i> تغییرات با موفقیت ذخیره شد و در اپلیکیشن اعمال گردید.
        </div>
      <?php endif; ?>
      <?php if ($deleted): ?>
        <div class="alert alert-info" style="margin: 0 24px 16px;">
          <i class="fas fa-trash"></i> مورد انتخاب‌شده حذف شد.
        </div>
      <?php endif; ?>

      <section class="stats-mini" style="margin: 0 24px 16px;">
        <a class="stat-item <?= $type === '' ? 'active' : '' ?>" href="news.php">همه <strong><?= $countAll ?></strong></a>
        <a class="stat-item <?= $type === 'news' ? 'active' : '' ?>" href="news.php?type=news">اخبار و اطلاعات <strong><?= $countNews ?></strong></a>
        <a class="stat-item <?= $type === 'tip' ? 'active' : '' ?>" href="news.php?type=tip">دانستنی‌های ورامین <strong><?= $countTip ?></strong></a>
      </section>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-list"></i> فهرست مطالب</h2>
        <table>
          <thead>
            <tr>
              <th>آیکون</th>
              <th>عنوان</th>
              <th>خلاصه</th>
              <th>بخش</th>
              <th>وضعیت</th>
              <th>ترتیب</th>
              <th>آخرین تغییر</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$rows): ?>
              <tr>
                <td colspan="8" style="text-align:center; padding: 30px; color: var(--dark-400);">
                  <i class="fas fa-inbox" style="font-size: 26px; display:block; margin-bottom: 10px;"></i>
                  موردی ثبت نشده است. روی «افزودن مورد جدید» بزنید.
                </td>
              </tr>
            <?php else: ?>
              <?php foreach ($rows as $row): ?>
                <tr>
                  <td style="font-size: 20px;">
                    <?php if (!empty($row['image_url'])): ?>
                      <img src="<?= htmlspecialchars(adminMediaUrl((string) $row['image_url'])) ?>" alt=""
                           style="width:42px; height:42px; border-radius:10px; object-fit:cover; display:block; margin:auto;">
                    <?php else: ?>
                      <?= htmlspecialchars($row['icon'] ?: '📰') ?>
                    <?php endif; ?>
                  </td>
                  <td>
                    <strong><?= htmlspecialchars($row['title']) ?></strong>
                    <?php if (!empty($row['badge'])): ?>
                      <div style="font-size: 12px; color: var(--dark-500); margin-top: 4px;">
                        <i class="fas fa-tag" style="font-size: 10px;"></i> <?= htmlspecialchars((string) $row['badge']) ?>
                      </div>
                    <?php endif; ?>
                  </td>
                  <td style="max-width: 280px; color: var(--dark-500); font-size: 13px;">
                    <?= htmlspecialchars(mb_substr($row['summary'] ?: $row['body'], 0, 60)) ?><?= mb_strlen($row['summary'] ?: $row['body']) > 60 ? '…' : '' ?>
                  </td>
                  <td>
                    <?php if ($row['type'] === 'tip'): ?>
                      <span class="status-progress" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">دانستنی</span>
                    <?php else: ?>
                      <span class="status-pending" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">خبر</span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php if ((int)$row['published'] === 1): ?>
                      <span class="status-done" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">منتشر شده</span>
                    <?php else: ?>
                      <span class="status-pending" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">پیش‌نویس</span>
                    <?php endif; ?>
                  </td>
                  <td><?= (int)$row['sort_order'] ?></td>
                  <td style="font-size: 12px; color: var(--dark-500);"><?= htmlspecialchars($row['updated_at']) ?></td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <a class="btn-action view" href="news_edit.php?id=<?= (int)$row['id'] ?>" title="ویرایش">
                        <i class="fas fa-edit"></i>
                      </a>
                      <a class="btn-action edit" href="actions.php?type=news_toggle&id=<?= (int)$row['id'] ?><?= eplakCsrfQuery() ?>" title="تغییر وضعیت انتشار">
                        <i class="fas fa-<?= (int)$row['published'] === 1 ? 'eye-slash' : 'eye' ?>"></i>
                      </a>
                      <a class="btn-action delete" href="actions.php?type=news_delete&id=<?= (int)$row['id'] ?><?= eplakCsrfQuery() ?>" title="حذف"
                         onclick="return confirm('آیا از حذف این مورد مطمئن هستید؟')">
                        <i class="fas fa-trash"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</body>
</html>

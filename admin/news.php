<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$type = $_GET['type'] ?? '';
if ($type !== 'news' && $type !== 'tip') {
    $type = '';
}

/* سلامت جدول + شمارش‌ها در یک تابع (هرگز صفحه سفید نمی‌شود؛ اگر جدول news در
   دیتابیس نباشد، همین‌جا پیام و دکمه‌ی تعمیر نشان داده می‌شود) */
$status = eplakNewsAdminStatus($pdo);
$report = null;
$rows   = getAllNews($pdo, $type, $report);

$countAll  = (int) $status['all'];
$countNews = (int) $status['news'];
$countTip  = (int) $status['tip'];

$success  = isset($_GET['success']);
$deleted  = isset($_GET['deleted']);
$repaired = isset($_GET['repaired']);
$fixedN   = (int) ($_GET['fixed'] ?? 0);
$brokenN  = (int) ($_GET['broken'] ?? 0);
$seededN  = (int) ($_GET['seeded'] ?? 0);

/* آیا ساختار جدول با کد یکی است؟ (اگر نه، بخشی از فیلدها ذخیره نمی‌شود) */
$newsBroken = !$status['table'] || $status['failed'] || !$status['badge'] || !$status['image'] || !$status['emoji'];
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
      <?php
        /* «چه چیزی به‌خاطر دیتابیس قدیمی ذخیره نشد» — صادقانه و قابل اقدام */
        $degradedRaw = trim((string) ($_GET['degraded'] ?? ''));
        $degradedMap = [
            'no_badge'      => 'نشان/زیرعنوان ذخیره نشد (ستون <code>badge</code> در دیتابیس نیست)',
            'no_image_url'  => 'تصویر مطلب ذخیره نشد (ستون <code>image_url</code> در دیتابیس نیست)',
            'no_summary'    => 'خلاصه ذخیره نشد (ستون <code>summary</code> در دیتابیس نیست)',
            'no_icon'       => 'آیکون ذخیره نشد (ستون <code>icon</code> در دیتابیس نیست)',
            'no_sort_order' => 'ترتیب نمایش ذخیره نشد (ستون <code>sort_order</code> در دیتابیس نیست)',
            'no_published'  => 'وضعیت انتشار ذخیره نشد؛ مطلب «منتشرشده» فرض می‌شود',
            'no_type'       => 'نوع مطلب (خبر/دانستنی) ذخیره نشد؛ همه در یک فهرست می‌آیند',
            'no_updated_at' => 'تاریخ آخرین تغییر ذخیره نشد',
            'no_emoji'      => 'ایموجی‌های عنوان/متن حذف شدند (نویسه‌گان جدول <code>utf8</code> سه‌بایتی است)',
            'retry_after_repair' => 'ساختار جدول حین ذخیره به‌صورت خودکار تعمیر شد',
            'saved_minimal' => 'مطلب فقط با عنوان و متن ذخیره شد (بقیه‌ی ستون‌ها در دسترس نبودند)',
            'no_table'      => 'جدول <code>news</code> در دیتابیس نیست',
        ];
        $degradedNotes = [];
        foreach (array_filter(array_map('trim', explode(',', $degradedRaw))) as $code) {
            if (isset($degradedMap[$code])) {
                $degradedNotes[] = $degradedMap[$code];
            }
        }
      ?>
      <?php if ($degradedNotes): ?>
        <div class="alert alert-warning" style="margin: 0 24px 16px;">
          <i class="fas fa-circle-info"></i>
          <strong>مطلب ذخیره شد، ولی «سازگار»:</strong>
          <ul style="margin:8px 0 0 0; padding-right:20px; line-height:2;">
            <?php foreach ($degradedNotes as $note): ?><li><?= $note ?></li><?php endforeach; ?>
          </ul>
          <div style="margin-top:10px;">
            <a class="btn btn-secondary" href="actions.php?type=news_repair<?= eplakCsrfQuery() ?>">
              <i class="fas fa-screwdriver-wrench"></i> تعمیر خودکار جدول اخبار
            </a>
            <span style="font-size:12px; color:var(--dark-500);">
              اگر تعمیر موفق نشد، کاربر دیتابیس اجازه‌ی <code>ALTER TABLE</code> ندارد؛
              اسکریپت <code>backend/fix-news-db.sql</code> را با کاربری که دسترسی کامل دارد اجرا کنید.
            </span>
          </div>
        </div>
      <?php endif; ?>
      <?php if ($deleted): ?>
        <div class="alert alert-info" style="margin: 0 24px 16px;">
          <i class="fas fa-trash"></i> مورد انتخاب‌شده حذف شد.
        </div>
      <?php endif; ?>

      <?php if ($repaired): ?>
        <div class="alert <?= $brokenN > 0 ? 'alert-warning' : 'alert-success' ?>" style="margin: 0 24px 16px;">
          <i class="fas fa-screwdriver-wrench"></i>
          <?= $fixedN > 0 ? htmlspecialchars($fixedN) . ' مورد از ساختار جدول اخبار تعمیر شد.' : 'ساختار جدول اخبار از قبل سالم بود.' ?>
          <?php if ($seededN > 0): ?>
            <?= htmlspecialchars($seededN) ?> مطلب پیش‌فرض هم اضافه شد (۴ خبر + ۲ دانستنی) تا فهرست خالی نماند.
          <?php endif; ?>
          <?php if ($brokenN > 0): ?>
            <br><strong><?= htmlspecialchars($brokenN) ?> مورد تعمیر نشد</strong> — معمولاً یعنی کاربر دیتابیس اجازه‌ی
            <code>ALTER TABLE</code> ندارد. در این حالت مطالب «بدون» آن فیلدها ذخیره می‌شوند و اپ همچنان کار می‌کند؛
            برای تعمیر کامل، <code>backend/fix-news-db.sql</code> را با کاربری که دسترسی کامل دارد اجرا کنید.
          <?php endif; ?>
        </div>
      <?php endif; ?>

      <?php if (!$status['table']): ?>
        <div class="alert alert-danger" style="margin: 0 24px 16px;">
          <i class="fas fa-triangle-exclamation"></i>
          <strong>جدول <code>news</code> در دیتابیس وجود ندارد.</strong>
          به همین دلیل فهرست اخبار اینجا و در اپلیکیشن خالی است
          (دامپ اصلی دیتابیس این جدول را نداشت).
          <?php if ($status['error']): ?>
            <div class="detail" style="direction:ltr; text-align:left; font-size:12px; margin-top:8px;"><?= htmlspecialchars($status['error']) ?></div>
          <?php endif; ?>
          <div style="margin-top:12px;">
            <a class="btn btn-primary" href="actions.php?type=news_repair<?= eplakCsrfQuery() ?>">
              <i class="fas fa-screwdriver-wrench"></i> ساخت و تعمیر جدول اخبار
            </a>
          </div>
        </div>
      <?php elseif ($newsBroken): ?>
        <div class="alert alert-warning" style="margin: 0 24px 16px;">
          <i class="fas fa-triangle-exclamation"></i>
          <strong>ساختار جدول اخبار با نسخه‌ی کد یکی نیست.</strong>
          <?php
            $problems = [];
            if (!$status['badge']) { $problems[] = 'ستون <code>badge</code> (نشان/زیرعنوان) نیست'; }
            if (!$status['image']) { $problems[] = 'ستون <code>image_url</code> (تصویر مطلب) نیست'; }
            if (!$status['emoji']) { $problems[] = 'نویسه‌گان جدول <code>utf8</code> سه‌بایتی است (ایموجی 🌳🏛️ ذخیره نمی‌شود)'; }
            foreach ($status['failed'] as $f) { $problems[] = htmlspecialchars((string) $f); }
            echo implode(' · ', $problems);
          ?>
          <br>در این حالت، افزودن/ویرایش مطلب به‌صورت «سازگار» ذخیره می‌شود (فیلدهای نبوده نادیده گرفته می‌شوند)
          و اپلیکیشن هم کار می‌کند، ولی آن فیلدها دیده نمی‌شوند.
          <div style="margin-top:12px;">
            <a class="btn btn-primary" href="actions.php?type=news_repair<?= eplakCsrfQuery() ?>">
              <i class="fas fa-screwdriver-wrench"></i> تعمیر خودکار جدول اخبار
            </a>
          </div>
        </div>
      <?php endif; ?>

      <section class="stats-mini" style="margin: 0 24px 16px;">
        <a class="stat-item <?= $type === '' ? 'active' : '' ?>" href="news.php">همه <strong><?= $countAll ?></strong></a>
        <a class="stat-item <?= $type === 'news' ? 'active' : '' ?>" href="news.php?type=news">اخبار و اطلاعات <strong><?= $countNews ?></strong></a>
        <a class="stat-item <?= $type === 'tip' ? 'active' : '' ?>" href="news.php?type=tip">دانستنی‌های ورامین <strong><?= $countTip ?></strong></a>
        <span class="stat-item" style="cursor:default;" title="مطالبی که در اپ نمایش داده می‌شوند">
          منتشرشده <strong><?= (int) $status['published'] ?></strong>
        </span>
        <span class="stat-item" style="cursor:default;"
              title="<?= $status['table'] ? 'جدول news وجود دارد' : 'جدول news وجود ندارد' ?>">
          جدول <strong><?= $status['table'] ? '✅' : '❌' ?></strong>
        </span>
        <span class="stat-item" style="cursor:default;" title="ستون تصویر و نشان برای مطالب">
          تصویر/نشان <strong><?= ($status['image'] && $status['badge']) ? '✅' : '⚠️' ?></strong>
        </span>
        <span class="stat-item" style="cursor:default;" title="utf8mb4 برای ذخیره‌ی ایموجی">
          ایموجی <strong><?= $status['emoji'] ? '✅' : '⚠️' ?></strong>
        </span>
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
                  <?php if (!$status['table']): ?>
                    جدول <code>news</code> در دیتابیس نیست؛ اول آن را بسازید/تعمیر کنید.
                    <div style="margin-top:14px;">
                      <a class="btn btn-primary" href="actions.php?type=news_repair<?= eplakCsrfQuery() ?>">
                        <i class="fas fa-screwdriver-wrench"></i> ساخت و تعمیر جدول + مطالب پیش‌فرض
                      </a>
                    </div>
                  <?php else: ?>
                    موردی ثبت نشده است. روی «افزودن مورد جدید» بزنید، یا مطالب پیش‌فرض
                    (۴ خبر شهری + ۲ دانستنی میراثی با عکس) را یک‌جا اضافه کنید:
                    <div style="margin-top:14px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                      <a class="btn btn-primary" href="news_add.php"><i class="fas fa-plus"></i> افزودن مورد جدید</a>
                      <a class="btn btn-secondary" href="actions.php?type=news_repair<?= eplakCsrfQuery() ?>">
                        <i class="fas fa-wand-magic-sparkles"></i> افزودن مطالب پیش‌فرض
                      </a>
                    </div>
                  <?php endif; ?>
                </td>
              </tr>
            <?php else: ?>
              <?php foreach ($rows as $row): ?>
                <tr>
                  <td style="font-size: 20px;">
                    <?php if (!empty($row['image_url'])): ?>
                      <img src="<?= htmlspecialchars(adminMediaUrl((string) ($row['image_url'] ?? ''))) ?>" alt=""
                           style="width:42px; height:42px; border-radius:10px; object-fit:cover; display:block; margin:auto;">
                    <?php else: ?>
                      <?= htmlspecialchars((string) (($row['icon'] ?? '') ?: ($row['type'] === 'tip' ? '🏛️' : '📰'))) ?>
                    <?php endif; ?>
                  </td>
                  <td>
                    <strong><?= htmlspecialchars((string) ($row['title'] ?? '')) ?></strong>
                    <?php if (!empty($row['badge'])): /* ستون badge در دیتابیس قدیمی نیست */ ?>
                      <div style="font-size: 12px; color: var(--dark-500); margin-top: 4px;">
                        <i class="fas fa-tag" style="font-size: 10px;"></i> <?= htmlspecialchars((string) $row['badge']) ?>
                      </div>
                    <?php endif; ?>
                  </td>
                  <td style="max-width: 280px; color: var(--dark-500); font-size: 13px;">
                    <?php $sumText = (string) (($row['summary'] ?? '') ?: ($row['body'] ?? '')); ?>
                    <?= htmlspecialchars(mb_substr($sumText, 0, 60)) ?><?= mb_strlen($sumText) > 60 ? '…' : '' ?>
                  </td>
                  <td>
                    <?php if (($row['type'] ?? 'news') === 'tip'): ?>
                      <span class="status-progress" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">دانستنی</span>
                    <?php else: ?>
                      <span class="status-pending" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">خبر</span>
                    <?php endif; ?>
                  </td>
                  <td>
                    <?php if ((int)($row['published'] ?? 1) === 1): ?>
                      <span class="status-done" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">منتشر شده</span>
                    <?php else: ?>
                      <span class="status-pending" style="padding: 3px 10px; border-radius: 999px; font-size: 12px;">پیش‌نویس</span>
                    <?php endif; ?>
                  </td>
                  <td><?= (int)($row['sort_order'] ?? 0) ?></td>
                  <td style="font-size: 12px; color: var(--dark-500);"><?= htmlspecialchars((string) ($row['updated_at'] ?? $row['created_at'] ?? '—')) ?></td>
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

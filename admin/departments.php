<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

/* دسترسی: departments — مدیرِ حوزه/معاونت به این صفحه نمی‌رسد (admin/includes/acl.php) */
eplakRequirePermission('departments');


$departments = getDepartmentTree($pdo);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت واحدهای اداری</title>
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
<?= eplakAdminSidebar('departments') ?>      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1><i class="fas fa-sitemap" style="color: #0f766e; margin-left: 12px;"></i>مدیریت واحدهای اداری</h1>
          <p>تعریف، ویرایش و حذف واحدهای اصلی و زیرمجموعه‌ها</p>
        </div>
        <div class="topbar-right">
          <a href="department_add.php" class="btn btn-primary">
            <i class="fas fa-plus"></i> واحد جدید
          </a>
        </div>
      </header>

      <section class="panel">
        <div class="panel-header">
          <h2><i class="fas fa-folder-tree" style="color: #0f766e; margin-left: 10px;"></i>درخت واحدها</h2>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>واحد اصلی</th>
                <th>زیرواحد</th>
                <th>ترتیب</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($departments as $parent): ?>
                <?php $children = $parent['children'] ?? []; ?>
                <?php if (count($children) === 0): ?>
                  <tr>
                    <td><strong><?= htmlspecialchars($parent['name']) ?></strong></td>
                    <td>—</td>
                    <td><?= (int)$parent['sort_order'] ?></td>
                    <td>
                      <div class="action-buttons">
                        <a href="department_edit.php?id=<?= (int)$parent['id'] ?>" class="btn-action edit" title="ویرایش"><i class="fas fa-pen"></i></a>
                        <a href="actions.php?type=department_delete&id=<?= (int)$parent['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این واحد مطمئن هستید؟')"><i class="fas fa-trash"></i></a>
                      </div>
                    </td>
                  </tr>
                <?php else: ?>
                  <?php foreach ($children as $index => $child): ?>
                    <tr>
                      <?php if ($index === 0): ?>
                        <td rowspan="<?= count($children) ?>"><strong><?= htmlspecialchars($parent['name']) ?></strong></td>
                      <?php endif; ?>
                      <td><?= htmlspecialchars($child['name']) ?></td>
                      <td><?= (int)$child['sort_order'] ?></td>
                      <td>
                        <div class="action-buttons">
                          <a href="department_edit.php?id=<?= (int)$child['id'] ?>" class="btn-action edit" title="ویرایش"><i class="fas fa-pen"></i></a>
                          <a href="actions.php?type=department_delete&id=<?= (int)$child['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این زیرواحد مطمئن هستید؟')"><i class="fas fa-trash"></i></a>
                        </div>
                      </td>
                    </tr>
                  <?php endforeach; ?>
                <?php endif; ?>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>

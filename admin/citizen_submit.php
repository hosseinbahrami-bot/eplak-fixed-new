<?php
require_once __DIR__ . '/includes/db.php';
eplakStartSession('eplak_citizen');

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $phone = trim($_POST['phone'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $description = trim($_POST['description'] ?? '');

    if ($phone !== '' && $title !== '' && $description !== '') {
        $stmt = $pdo->prepare('INSERT IGNORE INTO users (phone, name, address, nid) VALUES (:phone, "", "", "")');
        $stmt->execute([':phone' => $phone]);

        $stmt = $pdo->prepare('INSERT INTO reports (user_phone, title, description, category, status) VALUES (:phone, :title, :description, :category, :status)');
        $stmt->execute([
            ':phone' => $phone,
            ':title' => $title,
            ':description' => $description,
            ':category' => 'سایر',
            ':status' => 'pending',
        ]);
        $message = 'گزارش شما با موفقیت ثبت شد و در پنل مدیریت نمایش داده خواهد شد.';
    } else {
        $message = 'لطفاً همه فیلدها را کامل وارد کنید.';
    }
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ثبت تیکت شهروندی</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
</head>
<body>
  <div class="login-box">
    <h2>ثبت تیکت برای شهروند</h2>
    <p>این فرم برای ارسال تیکت و درخواست به پنل مدیریت است.</p>
    <?php if ($message): ?><div class="alert success"><?= htmlspecialchars($message) ?></div><?php endif; ?>
    <form method="post">
      <label>شماره موبایل</label>
      <input type="text" name="phone" required>
      <label>عنوان تیکت</label>
      <input type="text" name="title" required>
      <label>توضیحات</label>
      <textarea name="description" rows="5" required></textarea>
      <button type="submit">ثبت تیکت</button>
    </form>
  </div>
</body>
</html>

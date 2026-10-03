<?php
// eplak-fixed/index.php — هدایت هوشمند درخواست‌ها
$uri = $_SERVER['REQUEST_URI'] ?? '';

if (isset($_GET['eplak_admin']) || isset($_GET['admin']) || strpos($uri, 'eplak_admin') !== false) {
    header('Location: /admin/index.php' . (isset($_GET['eplak_admin']) ? '?eplak_admin=' . urlencode($_GET['eplak_admin']) : ''));
    exit;
}

// در صورت درخواست مستقیم ریشه یا index.php، فایل اصلی اپلیکیشن شهروندی ارائه می‌شود
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');

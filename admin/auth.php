<?php
require_once __DIR__ . '/includes/db.php';
eplakStartSession('eplak_admin');

function isAdminLoggedIn(): bool {
    /* ورود فقط با نشست معتبر. (نسخه‌ی قبلی بر اساس هدر Host/X-Forwarded-Host
       به‌طور خودکار نشست super_admin می‌ساخت که یک دورزدن کامل احراز هویت بود.) */
    return !empty($_SESSION['admin_logged_in']) && !empty($_SESSION['admin_id']);
}

function requireAdmin(): void {
    if (!isAdminLoggedIn()) {
        eplakRedirect('login.php');
        exit;
    }
}

/* ── محافظت CSRF برای عملیات تغییردهنده (حذف/تغییر وضعیت) ──────────── */
function eplakCsrfToken(): string {
    if (empty($_SESSION['eplak_csrf'])) {
        $_SESSION['eplak_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['eplak_csrf'];
}

/* برای الحاق به لینک‌های actions.php: &_token=... */
function eplakCsrfQuery(): string {
    return '&_token=' . rawurlencode(eplakCsrfToken());
}

/* فیلد مخفی برای فرم‌های POST */
function eplakCsrfField(): string {
    return '<input type="hidden" name="_token" value="' . htmlspecialchars(eplakCsrfToken(), ENT_QUOTES, 'UTF-8') . '">';
}

function eplakVerifyCsrf(?string $token): bool {
    $expected = $_SESSION['eplak_csrf'] ?? '';
    return is_string($token) && $expected !== '' && hash_equals($expected, $token);
}

function eplakRequireCsrf(): void {
    $token = $_POST['_token'] ?? $_GET['_token'] ?? '';
    if (!eplakVerifyCsrf(is_string($token) ? $token : '')) {
        http_response_code(403);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center">'
           . '<h3>درخواست نامعتبر (توکن امنیتی منقضی شده)</h3>'
           . '<p>لطفاً صفحه را دوباره باز کرده و عملیات را تکرار کنید.</p>'
           . '<p><a href="index.php">بازگشت به پنل</a></p></body></html>';
        exit;
    }
}

if (basename($_SERVER['PHP_SELF']) !== 'login.php' && basename($_SERVER['PHP_SELF']) !== 'logout.php') {
    requireAdmin();
}

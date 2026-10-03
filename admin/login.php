<?php
require_once __DIR__ . '/includes/db.php';
eplakStartSession('eplak_admin');

$message = '';
$messageType = 'error';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = trim($_POST['password'] ?? '');

    $stmt = $pdo->prepare('SELECT * FROM admin_users WHERE username = :username LIMIT 1');
    $stmt->execute([':username' => $username]);
    $admin = $stmt->fetch();

    if ($admin && password_verify($password, $admin['password_hash'])) {
        // جلوگیری از تثبیت نشست (Session Fixation) — شناسه پس از ورود نو می‌شود
        session_regenerate_id(true);
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_id'] = (int)$admin['id'];
        $_SESSION['admin_username'] = $admin['username'];
        $_SESSION['admin_role'] = $admin['role'];
        eplakRedirect('index.php');
        exit;
    }

    $message = '❌ نام کاربری یا رمز عبور اشتباه است.';
    $messageType = 'error';
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ورود به پنل مدیریت ای‌پلاک</title>
    <link rel="stylesheet" href="assets/style.css?v=9">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
    <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
    <style>
        /* ===== استایل‌های اختصاصی لاگین ===== */
        .login-box .brand {
            text-align: center;
            margin-bottom: 24px;
        }
        
        .login-box .brand-logo {
            display: inline-block;
            font-size: 48px;
            background: linear-gradient(135deg, #0f766e, #14b8a6);
            width: 80px;
            height: 80px;
            border-radius: 50%;
            line-height: 80px;
            text-align: center;
            box-shadow: 0 8px 30px rgba(15, 118, 110, 0.3);
            margin-bottom: 12px;
            color: white;
        }
        
        .login-box .brand-name {
            font-size: 28px;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
            letter-spacing: -0.5px;
        }
        
        .login-box .brand-sub {
            font-size: 14px;
            color: #94a3b8;
            margin: 4px 0 0 0;
        }
        
        .login-box .divider {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 20px 0 24px 0;
        }
        
        .login-box .divider::before,
        .login-box .divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: #e2e8f0;
        }
        
        .login-box .divider span {
            color: #94a3b8;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
        }
        
        .login-box .form-group {
            margin-bottom: 18px;
        }
        
        .login-box .form-group label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 6px;
        }
        
        .login-box .form-group label i {
            color: #0f766e;
            width: 18px;
        }
        
        .login-box .form-group .input-wrapper {
            position: relative;
        }
        
        .login-box .form-group .input-wrapper input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 15px;
            transition: all 0.3s ease;
            background: #f8fafc;
            color: #0f172a;
            font-family: inherit;
            padding-left: 48px;
            /* در راست‌به‌چپ متن از سمت راست شروع می‌شود؛
               این فضا مانع افتادن آیکون روی متن می‌شود */
            padding-right: 48px;
        }
        
        .login-box .form-group .input-wrapper input:focus {
            outline: none;
            border-color: #0f766e;
            background: #ffffff;
            box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
            transform: translateY(-1px);
        }
        
        .login-box .form-group .input-wrapper input::placeholder {
            color: #94a3b8;
            font-size: 14px;
        }
        
        .login-box .form-group .input-wrapper .input-icon {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 16px;
            pointer-events: none;
        }
        
        .login-box .form-group .input-wrapper .toggle-password {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 18px;
            padding: 4px;
            transition: 0.2s;
            z-index: 2;
        }
        
        .login-box .form-group .input-wrapper .toggle-password:hover {
            color: #0f766e;
        }
        
        .login-box .form-options {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 4px 0 20px 0;
        }
        
        .login-box .form-options .remember-me {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #64748b;
            cursor: pointer;
        }
        
        .login-box .form-options .remember-me input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #0f766e;
            cursor: pointer;
            margin: 0;
        }
        
        .login-box .form-options .forgot-link {
            color: #0f766e;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            transition: 0.2s;
        }
        
        .login-box .form-options .forgot-link:hover {
            color: #0d9488;
            text-decoration: underline;
        }
        
        .login-box .btn-login {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 12px;
            font-size: 17px;
            font-weight: 700;
            background: linear-gradient(135deg, #0f766e, #14b8a6);
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .login-box .btn-login::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
            transition: 0.5s;
        }
        
        .login-box .btn-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(15, 118, 110, 0.35);
        }
        
        .login-box .btn-login:hover::before {
            left: 100%;
        }
        
        .login-box .btn-login:active {
            transform: translateY(0);
            box-shadow: 0 4px 12px rgba(15, 118, 110, 0.25);
        }
        
        .login-box .btn-login i {
            font-size: 18px;
        }
        
        .login-box .footer-links {
            display: flex;
            justify-content: center;
            gap: 24px;
            margin-top: 20px;
            font-size: 13px;
        }
        
        .login-box .footer-links a {
            color: #94a3b8;
            text-decoration: none;
            transition: 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .login-box .footer-links a:hover {
            color: #0f766e;
        }
        
        .login-box .footer-links a i {
            font-size: 14px;
        }
        
        .login-box .version {
            text-align: center;
            margin-top: 16px;
            font-size: 12px;
            color: #cbd5e1;
        }
        
        /* ===== دارک مود لاگین ===== */
        /* ===== حالت شب — انتخاب دستی کاربر ===== */
        html[data-theme="dark"] .login-box .brand-name {
            color: #f1f5f9;
        }
        html[data-theme="dark"] .login-box .brand-sub {
            color: #94a3b8;
        }
        html[data-theme="dark"] .login-box .divider::before, html[data-theme="dark"] .login-box .divider::after {
            background: #334155;
        }
        html[data-theme="dark"] .login-box .form-group label {
            color: #cbd5e1;
        }
        html[data-theme="dark"] .login-box .form-group .input-wrapper input {
            background: #1e293b;
            border-color: #334155;
            color: #f1f5f9;
        }
        html[data-theme="dark"] .login-box .form-group .input-wrapper input:focus {
            background: #26324a;
            border-color: #0f766e;
            box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.2);
        }
        html[data-theme="dark"] .login-box .form-group .input-wrapper input::placeholder {
            color: #64748b;
        }
        html[data-theme="dark"] .login-box .form-options .remember-me {
            color: #94a3b8;
        }
        html[data-theme="dark"] .login-box .form-options .forgot-link {
            color: #34d399;
        }
        html[data-theme="dark"] .login-box .form-options .forgot-link:hover {
            color: #6ee7b7;
        }
        html[data-theme="dark"] .login-box .footer-links a {
            color: #64748b;
        }
        html[data-theme="dark"] .login-box .footer-links a:hover {
            color: #34d399;
        }

        /* ===== حالت شب — بر اساس تنظیم سیستم (اگر کاربر انتخاب نکرده باشد) ===== */
        @media (prefers-color-scheme: dark) {
            html:not([data-theme="light"]) .login-box .brand-name {
                color: #f1f5f9;
            }
            html:not([data-theme="light"]) .login-box .brand-sub {
                color: #94a3b8;
            }
            html:not([data-theme="light"]) .login-box .divider::before, html:not([data-theme="light"]) .login-box .divider::after {
                background: #334155;
            }
            html:not([data-theme="light"]) .login-box .form-group label {
                color: #cbd5e1;
            }
            html:not([data-theme="light"]) .login-box .form-group .input-wrapper input {
                background: #1e293b;
                border-color: #334155;
                color: #f1f5f9;
            }
            html:not([data-theme="light"]) .login-box .form-group .input-wrapper input:focus {
                background: #26324a;
                border-color: #0f766e;
                box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.2);
            }
            html:not([data-theme="light"]) .login-box .form-group .input-wrapper input::placeholder {
                color: #64748b;
            }
            html:not([data-theme="light"]) .login-box .form-options .remember-me {
                color: #94a3b8;
            }
            html:not([data-theme="light"]) .login-box .form-options .forgot-link {
                color: #34d399;
            }
            html:not([data-theme="light"]) .login-box .form-options .forgot-link:hover {
                color: #6ee7b7;
            }
            html:not([data-theme="light"]) .login-box .footer-links a {
                color: #64748b;
            }
            html:not([data-theme="light"]) .login-box .footer-links a:hover {
                color: #34d399;
            }
        }
        
        /* ===== ریسپانسیو ===== */
        @media (max-width: 480px) {
            .login-box .brand-logo {
                width: 60px;
                height: 60px;
                font-size: 36px;
                line-height: 60px;
            }
            
            .login-box .brand-name {
                font-size: 22px;
            }
            
            .login-box .form-options {
                flex-direction: column;
                gap: 12px;
                align-items: flex-start;
            }
            
            .login-box .footer-links {
                flex-direction: column;
                gap: 8px;
                align-items: center;
            }
        }
    </style>
</head>
<body>
    <div class="login-box">
        <!-- ===== برند ===== -->
        <div class="brand">
            <div class="brand-logo brand-logo-img">
                <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
                <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
            </div>
            <p class="brand-sub">سامانه مدیریت یکپارچه</p>
        </div>
        
        <div class="divider">
            <span>ورود به پنل مدیریت</span>
        </div>
        
        <?php if ($message): ?>
            <div class="alert <?= $messageType === 'success' ? 'success' : '' ?>">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>

        <form method="post" autocomplete="off">
            <!-- ===== نام کاربری ===== -->
            <div class="form-group">
                <label for="username">
                    <i class="fas fa-user"></i>
                    نام کاربری
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-user input-icon"></i>
                    <input 
                        type="text" 
                        id="username"
                        name="username" 
                        required 
                        placeholder="نام کاربری خود را وارد کنید"
                        value="<?= isset($_POST['username']) ? htmlspecialchars($_POST['username']) : '' ?>"
                        autofocus
                    >
                </div>
            </div>

            <!-- ===== رمز عبور ===== -->
            <div class="form-group">
                <label for="password">
                    <i class="fas fa-lock"></i>
                    رمز عبور
                </label>
                <div class="input-wrapper">
                    <i class="fas fa-key input-icon"></i>
                    <input 
                        type="password" 
                        id="password"
                        name="password" 
                        required 
                        placeholder="رمز عبور خود را وارد کنید"
                    >
                    <button 
                        type="button" 
                        class="toggle-password" 
                        onclick="togglePassword()"
                        aria-label="نمایش/مخفی کردن رمز"
                        title="نمایش/مخفی کردن رمز"
                    >
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>

            <!-- ===== گزینه‌ها ===== -->
            <div class="form-options">
                <label class="remember-me">
                    <input type="checkbox" name="remember" id="remember">
                    <span>مرا به خاطر بسپار</span>
                </label>
                <a href="#" class="forgot-link">
                    <i class="fas fa-question-circle"></i>
                    رمز عبور را فراموش کرده‌اید؟
                </a>
            </div>

            <!-- ===== دکمه ورود ===== -->
            <button type="submit" class="btn-login">
                <i class="fas fa-sign-in-alt"></i>
                ورود به پنل مدیریت
            </button>

            <!-- ===== لینک‌های پایین ===== -->
            <div class="footer-links">
                <a href="#">
                    <i class="fas fa-envelope"></i>
                    پشتیبانی
                </a>
                <a href="#">
                    <i class="fas fa-info-circle"></i>
                    راهنما
                </a>
            </div>
            
            <div class="version">
                نسخه ۲.۰.۱ | تمامی حقوق محفوظ است
            </div>
        </form>
    </div>

    <script>
        // ===== نمایش/مخفی کردن رمز عبور =====
        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const toggleBtn = document.querySelector('.toggle-password');
            const icon = toggleBtn.querySelector('i');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.className = 'fas fa-eye-slash';
                toggleBtn.setAttribute('aria-label', 'مخفی کردن رمز');
                toggleBtn.title = 'مخفی کردن رمز';
            } else {
                passwordInput.type = 'password';
                icon.className = 'fas fa-eye';
                toggleBtn.setAttribute('aria-label', 'نمایش رمز');
                toggleBtn.title = 'نمایش رمز';
            }
        }

        // ===== جلوگیری از ارسال مجدد فرم با دکمه refresh =====
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, null, window.location.href);
        }

        // ===== آیکون‌های FontAwesome بارگذاری شود =====
        document.addEventListener('DOMContentLoaded', function() {
            // اطمینان از بارگذاری FontAwesome
            if (typeof FontAwesome === 'undefined') {
                // اگر FontAwesome بارگذاری نشده، از ایموجی استفاده کن
                document.querySelectorAll('.brand-logo i').forEach(el => {
                    el.className = '';
                    el.textContent = '⚡';
                });
            }
        });
    </script>
</body>
</html>
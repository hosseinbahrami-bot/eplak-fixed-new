/* ============================================
   کلید حالت شب / روز — پنل مدیریت ای‌پلاک
   - انتخاب کاربر در localStorage ذخیره می‌شود
   - اگر کاربر انتخاب نکرده باشد، تنظیم سیستم ملاک است
   ============================================ */
(function () {
    var KEY = 'eplak_admin_theme';
    var root = document.documentElement;

    /* اعمال تم ذخیره‌شده در اولین فرصت (جلوگیری از پرش رنگ) */
    try {
        var saved = localStorage.getItem(KEY);
        if (saved === 'dark' || saved === 'light') {
            root.setAttribute('data-theme', saved);
        }
    } catch (e) { /* localStorage در دسترس نیست */ }

    function activeTheme() {
        var t = root.getAttribute('data-theme');
        if (t === 'dark' || t === 'light') return t;
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }

    function hasFontAwesome() {
        var spans = document.createElement('span');
        spans.className = 'fas';
        spans.style.cssText = 'position:absolute;visibility:hidden;font-family:"Font Awesome 6 Free"';
        document.body.appendChild(spans);
        var ok = getComputedStyle(spans, null).fontFamily.indexOf('Font Awesome') > -1;
        document.body.removeChild(spans);
        return ok;
    }

    function paint(btn) {
        var dark = activeTheme() === 'dark';
        var icon = hasFontAwesome()
            ? (dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>')
            : (dark ? '☀️' : '🌙');
        /* فقط آیکون — نوشتهٔ «حالت شب / حالت روز» حذف شد */
        btn.innerHTML = icon;
        btn.setAttribute('title', dark ? 'تغییر به حالت روز' : 'تغییر به حالت شب');
        btn.setAttribute('aria-label', dark ? 'تغییر به حالت روز' : 'تغییر به حالت شب');
    }

    function createToggle() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';

        btn.addEventListener('click', function () {
            var next = activeTheme() === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem(KEY, next); } catch (e) {}
            paint(btn);
        });

        var topbar = document.querySelector('.topbar');
        var loginBox = document.querySelector('.login-box');
        if (topbar) {
            topbar.appendChild(btn);
        } else if (loginBox) {
            /* صفحه ورود: کلید درون کارت و در گوشه آن جای می‌گیرد (بدون تداخل) */
            btn.className = 'theme-toggle theme-toggle-inbox';
            loginBox.insertBefore(btn, loginBox.firstChild);
        } else {
            btn.className = 'theme-toggle theme-toggle-fixed';
            document.body.appendChild(btn);
        }
        paint(btn);

        /* اگر تنظیم سیستم تغییر کرد و کاربر انتخاب دستی ندارد */
        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-color-scheme: dark)');
            var onChange = function () {
                if (!localStorage.getItem(KEY)) paint(btn);
            };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createToggle);
    } else {
        createToggle();
    }

    /* بارگذاری پالس زنده اعلان‌ها و هماهنگی بلادرنگ گزارش‌ها و کاربران */
    try {
        var pulseScript = document.createElement('script');
        pulseScript.src = 'assets/live-pulse.js?v=2';
        pulseScript.defer = true;
        document.head.appendChild(pulseScript);
    } catch (e) {}

    /* افزودن دکمه دسترسی سریع به اپلیکیشن شهروندی در سایدبار و نوار بالا */
    function injectCitizenAppButtons() {
        var nav = document.querySelector('.sidebar nav');
        if (nav && !document.getElementById('navLinkCitizenApp')) {
            var appLink = document.createElement('a');
            appLink.id = 'navLinkCitizenApp';
            appLink.href = '/';
            appLink.target = '_blank';
            appLink.innerHTML = '<i class="fas fa-mobile-alt"></i> <span>اپلیکیشن شهروندی</span>';
            appLink.style.cssText = 'color:#00c9a7;font-weight:700;background:rgba(0,201,167,0.12);margin-bottom:8px;border-radius:10px;border:1px solid rgba(0,201,167,0.3);';
            nav.insertBefore(appLink, nav.firstChild);
        }

        var topbar = document.querySelector('.topbar');
        if (topbar && !document.getElementById('topbarBtnCitizenApp')) {
            var rightBox = document.createElement('div');
            rightBox.id = 'topbarBtnCitizenApp';
            rightBox.style.cssText = 'margin-right:auto;display:flex;align-items:center;gap:10px;';
            rightBox.innerHTML = '<a href="/" target="_blank" style="background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;padding:6px 14px;border-radius:10px;font-size:12.5px;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(15,118,110,0.3);"><i class="fas fa-mobile-screen"></i> مشاهده اپلیکیشن شهروندی</a>';
            topbar.appendChild(rightBox);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCitizenAppButtons);
    } else {
        injectCitizenAppButtons();
    }
})();

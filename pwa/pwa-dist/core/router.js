/* core/router.js — مدیریت نمایش صفحات (showScreen)، تاریخچه ناوبری (History)، دکمه بازگشت (Back) و تم */

(function () {
  'use strict';

  /* =========================================================
     Screen Navigation & History Stack
  ========================================================= */
  window.appHistory = window.appHistory || [];

  let isNavigatingBack = false;
  let lastBackPressTime = 0;

  function getCurrentActiveScreenId() {
    const activeEl = document.querySelector('.screen.active');
    if (activeEl && activeEl.id) return activeEl.id;
    if (window.appHistory && window.appHistory.length > 0) {
      return window.appHistory[window.appHistory.length - 1];
    }
    return 'screen-home';
  }

  /* ایجاد سد تاریخچه برای صفحه‌ی ریشه تا زدن بازگشت در مرورگر بلافاصله خارج نشود */
  function ensureRootBarrier(rootId) {
    try {
      if (window.history && window.history.pushState) {
        window.history.pushState({ screenId: rootId, isBarrier: true }, '', '#' + rootId);
      }
    } catch (e) {}
  }

  function initHistory() {
    const activeEl = document.querySelector('.screen.active');
    const initialId = activeEl && activeEl.id ? activeEl.id : 'screen-home';

    if (!window.appHistory || window.appHistory.length === 0) {
      window.appHistory = [initialId];
    }

    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ screenId: initialId, isRoot: true }, '', '#' + initialId);
        if (initialId === 'screen-home' || initialId === 'screen-login') {
          ensureRootBarrier(initialId);
        }
      }
    } catch (e) {}
  }

  /* نمایش صفحه با ثبت دقیق در پشته تاریخچه */
  function showScreen(id, options) {
    if (!id) return;
    const currentId = getCurrentActiveScreenId();
    const opts = options || {};
    const skipHistory = !!opts.skipHistory;
    const replace = !!opts.replace;

    // اگر دقیقاً روی همان صفحه هستیم و اجباری نیست، کاری نکن
    if (id === currentId && !opts.force) {
      return;
    }

    // به‌روزرسانی پشته تاریخچه
    if (!skipHistory) {
      if (id === 'screen-home') {
        // بازگشت مستقیم به خانه (مثلاً کلیک روی تب خانه در منوی پایین)
        if (replace || currentId === 'screen-otp' || currentId === 'screen-login') {
          window.appHistory = ['screen-home'];
        } else {
          // اگر قبلاً خانه نبوده، خانه را اضافه کن ولی تاریخچه قبل را به خانه محدود کن
          if (window.appHistory[window.appHistory.length - 1] !== 'screen-home') {
            window.appHistory.push('screen-home');
          }
        }
      } else if (id === 'screen-login') {
        window.appHistory = ['screen-login'];
      } else if (replace) {
        if (window.appHistory.length > 0) {
          window.appHistory[window.appHistory.length - 1] = id;
        } else {
          window.appHistory = [id];
        }
      } else {
        // از اضافه شدن تکراری پشت‌سرهم جلوگیری کن
        if (window.appHistory.length === 0 || window.appHistory[window.appHistory.length - 1] !== id) {
          window.appHistory.push(id);
        }
      }

      // همگام‌سازی با window.history مرورگر
      try {
        if (window.history) {
          if (replace) {
            window.history.replaceState({ screenId: id, stackLen: window.appHistory.length }, '', '#' + id);
          } else {
            window.history.pushState({ screenId: id, stackLen: window.appHistory.length }, '', '#' + id);
          }
        }
      } catch (e) {}
    }

    // تغییر کلاس active در DOM
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (!target) return;
    target.classList.add('active');

    // اسکرول به ابتدای صفحه
    try {
      target.scrollTop = 0;
      const sc = target.querySelector('.screen-content');
      if (sc) sc.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch (e) {}

    onScreenShow(id);

    /* اطلاع به ماژول‌ها که کدام صفحه باز شد (مثلاً برای ساخت نقشه‌ی موقعیت
       فقط وقتی همان صفحه دیده می‌شود، تا اینترنت/داده هدر نرود). */
    try {
      window.dispatchEvent(new CustomEvent('eplak-screen-shown', { detail: { id: id } }));
    } catch (e) {}
  }

  function onScreenShow(id) {
    /* اگر از پیشخوان خارج شدیم، تایمر ساعت را متوقف کن */
    if (id !== 'screen-dashboard' && typeof _dashClockTimer !== 'undefined' && _dashClockTimer) {
      clearInterval(_dashClockTimer);
      _dashClockTimer = null;
    }
    switch (id) {
      case 'screen-home':
        break;
      case 'screen-profile':
        if (typeof renderProfileReportsSummary === 'function') renderProfileReportsSummary();
        if (typeof renderProfileTrackingQuick === 'function') renderProfileTrackingQuick();
        if (typeof syncProfileSoundToggle === 'function') syncProfileSoundToggle();
        break;
      case 'screen-reports':
        if (typeof renderReportsList === 'function') renderReportsList('all');
        if (typeof renderUserTicketsList === 'function') renderUserTicketsList();
        break;
      case 'screen-services':
        if (typeof renderServices === 'function') renderServices();
        break;
      case 'screen-ticket-success':
      case 'screen-report-success':
        if (window.soundManager && typeof window.soundManager.playDing === 'function') {
          window.soundManager.playDing();
        }
        break;
      case 'screen-otp':
        setTimeout(function () {
          var firstBox = document.querySelector('#screen-otp .otp-box');
          if (firstBox) {
            firstBox.focus();
            if (typeof firstBox.select === 'function') firstBox.select();
          }
        }, 200);
        break;
      case 'screen-dashboard':
        if (typeof renderDashboard === 'function') renderDashboard();
        if (window.Weather3D && typeof window.Weather3D.onScreenShow === 'function') window.Weather3D.onScreenShow();
        break;
      case 'screen-track':
        if (typeof renderTrackRecent === 'function') renderTrackRecent();
        break;
      case 'screen-news':
        if (typeof renderNewsList === 'function') renderNewsList();
        break;
      case 'screen-payment':
        if (typeof renderPaymentList === 'function') renderPaymentList();
        break;
      case 'screen-map':
        if (typeof renderMapPlaces === 'function') renderMapPlaces();
        break;
      case 'screen-notifications':
        if (typeof renderNotifications === 'function') renderNotifications();
        break;
      case 'screen-favorites':
        if (typeof renderFavorites === 'function') renderFavorites();
        break;
      case 'screen-profile-edit':
        if (typeof fillEditProfileForm === 'function') {
          fillEditProfileForm();
        } else if (typeof userProfile !== 'undefined' && userProfile && userProfile.name) {
          const editInp = document.getElementById('editNameInput');
          if (editInp) editInp.value = userProfile.name;
        }
        break;
    }
    if (window.i18n && typeof window.i18n.applyCurrentLanguage === 'function') {
      try { window.i18n.applyCurrentLanguage(target); } catch (e) {}
    }
  }

  /* =========================================================
     هندلینگ دقیق دکمه بازگشت (Back)
     ۱. بررسی منوهای باز
     ۲. اول از روی history می‌خواند و صفحات را برمی‌گردد
     ۳. در مرحله آخر به خانه می‌رود
     ۴. روی خانه با دو بار زدن سریع خارج می‌شود
  ========================================================= */
  function handleAppBack(fromPopState) {
    // ۰. اگر گالری عکس/فیلم (نمایش تمام‌صفحه) باز است، همان بسته شود
    const mediaViewer = document.getElementById('reportMediaViewer');
    if (mediaViewer && mediaViewer.classList.contains('open')) {
      if (typeof window.closeReportMedia === 'function') {
        window.closeReportMedia();
      } else {
        mediaViewer.classList.remove('open');
      }
      if (fromPopState) {
        try { window.history.pushState({ screenId: getCurrentActiveScreenId() }, '', '#' + getCurrentActiveScreenId()); } catch (e) {}
      }
      return true;
    }

    // ۰-ب. کارت «مکان انتخاب‌شده» در «نقشه و اماکن شهری» باز است → اول همان بسته شود
    if (window.EplakCityMap && typeof window.EplakCityMap.handleBack === 'function') {
      let closedByCityMap = false;
      try { closedByCityMap = window.EplakCityMap.handleBack() === true; } catch (e) {}
      if (closedByCityMap) {
        if (fromPopState) {
          try { window.history.pushState({ screenId: getCurrentActiveScreenId() }, '', '#' + getCurrentActiveScreenId()); } catch (e) {}
        }
        return true;
      }
    }

    // ۱. اگر منوی باز داریم، آن را ببند
    const homePanel = document.getElementById('homeProfileActionsPanel');
    if (homePanel && (homePanel.style.display === 'block' || homePanel.classList.contains('active'))) {
      homePanel.style.display = 'none';
      homePanel.classList.remove('active');
      if (fromPopState) {
        try { window.history.pushState({ screenId: getCurrentActiveScreenId() }, '', '#' + getCurrentActiveScreenId()); } catch (e) {}
      }
      return true;
    }

    const profilePanel = document.getElementById('profileActionsPanel');
    if (profilePanel && (profilePanel.style.display === 'block' || profilePanel.classList.contains('active'))) {
      profilePanel.style.display = 'none';
      profilePanel.classList.remove('active');
      if (fromPopState) {
        try { window.history.pushState({ screenId: getCurrentActiveScreenId() }, '', '#' + getCurrentActiveScreenId()); } catch (e) {}
      }
      return true;
    }

    const currentId = getCurrentActiveScreenId();

    // ۲. بررسی پشته تاریخچه: اول از روی history بخواند
    if (window.appHistory && window.appHistory.length > 1) {
      // صفحه فعلی را بردار
      window.appHistory.pop();
      // صفحه قبلی
      const targetId = window.appHistory[window.appHistory.length - 1];

      isNavigatingBack = true;
      showScreen(targetId, { skipHistory: true });
      isNavigatingBack = false;

      // همگام‌سازی تاریخچه مرورگر
      if (!fromPopState) {
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState({ screenId: targetId }, '', '#' + targetId);
          }
        } catch (e) {}
      }

      return true;
    }

    // ۳. اگر پشته خالی شده یا به یک مورد رسیده است (مرحله آخر):
    // در مرحله آخر خارج نشود؛ ابتدا بیاید به خانه
    if (currentId !== 'screen-home' && currentId !== 'screen-login') {
      window.appHistory = ['screen-home'];
      isNavigatingBack = true;
      showScreen('screen-home', { skipHistory: true });
      isNavigatingBack = false;

      try {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ screenId: 'screen-home' }, '', '#screen-home');
          ensureRootBarrier('screen-home');
        }
      } catch (e) {}

      return true;
    }

    // ۴. کاربر در صفحه خانه (یا لاگین) است:
    // با دوبار پشت‌سرهم زدن (فاصله کمتر از ۲ ثانیه) خارج شود
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      // اجرای خروج از اپلیکیشن
      if (window.AndroidApp && typeof window.AndroidApp.exitApp === 'function') {
        /* پیش از بسته شدن کامل، اطلاعات ورود از دستگاه پاک می‌شود تا دفعه‌ی
           بعد که برنامه باز شد، کاربر دوباره کد تایید بگیرد. */
        try {
          if (typeof window.prepareAppExit === 'function') window.prepareAppExit();
        } catch (e) {}
        window.AndroidApp.exitApp();
        return true;
      }
      showToast('خروج از برنامه...');
      setTimeout(() => {
        try { window.close(); } catch (e) {}
      }, 300);
      return false;
    } else {
      // اولین بار: پیام راهنما
      lastBackPressTime = now;
      showToast('برای خروج از برنامه، دوباره دکمه بازگشت را بزنید');

      if (fromPopState) {
        ensureRootBarrier(currentId);
      }
      return true;
    }
  }

  /* تابع استاندارد بازگشت برای دکمه‌های هدر (فلش‌های بازگشت) */
  function goBack() {
    return handleAppBack(false);
  }

  /* شنونده رویداد popstate برای دکمه بازگشت گوشی در مرورگرها و وب‌ویو */
  window.addEventListener('popstate', function (e) {
    if (isNavigatingBack) return;
    handleAppBack(true);
  });

  /* صادرسازی توابع سراسری روی window */
  window.showScreen = showScreen;
  window.handleAppBack = handleAppBack;
  window.goBack = goBack;
  window.getCurrentActiveScreenId = getCurrentActiveScreenId;

  /* راه‌اندازی پس از بارگذاری DOM */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHistory);
  } else {
    initHistory();
  }

  /* =========================================================
     Toast
  ========================================================= */
  function showToast(msg, options) {
    const opts = (typeof options === 'object' && options !== null) ? options : {};
    if (!opts.silentSound && window.soundManager && typeof window.soundManager.playNotification === 'function') {
      window.soundManager.playNotification();
    }
    if (window.i18n && typeof window.i18n.t === 'function') {
      try { msg = window.i18n.t(msg); } catch (e) {}
    }
    const toast = document.getElementById('globalToast');
    if (!toast) {
      console.log('Toast:', msg);
      return;
    }
    toast.textContent = msg;
    toast.classList.add('show');
    toast.style.display = 'block';
    toast.style.opacity = '1';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('show');
      toast.style.opacity = '0';
      setTimeout(() => {
        if (!toast.classList.contains('show')) {
          toast.style.display = 'none';
        }
      }, 300);
    }, 2200);
  }
  window.showToast = showToast;

  /* =========================================================
     THEME TOGGLE: day / night
  ========================================================= */
  let isDay = false;

  function applyTheme(day) {
    isDay = day;
    if (day) {
      document.documentElement.classList.add('day');
    } else {
      document.documentElement.classList.remove('day');
    }
    document.querySelectorAll('.theme-toggle button').forEach(btn => {
      const isSun = btn.dataset.theme === 'day' || btn.querySelector('.theme-sun-icon') || btn.textContent.trim() === '☀️';
      const isMoon = btn.dataset.theme === 'night' || btn.querySelector('.theme-moon-icon') || btn.textContent.trim() === '🌙';
      if (day && isSun) btn.classList.add('active');
      else if (day && isMoon) btn.classList.remove('active');
      else if (!day && isMoon) btn.classList.add('active');
      else if (!day && isSun) btn.classList.remove('active');
    });
    const profileToggle = document.getElementById('profileDarkToggle');
    if (profileToggle) profileToggle.classList.toggle('on', !day);
  }
  window.applyTheme = applyTheme;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-toggle button').forEach(btn => {
      btn.addEventListener('click', function () {
        const clickedSun = this.dataset.theme === 'day' || this.querySelector('.theme-sun-icon') || this.textContent.trim() === '☀️';
        if (window.soundManager && typeof window.soundManager.playTick === 'function') {
          window.soundManager.playTick();
        }
        applyTheme(clickedSun);
      });
    });

    const activeBtn = document.querySelector('.theme-toggle button.active');
    if (activeBtn) {
      applyTheme(activeBtn.dataset.theme === 'day' || activeBtn.querySelector('.theme-sun-icon') || activeBtn.textContent.trim() === '☀️');
    }

    // باز کردن منوها، سوئیچ تب‌های پایین و کلیک روی دکمه‌های ناوبری اصلی (صدای تپ نرم)
    document.addEventListener('click', function (e) {
      // اگر تب‌های پایین فشرده شد
      const navItem = e.target.closest('.nav-item');
      if (navItem) {
        if (window.soundManager && typeof window.soundManager.playTap === 'function') {
          window.soundManager.playTap();
        }
        return;
      }

      // دکمه‌های بازگشت
      const backBtn = e.target.closest('.app-back-btn, .back-btn, #reportDetailBackBtn');
      if (backBtn) {
        if (window.soundManager && typeof window.soundManager.playTap === 'function') {
          window.soundManager.playTap();
        }
        return;
      }

      // کارت‌ها، بنر تبلیغات و آیتم‌های منو و خدمات (بدون کلیدهای سوئیچ روز/شب یا صدا)
      const menuItem = e.target.closest('.menu-item, .service-card, .quick-action-card, .news-card, .service-detail-action-btn, .stat-card, .home-ad-banner');
      if (menuItem && !e.target.closest('.toggle-switch') && !e.target.closest('.theme-toggle')) {
        if (window.soundManager && typeof window.soundManager.playTap === 'function') {
          window.soundManager.playTap();
        }
      }
    });
  });

})();

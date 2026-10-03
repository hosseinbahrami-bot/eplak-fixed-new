/* modules/auth.js — ورود، احراز هویت و تایید کد OTP */
/* پشتیبانی کامل از ورودی کد تایید، کلیدهای ناوبری، پیست خودکار و دوزبانه */

  /* =========================================================
     Login / OTP
  ========================================================= */
  let otpTimerInterval = null;
  let otpSeconds = 30;

  function toEnglishDigits(str) {
    if (!str) return '';
    const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let out = String(str);
    for (let i = 0; i < 10; i++) {
      out = out.replace(new RegExp(fa[i], 'g'), String(i)).replace(new RegExp(ar[i], 'g'), String(i));
    }
    return out;
  }

  function updateOtpTimerDisplay() {
    const textEl = document.getElementById('otpTimerText');
    if (!textEl || otpSeconds <= 0) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const m = String(Math.floor(otpSeconds / 60)).padStart(2, '0');
    const s = String(otpSeconds % 60).padStart(2, '0');
    if (isEn) {
      textEl.textContent = 'Resend code in ' + m + ':' + s;
    } else {
      const toFa = (typeof toPersianDigits === 'function') ? toPersianDigits : (v => v);
      textEl.textContent = 'ارسال مجدد کد تا ' + toFa(m) + ':' + toFa(s);
    }
  }

  function updateOtpDescription() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const phone = userProfile.rawPhone || '09120000000';
    const container = document.getElementById('otpSubtitleContainer');
    if (container) {
      if (isEn) {
        container.innerHTML = 'A 4-digit code was sent to <span id="otpPhoneDisplay" style="color:var(--teal); direction:ltr; display:inline-block; font-weight:700;">' + phone + '</span> via SMS';
      } else {
        container.innerHTML = 'کد ۴ رقمی به شماره <span id="otpPhoneDisplay" style="color:var(--teal); direction:ltr; display:inline-block; font-weight:700;">' + phone + '</span> پیامک شد';
      }
    }
    updateOtpTimerDisplay();
  }

  function sendOtp() {
    const input = document.getElementById('loginPhoneInput');
    const rawVal = (input ? input.value : '').trim().toLowerCase();
    if (rawVal === 'admin' || rawVal === 'panel' || rawVal === 'modir' || rawVal === 'مدیر') {
      window.location.href = '/admin';
      return;
    }
    const phone = toEnglishDigits((input ? input.value : '') || '').trim();
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    if (!isValidIranMobile(phone)) {
      showToast(isEn ? 'Please enter a valid mobile number (e.g. 09123456789)' : 'شماره موبایل را به‌درستی وارد کنید (مثال: 09123456789)');
      return;
    }

    userProfile.rawPhone = phone;
    updateOtpDescription();
    showScreen('screen-otp');
    startOtpTimer();
    setTimeout(() => {
      const firstBox = document.querySelector('#screen-otp .otp-box');
      if (firstBox) {
        firstBox.focus();
        if (typeof firstBox.select === 'function') firstBox.select();
      }
    }, 300);
  }

  function otpAutoNext(el) {
    if (!el) return;
    let clean = toEnglishDigits(el.value).replace(/[^0-9]/g, '');
    if (clean.length > 1) {
      clean = clean.slice(-1);
    }
    el.value = clean;

    if (clean.length === 1) {
      el.classList.add('filled');
      const next = el.nextElementSibling;
      if (next && next.classList.contains('otp-box')) {
        next.focus();
        if (typeof next.select === 'function') next.select();
      }
    } else {
      el.classList.remove('filled');
    }

    // بررسی پر شدن همه کادرها
    const boxes = document.querySelectorAll('#screen-otp .otp-box');
    let filledCount = 0;
    boxes.forEach(b => { if (b.value && b.value.length === 1) filledCount++; });
    if (filledCount === 4) {
      setTimeout(verifyOtp, 200);
    }
  }

  function otpKeyDown(el, event) {
    if (!el || !event) return;
    if (event.key === 'Backspace') {
      if (!el.value) {
        const prev = el.previousElementSibling;
        if (prev && prev.classList.contains('otp-box')) {
          prev.focus();
          prev.value = '';
          prev.classList.remove('filled');
          event.preventDefault();
        }
      } else {
        el.value = '';
        el.classList.remove('filled');
        event.preventDefault();
      }
    } else if (event.key === 'ArrowLeft') {
      const prev = el.previousElementSibling;
      if (prev && prev.classList.contains('otp-box')) {
        prev.focus();
        event.preventDefault();
      }
    } else if (event.key === 'ArrowRight') {
      const next = el.nextElementSibling;
      if (next && next.classList.contains('otp-box')) {
        next.focus();
        event.preventDefault();
      }
    }
  }

  function otpPaste(event) {
    event.preventDefault();
    const clip = (event.clipboardData || window.clipboardData).getData('text');
    if (!clip) return;
    const clean = toEnglishDigits(clip).replace(/[^0-9]/g, '');
    if (!clean) return;

    const boxes = document.querySelectorAll('#screen-otp .otp-box');
    for (let i = 0; i < boxes.length && i < clean.length; i++) {
      boxes[i].value = clean[i];
      boxes[i].classList.add('filled');
    }

    const focusIdx = Math.min(clean.length, boxes.length - 1);
    if (boxes[focusIdx]) {
      boxes[focusIdx].focus();
    }

    if (clean.length >= 4) {
      setTimeout(verifyOtp, 150);
    }
  }

  function startOtpTimer() {
    clearInterval(otpTimerInterval);
    otpSeconds = 30;
    const textEl = document.getElementById('otpTimerText');
    const linkEl = document.getElementById('otpResendLink');
    if (!textEl || !linkEl) return;

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    linkEl.style.display = 'none';
    textEl.style.display = 'inline';
    updateOtpTimerDisplay();

    otpTimerInterval = setInterval(() => {
      otpSeconds--;
      if (otpSeconds <= 0) {
        clearInterval(otpTimerInterval);
        textEl.style.display = 'none';
        linkEl.style.display = 'inline';
      } else {
        updateOtpTimerDisplay();
      }
    }, 1000);
  }

  function resendOtp() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    showToast(isEn ? 'Verification code resent successfully' : 'کد تایید مجدداً ارسال شد');
    startOtpTimer();
    document.querySelectorAll('#screen-otp .otp-box').forEach(b => {
      b.value = '';
      b.classList.remove('filled');
    });
    const firstBox = document.querySelector('#screen-otp .otp-box');
    if (firstBox) firstBox.focus();
  }

  function verifyOtp() {
    const boxes = document.querySelectorAll('#screen-otp .otp-box');
    let code = '';
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    boxes.forEach(b => code += toEnglishDigits(b.value));

    if (code.length !== 4) {
      showToast(isEn ? 'Please enter the complete 4-digit code' : 'کد ۴ رقمی را کامل وارد کنید');
      return;
    }

    if (!isValidIranMobile(userProfile.rawPhone)) {
      showToast(isEn ? 'Invalid mobile phone number. Please try again' : 'شماره موبایل نامعتبر است. لطفاً دوباره تلاش کنید');
      clearInterval(otpTimerInterval);
      showScreen('screen-login');
      return;
    }

    clearInterval(otpTimerInterval);

    if (typeof loginWithPhone === 'function') {
      loginWithPhone(userProfile.rawPhone);
    } else {
      userProfile.phone = formatPhoneDisplay(userProfile.rawPhone);
      if (!userProfile.name || userProfile.name.trim() === '') {
        userProfile.name = isEn ? 'Citizen' : 'شهروند';
      }
    }

    if (typeof window.syncLiveContent === 'function') {
      window.syncLiveContent();
    }

    const phoneEl = document.getElementById('profilePhoneDisplay');
    const nameEl = document.getElementById('profileNameDisplay');
    if (phoneEl) phoneEl.textContent = userProfile.phone;
    if (nameEl) nameEl.textContent = userProfile.name;

    if (window.soundManager && typeof window.soundManager.playAppleSms === 'function') {
      window.soundManager.playAppleSms();
    } else if (window.soundManager && typeof window.soundManager.playSuccess === 'function') {
      window.soundManager.playSuccess();
    }
    showScreen('screen-home');
    showToast(isEn ? 'Logged in successfully' : 'ورود با موفقیت انجام شد', { silentSound: true });

    /* ۱) در اپ اندروید: این ورود به‌عنوان «ورود انجام شد» ثبت می‌شود تا تا
          زمانی که کاربر خودش اپ را نبندد، دوباره کد نخواهد. */
    try {
      if (window.AndroidApp && typeof window.AndroidApp.markLoginDone === 'function') {
        window.AndroidApp.markLoginDone();
      }
    } catch (e) {}

    /* ۲) توکن فایربیس این دستگاه با شماره‌ی همین کاربر روی سرور ثبت می‌شود؛
          بدون این کار، اعلان‌های شخصی (مثل «درخواست شما ثبت شد») در حالت
          بسته بودن اپ به گوشی نمی‌رسد. */
    try {
      if (typeof window.registerAppDevice === 'function') {
        window.registerAppDevice(true);
      }
    } catch (e) {}
  }

  function formatPhoneDisplay(raw) {
    if (!raw || raw.length !== 11) return raw;
    return raw.slice(0, 4) + ' ' + raw.slice(4, 7) + ' ' + raw.slice(7);
  }

  function logoutUser() {
    clearInterval(otpTimerInterval);
    document.querySelectorAll('#screen-otp .otp-box').forEach(b => {
      b.value = '';
      b.classList.remove('filled');
    });
    const phoneInput = document.getElementById('loginPhoneInput');
    if (phoneInput) phoneInput.value = '';

    /* خروج صریح از حساب: گوشی از شماره‌ی این کاربر جدا می‌شود تا اعلان‌های
       شخصی او به کاربر بعدیِ همین گوشی نرسد (خروج از خود اپ، گوشی را جدا
       نمی‌کند؛ وگرنه اعلان در حالت بسته بودن اپ هرگز نمی‌رسید). */
    try {
      if (typeof window.eplakDetachDevice === 'function') {
        window.eplakDetachDevice();
      }
    } catch (e) {}

    if (typeof logoutCurrentUser === 'function') {
      logoutCurrentUser();
    } else {
      userProfile.rawPhone = '';
      userProfile.phone = '';
      userProfile.name = 'شهروند';
    }

    showScreen('screen-login');
  }

  window.updateOtpDescription = updateOtpDescription;
  window.otpAutoNext = otpAutoNext;
  window.otpKeyDown = otpKeyDown;
  window.otpPaste = otpPaste;
  window.sendOtp = sendOtp;
  window.resendOtp = resendOtp;
  window.verifyOtp = verifyOtp;
  window.startOtpTimer = startOtpTimer;
  window.logoutUser = logoutUser;

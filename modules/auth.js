/* modules/auth.js — ورود، احراز هویت و تایید کد OTP */
/* پشتیبانی کامل از ورودی کد تایید، کلیدهای ناوبری، پیست خودکار و دوزبانه */

  /* =========================================================
     Login / OTP
  ========================================================= */
  let otpTimerInterval = null;
  let otpSeconds = 120;
  let otpChallengeId = '';
  let otpTestCode = '';
  let otpRequestPending = false;
  let otpVerifyPending = false;

  async function requestServerOtp(action, payload) {
    const base = (typeof window.eplakApiBase === 'function')
      ? window.eplakApiBase()
      : (window.EPLAK_API_BASE_URL || 'api').replace(/\/+$/, '');
    const response = await fetch(base + '/auth.php?action=' + encodeURIComponent(action), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('invalid_response');
    }
    if (!response.ok || !data || data.success !== true) {
      const requestError = new Error(data && data.error ? data.error : 'request_failed');
      requestError.status = response.status;
      throw requestError;
    }
    return data;
  }

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
      if (otpTestCode) {
        container.textContent = isEn
          ? 'Local test mode: use code ' + otpTestCode + '. No SMS was sent.'
          : 'حالت آزمایشی محلی: کد ' + otpTestCode + ' را وارد کنید؛ پیامکی ارسال نشده است.';
      } else if (isEn) {
        container.innerHTML = 'A 4-digit code was sent to <span id="otpPhoneDisplay" style="color:var(--teal); direction:ltr; display:inline-block; font-weight:700;">' + phone + '</span> via SMS';
      } else {
        container.innerHTML = 'کد ۴ رقمی به شماره <span id="otpPhoneDisplay" style="color:var(--teal); direction:ltr; display:inline-block; font-weight:700;">' + phone + '</span> پیامک شد';
      }
    }
    updateOtpTimerDisplay();
  }

  function setOtpVisualState(state) {
    const row = document.querySelector('#screen-otp .otp-inputs-row');
    if (!row) return;
    row.classList.remove('otp-valid', 'otp-invalid');
    if (state) row.classList.add('otp-' + state);
  }

  async function sendOtp() {
    if (otpRequestPending) return;
    const input = document.getElementById('loginPhoneInput');
    const rawVal = (input ? input.value : '').trim().toLowerCase();
    if (rawVal === 'admin' || rawVal === 'panel' || rawVal === 'modir' || rawVal === 'مدیر') {
      window.location.href = window.EPLAK_ADMIN_URL || 'admin';
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

    otpRequestPending = true;
    try {
      const result = await requestServerOtp('send', { phone: phone });
      otpChallengeId = result.challenge_id;
      otpTestCode = result.test_mode ? String(result.test_code || '') : '';
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
    } catch (error) {
      /* اگر سرور دلیلِ واقعی را فرستاده باشد (data.error) همان را نشان می‌دهیم.
         وقتی پاسخ اصلاً JSON نباشد (صفحه‌ی خطای HTML یا ۴۰۴) یعنی سایت روی آن
         هاست راه‌اندازی نشده — پس به‌جای پیامِ کلی، راه‌حل گفته می‌شود.
         (ریشه‌ی شکایت «هاست تازه گرفتم، می‌گوید ارسال کد تایید انجام نشد».) */
      const reason = String((error && error.message) || '');
      const serverSaid = reason !== '' && reason !== 'request_failed' && reason !== 'invalid_response';
      const message = isEn
        ? (serverSaid
          ? reason
          : 'The server did not return a valid response. If this is a new host, open setup.php at the site root to configure the database and SMS panel.')
        : (serverSaid
          ? reason
          : 'ارسال کد تایید انجام نشد: سرور پاسخ معتبر نداد. اگر هاست تازه است، نشانی «setup.php» در ریشه‌ی سایت را باز کنید تا دیتابیس و پنل پیامک تنظیم شود (راهنما: docs/NEW_HOST_FA.md).');
      showToast(message);
    } finally {
      otpRequestPending = false;
    }
  }

  function otpAutoNext(el) {
    if (!el) return;
    setOtpVisualState('');
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
      setOtpVisualState('');
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
    setOtpVisualState('');
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
    otpSeconds = 120;
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

  async function resendOtp() {
    if (otpRequestPending || !isValidIranMobile(userProfile.rawPhone)) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    otpRequestPending = true;
    try {
      const result = await requestServerOtp('send', { phone: userProfile.rawPhone });
      otpChallengeId = result.challenge_id;
      otpTestCode = result.test_mode ? String(result.test_code || '') : '';
      updateOtpDescription();
      startOtpTimer();
      document.querySelectorAll('#screen-otp .otp-box').forEach(b => {
        b.value = '';
        b.classList.remove('filled');
      });
      setOtpVisualState('');
      const firstBox = document.querySelector('#screen-otp .otp-box');
      if (firstBox) firstBox.focus();
      showToast(isEn ? 'Verification code sent' : 'کد تایید ارسال شد');
    } catch (error) {
      const message = isEn
        ? 'Could not resend the verification code. Please try again later.'
        : (error.message && error.message !== 'request_failed' && error.message !== 'invalid_response'
          ? error.message
          : 'ارسال مجدد کد انجام نشد؛ کمی بعد دوباره تلاش کنید.');
      showToast(message);
    } finally {
      otpRequestPending = false;
    }
  }

  async function verifyOtp() {
    if (otpVerifyPending) return;
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

    if (!otpChallengeId) {
      showToast(isEn ? 'Request a verification code first' : 'ابتدا کد تایید را درخواست کنید');
      return;
    }

    otpVerifyPending = true;
    try {
      await requestServerOtp('verify', { challenge_id: otpChallengeId, code: code });
    } catch (error) {
      if (error.status === 400) {
        setOtpVisualState('invalid');
        setTimeout(() => {
          const row = document.querySelector('#screen-otp .otp-inputs-row');
          if (!row || !row.classList.contains('otp-invalid')) return;
          boxes.forEach(box => {
            box.value = '';
            box.classList.remove('filled');
          });
          setOtpVisualState('');
          if (boxes[0]) boxes[0].focus();
        }, 1100);
      }
      const message = isEn
        ? (error.status === 410 || error.status === 429
          ? 'The code has expired or the attempt limit was reached. Request a new code.'
          : 'The verification code is incorrect. Please try again.')
        : (error.message && error.message !== 'request_failed' && error.message !== 'invalid_response'
          ? error.message
          : 'کد تایید اشتباه است یا منقضی شده؛ دوباره بررسی کنید.');
      if (error.status === 410 || error.status === 429) {
        otpChallengeId = '';
        const linkEl = document.getElementById('otpResendLink');
        const textEl = document.getElementById('otpTimerText');
        if (textEl) textEl.style.display = 'none';
        if (linkEl) linkEl.style.display = 'inline';
      }
      showToast(message);
      otpVerifyPending = false;
      return;
    }

    setOtpVisualState('valid');
    await new Promise(resolve => setTimeout(resolve, 450));
    clearInterval(otpTimerInterval);
    otpChallengeId = '';
    otpTestCode = '';
    otpVerifyPending = false;
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
    otpChallengeId = '';
    otpRequestPending = false;
    otpVerifyPending = false;
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

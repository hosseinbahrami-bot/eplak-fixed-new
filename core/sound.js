/* =========================================================
   core/sound.js — موتور افکت‌های صوتی و فیدبک لمسی (Web Audio API & Haptics)
   طراحی‌شده با پردازش فرکانسی کامپکت، مدرن و ۱۰۰٪ آفلاین
========================================================= */

(function () {
  'use strict';

  let audioCtx = null;
  let isSoundEnabled = true;

  // خواندن وضعیت اولیه از ذخیره‌سازی محلی
  try {
    const saved = localStorage.getItem('eplak_sound_enabled');
    if (saved !== null) {
      isSoundEnabled = (saved === 'true' || saved === '1');
    }
  } catch (e) {
    isSoundEnabled = true;
  }

  // آماده‌سازی AudioContext با رعایت کامل Autoplay Policy مرورگرها
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // آنلاک کردن خودکار زمینه صوتی با اولین تعامل کاربر (لمس، اشاره‌گر یا کلید)
  function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
      window.addEventListener(evt, unlockAudio, { once: true, passive: true });
    });
  }

  // ویبره هپتیک سبک برای دیوایس‌های دارای لرزاننده
  function triggerHaptic(pattern) {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern || 20);
      }
    } catch (e) {}
  }

  /* ---------------------------------------------------------
     ۱. صدای تیک ظریف (برای تغییر حالت شب و روز و کلیدهای سوئیچ)
  --------------------------------------------------------- */
  let lastTickTime = 0;
  function playTick() {
    if (!isSoundEnabled) return;
    const nowTs = Date.now();
    if (nowTs - lastTickTime < 60) return;
    lastTickTime = nowTs;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // ترنزینت فرکانس بالای کلیک (احساس فیزیکی و دقیق دکمه‌های iOS)
      const oscHigh = ctx.createOscillator();
      const gainHigh = ctx.createGain();
      oscHigh.type = 'sine';
      oscHigh.frequency.setValueAtTime(2100, now);
      oscHigh.frequency.exponentialRampToValueAtTime(550, now + 0.024);

      gainHigh.gain.setValueAtTime(0.15, now);
      gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      oscHigh.connect(gainHigh);
      gainHigh.connect(ctx.destination);

      oscHigh.start(now);
      oscHigh.stop(now + 0.025);

      // لایه دوم: ارتعاش کوتاه بدنه کلید
      const oscLow = ctx.createOscillator();
      const gainLow = ctx.createGain();
      oscLow.type = 'triangle';
      oscLow.frequency.setValueAtTime(260, now);
      oscLow.frequency.exponentialRampToValueAtTime(60, now + 0.030);

      gainLow.gain.setValueAtTime(0.08, now);
      gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.030);

      oscLow.connect(gainLow);
      gainLow.connect(ctx.destination);

      oscLow.start(now);
      oscLow.stop(now + 0.031);

      triggerHaptic(15);
    } catch (e) {
      console.warn('[sound] playTick error', e);
    }
  }

  /* ---------------------------------------------------------
     ۲. صدای نوتیفیکیشن / پیام‌های توست (چایم ملایم دو نوای مدرن)
  --------------------------------------------------------- */
  let lastNotifTime = 0;
  function playNotification() {
    if (!isSoundEnabled) return;
    const nowTs = Date.now();
    if (nowTs - lastNotifTime < 300) return;
    lastNotifTime = nowTs;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // نت اول: C6 (1046.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.12, now + 0.008);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.17);

      // نت دوم: G6 (1568 Hz) با تاخیر ۶۵ میلی‌ثانیه
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1568, now + 0.065);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.001, now + 0.065);
      gain2.gain.linearRampToValueAtTime(0.14, now + 0.075);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.065);
      osc2.stop(now + 0.29);

      triggerHaptic(20);
    } catch (e) {
      console.warn('[sound] playNotification error', e);
    }
  }

  /* ---------------------------------------------------------
     ۳. صدای تپ نرم برای باز کردن منوها یا جابجایی تب‌های پایین
  --------------------------------------------------------- */
  let lastTapTime = 0;
  function playTap() {
    if (!isSoundEnabled) return;
    const nowTs = Date.now();
    if (nowTs - lastTapTime < 60) return;
    lastTapTime = nowTs;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.032);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.033);

      triggerHaptic(12);
    } catch (e) {
      console.warn('[sound] playTap error', e);
    }
  }

  /* ---------------------------------------------------------
     ۴. صدای نمادین پیامک اپل / آیفون (Apple Tri-tone SMS Sound)
     ساخته‌شده بر اساس نت‌های ماریمبای اصیل آیفون: G#5 - B5 - E6
  --------------------------------------------------------- */
  let lastAppleSmsTime = 0;
  function playAppleSms() {
    if (!isSoundEnabled) return;
    const nowTs = Date.now();
    if (nowTs - lastAppleSmsTime < 500) return;
    lastAppleSmsTime = nowTs;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // ۳ نت جاودانه و معروف پیامک آیفون: G#5, B5, E6
      const notes = [
        { freq: 830.61, time: 0.00, dur: 0.15, gain: 0.28 },
        { freq: 987.77, time: 0.13, dur: 0.15, gain: 0.30 },
        { freq: 1318.51, time: 0.26, dur: 0.65, gain: 0.36 }
      ];

      notes.forEach(n => {
        const tStart = now + n.time;

        // ۱. نوت اصلی زنگوله‌ای ماریمبا (Fundamental pure tone)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, tStart);

        gain.gain.setValueAtTime(0.0001, tStart);
        gain.gain.linearRampToValueAtTime(n.gain, tStart + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, tStart + n.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tStart);
        osc.stop(tStart + n.dur + 0.01);

        // ۲. هارمونیک بلورین دوم (یک اکتاو بالاتر برای درخشش و جلای شیشه‌ای اپل)
        const oscHarm = ctx.createOscillator();
        const gainHarm = ctx.createGain();
        oscHarm.type = 'sine';
        oscHarm.frequency.setValueAtTime(n.freq * 2, tStart);

        gainHarm.gain.setValueAtTime(0.0001, tStart);
        gainHarm.gain.linearRampToValueAtTime(n.gain * 0.24, tStart + 0.003);
        gainHarm.gain.exponentialRampToValueAtTime(0.0001, tStart + Math.min(n.dur, 0.22));

        oscHarm.connect(gainHarm);
        gainHarm.connect(ctx.destination);
        oscHarm.start(tStart);
        oscHarm.stop(tStart + Math.min(n.dur, 0.22) + 0.01);

        // ۳. ترنزینت چکش چوبی ماریمبا (Transient mallet percussive strike)
        const oscMallet = ctx.createOscillator();
        const gainMallet = ctx.createGain();
        oscMallet.type = 'triangle';
        oscMallet.frequency.setValueAtTime(n.freq * 3.6, tStart);

        gainMallet.gain.setValueAtTime(0.0001, tStart);
        gainMallet.gain.linearRampToValueAtTime(n.gain * 0.16, tStart + 0.002);
        gainMallet.gain.exponentialRampToValueAtTime(0.0001, tStart + 0.016);

        oscMallet.connect(gainMallet);
        gainMallet.connect(ctx.destination);
        oscMallet.start(tStart);
        oscMallet.stop(tStart + 0.018);
      });

      // ویبره هپتیک دقیق هماهنگ با ریتم ۳ ضربه پیامک اپل
      triggerHaptic([30, 100, 30, 100, 50]);
    } catch (e) {
      console.warn('[sound] playAppleSms error', e);
    }
  }

  // مترادف برای موفقیت
  function playSuccess() {
    playAppleSms();
  }

  /* ---------------------------------------------------------
     ۵. صدای دینگ تایید ثبت گزارش + ویبره همزمان (Ding + Haptic)
     طراحی‌شده ویژه لحظه نمایش کد پیگیری (EP-1403-XXXX)
  --------------------------------------------------------- */
  let lastDingTime = 0;
  function playDing() {
    if (!isSoundEnabled) return;
    const nowTs = Date.now();
    if (nowTs - lastDingTime < 800) return;
    lastDingTime = nowTs;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // ۱. نت پایه کریستالی: E6 (1318.5 Hz)
      const oscMain = ctx.createOscillator();
      const gainMain = ctx.createGain();
      oscMain.type = 'sine';
      oscMain.frequency.setValueAtTime(1318.5, now);

      gainMain.gain.setValueAtTime(0.001, now);
      gainMain.gain.linearRampToValueAtTime(0.24, now + 0.004);
      gainMain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      oscMain.connect(gainMain);
      gainMain.connect(ctx.destination);
      oscMain.start(now);
      oscMain.stop(now + 0.76);

      // ۲. هارمونیک شفاف دوم: B6 (1975.5 Hz)
      const oscHarm = ctx.createOscillator();
      const gainHarm = ctx.createGain();
      oscHarm.type = 'sine';
      oscHarm.frequency.setValueAtTime(1975.5, now);

      gainHarm.gain.setValueAtTime(0.001, now);
      gainHarm.gain.linearRampToValueAtTime(0.09, now + 0.004);
      gainHarm.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      oscHarm.connect(gainHarm);
      gainHarm.connect(ctx.destination);
      oscHarm.start(now);
      oscHarm.stop(now + 0.56);

      // ۳. اکتاو تریبل بالا برای درخشش ناقوس: E7 (2637 Hz)
      const oscHigh = ctx.createOscillator();
      const gainHigh = ctx.createGain();
      oscHigh.type = 'triangle';
      oscHigh.frequency.setValueAtTime(2637, now);

      gainHigh.gain.setValueAtTime(0.001, now);
      gainHigh.gain.linearRampToValueAtTime(0.045, now + 0.003);
      gainHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

      oscHigh.connect(gainHigh);
      gainHigh.connect(ctx.destination);
      oscHigh.start(now);
      oscHigh.stop(now + 0.41);

      // ویبره تایید رسمی دو مرحله‌ای همزمان با دینگ
      triggerHaptic([45, 50, 60]);
    } catch (e) {
      console.warn('[sound] playDing error', e);
    }
  }

  // مدیریت روشن یا خاموش بودن صدا
  function isEnabled() {
    return isSoundEnabled;
  }

  function setEnabled(enabled) {
    isSoundEnabled = !!enabled;
    try {
      localStorage.setItem('eplak_sound_enabled', isSoundEnabled ? 'true' : 'false');
    } catch (e) {}
    if (isSoundEnabled) {
      playTick();
    }
    return isSoundEnabled;
  }

  function toggleSound() {
    return setEnabled(!isSoundEnabled);
  }

  // اکسپورت به عنوان آبجکت سراسری
  window.soundManager = {
    playTick,
    playNotification,
    playTap,
    playSuccess,
    playAppleSms,
    playDing,
    triggerHaptic,
    isEnabled,
    setEnabled,
    toggleSound
  };

})();

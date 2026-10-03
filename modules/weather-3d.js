/* ============================================================
   modules/weather-3d.js — آسمان زندهٔ آب‌وهوا (بازنویسی کامل)
   ─ صحنهٔ لایه‌لایه با انیمیشن سبک CSS (بدون Canvas):
     خورشید با پرتوهای چرخان / ماه با هاله / ستاره‌های چشمک‌زن
     ابرهای چندلایهٔ رونده / باران و برفِ ریزی / رعدوبرقِ لحظه‌ای / مه
   ─ دمای بزرگ + وضعیت + بیشینه/کمینه
   ─ نوار «ساعات آینده»: ۶ ساعت بعدی با آیکن و دما (Open-Meteo)
   ─ نوار شیشه‌ای پایین: احساس / رطوبت / باد / طلوع / غروب (واقعی)
   API قبلی حفظ شده: Weather3D.init(box, data) / update(data) / onScreenShow()
   ============================================================ */

(function () {
  'use strict';

  var weatherData = null;

  function isEnglish() {
    return (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
  }

  function fa(input) {
    if (isEnglish()) return String(input == null ? '' : input);
    var digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(input == null ? '' : input).replace(/[0-9]/g, function (d) { return digits[Number(d)]; });
  }

  /* ────────── حل وضعیت از دادهٔ آنلاین ────────── */
  function resolveState() {
    var isEn = isEnglish();
    var isDay = weatherData && typeof weatherData.isDay === 'boolean' ? weatherData.isDay : (new Date().getHours() >= 6 && new Date().getHours() < 19);
    var code = weatherData && typeof weatherData.code === 'number' ? weatherData.code : 2;

    var type = 'clear', label;
    if (code >= 95) { type = 'storm'; label = isEn ? 'Thunderstorm' : 'رعد و برق'; }
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { type = 'snow'; label = isEn ? 'Snowfall' : 'بارش برف'; }
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { type = 'rain'; label = isEn ? 'Rain' : 'باران'; }
    else if (code === 45 || code === 48) { type = 'fog'; label = isEn ? 'Foggy' : 'مه‌آلود'; }
    else if (code === 3) { type = 'cloudy'; label = isEn ? 'Overcast' : 'تمام ابری'; }
    else if (code === 1 || code === 2) { type = 'partly'; label = isEn ? 'Partly Cloudy' : 'کمی تا قسمتی ابری'; }
    else { type = 'clear'; label = isDay ? (isEn ? 'Sunny' : 'آفتابی') : (isEn ? 'Clear Night' : 'صاف و مهتابی'); }

    return {
      type: type, label: label, isDay: isDay,
      temp: weatherData && isFinite(weatherData.temp) ? Math.round(weatherData.temp) : null,
      feels: weatherData && isFinite(weatherData.feels) ? Math.round(weatherData.feels) : null,
      humidity: weatherData && isFinite(weatherData.humidity) ? Math.round(weatherData.humidity) : null,
      wind: weatherData && isFinite(weatherData.wind) ? Math.round(weatherData.wind) : null,
      max: weatherData && isFinite(weatherData.max) ? Math.round(weatherData.max) : null,
      min: weatherData && isFinite(weatherData.min) ? Math.round(weatherData.min) : null,
      sunrise: weatherData && weatherData.sunrise ? weatherData.sunrise : null,
      sunset: weatherData && weatherData.sunset ? weatherData.sunset : null,
      nextHours: weatherData && Array.isArray(weatherData.nextHours) ? weatherData.nextHours : []
    };
  }

  /* ────────── آیکن‌های مینی SVG برای نوار ساعتی ────────── */
  function miniIcon(code, hourStr) {
    var night = hourStr && (hourStr < '06:00' || hourStr >= '19:00');
    var cls = 'wx-mi';
    if (code >= 95) return '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M17 9a5 5 0 0 0-9.7-1.5A4 4 0 0 0 8 15h8a3.5 3.5 0 0 0 1-6z" fill="#9fb2c8"/><path d="M12 16l-2 4h2l-1.4 3.4L15 19h-2l1.4-3z" fill="#ffd54d"/></svg>';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M17 9a5 5 0 0 0-9.7-1.5A4 4 0 0 0 8 15h8a3.5 3.5 0 0 0 1-6z" fill="#b9c8da"/><g fill="#eaf3fc"><circle cx="9" cy="18" r="1.3"/><circle cx="13" cy="20" r="1.3"/><circle cx="16" cy="17.5" r="1.3"/></g></svg>';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M17 9a5 5 0 0 0-9.7-1.5A4 4 0 0 0 8 15h8a3.5 3.5 0 0 0 1-6z" fill="#93a7bf"/><g stroke="#6fc3e8" stroke-width="1.7" stroke-linecap="round"><line x1="9" y1="17" x2="8" y2="20.5"/><line x1="13" y1="17" x2="12" y2="20.5"/><line x1="17" y1="17" x2="16" y2="20.5"/></g></svg>';
    if (code === 45 || code === 48) return '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M17 10a5 5 0 0 0-9.7-1.5A4 4 0 0 0 8 16h8a3.5 3.5 0 0 0 1-6z" fill="#aab8c9"/><g stroke="#c6d2df" stroke-width="1.5" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="19"/><line x1="7" y1="21.5" x2="17" y2="21.5"/></g></svg>';
    if (code === 3) return '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M17 10a5 5 0 0 0-9.7-1.5A4 4 0 0 0 8 16h8a3.5 3.5 0 0 0 1-6z" fill="#9fb0c4"/></svg>';
    if (code === 1 || code === 2) return '<svg class="' + cls + '" viewBox="0 0 24 24">' + (night
      ? '<path d="M15.5 12.5a5.5 5.5 0 0 1-6.8-6.8 5.5 5.5 0 1 0 6.8 6.8z" fill="#cbd8e6"/>'
      : '<circle cx="10" cy="9" r="3.6" fill="#ffd54d"/><g stroke="#ffd54d" stroke-width="1.4" stroke-linecap="round"><line x1="10" y1="2.5" x2="10" y2="4.3"/><line x1="10" y1="13.7" x2="10" y2="15.5"/><line x1="3.5" y1="9" x2="5.3" y2="9"/><line x1="14.7" y1="9" x2="16.5" y2="9"/></g>')
      + '<path d="M17.5 11a4 4 0 0 0-7.8-1.2A3.2 3.2 0 0 0 10.5 16h6a3 3 0 0 0 1-5z" fill="#aebfd2"/></svg>';
    return night
      ? '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M16 12.8A6.2 6.2 0 0 1 8.7 5a6.5 6.5 0 1 0 7.3 7.8z" fill="#d7e2ef"/></svg>'
      : '<svg class="' + cls + '" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.4" fill="#ffd54d"/><g stroke="#ffd54d" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="3.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="20.5"/><line x1="3.5" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="20.5" y2="12"/><line x1="6" y1="6" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="18" y2="18"/><line x1="18" y1="6" x2="16.2" y2="7.8"/><line x1="7.8" y1="16.2" x2="6" y2="18"/></g></svg>';
  }

  /* ────────── صحنه ────────── */
  function sceneHtml(st) {
    var isEn = isEnglish();
    var skyCls = 'wx-sky wx-' + (st.isDay ? 'day' : 'night');
    if (st.type === 'storm' || st.type === 'rain') skyCls += ' wx-wet';
    if (st.type === 'snow') skyCls += ' wx-cold';
    if (st.type === 'fog') skyCls += ' wx-foggy';

    /* خورشید / ماه */
    var celestial = '';
    if (st.isDay && (st.type === 'clear' || st.type === 'partly')) {
      var rays = '';
      for (var i = 0; i < 12; i++) {
        rays += '<line x1="60" y1="14" x2="60" y2="26" transform="rotate(' + (i * 30) + ' 60 60)"/>';
      }
      celestial = '<div class="wx-sun">'
        + '<svg class="wx-sun-svg" viewBox="0 0 120 120">'
        + '<g class="wx-sun-rays" stroke="#ffd76a" stroke-width="4.2" stroke-linecap="round">' + rays + '</g>'
        + '<circle class="wx-sun-core" cx="60" cy="60" r="22" fill="url(#wxSunG)"/>'
        + '<defs><radialGradient id="wxSunG" cx="38%" cy="34%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.55" stop-color="#ffd54d"/><stop offset="1" stop-color="#ffb02e"/></radialGradient></defs>'
        + '</svg>'
        + '<div class="wx-sun-halo"></div></div>';
    } else if (!st.isDay && (st.type === 'clear' || st.type === 'partly')) {
      var stars = '';
      var STAR_XY = [[16, 18], [42, 10], [68, 22], [88, 12], [24, 34], [56, 38], [80, 42], [36, 52], [92, 60], [12, 58]];
      for (var s = 0; s < STAR_XY.length; s++) {
        stars += '<i class="wx-star" style="left:' + STAR_XY[s][0] + '%;top:' + STAR_XY[s][1] + '%;animation-delay:' + (s * 0.45).toFixed(2) + 's"></i>';
      }
      celestial = stars + '<div class="wx-moon"><div class="wx-moon-core"></div><div class="wx-moon-glow"></div></div>';
    }

    /* ابرها */
    var clouds = '';
    if (st.type === 'partly' || st.type === 'cloudy' || st.type === 'rain' || st.type === 'storm' || st.type === 'snow' || st.type === 'fog') {
      var heavy = st.type !== 'partly';
      clouds = '<div class="wx-cloud wx-c1' + (heavy ? ' heavy' : '') + '"></div>'
        + '<div class="wx-cloud wx-c2' + (heavy ? ' heavy' : '') + '"></div>'
        + (heavy ? '<div class="wx-cloud wx-c3 heavy"></div>' : '');
    }

    /* بارش‌ها */
    var precip = '';
    if (st.type === 'rain' || st.type === 'storm') {
      for (var r = 0; r < 26; r++) {
        precip += '<i class="wx-drop" style="left:' + (r * 3.9 + (r % 3)) + '%;animation-delay:' + ((r * 0.17) % 1.4).toFixed(2) + 's;animation-duration:' + (0.85 + (r % 5) * 0.09).toFixed(2) + 's"></i>';
      }
    } else if (st.type === 'snow') {
      for (var f = 0; f < 20; f++) {
        precip += '<i class="wx-flake" style="left:' + (f * 5.1 + (f % 4)) + '%;animation-delay:' + ((f * 0.31) % 2.2).toFixed(2) + 's;animation-duration:' + (4.2 + (f % 5) * 0.7).toFixed(1) + 's"></i>';
      }
    }

    var fogBands = st.type === 'fog' ? '<div class="wx-fog wx-f1"></div><div class="wx-fog wx-f2"></div>' : '';
    var flash = st.type === 'storm' ? '<div class="wx-flash"></div>' : '';

    /* نوار ساعات آینده */
    var hours = '';
    if (st.nextHours.length) {
      hours += '<div class="wx-hours"><span class="wx-hours-title">' + (isEn ? 'NEXT HOURS' : 'ساعات آینده') + '</span><div class="wx-hours-row">';
      st.nextHours.forEach(function (hh) {
        hours += '<div class="wx-hour">'
          + '<span class="wx-hour-t">' + fa(hh.h) + '</span>'
          + miniIcon(hh.code, hh.h)
          + '<span class="wx-hour-v">' + fa(Math.round(hh.temp)) + '°</span>'
          + '</div>';
      });
      hours += '</div></div>';
    }

    /* نوار شیشه‌ای پایین */
    var humUnit = isEn ? '%' : '٪';
    function barItem(lab, val) { return '<div class="wx-bar-item"><span class="wx-bar-l">' + lab + '</span><span class="wx-bar-v">' + val + '</span></div>'; }
    var bar = '<div class="wx-bar">'
      + barItem(isEn ? 'Feels' : 'احساس', st.feels != null ? fa(st.feels) + '°' : '--')
      + barItem(isEn ? 'Humidity' : 'رطوبت', st.humidity != null ? fa(st.humidity) + humUnit : '--')
      + barItem(isEn ? 'Wind' : 'باد', st.wind != null ? fa(st.wind) + ' <small>km/h</small>' : '--')
      + barItem(isEn ? 'Sunrise' : 'طلوع', st.sunrise ? fa(st.sunrise) : '--')
      + barItem(isEn ? 'Sunset' : 'غروب', st.sunset ? fa(st.sunset) : '--')
      + '</div>';

    /* لایهٔ آسمان داخل کارت است — اگر روی خود کارت بیفتد قانون absolute آن،
       کارت را از جریان صفحه خارج می‌کند و روی کارت‌های پایینی می‌ریزد (باگ قبلی) */
    return ''
      + '<div class="wx-card" id="wxCard">'
      +   '<div class="' + skyCls + '"></div>'
      +   celestial
      +   clouds
      +   precip
      +   fogBands
      +   flash
      +   '<div class="wx-hud">'
      +     '<div class="wx-city"><span class="wx-live-dot"></span>' + (isEn ? 'Varamin' : 'ورامین') + '</div>'
      +     '<div class="wx-temp">' + (st.temp != null ? fa(st.temp) : '--') + '<span class="wx-deg">°</span></div>'
      +     '<div class="wx-cond">' + st.label + '</div>'
      +     '<div class="wx-hilo">' + (isEn ? 'H' : 'ب') + ': ' + (st.max != null ? fa(st.max) : '--') + '° · ' + (isEn ? 'L' : 'ک') + ': ' + (st.min != null ? fa(st.min) : '--') + '°</div>'
      +   '</div>'
      +   hours
      +   bar
      + '</div>';
  }

  function render(box) {
    var st = resolveState();
    box.innerHTML = '<div class="wx-wrap">' + sceneHtml(st) + '</div>';
  }

  window.Weather3D = {
    init: function (containerEl, data) {
      if (!containerEl) return;
      weatherData = data || null;
      render(containerEl);
    },
    update: function (data) {
      weatherData = data || weatherData;
      var box = document.getElementById('weatherCardBody');
      if (box) render(box);
    },
    onScreenShow: function () {
      var box = document.getElementById('weatherCardBody');
      if (box && !box.querySelector('.wx-card') && weatherData) render(box);
    }
  };

})();

/**
 * Eplak Admin Real-time Live Pulse
 * دریافت لحظه‌ای کاربران جدید و گزارش‌های ثبت‌شده شهروندان
 */
(function () {
  'use strict';

  var lastReportId = null;
  var lastUserId = null;
  var isInitial = true;
  var audioCtx = null;

  /* اگر نشست از طریق URL منتقل می‌شود (حالی که کوکی پذیرفته نشده، مثل
     پیش‌نمایش جاسازی‌شده)، شناسه را به فراخوانی‌های fetch و پیوندها اضافه کن */
  function eplakSidPair() {
    try {
      var s = new URLSearchParams(window.location.search);
      var keys = ['eplak_admin', 'eplak_citizen', 'PHPSESSID'];
      for (var i = 0; i < keys.length; i++) {
        var sid = s.get(keys[i]);
        if (sid) { return keys[i] + '=' + encodeURIComponent(sid); }
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function eplakSidQuery() {
    var pair = eplakSidPair();
    return pair ? '&' + pair : '';
  }

  function eplakSidAppend(url) {
    var pair = eplakSidPair();
    if (!pair) { return url; }
    if (url.indexOf('eplak_admin=') !== -1 || url.indexOf('eplak_citizen=') !== -1 || url.indexOf('PHPSESSID=') !== -1) {
      return url;
    }
    return url + (url.indexOf('?') === -1 ? '?' : '&') + pair;
  }

  function playChime(kind) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      if (kind === 'report') {
        // High bright two-tone ding
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      } else {
        // Welcoming warm tone for new user
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
      }

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  function showAdminLiveToast(message, type, link) {
    var container = document.getElementById('eplakLiveToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'eplakLiveToastContainer';
      container.style.cssText = 'position:fixed;top:20px;left:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px;';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;background:rgba(20,30,45,0.96);color:#fff;border-radius:14px;padding:14px 18px;border:1.5px solid ' +
      (type === 'report' ? '#00c9a7' : '#3b82f6') +
      ';box-shadow:0 10px 30px rgba(0,0,0,0.45);display:flex;align-items:center;gap:12px;font-family:Vazirmatn,sans-serif;font-size:13.5px;direction:rtl;transform:translateY(-20px);opacity:0;transition:all 0.35s cubic-bezier(0.34,1.56,0.64,1);cursor:pointer;';

    var iconHtml = type === 'report'
      ? '<div style="width:36px;height:36px;border-radius:10px;background:rgba(0,201,167,0.2);color:#00c9a7;display:grid;place-items:center;font-size:18px;flex-shrink:0;">📋</div>'
      : '<div style="width:36px;height:36px;border-radius:10px;background:rgba(59,130,246,0.2);color:#60a5fa;display:grid;place-items:center;font-size:18px;flex-shrink:0;">👤</div>';

    toast.innerHTML = iconHtml + '<div style="flex:1;"><strong style="display:block;margin-bottom:2px;font-size:14px;">' +
      (type === 'report' ? 'ثبت گزارش جدید' : 'عضویت کاربر جدید') +
      '</strong><span>' + message + '</span></div>';

    if (link) {
      toast.onclick = function () {
        window.location.href = eplakSidAppend(link);
      };
    }

    container.appendChild(toast);
    requestAnimationFrame(function () {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    playChime(type);

    setTimeout(function () {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 6000);
  }

  function updateDomStats(data) {
    // Update live badge in sidebar or header
    var liveDot = document.getElementById('eplakLivePulseDot');
    if (!liveDot) {
      var headerLogo = document.querySelector('.logo, .brand, .topbar');
      if (headerLogo) {
        liveDot = document.createElement('span');
        liveDot.id = 'eplakLivePulseDot';
        liveDot.title = 'اتصال زنده به اپلیکیشن فعال است';
        liveDot.style.cssText = 'display:inline-block;width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981;margin-right:8px;vertical-align:middle;animation:eplakPulse 2s infinite;';
        headerLogo.appendChild(liveDot);
      }
    }
  }

  async function checkLivePulse() {
    try {
      var res = await fetch('api_live.php?t=' + Date.now() + eplakSidQuery(), { cache: 'no-store' });
      if (!res.ok) return;
      var data = await res.json();
      if (!data || !data.success) return;

      updateDomStats(data);

      var curReportId = data.latest_report ? parseInt(data.latest_report.id, 10) : 0;
      var curUserId = data.latest_user ? parseInt(data.latest_user.id, 10) : 0;

      if (isInitial) {
        lastReportId = curReportId;
        lastUserId = curUserId;
        isInitial = false;
        return;
      }

      // ── New Report Detection ──
      if (curReportId > lastReportId && data.latest_report) {
        lastReportId = curReportId;
        var r = data.latest_report;
        var msg = (r.title || 'گزارش جدید') + ' (تلفن: ' + (r.user_phone || '—') + ')';
        showAdminLiveToast(msg, 'report', 'report_detail.php?id=' + r.id);

        // Prepend to reports table if currently viewing reports or dashboard
        prependReportToTable(r);
      }

      // ── New User Registration Detection ──
      if (curUserId > lastUserId && data.latest_user) {
        lastUserId = curUserId;
        var u = data.latest_user;
        var uMsg = (u.name || 'شهروند جدید') + ' با شماره ' + u.phone;
        showAdminLiveToast(uMsg, 'user', 'user_reports.php?phone=' + encodeURIComponent(u.phone));

        // Prepend to users table if currently viewing users or dashboard
        prependUserToTable(u);
      }
    } catch (e) {
      // Ignore background fetch errors
    }
  }

  function prependReportToTable(r) {
    var tbody = document.querySelector('#reportsTable tbody, .reports-table tbody, .table-reports tbody');
    if (!tbody) {
      // Check dashboard table
      var tables = document.querySelectorAll('table tbody');
      if (tables.length > 0) tbody = tables[0];
    }
    if (!tbody) return;

    var tr = document.createElement('tr');
    tr.style.cssText = 'background:rgba(0,201,167,0.18);transition:background 2s ease;';
    tr.innerHTML = '<td><strong>#' + r.id + '</strong></td>' +
      '<td>' + (r.title || 'گزارش جدید') + '</td>' +
      '<td><span dir="ltr">' + (r.user_phone || '—') + '</span></td>' +
      '<td><span class="badge badge-warning" style="background:#f59e0b;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;">در انتظار</span></td>' +
      '<td>همین الان</td>' +
      '<td><a href="report_detail.php?id=' + r.id + '" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:12px;border-radius:6px;background:#0f766e;color:#fff;text-decoration:none;">مشاهده</a></td>';

    tbody.insertBefore(tr, tbody.firstChild);
    setTimeout(function () {
      tr.style.background = 'transparent';
    }, 3000);
  }

  function prependUserToTable(u) {
    var userTable = document.querySelector('#usersTable tbody, .users-table tbody');
    if (!userTable) {
      var allTables = document.querySelectorAll('table tbody');
      if (allTables.length > 1) userTable = allTables[1]; // Often 2nd table on dashboard
    }
    if (!userTable) return;

    var tr = document.createElement('tr');
    tr.style.cssText = 'background:rgba(59,130,246,0.18);transition:background 2s ease;';
    tr.innerHTML = '<td>' + (u.name || 'شهروند جدید') + '</td>' +
      '<td><span dir="ltr">' + u.phone + '</span></td>' +
      '<td>همین الان</td>';

    userTable.insertBefore(tr, userTable.firstChild);
    setTimeout(function () {
      tr.style.background = 'transparent';
    }, 3000);
  }

  // Inject Pulse CSS
  var style = document.createElement('style');
  style.textContent = '@keyframes eplakPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.25);} }';
  document.head.appendChild(style);

  // Start polling
  document.addEventListener('DOMContentLoaded', function () {
    checkLivePulse();
    setInterval(checkLivePulse, 3500);
  });
})();

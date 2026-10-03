/* modules/profile.js — پروفایل کاربر، تنظیمات و علاقه‌مندی‌ها */

  /* =========================================================
     Favorites (علاقه‌مندی‌ها)
  ========================================================= */
  /* آیکون خدمت از پک آیکون حرفه‌ای (یک‌دست با کل اپ) */
  function serviceIcon(icon, size) {
    if (window.EplakIcons && typeof window.EplakIcons.get === 'function') {
      return window.EplakIcons.get(icon || 'services', { size: size || 20 });
    }
    return icon || '';
  }

  function getServiceCatalog() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    return (isEn && window.allServices_EN) ? window.allServices_EN : (window.allServices || (typeof allServices !== 'undefined' ? allServices : []));
  }

  function renderFavorites() {
    const grid = document.getElementById('favoritesGridWrap');
    const empty = document.getElementById('favoritesEmptyState');
    if (!grid || !empty) return;

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const sourceServices = getServiceCatalog();
    const favs = sourceServices.filter(s => Array.isArray(favoriteIds) && favoriteIds.includes(s.id));

    if (favs.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'block';
    } else {
      grid.style.display = 'grid';
      empty.style.display = 'none';

      let cardsHtml = favs.map(s => {
        let clickAttr = '';
        if (s.serviceId && typeof openServiceDetail === 'function') {
          clickAttr = `openServiceDetail('${s.serviceId}')`;
        } else if (s.action === 'openMayorMeetingModal' && typeof openMayorMeetingModal === 'function') {
          clickAttr = `openMayorMeetingModal()`;
        } else if (s.screen) {
          clickAttr = `showScreen('${s.screen}')`;
        } else {
          clickAttr = `showScreen('screen-services')`;
        }

        return `
          <div class="service-card fav-card-item" style="position:relative; cursor:pointer;" onclick="${clickAttr}">
            <button type="button" class="fav-heart-btn" onclick="event.stopPropagation(); toggleFavorite('${s.id}')" aria-label="${isEn ? 'Remove from favorites' : 'حذف از علاقه‌مندی‌ها'}" title="${isEn ? 'Remove' : 'حذف'}">
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:15px;height:15px;">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; width:100%;">
              <div class="service-icon" style="background:${s.bg || 'rgba(0,201,167,0.15)'};">${serviceIcon(s.icon, 22)}</div>
              <div style="text-align:center; padding:0 4px;">
                <h3 style="font-size:13px; font-weight:800; margin-bottom:4px; line-height:1.3;">${escapeHtml(s.title)}</h3>
                <p style="font-size:11px; color:var(--text-muted); line-height:1.4;">${escapeHtml(s.sub)}</p>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // کارت تعاملی افزودن خدمت جدید در انتهای گرید
      cardsHtml += `
        <div class="service-card add-fav-trigger-card" onclick="openAddFavoritesModal()" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:2px dashed rgba(0,201,167,0.38); background:rgba(0,201,167,0.04); cursor:pointer; min-height:100px;">
          <div style="width:38px; height:38px; border-radius:50%; background:rgba(0,201,167,0.15); display:grid; place-items:center; color:var(--teal);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" style="width:18px;height:18px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <span style="font-size:12.5px; font-weight:800; color:var(--teal);">${isEn ? '+ Add Service' : '+ افزودن خدمت'}</span>
        </div>
      `;

      grid.innerHTML = cardsHtml;
    }
  }

  function toggleFavorite(id) {
    if (!Array.isArray(favoriteIds)) favoriteIds = [];
    const idx = favoriteIds.indexOf(id);
    let added = false;
    if (idx !== -1) {
      favoriteIds.splice(idx, 1);
      added = false;
    } else {
      favoriteIds.push(id);
      added = true;
    }

    if (typeof saveFavorites === 'function') saveFavorites();
    renderFavorites();

    if (window.soundManager && typeof window.soundManager.playTick === 'function') {
      window.soundManager.playTick();
    }

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    showToast(added
      ? (isEn ? 'Added to favorites' : 'به علاقه‌مندی‌ها افزوده شد')
      : (isEn ? 'Removed from favorites' : 'از علاقه‌مندی‌ها حذف شد')
    );

    updateModalItemState(id, added);
    return added;
  }

  function openAddFavoritesModal() {
    const modal = document.getElementById('addFavoritesModal');
    if (!modal) return;
    modal.classList.add('active');
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const confirmText = document.getElementById('favModalConfirmText');
    if (confirmText) {
      confirmText.textContent = isEn ? 'Confirm & Close' : 'تأیید و بستن';
    }
    const input = document.getElementById('favSearchInput');
    if (input) {
      input.value = '';
      setTimeout(function() { input.focus(); }, 250);
    }
    renderAddFavoritesList('');
  }

  function closeAddFavoritesModal(e) {
    if (e && e.target && e.target.closest && e.target.closest('.modal-sheet') && !e.target.closest('.modal-sheet-close') && !e.target.closest('.btn-teal') && !e.target.closest('.btn-primary')) {
      return;
    }
    const modal = document.getElementById('addFavoritesModal');
    if (!modal) return;
    modal.classList.remove('active');
    renderFavorites();
  }

  function renderAddFavoritesList(filterText) {
    const listWrap = document.getElementById('addFavoritesList');
    if (!listWrap) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const sourceServices = getServiceCatalog();
    const q = (filterText || '').trim().toLowerCase();

    const filtered = sourceServices.filter(s => {
      if (!q) return true;
      return (s.title && s.title.toLowerCase().includes(q)) ||
             (s.sub && s.sub.toLowerCase().includes(q)) ||
             (s.group && s.group.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      listWrap.innerHTML = `
        <div style="text-align:center; padding:32px 14px; color:var(--text-muted); font-size:13px; background:rgba(255,255,255,0.03); border-radius:14px;">
          ${isEn ? 'No services found matching your search' : 'هیچ خدمتی با این عبارت پیدا نشد'}
        </div>
      `;
      return;
    }

    listWrap.innerHTML = filtered.map(s => {
      const isFav = Array.isArray(favoriteIds) && favoriteIds.includes(s.id);
      return `
        <div class="fav-picker-item ${isFav ? 'is-fav' : ''}" data-service-id="${s.id}" onclick="toggleFavorite('${s.id}')">
          <div style="display:flex; align-items:center; gap:12px; min-width:0;">
            <div class="fav-picker-icon" style="background:${s.bg || 'rgba(0,201,167,0.15)'};">${serviceIcon(s.icon, 20)}</div>
            <div style="min-width:0;">
              <div class="fav-picker-title">${escapeHtml(s.title)}</div>
              <div class="fav-picker-sub">${escapeHtml(s.sub)}</div>
            </div>
          </div>
          <button type="button" class="fav-picker-toggle-btn ${isFav ? 'active' : ''}">
            ${isFav
              ? `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:800; font-size:11.5px; color:#f43f5e;"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:13px;height:13px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${isEn ? 'Saved' : 'نشان‌شده'}</span>`
              : `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:800; font-size:11.5px; color:var(--teal);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${isEn ? 'Add' : 'افزودن'}</span>`
            }
          </button>
        </div>
      `;
    }).join('');
  }

  function updateModalItemState(id, isFav) {
    const listWrap = document.getElementById('addFavoritesList');
    if (!listWrap) return;
    const item = listWrap.querySelector(`[data-service-id="${id}"]`);
    if (!item) return;

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    item.classList.toggle('is-fav', isFav);
    const btn = item.querySelector('.fav-picker-toggle-btn');
    if (btn) {
      btn.classList.toggle('active', isFav);
      btn.innerHTML = isFav
        ? `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:800; font-size:11.5px; color:#f43f5e;"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:13px;height:13px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${isEn ? 'Saved' : 'نشان‌شده'}</span>`
        : `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:800; font-size:11.5px; color:var(--teal);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${isEn ? 'Add' : 'افزودن'}</span>`;
    }
  }

  function filterAddFavoritesList(val) {
    renderAddFavoritesList(val);
  }

  window.renderFavorites = renderFavorites;
  window.toggleFavorite = toggleFavorite;
  window.openAddFavoritesModal = openAddFavoritesModal;
  window.closeAddFavoritesModal = closeAddFavoritesModal;
  window.filterAddFavoritesList = filterAddFavoritesList;
  window.renderAddFavoritesList = renderAddFavoritesList;


/* =========================================================
   Profile Settings
========================================================= */
  function toggleProfileDarkMode(el) {
    el.classList.toggle('on');
    if (window.soundManager && typeof window.soundManager.playTick === 'function') {
      window.soundManager.playTick();
    }
    applyTheme(!el.classList.contains('on'));
  }

  function toggleProfileSound(el) {
    if (!window.soundManager) return;
    const newState = window.soundManager.toggleSound();
    el.classList.toggle('on', newState);
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    showToast(newState
      ? (isEn ? 'Sound effects enabled' : 'افکت‌های صوتی فعال شد')
      : (isEn ? 'Sound effects disabled' : 'افکت‌های صوتی غیرفعال شد'));
  }

  function syncProfileSoundToggle() {
    const el = document.getElementById('profileSoundToggle');
    if (el && window.soundManager) {
      el.classList.toggle('on', window.soundManager.isEnabled());
    }
  }

  document.addEventListener('DOMContentLoaded', syncProfileSoundToggle);
  window.toggleProfileSound = toggleProfileSound;
  window.syncProfileSoundToggle = syncProfileSoundToggle;

  function toggleLanguage(el) {
    if (window.i18n && typeof window.i18n.toggleLanguage === 'function') {
      window.i18n.toggleLanguage();
      return;
    }
    const display = document.getElementById('langValueDisplay');
    const isFa = display ? display.textContent.trim() === 'فارسی' : true;
    if (display) display.textContent = isFa ? 'English' : 'فارسی';
    showToast(isFa ? 'Language changed to English' : 'زبان به فارسی تغییر یافت');
  }

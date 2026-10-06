/**
 * Eplak Luxury Icon Pack System (پک آیکون‌های مدرن، یکپارچه و لاکچری ای‌پلاک)
 * Pixel-perfect, duotone SVG vector icons tailored for mobile & web.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EplakIcons = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ICONS = {
    // ── Main Home & City Services ──
    'report': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity="0.16"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    'track': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" fill="currentColor" fill-opacity="0.16"/><line x1="21" y1="21" x2="16.2" y2="16.2"/><circle cx="11" cy="11" r="3" fill="currentColor" fill-opacity="0.32"/><path d="M11 5a6 6 0 0 1 6 6"/></svg>',
    'news': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h3l5 4V6L7 10H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2z" fill="currentColor" fill-opacity="0.18"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19 6a9 9 0 0 1 0 12"/><line x1="6" y1="14" x2="6" y2="19"/></svg>',
    'services': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" fill-opacity="0.22"/><rect x="14" y="3" width="7" height="7" rx="2" fill="currentColor" fill-opacity="0.12"/><rect x="14" y="14" width="7" height="7" rx="2" fill="currentColor" fill-opacity="0.22"/><rect x="3" y="14" width="7" height="7" rx="2" fill="currentColor" fill-opacity="0.12"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/></svg>',
    'map': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" fill="currentColor" fill-opacity="0.14"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>',
    'contact': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" fill="currentColor" fill-opacity="0.24"/></svg>',

    // ── Navigation Tabs ──
    'nav-home': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.16"/><path d="M9 22V12h6v10" fill="currentColor" fill-opacity="0.3"/></svg>',
    'nav-dashboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2" fill="currentColor" fill-opacity="0.25"/><rect x="14" y="3" width="7" height="5" rx="2" fill="currentColor" fill-opacity="0.14"/><rect x="14" y="12" width="7" height="9" rx="2" fill="currentColor" fill-opacity="0.25"/><rect x="3" y="16" width="7" height="5" rx="2" fill="currentColor" fill-opacity="0.14"/></svg>',
    'nav-services': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.2 4.6 4.8 1.8-4.8 1.8L12 15.3l-2.2-4.6L5 8.9l4.8-1.8z" fill="currentColor" fill-opacity="0.28"/><path d="M18.5 15l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" fill="currentColor" fill-opacity="0.2"/><path d="M5.5 14l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5L3.4 16.1l1.5-.6z" fill="currentColor" fill-opacity="0.2"/></svg>',
    'nav-reports': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" fill="currentColor" fill-opacity="0.14"/><rect x="9" y="3" width="6" height="4" rx="1.5" fill="currentColor" fill-opacity="0.28"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="7" cy="16" r="1" fill="currentColor"/></svg>',
    'nav-profile': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4" fill="currentColor" fill-opacity="0.26"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="currentColor" fill-opacity="0.16"/></svg>',

    // ── Profile Menu & Settings ──
    'user': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" fill="currentColor" fill-opacity="0.22"/><path d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6" fill="currentColor" fill-opacity="0.15"/></svg>',
    'my-reports': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity="0.16"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    'heart': '<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.28"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="currentColor" fill-opacity="0.12"/></svg>',
    'moon': '<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/><circle cx="18" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="2" r="0.75" fill="currentColor"/></svg>',
    'sound': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fill-opacity="0.25"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    'globe': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="currentColor" fill-opacity="0.14"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" fill="currentColor" fill-opacity="0.2"/></svg>',
    'logout': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',

    // ── Input & Auth ──
    'phone': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" fill="currentColor" fill-opacity="0.16"/><line x1="11" y1="18" x2="13" y2="18" stroke-width="2"/><line x1="10" y1="5" x2="14" y2="5"/></svg>',
    'lock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="currentColor" fill-opacity="0.18"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>',

    // ── پک حرفه‌ای: روند رسیدگی، پیوست‌ها، هوا، کیفیت هوا و آیکون‌های عمومی ──
    'file-plus': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity="0.14"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/></svg>',
    'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.14"/><polyline points="12 7 12 12 16 14"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
    'tools': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5a3.5 3.5 0 1 0 4 4L21 21H3l2.5-11.5a3.5 3.5 0 1 0 4-4z" fill="currentColor" fill-opacity="0.12"/><path d="M7.5 13l3 3 5-5"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.16"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>',
    'hourglass': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M8 2v4l4 6 4-6V2M8 22v-4l4-6 4 6v4" fill="currentColor" fill-opacity="0.12"/></svg>',
    'image': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" fill-opacity="0.14"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 18l4.5-4.5 3.5 3.5 3-2.5L20 18"/></svg>',
    'video': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="3" fill="currentColor" fill-opacity="0.14"/><path d="M16 11l6-3.5v9L16 13z" fill="currentColor" fill-opacity="0.26"/></svg>',
    'paperclip': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" fill="currentColor" fill-opacity="0.12"/></svg>',
    'edit': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" fill="currentColor" fill-opacity="0.18"/></svg>',
    'message': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" fill="currentColor" fill-opacity="0.14"/></svg>',
    'send': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z" fill="currentColor" fill-opacity="0.18"/></svg>',
    'search': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" fill="currentColor" fill-opacity="0.14"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    'flag': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5" fill="currentColor" fill-opacity="0.16"/></svg>',
    'user-check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4" fill="currentColor" fill-opacity="0.18"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><polyline points="16 11 18 13 22 9"/></svg>',
    'thermometer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z" fill="currentColor" fill-opacity="0.14"/><circle cx="12" cy="18" r="1.6" fill="currentColor"/></svg>',
    'fog': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9a3.5 3.5 0 1 0-3.2-4.9" fill="currentColor" fill-opacity="0.12"/><path d="M3 11h13a3.5 3.5 0 1 1-3.2 4.9" fill="currentColor" fill-opacity="0.12"/><line x1="2" y1="19" x2="14" y2="19"/><line x1="18" y1="19" x2="22" y2="19"/></svg>',
    'snowflake': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="3.3" y1="7" x2="20.7" y2="17"/><line x1="3.3" y1="17" x2="20.7" y2="7"/><path d="M12 6l2.2-2.2M12 6L9.8 3.8M12 18l2.2 2.2M12 18l-2.2 2.2"/></svg>',
    'smile': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.14"/><path d="M8.5 14.5s1.4 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><circle cx="9" cy="9.6" r="1.1" fill="currentColor"/><circle cx="15" cy="9.6" r="1.1" fill="currentColor"/></svg>',
    'meh': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.14"/><line x1="9" y1="15.5" x2="15" y2="15.5"/><circle cx="9" cy="9.6" r="1.1" fill="currentColor"/><circle cx="15" cy="9.6" r="1.1" fill="currentColor"/></svg>',
    'mask': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 0 1 16 0v3a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z" fill="currentColor" fill-opacity="0.14"/><path d="M9 12.5h6"/><path d="M8 9.5h8"/></svg>',
    'hazard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 16.5H2.5z" fill="currentColor" fill-opacity="0.14"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>',
    'bell-off': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-9.3-5" fill="currentColor" fill-opacity="0.12"/><path d="M6.3 6.3A6 6 0 0 0 6 8c0 6-3 7-3 7h13"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
    'wifi-off': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a16 16 0 0 1 6-3.5" fill="currentColor" fill-opacity="0.12"/><path d="M22 8.8a16 16 0 0 0-11-4.6"/><path d="M5.5 12.5A11 11 0 0 1 9 10.7"/><path d="M18.5 12.5a11 11 0 0 0-2.2-1.3"/><path d="M8.8 15.9a6 6 0 0 1 2-1"/><path d="M15.2 15.9a6 6 0 0 0-1.4-.9"/><circle cx="12" cy="19.5" r="1.1" fill="currentColor"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
    'printer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" fill="currentColor" fill-opacity="0.12"/><rect x="6" y="14" width="12" height="8" rx="1.5" fill="currentColor" fill-opacity="0.18"/></svg>',
    'handshake': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l2 2a2 2 0 0 0 2.8-2.8"/><path d="M14 14l2 2a2 2 0 0 0 2.8-2.8l-3.5-3.5" fill="currentColor" fill-opacity="0.12"/><path d="M2 12l4-4 4 4"/><path d="M22 12l-4-4-3 3" fill="currentColor" fill-opacity="0.12"/></svg>',
    'sparkle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" fill-opacity="0.18"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',

    // ── Dashboard Stat Cards ──
    'pending': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.17a3 3 0 0 0-.88-2.12L13.41 13a2 2 0 0 1 0-2.83l2.71-2.71A3 3 0 0 0 17 5.28V2M7 22v-4.17a3 3 0 0 1 .88-2.12L10.59 13a2 2 0 0 0 0-2.83L7.88 7.46A3 3 0 0 1 7 5.34V2" fill="currentColor" fill-opacity="0.18"/></svg>',
    'done': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fill-opacity="0.2"/><polyline points="9 12 11 14 15 10"/></svg>',
    'payment': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" fill-opacity="0.16"/><line x1="2" y1="10" x2="22" y2="10"/><rect x="5" y="13" width="4" height="3" rx="1" fill="currentColor" fill-opacity="0.38"/></svg>',
    'bell': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="currentColor" fill-opacity="0.18"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="4" r="2.5" fill="currentColor"/></svg>',

    // ── 6 Square Category Cards ──
    'finance': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 18h16M6 18V11M10 18V11M14 18V11M18 18V11M12 2L2 7v2h20V7L12 2z" fill="currentColor" fill-opacity="0.2"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/></svg>',
    'business': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3V9z" fill="currentColor" fill-opacity="0.22"/><path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>',
    'environment': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 6h6z" fill="currentColor"/><path d="M22 13l-3 4-2-1z" fill="currentColor"/><path d="M5 20l-1-4 3 1z" fill="currentColor"/><circle cx="12" cy="12" r="3.5" fill="currentColor" fill-opacity="0.28"/><path d="M7 18a8 8 0 0 1-1-9M12 4a8 8 0 0 1 8 5M19 15a8 8 0 0 1-7 5"/></svg>',
    'transport': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="14" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M4 10h16M8 14h.01M16 14h.01"/><path d="M6 17l-2 3M18 17l2 3"/><line x1="8" y1="3" x2="8" y2="10"/><line x1="16" y1="3" x2="16" y2="10"/></svg>',
    'tenders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 13l5-5-2-2-5 5" fill="currentColor" fill-opacity="0.28"/><path d="M7 21l6-6-3-3-6 6a1.5 1.5 0 0 0 0 2l1 1a1.5 1.5 0 0 0 2 0z" fill="currentColor" fill-opacity="0.18"/><line x1="16" y1="6" x2="20" y2="2"/><line x1="2" y1="22" x2="8" y2="22"/></svg>',
    'cemeteries': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c-4 0-7 3.5-7 8v11h14V10c0-4.5-3-8-7-8z" fill="currentColor" fill-opacity="0.18"/><path d="M12 7v8M8.5 10.5h7" stroke-linecap="round"/><path d="M5 21h14"/><circle cx="12" cy="7" r="1" fill="currentColor"/></svg>',

    // ── Sub-Services & Details ──
    'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" fill="currentColor" fill-opacity="0.16"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M10 22v-4h4v4"/></svg>',
    'waste': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="currentColor" fill-opacity="0.18"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    'car': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14v-5l-2-6H7L5 12v5z" fill="currentColor" fill-opacity="0.16"/><circle cx="7.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="17.5" r="2.5" fill="currentColor"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    'certificate': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6" fill="currentColor" fill-opacity="0.22"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>',
    'store': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18l-2 9H5L3 3z" fill="currentColor" fill-opacity="0.2"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>',
    'megaphone': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h4l5-4v10l-5-4H3z" fill="currentColor" fill-opacity="0.2"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>',
    'clipboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" fill="currentColor" fill-opacity="0.28"/></svg>',
    'basket': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-2 10H6L4 10z" fill="currentColor" fill-opacity="0.16"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>',
    'recycle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.81a2 2 0 0 1-1.73-3l1.1-1.9M12 5l2 3.5M7 19l1.5-2.5M16.9 14.9l1.1 1.9A2 2 0 0 1 16.27 20H13M12 5L9.9 8.6M12 5V2M19.19 13.8l.9-1.55a2 2 0 0 0-.27-2.45L18 8M7 19l-2-3.5"/></svg>',
    'leaf': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13a9 9 0 0 1 9-9 7 7 0 0 1 7 7 9 9 0 0 1-9 9z" fill="currentColor" fill-opacity="0.22"/><path d="M4 20l7-7"/></svg>',
    'bus': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="15" rx="3" fill="currentColor" fill-opacity="0.16"/><circle cx="7.5" cy="18" r="2"/><circle cx="16.5" cy="18" r="2"/><line x1="4" y1="11" x2="20" y2="11"/></svg>',
    'ticket': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3z" fill="currentColor" fill-opacity="0.16"/><line x1="12" y1="4" x2="12" y2="20" stroke-dasharray="2 2"/></svg>',
    'traffic': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="4" fill="currentColor" fill-opacity="0.16"/><circle cx="12" cy="7" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="17" r="2" fill="currentColor"/></svg>',
    'construction': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20M13 6l3 3M14.5 4.5l3 3M4 22V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v18" fill="currentColor" fill-opacity="0.15"/></svg>',
    'gavel': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 13l5-5-2-2-5 5" fill="currentColor" fill-opacity="0.28"/><path d="M7 21l6-6-3-3-6 6a1.5 1.5 0 0 0 0 2l1 1a1.5 1.5 0 0 0 2 0z"/></svg>',
    'trophy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M6 3h12v7a6 6 0 0 1-12 0V3z" fill="currentColor" fill-opacity="0.22"/><path d="M12 16v4M8 20h8"/></svg>',
    'tomb': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21h12M7 21V8a5 5 0 0 1 10 0v13" fill="currentColor" fill-opacity="0.18"/><line x1="12" y1="10" x2="12" y2="15"/><line x1="9.5" y1="12" x2="14.5" y2="12"/></svg>',
    'candle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="10" width="8" height="12" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M12 2c1 2 2 3 0 5-2-2-1-3 0-5z" fill="currentColor"/></svg>',
    'mic': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor" fill-opacity="0.24"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    'flower': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2a4 4 0 0 1 0 7 4 4 0 0 1 0-7zM12 15a4 4 0 0 1 0 7 4 4 0 0 1 0-7zM2 12a4 4 0 0 1 7 0 4 4 0 0 1-7 0zM15 12a4 4 0 0 1 7 0 4 4 0 0 1-7 0z" fill="currentColor" fill-opacity="0.2"/></svg>',

    // ── Generic & Settings ──
    'mail': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="currentColor" fill-opacity="0.16"/><polyline points="22,6 12,13 2,6"/></svg>',
    'pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="currentColor" fill-opacity="0.2"/><circle cx="12" cy="10" r="3" fill="currentColor"/></svg>',
    'file': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity="0.16"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    'info': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="currentColor" fill-opacity="0.16"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    'trash': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="currentColor" fill-opacity="0.16"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    'check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    'chevron-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    'chevron-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    // ── Additional Specialized Icons ──
    'shield': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fill-opacity="0.18"/></svg>',
    'camera': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" fill-opacity="0.16"/><circle cx="12" cy="13" r="4" fill="currentColor" fill-opacity="0.25"/></svg>',
    'package': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="currentColor" fill-opacity="0.16"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
    'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4" fill="currentColor" fill-opacity="0.2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'calendar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" fill-opacity="0.16"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg>',
    'money': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" fill="currentColor" fill-opacity="0.16"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.25"/><path d="M6 12h.01M18 12h.01"/></svg>',
    'gps': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>',
    'folder': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="currentColor" fill-opacity="0.18"/></svg>',
    'alert': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l10 18H2L12 2z" fill="currentColor" fill-opacity="0.18"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'home-building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.18"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'coffee': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" fill="currentColor" fill-opacity="0.16"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    'ruler': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="currentColor" fill-opacity="0.16"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
    'upload': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    'shower': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4" fill="currentColor" fill-opacity="0.16"/><path d="M9 10h6"/><path d="M12 10v6"/></svg>',
    'rose': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="5" fill="currentColor" fill-opacity="0.25"/><path d="M12 15v7M9 19c1.5-1 3-1 6 0"/></svg>',
    'stone': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14l3-8 10-2 4 6-2 9-11 2z" fill="currentColor" fill-opacity="0.2"/></svg>',
    // ── Weather & Atmospheric ──
    'sun': '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5" fill="#fbbf24" fill-opacity="0.25"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    'cloud-sun': '<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M17.5 7.5A4.5 4.5 0 0 0 13 4" stroke="#fbbf24"/><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#60a5fa" fill-opacity="0.2"/></svg>',
    'cloud': '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#94a3b8" fill-opacity="0.2"/></svg>',
    'cloud-rain': '<svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" fill="#38bdf8" fill-opacity="0.2"/><path d="M16 14v6M8 14v6M12 16v6"/></svg>',
    'cloud-snow': '<svg viewBox="0 0 24 24" fill="none" stroke="#a5f3fc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" fill="#a5f3fc" fill-opacity="0.2"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/></svg>',
    'cloud-lightning': '<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" stroke="#94a3b8"/><path d="m13 12-3 5h4l-3 5" fill="#eab308" fill-opacity="0.2"/></svg>',
    'sunrise': '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M4.93 10.93l1.41 1.41M20 18h2M2 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0" fill="#f59e0b" fill-opacity="0.2"/></svg>',
    'sunset': '<svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10V4M4.93 10.93l1.41 1.41M20 18h2M2 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0" fill="#f97316" fill-opacity="0.2"/></svg>',

  };

    /* ── نگاشت ایموجی → آیکون ──────────────────────────────────────────
     هر ایموجی‌ای که در اپ، پنل یا متن‌های ذخیره‌شده به کار رفته، اینجا به
     آیکون حرفه‌ای همان پک نگاشته می‌شود؛ پس هیچ ایموجی‌ای در رابط کاربری
     دیده نمی‌شود. کلیدهای تکراری حذف شده‌اند (تمیزکاری دور بیست‌ودوم).
     ───────────────────────────────────────────────────────────────── */
  var EMOJI_MAP = {
    /* ── روند رسیدگی، وضعیت‌ها و اعلان ── */
    '⏳': 'pending',
    '✅': 'done',
    '🔔': 'bell',
    '⏰': 'pending',
    '⋯': 'info',
    'ℹ️': 'info',
    '🛡️': 'shield',
    '🛡': 'shield',
    '🚨': 'alert',
    '🛑': 'alert',
    '⚠': 'alert',
    '🤢': 'alert',
    '🔕': 'bell-off',
    '📵': 'wifi-off',
    '📝': 'file-plus',
    '⌛': 'hourglass',
    '🕐': 'clock',
    '🔎': 'search',
    '🛠️': 'tools',
    '🛠': 'tools',
    '☑️': 'check-circle',
    '💬': 'message',
    '🗨️': 'message',
    '📣': 'megaphone',
    '🚩': 'flag',

    /* ── پیوست‌ها، رسانه و ویرایش ── */
    '🎙️': 'mic',
    '🖨️': 'file',
    '📄': 'file',
    '📚': 'file',
    '📷': 'camera',
    '📸': 'camera',
    '📂': 'folder',
    '📤': 'upload',
    '💾': 'file',
    '🎤': 'mic',
    '🖨': 'printer',
    '🎙': 'mic',
    '🎬': 'video',
    '🖼️': 'image',
    '📎': 'paperclip',
    '✏️': 'edit',
    '✂️': 'edit',
    '✒️': 'edit',

    /* ── خدمات شهری و اداری ── */
    '📢': 'news',
    '✨': 'services',
    '🗺️': 'map',
    '📱': 'phone',
    '💳': 'payment',
    '🏢': 'building',
    '🗑️': 'waste',
    '🚗': 'car',
    '🚘': 'car',
    '🛵': 'car',
    '📜': 'certificate',
    '🏪': 'business',
    '🛍️': 'store',
    '📍': 'pin',
    '⭐': 'trophy',
    '⚡': 'services',
    '🧺': 'basket',
    '🧶': 'basket',
    '🥬': 'leaf',
    '♻️': 'environment',
    '🌱': 'leaf',
    '🏬': 'store',
    '🌳': 'leaf',
    '⚖️': 'tenders',
    '🚌': 'bus',
    '🚇': 'transport',
    '🚦': 'traffic',
    '🏗️': 'construction',
    '🏛️': 'finance',
    '🏆': 'trophy',
    '🪦': 'tomb',
    '🕯️': 'candle',
    '🌿': 'flower',
    '🕊️': 'cemeteries',
    '📑': 'tenders',
    '🧾': 'certificate',
    '🧹': 'waste',
    '🎉': 'trophy',
    '🏥': 'building',
    '🚧': 'construction',
    '🔆': 'services',
    '💡': 'services',
    '📦': 'package',
    '👥': 'users',
    '📅': 'calendar',
    '💰': 'money',
    '📡': 'gps',
    '🌹': 'rose',
    '🪨': 'stone',
    '📲': 'phone',
    '🚑': 'transport',
    '🏛': 'building',
    '🕊': 'tomb',
    '♻': 'recycle',
    '🏷': 'payment',
    '🗺': 'map',
    '⚖': 'gavel',
    '🏗': 'construction',
    '🤝': 'handshake',
    '🛍': 'store',
    '📞': 'phone',
    '📰': 'news',
    '🚕': 'car',
    '👋': 'user-check',

    /* ── هوا، اقلیم و اوقات ── */
    '🌙': 'moon',
    '🔊': 'sound',
    '🌐': 'globe',
    '☀️': 'sun',
    '🌤️': 'cloud-sun',
    '⛅': 'cloud-sun',
    '☁️': 'cloud',
    '🌧️': 'cloud-rain',
    '🌦️': 'cloud-rain',
    '❄️': 'cloud-snow',
    '🌨️': 'cloud-snow',
    '⛈️': 'cloud-lightning',
    '🌫️': 'cloud',
    '🌅': 'sunrise',
    '🌄': 'sunrise',
    '🌇': 'sunset',
    '🌆': 'sunset',
    '☀': 'sun',
    '🌦': 'cloud-rain',
    '🌧': 'cloud-rain',
    '⛈': 'cloud-lightning',
    '🌤': 'cloud-sun',
    '☁': 'cloud',
    '🌨': 'cloud-snow',
    '❄': 'snowflake',
    '🌫': 'fog',
    '🌡': 'thermometer',

    /* ── کیفیت هوا (AQI) ── */
    '😊': 'smile',
    '🙂': 'smile',
    '😐': 'meh',
    '😷': 'mask',
    '☠️': 'hazard',
    '☠': 'hazard',

    /* ── ناوبری و عمومی ── */
    '📋': 'report',
    '🔍': 'track',
    '🎧': 'contact',
    '👤': 'user',
    '❤️': 'heart',
    '⚙️': 'settings',
    '🚪': 'logout',
    '🏷️': 'ticket',
    '🎯': 'track',
    '📊': 'nav-dashboard',
    '⚠️': 'report',
    '📈': 'nav-dashboard',
    '🎟️': 'ticket',
    '📥': 'report',
    '🔢': 'report',
    '🎁': 'heart',
    '🪧': 'ticket',
    '🔐': 'lock',
    '📧': 'mail',
    '🌡️': 'report',
    '🏡': 'home-building',
    '☕': 'coffee',
    '📐': 'ruler',
    '🚿': 'shower',
    '⛺': 'home-building',
    '🎫': 'ticket',
    '🔏': 'lock',
    '✕': 'trash',
    '🗑': 'trash',
    '🎟': 'ticket'
  };


  /**
   * Get an icon SVG string.
   * @param {string} nameOrEmoji - Name or Emoji
   * @param {object} [options] - Options { size, className, color }
   * @returns {string} SVG HTML
   */
  function get(nameOrEmoji, options) {
    if (!nameOrEmoji) return ICONS['report'];
    options = options || {};

    // If already an SVG, return it (or apply attributes if needed)
    if (typeof nameOrEmoji === 'string' && nameOrEmoji.indexOf('<svg') !== -1) {
      return nameOrEmoji;
    }

    var key = EMOJI_MAP[nameOrEmoji] || nameOrEmoji;
    var svg = ICONS[key] || ICONS['report'];

    var sizeAttr = options.size ? ' width="' + options.size + '" height="' + options.size + '"' : '';
    var classAttr = options.className ? ' class="' + options.className + '"' : '';
    var styleAttr = options.color ? ' style="color:' + options.color + '"' : '';
    if (sizeAttr || classAttr || styleAttr) {
      return svg.replace('<svg', '<svg' + sizeAttr + classAttr + styleAttr);
    }
    return svg;
  }

  /* ── پرکردن خودکار آیکون‌های داخل HTML ──────────────────────────────
     هرجا در HTML بنویسیم <span data-eplak-icon="ticket" data-icon-size="20"></span>
     آیکون حرفه‌ای همان پک جای‌گذاری می‌شود؛ پس دیگر لازم نیست در صفحه‌های
     ثابت، ایموجی بنویسیم و ظاهر کل اپ یک‌دست می‌ماند. */
  function hydrateIcons(root) {
    var doc = root || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.querySelectorAll) {
      return 0;
    }
    var nodes = doc.querySelectorAll('[data-eplak-icon]');
    var count = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.querySelector || el.querySelector('svg')) {
        continue;
      }
      var name = el.getAttribute('data-eplak-icon');
      var size = parseInt(el.getAttribute('data-icon-size') || '0', 10);
      el.innerHTML = get(name, size ? { size: size } : {});
      count++;
    }
    return count;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      hydrateIcons(document);
    });
  }

  return {
    get: get,
    icons: ICONS,
    emojiMap: EMOJI_MAP,
    hydrateIcons: hydrateIcons
  };
});

#!/usr/bin/env bash
# ============================================================================
#  ساخت بسته‌ی آپلود سایت:  tools/build-update-package.sh
#  ----------------------------------------------------------------------------
#  این اسکریپت از کد فعلی یک فایل zip می‌سازد که می‌توانید در هاست Extract کنید.
#  داخل بسته فقط «کد» است؛ این‌ها عمداً قرار نمی‌گیرند تا داده‌ی سایت پاک نشود:
#     data/  ·  uploads/  ·  shared/config.php  ·  .git/  ·  .github/ (فایل‌های CI)
#
#  اجرا:   bash tools/build-update-package.sh
#  خروجی:  eplak-fixed-update.zip  در ریشه‌ی پروژه
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="eplak-fixed-update.zip"

echo "→ ساخت $OUT از کد فعلی…"
rm -f "$OUT"

zip -q -r "$OUT" . \
  -x ".git/*" ".github/*" ".arena/*" "node_modules/*" \
     "android-app/*" "ios-app/*" "pwa-dist/*" "pwa-evidence/*" "backend/*" "views/*" "tools/*" \
     "data/*" "uploads/*" "test-fixtures/*" \
     "*.zip" ".gitignore" ".gitattributes" ".vscode/*" \
     "INSTALL_GUIDE_FA.md" "*/README.md" "docs/README.md" "docs/technical-architecture.md"

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "✅ آماده شد: $OUT  (${SIZE} ، ${COUNT} فایل)"
echo
echo "بررسی سریع محتوای بسته:"
# فهرست بسته یک‌بار خوانده می‌شود (pipefail + grep -q باعث خطای کاذب می‌شد)
LIST="$(unzip -Z1 "$OUT")"
has() { printf '%s\n' "$LIST" | grep -Fxq "$1"; }

for f in .htaccess index.html index.php sw.js manifest.json shared/bootstrap.php \
         shared/webpush.php shared/media.php shared/notification_reads.php shared/fcm.php \
         shared/notify_events.php shared/fa_datetime.php shared/tiles.php \
         api/_common.php api/ping.php api/push.php api/media.php api/tiles.php api/reports.php api/notifications.php \
         admin/settings.php admin/login.php admin/report_detail.php admin/notification_view.php \
         admin/version.php \
         assets/js/ep-map.js assets/js/ep-camera.js assets/js/icons.js \
         core/storage.js core/upload-progress.js core/router.js core/i18n.js core/state.js \
         modules/reports.js modules/live.js modules/auth.js modules/dashboard.js modules/online-guard.js \
         core/places-data.js core/places.js modules/city-map.js \
         api/places.php admin/places.php shared/places_store.php \
         docs/DEPLOY_UPDATE_FA.md docs/DEPLOY_UPDATE_EN.md docs/CITY_MAP_FA.md docs/CITY_MAP_EN.md \
         docs/REPORT_MEDIA_GPS_FA.md docs/REPORT_MEDIA_GPS_EN.md \
         docs/FIREBASE_SETUP_FA.md docs/FIREBASE_SETUP_EN.md; do
  if has "$f"; then echo "   ✅ $f"; else echo "   ❌ $f گم شده!"; exit 1; fi
done
for f in shared/config.php data/eplak.sqlite uploads/.htaccess; do
  if has "$f"; then echo "   ❌ $f نباید داخل بسته باشد!"; exit 1; fi
done
echo "   ✅ داده‌های کاربران و تنظیمات سرور داخل بسته نیستند"

# ابزار قدیمی rescue-db.php (بدون رمز؛ می‌توانست shared/config.php را بازنویسی کند)
# حذف شده و هرگز نباید دوباره وارد بسته شود. قاعده‌ی .htaccess هم باید داخل بسته باشد
# تا نسخه‌ی قدیمیِ باقی‌مانده روی هاست از وب بسته شود.
case "$LIST" in
  rescue-db.php*|*$'\n'rescue-db.php*|*/rescue-db.php*)
    echo "   ❌ rescue-db.php نباید داخل بسته باشد (ناامن و حذف‌شده)!"; exit 1 ;;
esac
HTACCESS="$(unzip -p "$OUT" .htaccess)"
case "$HTACCESS" in
  *'rescue-db\.php'*) ;;
  *) echo "   ❌ قاعده‌ی بستن rescue-db.php در .htaccess بسته نیست!"; exit 1 ;;
esac
echo "   ✅ ابزار ناامن rescue-db.php داخل بسته نیست و در .htaccess بسته شده است"

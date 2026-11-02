#!/usr/bin/env bash
# ============================================================================
#  ساخت بسته‌ی آپلود سایت:  tools/build-update-package.sh
#  ----------------------------------------------------------------------------
#  این اسکریپت از کد فعلی یک فایل zip می‌سازد که می‌توانید در هاست Extract کنید.
#  داخل بسته «کد» است + «پوشه‌های خالیِ نوشتنی»؛ این‌ها عمداً قرار نمی‌گیرند تا
#  داده‌ی سایت پاک نشود:
#     محتوای data/ و uploads/  ·  shared/config.php  ·  .git/  ·  .github/ (CI)
#     backend/ (دامپ‌های بزرگ دیتابیس با داده‌ی کاربران) — به‌جز دو اسکریپت کوچک
#     «ترمیم دستی دیتابیس» که برای هاست‌های بدون اجازه‌ی CREATE/ALTER لازم‌اند.
#  ولی خودِ پوشه‌های data/ و uploads/{reports,news,ads,tmp} با یک فایلِ نشانه و
#  نگهبانِ uploads/.htaccess داخل بسته‌اند: روی هاستِ تازه، «آپلود عکس گزارش» و
#  «دیتابیس SQLite» بیشتر به‌خاطرِ نبودِ خودِ پوشه شکست می‌خورد تا اجازه‌ی آن.
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

# اسکریپت‌های تعمیر دستی دیتابیس (کوچک و بدون داده‌ی کاربران): وقتی کاربر دیتابیس
# اجازه‌ی CREATE/ALTER ندارد، مدیر باید همان‌ها را یک‌بار در phpMyAdmin اجرا کند.
# پنل هم دقیقاً به همین مسیرها اشاره می‌کند، پس باید داخل بسته باشند.
for sql in backend/fix-notifications-db.sql backend/fix-news-db.sql; do
  if [ -f "$sql" ]; then zip -q "$OUT" "$sql"; fi
done

# پوشه‌های نوشتنی: بسته باید «خودِ پوشه‌ها» را ببرد، نه محتوایشان را.
# در zipِ بالا با -x کنار گذاشته شده‌اند (تا عکس/فیلمِ کاربران و دیتابیس هرگز
# وارد بسته نشوند) و این‌جا از روی «فایل‌های نشانه» (tools/package-stubs) در یک
# فضای موقت ساخته و با مسیرِ درست به بسته اضافه می‌شوند.
# چرا از فضای موقت و نه از خودِ uploads/؟ چون uploads/ و data/ داده‌ی زمانِ اجرا
# هستند (در گیت نیستند) و آزمون‌های backend/upload هم uploads/ را پاک می‌کنند؛
# بسته نباید به وضعیتِ لحظه‌ایِ آن پوشه‌ها وابسته باشد.
STUB_SRC="tools/package-stubs"
for f in "$STUB_SRC/uploads-htaccess" "$STUB_SRC/gitkeep"; do
  if [ ! -f "$f" ]; then
    echo "   ❌ $f در مخزن نیست! (بدون آن پوشه‌های نوشتنی داخل بسته نمی‌روند)"; exit 1
  fi
done
STUB="$(mktemp -d)"
trap 'rm -rf "$STUB"' EXIT
ABS_OUT="$(pwd)/$OUT"
mkdir -p "$STUB/uploads/reports" "$STUB/uploads/news" "$STUB/uploads/ads" "$STUB/uploads/tmp" "$STUB/data"
cp "$STUB_SRC/uploads-htaccess" "$STUB/uploads/.htaccess"
for d in reports news ads tmp; do cp "$STUB_SRC/gitkeep" "$STUB/uploads/$d/.gitkeep"; done
cp "$STUB_SRC/gitkeep" "$STUB/data/.gitkeep"
( cd "$STUB" && zip -q -r "$ABS_OUT" uploads data )
echo "   ✅ پوشه‌های نوشتنی (خالی) + نگهبانِ uploads/.htaccess به بسته اضافه شد"


SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "✅ آماده شد: $OUT  (${SIZE} ، ${COUNT} فایل)"
echo
echo "بررسی سریع محتوای بسته:"
# فهرست بسته یک‌بار خوانده می‌شود (pipefail + grep -q باعث خطای کاذب می‌شد)
LIST="$(unzip -Z1 "$OUT")"
has() { printf '%s\n' "$LIST" | grep -Fxq "$1"; }

for f in .htaccess index.html index.php setup.php sw.js manifest.json shared/bootstrap.php \
         shared/config.example.php docs/NEW_HOST_FA.md \
         shared/webpush.php shared/media.php shared/notification_reads.php shared/fcm.php \
         shared/notify_events.php shared/fa_datetime.php shared/payamak.php \
         shared/tiles.php shared/app_heartbeat.php \
         api/_common.php api/ping.php api/status.php api/push.php api/media.php api/tiles.php api/reports.php api/notifications.php \
         admin/settings.php admin/login.php admin/report_detail.php admin/notification_view.php \
         admin/version.php \
         assets/js/ep-map.js assets/js/ep-camera.js assets/js/icons.js \
         core/storage.js core/upload-progress.js core/router.js core/i18n.js core/state.js \
         modules/reports.js modules/live.js modules/auth.js modules/dashboard.js modules/online-guard.js \
         core/places-data.js core/places.js modules/city-map.js \
         api/places.php admin/places.php shared/places_store.php \
         admin/includes/acl.php admin/admins.php \
         shared/ads.php api/ads.php admin/ads.php modules/ads.js assets/css/ads.css \
         docs/DEPLOY_UPDATE_FA.md docs/DEPLOY_UPDATE_EN.md docs/CITY_MAP_FA.md docs/CITY_MAP_EN.md \
         docs/REPORT_MEDIA_GPS_FA.md docs/REPORT_MEDIA_GPS_EN.md \
         docs/FIREBASE_SETUP_FA.md docs/FIREBASE_SETUP_EN.md docs/NOTIFICATIONS_FA.md docs/NEWS_FA.md docs/JALALI_FA.md \
         docs/SMS_FA.md docs/ADMIN_ACCESS_FA.md docs/ADS_FA.md \
         backend/fix-notifications-db.sql backend/fix-news-db.sql; do
  if has "$f"; then echo "   ✅ $f"; else echo "   ❌ $f گم شده!"; exit 1; fi
done
# داده‌ی کاربران و تنظیماتِ سرور هرگز داخل بسته نمی‌رود (پاکشان کند داده می‌رود)
for f in shared/config.php data/eplak.sqlite; do
  if has "$f"; then echo "   ❌ $f نباید داخل بسته باشد!"; exit 1; fi
done
# ولی «پوشه‌های نوشتنی» و «نگهبانِ uploads» باید داخل بسته باشند: روی هاستِ تازه
# ریشه‌ی بیشترِ «عکسِ گزارش آپلود نشد» و «data نوشتنی نیست» همین بود که پوشه‌ها
# اصلاً وجود نداشتند (zip پوشه‌ی خالی نمی‌بُرد و گیت هم پوشه‌ی خالی نگه نمی‌دارد).
for f in uploads/.htaccess uploads/reports/.gitkeep uploads/news/.gitkeep \
         uploads/ads/.gitkeep uploads/tmp/.gitkeep data/.gitkeep; do
  if has "$f"; then echo "   ✅ $f (پوشه‌ی نوشتنی/نگهبانِ آپلود داخل بسته است)"; else
    echo "   ❌ $f باید داخل بسته باشد (بدون آن پوشه‌های نوشتنی روی هاست ساخته نمی‌شوند)!"; exit 1; fi
done
# «پوشه» می‌رود، «محتوا» نه: هیچ فایلِ آپلودیِ کاربران و هیچ دیتابیسی داخل بسته نیست
if printf '%s\n' "$LIST" | grep -Eq '^uploads/(reports|news|ads|tmp)/[0-9]{4}/'; then
  echo "   ❌ فایلِ آپلودیِ کاربران داخل بسته رفته است!"; exit 1
fi
if printf '%s\n' "$LIST" | grep -Eq '^data/[^/]+\.(sqlite|sqlite3|db|sqlite-journal)$'; then
  echo "   ❌ دیتابیسِ سایت داخل بسته است!"; exit 1
fi
echo "   ✅ داده‌های کاربران و تنظیمات سرور داخل بسته نیستند؛ پوشه‌های نوشتنی هستند"

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

# فایل‌های فقط-توسعه (روتِر پیش‌نمایش محلی و صفحه‌ی پیش‌نمایش) از مخزن حذف شده‌اند؛
# اگر روزی برگردند، نباید داخل بسته‌ی هاست بروند (روی دامنه‌ی عمومی خطرناک‌اند).
for f in router_admin.php preview-hub.html backend/package.json; do
  if has "$f"; then echo "   ❌ $f فایلِ فقط-توسعه است و نباید داخل بسته باشد!"; exit 1; fi
done
case "$HTACCESS" in
  *'router_admin\.php'*) ;;
  *) echo "   ❌ قاعده‌ی بستن router_admin.php در .htaccess بسته نیست!"; exit 1 ;;
esac
echo "   ✅ فایل‌های فقط-توسعه داخل بسته نیستند و در .htaccess بسته شده‌اند"

# «ارسال کد تایید انجام نشد» روی هاست تازه یعنی shared/config.php نیست؛ بسته باید
# راه‌انداز (setup.php)، نقطه‌ی تشخیص (api/status.php) و راهنمای هاست تازه را
# داشته باشد تا کاربر خودش بتواند درستش کند.
for f in setup.php api/status.php docs/NEW_HOST_FA.md; do
  if has "$f"; then echo "   ✅ $f (راه‌اندازی روی هاست تازه)"; else echo "   ❌ $f گم شده!"; exit 1; fi
done

# تنها ارائه‌دهنده‌ی پیامکِ بسته باید «ملی پیامک» باشد. آموت‌اس‌ام‌اس حذف شده و
# اگر روزی دوباره برگردد، روی هاست دو مسیرِ پیامک ساخته می‌شود که عیب‌یابی‌اش سخت است.
for smsFile in api/auth.php shared/payamak.php setup.php api/status.php; do
  if unzip -p "$OUT" "$smsFile" | grep -qi 'amoot'; then
    echo "   ❌ ارجاع به آموت‌اس‌ام‌اس در $smsFile هست (باید فقط ملی پیامک باشد)!"; exit 1
  fi
done
# نشانیِ سرویس یک‌جا در shared/payamak.php است (تابعِ eplakPayamakSendCode) چون
# «کد تایید» و «پیامک آزمایشیِ پنل» هر دو از همان یک مسیر می‌روند؛ api/auth.php
# باید همان تابع را صدا بزند و نه اینکه درخواستِ دومِ خودش را بسازد.
if unzip -p "$OUT" shared/payamak.php | grep -qF 'rest.payamak-panel.com/api/SendSMS/BaseServiceNumber'; then
  echo "   ✅ تنها ارائه‌دهنده‌ی پیامکِ بسته: ملی پیامک (نشانی یک‌جا در shared/payamak.php)"
else
  echo "   ❌ نشانی ملی پیامک در shared/payamak.php بسته نیست!"; exit 1
fi
if unzip -p "$OUT" api/auth.php | grep -qF 'eplakPayamakSendCode('; then
  echo "   ✅ «کد تایید» از همان تابعِ مشترکِ ارسال می‌رود"
else
  echo "   ❌ api/auth.php باید eplakPayamakSendCode() را صدا بزند!"; exit 1
fi
if unzip -p "$OUT" shared/payamak.php | grep -qF "'573639'"; then
  echo "   ✅ شناسه‌ی متنِ پیش‌فرض (573639) داخل بسته است"
else
  echo "   ❌ شناسه‌ی متنِ پیش‌فرض در shared/payamak.php بسته نیست!"; exit 1
fi
# کلیدِ درستِ وب‌سرویس «ApiKey» است نه رمزِ عبورِ پنل؛ ترجمه‌ی فارسیِ کدهای پاسخ
# (مثل -110) هم باید داخل بسته باشد تا دلیلِ «کد تایید نمی‌آید» در error_log دیده شود.
if unzip -p "$OUT" shared/payamak.php | grep -qF 'payamak_api_key' \
   && unzip -p "$OUT" shared/payamak.php | grep -qF 'eplakPayamakStatusText'; then
  echo "   ✅ کلید API + ترجمه‌ی فارسیِ کدهای پاسخِ پیامک داخل بسته است"
else
  echo "   ❌ پشتیبانیِ «کلید API» یا ترجمه‌ی کدهای پیامک در shared/payamak.php بسته نیست!"; exit 1
fi

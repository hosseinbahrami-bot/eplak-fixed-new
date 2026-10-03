#!/usr/bin/env bash
# ============================================================================
#  آزمون‌های خودکار پروژه — بدون نیاز به هاست یا Android Studio
#
#  اجرا:   bash tools/dev/run-regression.sh            (همه‌ی آزمون‌ها)
#          bash tools/dev/run-regression.sh fcm        (فقط آزمون فایربیس)
#          bash tools/dev/run-regression.sh syntax     (فقط بررسی نحوی)
#
#  چه چیزی آزمایش می‌شود؟
#    syntax     → همه‌ی فایل‌های PHP و JS از نظر نحوی سالم‌اند
#    notify     → «خوانده شدن» اعلان برای هر کاربر جدا، پنل درست نشان می‌دهد
#    app        → درخواست‌های اپ (خوانده‌شده، اعلان سیستمی، ثبت توکن فایربیس)
#    pushcrypto → رمزنگاری اعلان مرورگر و امضای VAPID
#    fcm        → موتور فایربیس (JWT، ارسال پیام، توکن باطل)
#    backend    → دیتابیس، بذرها، آپلود عکس، صفحات پنل
#    security   → ابزار ناامن rescue-db.php حذف شده و به مخزن/بسته‌ی آپلود برنمی‌گردد
#                 (و قاعده‌ی .htaccess نسخه‌ی قدیمیِ باقی‌مانده روی هاست را می‌بندد)
#    online     → اپ فقط آنلاین (پرده‌ی «بدون اینترنت»)، حذف اعلان، اعلان فوری
#                 پس از ثبت درخواست، و ورود دوباره با کد تایید پس از خروج از اپ
#    geo        → نقشه‌ی موقعیت (کاشی‌های OpenStreetMap)، GPS گوشی، انتخاب
#                 عکس/فیلم در اپ اندروید و ذخیره/نمایش مختصات در پنل ادمین
#    upload     → نمودار درصدی «هر فایل»، ارسال تکه‌تکه‌ی فیلم (قطع شبکه، فایروال،
#                 تکه‌ی تکراری، سقف تعداد تکه)، و ساخته نشدن زودهنگام گزارش
#    tiles      → کاشی‌های نقشه از سرور خودِ ای‌پلاک (پروکسی + کش) و جابه‌جایی
#                 خودکار منبع‌های نقشه در اپ
#    push       → «تغییر وضعیت/پاسخ در پنل ← اعلان روی گوشی کاربر»: ثبت گوشی با
#                 فرم ساده و JSON، سه مسیر پنل (جزئیات/تغییر سریع/ویرایش)، گوگلِ
#                 ساختگی، push_log، شکست‌ها (گوشی ثبت‌نشده، قطع بودن گوگل، توکن
#                 باطل، ۴۰۱) و تلاش مجدد/تست اعلان در لایه‌ی وب اپ
#    places     → «نقشه و اماکن شهری»: داده‌ی اماکن ورامین (مختصات، دسته‌ها)، جستجو،
#                 نشانگر/خوشه روی نقشه، و مسیریابی با «نشان» (Neshan) از موقعیت GPS
#                 کاربر در اپ اندروید، مرورگر اندروید، iOS و دسکتاپ (jsdom)
#    placesadmin → «اماکن شهری» از پنل ادمین: افزودن/اصلاح/پنهان/حذف (ورود، CSRF،
#                 اعتبارسنجی، XSS)، api/places.php، و رسیدن همان JSON به فهرست اپ
#    ios        → نسخه‌ی iOS (ios-app/): بسته‌ی وبِ داخل اپ همان مجموعه‌ی اندروید است و همه‌ی
#                 فایل‌های index.html را دارد، Info.plist/پروژه‌ی Xcode/سورس Swift، اسکریپت
#                 آزمون دودیِ شبیه‌ساز، ورک‌فلوهای CI، و نرفتن ios-app به بسته‌ی هاست
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEV="$HERE"
WORK="${EPLAK_VERIFY_DIR:-/tmp/eplak-dev-harness}"
TARGET="${1:-all}"

echo "پروژه: $ROOT"
echo "محیط آزمون: $WORK"
echo

mkdir -p "$WORK"
cd "$WORK"

# ── نصب ابزارهای لازم (یک‌بار) ─────────────────────────────────────────────
if [ ! -d node_modules/php-parser ] || [ ! -d node_modules/@php-wasm ]; then
  echo "→ نصب ابزارهای آزمون (php-parser و php-wasm)…"
  npm init -y >/dev/null 2>&1 || true
  npm install php-parser@3.7.0 @php-wasm/node --no-audit --no-fund >/dev/null 2>&1 || {
    echo "❌ نصب ابزارها ناموفق بود. اتصال اینترنت را بررسی کنید."; exit 1; }
fi

# jsdom فقط برای آزمون «نقشه و اماکن شهری» لازم است (DOM واقعی صفحه)
if [ ! -d node_modules/jsdom ]; then
  echo "→ نصب jsdom (برای آزمون نقشه و اماکن شهری)…"
  npm install jsdom@26.1.0 --no-audit --no-fund >/dev/null 2>&1 || {
    echo "❌ نصب jsdom ناموفق بود. اتصال اینترنت را بررسی کنید."; exit 1; }
fi

# yaml فقط برای آزمون «نسخه iOS و PWA» لازم است (سالم بودن فایل‌های .github/workflows)
if [ ! -d node_modules/yaml ]; then
  echo "→ نصب yaml (برای بررسی ورک‌فلوها)…"
  npm install yaml@2 --no-audit --no-fund >/dev/null 2>&1 || {
    echo "❌ نصب yaml ناموفق بود. اتصال اینترنت را بررسی کنید."; exit 1; }
fi

# اسکریپت‌ها داخل پوشه‌ی آزمون کپی می‌شوند تا node_modules همان‌جا پیدا شود
cp "$DEV/php-run.mjs" "$DEV/php-syntax.mjs" "$DEV/js-syntax.mjs" "$WORK/" 2>/dev/null || true
cp "$DEV/tests/"*.mjs "$WORK/" 2>/dev/null || true

export EPLAK_ROOT="$ROOT"
FAILED=0

run_step () {
  local name="$1"; shift
  printf '\n──────── %s ────────\n' "$name"
  "$@"
  local code=$?
  if [ $code -ne 0 ]; then FAILED=1; fi
  return 0
}

if [ "$TARGET" = "all" ] || [ "$TARGET" = "syntax" ]; then
  run_step "بررسی نحوی PHP" node "$WORK/php-syntax.mjs" "$ROOT"
  run_step "بررسی نحوی JS"  node "$WORK/js-syntax.mjs"  "$ROOT"
fi

for t in notify app pushcrypto fcm backend security online geo upload tiles push places placesadmin ios pwa; do
  if [ "$TARGET" = "all" ] || [ "$TARGET" = "$t" ]; then
    if [ -f "$WORK/$t.test.mjs" ]; then
      run_step "آزمون $t" node "$WORK/$t.test.mjs"
    fi
  fi
done

echo
if [ $FAILED -eq 0 ]; then
  echo "✅ همه‌ی آزمون‌ها موفق بودند."
else
  echo "❌ برخی آزمون‌ها ناموفق بودند (خروجی بالا را ببینید)."
fi
exit $FAILED

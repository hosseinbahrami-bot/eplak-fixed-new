#!/usr/bin/env bash
# ============================================================================
#  tools/build-pwa.sh — نسخه‌ی PWA مستقل (فقط فایل‌های ایستا)
#
#  PWA همان سایت است: وقتی بسته‌ی هاست (eplak-fixed-update.zip) را روی هاست Extract می‌کنید،
#  خودِ سایت (https://eplak.ir/eplak-fixed/) یک PWA کامل است (manifest.json + sw.js + آیکون‌ها).
#  این اسکریپت یک «بسته‌ی ایستای مستقل» می‌سازد برای وقتی که می‌خواهید همان PWA را روی یک
#  میزبان ایستا (GitHub Pages، Netlify، Cloudflare Pages، یک پوشه‌ی دیگر…) بگذارید:
#    • همان فایل‌های وب اپ اندروید/iOS + manifest.json + sw.js
#    • آدرس API روی سرور اصلی ای‌پلاک تنظیم می‌شود (چون این میزبان PHP ندارد)
#    • آدرس نسبیِ عکس/ویدیوی گزارش‌ها (uploads/…) هم به سرور اصلی می‌رود
#  هیچ فایلی از مخزن تغییر نمی‌کند؛ فقط کپیِ داخل پوشه‌ی خروجی اصلاح می‌شود.
#
#  ورک‌فلوی .github/workflows/pwa.yml همین پوشه را روی GitHub Pages می‌گذارد
#  (https://hosseinbahrami-bot.github.io/eplak-fixed/) — کاربر هیچ zipی دریافت نمی‌کند.
#  zip فقط وقتی ساخته می‌شود که خودتان آرگومان دوم را بدهید (برای میزبان دلخواه).
#
#  اجرا:   bash tools/build-pwa.sh [پوشه‌ی خروجی=pwa-dist] [فایل zip (اختیاری)]
#  آدرس API دیگر؟  EPLAK_PWA_API_BASE=https://example.ir/eplak-fixed/api bash tools/build-pwa.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
API_BASE="${EPLAK_PWA_API_BASE:-https://eplak.ir/eplak-fixed/api}"
OUT_DIR="${1:-pwa-dist}"
ZIP="${2:-}"
SITE_BASE="${API_BASE%/api}"

echo "→ ساخت PWA مستقل در $OUT_DIR (API: $API_BASE)"
rm -rf "$OUT_DIR"
[ -z "$ZIP" ] || rm -f "$ZIP"
mkdir -p "$OUT_DIR"

for item in index.html app.js manifest.json sw.js core modules views assets; do
  if [ -e "$item" ]; then
    cp -R "$item" "$OUT_DIR/$item"
  elif [ "$item" = "views" ]; then
    echo "ℹ️  $item در پروژه نیست؛ رد شد"
  else
    echo "❌ $item پیدا نشد"; exit 1
  fi
done
find "$OUT_DIR" -name '.DS_Store' -delete
: > "$OUT_DIR/.nojekyll"

python3 - "$OUT_DIR/index.html" "$API_BASE" "$SITE_BASE" <<'PYEOF'
import re, sys
path, api, site = sys.argv[1:4]
html = open(path, encoding='utf-8').read()

# ۱) آدرس API پیش از هر اسکریپت دیگر (core/storage.js مقدار را از همین‌جا می‌خواند)
cfg = "<script>window.EPLAK_API_BASE_URL='__API__';window.EPLAK_STATIC_PWA=true;</script>\n".replace('__API__', api)
html, n = re.subn(r'<head>\n', '<head>\n' + cfg.replace('\\', '\\\\'), html, count=1)
if n != 1:
    sys.exit('❌ تگ <head> در index.html پیدا نشد')

# ۲) آدرس نسبیِ پیوست‌ها (uploads/…) → سرور اصلی؛ بعد از core/storage.js که تابع اصلی را می‌سازد
media = r"""<script>/* PWA مستقل: پیوست‌های گزارش (uploads/…) روی سرور اصلی‌اند، نه روی این میزبان */
(function(){var base='__SITE__/';window.eplakResolveMediaUrl=function(p){var v=String(p||'').trim();if(!v)return '';if(/^(https?:)?\/\//i.test(v)||v.indexOf('data:')===0||v.indexOf('blob:')===0)return v;return base+v.replace(/^\/+/,'');};})();
</script>""".replace('__SITE__', site)
m = re.search(r'<script src="core/storage\.js[^"]*"></script>', html)
if not m:
    sys.exit('❌ تگ core/storage.js در index.html پیدا نشد')
html = html[:m.end()] + '\n' + media + html[m.end():]

open(path, 'w', encoding='utf-8').write(html)
print('✅ index.html برای میزبان ایستا اصلاح شد')
PYEOF

if [ -n "$ZIP" ]; then
  case "$ZIP" in /*) ZIP_PATH="$ZIP" ;; *) ZIP_PATH="$PWD/$ZIP" ;; esac
  (cd "$OUT_DIR" && zip -q -r "$ZIP_PATH" . -x '*.DS_Store')
  COUNT="$(unzip -Z1 "$ZIP_PATH" | wc -l | tr -d ' ')"
  echo "✅ آماده شد: $ZIP ($(du -h "$ZIP_PATH" | cut -f1)، $COUNT مورد) — پوشه‌ی $OUT_DIR هم هست"
else
  echo "✅ آماده شد: پوشه‌ی $OUT_DIR ($(find "$OUT_DIR" -type f | wc -l | tr -d ' ') فایل، $(du -sh "$OUT_DIR" | cut -f1))"
fi

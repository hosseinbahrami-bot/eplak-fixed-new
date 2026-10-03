#!/usr/bin/env bash
# ============================================================================
#  ios-app/sync-web.sh — فایل‌های وب اپ را داخل پروژه‌ی iOS کپی می‌کند (Eplak/Web)
#
#  اپ iOS (مثل اپ اندروید) خودِ وب‌اپ را داخل خودش دارد و از روی file:// باز می‌کند.
#  مجموعه‌ی فایل‌ها دقیقاً همان است که اپ اندروید می‌گذارد
#  (android-app/app/build.gradle ← syncWebAssets): index.html، app.js، core، modules،
#  views، assets. پوشه‌ی Eplak/Web در گیت نیست (در .gitignore است) و هر بار از ریشه‌ی
#  پروژه ساخته می‌شود؛ پس iOS همیشه همان نسخه‌ی وب را دارد که APK و سایت دارند.
#
#  اجرا (قبل از باز کردن پروژه در Xcode):   bash ios-app/sync-web.sh
#  (ورک‌فلو .github/workflows/ios-ipa.yml هم همین را خودکار اجرا می‌کند)
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"
DEST="$HERE/Eplak/Web"

rm -rf "$DEST"
mkdir -p "$DEST"

for item in index.html app.js core modules views assets; do
  if [ -e "$SRC/$item" ]; then
    cp -R "$SRC/$item" "$DEST/$item"
  elif [ "$item" = "views" ]; then
    echo "ℹ️  $item در پروژه نیست؛ رد شد"
  else
    echo "❌ $item در $SRC پیدا نشد"; exit 1
  fi
done
find "$DEST" -name '.DS_Store' -delete

COUNT="$(find "$DEST" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$DEST" | cut -f1)"
echo "✅ فایل‌های وب داخل $DEST کپی شد ($COUNT فایل، $SIZE)"

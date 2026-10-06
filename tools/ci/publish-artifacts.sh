#!/usr/bin/env bash
# ============================================================================
#  tools/ci/publish-artifacts.sh — گذاشتن «فایل‌های ساخت و لاگ‌ها» روی برچسب گیت
#
#  چرا؟ سرویس artifact گیت‌هاب (و صفحه‌ی Releases) روی دامنه‌های
#  *.actions.githubusercontent.com / objects.githubusercontent.com سرویس می‌دهند که از
#  بعضی محیط‌ها (مثل سندباکس‌های بدون دسترسی به آن دامنه‌ها) قابل برداشتن نیستند؛ اما
#  خودِ «گیت» روی github.com همیشه در دسترس است. پس خروجی هر ساخت روی یک برچسب
#  (tag) گیت گذاشته می‌شود و از هر جایی که clone/fetch کار می‌کند قابل برداشتن است:
#
#     git fetch origin "refs/tags/artifacts/android"
#     git show "FETCH_HEAD:android/eplak-app.apk" > eplak-app.apk
#
#  این برچسب به هیچ شاخه‌ای وصل نیست (کامیتِ جدا) و تاریخچه‌ی شاخه‌ها را آلوده نمی‌کند.
#  پاک کردنش:   git push origin :refs/tags/artifacts/android
#
#  استفاده:  bash tools/ci/publish-artifacts.sh <نام زیرپوشه> <مسیرها…>
#            bash tools/ci/publish-artifacts.sh android dist ci-logs
#  لازم:     GITHUB_TOKEN (توکن خودِ اجرا) و GITHUB_REPOSITORY
# ============================================================================
set -euo pipefail

SUB="${1:?نام زیرپوشه را بدهید (مثلاً android)}"
shift || true
: "${GITHUB_TOKEN:?توکن اجرای ورک‌فلو (GITHUB_TOKEN) لازم است}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY لازم است}"
BASE="${GITHUB_WORKSPACE:-$PWD}"

if [ "$#" -eq 0 ]; then
  echo "ℹ️  مسیری داده نشد؛ برچسبی ساخته نمی‌شود"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REPO_DIR="$WORK/repo"
git init -q "$REPO_DIR"
cd "$REPO_DIR"
git config user.name  "eplak-ci"
git config user.email "ci@eplak.local"

TAG="artifacts/${SUB}"
mkdir -p "$SUB"
COPIED=0
for src in "$@"; do
  case "$src" in
    /*) abs="$src" ;;
    *)  abs="${BASE}/${src}" ;;
  esac
  if [ ! -e "$abs" ]; then
    echo "ℹ️  «$src» وجود ندارد؛ رد شد"
    continue
  fi
  cp -R "$abs" "$SUB/"
  COPIED=$((COPIED + 1))
done

if [ "$COPIED" -eq 0 ]; then
  echo "❌ هیچ فایل/پوشه‌ای برای انتشار پیدا نشد"
  exit 0
fi

# گیت‌هاب فایل‌های بزرگ‌تر از ۱۰۰ مگابایت را در push رد می‌کند
BIG="$(find "$SUB" -type f -size +95M -print)"
if [ -n "$BIG" ]; then
  echo "⚠️  این فایل‌ها بزرگ‌تر از ۹۵ مگابایت‌اند و گذاشته نمی‌شوند:"
  printf '%s\n' "$BIG"
  find "$SUB" -type f -size +95M -delete
fi

git add -A
git commit -q -m "ci artifacts: ${SUB}

کامیت منبع: ${GITHUB_SHA:-نامشخص}
ورک‌فلو: ${GITHUB_WORKFLOW:-?} / اجرا ${GITHUB_RUN_ID:-?} / تلاش ${GITHUB_RUN_ATTEMPT:-?}"
git tag -f "$TAG" >/dev/null

git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git push -q -f origin "refs/tags/${TAG}"

FILES="$(find "$SUB" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$SUB" | cut -f1)"
echo "✅ روی برچسب «${TAG}» منتشر شد: ${FILES} فایل (${SIZE})"
echo "   برداشتن:  git fetch origin refs/tags/${TAG} && git show FETCH_HEAD:${SUB}/<نام فایل> > <نام فایل>"
find "$SUB" -type f | sort | sed 's/^/   • /'

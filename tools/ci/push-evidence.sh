#!/usr/bin/env bash
# ============================================================================
#  tools/ci/push-evidence.sh — گذاشتن «عکس‌ها و شواهد آزمون» روی یک برچسب گیت
#
#  چرا برچسب؟ عکس‌های آزمون (Chrome، Safari شبیه‌ساز، GitHub Pages) هر بار ساخته می‌شوند و
#  اگر به شاخه‌ی اصلی بروند، تاریخچه‌ی مخزن پر از فایل‌های بیهوده می‌شود. پس فقط وقتی
#  پیام کامیت «[evidence]» دارد، داخل یک مخزن موقت commit می‌شوند و به‌صورت برچسب
#  «evidence/<نام>» push می‌شوند؛ بعداً هم می‌توان پاکشان کرد:
#     git push origin :refs/tags/evidence/<نام>
#
#  استفاده (در CI):   bash tools/ci/push-evidence.sh <پوشه‌ی شواهد> <نام برچسب>
#  لازم:              GITHUB_TOKEN (توکن خودِ اجرا) و GITHUB_REPOSITORY
# ============================================================================
set -euo pipefail

DIR="${1:?پوشه‌ی شواهد را بدهید}"
NAME="${2:?نام برچسب را بدهید}"

if [ ! -d "$DIR" ]; then
  echo "ℹ️  پوشه‌ی «$DIR» ساخته نشد؛ چیزی برای گذاشتن روی برچسب نیست"
  exit 0
fi
if [ -z "$(ls -A "$DIR" 2>/dev/null)" ]; then
  echo "ℹ️  پوشه‌ی «$DIR» خالی است؛ برچسبی ساخته نمی‌شود"
  exit 0
fi

: "${GITHUB_TOKEN:?توکن اجرای ورک‌فلو (GITHUB_TOKEN) لازم است}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY لازم است}"

SRC="$(cd "$DIR" && pwd)"
TAG="evidence/${NAME}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git init -q "$WORK/repo"
cd "$WORK/repo"
git config user.name  "eplak-ci"
git config user.email "ci@eplak.local"

mkdir -p "$NAME"
cp -R "$SRC/." "$NAME/"
git add -A
git commit -q -m "evidence: ${TAG}

کامیت منبع: ${GITHUB_SHA:-نامشخص}
اجرا: ${GITHUB_RUN_ID:-?} / ${GITHUB_RUN_ATTEMPT:-?}"
git tag -f "$TAG" >/dev/null

git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git push -q -f origin "refs/tags/${TAG}"
echo "✅ شواهدِ «$DIR» روی برچسب ${TAG} گذاشته شد (${NAME}: $(find "$SRC" -type f | wc -l | tr -d ' ') فایل)"

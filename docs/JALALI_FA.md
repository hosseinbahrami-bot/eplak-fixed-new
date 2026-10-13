# 🗓️ تاریخ شمسی در اپ و پنل ادمین

> گزارش کارفرما: «موقعی که درخواست ثبت می‌کنی تاریخش به میلادی میاد؛ تاریخ رو به
> شمسی تغییر بده — چه داخل اپ و چه داخل پنل ادمین.»

---

## ۱) چرا تاریخ میلادی دیده می‌شد؟ (سه ریشه)

| # | ریشه | کجا دیده می‌شد |
|---|---|---|
| ۱ | پنل ادمین تاریخ را **خام** از دیتابیس چاپ می‌کرد: `<?= htmlspecialchars($report['created_at']) ?>` ⇒ `2026-10-11 13:24:05`. اسکریپت `admin/assets/persian-digits.js` فقط رقم‌ها را فارسی می‌کرد، پس نتیجه می‌شد `۲۰۲۶-۱۰-۱۱ ۱۳:۲۴:۰۵` — **همان میلادی** با رقم فارسی | همه‌ی فهرست‌ها و صفحه‌های جزئیات پنل |
| ۲ | در اپ، `toLocaleDateString('fa-IR')` روی iOS و بعضی WebViewهای اندروید تقویم **میلادی** را برمی‌گرداند (پشتیبانی `Intl` از تقویم هجری‌شمسی در آن مرورگرها کامل نیست) | فهرست خبرها، دانستنی‌ها، اعلان‌ها |
| ۳ | بدتر از همه: `formatReportDateTime()` در اپ هر مقدارِ **دارای ساعت** را «قبلاً قالب‌گرفته» فرض می‌کرد و همان رشته‌ی خام را برمی‌گرداند (`if (dateValue.includes('ساعت') \|\| / \d{1,2}:\d{2}/.test(dateValue)) return dateValue;`) ⇒ تاریخِ خودِ «درخواستِ ثبت‌شده» میلادیِ خام نشان داده می‌شد | صفحه‌ی «درخواست ثبت شد»، «درخواست‌های من»، جزئیات و روند رسیدگی، تیکت‌ها |

---

## ۲) راه‌حل: یک مبدأ برای هر دو سمت

### الف) سرور — `shared/fa_datetime.php`

این فایل از قبل `eplakGregorianToJalali()` (الگوریتم جلالی) و `eplakFaDateTime()`
(برای متن اعلان‌ها) را داشت. توابع تازه:

| تابع | کار | نمونه |
|---|---|---|
| `eplakFaDate($value, $fallback)` | فقط تاریخِ شمسی | `۱۴۰۵/۰۷/۱۹` |
| `eplakFaDateTimeOf($value, $fallback)` | تاریخ و ساعتِ شمسی (هم‌شکلِ اپ) | `۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴` |
| `eplakFaNow()` | «همین لحظه» به شمسی (برای مقدارِ خالی) | `۱۴۰۵/۰۷/۲۲ - ساعت ۱۳:۰۰` |
| `eplakParseDbDateTime()` | خواندن مقدار دیتابیس: `2026-10-11 13:24:05` · `…T…Z` · `2026-10-11` · timestamp عددی (ثانیه/میلی‌ثانیه) · `0000-00-00` ⇒ `null` | — |
| `eplakDbTimezone()` / `eplakDisplayTimezone()` | منطقه‌ی زمانیِ دیتابیس و نمایش (از متغیر محیطی یا `shared/config.php`) | — |

`shared/bootstrap.php` این فایل را `require_once` می‌کند، پس توابع در **همه‌ی**
صفحه‌های پنل و API در دسترس‌اند.

**۴۱ جای نمایش تاریخ در پنل** با این توابع جایگزین شد:
`index.php` (داشبورد) · `reports.php` · `report_detail.php` (شامل روند رسیدگی،
رویدادها، پیوست‌ها و دستگاه‌ها) · `report_edit.php` · `tickets.php` ·
`ticket_detail.php` · `ticket_edit.php` · `users.php` · `user_view.php` ·
`user_reports.php` · `user_edit.php` · `department_edit.php` · `news.php` ·
`notifications.php` · `notification_view.php` · `settings.php` (آخرین ارسال،
خطاها، لاگ push) · `version.php`.

> ⚠️ `data-created="2026-10-11 13:24:05"` در `admin/users.php` **عمداً خام ماند**:
> فیلتر «کاربران تازه» (۷ روز اخیر) با `new Date(created)` کار می‌کند و اگر شمسیِ
> فارسی می‌شد، فیلتر از کار می‌افتاد. فقط «سلولِ دیده‌شده» شمسی شد.
> فایل‌های خروجی اکسل (`admin/export.php`) هم عمداً ISO می‌مانند تا در اکسل
> قابل مرتب‌سازی/فیلتر باشند.

### ب) اپ — `core/state.js`

همان الگوریتم (با همان اعداد مرجع `355666 · 12053 · 1461 · 186`) به‌صورت
`window.eplakFaDate()` / `window.eplakFaTime()` / `window.eplakFaDateTime()` /
`window.eplakFaNow()` پیاده شد — **بدون هیچ وابستگی به `Intl` مرورگر**، پس روی
iOS، اندروید قدیمی، PWA و مرورگر دسکتاپ یکسان شمسی است.

* `modules/reports.js`: `formatReportDate()` و `formatReportDateTime()` از آن استفاده
  می‌کنند (و میان‌بُرِ «مقدارِ دارای ساعت = قالب‌گرفته» برداشته شد). لاگ‌های
  تشخیصی آپلود هم شمسی شدند.
* `modules/live.js`: `faDate()`/`faTime()` (تاریخ خبرها، دانستنی‌ها و اعلان‌ها).
* حالت **انگلیسی**: تاریخ میلادیِ خوانا برمی‌گردد (`2026-10-11 16:54`) — همان
  رفتار قبلی، چون کاربر انگلیسی‌زبان شمسی نمی‌خواهد.
* کش‌باسترها بالا رفتند: `core/state.js?v=13` · `modules/reports.js?v=28` ·
  `modules/live.js?v=18` (وگرنه گوشی‌ها کد قدیمی را از کش نشان می‌دادند).

---

## ۳) منطقه‌ی زمانی (مهم برای هاست)

مقدارهای دیتابیس با `NOW()`/`CURRENT_TIMESTAMP` نوشته می‌شوند و ساعتِ بیشتر
هاست‌ها **UTC** است. کد هم همین را فرض می‌کند و برای نمایش به **وقت تهران**
(+۳:۳۰) می‌برد؛ پس `2026-10-11 13:24:05` در دیتابیس ⇒ `۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴`.

اگر ساعت دیتابیس هاست شما تهران است، زمان‌ها ۳:۳۰ ساعت جلو می‌افتند. یک‌بار در
phpMyAdmin بررسی کنید (`SELECT NOW();` را با ساعت دیواری مقایسه کنید) و در صورت
نیاز، در `shared/config.php` بگذارید:

```php
'db_timezone'      => 'Asia/Tehran',   // مقدارهای دیتابیس تهران‌اند
'display_timezone' => 'Asia/Tehran',   // پیش‌فرض هم همین است
```

معادل متغیر محیطی (برای هاست‌هایی که `SetEnv` دارند):
`EPLAK_DB_TIMEZONE=Asia/Tehran` و `EPLAK_DISPLAY_TIMEZONE=Asia/Tehran`.

> در اپ، ساعت به **وقت خودِ گوشی** نشان داده می‌شود (برای کاربر ایرانی همان تهران)
> و متن اعلان‌ها (`shared/notify_events.php`) از قبل شمسی و به وقت تهران بود و
> دست‌نخورده ماند.

---

## ۴) چطور امتحان شد

`tools/dev/tests/jalali.test.mjs` — **۳۵ بررسی** (هدف `jalali` در
`tools/dev/run-regression.sh` و در CI):

1. **توابع سرور**: `2026-10-11 13:24:05` ⇒ `۱۴۰۵/۰۷/۱۹ - ساعت ۱۶:۵۴`؛ مقدار ISO با
   `Z` (تغییر روز)؛ تاریخ‌های مرجع (نوروز ۱۴۰۵/۱۴۰۳ و سال کبیسه‌ی ۱۴۰۲/۱۲/۲۹)؛
   مقدار خالی/`0000-00-00`/خراب ⇒ همان جایگزینِ خوانا (نه خطا)؛ timestamp عددی؛
   `EPLAK_DB_TIMEZONE=Asia/Tehran` ⇒ بدون جابه‌جایی ساعت.
2. **۱۶ صفحه‌ی پنل** با داده‌ی واقعی رندر می‌شوند: هیچ‌کدام خطای PHP ندارند،
   تاریخ شمسی دارند، و **هیچ تاریخ میلادیِ خامی در متنِ دیده‌شده نمانده**
   (تگ‌ها و اسکریپت‌ها کنار گذاشته می‌شوند تا `data-created` خام، مثبتِ کاذب نشود).
3. **اپ واقعی (jsdom)**: `formatReportDate/formatReportDateTime` شمسی می‌دهند،
   مقدارِ خامِ دارای ساعت دیگر رد نمی‌شود، ISO/timestamp درست‌اند، متنِ ازقبل‌فارسیِ
   سرور دست‌نخورده می‌ماند، تاریخ اعلان‌ها و خبرها در DOM شمسی است، و
   **خروجی اپ با خروجی پنل ادمین مو‌به‌مو یکی است**.
4. **قراردادها**: الگوریتم JS و PHP یکی است، هیچ صفحه‌ی پنلی تاریخ خام چاپ
   نمی‌کند، و کش‌باسترها بالا رفته‌اند.

نتیجه‌ی کل مجموعه در این نسخه: **همه‌ی ۲۰ هدف موفق** (syntax · notify ·
notify-schema · news · **jalali** · app · pushcrypto · fcm · backend · security ·
online · geo · upload · tiles · push · places · placesadmin · otp · ios · pwa).

---

## ۵) فایل‌های عوض‌شده

| فایل | چه شد |
|---|---|
| `shared/fa_datetime.php` | توابع `eplakFaDate` · `eplakFaDateTimeOf` · `eplakFaNow` · `eplakParseDbDateTime` · `eplakTimezoneSetting` (+ یکسان‌سازی جداکننده با اپ: `- ساعت`) |
| `shared/bootstrap.php` | `require_once fa_datetime.php` تا توابع در همه‌ی صفحه‌ها/APIها باشند |
| ۱۷ فایل در `admin/` | ۴۱ جای نمایش تاریخ ⇒ شمسی (و دو سلول `dir="ltr"` ⇒ `dir="rtl"`) |
| `core/state.js` | ماژول تاریخ شمسیِ اپ (`window.eplakFaDate/eplakFaTime/eplakFaDateTime/eplakFaNow`) |
| `modules/reports.js` | `formatReportDate`/`formatReportDateTime` شمسی + برداشتن میان‌بُرِ مخرب + لاگ‌های آپلود |
| `modules/live.js` | `faDate`/`faTime` شمسی (خبرها، دانستنی‌ها، اعلان‌ها) |
| `index.html` | کش‌باسترها: `state.js?v=13` · `reports.js?v=28` · `live.js?v=18` |
| `shared/config.example.php` | کلیدهای مستند `db_timezone` و `display_timezone` |
| `tools/dev/tests/jalali.test.mjs` · `run-regression.sh` · `.github/workflows/*` | آزمون تازه (۳۵ بررسی) و ثبت هدف `jalali` در اجراهای محلی و CI |

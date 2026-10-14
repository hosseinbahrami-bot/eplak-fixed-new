-- ============================================================================
--  backend/fix-news-db.sql — تعمیر دستی «جدول اخبار و دانستنی‌ها»
-- ============================================================================
--  چه زمانی لازم است؟
--    وقتی کاربر دیتابیس اجازه‌ی ALTER/CREATE ندارد، کد نمی‌تواند جدول news را
--    خودش ترمیم کند. در این حالت:
--      • فهرست «اخبار و اطلاعیه‌ها» در اپ خالی می‌ماند
--      • صفحه‌ی «اخبار و دانستنی‌ها» در پنل یا خالی است یا خطا می‌دهد
--      • «افزودن/ویرایش مطلب» در پنل ذخیره نمی‌شود
--
--  این اسکریپت همان کاری را می‌کند که کد به‌صورت خودکار انجام می‌دهد:
--    ۱) جدول news را (اگر نیست) با نویسه‌گان utf8mb4 می‌سازد
--    ۲) ستون‌های نسخه‌ی جدید را به جدول قدیمی اضافه می‌کند (badge و …)
--    ۳) نویسه‌گان جدول قدیمی را به utf8mb4 تبدیل می‌کند تا ایموجیِ آیکون‌ها
--       (🌳 📋 🎉 🏗️ 🏛️ 🗼) ذخیره شود — بدون این، «Incorrect string value»
--       باعث می‌شد حتی درج محتوای پیش‌فرض شکست بخورد و جدول خالی بماند
--
--  اجرا: یک‌بار در phpMyAdmin (سربرگ SQL) یا با mysql CLI.
--  نکته: اگر پیام «command denied» دیدید، یعنی همان کاربرِ دیتابیس اجازه ندارد؛
--        اسکریپت را با کاربر root/مدیر اجرا کنید.
--
--  پس از اجرا، در پنل مدیریت → اخبار و دانستنی‌ها دکمه‌ی
--  «تعمیر خودکار جدول اخبار» را بزنید تا مطالب پیش‌فرض (۴ خبر + ۲ دانستنی)
--  یک‌بار درج شود؛ بعد از آن می‌توانید هر مطلبی را خودتان اضافه/ویرایش کنید.
-- ============================================================================

-- ۱) ساخت جدول (اگر در دامپ قدیمی نبود) — با utf8mb4
CREATE TABLE IF NOT EXISTS `news` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(20) NOT NULL DEFAULT 'news',
  `title` varchar(255) NOT NULL DEFAULT '',
  `summary` text NULL,
  `body` text NULL,
  `icon` varchar(50) NULL DEFAULT NULL,
  `badge` varchar(120) NULL DEFAULT NULL,
  `image_url` varchar(500) NULL DEFAULT NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_news_type_published` (`type`, `published`),
  KEY `idx_news_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ۲) ستون‌های نسخه‌ی جدید روی جدول قدیمی
--    (MySQL افزودن ستونِ تکراری را با IF NOT EXISTS در همه نسخه‌ها قبول نمی‌کند؛
--     اگر پیام «Duplicate column name» دیدید یعنی آن ستون از قبل هست — رد شوید.)
ALTER TABLE `news` ADD COLUMN `summary` text NULL;
ALTER TABLE `news` ADD COLUMN `icon` varchar(50) NULL DEFAULT NULL;
ALTER TABLE `news` ADD COLUMN `badge` varchar(120) NULL DEFAULT NULL;
ALTER TABLE `news` ADD COLUMN `image_url` varchar(500) NULL DEFAULT NULL;
ALTER TABLE `news` ADD COLUMN `published` tinyint(1) NOT NULL DEFAULT 1;
ALTER TABLE `news` ADD COLUMN `sort_order` int NOT NULL DEFAULT 0;
ALTER TABLE `news` ADD COLUMN `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ۳) نویسه‌گان: utf8 سه‌بایتی → utf8mb4 (برای ایموجی)
ALTER TABLE `news` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ۴) بررسی نهایی
SELECT COUNT(*) AS `تعداد_مطالب` FROM `news`;
SHOW FULL COLUMNS FROM `news`;

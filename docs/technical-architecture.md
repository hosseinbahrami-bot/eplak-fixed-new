# مستند فنی معماری پروژه EplakFixed

## 1. مقدمه

این مستند نسخه فنی‌تر از پروژه است و برای توسعه‌دهندگان یا کاربرانی نوشته شده که نیاز دارند ساختار معماری، لایه‌های برنامه، جریان داده و ارتباط بین اجزای مختلف را درک کنند.

## 2. هدف پروژه

پروژه EplakFixed یک اپ اندرویدی اولیه است که برای مدیریت موارد زیر طراحی شده است:
- احراز هویت کاربر با شماره موبایل
- ثبت و ویرایش پروفایل
- ثبت گزارش/درخواست
- ثبت اطلاعات پرداخت
- ذخیره داده‌ها در دیتابیس محلی و پشتیبانی از MySQL

## 3. معماری کلی سیستم

پروژه از سه لایه اصلی تشکیل شده است:

1. لایه UI (Android Activities / XML Layouts)
2. لایه منطق کسب‌وکار (Repository / Kotlin Logic)
3. لایه ذخیره‌سازی و دیتابیس (Room + MySQL Backend)

### دیاگرام معماری کلی

```text
┌──────────────────────────────────────────────┐
│                Android UI Layer              │
│  LoginActivity | HomeActivity | ReportActivity│
│  ProfileActivity | PaymentActivity           │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│           Application Logic Layer            │
│          Repository + Coroutine Logic        │
└──────────────────┬───────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌─────────────┐ ┌────────────┐ ┌──────────────────┐
│ Room DB     │ │ Retrofit   │ │ Node.js Backend  │
│ (Local)     │ │ (Remote)   │ │ (MySQL)          │
└─────────────┘ └────────────┘ └──────────────────┘
```

## 4. لایه‌های پروژه

### 4.1 لایه UI

این لایه شامل Activityها و فایل‌های layout XML است.

#### Activityها
- `MainActivity.kt` : ورود برنامه و هدایت به صفحه لاگین
- `LoginActivity.kt` : دریافت شماره موبایل و ثبت اولیه کاربر
- `HomeActivity.kt` : صفحه اصلی و دسترسی به بخش‌ها
- `ReportActivity.kt` : ثبت گزارش/درخواست
- `ProfileActivity.kt` : ثبت ویرایش پروفایل
- `PaymentActivity.kt` : ثبت اطلاعات پرداخت

#### Layoutها
- `activity_login.xml` : فرم ورود
- `activity_home.xml` : صفحه اصلی
- `activity_report.xml` : فرم گزارش
- `activity_profile.xml` : فرم پروفایل
- `activity_payment.xml` : فرم پرداخت

### 4.2 لایه منطق برنامه

این لایه مسئول پردازش داده و هماهنگی میان UI و دیتابیس است.

#### Repository
فایل `Repository.kt` مسئول انجام عملیات زیر است:
- ذخیره کاربر
- ثبت گزارش
- ثبت پرداخت
- ایجاد اعلان
- ثبت علاقه‌مندی

این لایه از `Dispatchers.IO` برای انجام عملیات I/O استفاده می‌کند و از کروتین استفاده می‌کند تا برنامه در UI Thread قفل نشود.

### 4.3 لایه دیتابیس

#### Room Database (محلی)
Room برای ذخیره‌سازی محلی داده‌ها در دستگاه اندروید استفاده می‌شود.

##### مزایا
- سرعت بالا
- مناسب برای داده‌های محلی
- ساده‌تر از SQLite خام

##### جداول اصلی
- `users`
- `reports`
- `payments`
- `notifications`
- `favorites`

#### MySQL Backend (سرویس شبکه)
سرور Node.js داده‌ها را از اندروید دریافت و در MySQL ذخیره می‌کند.

## 5. مدل‌های داده

### 5.1 UserEntity
```kotlin
data class UserEntity(
    val phone: String,
    val name: String,
    val address: String? = null,
    val nid: String? = null
)
```

### 5.2 ReportEntity
```kotlin
data class ReportEntity(
    val userPhone: String,
    val title: String,
    val description: String,
    val category: String,
    val status: String = "pending"
)
```

### 5.3 PaymentEntity
```kotlin
data class PaymentEntity(
    val userPhone: String,
    val code: String,
    val title: String,
    val dueDate: String,
    val amount: Double,
    val status: String = "pending"
)
```

## 6. جریان داده

### 6.1 ورود کاربر
```text
کاربر → LoginActivity → Repository.saveUser() → Room DB
```

### 6.2 ثبت گزارش
```text
کاربر → ReportActivity → Repository.saveReport() → Room DB
```

### 6.3 ثبت اطلاعات پرداخت
```text
کاربر → PaymentActivity → Repository.savePayment() → Room DB
```

### 6.4 ذخیره در MySQL از طریق بک‌اند
```text
اندروید → Retrofit → Node.js Server → MySQL
```

## 7. ارتباط میان فایل‌ها

### مثال ساده
- `LoginActivity.kt` از `Repository.kt` استفاده می‌کند.
- `Repository.kt` به `AppDatabase.kt` دسترسی دارد.
- `AppDatabase.kt` از DAOها استفاده می‌کند.
- `Daos.kt` عملیات دیتابیس را انجام می‌دهد.
- `ApiService.kt` برای ارتباط با بک‌اند استفاده می‌شود.

## 8. فایل‌های کلیدی و نقش هرکدام

| فایل | نقش |
|------|-----|
| `MainActivity.kt` | ورود اولیه و هدایت کاربر |
| `LoginActivity.kt` | دریافت شماره موبایل |
| `HomeActivity.kt` | منوی اصلی |
| `ReportActivity.kt` | ثبت گزارش |
| `ProfileActivity.kt` | ثبت پروفایل |
| `PaymentActivity.kt` | ثبت پرداخت |
| `AppDatabase.kt` | ساخت و راه‌اندازی دیتابیس Room |
| `Entities.kt` | تعریف مدل‌های دیتابیس |
| `Daos.kt` | عملیات CRUD |
| `Repository.kt` | لایه منطق و ذخیره‌سازی |
| `ApiService.kt` | ارتباط با سرور |
| `server.js` | دریافت و ذخیره داده در MySQL |
| `mysql-schema.sql` | ساخت جدول‌های دیتابیس |

## 9. مزایا و محدودیت‌های معماری فعلی

### مزایا
- ساختار ساده و قابل فهم
- جداسازی منطق UI و داده
- پشتیبانی از دیتابیس محلی و سرور
- مناسب برای نسخه اولیه و توسعه بیشتر

### محدودیت‌ها
- هنوز از MVVM استفاده نشده است
- احراز هویت واقعی و امنیتی هنوز پیاده‌سازی نشده است
- UI هنوز ساده و اولیه است
- برای کاربرد واقعی، نیاز به مدیریت خطا، لودینگ، تست و validation بیشتر دارد

## 10. پیشنهاد برای نسخه بعدی

برای تبدیل این پروژه به یک محصول حرفه‌ای‌تر، پیشنهاد می‌شود:
- استفاده از MVVM Architecture
- استفاده از ViewModel و LiveData/StateFlow
- جدا کردن لایه شبکه و لایه دیتابیس به‌صورت کامل‌تر
- استفاده از Hilt برای Dependency Injection
- پیاده‌سازی JWT و احراز هویت امن
- مدیریت خطا و نمایش Toast/Dialog حرفه‌ای

## 11. جمع‌بندی

این پروژه در حال حاضر یک نسخه اولیه و قابل‌گسترش از یک اپ اندرویدی با معماری ساده است. ساختار فعلی به شما اجازه می‌دهد داده‌ها را از فرم‌ها دریافت کرده، در Room ذخیره کنید و در صورت نیاز از طریق بک‌اند به MySQL نیز ارسال کنید.

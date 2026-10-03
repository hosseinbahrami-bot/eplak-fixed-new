package com.example.eplakfixed

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * نوتیفیکیشن سیستمی گوشی برای اعلان‌های پنل ادمین.
 *
 * چرا این فایل لازم است؟
 * اپ روی WebView اجرا می‌شود و در WebView اندروید، «Push API» و
 * «Notification API» وجود ندارند (اندروید این قابلیت‌ها را در WebView پیاده نکرده
 * است). پس اعلان‌های داخل‌برنامه‌ای (که با فراخوانی هر چند ثانیه از سرور خوانده
 * می‌شوند) از این طریق به‌صورت «نوتیفیکیشن سیستمی» روی گوشی نمایش داده می‌شوند:
 * لایه‌ی جاوااسکریپت (modules/live.js) وقتی اعلان تازه‌ای می‌بیند، متد
 * showNotification را صدا می‌زند.
 *
 * محدودیت: وقتی اپ *کاملاً بسته* است، جاوااسکریپت اجرا نمی‌شود و این مسیر کار
 * نمی‌کند؛ برای آن حالت به Firebase Cloud Messaging (FCM) نیاز است.
 */
object NotificationBridge {

    /* شناسه‌ی اعلان‌هایی که همین چند لحظه پیش نمایش داده شده‌اند.
       چرا؟ یک اعلان ممکن است هم از فایربیس برسد و هم از همگام‌سازی داخل اپ
       (هر ۳.۵ ثانیه). بدون این حافظه، کاربر دو اعلان تکراری می‌بیند. */
    private val recentlyShown = HashMap<String, Long>()
    private const val DEDUPE_WINDOW_MS = 30_000L

    const val CHANNEL_ID = "eplak_alerts"
    private const val CHANNEL_NAME = "اعلان‌های ای‌پلاک"
    private const val CHANNEL_DESCRIPTION = "اطلاعیه‌های شهرداری ورامین"

    /** ساخت کانال اعلان (اندروید ۸ و بالاتر اعلان بدون کانال نمایش داده نمی‌شود) */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = CHANNEL_DESCRIPTION
            enableVibration(true)
            enableLights(true)
        }
        manager.createNotificationChannel(channel)
    }

    /** آیا کاربر به اپ اجازه‌ی نمایش اعلان داده است؟ */
    fun isEnabled(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    /** نمایش یک اعلان در نوار اعلان‌های گوشی */
    fun show(context: Context, title: String, body: String, id: String) {
        if (!isEnabled(context)) return
        ensureChannel(context)

        /* حذف اعلان تکراری: اگر همین اعلان ۳۰ ثانیه‌ی پیش نمایش داده شده باشد،
           دوباره نمایش داده نمی‌شود (کلید: شناسه یا متن اعلان). */
        val key = if (id.isNotBlank()) id else (title + "|" + body).hashCode().toString()
        val now = System.currentTimeMillis()
        synchronized(recentlyShown) {
            val last = recentlyShown[key]
            if (last != null && now - last < DEDUPE_WINDOW_MS) {
                return
            }
            recentlyShown[key] = now
            val iterator = recentlyShown.entries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                if (now - entry.value > DEDUPE_WINDOW_MS) iterator.remove()
            }
        }

        // با لمس اعلان، همان اپ باز می‌شود
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("eplak_notification_id", id)
        }
        val requestCode = id.toIntOrNull() ?: id.hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title.ifBlank { "اعلان ای‌پلاک" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(requestCode, notification)
        } catch (e: SecurityException) {
            // کاربر اجازه نداده است؛ کاری نمی‌کنیم
        }
    }
}

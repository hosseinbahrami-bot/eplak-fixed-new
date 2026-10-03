package com.example.eplakfixed

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * دریافت اعلان‌های پنل مدیریت از فایربیس (FCM).
 *
 * این کلاس همان چیزی است که اعلان را در حالت **بسته بودن کامل اپلیکیشن** به گوشی
 * می‌رساند؛ چیزی که WebView به‌تنهایی نمی‌تواند انجام دهد (اندروید در WebView نه
 * Push API دارد و نه Notification API).
 *
 * پیش‌نیاز: فایل `google-services.json` از پروژه‌ی فایربیس باید در پوشه‌ی
 * `android-app/app/` باشد. اگر نباشد، این کلاس هرگز صدا زده نمی‌شود و اپ بدون
 * هیچ خطایی کار می‌کند (اعلان‌های داخل‌برنامه‌ای مثل قبل باقی می‌مانند).
 */
class EplakMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "EplakFCM"
        const val PREFS = "eplak_push"
        const val KEY_TOKEN = "fcm_token"
    }

    /** توکن این دستگاه تازه ساخته شده یا عوض شده است */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "توکن تازه دریافت شد")
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TOKEN, token)
            .apply()

        /* اگر اپ باز است، لایه‌ی وب همین الان گوشی را روی سرور ثبت می‌کند
           (در غیر این صورت، در اولین باز شدن بعدی ثبت می‌شود). */
        MainActivity.notifyFcmTokenReady()
    }

    /** پیام رسید — هم در حالت پس‌زمینه و هم بسته بودن اپ */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title
            ?: message.data["title"]
            ?: "اعلان ای‌پلاک"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: ""
        val id = message.data["id"] ?: ""

        NotificationBridge.show(this, title, body, id)
    }
}

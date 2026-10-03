package com.example.eplakfixed

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppRepository(private val context: Context) {
    private val db = AppDatabase.getDatabase(context)

    suspend fun saveUser(phone: String, name: String, address: String?, nid: String?) = withContext(Dispatchers.IO) {
        val existing = db.userDao().getUserByPhone(phone)
        if (existing == null) {
            db.userDao().insertUser(UserEntity(phone = phone, name = name, address = address, nid = nid))
        } else {
            db.userDao().updateUser(existing.copy(name = name, address = address, nid = nid))
        }
    }

    suspend fun saveReport(userPhone: String, title: String, description: String, category: String) = withContext(Dispatchers.IO) {
        db.reportDao().insertReport(ReportEntity(userPhone = userPhone, title = title, description = description, category = category))
    }

    suspend fun savePayment(userPhone: String, code: String, title: String, dueDate: String, amount: Double) = withContext(Dispatchers.IO) {
        db.paymentDao().insertPayment(PaymentEntity(userPhone = userPhone, code = code, title = title, dueDate = dueDate, amount = amount))
    }

    suspend fun saveNotification(userPhone: String, title: String, body: String) = withContext(Dispatchers.IO) {
        db.notificationDao().insertNotification(NotificationEntity(userPhone = userPhone, title = title, body = body))
    }

    suspend fun saveFavorite(userPhone: String, itemId: String) = withContext(Dispatchers.IO) {
        db.favoriteDao().insertFavorite(FavoriteEntity(userPhone = userPhone, itemId = itemId))
    }
}

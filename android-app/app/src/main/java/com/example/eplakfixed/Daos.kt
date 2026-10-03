package com.example.eplakfixed

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface UserDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity): Long

    @Query("SELECT * FROM users WHERE phone = :phone LIMIT 1")
    suspend fun getUserByPhone(phone: String): UserEntity?

    @Update
    suspend fun updateUser(user: UserEntity)
}

@Dao
interface ReportDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReport(report: ReportEntity): Long

    @Query("SELECT * FROM reports WHERE userPhone = :phone ORDER BY id DESC")
    suspend fun getReportsByPhone(phone: String): List<ReportEntity>
}

@Dao
interface PaymentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPayment(payment: PaymentEntity): Long

    @Query("SELECT * FROM payments WHERE userPhone = :phone ORDER BY id DESC")
    suspend fun getPaymentsByPhone(phone: String): List<PaymentEntity>
}

@Dao
interface NotificationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNotification(notification: NotificationEntity): Long

    @Query("SELECT * FROM notifications WHERE userPhone = :phone ORDER BY id DESC")
    suspend fun getNotificationsByPhone(phone: String): List<NotificationEntity>
}

@Dao
interface FavoriteDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFavorite(favorite: FavoriteEntity): Long

    @Query("SELECT * FROM favorites WHERE userPhone = :phone ORDER BY id DESC")
    suspend fun getFavoritesByPhone(phone: String): List<FavoriteEntity>
}

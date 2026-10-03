package com.example.eplakfixed

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Database

@Database(
    entities = [UserEntity::class, ReportEntity::class, PaymentEntity::class, NotificationEntity::class, FavoriteEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun reportDao(): ReportDao
    abstract fun paymentDao(): PaymentDao
    abstract fun notificationDao(): NotificationDao
    abstract fun favoriteDao(): FavoriteDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "eplak_db"
                ).fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

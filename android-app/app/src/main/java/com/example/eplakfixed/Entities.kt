package com.example.eplakfixed

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val phone: String,
    val name: String,
    val address: String? = null,
    val nid: String? = null
)

@Entity(tableName = "reports")
data class ReportEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val userPhone: String,
    val title: String,
    val description: String,
    val category: String,
    val status: String = "pending"
)

@Entity(tableName = "payments")
data class PaymentEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val userPhone: String,
    val code: String,
    val title: String,
    val dueDate: String,
    val amount: Double,
    val status: String = "pending"
)

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val userPhone: String,
    val title: String,
    val body: String,
    val read: Boolean = false
)

@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val userPhone: String,
    val itemId: String
)

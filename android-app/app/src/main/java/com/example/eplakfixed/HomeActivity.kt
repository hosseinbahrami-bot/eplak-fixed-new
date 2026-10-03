package com.example.eplakfixed

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class HomeActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)

        val buttonReport = findViewById<Button>(R.id.buttonReport)
        val buttonProfile = findViewById<Button>(R.id.buttonProfile)
        val buttonPayment = findViewById<Button>(R.id.buttonPayment)

        val phone = intent.getStringExtra("phone") ?: ""

        buttonReport.setOnClickListener {
            val intent = Intent(this, ReportActivity::class.java)
            intent.putExtra("phone", phone)
            startActivity(intent)
        }

        buttonProfile.setOnClickListener {
            val intent = Intent(this, ProfileActivity::class.java)
            intent.putExtra("phone", phone)
            startActivity(intent)
        }

        buttonPayment.setOnClickListener {
            val intent = Intent(this, PaymentActivity::class.java)
            intent.putExtra("phone", phone)
            startActivity(intent)
        }
    }
}

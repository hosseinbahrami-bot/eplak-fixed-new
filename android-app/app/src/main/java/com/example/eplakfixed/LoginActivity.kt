package com.example.eplakfixed

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var phoneEditText: EditText
    private lateinit var submitButton: Button
    private lateinit var repository: AppRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        repository = AppRepository(this)
        phoneEditText = findViewById(R.id.editTextPhone)
        submitButton = findViewById(R.id.buttonContinue)

        submitButton.setOnClickListener {
            val phone = phoneEditText.text.toString().trim()
            if (phone.length < 11) {
                Toast.makeText(this, "شماره موبایل معتبر نیست", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                repository.saveUser(phone, "شهروند", null, null)
                val intent = Intent(this@LoginActivity, HomeActivity::class.java)
                intent.putExtra("phone", phone)
                startActivity(intent)
                finish()
            }
        }
    }
}

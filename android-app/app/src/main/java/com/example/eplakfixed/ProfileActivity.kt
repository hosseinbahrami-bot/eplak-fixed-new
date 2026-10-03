package com.example.eplakfixed

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class ProfileActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile)

        val phone = intent.getStringExtra("phone") ?: ""
        val repository = AppRepository(this)

        val nameInput = findViewById<EditText>(R.id.editTextName)
        val addressInput = findViewById<EditText>(R.id.editTextAddress)
        val nidInput = findViewById<EditText>(R.id.editTextNid)
        val saveButton = findViewById<Button>(R.id.buttonSaveProfile)

        saveButton.setOnClickListener {
            val name = nameInput.text.toString().trim()
            val address = addressInput.text.toString().trim()
            val nid = nidInput.text.toString().trim()

            if (name.isEmpty()) {
                Toast.makeText(this, "نام را وارد کنید", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                repository.saveUser(phone, name, address, nid)
                Toast.makeText(this@ProfileActivity, "پروفایل ذخیره شد", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }
}

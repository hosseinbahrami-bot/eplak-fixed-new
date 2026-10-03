package com.example.eplakfixed

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class PaymentActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment)

        val phone = intent.getStringExtra("phone") ?: ""
        val repository = AppRepository(this)

        val codeInput = findViewById<EditText>(R.id.editTextCode)
        val titleInput = findViewById<EditText>(R.id.editTextTitle)
        val amountInput = findViewById<EditText>(R.id.editTextAmount)
        val dueInput = findViewById<EditText>(R.id.editTextDueDate)
        val saveButton = findViewById<Button>(R.id.buttonSavePayment)

        saveButton.setOnClickListener {
            val code = codeInput.text.toString().trim()
            val title = titleInput.text.toString().trim()
            val amount = amountInput.text.toString().toDoubleOrNull() ?: 0.0
            val dueDate = dueInput.text.toString().trim()

            if (code.isEmpty() || title.isEmpty() || dueDate.isEmpty()) {
                Toast.makeText(this, "اطلاعات قبض را کامل کنید", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                repository.savePayment(phone, code, title, dueDate, amount)
                Toast.makeText(this@PaymentActivity, "پرداخت ذخیره شد", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }
}

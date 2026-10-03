package com.example.eplakfixed

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class ReportActivity : AppCompatActivity() {
    private lateinit var repository: AppRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_report)

        repository = AppRepository(this)
        val phone = intent.getStringExtra("phone") ?: ""

        val titleInput = findViewById<EditText>(R.id.editTextTitle)
        val descriptionInput = findViewById<EditText>(R.id.editTextDescription)
        val categoryInput = findViewById<EditText>(R.id.editTextCategory)
        val saveButton = findViewById<Button>(R.id.buttonSaveReport)

        saveButton.setOnClickListener {
            val title = titleInput.text.toString().trim()
            val description = descriptionInput.text.toString().trim()
            val category = categoryInput.text.toString().trim()

            if (title.isEmpty() || description.isEmpty() || category.isEmpty()) {
                Toast.makeText(this, "همه فیلدها را پر کنید", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            lifecycleScope.launch {
                repository.saveReport(phone, title, description, category)
                repository.saveNotification(phone, "درخواست ثبت شد", "گزارش شما با موفقیت ثبت شد")
                Toast.makeText(this@ReportActivity, "گزارش ثبت شد", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }
}

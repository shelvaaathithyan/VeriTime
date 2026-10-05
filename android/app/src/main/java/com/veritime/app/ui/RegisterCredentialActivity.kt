package com.veritime.app.ui

import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.veritime.app.api.ApiClient
import com.veritime.app.databinding.ActivityRegisterCredentialBinding
import kotlinx.coroutines.launch

/**
 * DEVELOPMENT / ADMIN ONLY — NFC Credential Registration
 *
 * This screen allows an administrator to associate a real NFC card identifier
 * (as detected by the security check-in screen) with a student record.
 *
 * This screen does NOT:
 *  - Simulate an NFC scan
 *  - Clone any card
 *  - Perform any automatic card detection
 *
 * The administrator must manually enter (or paste) the card identifier
 * that was displayed by the Main security screen after a real card scan.
 */
class RegisterCredentialActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRegisterCredentialBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterCredentialBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Register NFC Credential"

        // Pre-fill if card identifier was passed from MainActivity
        intent.getStringExtra("lastCardIdentifier")?.let { id ->
            binding.etCardIdentifier.setText(id)
        }

        // Populate student type spinner
        val types = listOf("Day Scholar", "Hostel")
        val adapter = ArrayAdapter(this, com.veritime.app.R.layout.spinner_item, types)
        adapter.setDropDownViewResource(com.veritime.app.R.layout.spinner_dropdown_item)
        binding.spinnerStudentType.adapter = adapter

        binding.btnRegister.setOnClickListener {
            val cardId = binding.etCardIdentifier.text.toString().trim()
            val studentNumber = binding.etStudentNumber.text.toString().trim()
            val studentName = binding.etStudentName.text.toString().trim()
            val department = binding.etDepartment.text.toString().trim()
            val studentType = binding.spinnerStudentType.selectedItem.toString()

            if (cardId.isBlank()) {
                binding.etCardIdentifier.error = "Enter a card identifier from the security screen"
                return@setOnClickListener
            }
            if (studentNumber.isBlank()) {
                binding.etStudentNumber.error = "Enter student number"
                return@setOnClickListener
            }
            if (studentName.isBlank()) {
                binding.etStudentName.error = "Enter student name"
                return@setOnClickListener
            }
            if (department.isBlank()) {
                binding.etDepartment.error = "Enter department"
                return@setOnClickListener
            }

            registerCredential(cardId, studentNumber, studentName, department, studentType)
        }
    }

    private fun registerCredential(cardId: String, studentNumber: String, studentName: String, department: String, studentType: String) {
        binding.btnRegister.isEnabled = false
        binding.progressBar.visibility = View.VISIBLE
        binding.resultCard.visibility = View.GONE

        lifecycleScope.launch {
            try {
                // 1. Create or update the student
                val studentCreated = ApiClient.createStudent(studentNumber, studentName, department, studentType)

                // 2. Register the NFC credential
                val success = ApiClient.registerCredential(cardId, studentNumber)
                
                runOnUiThread {
                    binding.progressBar.visibility = View.GONE
                    binding.resultCard.visibility = View.VISIBLE
                    if (success) {
                        binding.tvResult.text = "✓ Credential registered successfully.\n\n$cardId → $studentNumber"
                        binding.tvResult.setTextColor(getColor(android.R.color.holo_green_dark))
                    } else {
                        binding.tvResult.text = "Registration failed. This NFC card may already be registered to another student."
                        binding.tvResult.setTextColor(getColor(android.R.color.holo_red_dark))
                        binding.btnRegister.isEnabled = true
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    binding.progressBar.visibility = View.GONE
                    binding.resultCard.visibility = View.VISIBLE
                    
                    if (e.message?.contains("409") == true) {
                        binding.tvResult.text = "This NFC card is already registered to a student."
                    } else {
                        binding.tvResult.text = "Error: ${e.message}\n\nEnsure VeriTime backend is running."
                    }
                    binding.tvResult.setTextColor(getColor(android.R.color.holo_red_dark))
                    binding.btnRegister.isEnabled = true
                }
            }
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }
}

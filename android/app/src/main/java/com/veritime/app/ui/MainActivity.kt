package com.veritime.app.ui

import android.app.PendingIntent
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.veritime.app.R
import com.veritime.app.api.ApiClient
import com.veritime.app.databinding.ActivityMainBinding
import com.veritime.app.model.NfcCardData
import com.veritime.app.model.NfcLookupResponse
import com.veritime.app.nfc.NfcCardReader
import com.veritime.app.util.DeviceSettings
import com.veritime.app.util.QrCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * VeriTime Security Check-in Activity
 *
 * This is the main screen for security personnel.
 * It uses the phone's REAL NFC hardware via NfcAdapter to detect
 * actual college NFC ID cards.
 *
 * IMPORTANT: This activity does NOT simulate NFC scans.
 * A real physical NFC card must be tapped on the phone.
 */
class MainActivity : AppCompatActivity(), NfcAdapter.ReaderCallback {

    private lateinit var binding: ActivityMainBinding
    private var nfcAdapter: NfcAdapter? = null

    // State
    private var detectedCardData: NfcCardData? = null
    private var lookupResponse: NfcLookupResponse? = null
    private var checkinTimestamp: String? = null
    private lateinit var settings: DeviceSettings
    private var autoResetJob: Job? = null

    companion object {
        private const val TAG = "VeriTime-Main"
        // Includes the timezone offset so the server reads the time correctly
        private val ISO_TS = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
        // Classroom mode runs unattended: return to the ready screen automatically
        private const val RESET_AFTER_ON_TIME_MS = 4_000L
        private const val RESET_AFTER_LATE_MS = 60_000L
        private val DISPLAY_TS = SimpleDateFormat("hh:mm a", Locale.US)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        settings = DeviceSettings(this)
        updateModeBanner()

        checkNfcStatus()
        if (settings.isClassroom && settings.room.isBlank()) showDeviceModeDialog()

        binding.btnRecordCheckin.setOnClickListener {
            recordCheckin()
        }

        binding.btnReset.setOnClickListener {
            resetToReady()
        }
    }

    private fun checkNfcStatus() {
        when {
            nfcAdapter == null -> {
                showError("NFC is not available on this device.")
            }
            !nfcAdapter!!.isEnabled -> {
                showError("Please enable NFC in Android settings.")
            }
            else -> {
                showReadyState()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Enable NFC reader mode — listens for real NFC cards
        nfcAdapter?.enableReaderMode(
            this,
            this,
            NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_NFC_F or
            NfcAdapter.FLAG_READER_NFC_V or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            null
        )
        Log.d(TAG, "NFC reader mode enabled")
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableReaderMode(this)
        Log.d(TAG, "NFC reader mode disabled")
    }

    /**
     * Called by NfcAdapter when a REAL NFC card is detected.
     * This is the actual hardware callback — not a simulation.
     */
    override fun onTagDiscovered(tag: Tag?) {
        if (tag == null) return
        Log.d(TAG, "Real NFC tag detected: ${tag.id.contentToString()}")

        try {
            val cardData = NfcCardReader.readCard(tag)
            runOnUiThread {
                autoResetJob?.cancel()
                resetToReady()
                detectedCardData = cardData
                showCardDetected(cardData)
                lookupStudent(cardData)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading NFC card: ${e.message}")
            runOnUiThread {
                showError("NFC card detected, but an error occurred reading it: ${e.message}")
            }
        }
    }

    private fun lookupStudent(cardData: NfcCardData) {
        showLookingUp()
        checkinTimestamp = ISO_TS.format(Date())

        lifecycleScope.launch {
            try {
                val response = ApiClient.lookupNfcCard(cardData.identifier, settings.mode)
                lookupResponse = response

                withContext(Dispatchers.Main) {
                    if (response.registered && response.student != null) {
                        showStudentFound(cardData, response)
                        // No guard at the classroom door — record the tap straight away
                        if (settings.isClassroom) recordCheckin()
                    } else {
                        showUnknownCard(response.message)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Lookup failed: ${e.message}")
                withContext(Dispatchers.Main) {
                    showLookupError(e.message ?: "Network error")
                }
            }
        }
    }

    private fun recordCheckin() {
        val card = detectedCardData ?: return
        val lookup = lookupResponse ?: return
        val student = lookup.student ?: return
        val ts = checkinTimestamp ?: ISO_TS.format(Date())

        binding.btnRecordCheckin.isEnabled = false
        binding.btnRecordCheckin.text = "Recording..."

        lifecycleScope.launch {
            try {
                val result = ApiClient.recordCheckin(
                    cardIdentifier = card.identifier,
                    studentId = student.id,
                    timestamp = ts,
                    readerId = settings.readerId,
                    location = settings.location,
                    checkpoint = settings.mode,
                    room = if (settings.isClassroom) settings.room else null
                )

                withContext(Dispatchers.Main) {
                    if (result.success) {
                        showCheckinSuccess(result.student?.name ?: student.name, result)
                    } else {
                        binding.btnRecordCheckin.isEnabled = true
                        binding.btnRecordCheckin.text = getString(R.string.record_checkin)
                        showError("Check-in failed. Please try again.")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Checkin failed: ${e.message}")
                withContext(Dispatchers.Main) {
                    binding.btnRecordCheckin.isEnabled = true
                    binding.btnRecordCheckin.text = getString(R.string.record_checkin)
                    showError("Network error: ${e.message}")
                }
            }
        }
    }

    // --- UI State Methods ---

    private fun showReadyState() {
        binding.apply {
            statusIcon.setImageResource(R.drawable.ic_nfc_ready)
            statusTitle.text = "NFC READY"
            statusTitle.setTextColor(getColor(R.color.navy_600))
            statusSubtitle.text = if (settings.isClassroom)
                "Tap your college ID card to enter ${settings.room.ifBlank { "class" }}"
            else
                "Tap student's college ID card on this phone"
            statusSubtitle.visibility = View.VISIBLE
            cardInfo.visibility = View.GONE
            studentInfo.visibility = View.GONE
            checkinSuccess.visibility = View.GONE
            qrSection.visibility = View.GONE
            btnRecordCheckin.visibility = View.GONE
            btnReset.visibility = View.GONE
            progressIndicator.visibility = View.GONE
            errorCard.visibility = View.GONE
        }
    }

    private fun showCardDetected(cardData: NfcCardData) {
        binding.apply {
            statusIcon.setImageResource(R.drawable.ic_nfc_detected)
            statusTitle.text = "✓ NFC CARD DETECTED"
            statusTitle.setTextColor(getColor(R.color.emerald_600))
            statusSubtitle.text = "Identifying student..."
            cardInfo.visibility = View.VISIBLE
            tvCardIdentifier.text = cardData.identifier
            tvNfcTechnology.text = cardData.technology
            studentInfo.visibility = View.GONE
            btnRecordCheckin.visibility = View.GONE
        }
    }

    private fun showLookingUp() {
        binding.progressIndicator.visibility = View.VISIBLE
        binding.studentInfo.visibility = View.GONE
    }

    private fun showStudentFound(cardData: NfcCardData, response: NfcLookupResponse) {
        val student = response.student!!
        binding.apply {
            progressIndicator.visibility = View.GONE
            statusTitle.text = "✓ STUDENT IDENTIFIED"
            statusTitle.setTextColor(getColor(R.color.emerald_600))
            statusSubtitle.text = "Review details and record check-in"

            studentInfo.visibility = View.VISIBLE
            tvStudentName.text = student.name
            tvStudentId.text = student.id
            tvDepartment.text = student.department

            val arrivalDisplay = DISPLAY_TS.format(Date())
            tvArrivalTime.text = arrivalDisplay

            if (response.scheduledTime != null) {
                tvScheduledTime.text = formatScheduledDisplay(response.scheduledTime)
            } else {
                tvScheduledTime.text = "—"
            }

            if (response.isLate == true) {
                val lateMin = response.lateMinutes ?: 0
                tvLateBy.text = "$lateMin minutes"
                tvLateBy.setTextColor(getColor(R.color.orange_600))
                tvLateByLabel.text = "Late by"
            } else {
                when (response.scheduleStatus) {
                    "CAMPUS_ENTRY" -> {
                        tvLateBy.text = "Campus entry"
                        tvLateBy.setTextColor(getColor(R.color.navy_500))
                    }
                    "FREE_PERIOD" -> {
                        tvLateBy.text = "Free Period"
                        tvLateBy.setTextColor(getColor(R.color.navy_500))
                    }
                    "NO_SCHEDULED_CLASS" -> {
                        tvLateBy.text = "No Class"
                        tvLateBy.setTextColor(getColor(R.color.navy_500))
                    }
                    "DAY_SCHEDULE_COMPLETE" -> {
                        tvLateBy.text = "Schedule Done"
                        tvLateBy.setTextColor(getColor(R.color.navy_500))
                    }
                    else -> {
                        tvLateBy.text = "On time"
                        tvLateBy.setTextColor(getColor(R.color.emerald_600))
                    }
                }
                tvLateByLabel.text = "Status"
            }

            btnRecordCheckin.visibility = View.VISIBLE
            btnRecordCheckin.isEnabled = true
            btnRecordCheckin.text = getString(R.string.record_checkin)
            errorCard.visibility = View.GONE
        }
    }

    private fun showUnknownCard(message: String?) {
        binding.apply {
            progressIndicator.visibility = View.GONE
            statusTitle.text = "Unknown NFC Credential"
            statusTitle.setTextColor(getColor(R.color.orange_600))
            statusSubtitle.visibility = View.GONE
            studentInfo.visibility = View.GONE
            btnRecordCheckin.visibility = View.GONE
            errorCard.visibility = View.VISIBLE
            tvErrorMessage.text = message ?: "Unknown NFC credential.\nPlease contact administration."
            btnReset.visibility = View.VISIBLE
        }
    }

    private fun showLookupError(errorMessage: String) {
        binding.apply {
            progressIndicator.visibility = View.GONE
            errorCard.visibility = View.VISIBLE
            tvErrorMessage.text = "Backend connection failed:\n$errorMessage\n\nEnsure VeriTime backend is running."
            btnReset.visibility = View.VISIBLE
            studentInfo.visibility = View.GONE
            btnRecordCheckin.visibility = View.GONE
        }
    }

    private fun showCheckinSuccess(studentName: String, result: com.veritime.app.model.CheckinResponse) {
        binding.apply {
            checkinSuccess.visibility = View.VISIBLE
            studentInfo.visibility = View.GONE
            cardInfo.visibility = View.GONE
            btnRecordCheckin.visibility = View.GONE
            statusTitle.text = "✓ CHECK-IN RECORDED"
            statusTitle.setTextColor(getColor(R.color.emerald_600))
            statusSubtitle.visibility = View.GONE

            tvSuccessStudent.text = studentName
            tvSuccessTime.text = result.arrivalTime ?: DISPLAY_TS.format(Date())

            if (result.isLate == true) {
                val lateMin = result.lateMinutes ?: 0
                tvSuccessLate.text = "$lateMin minutes"
            } else {
                when (result.scheduleStatus) {
                    "CAMPUS_ENTRY" -> tvSuccessLate.text = "Entered campus"
                    "FREE_PERIOD" -> tvSuccessLate.text = "Free Period"
                    "NO_SCHEDULED_CLASS" -> tvSuccessLate.text = "No Class"
                    "DAY_SCHEDULE_COMPLETE" -> tvSuccessLate.text = "Schedule Done"
                    else -> tvSuccessLate.text = "On time"
                }
            }
            tvSuccessLocation.text = result.location ?: settings.location
            tvSuccessReader.text = result.readerId ?: settings.readerId

            // Late too many times this week: refuse entry, no QR (no reason is accepted)
            val url = result.explanationUrl
            if (result.entryDenied == true) {
                qrSection.visibility = View.VISIBLE
                tvQrTitle.text = "ENTRY NOT ALLOWED"
                ivQrCode.visibility = View.GONE
                tvQrHint.text = result.denialReason ?: "You have been late too many times this week."
            } else if (result.isLate == true && url != null) {
                // Late to class: show a QR code the student scans to record their explanation
                tvQrTitle.text = "LATE — DO NOT ENTER"
                ivQrCode.visibility = View.VISIBLE
                qrSection.visibility = View.VISIBLE
                ivQrCode.setImageBitmap(QrCode.create(url))
                val minutes = result.statementWindowMinutes ?: 10
                // First class of the morning / after lunch: show the gate scan alongside the door scan
                val times = if (result.sessionStart != null) {
                    val gate = result.gateEntryTime ?: "not scanned"
                    "Gate scan: $gate   ·   Door scan: ${result.arrivalTime}\n"
                } else {
                    "Door scan: ${result.arrivalTime}\n"
                }
                val gateWarning = if (result.gateScanMissing == true) "⚠ No gate scan recorded today\n" else ""
                tvQrHint.text = "$times$gateWarning\nScan this QR code with your phone and record your reason " +
                    "within $minutes minutes. You may enter the class after submitting it."
            } else {
                qrSection.visibility = View.GONE
            }

            btnReset.visibility = View.VISIBLE
        }

        if (settings.isClassroom) {
            autoResetJob?.cancel()
            autoResetJob = lifecycleScope.launch {
                delay(if (result.isLate == true) RESET_AFTER_LATE_MS else RESET_AFTER_ON_TIME_MS)
                resetToReady()
            }
        }
    }

    private fun updateModeBanner() {
        binding.toolbar.subtitle = if (settings.isClassroom)
            "Classroom ${settings.room.ifBlank { "(room not set)" }}"
        else
            "Gate — campus entry"
    }

    private fun showDeviceModeDialog() {
        val padding = (20 * resources.displayMetrics.density).toInt()
        val gateOption = RadioButton(this).apply { id = View.generateViewId(); text = "Gate (records campus entry)" }
        val classOption = RadioButton(this).apply { id = View.generateViewId(); text = "Classroom door (decides lateness)" }
        val group = RadioGroup(this).apply {
            addView(gateOption)
            addView(classOption)
            check(if (settings.isClassroom) classOption.id else gateOption.id)
        }
        val roomInput = EditText(this).apply {
            hint = "Room, e.g. Q301"
            setText(settings.room)
            isEnabled = settings.isClassroom
        }
        group.setOnCheckedChangeListener { _, checkedId -> roomInput.isEnabled = checkedId == classOption.id }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding / 2, padding, 0)
            addView(group)
            addView(roomInput)
        }

        AlertDialog.Builder(this)
            .setTitle("Where is this phone?")
            .setView(layout)
            .setPositiveButton("Save") { _, _ ->
                settings.mode = if (group.checkedRadioButtonId == classOption.id)
                    DeviceSettings.MODE_CLASSROOM else DeviceSettings.MODE_GATE
                if (settings.isClassroom) settings.room = roomInput.text.toString()
                updateModeBanner()
                resetToReady()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showError(message: String) {
        binding.apply {
            errorCard.visibility = View.VISIBLE
            tvErrorMessage.text = message
            statusTitle.text = "Error"
            statusTitle.setTextColor(getColor(R.color.red_600))
        }
    }

    private fun resetToReady() {
        detectedCardData = null
        lookupResponse = null
        checkinTimestamp = null
        showReadyState()
    }

    private fun formatScheduledDisplay(time: String): String {
        // "08:00" → "08:00 AM"
        val parts = time.split(":")
        val h = parts[0].toIntOrNull() ?: 8
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val ampm = if (h >= 12) "PM" else "AM"
        val h12 = if (h % 12 == 0) 12 else h % 12
        return String.format("%02d:%02d %s", h12, m, ampm)
    }

    // Menu
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_device_mode -> {
                showDeviceModeDialog()
                true
            }
            R.id.action_register -> {
                startActivity(Intent(this, RegisterCredentialActivity::class.java).apply {
                    detectedCardData?.let { putExtra("lastCardIdentifier", it.identifier) }
                })
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}

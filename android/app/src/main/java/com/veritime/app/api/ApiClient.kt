package com.veritime.app.api

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.veritime.app.model.CheckinResponse
import com.veritime.app.model.NfcLookupResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * API client for VeriTime backend.
 * Change BASE_URL to match your local machine's IP when testing from Android emulator or physical device.
 *
 * Emulator: http://10.253.186.11:5001
 * Physical device on same WiFi: http://<your-machine-ip>:5001
 */
object ApiClient {

    // ⚠️ For physical device testing: replace with your machine's local IP (e.g., http://192.168.1.100:5001)
    // For Android emulator: use http://10.253.186.11:5001
    var BASE_URL = "http://192.168.1.36:5001"

    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    /**
     * POST /api/nfc/lookup
     * Looks up a student by their NFC card identifier.
     * Only the identifier legitimately exposed by the card is sent.
     */
    suspend fun lookupNfcCard(cardIdentifier: String, checkpoint: String): NfcLookupResponse = withContext(Dispatchers.IO) {
        val body = JsonObject().apply {
            addProperty("cardIdentifier", cardIdentifier)
            addProperty("checkpoint", checkpoint)
        }
        val request = Request.Builder()
            .url("$BASE_URL/api/nfc/lookup")
            .post(gson.toJson(body).toRequestBody(JSON))
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string() ?: throw IOException("Empty response")
                Log.d("VeriTime", "NFC Lookup response: $bodyStr")
                gson.fromJson(bodyStr, NfcLookupResponse::class.java)
            }
        } catch (e: Exception) {
            Log.e("VeriTime", "NFC lookup failed: ${e.message}")
            throw e
        }
    }

    /**
     * POST /api/checkins
     * Records the student's check-in with the actual arrival timestamp.
     */
    suspend fun recordCheckin(
        cardIdentifier: String,
        studentId: String,
        timestamp: String,
        readerId: String,
        location: String,
        checkpoint: String,      // "GATE" records campus entry; "CLASSROOM" decides lateness
        room: String? = null
    ): CheckinResponse = withContext(Dispatchers.IO) {
        val body = JsonObject().apply {
            addProperty("cardIdentifier", cardIdentifier)
            addProperty("studentId", studentId)
            addProperty("timestamp", timestamp)
            addProperty("readerId", readerId)
            addProperty("location", location)
            addProperty("checkpoint", checkpoint)
            room?.let { addProperty("room", it) }
        }
        val request = Request.Builder()
            .url("$BASE_URL/api/checkins")
            .post(gson.toJson(body).toRequestBody(JSON))
            .build()

        client.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string() ?: throw IOException("Empty response")
            Log.d("VeriTime", "Checkin response: $bodyStr")
            gson.fromJson(bodyStr, CheckinResponse::class.java)
        }
    }

    /**
     * POST /api/nfc/register
     * Associate a real detected NFC card identifier with a student.
     * DEVELOPMENT/ADMIN USE ONLY.
     */
    suspend fun registerCredential(cardIdentifier: String, studentId: String): Boolean =
        withContext(Dispatchers.IO) {
            val body = JsonObject().apply {
                addProperty("cardIdentifier", cardIdentifier)
                addProperty("studentId", studentId)
            }
            val request = Request.Builder()
                .url("$BASE_URL/api/nfc/register")
                .post(gson.toJson(body).toRequestBody(JSON))
                .build()

            client.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        }
    /**
     * POST /api/students
     * Creates a new student record
     */
    suspend fun createStudent(
        studentNumber: String,
        name: String,
        department: String,
        studentType: String
    ): Boolean = withContext(Dispatchers.IO) {
        val body = JsonObject().apply {
            addProperty("studentNumber", studentNumber)
            addProperty("name", name)
            addProperty("department", department)
            addProperty("studentType", studentType)
        }
        val request = Request.Builder()
            .url("$BASE_URL/api/students")
            .post(gson.toJson(body).toRequestBody(JSON))
            .build()

        client.newCall(request).execute().use { response ->
            response.isSuccessful || response.code == 409 // 409 means already exists, which is fine
        }
    }
}

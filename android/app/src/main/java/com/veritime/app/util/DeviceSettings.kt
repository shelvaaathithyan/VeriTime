package com.veritime.app.util

import android.content.Context

/**
 * Where this phone is installed.
 * GATE      — security guard at the campus gate; records campus entry only.
 * CLASSROOM — fixed at a classroom door; students tap in and lateness is decided here.
 */
class DeviceSettings(context: Context) {
    private val prefs = context.getSharedPreferences("veritime_device", Context.MODE_PRIVATE)

    var mode: String
        get() = prefs.getString(KEY_MODE, MODE_GATE) ?: MODE_GATE
        set(value) = prefs.edit().putString(KEY_MODE, value).apply()

    var room: String
        get() = prefs.getString(KEY_ROOM, "") ?: ""
        set(value) = prefs.edit().putString(KEY_ROOM, value.trim().uppercase()).apply()

    val isClassroom: Boolean get() = mode == MODE_CLASSROOM

    val location: String get() = if (isClassroom) "Classroom ${room.ifBlank { "?" }}" else "Main Gate"

    val readerId: String get() = if (isClassroom) "CLASSROOM_${room.ifBlank { "UNSET" }}" else "GATE_PHONE_01"

    companion object {
        const val MODE_GATE = "GATE"
        const val MODE_CLASSROOM = "CLASSROOM"
        private const val KEY_MODE = "mode"
        private const val KEY_ROOM = "room"
    }
}

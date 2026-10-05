package com.veritime.app.model

data class Student(
    val id: String,
    val name: String,
    val department: String,
    val studentType: String
)

data class NfcLookupResponse(
    val registered: Boolean,
    val message: String? = null,
    val student: Student? = null,
    val scheduledTime: String? = null,
    val currentTime: String? = null,
    val lateMinutes: Int? = null,
    val isLate: Boolean? = null,
    val scheduleStatus: String? = null
)

data class CheckinResponse(
    val success: Boolean,
    val checkinId: String? = null,
    val lateArrivalId: String? = null,
    val student: Student? = null,
    val arrivalTime: String? = null,
    val scheduledTime: String? = null,
    val lateMinutes: Int? = null,
    val isLate: Boolean? = null,
    val scheduleStatus: String? = null,
    val location: String? = null,
    val readerId: String? = null,
    val timestamp: String? = null
)

data class NfcCardData(
    val identifier: String,
    val technology: String,
    val rawBytes: ByteArray? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is NfcCardData) return false
        return identifier == other.identifier && technology == other.technology
    }
    override fun hashCode(): Int = identifier.hashCode()
}

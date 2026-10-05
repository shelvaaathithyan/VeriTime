package com.veritime.app.nfc

import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import android.util.Log
import com.veritime.app.model.NfcCardData

/**
 * NFC Card Reader
 *
 * Reads ONLY the information legitimately exposed by the NFC card.
 * This reader does NOT:
 *  - Clone the card
 *  - Emulate the card
 *  - Modify card data
 *  - Attempt to access protected sectors
 *  - Crack any credentials
 *  - Copy sensitive secure data
 *
 * It reads the card's UID/identifier that the card itself exposes publicly,
 * and detects the NFC technology type. This is comparable to reading
 * a publicly visible ID number printed on a card.
 */
object NfcCardReader {

    private const val TAG = "VeriTime-NFC"

    /**
     * Read the card's public identifier and technology type.
     * The UID is a read-only hardware identifier exposed by all NFC cards
     * per the NFC/ISO 14443 specification.
     */
    fun readCard(tag: Tag): NfcCardData {
        val id = tag.id
        val identifier = bytesToHex(id)
        val technology = detectTechnology(tag)

        Log.d(TAG, "Card detected — ID: $identifier, Tech: $technology")

        return NfcCardData(
            identifier = identifier,
            technology = technology,
            rawBytes = id
        )
    }

    /**
     * Detect the NFC technology exposed by this card.
     * Only identifies the technology — does not attempt to access data.
     */
    private fun detectTechnology(tag: Tag): String {
        val techList = tag.techList.toSet()
        return when {
            techList.contains(IsoDep::class.java.name) -> "ISO-DEP (ISO 14443-4)"
            techList.contains(NfcA::class.java.name) -> "NFC-A (ISO 14443-3A)"
            techList.contains(NfcB::class.java.name) -> "NFC-B (ISO 14443-3B)"
            techList.contains(NfcF::class.java.name) -> "NFC-F (JIS 6319-4)"
            techList.contains(NfcV::class.java.name) -> "NFC-V (ISO 15693)"
            techList.contains(MifareClassic::class.java.name) -> "MIFARE Classic"
            techList.contains(MifareUltralight::class.java.name) -> "MIFARE Ultralight"
            techList.contains(Ndef::class.java.name) -> "NDEF"
            else -> "Unknown NFC"
        }
    }

    /**
     * Convert byte array to colon-separated hex string.
     * Example: [0x04, 0xA7, 0x23] → "04:A7:23"
     */
    fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString(":") { byte ->
            String.format("%02X", byte)
        }
    }
}

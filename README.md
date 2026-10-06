# VeriTime: Context-Aware Late Arrival Verification System

## Project Overview
VeriTime is a decision-support prototype built for a university Design Thinking project. It aims to provide an evidence-based, objective, and privacy-respecting approach to understanding why students arrive late. 

The prototype reads NFC information legitimately exposed by the student's college credential. It does not clone, modify, emulate, or bypass the credential. The system gathers contextual evidence—such as local weather and transport delays—to provide a verification status (e.g., *Supported*, *Partially Supported*, *Inconsistent*) that helps teachers make fair decisions without acting as a "lie detector" or accusing students.

The Android application is the security reader. The web frontend is used for student and teacher workflows. The backend provides the central API and evidence-processing layer.

## Problem Statement
Late arrivals are often handled subjectively, leading to potential bias, student frustration, and unfair penalties. Traditional systems only record the time of arrival, ignoring external factors like weather or transport issues that are beyond the student's control.

## Design Thinking Motivation
Through user interviews (students, teachers, security), we discovered:
- **Students** feel anxious when no one believes their genuine reasons for being late.
- **Teachers** find it difficult and time-consuming to verify every student's excuse.
- **Security** personnel need a fast, frictionless way to record arrivals without causing bottlenecks.

VeriTime shifts the paradigm from "punishment and suspicion" to "context-awareness and support."

## System Architecture
The system consists of three distinct components:
1. **Android NFC Security Application (`android/`)**: A native Kotlin application used by security personnel. It uses the device's real NFC hardware to scan student ID cards.
2. **Backend API (`backend/`)**: A Node.js/Express server with SQLite that handles timetable logic, stores check-ins, processes contextual evidence, and calculates lateness.
3. **Frontend Web Application (`frontend/`)**: A React/TypeScript/Vite portal for students to submit explanations and for teachers to review evidence.

## Core Workflows
### 1. NFC Check-ins (Android app, two device modes)
The same Android app runs in one of two modes, set from the menu (**Device Mode**):
- **Gate** — the security guard taps the student's card at the campus gate. This only records when the student entered campus; it never marks anyone late.
- **Classroom** — a phone fixed at the classroom door (set to a room, e.g. `Q301`). Students tap in themselves and the check-in is recorded automatically. **Only classroom taps decide lateness**, using the timetable.

The server's clock is used if the phone's clock is more than 2 minutes off.

### 2. Student Explanation (within 10 minutes)
After a late classroom tap, the door phone shows a QR code. The student scans it, signs in, and records a spoken explanation on their own phone. They have `STATEMENT_WINDOW_MINUTES` (default 10) from the tap; after that, recording is locked and the teacher sees "No statement in time". The recording is transcribed by Gemini and used as evidence. The audio itself is not stored.

### 3. Evidence Engine
The backend evidence engine evaluates the student's explanation against: their gate entry time (if they entered campus before class started, the delay happened on campus and journey-related reasons don't apply), their home-to-campus commute and live traffic (Google Maps), live weather (OpenWeatherMap), what they said, and their student type. It generates a verification status.

### 4. Teacher Dashboard
The teacher reviews the late arrival case, seeing the evidence timeline (scheduled time, arrival time, contextual data) and the verification status. The teacher makes the final decision: *Excuse*, *Mark as Late*, or *Request Further Evidence*.

## Installation & Running the Project

### Prerequisites
- Node.js (v18+)
- Android Studio (for the NFC app)
- An NFC-enabled Android physical device (Emulator NFC simulation is not supported for real card scanning)

### Running the Backend
```bash
cd backend
npm install
npm run dev
```
The API will run on `http://localhost:5001`. (Port 5000 is avoided because macOS AirPlay Receiver uses it.)

Copy `backend/.env.example` to `backend/.env` and fill in the Google Maps, OpenWeatherMap and Gemini API keys.

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```
The web app will run on `http://localhost:5173`.

### Opening the Student Page on Phones
Students record their explanation on their own phone, and browsers only allow microphone access over HTTPS. Run the frontend in phone mode instead:
```bash
cd frontend
npm run dev:phone
```
Vite prints a `Network:` address such as `https://192.168.0.104:5173`. Students on the same Wi-Fi open `https://<that-address>/explanation`. The certificate is self-signed, so the browser shows a warning the first time — tap **Advanced → Proceed**. API calls go through the same address, so phones never need to reach port 5001 directly.

### Running the Android App
1. Open the `android/` directory in Android Studio.
2. If testing on a physical device on your local Wi-Fi, change `BASE_URL` in `ApiClient.kt` to your computer's local IP address (e.g., `http://192.168.1.100:5001`). If using an emulator, use `http://10.0.2.2:5001`.
3. Build and run the app on your NFC-enabled device.

## NFC Testing & Development
To test the system without integrating with the university's main database, use the **NFC Credential Management** page on the frontend or the **Register Credential** menu option in the Android app.
1. Tap a real NFC card to the security app to view its identifier.
2. Use the Register page to associate that identifier with one of the demo student accounts.

## Privacy Considerations
- **No Card Cloning**: The system only reads the hardware UID publicly exposed by the card.
- **Data Minimization**: Only the identifier needed for database lookup is read.
- **Contextual History**: Historical lateness is shown for context only, and the system explicitly avoids framing this as proof of dishonesty.
- **Human-in-the-Loop**: The system is a decision-support tool. It never makes automatic disciplinary decisions.

## Limitations
- For the MVP, weather and transport data are seeded mock data, not live API feeds.
- The MVP uses SQLite for ease of setup; production would require PostgreSQL/MongoDB.
- Authentication/Authorization (login screens) are bypassed in the MVP to focus on the core user journeys.

## Future Improvements
- Integration with live transit APIs (e.g., local bus/train APIs) and weather APIs.
- Automated email/SMS notifications to students upon check-in.
- Advanced analytics dashboard for administration to identify systemic transport issues.

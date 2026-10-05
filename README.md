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
### 1. Android NFC Security Application
The security guard taps a student's ID card against the phone. The app reads the card's UID, looks up the student in the backend, calculates the late duration based on the timetable, and records the check-in.

### 2. Student Explanation
If marked late, the student logs into the web frontend, selects their late arrival record, and submits an explanation (e.g., "Transport Delay", "Heavy Rain").

### 3. Evidence Engine
The backend evidence engine evaluates the student's explanation against available data (weather reports, transport delay records, student type). It generates a verification status.

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
The API will run on `http://localhost:5000`.

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```
The web app will run on `http://localhost:5173`.

### Running the Android App
1. Open the `android/` directory in Android Studio.
2. If testing on a physical device on your local Wi-Fi, change `BASE_URL` in `ApiClient.kt` to your computer's local IP address (e.g., `http://192.168.1.100:5000`). If using an emulator, keep it as `http://10.0.2.2:5000`.
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

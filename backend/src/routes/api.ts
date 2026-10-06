import { Router } from 'express';
import { nfcLookup, nfcRegister, getCredentials } from '../controllers/nfcController';
import {
  createCheckin, getCheckins, getLateArrivals, getLateArrivalEvidence, getMyLateCheckins,
  submitExplanation, submitStatement, submitTeacherDecision, getStudents, getStudentById, getDashboard, createStudent, getExplanationDetails
} from '../controllers/checkinController';
import { loginHandler, logoutHandler, meHandler } from '../controllers/authController';
import { simulateArrival } from '../controllers/simulatorController';
import { getTimetable, getMyClasses, getClassAttendance } from '../controllers/teacherController';
import { requireAuth } from '../services/authService';

const router = Router();
const teacherOnly = requireAuth('TEACHER');
const studentOnly = requireAuth('STUDENT');

// Auth
router.post('/auth/login', loginHandler);
router.post('/auth/logout', logoutHandler);
router.get('/auth/me', requireAuth(), meHandler);

// Security guard's Android app — no login on the gate device
router.post('/nfc/lookup', nfcLookup);
router.post('/nfc/register', nfcRegister);
router.post('/checkins', (req, res, next) => { createCheckin(req, res).catch(next); });
router.post('/students', createStudent);

// Student (no login required, capability URL based on checkinId)
router.get('/me/late-checkins', studentOnly, getMyLateCheckins); // keep auth for viewing history
router.get('/explanations/:checkinId', (req, res, next) => { getExplanationDetails(req, res).catch(next); });
router.post('/explanations', submitExplanation);
// Spoken (audio) or typed free-text explanation, transcribed and analysed by Gemini
router.post('/explanations/statement', (req, res, next) => { submitStatement(req, res).catch(next); });

// Teacher (logged in)
router.get('/nfc/credentials', teacherOnly, getCredentials);
router.get('/checkins', teacherOnly, getCheckins);
router.get('/late-arrivals', teacherOnly, getLateArrivals);
router.get('/late-arrivals/:id/evidence', teacherOnly, getLateArrivalEvidence);
router.post('/teacher-decision', teacherOnly, submitTeacherDecision);
router.get('/students', teacherOnly, getStudents);
router.get('/students/:id', teacherOnly, getStudentById);
router.get('/dashboard', teacherOnly, getDashboard);
router.get('/timetable', teacherOnly, getTimetable);
router.get('/teacher/classes', teacherOnly, getMyClasses);
router.get('/teacher/attendance', teacherOnly, getClassAttendance);

// Testing tool: simulate a gate + class door scan for any class in the timetable
router.post('/simulate/arrival', teacherOnly, (req, res, next) => { simulateArrival(req, res).catch(next); });

export default router;

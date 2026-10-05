import { Router } from 'express';
import { nfcLookup, nfcRegister, getCredentials } from '../controllers/nfcController';
import {
  createCheckin, getCheckins, getLateArrivals, getLateArrivalEvidence,
  submitExplanation, submitTeacherDecision, getStudents, getStudentById, getDashboard, createStudent
} from '../controllers/checkinController';

const router = Router();

// NFC routes
router.post('/nfc/lookup', nfcLookup);
router.post('/nfc/register', nfcRegister);
router.get('/nfc/credentials', getCredentials);

// Checkin routes
router.post('/checkins', createCheckin);
router.get('/checkins', getCheckins);

// Late arrivals
router.get('/late-arrivals', getLateArrivals);
router.get('/late-arrivals/:id/evidence', getLateArrivalEvidence);

// Explanations
router.post('/explanations', submitExplanation);

// Teacher decision
router.post('/teacher-decision', submitTeacherDecision);

// Students
router.get('/students', getStudents);
router.post('/students', createStudent);
router.get('/students/:id', getStudentById);

// Dashboard
router.get('/dashboard', getDashboard);

export default router;

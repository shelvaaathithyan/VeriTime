import { Request, Response } from 'express';
import db from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { runEvidenceEngine } from '../services/evidenceEngine';
import { calculateLateStatus } from '../services/timetableService';

function calcLateMinutes(arrival: string, scheduled: string): number {
  const [ah, am] = arrival.split(':').map(Number);
  const [sh, sm] = scheduled.split(':').map(Number);
  return (ah * 60 + am) - (sh * 60 + sm);
}

function timeFromISO(ts: string): string {
  const optionsTime: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Kolkata', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  };
  return new Intl.DateTimeFormat('en-US', optionsTime).format(new Date(ts));
}

function getTodayIST(): string {
  const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-US', optionsDate).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// POST /api/checkins
export function createCheckin(req: Request, res: Response): void {
  let { cardIdentifier, studentId, timestamp, readerId, location } = req.body;

  if (!timestamp) {
    res.status(400).json({ error: 'timestamp is required' });
    return;
  }

  // Derive studentId from cardIdentifier if present (security requirement)
  if (cardIdentifier) {
    const credential = db.prepare('SELECT student_id FROM nfc_credentials WHERE card_identifier = ? AND status = ?').get(cardIdentifier, 'ACTIVE') as any;
    if (credential) {
      studentId = credential.student_id;
    } else {
      res.status(403).json({ error: 'Invalid or unregistered NFC card' });
      return;
    }
  }

  if (!studentId) {
    res.status(400).json({ error: 'studentId is required if no valid cardIdentifier is provided' });
    return;
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const { isLate, lateMinutes, reason, scheduledStart, scheduledEnd, periodNumber, subjectCode } = calculateLateStatus(timestamp);
  const isLateBool = isLate;
  const arrivalTime = timeFromISO(timestamp);
  
  const lateMin = lateMinutes || 0;
  // NO FALLBACK. If scheduledStart is null, let it be null.
  const sTime = scheduledStart || null; 

  const checkinId = uuidv4();
  db.prepare(`
    INSERT INTO checkins (id, student_id, card_identifier, timestamp, reader_id, location, scheduled_time, scheduled_end, period, class_code, late_minutes, is_late, schedule_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(checkinId, studentId, cardIdentifier || null, timestamp, readerId || 'SECURITY_PHONE_01',
    location || 'Main Gate', sTime, scheduledEnd || null, periodNumber || null, subjectCode || null, lateMin, isLateBool ? 1 : 0, reason);

  let lateArrivalId: string | null = null;
  if (isLateBool) {
    lateArrivalId = uuidv4();
    db.prepare(`
      INSERT INTO late_arrivals (id, checkin_id, student_id, verification_status)
      VALUES (?, ?, ?, 'PENDING')
    `).run(lateArrivalId, checkinId, studentId);
  }

  res.json({
    success: true,
    checkinId,
    lateArrivalId,
    studentId: student.id,
    studentName: student.name,
    department: student.department,
    arrivalTime,
    date: new Date(timestamp).toLocaleDateString('en-IN'),
    day: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(timestamp)),
    period: periodNumber || null,
    classCode: subjectCode || null,
    room: null,
    scheduledStart: sTime,
    scheduledEnd: scheduledEnd || null,
    status: reason,
    lateMinutes: lateMin,
    // Keep old ones just in case
    scheduledTime: sTime,
    isLate: isLateBool,
    scheduleStatus: reason,
    location: location || 'Main Gate',
    readerId: readerId || 'SECURITY_PHONE_01',
    timestamp,
  });
}

// GET /api/checkins
export function getCheckins(req: Request, res: Response): void {
  const today = getTodayIST();
  const rows = db.prepare(`
    SELECT c.*, s.name, s.department, s.student_type
    FROM checkins c
    JOIN students s ON c.student_id = s.id
    WHERE date(c.timestamp) = ?
    ORDER BY c.timestamp DESC
  `).all(today);
  res.json(rows);
}

// GET /api/late-arrivals
export function getLateArrivals(req: Request, res: Response): void {
  const today = getTodayIST();
  const rows = db.prepare(`
    SELECT la.*, s.name, s.department, s.student_type,
           c.timestamp, c.scheduled_time, c.late_minutes, c.location, c.reader_id,
           e.reason, e.additional_explanation,
           td.teacher_decision,
           c.class_code
    FROM late_arrivals la
    JOIN students s ON la.student_id = s.id
    JOIN checkins c ON la.checkin_id = c.id
    LEFT JOIN explanations e ON la.explanation_id = e.id
    LEFT JOIN teacher_decisions td ON td.late_arrival_id = la.id
    WHERE date(c.timestamp) = ?
    ORDER BY c.timestamp DESC
  `).all(today);
  res.json(rows);
}

// GET /api/late-arrivals/:id/evidence
export function getLateArrivalEvidence(req: Request, res: Response): void {
  const { id } = req.params;
  const la = db.prepare(`
    SELECT la.*, s.name, s.department, s.student_type,
           c.timestamp, c.scheduled_time, c.late_minutes, c.location, c.reader_id, c.card_identifier,
           e.reason, e.additional_explanation, e.timestamp as explanation_timestamp
    FROM late_arrivals la
    JOIN students s ON la.student_id = s.id
    JOIN checkins c ON la.checkin_id = c.id
    LEFT JOIN explanations e ON la.explanation_id = e.id
    WHERE la.id = ?
  `).get(id) as any;

  if (!la) {
    res.status(404).json({ error: 'Late arrival not found' });
    return;
  }

  const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-US', optionsDate).formatToParts(new Date(la.timestamp));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const today = `${year}-${month}-${day}`;
  const weather = db.prepare('SELECT * FROM weather_records WHERE date = ?').get(today) as any;
  const transport = db.prepare('SELECT * FROM transport_events WHERE date = ?').get(today) as any;
  const historicalCount = (db.prepare(`
    SELECT COUNT(*) as count FROM checkins
    WHERE student_id = ? AND is_late = 1 AND date(timestamp) < ?
  `).get(la.student_id, today) as any).count;

  const teacherDecision = db.prepare('SELECT * FROM teacher_decisions WHERE late_arrival_id = ? ORDER BY timestamp DESC').get(id) as any;

  const evidence = la.evidence_json ? JSON.parse(la.evidence_json) : {};

  res.json({
    id: la.id,
    student: { id: la.student_id, name: la.name, department: la.department, studentType: la.student_type },
    checkin: {
      timestamp: la.timestamp,
      scheduledTime: la.scheduled_time,
      lateMinutes: la.late_minutes,
      location: la.location,
      readerId: la.reader_id,
    },
    explanation: la.reason ? {
      reason: la.reason,
      additionalExplanation: la.additional_explanation,
      timestamp: la.explanation_timestamp,
    } : null,
    weather: weather || null,
    transport: transport || null,
    historicalLateCount: historicalCount,
    verificationStatus: la.verification_status,
    verificationSummary: la.verification_summary,
    evidence: evidence.evidence || [],
    teacherDecision: teacherDecision || null,
  });
}

// POST /api/explanations
export function submitExplanation(req: Request, res: Response): void {
  const { checkinId, studentId, reason, additionalExplanation } = req.body;
  if (!checkinId || !studentId || !reason) {
    res.status(400).json({ error: 'checkinId, studentId, and reason are required' });
    return;
  }

  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ? AND student_id = ?').get(checkinId, studentId) as any;
  if (!checkin) {
    res.status(404).json({ error: 'Check-in not found' });
    return;
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-US', optionsDate).formatToParts(new Date(checkin.timestamp));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const today = `${year}-${month}-${day}`;
  const arrivalTime = timeFromISO(checkin.timestamp);
  const weather = db.prepare('SELECT * FROM weather_records WHERE date = ?').get(today) as any;
  const transport = db.prepare('SELECT * FROM transport_events WHERE date = ?').get(today) as any;
  const historicalCount = (db.prepare(`
    SELECT COUNT(*) as count FROM checkins WHERE student_id = ? AND is_late = 1 AND date(timestamp) < ?
  `).get(studentId, today) as any).count;

  const engineResult = runEvidenceEngine({
    arrivalTime,
    scheduledTime: checkin.scheduled_time,
    explanation: reason,
    transportDelayMinutes: transport?.delay_minutes || 0,
    weatherCondition: weather?.condition || 'Clear',
    weatherSeverity: weather?.severity || 'NONE',
    studentType: student?.student_type || 'Day Scholar',
    historicalLateCount: historicalCount,
  });

  const expId = uuidv4();
  db.prepare(`
    INSERT INTO explanations (id, checkin_id, student_id, reason, additional_explanation)
    VALUES (?, ?, ?, ?, ?)
  `).run(expId, checkinId, studentId, reason, additionalExplanation || null);

  // Update or create late arrival
  const la = db.prepare('SELECT * FROM late_arrivals WHERE checkin_id = ?').get(checkinId) as any;
  if (la) {
    db.prepare(`
      UPDATE late_arrivals SET explanation_id = ?, verification_status = ?, verification_summary = ?, evidence_json = ?
      WHERE id = ?
    `).run(expId, engineResult.status, engineResult.reasonSummary, JSON.stringify(engineResult), la.id);
  } else {
    const laId = uuidv4();
    db.prepare(`
      INSERT INTO late_arrivals (id, checkin_id, student_id, explanation_id, verification_status, verification_summary, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(laId, checkinId, studentId, expId, engineResult.status, engineResult.reasonSummary, JSON.stringify(engineResult));
  }

  res.json({
    success: true,
    explanationId: expId,
    verificationStatus: engineResult.status,
    verificationSummary: engineResult.reasonSummary,
    evidence: engineResult.evidence,
  });
}

// POST /api/teacher-decision
export function submitTeacherDecision(req: Request, res: Response): void {
  const { lateArrivalId, teacherDecision, teacherId, notes } = req.body;
  if (!lateArrivalId || !teacherDecision) {
    res.status(400).json({ error: 'lateArrivalId and teacherDecision are required' });
    return;
  }

  const validDecisions = ['EXCUSED', 'MARKED_LATE', 'REQUEST_FURTHER_EVIDENCE'];
  if (!validDecisions.includes(teacherDecision)) {
    res.status(400).json({ error: `teacherDecision must be one of: ${validDecisions.join(', ')}` });
    return;
  }

  const la = db.prepare('SELECT * FROM late_arrivals WHERE id = ?').get(lateArrivalId) as any;
  if (!la) {
    res.status(404).json({ error: 'Late arrival not found' });
    return;
  }

  const existing = db.prepare('SELECT id FROM teacher_decisions WHERE late_arrival_id = ?').get(lateArrivalId) as any;
  if (existing) {
    db.prepare('UPDATE teacher_decisions SET teacher_decision = ?, teacher_id = ?, notes = ?, timestamp = datetime(\'now\') WHERE late_arrival_id = ?')
      .run(teacherDecision, teacherId || null, notes || null, lateArrivalId);
  } else {
    db.prepare('INSERT INTO teacher_decisions (id, late_arrival_id, teacher_decision, teacher_id, notes) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), lateArrivalId, teacherDecision, teacherId || null, notes || null);
  }

  res.json({ success: true, lateArrivalId, teacherDecision });
}

// GET /api/students
export function getStudents(req: Request, res: Response): void {
  const students = db.prepare(`
    SELECT s.*, nc.status as nfc_status 
    FROM students s
    LEFT JOIN nfc_credentials nc ON nc.student_id = s.id
    ORDER BY s.id
  `).all();
  res.json(students);
}

// POST /api/students
export function createStudent(req: Request, res: Response): void {
  const { studentNumber, name, department, studentType, email } = req.body;
  if (!studentNumber || !name || !department || !studentType) {
    res.status(400).json({ error: 'studentNumber, name, department, and studentType are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM students WHERE id = ?').get(studentNumber) as any;
  if (existing) {
    res.status(409).json({ error: 'Student number already exists' });
    return;
  }

  db.prepare(`
    INSERT INTO students (id, name, department, student_type, email)
    VALUES (?, ?, ?, ?, ?)
  `).run(studentNumber, name, department, studentType, email || null);

  res.json({ success: true, student: { id: studentNumber, name, department, studentType, email } });
}

// GET /api/students/:id
export function getStudentById(req: Request, res: Response): void {
  const { id } = req.params;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
  if (!student) { res.status(404).json({ error: 'Student not found' }); return; }

  const history = db.prepare(`
    SELECT c.id as checkin_id, c.timestamp, c.scheduled_time, c.late_minutes, c.is_late, c.location, c.schedule_status,
           la.id as late_arrival_id, la.verification_status, e.reason,
           c.period, c.class_code
    FROM checkins c
    LEFT JOIN late_arrivals la ON la.checkin_id = c.id
    LEFT JOIN explanations e ON la.explanation_id = e.id
    WHERE c.student_id = ?
    ORDER BY c.timestamp DESC
    LIMIT 20
  `).all(id);

  const credential = db.prepare('SELECT status FROM nfc_credentials WHERE student_id = ?').get(id) as any;

  res.json({ ...student, history, credential: credential || null });
}

// GET /api/dashboard
export function getDashboard(req: Request, res: Response): void {
  const today = getTodayIST();
  const totalCheckins = (db.prepare(`SELECT COUNT(*) as c FROM checkins WHERE date(timestamp) = ?`).get(today) as any).c;
  const lateArrivals = (db.prepare(`SELECT COUNT(*) as c FROM checkins WHERE date(timestamp) = ? AND is_late = 1`).get(today) as any).c;
  const supported = (db.prepare(`SELECT COUNT(*) as c FROM late_arrivals la JOIN checkins c ON la.checkin_id = c.id WHERE date(c.timestamp) = ? AND la.verification_status = 'SUPPORTED'`).get(today) as any).c;
  const needsReview = (db.prepare(`SELECT COUNT(*) as c FROM late_arrivals la JOIN checkins c ON la.checkin_id = c.id WHERE date(c.timestamp) = ? AND (la.verification_status = 'PENDING' OR la.verification_status = 'UNABLE_TO_VERIFY')`).get(today) as any).c;

  const recentCheckins = db.prepare(`
    SELECT c.id, c.timestamp, c.late_minutes, c.is_late, c.scheduled_time, c.location, c.schedule_status,
           s.name, s.id as student_id, s.department,
           la.verification_status
    FROM checkins c
    JOIN students s ON c.student_id = s.id
    LEFT JOIN late_arrivals la ON la.checkin_id = c.id
    WHERE date(c.timestamp) = ?
    ORDER BY c.timestamp DESC
    LIMIT 10
  `).all(today);

  const { calculateLateStatus } = require('../services/timetableService');
  const currentStatus = calculateLateStatus(new Date().toISOString());

  res.json({ totalCheckins, lateArrivals, supported, needsReview, recentCheckins, date: today, currentStatus });
}

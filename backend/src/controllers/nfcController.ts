import { Request, Response } from 'express';
import db from '../models/database';
import { v4 as uuidv4 } from 'uuid';
import { calculateLateStatus } from '../services/timetableService';

// POST /api/nfc/lookup
export function nfcLookup(req: Request, res: Response): void {
  const { cardIdentifier } = req.body;
  if (!cardIdentifier) {
    res.status(400).json({ error: 'cardIdentifier is required' });
    return;
  }

  const credential = db
    .prepare('SELECT * FROM nfc_credentials WHERE card_identifier = ? AND status = ?')
    .get(cardIdentifier, 'ACTIVE') as any;

  if (!credential) {
    res.json({ registered: false, message: 'Unknown NFC credential. Please contact administration.' });
    return;
  }

  const student = db
    .prepare('SELECT id, name, department, student_type FROM students WHERE id = ?')
    .get(credential.student_id) as any;

  if (!student) {
    res.json({ registered: false, message: 'Credential registered but student not found.' });
    return;
  }

  // Get timetable for current period
  const now = new Date();
  const timestamp = now.toISOString();
  
  const { isLate, lateMinutes, reason, scheduledStart, periodNumber, subjectCode } = calculateLateStatus(timestamp);
  
  // Format current time for response in IST
  const optionsTime: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Kolkata', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  };
  const currentTime = new Intl.DateTimeFormat('en-US', optionsTime).format(now);

  res.json({
    registered: true,
    student: {
      id: student.id,
      name: student.name,
      department: student.department,
      studentType: student.student_type,
    },
    scheduledTime: scheduledStart || null,
    currentPeriod: periodNumber ? { subject: subjectCode || '', period: periodNumber } : null,
    currentTime,
    lateMinutes: lateMinutes || 0,
    isLate: isLate,
    scheduleStatus: reason,
  });
}

// POST /api/nfc/register
export function nfcRegister(req: Request, res: Response): void {
  const { cardIdentifier, studentId } = req.body;
  if (!cardIdentifier || !studentId) {
    res.status(400).json({ error: 'cardIdentifier and studentId are required' });
    return;
  }

  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId) as any;
  if (!student) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const existing = db.prepare(`
    SELECT nc.*, s.name as student_name, s.id as student_number
    FROM nfc_credentials nc 
    LEFT JOIN students s ON nc.student_id = s.id 
    WHERE nc.card_identifier = ?
  `).get(cardIdentifier) as any;

  if (existing) {
    res.status(409).json({ 
      error: 'This NFC card is already registered.',
      associatedStudent: {
        studentId: existing.student_number,
        studentName: existing.student_name
      }
    });
    return;
  }

  db.prepare('INSERT INTO nfc_credentials (id, card_identifier, student_id, status) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), cardIdentifier, studentId, 'ACTIVE');

  res.json({ success: true, message: 'Credential registered', cardIdentifier, studentId });
}

// GET /api/nfc/credentials
export function getCredentials(req: Request, res: Response): void {
  const rows = db.prepare(`
    SELECT nc.card_identifier, nc.status, nc.registered_at, s.name, s.id as student_id, s.department
    FROM nfc_credentials nc
    LEFT JOIN students s ON nc.student_id = s.id
    ORDER BY nc.registered_at DESC
  `).all();
  res.json(rows);
}

function calcLateMinutes(arrival: string, scheduled: string): number {
  const [ah, am] = arrival.split(':').map(Number);
  const [sh, sm] = scheduled.split(':').map(Number);
  return (ah * 60 + am) - (sh * 60 + sm);
}

import { Request, Response } from 'express';
import db, { ensureStudentAccount } from '../models/database';
import { AuthedRequest } from '../services/authService';
import { v4 as uuidv4 } from 'uuid';
import { runEvidenceEngine } from '../services/evidenceEngine';
import { calculateLateStatus, COURSES } from '../services/timetableService';
import { estimateCommute, CommuteEstimate } from '../services/commuteService';
import { getWorstWeather, WeatherReport } from '../services/weatherService';
import { transcribeAudio, analyzeStatement, SpeechServiceError, StatementAnalysis } from '../services/speechService';

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

function dateFromISO(ts: string): string {
  const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-US', optionsDate).formatToParts(new Date(ts));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function commuteFromCheckin(c: any): CommuteEstimate | null {
  if (c.commute_duration_min == null) return null;
  return {
    distanceKm: c.commute_distance_km,
    durationMinutes: c.commute_duration_min,
    typicalMinutes: c.commute_typical_min,
    trafficDelayMinutes: c.commute_traffic_delay_min || 0,
    source: c.commute_source,
  };
}

// Live weather captured at check-in, falling back to the manually entered daily record
function weatherForCheckin(c: any): { condition: string; severity: string; description: string | null; location: string | null } | null {
  if (c.weather_condition) {
    return { condition: c.weather_condition, severity: c.weather_severity || 'NONE', description: c.weather_description, location: c.weather_location };
  }
  const record = db.prepare('SELECT * FROM weather_records WHERE date = ?').get(dateFromISO(c.timestamp)) as any;
  return record ? { condition: record.condition, severity: record.severity || 'NONE', description: record.description, location: null } : null;
}

function getTodayIST(): string {
  const optionsDate: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-US', optionsDate).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// Device clocks more than this far from the server are ignored in favour of server time
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

export function statementWindowMinutes(): number {
  return Number(process.env.STATEMENT_WINDOW_MINUTES || 10);
}

// POST /api/checkins
// checkpoint = 'GATE'      → campus entry, only recorded (used later as evidence)
// checkpoint = 'CLASSROOM' → classroom entry, decides whether the student is late
export async function createCheckin(req: Request, res: Response): Promise<void> {
  let { cardIdentifier, studentId, timestamp: deviceTimestamp, readerId, location, checkpoint, room: readerRoom } = req.body;
  checkpoint = checkpoint === 'CLASSROOM' ? 'CLASSROOM' : 'GATE';

  // Trust the device clock only if it agrees with the server (ALLOW_BACKDATED_CHECKINS is for testing)
  const receivedAt = new Date();
  const deviceTime = deviceTimestamp ? new Date(deviceTimestamp) : null;
  const deviceTimeValid = deviceTime !== null && !isNaN(deviceTime.getTime());
  const clockAdjusted = !deviceTimeValid ||
    (process.env.ALLOW_BACKDATED_CHECKINS !== 'true' && Math.abs(deviceTime!.getTime() - receivedAt.getTime()) > MAX_CLOCK_SKEW_MS);
  const timestamp = (clockAdjusted ? receivedAt : deviceTime!).toISOString();

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

  const checkinDate = dateFromISO(timestamp);
  const arrivalTime = timeFromISO(timestamp);
  const defaultLocation = checkpoint === 'GATE' ? 'Main Gate' : readerRoom ? `Classroom ${readerRoom}` : 'Classroom';
  const checkinId = uuidv4();

  if (checkpoint === 'GATE') {
    db.prepare(`
      INSERT INTO checkins (id, student_id, card_identifier, timestamp, reader_id, location, checkpoint, received_at, clock_adjusted,
                            late_minutes, is_late, schedule_status)
      VALUES (?, ?, ?, ?, ?, ?, 'GATE', ?, ?, 0, 0, 'CAMPUS_ENTRY')
    `).run(checkinId, studentId, cardIdentifier || null, timestamp, readerId || 'GATE_PHONE_01',
      location || defaultLocation, receivedAt.toISOString(), clockAdjusted ? 1 : 0);

    res.json({
      success: true, checkinId, lateArrivalId: null, checkpoint,
      studentId: student.id, studentName: student.name, department: student.department,
      arrivalTime, timestamp, clockAdjusted,
      status: 'CAMPUS_ENTRY', scheduleStatus: 'CAMPUS_ENTRY', isLate: false, lateMinutes: 0,
      location: location || defaultLocation, readerId: readerId || 'GATE_PHONE_01',
    });
    return;
  }

  const { isLate, lateMinutes, reason, scheduledStart, scheduledEnd, periodNumber, subjectCode, room } = calculateLateStatus(timestamp);
  const lateMin = lateMinutes || 0;
  const sTime = scheduledStart || null;

  // First class of the day means the student has just travelled from home,
  // so their commute is relevant evidence for being late.
  const earlierClassToday = (db.prepare(`
    SELECT COUNT(*) as count FROM checkins
    WHERE student_id = ? AND checkpoint = 'CLASSROOM' AND date(timestamp) = ? AND timestamp < ?
  `).get(studentId, checkinDate, timestamp) as any).count;
  const isFirstArrival = earlierClassToday === 0;

  // When the student entered campus today (first gate tap before this classroom tap)
  const gateEntry = db.prepare(`
    SELECT timestamp FROM checkins
    WHERE student_id = ? AND checkpoint = 'GATE' AND date(timestamp) = ? AND timestamp <= ?
    ORDER BY timestamp ASC LIMIT 1
  `).get(studentId, checkinDate, timestamp) as any;

  // Measure the commute (with live traffic) and weather now, while they reflect the actual journey
  const hasHome = student.home_lat != null && student.home_lng != null;
  let commute: CommuteEstimate | null = null;
  let weather: WeatherReport | null = null;
  if (isLate) {
    const weatherPoints = [{
      lat: Number(process.env.CAMPUS_LAT || 11.0242544),
      lng: Number(process.env.CAMPUS_LNG || 77.0028228),
      location: 'Campus',
    }];
    if (isFirstArrival && hasHome) {
      weatherPoints.push({ lat: student.home_lat, lng: student.home_lng, location: student.home_area || 'Home' });
    }
    [commute, weather] = await Promise.all([
      isFirstArrival && hasHome ? estimateCommute(student.home_lat, student.home_lng) : Promise.resolve(null),
      getWorstWeather(weatherPoints),
    ]);
  }

  db.prepare(`
    INSERT INTO checkins (id, student_id, card_identifier, timestamp, reader_id, location, checkpoint, room, received_at, clock_adjusted, gate_entry_at,
                          scheduled_time, scheduled_end, period, class_code, late_minutes, is_late, schedule_status,
                          is_first_arrival, commute_distance_km, commute_duration_min, commute_typical_min, commute_traffic_delay_min, commute_source,
                          weather_condition, weather_description, weather_severity, weather_location)
    VALUES (?, ?, ?, ?, ?, ?, 'CLASSROOM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(checkinId, studentId, cardIdentifier || null, timestamp, readerId || 'CLASSROOM_PHONE_01',
    location || defaultLocation, readerRoom || room || null, receivedAt.toISOString(), clockAdjusted ? 1 : 0, gateEntry?.timestamp || null,
    sTime, scheduledEnd || null, periodNumber || null, subjectCode || null, lateMin, isLate ? 1 : 0, reason,
    isFirstArrival ? 1 : 0, commute?.distanceKm ?? null, commute?.durationMinutes ?? null, commute?.typicalMinutes ?? null,
    commute?.trafficDelayMinutes ?? null, commute?.source ?? null,
    weather?.condition ?? null, weather?.description ?? null, weather?.severity ?? null, weather?.location ?? null);

  let lateArrivalId: string | null = null;
  let statementDeadline: string | null = null;
  let explanationUrl: string | null = null;
  if (isLate) {
    lateArrivalId = uuidv4();
    // The student must record their explanation within the window, timed by the server clock
    statementDeadline = new Date(receivedAt.getTime() + statementWindowMinutes() * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO late_arrivals (id, checkin_id, student_id, verification_status, statement_deadline)
      VALUES (?, ?, ?, 'PENDING', ?)
    `).run(lateArrivalId, checkinId, studentId, statementDeadline);
    if (process.env.PUBLIC_WEB_URL) {
      explanationUrl = `${process.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/explanation?checkinId=${checkinId}`;
    }
  }

  res.json({
    success: true,
    checkinId,
    lateArrivalId,
    checkpoint,
    studentId: student.id,
    studentName: student.name,
    department: student.department,
    arrivalTime,
    date: new Date(timestamp).toLocaleDateString('en-IN'),
    day: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(timestamp)),
    period: periodNumber || null,
    classCode: subjectCode || null,
    courseTitle: subjectCode ? COURSES[subjectCode]?.title || null : null,
    room: readerRoom || room || null,
    scheduledStart: sTime,
    scheduledEnd: scheduledEnd || null,
    status: reason,
    lateMinutes: lateMin,
    scheduledTime: sTime,
    isLate,
    scheduleStatus: reason,
    location: location || defaultLocation,
    readerId: readerId || 'CLASSROOM_PHONE_01',
    timestamp,
    clockAdjusted,
    gateEntryTime: gateEntry ? timeFromISO(gateEntry.timestamp) : null,
    isFirstArrival,
    homeArea: student.home_area || null,
    commute,
    weather,
    statementDeadline,
    statementWindowMinutes: isLate ? statementWindowMinutes() : null,
    explanationUrl,
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
           c.class_code, c.room, c.gate_entry_at,
           CASE WHEN la.explanation_id IS NULL AND la.statement_deadline < ? THEN 1 ELSE 0 END AS statement_missed
    FROM late_arrivals la
    JOIN students s ON la.student_id = s.id
    JOIN checkins c ON la.checkin_id = c.id
    LEFT JOIN explanations e ON la.explanation_id = e.id
    LEFT JOIN teacher_decisions td ON td.late_arrival_id = la.id
    WHERE date(c.timestamp) = ?
    ORDER BY c.timestamp DESC
  `).all(new Date().toISOString(), today);
  res.json(rows);
}

// GET /api/late-arrivals/:id/evidence
export function getLateArrivalEvidence(req: Request, res: Response): void {
  const { id } = req.params;
  const la = db.prepare(`
    SELECT la.*, s.name, s.department, s.student_type, s.home_area,
           c.timestamp, c.scheduled_time, c.late_minutes, c.location, c.reader_id, c.card_identifier,
           c.is_first_arrival, c.commute_distance_km, c.commute_duration_min, c.commute_typical_min,
           c.commute_traffic_delay_min, c.commute_source,
           c.weather_condition, c.weather_description, c.weather_severity, c.weather_location,
           c.checkpoint, c.room, c.gate_entry_at, c.clock_adjusted,
           e.reason, e.additional_explanation, e.timestamp as explanation_timestamp,
           e.input_mode, e.transcript, e.statement_summary, e.minutes_after_arrival
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
  const weather = weatherForCheckin(la);
  const transport = db.prepare('SELECT * FROM transport_events WHERE date = ?').get(today) as any;
  const historicalCount = (db.prepare(`
    SELECT COUNT(*) as count FROM checkins
    WHERE student_id = ? AND is_late = 1 AND date(timestamp) < ?
  `).get(la.student_id, today) as any).count;

  const teacherDecision = db.prepare('SELECT * FROM teacher_decisions WHERE late_arrival_id = ? ORDER BY timestamp DESC').get(id) as any;

  const evidence = la.evidence_json ? JSON.parse(la.evidence_json) : {};

  res.json({
    id: la.id,
    student: { id: la.student_id, name: la.name, department: la.department, studentType: la.student_type, homeArea: la.home_area },
    checkin: {
      timestamp: la.timestamp,
      scheduledTime: la.scheduled_time,
      lateMinutes: la.late_minutes,
      location: la.location,
      readerId: la.reader_id,
      room: la.room,
      gateEntryAt: la.gate_entry_at,
      clockAdjusted: la.clock_adjusted === 1,
    },
    statementDeadline: la.statement_deadline,
    statementMissed: !la.explanation_id && !!la.statement_deadline && new Date(la.statement_deadline).getTime() < Date.now(),
    explanation: la.reason ? {
      reason: la.reason,
      additionalExplanation: la.additional_explanation,
      timestamp: la.explanation_timestamp,
      inputMode: la.input_mode,
      transcript: la.transcript,
      summary: la.statement_summary,
      minutesAfterArrival: la.minutes_after_arrival,
    } : null,
    weather: weather || null,
    transport: transport || null,
    isFirstArrival: la.is_first_arrival === 1,
    commute: commuteFromCheckin(la),
    historicalLateCount: historicalCount,
    verificationStatus: la.verification_status,
    verificationSummary: la.verification_summary,
    evidence: evidence.evidence || [],
    teacherDecision: teacherDecision || null,
  });
}

interface StatementInput {
  mode: 'VOICE' | 'TEXT';
  transcript: string;
  analysis: StatementAnalysis;
}

// Runs the evidence engine for a check-in and stores the explanation + result
function evaluateExplanation(
  checkin: any, student: any, reason: string, additionalExplanation: string | null, statement: StatementInput | null
) {
  const day = dateFromISO(checkin.timestamp);
  const weather = weatherForCheckin(checkin);
  const arrivedAt = new Date(checkin.received_at || checkin.timestamp).getTime();
  const minutesAfterArrival = Math.max(0, Math.round((Date.now() - arrivedAt) / 60000));
  const transport = db.prepare('SELECT * FROM transport_events WHERE date = ?').get(day) as any;
  const historicalCount = (db.prepare(`
    SELECT COUNT(*) as count FROM checkins WHERE student_id = ? AND is_late = 1 AND date(timestamp) < ?
  `).get(student.id, day) as any).count;

  const engineResult = runEvidenceEngine({
    arrivalTime: timeFromISO(checkin.timestamp),
    scheduledTime: checkin.scheduled_time,
    explanation: reason,
    transportDelayMinutes: transport?.delay_minutes || 0,
    weatherCondition: weather?.condition || 'Clear',
    weatherSeverity: weather?.severity || 'NONE',
    weatherLocation: weather?.location || null,
    studentType: student.student_type || 'Day Scholar',
    historicalLateCount: historicalCount,
    homeArea: student.home_area || null,
    commute: commuteFromCheckin(checkin),
    statement: statement ? { transcript: statement.transcript, analysis: statement.analysis } : null,
    gateEntryTime: checkin.gate_entry_at ? timeFromISO(checkin.gate_entry_at) : null,
    statementMinutesAfterArrival: minutesAfterArrival,
  });

  const expId = uuidv4();
  db.prepare(`
    INSERT INTO explanations (id, checkin_id, student_id, reason, additional_explanation, input_mode, transcript, statement_summary, analysis_json, minutes_after_arrival)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(expId, checkin.id, student.id, reason, additionalExplanation,
    statement?.mode || 'SELECTED', statement?.transcript || null, statement?.analysis.summary || null,
    statement ? JSON.stringify(statement.analysis) : null, minutesAfterArrival);

  // Update or create late arrival
  const la = db.prepare('SELECT * FROM late_arrivals WHERE checkin_id = ?').get(checkin.id) as any;
  if (la) {
    db.prepare(`
      UPDATE late_arrivals SET explanation_id = ?, verification_status = ?, verification_summary = ?, evidence_json = ?
      WHERE id = ?
    `).run(expId, engineResult.status, engineResult.reasonSummary, JSON.stringify(engineResult), la.id);
  } else {
    db.prepare(`
      INSERT INTO late_arrivals (id, checkin_id, student_id, explanation_id, verification_status, verification_summary, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), checkin.id, student.id, expId, engineResult.status, engineResult.reasonSummary, JSON.stringify(engineResult));
  }

  return {
    success: true,
    explanationId: expId,
    reason,
    verificationStatus: engineResult.status,
    verificationSummary: engineResult.reasonSummary,
    evidence: engineResult.evidence,
  };
}

function findCheckinAndStudent(checkinId: string, studentId: string, res: Response): { checkin: any; student: any } | null {
  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ? AND student_id = ?').get(checkinId, studentId) as any;
  if (!checkin) {
    res.status(404).json({ error: 'Check-in not found' });
    return null;
  }
  const lateArrival = db.prepare('SELECT * FROM late_arrivals WHERE checkin_id = ?').get(checkinId) as any;
  if (!lateArrival) {
    res.status(400).json({ error: 'This check-in was not late, so no explanation is needed' });
    return null;
  }
  if (lateArrival.explanation_id) {
    res.status(409).json({ error: 'An explanation has already been submitted for this late arrival' });
    return null;
  }
  if (lateArrival.statement_deadline && new Date(lateArrival.statement_deadline).getTime() < Date.now()) {
    res.status(403).json({
      error: `The ${statementWindowMinutes()}-minute window to explain this late arrival has closed. Your teacher has been notified.`,
      code: 'WINDOW_CLOSED',
    });
    return null;
  }
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  return { checkin, student };
}

// GET /api/me/late-checkins — the logged-in student's late arrivals today
export function getMyLateCheckins(req: AuthedRequest, res: Response): void {
  const rows = db.prepare(`
    SELECT c.id, c.student_id, c.timestamp, c.scheduled_time, c.late_minutes, c.is_late, c.class_code, c.period, c.room,
           la.verification_status, la.statement_deadline, e.reason, e.transcript
    FROM checkins c
    JOIN late_arrivals la ON la.checkin_id = c.id
    LEFT JOIN explanations e ON la.explanation_id = e.id
    WHERE c.student_id = ? AND c.checkpoint = 'CLASSROOM' AND c.is_late = 1 AND date(c.timestamp) = ?
    ORDER BY c.timestamp DESC
  `).all(req.user!.studentId, getTodayIST());
  // serverTime lets the phone show an accurate countdown even if its own clock is off
  res.json({ serverTime: new Date().toISOString(), windowMinutes: statementWindowMinutes(), checkins: rows });
}

// POST /api/explanations — reason picked from a fixed list
export function submitExplanation(req: AuthedRequest, res: Response): void {
  const { checkinId, reason, additionalExplanation } = req.body;
  const studentId = req.user!.studentId!; // always the logged-in student
  if (!checkinId || !reason) {
    res.status(400).json({ error: 'checkinId and reason are required' });
    return;
  }
  const found = findCheckinAndStudent(checkinId, studentId, res);
  if (!found) return;
  res.json(evaluateExplanation(found.checkin, found.student, reason, additionalExplanation || null, null));
}

const MAX_AUDIO_BASE64_LENGTH = 14 * 1024 * 1024; // ~10 MB of audio

// POST /api/explanations/statement — student speaks (audioBase64 + mimeType) or types (text)
export async function submitStatement(req: AuthedRequest, res: Response): Promise<void> {
  const { checkinId, audioBase64, mimeType, text } = req.body;
  const studentId = req.user!.studentId!; // always the logged-in student
  if (!checkinId || (!audioBase64 && !text?.trim())) {
    res.status(400).json({ error: 'checkinId and either audioBase64 or text are required' });
    return;
  }
  if (audioBase64 && audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    res.status(413).json({ error: 'Recording is too long. Please keep it under about 2 minutes.' });
    return;
  }
  const found = findCheckinAndStudent(checkinId, studentId, res);
  if (!found) return;
  const { checkin, student } = found;

  try {
    // The audio itself is not stored — only the transcript
    const transcript = audioBase64
      ? await transcribeAudio(audioBase64, mimeType || 'audio/webm')
      : String(text).trim();
    const analysis = await analyzeStatement(transcript, {
      homeArea: student.home_area || null,
      studentType: student.student_type,
      lateMinutes: checkin.late_minutes,
    });

    const result = evaluateExplanation(checkin, student, analysis.reason, null, {
      mode: audioBase64 ? 'VOICE' : 'TEXT',
      transcript,
      analysis,
    });
    res.json({ ...result, transcript, summary: analysis.summary });
  } catch (err) {
    if (err instanceof SpeechServiceError) {
      console.error('Statement processing failed:', err.message);
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }
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
  const { studentNumber, name, department, studentType, email, homeArea, homeLat, homeLng } = req.body;
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
    INSERT INTO students (id, name, department, student_type, email, home_area, home_lat, home_lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(studentNumber, name, department, studentType, email || null, homeArea || null, homeLat ?? null, homeLng ?? null);
  ensureStudentAccount(studentNumber, name);

  res.json({ success: true, student: { id: studentNumber, name, department, studentType, email, homeArea, homeLat, homeLng } });
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

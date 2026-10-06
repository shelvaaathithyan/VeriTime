import { Response } from 'express';
import db from '../models/database';
import { AuthedRequest, AuthUser } from '../services/authService';
import { weekTimetable, findSlot, weekdayOf, TimetableSlot } from '../services/timetableService';

const TUTOR_USERNAME = 'teacher';

// Course codes this teacher teaches; null means the class tutor, who sees every class
export function teacherCourseCodes(user: AuthUser): string[] | null {
  if (user.username === TUTOR_USERNAME) return null;
  const name = user.name.toLowerCase();
  return [...new Set(weekTimetable().filter((s) => s.staff.some((st) => st.toLowerCase() === name)).map((s) => s.code))];
}

function teacherSlots(user: AuthUser): TimetableSlot[] {
  const codes = teacherCourseCodes(user);
  return weekTimetable().filter((s) => !s.isFree && (codes === null || codes.includes(s.code)));
}

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function timeIST(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

type RosterStatus = 'PRESENT' | 'LATE_GRANTED' | 'LATE_DENIED' | 'LATE_PENDING' | 'ABSENT' | 'NOT_YET';

function roster(slot: TimetableSlot) {
  const date = todayIST();
  const isToday = slot.day === weekdayOf(new Date().toISOString());
  const nowHHMM = timeIST(new Date().toISOString());
  const classOver = !isToday || nowHHMM >= slot.end;

  const students = db.prepare('SELECT id, name, student_type FROM students ORDER BY id').all() as any[];
  // First class door scan per student for this class today
  const scans = db.prepare(`
    SELECT c.*, la.id AS late_arrival_id, la.verdict, la.attendance, td.teacher_decision
    FROM checkins c
    LEFT JOIN late_arrivals la ON la.checkin_id = c.id
    LEFT JOIN teacher_decisions td ON td.late_arrival_id = la.id
    WHERE c.checkpoint = 'CLASSROOM' AND date(c.timestamp) = ? AND c.period = ?
      AND COALESCE(c.class_day, ?) = ?
    ORDER BY c.timestamp ASC
  `).all(date, slot.period, slot.day, slot.day) as any[];

  const rows = students.map((st) => {
    const scan = scans.find((s) => s.student_id === st.id);
    let status: RosterStatus;
    if (!scan) status = classOver ? 'ABSENT' : 'NOT_YET';
    else if (!scan.is_late) status = 'PRESENT';
    else {
      const decision = scan.teacher_decision === 'EXCUSED' ? 'GRANTED' : scan.teacher_decision === 'MARKED_LATE' ? 'DENIED' : scan.attendance;
      status = decision === 'GRANTED' ? 'LATE_GRANTED' : decision === 'DENIED' ? 'LATE_DENIED' : 'LATE_PENDING';
    }
    return {
      id: st.id,
      name: st.name,
      status,
      doorTime: scan ? timeIST(scan.timestamp) : null,
      gateTime: scan?.gate_entry_at ? timeIST(scan.gate_entry_at) : null,
      lateMinutes: scan?.late_minutes || 0,
      verdict: scan?.verdict || null,
      lateArrivalId: scan?.late_arrival_id || null,
      simulated: !!scan?.simulated,
    };
  });

  const counts = {
    present: rows.filter((r) => r.status === 'PRESENT' || r.status === 'LATE_GRANTED').length,
    late: rows.filter((r) => r.status.startsWith('LATE')).length,
    denied: rows.filter((r) => r.status === 'LATE_DENIED').length,
    pending: rows.filter((r) => r.status === 'LATE_PENDING').length,
    absent: rows.filter((r) => r.status === 'ABSENT').length,
    total: rows.length,
  };
  return { slot, date, isToday, classOver, students: rows, counts };
}

// GET /api/timetable — whole week (used by the scan simulator)
export function getTimetable(_req: AuthedRequest, res: Response): void {
  res.json(weekTimetable());
}

// GET /api/teacher/classes — the logged-in teacher's classes this week, with today's attendance counts
export function getMyClasses(req: AuthedRequest, res: Response): void {
  const user = req.user!;
  const today = weekdayOf(new Date().toISOString());
  const classes = teacherSlots(user).map((slot) => ({ ...slot, isToday: slot.day === today, counts: roster(slot).counts }));
  res.json({ teacher: user.name, isTutor: teacherCourseCodes(user) === null, today, classes });
}

// GET /api/teacher/attendance?day=Tuesday&period=2 — roster for one class (today's scans)
export function getClassAttendance(req: AuthedRequest, res: Response): void {
  const slot = findSlot(String(req.query.day), Number(req.query.period));
  if (!slot || slot.isFree) {
    res.status(404).json({ error: 'Class not found' });
    return;
  }
  const codes = teacherCourseCodes(req.user!);
  if (codes !== null && !codes.includes(slot.code)) {
    res.status(403).json({ error: 'This is not one of your classes' });
    return;
  }
  res.json(roster(slot));
}

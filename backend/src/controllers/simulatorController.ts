import { Response } from 'express';
import { AuthedRequest } from '../services/authService';
import { findSlot } from '../services/timetableService';
import { recordScan } from './checkinController';

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // YYYY-MM-DD
}

function istTimestamp(date: string, minutesOfDay: number): string {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
  const mm = String(minutesOfDay % 60).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00+05:30`).toISOString();
}

// POST /api/simulate/arrival — teacher-only testing tool.
// Creates a gate scan (optional) and a class door scan for any class in the timetable, dated today,
// with the door scan `lateMinutes` after the class starts. The student then has the normal window to explain.
export async function simulateArrival(req: AuthedRequest, res: Response): Promise<void> {
  const { studentId, day, period, lateMinutes, gateMinutesBeforeDoor } = req.body;
  const slot = findSlot(String(day), Number(period));
  if (!studentId || !slot || slot.isFree) {
    res.status(400).json({ error: 'Choose a student and a class (not a free period)' });
    return;
  }
  const late = Math.max(0, Math.min(120, Number(lateMinutes) || 0));
  const [h, m] = slot.start.split(':').map(Number);
  const doorMinutes = h * 60 + m + late;
  const date = todayIST();
  const simulatedDay = slot.day;

  let gate: any = null;
  if (gateMinutesBeforeDoor !== null && gateMinutesBeforeDoor !== undefined && gateMinutesBeforeDoor !== '') {
    const gateResult = await recordScan({
      studentId, checkpoint: 'GATE', readerId: 'SIMULATOR_GATE', location: 'Main Gate',
      simulated: { timestamp: istTimestamp(date, doorMinutes - Math.max(0, Number(gateMinutesBeforeDoor))), day: simulatedDay },
    });
    if (gateResult.status !== 200) { res.status(gateResult.status).json(gateResult.body); return; }
    gate = gateResult.body;
  }

  const door = await recordScan({
    studentId, checkpoint: 'CLASSROOM', room: slot.room || 'Q301',
    readerId: `SIMULATOR_${slot.room || 'Q301'}`, location: `Classroom ${slot.room || 'Q301'}`,
    simulated: { timestamp: istTimestamp(date, doorMinutes), day: simulatedDay },
  });
  res.status(door.status).json({ ...door.body, gateScan: gate ? gate.arrivalTime : null, slot });
}

import { useEffect, useMemo, useState } from 'react';
import { DoorOpen, AlertCircle } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { studentApi, teacherApi } from '../services/api';
import { Student, TimetableSlot } from '../types';
import { formatScheduledTime } from '../utils/formatters';

type SimResult = Awaited<ReturnType<typeof teacherApi.simulateArrival>>;

const slotKey = (s: TimetableSlot) => `${s.day}|${s.period}`;

// Testing tool: pretend a student arrived at any class in the timetable.
// Creates the gate scan (optional) and class door scan, dated today, then the student explains as usual.
export default function ScanSimulator() {
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [studentId, setStudentId] = useState('');
  const [slot, setSlot] = useState('');
  const [lateMinutes, setLateMinutes] = useState(10);
  const [useGate, setUseGate] = useState(true);
  const [gateMinutes, setGateMinutes] = useState(5);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Array<{ result?: SimResult; error?: string }>>([]);

  useEffect(() => {
    Promise.all([studentApi.getAll(), teacherApi.timetable()]).then(([s, t]) => {
      setStudents(s);
      setStudentId(s[0]?.id || '');
      const classes = t.filter((x) => !x.isFree);
      setSlots(classes);
      setSlot(classes[0] ? slotKey(classes[0]) : '');
    });
  }, []);

  const byDay = useMemo(() => {
    const groups: Record<string, TimetableSlot[]> = {};
    slots.forEach((s) => { (groups[s.day] ||= []).push(s); });
    return groups;
  }, [slots]);
  const selectedSlot = slots.find((s) => slotKey(s) === slot);

  const simulate = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      const result = await teacherApi.simulateArrival({
        studentId,
        day: selectedSlot.day,
        period: selectedSlot.period,
        lateMinutes,
        gateMinutesBeforeDoor: useGate ? gateMinutes : null,
      });
      setLog((l) => [{ result }, ...l]);
    } catch (err) {
      setLog((l) => [{ error: err instanceof Error ? err.message : 'Simulation failed' }, ...l]);
    } finally {
      setBusy(false);
    }
  };

  // Student opens this in a private window or on a phone (a normal tab shares this teacher login)
  const studentLink = (checkinId: string) => `${window.location.origin}/explanation?checkinId=${checkinId}`;

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold text-navy-900 mb-1">Scan Simulator</h1>
      <p className="text-sm text-navy-500 mb-6">
        Pretend a student arrived at any class in the timetable. This creates their gate scan and class door scan
        (dated today), exactly as the NFC phones would. The student then has the usual time window, starting now, to explain.
      </p>

      <div className="card mb-6">
        <div className="card-body space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label" htmlFor="sim-student">Student</label>
              <select id="sim-student" className="form-input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id}){s.home_area ? ` — ${s.home_area}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="sim-class">Class</label>
              <select id="sim-class" className="form-input" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {Object.entries(byDay).map(([day, daySlots]) => (
                  <optgroup key={day} label={day}>
                    {daySlots.map((s) => (
                      <option key={slotKey(s)} value={slotKey(s)}>
                        P{s.period} · {formatScheduledTime(s.start)} · {s.code} {s.title}{s.room ? ` · ${s.room}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label" htmlFor="sim-late">Arrives at the class door</label>
              <div className="flex items-center gap-2">
                <input id="sim-late" type="number" min={0} max={120} className="form-input w-24"
                  value={lateMinutes} onChange={(e) => setLateMinutes(Number(e.target.value))} />
                <span className="text-sm text-navy-600">min after class starts {lateMinutes === 0 ? '(on time)' : ''}</span>
              </div>
            </div>
            <div>
              <label className="form-label">Gate scan</label>
              <div className="flex items-center gap-2 text-sm text-navy-700">
                <input type="checkbox" checked={useGate} onChange={(e) => setUseGate(e.target.checked)} id="sim-gate" />
                <label htmlFor="sim-gate">Scanned at gate</label>
                {useGate && (
                  <>
                    <input type="number" min={0} max={180} className="form-input w-20"
                      value={gateMinutes} onChange={(e) => setGateMinutes(Number(e.target.value))} />
                    <span>min before door</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {selectedSlot && (
            <p className="text-xs text-navy-500">
              Door scan at {formatScheduledTime(minutesToTime(selectedSlot.start, lateMinutes))}
              {useGate ? `, gate scan at ${formatScheduledTime(minutesToTime(selectedSlot.start, lateMinutes - gateMinutes))}` : ', no gate scan'}
              {selectedSlot.sessionStart
                ? ` · ${selectedSlot.sessionStart === 'FIRST_CLASS' ? 'first class of the day' : 'first class after lunch'} (gate + door times shown)`
                : ' · class between periods (door time only)'}
            </p>
          )}

          <button onClick={simulate} disabled={busy || !studentId || !selectedSlot} className="btn-primary w-full justify-center">
            <DoorOpen size={16} /> {busy ? 'Simulating…' : 'Simulate arrival'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {log.map((entry, i) => (
          <div key={i} className={`card ${entry.result?.isLate ? 'border-orange-200 bg-orange-50' : ''}`}>
            <div className="card-body text-sm">
              {entry.error ? (
                <div className="flex items-center gap-2 text-red-700"><AlertCircle size={14} /> {entry.error}</div>
              ) : entry.result && (
                <>
                  <div className="flex justify-between items-center mb-1 gap-3">
                    <span className="font-semibold text-navy-900">
                      {entry.result.studentName} · {entry.result.slot.day} P{entry.result.slot.period} · {entry.result.slot.code} {entry.result.slot.title}
                    </span>
                    <span className={`font-bold shrink-0 ${entry.result.isLate ? 'text-red-600' : 'text-emerald-700'}`}>
                      {entry.result.entryDenied ? 'ENTRY REFUSED — late too often'
                        : entry.result.isLate ? `LATE ${entry.result.lateMinutes} min — do not enter` : 'On time — present'}
                    </span>
                  </div>
                  <div className="text-navy-600">
                    {entry.result.gateScan ? `Gate ${entry.result.gateScan} · ` : 'No gate scan · '}Door {entry.result.arrivalTime}
                    {entry.result.isLate ? ` · late ${entry.result.weeklyLateCount} time${entry.result.weeklyLateCount === 1 ? '' : 's'} in the past 7 days` : ''}
                  </div>
                  {entry.result.entryDenied && (
                    <p className="mt-1 text-red-700">{entry.result.denialReason}</p>
                  )}
                  {entry.result.isLate && (
                    <div className="mt-2 rounded border border-orange-200 bg-white p-2">
                      <div className="flex flex-col items-center py-4 space-y-4">
                        <p className="text-sm font-semibold text-navy-800 text-center">
                          Scan to provide your explanation
                        </p>
                        <QRCodeCanvas 
                          value={studentLink(entry.result.checkinId)} 
                          size={160} 
                          bgColor="#ffffff"
                          fgColor="#000000"
                          level="M"
                          includeMargin={false}
                        />
                        <p className="text-xs text-navy-500 text-center max-w-[200px]">
                          {entry.result.statementWindowMinutes} mins left to scan this QR code with your phone.
                        </p>
                      </div>
                      <code className="block mt-4 text-xs break-all select-all text-navy-400 text-center">{studentLink(entry.result.checkinId)}</code>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function minutesToTime(start: string, offset: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + offset;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`;
}

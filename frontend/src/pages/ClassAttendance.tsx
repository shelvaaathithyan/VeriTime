import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { teacherApi } from '../services/api';
import { ClassRoster, RosterStatus } from '../types';
import { formatScheduledTime, getSessionStartLabel } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS: Record<RosterStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  LATE_GRANTED: { label: 'Late — attendance granted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  LATE_DENIED: { label: 'Late — attendance denied', cls: 'bg-red-50 text-red-700 border-red-200' },
  LATE_PENDING: { label: 'Late — allowed in, verify / waiting for reason', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  ABSENT: { label: 'Absent (no scan)', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  NOT_YET: { label: 'Not arrived yet', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

// Attendance list for one class: who scanned in on time, who was late (and the verdict), who never scanned
export default function ClassAttendance() {
  const { day = '', period = '' } = useParams();
  const [data, setData] = useState<ClassRoster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => teacherApi.attendance(day, Number(period)).then(setData).catch((e) => setError(e.message));
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [day, period]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return <LoadingSpinner message="Loading attendance..." />;
  const { slot, counts } = data;

  return (
    <div className="p-8 max-w-[1100px] mx-auto w-full">
      <Link to="/classes" className="flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800 mb-6 font-medium">
        <ArrowLeft size={16} /> Back to My Classes
      </Link>

      <h1 className="text-2xl font-semibold text-navy-900 mb-1">{slot.code} · {slot.title}</h1>
      <p className="text-sm text-navy-500 mb-6">
        {slot.day} · Period {slot.period} · {formatScheduledTime(slot.start)}–{formatScheduledTime(slot.end)}
        {slot.room ? ` · ${slot.room}` : ''} · {getSessionStartLabel(slot.sessionStart) || 'Between periods'} · scans from {data.date}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          ['Present', counts.present, 'text-emerald-700'],
          ['Late', counts.late, 'text-orange-600'],
          ['Denied', counts.denied, 'text-red-600'],
          ['Pending', counts.pending, 'text-amber-700'],
          ['Absent', counts.absent, 'text-slate-600'],
        ].map(([label, n, cls]) => (
          <div key={label as string} className="bg-white border border-navy-200 rounded-lg p-4">
            <div className={`text-2xl font-bold ${cls}`}>{n}</div>
            <div className="text-xs text-navy-500 uppercase tracking-wide">{label} <span className="normal-case">/ {counts.total}</span></div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-navy-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th className="table-th">Student</th>
              {slot.sessionStart && <th className="table-th">Gate scan</th>}
              <th className="table-th">Door scan</th>
              <th className="table-th">Attendance</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id} className="table-tr">
                <td className="table-td">
                  <div className="font-medium text-navy-900">{s.name}</div>
                  <div className="text-xs text-navy-400">{s.id}{s.simulated ? ' · simulated' : ''}</div>
                </td>
                {slot.sessionStart && (
                  <td className="table-td font-mono text-sm">
                    {s.gateTime || (s.doorTime ? <span className="text-amber-600 font-sans text-xs">not scanned</span> : '—')}
                  </td>
                )}
                <td className="table-td font-mono text-sm">
                  {s.doorTime ? <>{s.doorTime}{s.lateMinutes > 0 && <span className="ml-1 text-orange-600 font-sans text-xs">+{s.lateMinutes} min</span>}</> : '—'}
                </td>
                <td className="table-td">
                  <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                </td>
                <td className="table-td text-right">
                  {s.lateArrivalId && (
                    <Link to={`/evidence/${s.lateArrivalId}`} className="text-sm font-medium text-navy-600 hover:text-navy-900">Review</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

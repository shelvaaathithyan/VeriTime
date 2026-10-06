import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { teacherApi } from '../services/api';
import { MyClassesResponse } from '../types';
import { formatScheduledTime } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';

// The logged-in teacher's classes for the week, today first, with today's attendance counts
export default function MyClasses() {
  const [data, setData] = useState<MyClassesResponse | null>(null);

  useEffect(() => {
    const load = () => teacherApi.classes().then(setData);
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!data) return <LoadingSpinner message="Loading your classes..." />;

  const days = [data.today, ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].filter((d) => d !== data.today)];

  return (
    <div className="p-8 max-w-[1100px] mx-auto w-full">
      <h1 className="text-2xl font-semibold text-navy-900 mb-1">My Classes</h1>
      <p className="text-sm text-navy-500 mb-6">
        {data.isTutor ? 'Class tutor — all classes for BE CSE (AI & ML), Semester 7.' : `${data.teacher} — your classes this week.`}{' '}
        Attendance shows today's door scans.
      </p>

      {days.map((day) => {
        const classes = data.classes.filter((c) => c.day === day);
        if (classes.length === 0) return null;
        return (
          <div key={day} className="mb-8">
            <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-3">
              {day}{day === data.today ? ' · Today' : ''}
            </h2>
            <div className="bg-white border border-navy-200 rounded-lg shadow-sm divide-y divide-navy-50">
              {classes.map((c) => (
                <Link
                  key={`${c.day}-${c.period}`}
                  to={`/classes/${c.day}/${c.period}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-navy-50 transition-colors"
                >
                  <div className="w-28 shrink-0">
                    <div className="text-sm font-semibold text-navy-900">Period {c.period}</div>
                    <div className="text-xs font-mono text-navy-500">{formatScheduledTime(c.start)}–{formatScheduledTime(c.end)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-navy-900">{c.code} · {c.title}</div>
                    <div className="text-xs text-navy-500">{c.room || 'Room not set'} · {c.staff.join(', ')}</div>
                  </div>
                  <div className="flex gap-4 text-xs text-center shrink-0">
                    <div><div className="text-base font-bold text-emerald-700">{c.counts.present}</div>present</div>
                    <div><div className="text-base font-bold text-orange-600">{c.counts.late}</div>late</div>
                    <div><div className="text-base font-bold text-red-600">{c.counts.denied}</div>denied</div>
                  </div>
                  <ChevronRight size={16} className="text-navy-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

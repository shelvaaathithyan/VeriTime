import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Clock, CheckCircle, AlertTriangle, ArrowRight,
  Calendar
} from 'lucide-react';
import { dashboardApi, checkinApi } from '../services/api';
import { DashboardData, Checkin } from '../types';
import { formatTime, formatDate, formatScheduledTime } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, ci] = await Promise.all([dashboardApi.get(), checkinApi.getToday()]);
      setData(dash);
      setCheckins(ci);
    } catch {
      setError('Unable to connect to VeriTime backend. Ensure the backend is running on port 5001.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (error) return <ErrorMessage message={error} onRetry={load} />;
  if (!data) return null;

  const today = new Date();

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      {/* Current Period Banner */}
      <div className="mb-8">
        <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-2">VERITIME</h2>
        <h1 className="text-2xl font-semibold text-navy-900 mb-6">Today's Arrival Overview</h1>
        
        {data.currentStatus && (
          <div className="bg-white rounded border border-navy-200 shadow-sm p-6 flex flex-wrap gap-x-12 gap-y-6 items-center">
            <div className="flex-1 min-w-[150px]">
              <h3 className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1.5">Date & Day</h3>
              <div className="text-[15px] font-semibold text-navy-900">
                {new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(today)}, {formatDate(today.toISOString())}
              </div>
            </div>

            <div className="flex-1 min-w-[120px] border-l border-navy-100 pl-8">
              <h3 className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1.5">Current Period</h3>
              <div className="text-[15px] font-semibold text-navy-900">
                {data.currentStatus.periodNumber ? `Period ${data.currentStatus.periodNumber}` : '—'}
              </div>
            </div>
            
            <div className="flex-1 min-w-[120px] border-l border-navy-100 pl-8">
              <h3 className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1.5">Class</h3>
              <div className="text-[15px] font-semibold text-navy-900">
                {data.currentStatus.subjectCode || '—'}
              </div>
            </div>

            <div className="flex-1 min-w-[150px] border-l border-navy-100 pl-8">
              <h3 className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1.5">Time</h3>
              <div className="text-[15px] font-semibold text-navy-700">
                {data.currentStatus.scheduledStart ? 
                  `${formatScheduledTime(data.currentStatus.scheduledStart)} – ${formatScheduledTime(data.currentStatus.scheduledEnd!)}` 
                  : '—'
                }
              </div>
            </div>

            <div className="flex-1 min-w-[150px] border-l border-navy-100 pl-8">
              <h3 className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1.5">Status</h3>
              <div className="text-[15px] font-semibold text-emerald-600">
                {data.currentStatus.reason === 'NO_SCHEDULED_CLASS' ? 'No Class' 
                  : data.currentStatus.reason === 'FREE_PERIOD' ? 'Free Period' 
                  : data.currentStatus.reason === 'DAY_SCHEDULE_COMPLETE' ? 'Schedule Complete' 
                  : data.currentStatus.reason === 'BREAK' ? 'Break' 
                  : 'Class in progress'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Summary Row */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-navy-900 leading-none mb-1">{data.totalCheckins}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Today's Check-ins</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-navy-50 flex items-center justify-center">
            <Users size={18} className="text-navy-400" />
          </div>
        </div>

        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-orange-600 leading-none mb-1">{data.lateArrivals}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Late Arrivals</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
            <Clock size={18} className="text-orange-400" />
          </div>
        </div>

        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-emerald-600 leading-none mb-1">{data.supported}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Supported</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle size={18} className="text-emerald-400" />
          </div>
        </div>

        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-amber-600 leading-none mb-1">{data.needsReview}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Needs Review</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
        </div>
      </div>

      {/* Recent Check-ins */}
      <div className="card mb-6">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-900">Today's Check-ins</h2>
          <Link to="/teacher" className="text-sm text-navy-600 hover:text-navy-800 font-medium flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          {checkins.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">
              No check-ins recorded today.
            </div>
          ) : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-th">Student</th>
                  <th className="table-th">Student ID</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Period</th>
                  <th className="table-th">Class</th>
                  <th className="table-th">Arrival</th>
                  <th className="table-th">Schedule</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id} className="table-tr">
                    <td className="table-td">
                      <div className="font-medium text-navy-900">{c.name}</div>
                    </td>
                    <td className="table-td text-sm text-navy-600">{c.student_id}</td>
                    <td className="table-td text-sm text-navy-500">{c.department}</td>
                    <td className="table-td text-sm text-navy-700">{c.period ? `Period ${c.period}` : '—'}</td>
                    <td className="table-td text-sm text-navy-700">{c.class_code || '—'}</td>
                    <td className="table-td font-mono text-sm">{formatTime(c.timestamp)}</td>
                    <td className="table-td font-mono text-sm text-navy-500">
                      {formatScheduledTime(c.scheduled_time)}
                    </td>
                    <td className="table-td text-sm font-medium">
                      {c.is_late ? (
                        <span className="text-orange-600">Late {c.late_minutes} min</span>
                      ) : c.schedule_status === 'CAMPUS_ENTRY' ? (
                        <span className="text-navy-500">Entered campus</span>
                      ) : c.schedule_status === 'FREE_PERIOD' ? (
                        <span className="text-blue-600">Free Period</span>
                      ) : c.schedule_status === 'NO_SCHEDULED_CLASS' ? (
                        <span className="text-gray-500">No Class</span>
                      ) : c.schedule_status === 'DAY_SCHEDULE_COMPLETE' ? (
                        <span className="text-purple-600">Schedule Complete</span>
                      ) : c.schedule_status === 'BREAK' ? (
                        <span className="text-yellow-600">Break</span>
                      ) : (
                        <span className="text-emerald-600">On time</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="card bg-navy-50 border-navy-200">
        <div className="card-body">
          <div className="flex items-start gap-3">
            <Calendar size={18} className="text-navy-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-navy-800 mb-1">How VeriTime Works</div>
              <p className="text-sm text-navy-600 leading-relaxed">
                Security personnel scan student NFC ID cards using the Android app. Arrival timestamps are automatically
                recorded and compared against the timetable. Late students can submit an explanation through the web portal.
                The evidence engine evaluates contextual factors — weather, transport, and student type — producing a
                verification status for the teacher to review. <strong>The teacher always makes the final decision.</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

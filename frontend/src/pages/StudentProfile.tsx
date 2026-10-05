import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, CreditCard } from 'lucide-react';
import { studentApi } from '../services/api';
import { formatTime, formatDate, formatScheduledTime } from '../utils/formatters';
import VerificationBadge from '../components/VerificationBadge';
import { VerificationStatus } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

type StudentDetail = {
  id: string; name: string; department: string; student_type: string; email?: string;
  history: Array<{
    checkin_id: string; timestamp: string; scheduled_time: string;
    late_minutes: number; is_late: number; verification_status?: string; reason?: string;
    late_arrival_id?: string; schedule_status?: string;
    period?: number; class_code?: string;
  }>;
  credential: { card_identifier: string; status: string } | null;
};

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    studentApi.getById(id).then((s) => setStudent(s as StudentDetail)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!student) return (
    <div className="p-8">
      <p className="text-red-600 text-sm">Student not found.</p>
      <button onClick={() => navigate('/students')} className="btn-secondary mt-4">← Back</button>
    </div>
  );

  const todayStr = new Date().toLocaleDateString();
  const todaysArrival = student.history.find(h => new Date(h.timestamp).toLocaleDateString() === todayStr);

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <button onClick={() => navigate('/students')} className="flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800 mb-6 font-medium transition-colors">
        <ArrowLeft size={16} /> Back to Directory
      </button>

      {/* Professional Profile Header */}
      <div className="bg-white border border-navy-200 rounded-lg shadow-sm p-6 mb-8 flex flex-wrap gap-8 justify-between items-center">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-navy-50 rounded-full border border-navy-100 flex items-center justify-center">
            <User size={28} className="text-navy-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy-900 leading-tight mb-1">{student.name}</h1>
            <div className="text-sm font-mono text-navy-500 font-medium">{student.id}</div>
          </div>
        </div>

        <div className="flex gap-12">
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Department</div>
            <div className="text-sm font-semibold text-navy-900">{student.department}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Student Type</div>
            <div className="text-sm font-semibold text-navy-900">{student.student_type}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">NFC Credential</div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <CreditCard size={14} />
              {student.credential?.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Today's Arrival Panel */}
        <div className="lg:col-span-1">
          <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-3">Today's Arrival</h2>
          <div className="bg-white border border-navy-200 rounded p-5">
            {todaysArrival ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-navy-50 pb-3">
                  <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Status</span>
                  <span className={`text-sm font-bold ${
                    todaysArrival.is_late ? 'text-orange-600' :
                    todaysArrival.schedule_status === 'FREE_PERIOD' ? 'text-blue-600' :
                    todaysArrival.schedule_status === 'NO_SCHEDULED_CLASS' ? 'text-gray-500' :
                    todaysArrival.schedule_status === 'DAY_SCHEDULE_COMPLETE' ? 'text-purple-600' :
                    todaysArrival.schedule_status === 'BREAK' ? 'text-yellow-600' : 'text-emerald-600'
                  }`}>
                    {todaysArrival.is_late ? 'Late' :
                     todaysArrival.schedule_status === 'FREE_PERIOD' ? 'Free Period' :
                     todaysArrival.schedule_status === 'NO_SCHEDULED_CLASS' ? 'No Class' :
                     todaysArrival.schedule_status === 'DAY_SCHEDULE_COMPLETE' ? 'Schedule Complete' :
                     todaysArrival.schedule_status === 'BREAK' ? 'Break' : 'On Time'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-navy-50 pb-3">
                  <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Arrival</span>
                  <span className="text-sm font-mono font-medium text-navy-900">{formatTime(todaysArrival.timestamp)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-navy-50 pb-3">
                  <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Scheduled</span>
                  <span className="text-sm font-mono font-medium text-navy-900">{formatScheduledTime(todaysArrival.scheduled_time)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-navy-50 pb-3">
                  <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Period</span>
                  <span className="text-sm font-medium text-navy-900">{todaysArrival.period || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Class</span>
                  <span className="text-sm font-medium text-navy-900">{todaysArrival.class_code || '—'}</span>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-navy-400">
                No arrival recorded yet today.
              </div>
            )}
          </div>
        </div>

        {/* Arrival History */}
        <div className="lg:col-span-2">
          <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-3">Arrival History</h2>
          <div className="bg-white border border-navy-200 rounded overflow-x-auto">
            {student.history.length === 0 ? (
              <div className="py-12 text-center text-navy-400 text-sm">
                No arrival history yet.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-navy-50 border-b border-navy-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Day</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Period</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Class</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Scheduled</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Arrival</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-navy-500 uppercase tracking-wider">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {student.history.map((h) => (
                    <tr key={h.checkin_id} className="border-b border-navy-100 hover:bg-navy-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-navy-600 font-medium">{formatDate(h.timestamp)}</td>
                      <td className="px-4 py-3 text-xs text-navy-600">{new Date(h.timestamp).toLocaleDateString('en-US', { weekday: 'short' })}</td>
                      <td className="px-4 py-3 text-sm text-navy-900 font-medium">{h.period ? `P${h.period}` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-navy-900">{h.class_code || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-navy-500">{formatScheduledTime(h.scheduled_time)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-navy-900">{formatTime(h.timestamp)}</td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {h.is_late ? (
                          <span className="text-orange-600">Late {h.late_minutes}m</span>
                        ) : h.schedule_status === 'FREE_PERIOD' ? (
                          <span className="text-blue-600">Free Period</span>
                        ) : h.schedule_status === 'NO_SCHEDULED_CLASS' ? (
                          <span className="text-gray-500">No Class</span>
                        ) : h.schedule_status === 'DAY_SCHEDULE_COMPLETE' ? (
                          <span className="text-purple-600">Schedule Complete</span>
                        ) : h.schedule_status === 'BREAK' ? (
                          <span className="text-yellow-600">Break</span>
                        ) : (
                          <span className="text-emerald-600">On Time</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {h.verification_status ? (
                          <VerificationBadge status={h.verification_status as VerificationStatus} />
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

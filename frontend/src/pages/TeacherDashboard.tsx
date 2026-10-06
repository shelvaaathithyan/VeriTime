import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle, AlertCircle, HelpCircle
} from 'lucide-react';
import { lateArrivalApi } from '../services/api';
import { LateArrival } from '../types';
import { formatTime, getReasonLabel, getSessionStartLabel } from '../utils/formatters';
import VerificationBadge from '../components/VerificationBadge';
import { attendanceLabel } from '../components/VerdictPanel';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

export default function TeacherDashboard() {
  const [arrivals, setArrivals] = useState<LateArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lateArrivalApi.getAll();
      setArrivals(data);
    } catch {
      setError('Failed to load late arrivals. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = {
    total: arrivals.length,
    supported: arrivals.filter((a) => a.verification_status === 'SUPPORTED').length,
    partial: arrivals.filter((a) => a.verification_status === 'PARTIALLY_SUPPORTED').length,
    needsReview: arrivals.filter(
      (a) => a.verification_status === 'PENDING' || a.verification_status === 'UNABLE_TO_VERIFY' || a.verification_status === 'INCONSISTENT'
    ).length,
  };

  if (loading) return <LoadingSpinner message="Loading teacher dashboard..." />;
  if (error) return <ErrorMessage message={error} onRetry={load} />;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 mb-6 flex items-start gap-3">
        <HelpCircle size={17} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <strong>Decision Support System:</strong> VeriTime evaluates contextual evidence and provides a verification status to assist your decision.
          The system does not make judgements about character or intent. <strong>You are the final decision-maker.</strong>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">Teacher Review</h1>
        <p className="text-sm text-navy-500">Review late arrivals and supporting evidence.</p>
      </div>

      {/* Stat Cards */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-orange-600 leading-none mb-1">{counts.total}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Late arrivals today</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
            <Clock size={18} className="text-orange-400" />
          </div>
        </div>
        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-slate-600 leading-none mb-1">{counts.needsReview}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Awaiting review</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
            <AlertCircle size={18} className="text-slate-400" />
          </div>
        </div>
        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-emerald-600 leading-none mb-1">{counts.supported}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Supported</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle size={18} className="text-emerald-400" />
          </div>
        </div>
        <div className="flex-1 bg-white border border-navy-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[28px] font-bold text-amber-600 leading-none mb-1">{counts.partial}</div>
            <div className="text-xs font-semibold text-navy-500 uppercase tracking-wide">Partially supported</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertCircle size={18} className="text-amber-400" />
          </div>
        </div>
      </div>

      {/* Late Arrivals Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-base font-semibold text-navy-900">Late Arrival Cases — Today</h2>
        </div>
        <div className="overflow-x-auto">
          {arrivals.length === 0 ? (
            <div className="py-16 text-center text-navy-400 text-sm">
              No late arrivals recorded today.
            </div>
          ) : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-th">Student</th>
                  <th className="table-th">Arrival</th>
                  <th className="table-th">Period</th>
                  <th className="table-th">Class</th>
                  <th className="table-th">Late By</th>
                  <th className="table-th">Explanation</th>
                  <th className="table-th">Verdict</th>
                  <th className="table-th">Teacher Decision</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {arrivals.map((a) => (
                  <tr key={a.id} className="table-tr">
                    <td className="table-td">
                      <Link to={`/students/${a.student_id}`} className="font-medium text-navy-900 hover:text-navy-600">
                        {a.name}
                      </Link>
                      <div className="text-xs text-navy-400">{a.student_id} · {a.department}</div>
                    </td>
                    <td className="table-td text-sm">
                      {/* Gate + door for the first class of the morning / after lunch; door only between periods */}
                      {a.session_start ? (
                        <div className="space-y-0.5">
                          <div className="font-mono"><span className="text-navy-400 font-sans text-xs mr-1">Gate</span>{a.gate_entry_at ? formatTime(a.gate_entry_at) : <span className="text-amber-600 font-sans text-xs">not scanned</span>}</div>
                          <div className="font-mono"><span className="text-navy-400 font-sans text-xs mr-1">Door</span>{formatTime(a.timestamp)}</div>
                          <div className="text-[11px] text-navy-400">{getSessionStartLabel(a.session_start)}</div>
                        </div>
                      ) : (
                        <div className="font-mono"><span className="text-navy-400 font-sans text-xs mr-1">Door</span>{formatTime(a.timestamp)}</div>
                      )}
                    </td>
                    <td className="table-td text-sm text-navy-700">
                      {a.period ? `Period ${a.period}` : '—'}
                    </td>
                    <td className="table-td text-sm font-medium text-navy-700">
                      {a.class_code || '—'}
                    </td>
                    <td className="table-td">
                      <span className="text-orange-600 font-medium">{a.late_minutes} min</span>
                    </td>
                    <td className="table-td text-sm text-navy-600">
                      {a.reason ? getReasonLabel(a.reason) : a.verdict === 'REPEATED_LATENESS' ? (
                        <span className="text-red-600 font-medium">Entry refused — late too often</span>
                      ) : a.statement_missed ? (
                        <span className="text-red-600 font-medium">No statement in time</span>
                      ) : (
                        <span className="text-navy-300 italic">Waiting for student</span>
                      )}
                    </td>
                    <td className="table-td">
                      {a.verdict ? (
                        <div>
                          <span className={`badge ${
                            a.verdict === 'TRUE' ? 'badge-supported' :
                            a.verdict === 'UNVERIFIED' ? 'badge-partial' : 'badge-inconsistent'
                          }`}>
                            {a.verdict === 'TRUE' ? 'True' : a.verdict === 'FALSE' ? 'False' : a.verdict === 'NO_STATEMENT' ? 'No reason'
                              : a.verdict === 'REPEATED_LATENESS' ? 'Late too often' : 'Teacher to verify'}
                          </span>
                          <div className={`text-xs mt-1 font-medium ${
                            a.attendance === 'GRANTED' ? 'text-emerald-700' : a.attendance === 'DENIED' ? 'text-red-700' : 'text-navy-500'
                          }`}>
                            {attendanceLabel(a.attendance)}
                          </div>
                        </div>
                      ) : (
                        <VerificationBadge status={a.verification_status} />
                      )}
                    </td>
                    <td className="table-td">
                      {a.teacher_decision ? (
                        <span className={`badge ${
                          a.teacher_decision === 'EXCUSED' ? 'badge-supported' :
                          a.teacher_decision === 'MARKED_LATE' ? 'badge-inconsistent' :
                          'badge-partial'
                        }`}>
                          {a.teacher_decision === 'EXCUSED' ? 'Excused' :
                           a.teacher_decision === 'MARKED_LATE' ? 'Marked Late' :
                           'Further Evidence'}
                        </span>
                      ) : (
                        <span className="text-navy-300 text-sm italic">Pending</span>
                      )}
                    </td>
                    <td className="table-td">
                      <button
                        onClick={() => navigate(`/evidence/${a.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy-200 text-sm font-medium text-navy-700 rounded hover:bg-navy-50 transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Removed Demo Link as per requirements */}
    </div>
  );
}

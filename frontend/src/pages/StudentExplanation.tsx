import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, Send } from 'lucide-react';
import { checkinApi, studentApi, explanationApi } from '../services/api';
import { Checkin, Student } from '../types';
import { formatTime, formatScheduledTime, formatLateMinutes, getVerificationLabel } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';

const REASONS = [
  { value: 'TRANSPORT_DELAY', label: 'Transport delay' },
  { value: 'HEAVY_RAIN', label: 'Heavy rain / weather' },
  { value: 'MEDICAL_EMERGENCY', label: 'Medical or emergency' },
  { value: 'COLLEGE_ACTIVITY', label: 'College activity' },
  { value: 'HOSTEL_DELAY', label: 'Hostel-related delay' },
  { value: 'PERSONAL', label: 'Personal / family reason' },
  { value: 'OTHER', label: 'Other' },
];

export default function StudentExplanation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Allow pre-filling from URL params (from Android deep link or direct navigation)
  const defaultStudentId = searchParams.get('studentId') || '';
  const defaultCheckinId = searchParams.get('checkinId') || '';

  const [students, setStudents] = useState<Student[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(defaultStudentId);
  const [selectedCheckin, setSelectedCheckin] = useState(defaultCheckinId);
  const [reason, setReason] = useState('');
  const [additional, setAdditional] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    verificationStatus: string;
    verificationSummary: string;
    lateArrivalId?: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([studentApi.getAll(), checkinApi.getToday()])
      .then(([s, c]) => {
        setStudents(s);
        const lateCheckins = c.filter((ci) => ci.is_late === 1);
        setCheckins(lateCheckins);
        if (lateCheckins.length > 0 && !defaultCheckinId) {
          const myCheckin = lateCheckins.find((c) => c.student_id === defaultStudentId);
          if (myCheckin) setSelectedCheckin(myCheckin.id);
          else setSelectedCheckin(lateCheckins[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const studentCheckins = checkins.filter((c) => c.student_id === selectedStudent);
  const selectedCheckinData = checkins.find((c) => c.id === selectedCheckin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckin || !reason) return;

    setSubmitting(true);
    try {
      const res = await explanationApi.submit({
        checkinId: selectedCheckin,
        studentId: selectedStudent,
        reason,
        additionalExplanation: additional || undefined,
      });
      setResult({
        verificationStatus: res.verificationStatus,
        verificationSummary: res.verificationSummary,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      alert(`Failed to submit: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading..." />;

  if (result) {
    const statusColor = {
      SUPPORTED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      PARTIALLY_SUPPORTED: 'border-amber-300 bg-amber-50 text-amber-800',
      INCONSISTENT: 'border-red-200 bg-red-50 text-red-800',
      UNABLE_TO_VERIFY: 'border-slate-200 bg-slate-50 text-slate-700',
    }[result.verificationStatus] || 'border-slate-200 bg-slate-50 text-slate-700';

    return (
      <div className="p-8 max-w-xl">
        <div className="card">
          <div className="card-body text-center py-10">
            <CheckCircle2 size={40} className="text-emerald-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-navy-900 mb-1 font-display">Explanation Submitted</h2>
            <p className="text-sm text-navy-500 mb-6">Your explanation has been received and evaluated.</p>

            <div className={`rounded-lg border p-4 text-left mb-6 ${statusColor}`}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1">Verification Status</div>
              <div className="text-lg font-bold mb-2">{getVerificationLabel(result.verificationStatus as any)}</div>
              <p className="text-sm leading-relaxed">{result.verificationSummary}</p>
            </div>

            <p className="text-xs text-navy-400 mb-6">
              This is a decision-support output. Your teacher will review this case and make the final decision.
            </p>

            <button onClick={() => navigate('/teacher')} className="btn-primary">
              View Teacher Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto w-full">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">Late Arrival Explanation</h1>
        <p className="text-sm text-navy-500">Submit your explanation for your late arrival today</p>
      </div>

      {/* Arrival Info */}
      {selectedCheckinData && (
        <div className="card mb-6 border-orange-200 bg-orange-50">
          <div className="card-body">
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-xs text-navy-400 mb-1">Date</div>
                <div className="font-mono font-bold text-navy-800">
                  {new Date(selectedCheckinData.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div>
                <div className="text-xs text-navy-400 mb-1">Class</div>
                <div className="font-bold text-navy-800">
                  {selectedCheckinData.class_code || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-navy-400 mb-1">Scheduled</div>
                <div className="font-mono font-bold text-navy-800">
                  {formatScheduledTime(selectedCheckinData.scheduled_time)}
                </div>
              </div>
              <div>
                <div className="text-xs text-navy-400 mb-1">Arrived</div>
                <div className="font-mono font-bold text-orange-600">
                  {formatTime(selectedCheckinData.timestamp)}
                </div>
              </div>
              <div>
                <div className="text-xs text-navy-400 mb-1">Late By</div>
                <div className="font-bold text-red-600 flex items-center justify-center gap-1">
                  <Clock size={14} />
                  {formatLateMinutes(selectedCheckinData.late_minutes)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <div className="card-body space-y-5">
          {/* Student selector */}
          <div>
            <label className="form-label" htmlFor="select-student">Student</label>
            <select
              id="select-student"
              className="form-input"
              value={selectedStudent}
              onChange={(e) => {
                setSelectedStudent(e.target.value);
                const ci = studentCheckins.find((c) => c.student_id === e.target.value);
                setSelectedCheckin(ci?.id || '');
              }}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
              ))}
            </select>
          </div>

          {/* Check-in selector */}
          <div>
            <label className="form-label" htmlFor="select-checkin">Late Arrival Record</label>
            {studentCheckins.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                <AlertCircle size={14} />
                No late check-in found for this student today.
              </div>
            ) : (
              <select
                id="select-checkin"
                className="form-input"
                value={selectedCheckin}
                onChange={(e) => setSelectedCheckin(e.target.value)}
              >
                {studentCheckins.map((c) => (
                  <option key={c.id} value={c.id}>
                    Arrived {formatTime(c.timestamp)} — {formatLateMinutes(c.late_minutes)} late
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="form-label">What caused your late arrival?</label>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="w-4 h-4 text-navy-600 border-navy-300 focus:ring-navy-500"
                    id={`reason-${r.value}`}
                  />
                  <span className="text-sm text-navy-700 group-hover:text-navy-900">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Additional */}
          <div>
            <label className="form-label" htmlFor="additional">Additional explanation (optional)</label>
            <textarea
              id="additional"
              className="form-textarea"
              rows={3}
              placeholder="Provide any additional context..."
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
            />
          </div>

          <div className="divider" />

          <button
            type="submit"
            id="btn-submit-explanation"
            className="btn-primary w-full justify-center"
            disabled={submitting || !reason || !selectedCheckin}
          >
            <Send size={15} />
            {submitting ? 'Submitting...' : 'Submit Explanation'}
          </button>

          <p className="text-xs text-navy-400 text-center leading-relaxed">
            Your explanation will be evaluated alongside contextual evidence such as weather and transport data.
            The teacher makes the final decision.
          </p>
        </div>
      </form>
    </div>
  );
}

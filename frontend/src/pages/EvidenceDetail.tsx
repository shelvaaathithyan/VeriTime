import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, CheckCircle2, HelpCircle, ArrowRight
} from 'lucide-react';
import { lateArrivalApi, teacherDecisionApi } from '../services/api';
import { LateArrivalEvidence, TeacherDecision } from '../types';
import {
  formatTime, formatDate, formatScheduledTime, formatLateMinutes,
  getReasonLabel, getVerificationLabel
} from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';

export default function EvidenceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LateArrivalEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decisionDone, setDecisionDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    lateArrivalApi.getEvidence(id).then(setData).catch(() => setError('Failed to load evidence.')).finally(() => setLoading(false));
  }, [id]);

  const handleDecision = async (decision: TeacherDecision) => {
    if (!id || !data) return;
    setSubmitting(true);
    try {
      await teacherDecisionApi.submit({ lateArrivalId: id, teacherDecision: decision });
      setDecisionDone(true);
      setData((prev) => prev ? { ...prev, teacherDecision: { teacher_decision: decision, timestamp: new Date().toISOString() } } : prev);
    } catch {
      alert('Failed to save decision. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading evidence..." />;
  if (error || !data) return (
    <div className="p-8">
      <p className="text-red-600 text-sm">{error || 'Not found'}</p>
      <button onClick={() => navigate(-1)} className="btn-secondary mt-4">← Back</button>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800 mb-6 font-medium transition-colors">
        <ArrowLeft size={16} /> Back to Teacher Review
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">Late Arrival Review</h1>
        <p className="text-sm text-navy-500">{formatDate(data.checkin.timestamp)}</p>
      </div>

      {/* Header Info */}
      <div className="bg-white border border-navy-200 rounded-lg shadow-sm p-6 mb-8 flex flex-wrap gap-8 justify-between items-center">
        <div className="flex gap-12 flex-wrap">
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Student</div>
            <div className="text-sm font-semibold text-navy-900">{data.student.name}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Student ID</div>
            <div className="text-sm font-mono font-medium text-navy-900">{data.student.id}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Department</div>
            <div className="text-sm font-semibold text-navy-900">{data.student.department}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Arrival</div>
            <div className="text-sm font-mono font-bold text-orange-600">{formatTime(data.checkin.timestamp)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Scheduled</div>
            <div className="text-sm font-mono font-semibold text-navy-900">{formatScheduledTime(data.checkin.scheduledTime)}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-navy-400 uppercase tracking-wider mb-1">Late By</div>
            <div className="text-sm font-semibold text-red-600">{formatLateMinutes(data.checkin.lateMinutes)} minutes</div>
          </div>
        </div>
      </div>

      {/* Horizontal Evidence Timeline */}
      <div className="mb-8">
        <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-4">Evidence Timeline</h2>
        <div className="flex items-center text-sm font-medium">
          <div className="bg-navy-50 border border-navy-200 rounded px-4 py-3 min-w-[140px] text-center shadow-sm">
            <div className="text-[11px] text-navy-400 uppercase tracking-wide mb-1">Scheduled class</div>
            <div className="text-navy-900 font-mono">{formatScheduledTime(data.checkin.scheduledTime)}</div>
          </div>
          <ArrowRight className="text-navy-300 mx-3" size={20} />
          
          <div className="bg-orange-50 border border-orange-200 rounded px-4 py-3 min-w-[140px] text-center shadow-sm">
            <div className="text-[11px] text-orange-600 uppercase tracking-wide mb-1">NFC check-in</div>
            <div className="text-orange-700 font-mono">{formatTime(data.checkin.timestamp)}</div>
          </div>
          <ArrowRight className="text-navy-300 mx-3" size={20} />

          <div className="bg-navy-50 border border-navy-200 rounded px-4 py-3 min-w-[140px] text-center shadow-sm">
            <div className="text-[11px] text-navy-400 uppercase tracking-wide mb-1">Explanation</div>
            <div className="text-navy-900">{data.explanation ? getReasonLabel(data.explanation.reason) : 'None'}</div>
          </div>
          <ArrowRight className="text-navy-300 mx-3" size={20} />

          <div className="bg-navy-50 border border-navy-200 rounded px-4 py-3 min-w-[140px] text-center shadow-sm">
            <div className="text-[11px] text-navy-400 uppercase tracking-wide mb-1">Context</div>
            <div className="text-navy-900">{data.transport ? 'Transport delay' : data.weather?.severity !== 'NONE' ? 'Weather issue' : 'No issues'}</div>
          </div>
          <ArrowRight className="text-navy-300 mx-3" size={20} />

          <div className={`border rounded px-4 py-3 min-w-[140px] text-center shadow-sm ${
            data.verificationStatus === 'SUPPORTED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            data.verificationStatus === 'PARTIALLY_SUPPORTED' ? 'bg-amber-50 border-amber-200 text-amber-700' :
            data.verificationStatus === 'INCONSISTENT' ? 'bg-red-50 border-red-200 text-red-700' :
            'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="text-[11px] uppercase tracking-wide mb-1 opacity-80">Verification</div>
            <div className="font-bold">{data.verificationStatus.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Evidence Summary */}
        <div>
          <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-3">Evidence Summary</h2>
          <div className="bg-white border border-navy-200 rounded-lg p-6 space-y-4 shadow-sm">
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Arrival timestamp</span>
              <span className="text-sm font-mono font-medium text-navy-900">{formatTime(data.checkin.timestamp)}</span>
            </div>
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Scheduled class time</span>
              <span className="text-sm font-mono font-medium text-navy-900">{formatScheduledTime(data.checkin.scheduledTime)}</span>
            </div>
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Difference</span>
              <span className="text-sm font-bold text-red-600">{formatLateMinutes(data.checkin.lateMinutes)} minutes</span>
            </div>
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Student explanation</span>
              <span className="text-sm font-medium text-navy-900">{data.explanation ? getReasonLabel(data.explanation.reason) : 'None'}</span>
            </div>
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Transport information</span>
              <span className="text-sm font-medium text-navy-900">{data.transport ? `${data.transport.delay_minutes}m delay on ${data.transport.route}` : 'Normal'}</span>
            </div>
            <div className="flex justify-between border-b border-navy-50 pb-3">
              <span className="text-sm font-semibold text-navy-600">Weather information</span>
              <span className="text-sm font-medium text-navy-900">{data.weather ? `${data.weather.condition} (${data.weather.severity})` : 'Normal'}</span>
            </div>
            <div className="pt-2 text-sm text-navy-700 bg-navy-50 p-3 rounded border border-navy-100">
              {data.verificationSummary || getVerificationLabel(data.verificationStatus)}
            </div>
          </div>
        </div>

        {/* Teacher Decision */}
        <div>
          <h2 className="text-[11px] font-bold text-navy-400 uppercase tracking-widest mb-3">Teacher Decision</h2>
          <div className="bg-white border border-navy-200 rounded-lg p-6 shadow-sm">
            {(decisionDone || data.teacherDecision) ? (
              <div className="text-center py-6">
                <CheckCircle2 size={36} className="text-emerald-600 mx-auto mb-3" />
                <div className="text-lg font-bold text-navy-900 mb-2">Decision Recorded</div>
                <div className="mt-4 inline-block px-4 py-1.5 rounded-full font-bold text-sm bg-navy-50 border border-navy-200 text-navy-800">
                  {data.teacherDecision?.teacher_decision === 'EXCUSED' ? 'Excused Arrival' :
                   data.teacherDecision?.teacher_decision === 'MARKED_LATE' ? 'Marked as Late' :
                   'Requested Further Evidence'}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => handleDecision('EXCUSED')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-medium rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  Excuse Arrival
                </button>
                <button
                  onClick={() => handleDecision('MARKED_LATE')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 text-white font-medium rounded hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  <Clock size={16} />
                  Mark as Late
                </button>
                <button
                  onClick={() => handleDecision('REQUEST_FURTHER_EVIDENCE')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-navy-200 text-navy-700 font-medium rounded hover:bg-navy-50 transition-colors disabled:opacity-50"
                >
                  <HelpCircle size={16} />
                  Request Further Evidence
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

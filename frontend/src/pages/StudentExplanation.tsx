import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, Send, Mic, Keyboard, LogOut, Timer, Lock } from 'lucide-react';
import { meApi, explanationApi } from '../services/api';
import { MyLateCheckin } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatTime, formatScheduledTime, formatLateMinutes, getVerificationLabel, getReasonLabel } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';
import VoiceRecorder, { VoiceRecording } from '../components/VoiceRecorder';

export default function StudentExplanation() {
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();

  // Allow pre-selecting a check-in from the URL (e.g. a link or QR code from the gate)
  const defaultCheckinId = searchParams.get('checkinId') || '';

  const [checkins, setCheckins] = useState<MyLateCheckin[]>([]);
  const [selectedCheckin, setSelectedCheckin] = useState(defaultCheckinId);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [typedText, setTypedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    verificationStatus: string;
    verificationSummary: string;
    transcript: string;
    reason: string;
  } | null>(null);

  const hasStatement = mode === 'voice' ? !!recording : typedText.trim().length > 0;

  // Difference between server and phone clocks, so the countdown matches the server's deadline
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [windowMinutes, setWindowMinutes] = useState(10);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCheckins = () =>
    meApi.lateCheckins()
      .then(({ serverTime, windowMinutes, checkins: rows }) => {
        setClockOffsetMs(new Date(serverTime).getTime() - Date.now());
        setWindowMinutes(windowMinutes);
        setCheckins(rows);
        setSelectedCheckin((current) => {
          if (rows.some((r) => r.id === current)) return current;
          // Default to the first late arrival that still needs an explanation
          return (rows.find((r) => !r.reason) || rows[0])?.id || '';
        });
      })
      .finally(() => setLoading(false));

  useEffect(() => { loadCheckins(); }, []);

  const selectedCheckinData = checkins.find((c) => c.id === selectedCheckin);
  const alreadyExplained = !!selectedCheckinData?.reason;
  const deadlineMs = selectedCheckinData?.statement_deadline
    ? new Date(selectedCheckinData.statement_deadline).getTime() - clockOffsetMs
    : null;
  const secondsLeft = deadlineMs === null ? null : Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const windowClosed = !alreadyExplained && secondsLeft === 0;
  const countdown = secondsLeft === null ? '' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckin || !hasStatement) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await explanationApi.submitStatement({
        checkinId: selectedCheckin,
        ...(mode === 'voice' && recording
          ? { audioBase64: recording.base64, mimeType: recording.mimeType }
          : { text: typedText.trim() }),
      });
      setResult({
        verificationStatus: res.verificationStatus,
        verificationSummary: res.verificationSummary,
        transcript: res.transcript,
        reason: res.reason,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      setSubmitError(message);
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
      <div className="p-4 sm:p-8 max-w-xl mx-auto w-full">
        <div className="card">
          <div className="card-body text-center py-10">
            <CheckCircle2 size={40} className="text-emerald-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-navy-900 mb-1 font-display">Explanation Submitted</h2>
            <p className="text-sm text-navy-500 mb-6">Your explanation has been received and evaluated.</p>

            <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-left mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-400 mb-1">What you said</div>
              <p className="text-sm text-navy-800 italic leading-relaxed">“{result.transcript}”</p>
              <div className="text-xs text-navy-500 mt-2">Understood as: <span className="font-semibold">{getReasonLabel(result.reason)}</span></div>
            </div>

            <div className={`rounded-lg border p-4 text-left mb-6 ${statusColor}`}>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1">Verification Status</div>
              <div className="text-lg font-bold mb-2">{getVerificationLabel(result.verificationStatus as any)}</div>
              <p className="text-sm leading-relaxed">{result.verificationSummary}</p>
            </div>

            <p className="text-xs text-navy-400 mb-6">
              This is a decision-support output. Your teacher will review this case and make the final decision.
            </p>

            <button onClick={() => { setResult(null); setRecording(null); setTypedText(''); loadCheckins(); }} className="btn-secondary">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 text-sm">
        <span className="text-navy-600">Signed in as <span className="font-semibold text-navy-900">{user?.name}</span> ({user?.username})</span>
        <button onClick={logout} className="flex items-center gap-1 text-navy-500 hover:text-navy-800">
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-navy-900 mb-1">Late Arrival Explanation</h1>
        <p className="text-sm text-navy-500">Submit your explanation for your late arrival today</p>
      </div>

      {/* Arrival Info */}
      {selectedCheckinData && (
        <div className="card mb-6 border-orange-200 bg-orange-50">
          <div className="card-body">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 text-center">
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
          {/* Check-in selector */}
          <div>
            <label className="form-label" htmlFor="select-checkin">Late Arrival Record</label>
            {checkins.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                <CheckCircle2 size={14} />
                You have no late arrivals today.
              </div>
            ) : (
              <select
                id="select-checkin"
                className="form-input"
                value={selectedCheckin}
                onChange={(e) => setSelectedCheckin(e.target.value)}
              >
                {checkins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.class_code ? `${c.class_code} · ` : ''}Arrived {formatTime(c.timestamp)} — {formatLateMinutes(c.late_minutes)} late{c.reason ? ' (submitted)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {alreadyExplained && selectedCheckinData && (
            <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-sm">
              <div className="font-semibold text-navy-800 mb-1">Explanation already submitted</div>
              {selectedCheckinData.transcript && (
                <p className="italic text-navy-700 mb-2">“{selectedCheckinData.transcript}”</p>
              )}
              <div className="text-navy-600">
                Status: <span className="font-semibold">{getVerificationLabel(selectedCheckinData.verification_status || 'PENDING')}</span>
              </div>
            </div>
          )}

          {windowClosed && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>
                The {windowMinutes}-minute window to explain this late arrival has closed.
                Your teacher will see that no explanation was given in time.
              </span>
            </div>
          )}

          {/* Statement */}
          {checkins.length > 0 && !alreadyExplained && !windowClosed && (<>
          {secondsLeft !== null && (
            <div className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              secondsLeft <= 120 ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <Timer size={15} />
              {countdown} left to record your explanation
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Tell us why you were late</label>
              <button
                type="button"
                onClick={() => setMode(mode === 'voice' ? 'text' : 'voice')}
                className="flex items-center gap-1 text-xs font-medium text-navy-500 hover:text-navy-800"
              >
                {mode === 'voice' ? <><Keyboard size={13} /> Type instead</> : <><Mic size={13} /> Record instead</>}
              </button>
            </div>
            {mode === 'voice' ? (
              <VoiceRecorder onChange={setRecording} disabled={submitting} />
            ) : (
              <textarea
                id="statement-text"
                className="form-textarea"
                rows={4}
                placeholder="e.g. My bus from Pollachi was stuck in traffic because of the rain..."
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
              />
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="divider" />

          <button
            type="submit"
            id="btn-submit-explanation"
            className="btn-primary w-full justify-center"
            disabled={submitting || !hasStatement || !selectedCheckin}
          >
            <Send size={15} />
            {submitting ? (mode === 'voice' ? 'Transcribing and checking...' : 'Checking...') : 'Submit Explanation'}
          </button>
          </>)}

          <p className="text-xs text-navy-400 text-center leading-relaxed">
            Your recording is converted to text and checked alongside your commute, traffic and weather at the time.
            The audio itself is not stored. The teacher makes the final decision.
          </p>
        </div>
      </form>
    </div>
  );
}

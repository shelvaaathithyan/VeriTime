import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, AlertCircle, Send, Mic, Keyboard, LogOut, Timer, Lock } from 'lucide-react';
import { meApi, explanationApi } from '../services/api';
import { MyLateCheckin, Verdict, CurrentClass } from '../types';
import VerdictPanel from '../components/VerdictPanel';
import { useAuth } from '../context/AuthContext';
import { formatTime, formatScheduledTime, formatLateMinutes, getReasonLabel, getSessionStartLabel } from '../utils/formatters';
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
    transcript: string;
    reason: string;
    verdict: Verdict;
  } | null>(null);

  const hasStatement = mode === 'voice' ? !!recording : typedText.trim().length > 0;

  // Difference between server and phone clocks, so the countdown matches the server's deadline
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [windowMinutes, setWindowMinutes] = useState(10);
  const [now, setNow] = useState(Date.now());
  const [currentClass, setCurrentClass] = useState<CurrentClass | null>(null);
  const [currentStatus, setCurrentStatus] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCheckins = () =>
    meApi.lateCheckins()
      .then(({ serverTime, windowMinutes, currentClass, currentStatus, checkins: rows }) => {
        setClockOffsetMs(new Date(serverTime).getTime() - Date.now());
        setWindowMinutes(windowMinutes);
        setCurrentClass(currentClass);
        setCurrentStatus(currentStatus);
        setCheckins(rows);
        setSelectedCheckin((current) => {
          if (rows.some((r) => r.id === current)) return current;
          // Students open this page right after their door scan: show the scan for the class happening now
          return rows.find((r) => r.is_current_class)?.id || '';
        });
      })
      .finally(() => setLoading(false));

  // Refresh every 30 s so a scan made just now (or a class change) shows up without reloading
  useEffect(() => {
    loadCheckins();
    const timer = window.setInterval(loadCheckins, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const serverNow = new Date(now + clockOffsetMs);
  const nowLabel = serverNow.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
  const noClassLabel: Record<string, string> = {
    FREE_PERIOD: 'Free period',
    BREAK: 'Break between classes',
    DAY_SCHEDULE_COMPLETE: 'Classes are over for today',
    NO_SCHEDULED_CLASS: 'No class scheduled',
  };
  const currentScan = checkins.find((c) => c.is_current_class);

  const selectedCheckinData = checkins.find((c) => c.id === selectedCheckin);
  const alreadyExplained = !!selectedCheckinData?.reason;
  const deadlineMs = selectedCheckinData?.statement_deadline
    ? new Date(selectedCheckinData.statement_deadline).getTime() - clockOffsetMs
    : null;
  const secondsLeft = deadlineMs === null ? null : Math.max(0, Math.floor((deadlineMs - now) / 1000));
  // Attendance already decided without a reason (e.g. late too many times this week)
  const decidedWithoutReason = !alreadyExplained && !!selectedCheckinData?.verdict;
  const windowClosed = !alreadyExplained && !decidedWithoutReason && secondsLeft === 0;
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
        transcript: res.transcript,
        reason: res.reason,
        verdict: { verdict: res.verdict, attendance: res.attendance, summary: res.verdictSummary, claims: res.claims, checks: res.checks },
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
    const { attendance } = result.verdict;
    return (
      <div className="p-4 sm:p-8 max-w-xl mx-auto w-full">
        <div className="card">
          <div className="card-body py-8">
            <h2 className="text-xl font-bold text-navy-900 mb-1 font-display text-center">Explanation Checked</h2>
            <p className={`text-base font-semibold mb-6 text-center ${
              attendance === 'GRANTED' ? 'text-emerald-700' : attendance === 'DENIED' ? 'text-red-700' : 'text-navy-600'
            }`}>
              {attendance === 'GRANTED' ? 'Attendance granted. You may now enter the class.'
                : attendance === 'DENIED' ? 'Attendance denied for this period.'
                : 'You may enter the class. Your teacher will verify your attendance later.'}
            </p>

            <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-left mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-400 mb-1">What you said</div>
              <p className="text-sm text-navy-800 italic leading-relaxed">“{result.transcript}”</p>
              <div className="text-xs text-navy-500 mt-2">Understood as: <span className="font-semibold">{getReasonLabel(result.reason)}</span></div>
            </div>

            <div className="mb-6"><VerdictPanel verdict={result.verdict} /></div>

            <p className="text-xs text-navy-400 mb-6 text-center">
              This result is stored with your attendance record. Your teacher can review and change it.
            </p>

            <div className="text-center">
              <button onClick={() => { setResult(null); setRecording(null); setTypedText(''); loadCheckins(); }} className="btn-secondary">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto w-full">
      {/* Live clock and the class happening right now */}
      <div className="mb-4 rounded-lg bg-navy-900 text-white px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-navy-300">Now</div>
          <div className="font-mono text-lg font-bold">{nowLabel}</div>
        </div>
        <div className="text-right">
          {currentClass ? (
            <>
              <div className="text-sm font-semibold">Period {currentClass.period} · {currentClass.classCode}</div>
              <div className="text-xs text-navy-300">
                {currentClass.courseTitle}{currentClass.room ? ` · ${currentClass.room}` : ''} · {formatScheduledTime(currentClass.start)}–{formatScheduledTime(currentClass.end)}
              </div>
            </>
          ) : (
            <div className="text-sm text-navy-200">{noClassLabel[currentStatus] || 'No class right now'}</div>
          )}
        </div>
      </div>

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
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
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
              {selectedCheckinData.session_start && (
                <div>
                  <div className="text-xs text-navy-400 mb-1">Gate scan</div>
                  <div className={`font-mono font-bold ${selectedCheckinData.gate_entry_at ? 'text-navy-800' : 'text-amber-600 text-xs'}`}>
                    {selectedCheckinData.gate_entry_at ? formatTime(selectedCheckinData.gate_entry_at) : 'Not scanned'}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-navy-400 mb-1">Door scan</div>
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
            {(getSessionStartLabel(selectedCheckinData.session_start) || selectedCheckinData.simulated) && (
              <div className="mt-3 text-center text-xs text-navy-500">
                {selectedCheckinData.simulated ? `Simulated · ${selectedCheckinData.class_day} Period ${selectedCheckinData.period}` : ''}
                {selectedCheckinData.simulated && getSessionStartLabel(selectedCheckinData.session_start) ? ' · ' : ''}
                {getSessionStartLabel(selectedCheckinData.session_start)}
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <div className="card-body space-y-5">
          {/* Which door scan this is about — the current class's scan by default */}
          <div>
            {!currentScan && (
              <div className="flex items-start gap-2 text-sm text-navy-700 bg-navy-50 border border-navy-200 rounded px-3 py-2 mb-3">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>
                  {currentClass
                    ? `You have no late door scan for the current class (Period ${currentClass.period}, ${currentClass.classCode}). If you were just marked late, wait a few seconds or check that your card scanned at the class door.`
                    : 'There is no class running right now, so there is nothing to explain.'}
                </span>
              </div>
            )}
            {checkins.length > 0 && (
              <>
                <label className="form-label" htmlFor="select-checkin">
                  {selectedCheckinData?.is_current_class ? 'Your door scan for this class' : 'Late door scans today'}
                </label>
                <select
                  id="select-checkin"
                  className="form-input"
                  value={selectedCheckin}
                  onChange={(e) => setSelectedCheckin(e.target.value)}
                >
                  {!selectedCheckin && <option value="">View an earlier scan…</option>}
                  {checkins.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.is_current_class ? 'Now · ' : 'Earlier · '}{c.period ? `P${c.period} ` : ''}{c.class_code || ''} · scanned {formatTime(c.timestamp)}{c.reason ? ' (submitted)' : ''}
                    </option>
                  ))}
                </select>
                {selectedCheckinData && !selectedCheckinData.is_current_class && (
                  <p className="text-xs text-amber-700 mt-1">This scan is from an earlier class, not the one happening now.</p>
                )}
              </>
            )}
          </div>

          {alreadyExplained && selectedCheckinData && (
            <div className="space-y-3">
              <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 text-sm">
                <div className="font-semibold text-navy-800 mb-1">Explanation already submitted</div>
                {selectedCheckinData.transcript && (
                  <p className="italic text-navy-700">“{selectedCheckinData.transcript}”</p>
                )}
              </div>
              {selectedCheckinData.verdict && (
                <VerdictPanel verdict={{
                  verdict: selectedCheckinData.verdict,
                  attendance: selectedCheckinData.attendance || 'PENDING_REVIEW',
                  summary: selectedCheckinData.verdict_summary || '',
                  claims: selectedCheckinData.claims || [],
                  checks: selectedCheckinData.checks || [],
                }} />
              )}
            </div>
          )}

          {decidedWithoutReason && selectedCheckinData && (
            <VerdictPanel verdict={{
              verdict: selectedCheckinData.verdict!,
              attendance: selectedCheckinData.attendance || 'DENIED',
              summary: selectedCheckinData.verdict_summary || '',
              claims: selectedCheckinData.claims || [],
              checks: selectedCheckinData.checks || [],
            }} />
          )}

          {selectedCheckinData && windowClosed && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>
                The {windowMinutes}-minute window to explain this late arrival has closed.
                Your teacher will see that no explanation was given in time.
              </span>
            </div>
          )}

          {/* Statement */}
          {selectedCheckinData && !alreadyExplained && !decidedWithoutReason && !windowClosed && (<>
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <Lock size={15} className="mt-0.5 shrink-0" />
            <span>You are late. <strong>Do not enter the class</strong> until you have recorded and submitted your reason.</span>
          </div>
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

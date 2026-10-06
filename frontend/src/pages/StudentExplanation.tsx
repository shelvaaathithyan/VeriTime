import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, AlertCircle, Send, Mic, Keyboard, LogOut, Timer, Lock } from 'lucide-react';
import { explanationApi } from '../services/api';
import { MyLateCheckin, Verdict, CurrentClass } from '../types';
import VerdictPanel from '../components/VerdictPanel';
import { formatTime, formatScheduledTime, formatLateMinutes, getReasonLabel, getSessionStartLabel } from '../utils/formatters';
import LoadingSpinner from '../components/LoadingSpinner';
import VoiceRecorder, { VoiceRecording } from '../components/VoiceRecorder';

export default function StudentExplanation() {
  const [searchParams] = useSearchParams();

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

  const loadCheckins = () => {
    if (!defaultCheckinId) {
      setLoading(false);
      return Promise.resolve();
    }
    return explanationApi.getDetails(defaultCheckinId)
      .then(({ serverTime, windowMinutes, currentClass, currentStatus, checkins: rows }) => {
        setClockOffsetMs(new Date(serverTime).getTime() - Date.now());
        setWindowMinutes(windowMinutes);
        setCurrentClass(currentClass);
        setCurrentStatus(currentStatus);
        setCheckins(rows);
      })
      .catch(() => {
        // Fallback or handle error silently as UI will show empty state
      })
      .finally(() => setLoading(false));
  };

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-[760px] mx-auto w-full relative z-10 text-slate-800 min-h-screen flex flex-col font-sans pb-12">
      
      {/* 1. CURRENT CLASS CARD */}
      <div className="mb-8 rounded-2xl bg-white border border-slate-200 p-6 shadow-sm transition-all hover:shadow-md">
        <div className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">Current Class</div>
        {currentClass ? (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold text-slate-900 mb-1.5 leading-tight">{currentClass.courseTitle || 'Unknown Course'}</h2>
              <p className="text-sm font-medium text-slate-500">Period {currentClass.period} · {currentClass.classCode}{currentClass.room ? ` · ${currentClass.room}` : ''}</p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-sm font-bold text-slate-700 mb-2">
                {formatScheduledTime(currentClass.start)} &rarr; {formatScheduledTime(currentClass.end)}
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                {nowLabel} &middot; LIVE
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold text-slate-900 mb-1.5 leading-tight">{noClassLabel[currentStatus] || 'No class right now'}</h2>
            </div>
            <div className="text-left sm:text-right">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                {nowLabel} &middot; LIVE
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. PAGE HEADER */}
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-[28px] sm:text-[32px] font-bold text-slate-900 mb-2 leading-tight">Late Arrival Explanation</h1>
        <p className="text-[15px] sm:text-[16px] text-slate-500 font-medium">Tell us briefly what happened.</p>
      </div>

      {/* 3. ARRIVAL TIMELINE CARD */}
      {selectedCheckinData && (
        <div className="mb-8 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-8">
              <div className="text-xs font-bold text-slate-400 tracking-widest uppercase">Arrival Timeline</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Today &middot; {new Date(selectedCheckinData.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            
            <div className="relative mb-8 max-w-[500px] mx-auto">
              {/* Line behind the dots */}
              <div className="absolute top-[28px] left-[15%] right-[15%] h-[2px] bg-slate-200 z-0"></div>
              
              <div className="flex justify-between relative z-10 text-center">
                <div className="flex flex-col items-center w-1/3">
                  <div className="text-[13px] font-bold text-slate-800 mb-2">{formatScheduledTime(selectedCheckinData.scheduled_time)}</div>
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-400 border-2 border-white box-content mb-2"></div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Scheduled</div>
                </div>

                {selectedCheckinData.session_start && (
                  <div className="flex flex-col items-center w-1/3">
                    <div className="text-[13px] font-bold text-slate-800 mb-2">
                      {selectedCheckinData.gate_entry_at ? formatTime(selectedCheckinData.gate_entry_at) : '--:--'}
                    </div>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 border-white box-content mb-2 ${selectedCheckinData.gate_entry_at ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gate</div>
                  </div>
                )}

                <div className="flex flex-col items-center w-1/3">
                  <div className="text-[13px] font-bold text-slate-800 mb-2">{formatTime(selectedCheckinData.timestamp)}</div>
                  <div className="w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white box-content mb-2"></div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Door</div>
                </div>
              </div>
            </div>

            <div className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[14px] ${
              selectedCheckinData.late_minutes >= 30 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {selectedCheckinData.late_minutes >= 30 ? '🔴' : '🟠'} {formatLateMinutes(selectedCheckinData.late_minutes)} LATE
            </div>
            
            {(getSessionStartLabel(selectedCheckinData.session_start) || selectedCheckinData.simulated) && (
              <div className="mt-5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {selectedCheckinData.simulated ? `Simulated · ${selectedCheckinData.class_day} Period ${selectedCheckinData.period}` : ''}
                {selectedCheckinData.simulated && getSessionStartLabel(selectedCheckinData.session_start) ? ' · ' : ''}
                {getSessionStartLabel(selectedCheckinData.session_start)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. EXPLANATION SECTION */}
      <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="p-6 sm:p-8 space-y-8">
          
          {/* Missing scan warning */}
          {!currentScan && checkins.length > 0 && (
            <div className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 rounded-xl p-4">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="leading-relaxed">
                <span className="font-semibold text-slate-800 block mb-1">Missing scan for current class</span>
                {currentClass
                  ? `You have no late door scan for Period ${currentClass.period} (${currentClass.classCode}). If you were just marked late, wait a few seconds or ensure your card scanned at the class door.`
                  : 'There is no class running right now, so there is nothing to explain.'}
              </div>
            </div>
          )}

          {/* Selector */}
          {checkins.length > 0 && (
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-slate-400 mb-2 font-bold" htmlFor="select-checkin">
                {selectedCheckinData?.is_current_class ? 'Your door scan for this class' : 'Late door scans today'}
              </label>
              <div className="relative">
                <select
                  id="select-checkin"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-[15px] font-medium rounded-xl px-4 py-3.5 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors hover:bg-slate-100 cursor-pointer"
                  value={selectedCheckin}
                  onChange={(e) => setSelectedCheckin(e.target.value)}
                >
                  {!selectedCheckin && <option value="">Select a scan…</option>}
                  {checkins.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.is_current_class ? 'Now · ' : 'Earlier · '}{c.period ? `P${c.period} ` : ''}{c.class_code || ''} · scanned {formatTime(c.timestamp)}{c.reason ? ' (submitted)' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
          )}

          {alreadyExplained && selectedCheckinData && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 text-sm">
                <div className="font-bold text-slate-800 mb-2">Explanation already submitted</div>
                {selectedCheckinData.transcript && (
                  <p className="italic text-slate-600 leading-relaxed text-[15px]">“{selectedCheckinData.transcript}”</p>
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
            <div className="flex items-start gap-3 rounded-xl bg-red-50 p-5 text-[15px] text-red-800">
              <Lock size={20} className="mt-0.5 shrink-0 text-red-500" />
              <span className="leading-relaxed font-medium">
                The {windowMinutes}-minute window to explain this late arrival has closed.
                Your teacher will see that no explanation was given in time.
              </span>
            </div>
          )}

          {/* ACTIVE EXPLANATION AREA */}
          {selectedCheckinData && !alreadyExplained && !decidedWithoutReason && !windowClosed && (
            <div className="space-y-8 pt-4 border-t border-slate-100">
              
              {/* Clean Warning */}
              <div className={`rounded-xl p-5 border ${
                selectedCheckinData.late_minutes >= 30 ? 'bg-red-50/50 border-red-100' : 'bg-amber-50/50 border-amber-100'
              }`}>
                <div className="flex items-start gap-3">
                  <Lock size={20} className={`mt-0.5 shrink-0 ${selectedCheckinData.late_minutes >= 30 ? 'text-red-500' : 'text-amber-500'}`} />
                  <div>
                    <div className={`font-bold text-[15px] mb-1 ${selectedCheckinData.late_minutes >= 30 ? 'text-red-800' : 'text-amber-800'}`}>
                      Explanation required
                    </div>
                    <div className={`text-sm leading-relaxed ${selectedCheckinData.late_minutes >= 30 ? 'text-red-700' : 'text-amber-700'}`}>
                      You arrived {formatLateMinutes(selectedCheckinData.late_minutes)} after the scheduled time. 
                      Please submit a brief explanation before entering the class.
                    </div>
                  </div>
                </div>
              </div>

              {/* Countdown Progress Timer */}
              {secondsLeft !== null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Timer size={18} className={secondsLeft <= 120 ? 'text-red-500 animate-pulse' : 'text-slate-400'} />
                      <span className={`font-mono font-bold text-xl ${secondsLeft <= 120 ? 'text-red-600' : 'text-slate-800'}`}>
                        {countdown}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Time remaining to submit
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                        secondsLeft <= 60 ? 'bg-red-500' : secondsLeft <= 180 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, (secondsLeft / (windowMinutes * 60)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}
              {/* Input Area */}
              <div>
                <div className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4 text-center">Your Explanation</div>
                
                {/* Segmented Control */}
                <div className="flex p-1 bg-slate-100 rounded-xl mb-6 max-w-[240px] mx-auto">
                  <button
                    type="button"
                    onClick={() => setMode('voice')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                      mode === 'voice' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Mic size={16} /> Voice
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('text')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                      mode === 'text' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Keyboard size={16} /> Type
                  </button>
                </div>

                {mode === 'voice' ? (
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 p-2">
                    <VoiceRecorder onChange={setRecording} disabled={submitting} />
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      id="statement-text"
                      className="w-full bg-white border border-slate-200 text-slate-800 text-[15px] rounded-2xl p-5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder-slate-400 resize-none min-h-[160px]"
                      placeholder="Tell us what happened..."
                      value={typedText}
                      onChange={(e) => setTypedText(e.target.value)}
                    />
                    <div className="absolute bottom-4 right-4 text-xs font-semibold text-slate-400 bg-white px-1">
                      {typedText.length} chars
                    </div>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="flex items-start gap-3 text-sm text-red-800 bg-red-50 rounded-xl p-4 mt-6">
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                  <span className="font-medium">{submitError}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-6">
                <button
                  type="submit"
                  id="btn-submit-explanation"
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all duration-300 text-[15px] ${
                    submitting 
                      ? 'bg-blue-100 text-blue-500 cursor-wait' 
                      : !hasStatement || !selectedCheckin
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                  }`}
                  disabled={submitting || !hasStatement || !selectedCheckin}
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                  ) : !hasStatement || !selectedCheckin ? (
                    <Lock size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                  {submitting ? (mode === 'voice' ? 'Transcribing & Submitting...' : 'Submitting...') : 'Submit Explanation'}
                </button>
              </div>
            </div>
          )}

          {/* Supporting Info */}
          <div className="pt-6 border-t border-slate-100 mt-8">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center mb-2">What happens next?</h4>
            <p className="text-[13px] text-slate-500 text-center leading-relaxed max-w-md mx-auto">
              Your explanation is converted to text and checked alongside your commute, traffic and weather at the time. The audio itself is not stored. Your teacher makes the final decision.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

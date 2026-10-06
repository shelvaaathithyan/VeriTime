import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { ClaimCheck, Verdict } from '../types';

const VERDICT_STYLE: Record<string, { box: string; title: string; Icon: typeof CheckCircle2 }> = {
  TRUE: { box: 'border-emerald-300 bg-emerald-50 text-emerald-800', title: 'Reason is true', Icon: CheckCircle2 },
  FALSE: { box: 'border-red-300 bg-red-50 text-red-800', title: 'Reason is false', Icon: XCircle },
  UNVERIFIED: { box: 'border-slate-300 bg-slate-50 text-slate-700', title: 'Teacher will verify', Icon: HelpCircle },
  NO_STATEMENT: { box: 'border-red-300 bg-red-50 text-red-800', title: 'No reason given', Icon: XCircle },
  REPEATED_LATENESS: { box: 'border-red-300 bg-red-50 text-red-800', title: 'Late too many times this week', Icon: XCircle },
};

export function attendanceLabel(attendance?: string | null): string {
  if (attendance === 'GRANTED') return 'Attendance granted';
  if (attendance === 'DENIED') return 'Attendance denied';
  return 'Allowed in — teacher will verify';
}

const CLAIM_STYLE: Record<ClaimCheck['verdict'], { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  TRUE: { label: 'True', color: 'text-emerald-700', Icon: CheckCircle2 },
  FALSE: { label: 'False', color: 'text-red-700', Icon: XCircle },
  UNVERIFIABLE: { label: "Can't verify", color: 'text-slate-500', Icon: HelpCircle },
};

// Shows whether the student's reason matched the evidence, the attendance outcome, and each claim checked
export default function VerdictPanel({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict.verdict] || VERDICT_STYLE.UNVERIFIED;
  const { Icon } = style;
  return (
    <div className={`rounded-lg border p-4 text-left ${style.box}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={20} />
        <span className="text-lg font-bold">{style.title}</span>
        <span className="ml-auto text-xs font-bold uppercase tracking-wide">{attendanceLabel(verdict.attendance)}</span>
      </div>
      <p className="text-sm leading-relaxed mb-3">{verdict.summary}</p>

      {verdict.claims.length > 0 && (
        <ul className="space-y-2 border-t border-current/20 pt-3">
          {verdict.claims.map((c, i) => {
            const cs = CLAIM_STYLE[c.verdict];
            return (
              <li key={i} className="text-sm">
                <div className={`flex items-center gap-1.5 font-semibold ${cs.color}`}>
                  <cs.Icon size={14} />
                  {cs.label}: <span className="text-navy-900 font-medium">“{c.claim}”</span>
                </div>
                <p className="text-navy-700 ml-5">{c.reason}</p>
                <p className="text-[11px] text-navy-400 ml-5">Source: {c.source}</p>
              </li>
            );
          })}
        </ul>
      )}

      {verdict.checks && verdict.checks.length > 0 && (
        <div className="mt-3 border-t border-current/20 pt-3">
          <div className="text-xs font-bold uppercase tracking-wide mb-2">What was checked</div>
          <ul className="space-y-1.5">
            {verdict.checks.map((c, i) => (
              <li key={i} className="text-sm text-navy-700">
                <span className="font-semibold text-navy-900">{c.label}:</span> {c.result}
                <span className="text-[11px] text-navy-400"> · {c.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import { VerificationStatus, ExplanationReason } from '../types';

// Always shown in college time (IST), e.g. "01:46 PM", whatever timezone the device is set to
export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).toUpperCase();
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatScheduledTime(time: string | null | undefined): string {
  if (!time) return '—';
  // "08:00" -> "08:00 AM"
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatLateMinutes(minutes: number): string {
  if (minutes <= 0) return 'On time';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function getVerificationLabel(status: VerificationStatus): string {
  switch (status) {
    case 'SUPPORTED': return 'Supported';
    case 'PARTIALLY_SUPPORTED': return 'Partially Supported';
    case 'INCONSISTENT': return 'Inconsistent';
    case 'UNABLE_TO_VERIFY': return 'Unable to Verify';
    case 'PENDING': return 'Pending Review';
    default: return status;
  }
}

export function getVerificationBadgeClass(status: VerificationStatus): string {
  switch (status) {
    case 'SUPPORTED': return 'badge-supported';
    case 'PARTIALLY_SUPPORTED': return 'badge-partial';
    case 'INCONSISTENT': return 'badge-inconsistent';
    case 'UNABLE_TO_VERIFY': return 'badge-unable';
    case 'PENDING': return 'badge-pending';
    default: return 'badge-pending';
  }
}

export function getReasonLabel(reason: ExplanationReason | string): string {
  const map: Record<string, string> = {
    TRANSPORT_DELAY: 'Transport Delay',
    TRAFFIC: 'Traffic / Long Commute',
    HEAVY_RAIN: 'Heavy Rain / Weather',
    WEATHER: 'Weather',
    MEDICAL_EMERGENCY: 'Medical / Emergency',
    FAMILY_EMERGENCY: 'Family Emergency',
    TEACHER_MEETING: 'Meeting a Teacher',
    PLACEMENT: 'Placement Activity',
    COLLEGE_ACTIVITY: 'College Activity',
    HOSTEL_DELAY: 'Hostel-Related Delay',
    PERSONAL: 'Personal / Family Reason',
    OTHER: 'Other',
  };
  return map[reason] || reason;
}

// Label for classes where students arrive from outside campus (gate + door scans both matter)
export function getSessionStartLabel(sessionStart?: string | null): string | null {
  if (sessionStart === 'FIRST_CLASS') return 'First class of the day';
  if (sessionStart === 'AFTER_LUNCH') return 'First class after lunch';
  return null;
}

export function getEvidenceWeightColor(weight: string): string {
  switch (weight) {
    case 'STRONG': return 'text-emerald-600';
    case 'SUPPORTING': return 'text-blue-600';
    case 'PARTIAL': return 'text-amber-600';
    case 'CONTEXTUAL': return 'text-slate-500';
    default: return 'text-slate-400';
  }
}

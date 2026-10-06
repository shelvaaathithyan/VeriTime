// Shared TypeScript types for VeriTime frontend

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: 'STUDENT' | 'TEACHER';
  studentId: string | null;
}

export interface ClaimCheck {
  claim: string;
  verdict: 'TRUE' | 'FALSE' | 'UNVERIFIABLE';
  reason: string;
  source: string;
}

export interface DataCheck {
  label: string;
  result: string;
  source: string;
}

export interface Verdict {
  verdict: 'TRUE' | 'FALSE' | 'UNVERIFIED' | 'NO_STATEMENT' | 'REPEATED_LATENESS';
  attendance: 'GRANTED' | 'DENIED' | 'PENDING_REVIEW';
  summary: string;
  claims: ClaimCheck[];
  checks?: DataCheck[];
}

export interface MyLateCheckin {
  id: string;
  student_id: string;
  timestamp: string;
  scheduled_time: string;
  late_minutes: number;
  is_late: number;
  class_code?: string;
  period?: number;
  verification_status?: VerificationStatus;
  room?: string;
  session_start?: 'FIRST_CLASS' | 'AFTER_LUNCH' | null;
  gate_entry_at?: string | null;
  reason?: string;
  transcript?: string;
  statement_deadline?: string | null;
  verdict?: Verdict['verdict'] | null;
  attendance?: Verdict['attendance'] | null;
  verdict_summary?: string | null;
  claims?: ClaimCheck[];
  checks?: DataCheck[];
  late_count_week?: number | null;
  is_current_class?: boolean;
  class_day?: string | null;
  simulated?: number;
}

export interface TimetableSlot {
  day: string;
  period: number;
  start: string;
  end: string;
  code: string;
  title: string;
  room: string | null;
  staff: string[];
  isFree: boolean;
  sessionStart: 'FIRST_CLASS' | 'AFTER_LUNCH' | null;
}

export interface AttendanceCounts {
  present: number;
  late: number;
  denied: number;
  pending: number;
  absent: number;
  total: number;
}

export type RosterStatus = 'PRESENT' | 'LATE_GRANTED' | 'LATE_DENIED' | 'LATE_PENDING' | 'ABSENT' | 'NOT_YET';

export interface ClassRoster {
  slot: TimetableSlot;
  date: string;
  isToday: boolean;
  classOver: boolean;
  counts: AttendanceCounts;
  students: Array<{
    id: string;
    name: string;
    status: RosterStatus;
    doorTime: string | null;
    gateTime: string | null;
    lateMinutes: number;
    verdict: string | null;
    lateArrivalId: string | null;
    simulated: boolean;
  }>;
}

export interface MyClassesResponse {
  teacher: string;
  isTutor: boolean;
  today: string;
  classes: Array<TimetableSlot & { isToday: boolean; counts: AttendanceCounts }>;
}

export interface CurrentClass {
  period: number;
  classCode: string;
  courseTitle: string | null;
  room: string | null;
  start: string | null;
  end: string | null;
}

export interface MyLateCheckinsResponse {
  serverTime: string;
  windowMinutes: number;
  currentClass: CurrentClass | null;
  currentStatus: string;
  checkins: MyLateCheckin[];
}

export type VerificationStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INCONSISTENT'
  | 'UNABLE_TO_VERIFY'
  | 'PENDING';

export type TeacherDecision =
  | 'EXCUSED'
  | 'MARKED_LATE'
  | 'REQUEST_FURTHER_EVIDENCE';

export type ExplanationReason =
  | 'TRANSPORT_DELAY'
  | 'TRAFFIC'
  | 'HEAVY_RAIN'
  | 'WEATHER'
  | 'MEDICAL_EMERGENCY'
  | 'FAMILY_EMERGENCY'
  | 'TEACHER_MEETING'
  | 'PLACEMENT'
  | 'COLLEGE_ACTIVITY'
  | 'HOSTEL_DELAY'
  | 'PERSONAL'
  | 'OTHER';

export interface Student {
  id: string;
  name: string;
  department: string;
  student_type: string;
  email?: string;
  nfc_credential_id?: string;
  nfc_status?: string;
  home_area?: string;
  home_lat?: number;
  home_lng?: number;
}

export interface CommuteEstimate {
  distanceKm: number;
  durationMinutes: number;
  typicalMinutes: number;
  trafficDelayMinutes: number;
  source: 'GOOGLE_ROUTES' | 'ESTIMATE';
}

export interface NfcLookupResponse {
  registered: boolean;
  message?: string;
  student?: {
    id: string;
    name: string;
    department: string;
    studentType: string;
  };
  scheduledTime?: string;
  currentPeriod?: { subject: string; period: number } | null;
  currentTime?: string;
  lateMinutes?: number;
  isLate?: boolean;
}

export interface Checkin {
  id: string;
  student_id: string;
  name: string;
  department: string;
  student_type: string;
  timestamp: string;
  scheduled_time: string;
  late_minutes: number;
  is_late: number;
  location: string;
  reader_id: string;
  card_identifier?: string;
  verification_status?: VerificationStatus;
  schedule_status?: string;
  class_code?: string;
  period?: number;
}

export interface LateArrival {
  id: string;
  checkin_id: string;
  student_id: string;
  name: string;
  department: string;
  student_type: string;
  timestamp: string;
  scheduled_time: string;
  late_minutes: number;
  location: string;
  reason?: string;
  additional_explanation?: string;
  verification_status: VerificationStatus;
  verification_summary?: string;
  teacher_decision?: TeacherDecision;
  class_code?: string;
  period?: number;
  room?: string;
  gate_entry_at?: string | null;
  session_start?: 'FIRST_CLASS' | 'AFTER_LUNCH' | null;
  statement_missed?: number;
  verdict?: Verdict['verdict'] | null;
  attendance?: Verdict['attendance'] | null;
}

export interface EvidenceItem {
  type: string;
  detail: string;
  weight: 'STRONG' | 'SUPPORTING' | 'PARTIAL' | 'CONTEXTUAL' | 'NONE';
}

export interface LateArrivalEvidence {
  id: string;
  student: {
    id: string;
    name: string;
    department: string;
    studentType: string;
    homeArea?: string | null;
  };
  checkin: {
    timestamp: string;
    scheduledTime: string;
    lateMinutes: number;
    location: string;
    readerId: string;
    room?: string | null;
    gateEntryAt?: string | null;
    sessionStart?: 'FIRST_CLASS' | 'AFTER_LUNCH' | null;
    clockAdjusted?: boolean;
  };
  statementDeadline?: string | null;
  statementMissed?: boolean;
  verdict: Verdict | null;
  explanation: {
    reason: ExplanationReason;
    additionalExplanation?: string;
    timestamp: string;
    inputMode?: 'SELECTED' | 'VOICE' | 'TEXT';
    transcript?: string | null;
    summary?: string | null;
    minutesAfterArrival?: number | null;
  } | null;
  weather: {
    condition: string;
    severity: string;
    description?: string | null;
    location?: string | null;
  } | null;
  transport: {
    date: string;
    route: string;
    delay_minutes: number;
    description: string;
  } | null;
  isFirstArrival: boolean;
  commute: CommuteEstimate | null;
  historicalLateCount: number;
  verificationStatus: VerificationStatus;
  verificationSummary: string;
  evidence: EvidenceItem[];
  teacherDecision: {
    teacher_decision: TeacherDecision;
    timestamp: string;
    notes?: string;
  } | null;
}

export interface DashboardData {
  totalCheckins: number;
  lateArrivals: number;
  supported: number;
  needsReview: number;
  recentCheckins: Checkin[];
  date: string;
  currentStatus?: {
    isLate: boolean;
    reason: string;
    periodNumber?: number;
    subjectCode?: string;
    room?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
  };
}

export interface NfcCredential {
  card_identifier: string;
  status: string;
  registered_at: string;
  name: string;
  student_id: string;
  department: string;
}

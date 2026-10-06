// backend/src/services/timetableService.ts
export interface LateCalculationResult {
  isLate: boolean;
  lateMinutes?: number;
  reason: 'ON_TIME' | 'LATE' | 'FREE_PERIOD' | 'NO_SCHEDULED_CLASS' | 'DAY_SCHEDULE_COMPLETE' | 'BREAK';
  periodNumber?: number;
  subjectCode?: string;
  room?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  timetableId?: string; // Kept for backwards compatibility but we won't need it
}

const PERIODS = [
  { p: 1, start: '08:30', end: '09:20' },
  { p: 2, start: '09:20', end: '10:10' },
  { p: 3, start: '10:30', end: '11:20' },
  { p: 4, start: '11:20', end: '12:10' },
  { p: 5, start: '13:40', end: '14:30' },
  { p: 6, start: '14:30', end: '15:20' },
  { p: 7, start: '15:30', end: '16:20' },
  { p: 8, start: '16:20', end: '17:10' },
  { p: 9, start: '17:30', end: '18:20' },
  { p: 10, start: '18:20', end: '19:10' },
  { p: 11, start: '19:15', end: '20:05' },
  { p: 12, start: '20:05', end: '20:55' },
];

type TimetableEntry = { type: 'CLASS' | 'FREE' | 'EMPTY'; label?: string; room?: string };

// BE CSE (AI & ML), Semester 7 — shared by all students
export const COURSES: Record<string, { title: string; staff: string[] }> = {
  '23N003': { title: 'Recommender Systems', staff: ['Saranya K G'] },
  '23N014': { title: 'Cloud Computing', staff: ['Anne Merin Mathew'] },
  '23N017': { title: 'Computer Vision', staff: ['Archana K'] },
  '23N020': { title: 'Generative AI', staff: ['Anaswara C'] },
  '23N701': { title: 'Big Data and Advanced Database Systems', staff: ['Thirumahal R'] },
  '23NO02': { title: 'Design Thinking', staff: ['Adlene Anusha J'] },
  '23N710': { title: 'Big Data and Advanced Database Systems Laboratory', staff: ['Karthika L', 'Thirumahal R', 'Archana K', 'Viveka C'] },
  '23N711': { title: 'Project Work - I', staff: ['Sathiyapriya K', 'Suriya S'] },
  LIB: { title: 'Library', staff: ['Sathiyapriya K'] },
  TWM: { title: 'Tutor Ward Meeting', staff: ['Sathiyapriya K'] },
};

const EMPTY: TimetableEntry = { type: 'EMPTY' };

const TIMETABLE: Record<string, Record<number, TimetableEntry>> = {
  Monday: {
    1: { type: 'FREE', label: 'LIB' },
    2: { type: 'FREE', label: 'TWM', room: 'Q301' },
    3: { type: 'CLASS', label: '23N020', room: 'Q301' },
    4: { type: 'CLASS', label: '23N017', room: 'Q301' },
    5: { type: 'CLASS', label: '23N711' },
    6: { type: 'CLASS', label: '23N711' },
    7: { type: 'CLASS', label: '23N711' },
    8: { type: 'CLASS', label: '23N711' },
    9: EMPTY, 10: EMPTY, 11: EMPTY, 12: EMPTY,
  },
  Tuesday: {
    1: { type: 'FREE', label: 'LIB' },
    2: { type: 'CLASS', label: '23N701', room: 'Y202' },
    3: { type: 'CLASS', label: '23N003', room: 'Y202' },
    4: { type: 'CLASS', label: '23N003', room: 'Y202' },
    5: { type: 'CLASS', label: '23N014', room: 'Q301' },
    6: { type: 'CLASS', label: '23N020', room: 'Q301' },
    7: { type: 'FREE', label: 'LIB' },
    8: EMPTY, 9: EMPTY, 10: EMPTY, 11: EMPTY, 12: EMPTY,
  },
  Wednesday: {
    1: { type: 'FREE', label: 'LIB' },
    2: { type: 'CLASS', label: '23N014', room: 'Q301' },
    3: { type: 'CLASS', label: '23N017', room: 'Q301' },
    4: { type: 'FREE', label: 'LIB' },
    5: { type: 'CLASS', label: '23NO02', room: 'Q301' },
    6: { type: 'CLASS', label: '23NO02', room: 'Q301' },
    7: { type: 'FREE', label: 'LIB' },
    8: EMPTY, 9: EMPTY, 10: EMPTY, 11: EMPTY, 12: EMPTY,
  },
  Thursday: {
    1: { type: 'FREE', label: 'LIB' },
    2: { type: 'CLASS', label: '23N701', room: 'Q301' },
    3: { type: 'CLASS', label: '23N014', room: 'Q301' },
    4: { type: 'FREE', label: 'LIB' },
    5: { type: 'CLASS', label: '23N710' },
    6: { type: 'CLASS', label: '23N710' },
    7: { type: 'CLASS', label: '23N710' },
    8: { type: 'CLASS', label: '23N710' },
    9: EMPTY, 10: EMPTY, 11: EMPTY, 12: EMPTY,
  },
  Friday: {
    1: { type: 'FREE', label: 'LIB' },
    2: { type: 'CLASS', label: '23N017', room: 'Q301' },
    3: { type: 'CLASS', label: '23NO02', room: 'Q301' },
    4: { type: 'CLASS', label: '23N020', room: 'Q301' },
    5: { type: 'CLASS', label: '23N003', room: 'Y202' },
    6: { type: 'CLASS', label: '23N701', room: 'Y202' },
    7: { type: 'FREE', label: 'LIB' },
    8: EMPTY, 9: EMPTY, 10: EMPTY, 11: EMPTY, 12: EMPTY,
  },
};

export function calculateLateStatus(timestamp: string): LateCalculationResult {
  const dateObj = new Date(timestamp);
  
  const optionsDay: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', weekday: 'long' };
  const dayOfWeek = new Intl.DateTimeFormat('en-US', optionsDay).format(dateObj);

  if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
    return { isLate: false, reason: 'NO_SCHEDULED_CLASS' };
  }

  const optionsTime: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Kolkata', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  };
  const timeStr = new Intl.DateTimeFormat('en-US', optionsTime).format(dateObj);
  
  const daySchedule = TIMETABLE[dayOfWeek];
  if (!daySchedule) {
    return { isLate: false, reason: 'NO_SCHEDULED_CLASS' };
  }

  // Find the last period that is not EMPTY
  let lastNonEmptyPeriodIndex = -1;
  for (let i = PERIODS.length - 1; i >= 0; i--) {
    const p = PERIODS[i];
    const entry = daySchedule[p.p];
    if (entry && entry.type !== 'EMPTY') {
      lastNonEmptyPeriodIndex = i;
      break;
    }
  }

  if (lastNonEmptyPeriodIndex === -1) {
    return { isLate: false, reason: 'NO_SCHEDULED_CLASS' };
  }

  const lastClassEndTime = PERIODS[lastNonEmptyPeriodIndex].end;
  if (timeStr >= lastClassEndTime) {
    return { isLate: false, reason: 'DAY_SCHEDULE_COMPLETE' };
  }

  let activePeriod = null;
  let nextPeriod = null;
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    if (timeStr >= p.start && timeStr < p.end) {
      activePeriod = p;
      break;
    }
    if (timeStr < p.start) {
      nextPeriod = p;
      break;
    }
  }

  if (!activePeriod) {
    if (!nextPeriod) {
      return { isLate: false, reason: 'DAY_SCHEDULE_COMPLETE' };
    }
    // E.g. gap between periods, or before first period
    
    // Check if we are before the VERY FIRST non-empty period of the day
    let firstNonEmptyPeriodIndex = -1;
    for (let i = 0; i < PERIODS.length; i++) {
      const p = PERIODS[i];
      const entry = daySchedule[p.p];
      if (entry && entry.type !== 'EMPTY') {
        firstNonEmptyPeriodIndex = i;
        break;
      }
    }

    if (firstNonEmptyPeriodIndex !== -1) {
      const firstPeriodStart = PERIODS[firstNonEmptyPeriodIndex].start;
      if (timeStr < firstPeriodStart) {
        // Before the first actual period
        const entry = daySchedule[PERIODS[firstNonEmptyPeriodIndex].p];
        if (entry.type === 'CLASS') {
          return {
            isLate: false,
            reason: 'ON_TIME',
            periodNumber: PERIODS[firstNonEmptyPeriodIndex].p,
            subjectCode: entry.label,
            room: entry.room,
            scheduledStart: PERIODS[firstNonEmptyPeriodIndex].start,
            scheduledEnd: PERIODS[firstNonEmptyPeriodIndex].end
          };
        } else {
          return { isLate: false, reason: 'FREE_PERIOD' };
        }
      }
    }

    // We are between periods (BREAK).
    return { isLate: false, reason: 'BREAK' };
  }

  const entry = daySchedule[activePeriod.p];
  if (!entry || entry.type === 'EMPTY') {
    return { isLate: false, reason: 'NO_SCHEDULED_CLASS' };
  }

  if (entry.type === 'FREE') {
    return { isLate: false, reason: 'FREE_PERIOD' };
  }

  // We are IN a CLASS period, so we are LATE.
  // Wait, if timeStr === p.start, we are ON_TIME. "Student arrives: 14:30. Result: ON_TIME"
  // Wait, if timeStr >= p.start, technically it's inside the period.
  
  if (timeStr === activePeriod.start) {
    return {
      isLate: false,
      reason: 'ON_TIME',
      periodNumber: activePeriod.p,
      subjectCode: entry.label,
      room: entry.room,
      scheduledStart: activePeriod.start,
      scheduledEnd: activePeriod.end
    };
  }

  const [ch, cm] = timeStr.split(':').map(Number);
  const [sh, sm] = activePeriod.start.split(':').map(Number);
  const lateMinutes = (ch * 60 + cm) - (sh * 60 + sm);

  return {
    isLate: true,
    lateMinutes,
    reason: 'LATE',
    periodNumber: activePeriod.p,
    subjectCode: entry.label,
    room: entry.room,
    scheduledStart: activePeriod.start,
    scheduledEnd: activePeriod.end
  };
}

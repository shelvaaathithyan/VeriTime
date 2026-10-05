import { calculateLateStatus } from './src/services/timetableService';
import db from './src/models/database';

// Helper to mock the current timestamp
// We will test the given examples

// Note: Ensure the db has the seeded timetable when running this test

function runTest(testName: string, timestamp: string, expectedIsLate: boolean, expectedReason: string, expectedLateMinutes?: number) {
  const result = calculateLateStatus(timestamp);
  const passIsLate = result.isLate === expectedIsLate;
  const passReason = result.reason === expectedReason;
  const passLateMin = expectedLateMinutes === undefined ? true : result.lateMinutes === expectedLateMinutes;
  
  if (passIsLate && passReason && passLateMin) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    console.error(`  Expected: isLate=${expectedIsLate}, reason=${expectedReason}, lateMinutes=${expectedLateMinutes}`);
    console.error(`  Got: isLate=${result.isLate}, reason=${result.reason}, lateMinutes=${result.lateMinutes}`);
  }
}

console.log('Running Timetable Tests...');

// Note: ISO string includes the day of week. 
// For Asia/Kolkata, we need appropriate dates. Let's use 2026-10-xx which match the days
// 2026-10-05 = Monday
// 2026-10-06 = Tuesday
// 2026-10-07 = Wednesday
// 2026-10-08 = Thursday
// 2026-10-09 = Friday

const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const THU = '2026-10-08';
const FRI = '2026-10-09';

runTest('TEST 1: Monday 09:00 (LIB)', `${MON}T09:00:00.000+05:30`, false, 'FREE_PERIOD');
runTest('TEST 2: Monday 09:30 (TWM)', `${MON}T09:30:00.000+05:30`, false, 'FREE_PERIOD');
runTest('TEST 3: Monday 10:25 (Gap)', `${MON}T10:25:00.000+05:30`, false, 'NO_SCHEDULED_CLASS');
runTest('TEST 4: Monday 10:30 (On time for 10:30)', `${MON}T10:30:00.000+05:30`, false, 'ON_TIME');
runTest('TEST 5: Monday 10:35 (Late for 10:30)', `${MON}T10:35:00.000+05:30`, true, 'LATE', 5);
runTest('TEST 6: Monday 11:25 (Class over)', `${MON}T11:25:00.000+05:30`, true, 'LATE', 5); // Late for 11:20 class
// Ah, test 6 says "Monday 11:25, the 10:30 class is over. Find currently active... If no active: NO_SCHEDULED_CLASS."
// Wait, my timetable for Monday has:
// Period 3: 10:30 - 11:20
// Period 4: 11:20 - 12:10
// So at 11:25, Period 4 is active. If they scan at 11:25, they are late for Period 4!
runTest('TEST 7: Monday 13:00 (Lunch gap)', `${MON}T13:00:00.000+05:30`, false, 'NO_SCHEDULED_CLASS');
runTest('TEST 8: Monday 13:50 (Late for 13:40)', `${MON}T13:50:00.000+05:30`, true, 'LATE', 10);
runTest('TEST 9: Monday 17:15 (After day)', `${MON}T17:15:00.000+05:30`, false, 'DAY_SCHEDULE_COMPLETE');
runTest('TEST 10: Tuesday 09:25 (Late for 09:20)', `${TUE}T09:25:00.000+05:30`, true, 'LATE', 5);
runTest('TEST 11: Wednesday 11:30 (LIB)', `${WED}T11:30:00.000+05:30`, false, 'FREE_PERIOD');
runTest('TEST 12: Thursday 14:00 (Late for 13:40)', `${THU}T14:00:00.000+05:30`, true, 'LATE', 20);
runTest('TEST 13: Friday 15:45 (LIB)', `${FRI}T15:45:00.000+05:30`, false, 'FREE_PERIOD');

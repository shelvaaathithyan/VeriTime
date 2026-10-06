import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../services/password';

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'veritime.db');
const db = new Database(DB_PATH);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      student_type TEXT NOT NULL,
      email TEXT,
      nfc_credential_id TEXT,
      home_area TEXT,
      home_lat REAL,
      home_lng REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nfc_credentials (
      id TEXT PRIMARY KEY,
      card_identifier TEXT UNIQUE NOT NULL,
      student_id TEXT,
      status TEXT DEFAULT 'ACTIVE',
      registered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id TEXT PRIMARY KEY,
      day_of_week TEXT NOT NULL,
      subject TEXT NOT NULL,
      room TEXT,
      period INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_free_period INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      card_identifier TEXT,
      timestamp TEXT NOT NULL,
      reader_id TEXT,
      location TEXT,
      scheduled_time TEXT,
      timetable_id TEXT,
      late_minutes INTEGER DEFAULT 0,
      is_late INTEGER DEFAULT 0,
      schedule_status TEXT DEFAULT 'ON_TIME',
      scheduled_end TEXT,
      period INTEGER,
      class_code TEXT,
      is_first_arrival INTEGER DEFAULT 0,
      commute_distance_km REAL,
      commute_duration_min INTEGER,
      commute_typical_min INTEGER,
      commute_traffic_delay_min INTEGER,
      commute_source TEXT,
      weather_condition TEXT,
      weather_description TEXT,
      weather_severity TEXT,
      weather_location TEXT,
      checkpoint TEXT DEFAULT 'GATE',   -- 'GATE' (campus entry) | 'CLASSROOM' (decides lateness)
      room TEXT,
      received_at TEXT,                 -- server clock when the tap arrived
      clock_adjusted INTEGER DEFAULT 0, -- 1 if the device clock was off and server time was used
      gate_entry_at TEXT,               -- first gate tap that day, for classroom check-ins
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS explanations (
      id TEXT PRIMARY KEY,
      checkin_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      additional_explanation TEXT,
      input_mode TEXT DEFAULT 'SELECTED',
      transcript TEXT,
      statement_summary TEXT,
      analysis_json TEXT,
      minutes_after_arrival INTEGER,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (checkin_id) REFERENCES checkins(id)
    );

    CREATE TABLE IF NOT EXISTS weather_records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      condition TEXT NOT NULL,
      severity TEXT DEFAULT 'NONE',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS transport_events (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      route TEXT,
      delay_minutes INTEGER DEFAULT 0,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS late_arrivals (
      id TEXT PRIMARY KEY,
      checkin_id TEXT NOT NULL UNIQUE,
      student_id TEXT NOT NULL,
      explanation_id TEXT,
      verification_status TEXT DEFAULT 'PENDING',
      verification_summary TEXT,
      evidence_json TEXT,
      statement_deadline TEXT,          -- student must explain before this time
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (checkin_id) REFERENCES checkins(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,            -- 'STUDENT' | 'TEACHER'
      name TEXT NOT NULL,
      student_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS teacher_decisions (
      id TEXT PRIMARY KEY,
      late_arrival_id TEXT NOT NULL,
      teacher_decision TEXT NOT NULL,
      teacher_id TEXT,
      notes TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (late_arrival_id) REFERENCES late_arrivals(id)
    );
  `);

  migrateColumns();
  seedDatabase();
  seedDemoStudentLocations();
  seedUserAccounts();
}

// Demo password for seeded accounts (set DEMO_PASSWORD in .env to change it for new accounts)
export function demoPassword(): string {
  return process.env.DEMO_PASSWORD || 'veritime123';
}

// Creates a login for a student (username = roll number) if they don't have one yet
export function ensureStudentAccount(studentId: string, name: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, role, name, student_id)
    VALUES (?, ?, ?, 'STUDENT', ?, ?)
  `).run(uuidv4(), studentId, hashPassword(demoPassword()), name, studentId);
}

function seedUserAccounts(): void {
  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, username, password_hash, role, name, student_id)
      VALUES (?, 'teacher', ?, 'TEACHER', 'Class Tutor', NULL)
    `).run(uuidv4(), hashPassword(demoPassword()));

    const students = db.prepare(`
      SELECT s.id, s.name FROM students s LEFT JOIN users u ON u.student_id = s.id WHERE u.id IS NULL
    `).all() as Array<{ id: string; name: string }>;
    for (const s of students) ensureStudentAccount(s.id, s.name);
  })();
}

// Adds columns introduced after the original schema to existing databases
function migrateColumns(): void {
  const addColumnIfMissing = (table: string, column: string, type: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  };

  addColumnIfMissing('students', 'home_area', 'TEXT');
  addColumnIfMissing('students', 'home_lat', 'REAL');
  addColumnIfMissing('students', 'home_lng', 'REAL');

  addColumnIfMissing('checkins', 'scheduled_end', 'TEXT');
  addColumnIfMissing('checkins', 'period', 'INTEGER');
  addColumnIfMissing('checkins', 'class_code', 'TEXT');
  addColumnIfMissing('checkins', 'is_first_arrival', 'INTEGER DEFAULT 0');
  addColumnIfMissing('checkins', 'commute_distance_km', 'REAL');
  addColumnIfMissing('checkins', 'commute_duration_min', 'INTEGER');
  addColumnIfMissing('checkins', 'commute_typical_min', 'INTEGER');
  addColumnIfMissing('checkins', 'commute_traffic_delay_min', 'INTEGER');
  addColumnIfMissing('checkins', 'commute_source', 'TEXT');
  addColumnIfMissing('checkins', 'weather_condition', 'TEXT');
  addColumnIfMissing('checkins', 'weather_description', 'TEXT');
  addColumnIfMissing('checkins', 'weather_severity', 'TEXT');
  addColumnIfMissing('checkins', 'weather_location', 'TEXT');
  addColumnIfMissing('checkins', 'checkpoint', "TEXT DEFAULT 'GATE'");
  addColumnIfMissing('checkins', 'room', 'TEXT');
  addColumnIfMissing('checkins', 'received_at', 'TEXT');
  addColumnIfMissing('checkins', 'clock_adjusted', 'INTEGER DEFAULT 0');
  addColumnIfMissing('checkins', 'gate_entry_at', 'TEXT');

  addColumnIfMissing('late_arrivals', 'statement_deadline', 'TEXT');
  addColumnIfMissing('explanations', 'minutes_after_arrival', 'INTEGER');

  addColumnIfMissing('explanations', 'input_mode', "TEXT DEFAULT 'SELECTED'");
  addColumnIfMissing('explanations', 'transcript', 'TEXT');
  addColumnIfMissing('explanations', 'statement_summary', 'TEXT');
  addColumnIfMissing('explanations', 'analysis_json', 'TEXT');
}

// Made-up residential locations for demo purposes. Commute times are
// approximate drive times to campus (Peelamedu, Coimbatore) without traffic.
const DEMO_STUDENTS: Array<{
  id: string; name: string; department: string; studentType: string;
  homeArea: string; lat: number; lng: number;
}> = [
  { id: '23n236', name: 'Pranika S',   department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'Saravanampatti, Coimbatore', lat: 11.0797, lng: 76.9997 }, // ~20 min
  { id: '23n201', name: 'Arjun K',     department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'Hope College, Peelamedu',    lat: 11.0268, lng: 77.0157 }, // ~5 min
  { id: '23n214', name: 'Divya R',     department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'R.S. Puram, Coimbatore',     lat: 11.0090, lng: 76.9525 }, // ~25 min
  { id: '23n222', name: 'Karthik M',   department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'Pollachi',                   lat: 10.6609, lng: 77.0048 }, // ~1 h 10 min
  { id: '23n229', name: 'Meera V',     department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'Tiruppur',                   lat: 11.1085, lng: 77.3411 }, // ~1 h 15 min
  { id: '23n241', name: 'Rahul S',     department: 'CSE (AI&ML)', studentType: 'Day Scholar', homeArea: 'Erode',                      lat: 11.3410, lng: 77.7172 }, // ~2 h
  { id: '23n250', name: 'Sneha P',     department: 'CSE (AI&ML)', studentType: 'Hostel',      homeArea: 'PSG Tech Hostel (on campus)', lat: 11.0262, lng: 77.0050 }, // on campus
];

function seedDemoStudentLocations(): void {
  const insertStudent = db.prepare(`
    INSERT OR IGNORE INTO students (id, name, department, student_type, email, home_area, home_lat, home_lng)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
  `);
  // Only fill in a location if the student doesn't already have one
  const setLocation = db.prepare(`
    UPDATE students SET home_area = ?, home_lat = ?, home_lng = ?
    WHERE id = ? AND home_lat IS NULL
  `);

  db.transaction(() => {
    for (const s of DEMO_STUDENTS) {
      insertStudent.run(s.id, s.name, s.department, s.studentType, s.homeArea, s.lat, s.lng);
      setLocation.run(s.homeArea, s.lat, s.lng, s.id);
    }
  })();
}

function seedDatabase(): void {
  const studentCount = (db.prepare('SELECT COUNT(*) as count FROM students').get() as any).count;
  if (studentCount > 0) return;

  const insertStudent = db.prepare(`
    INSERT OR IGNORE INTO students (id, name, department, student_type, email)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Seed only the real MVP student
  insertStudent.run('23n236', 'Pranika S', 'CSE (AI&ML)', 'Day Scholar', null);

  // Seed the real NFC credential mapping
  db.prepare(`
    INSERT OR IGNORE INTO nfc_credentials (id, card_identifier, student_id, status)
    VALUES ('cred-pranika-001', '5D:2E:70:A0', '23n236', 'ACTIVE')
  `).run();

  // Seed timetable if empty
  const timetableCount = (db.prepare('SELECT COUNT(*) as count FROM timetable').get() as any).count;
  if (timetableCount === 0) {
    const insertTt = db.prepare(`INSERT INTO timetable (id, day_of_week, subject, room, period, start_time, end_time, is_free_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertManyTt = db.transaction(() => {
      // MONDAY
      insertTt.run('tt-mon-1', 'Monday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-mon-2', 'Monday', 'TWM', 'Q301', 2, '09:20', '10:10', 1);
      insertTt.run('tt-mon-3', 'Monday', '23N020', 'Q301', 3, '10:30', '11:20', 0);
      insertTt.run('tt-mon-4', 'Monday', '23N017', 'Q301', 4, '11:20', '12:10', 0);
      insertTt.run('tt-mon-5', 'Monday', '23N711', '*', 5, '13:40', '14:30', 0);
      insertTt.run('tt-mon-6', 'Monday', '23N711', '*', 6, '14:30', '15:20', 0);
      insertTt.run('tt-mon-7', 'Monday', '23N711', '*', 7, '15:30', '16:20', 0);
      insertTt.run('tt-mon-8', 'Monday', '23N711', '*', 8, '16:20', '17:10', 0);

      // TUESDAY
      insertTt.run('tt-tue-1', 'Tuesday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-tue-2', 'Tuesday', '23N701', 'Y202', 2, '09:20', '10:10', 0);
      insertTt.run('tt-tue-3', 'Tuesday', '23N003', 'Y202', 3, '10:30', '11:20', 0);
      insertTt.run('tt-tue-4', 'Tuesday', '23N003', 'Y202', 4, '11:20', '12:10', 0);
      insertTt.run('tt-tue-5', 'Tuesday', '23N014', 'Q301', 5, '13:40', '14:30', 0);
      insertTt.run('tt-tue-6', 'Tuesday', '23N020', 'Q301', 6, '14:30', '15:20', 0);
      insertTt.run('tt-tue-7', 'Tuesday', 'LIB', null, 7, '15:30', '16:20', 1);

      // WEDNESDAY
      insertTt.run('tt-wed-1', 'Wednesday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-wed-2', 'Wednesday', '23N014', 'Q301', 2, '09:20', '10:10', 0);
      insertTt.run('tt-wed-3', 'Wednesday', '23N017', 'Q301', 3, '10:30', '11:20', 0);
      insertTt.run('tt-wed-4', 'Wednesday', 'LIB', null, 4, '11:20', '12:10', 1);
      insertTt.run('tt-wed-5', 'Wednesday', '23NO02', 'Q301', 5, '13:40', '14:30', 0);
      insertTt.run('tt-wed-6', 'Wednesday', '23NO02', 'Q301', 6, '14:30', '15:20', 0);
      insertTt.run('tt-wed-7', 'Wednesday', 'LIB', null, 7, '15:30', '16:20', 1);

      // THURSDAY
      insertTt.run('tt-thu-1', 'Thursday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-thu-2', 'Thursday', '23N701', 'Q301', 2, '09:20', '10:10', 0);
      insertTt.run('tt-thu-3', 'Thursday', '23N014', 'Q301', 3, '10:30', '11:20', 0);
      insertTt.run('tt-thu-4', 'Thursday', 'LIB', null, 4, '11:20', '12:10', 1);
      insertTt.run('tt-thu-5', 'Thursday', '23N710', null, 5, '13:40', '14:30', 0);
      insertTt.run('tt-thu-6', 'Thursday', '23N710', null, 6, '14:30', '15:20', 0);
      insertTt.run('tt-thu-7', 'Thursday', '23N710', null, 7, '15:30', '16:20', 0);
      insertTt.run('tt-thu-8', 'Thursday', '23N710', null, 8, '16:20', '17:10', 0);

      // FRIDAY
      insertTt.run('tt-fri-1', 'Friday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-fri-2', 'Friday', '23N017', 'Q301', 2, '09:20', '10:10', 0);
      insertTt.run('tt-fri-3', 'Friday', '23NO02', 'Q301', 3, '10:30', '11:20', 0);
      insertTt.run('tt-fri-4', 'Friday', '23N020', 'Q301', 4, '11:20', '12:10', 0);
      insertTt.run('tt-fri-5', 'Friday', '23N003', 'Y202', 5, '13:40', '14:30', 0);
      insertTt.run('tt-fri-6', 'Friday', '23N701', 'Y202', 6, '14:30', '15:20', 0);
      insertTt.run('tt-fri-7', 'Friday', 'LIB', null, 7, '15:30', '16:20', 1);
    });
    insertManyTt();
  }
}

export default db;

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS explanations (
      id TEXT PRIMARY KEY,
      checkin_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      additional_explanation TEXT,
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (checkin_id) REFERENCES checkins(id)
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

  seedDatabase();
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
      insertTt.run('tt-mon-2', 'Monday', 'TWM', 'Q305', 2, '09:20', '10:10', 1);
      insertTt.run('tt-mon-3', 'Monday', '23N020', 'Q305', 3, '10:30', '11:20', 0);
      insertTt.run('tt-mon-4', 'Monday', '23N017', 'Q305', 4, '11:20', '12:10', 0);
      insertTt.run('tt-mon-5', 'Monday', '23N711', '*', 5, '13:40', '14:30', 0);
      insertTt.run('tt-mon-6', 'Monday', '23N711', '*', 6, '14:30', '15:20', 0);
      insertTt.run('tt-mon-7', 'Monday', '23N711', '*', 7, '15:30', '16:20', 0);
      insertTt.run('tt-mon-8', 'Monday', '23N711', '*', 8, '16:20', '17:10', 0);

      // TUESDAY
      insertTt.run('tt-tue-1', 'Tuesday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-tue-2', 'Tuesday', '23N701', 'Y302', 2, '09:20', '10:10', 0);
      insertTt.run('tt-tue-3', 'Tuesday', '23N003', 'Y202', 3, '10:30', '11:20', 0);
      insertTt.run('tt-tue-4', 'Tuesday', '23N003', 'Y202', 4, '11:20', '12:10', 0);
      insertTt.run('tt-tue-5', 'Tuesday', '23N014', 'Q303', 5, '13:40', '14:30', 0);
      insertTt.run('tt-tue-6', 'Tuesday', '23N020', 'Q303', 6, '14:30', '15:20', 0);
      insertTt.run('tt-tue-7', 'Tuesday', 'LIB', null, 7, '15:30', '16:20', 1);

      // WEDNESDAY
      insertTt.run('tt-wed-1', 'Wednesday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-wed-2', 'Wednesday', '23N014', 'Y402', 2, '09:20', '10:10', 0);
      insertTt.run('tt-wed-3', 'Wednesday', '23N017', 'Y402', 3, '10:30', '11:20', 0);
      insertTt.run('tt-wed-4', 'Wednesday', 'LIB', null, 4, '11:20', '12:10', 1);
      insertTt.run('tt-wed-5', 'Wednesday', '23N002', 'Q303', 5, '13:40', '14:30', 0);
      insertTt.run('tt-wed-6', 'Wednesday', '23N002', 'Q303', 6, '14:30', '15:20', 0);
      insertTt.run('tt-wed-7', 'Wednesday', 'LIB', null, 7, '15:30', '16:20', 1);

      // THURSDAY
      insertTt.run('tt-thu-1', 'Thursday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-thu-2', 'Thursday', '23N701', 'G604', 2, '09:20', '10:10', 0);
      insertTt.run('tt-thu-3', 'Thursday', '23N014', 'Y304', 3, '10:30', '11:20', 0);
      insertTt.run('tt-thu-4', 'Thursday', 'LIB', null, 4, '11:20', '12:10', 1);
      insertTt.run('tt-thu-5', 'Thursday', '23N710', null, 5, '13:40', '14:30', 0);
      insertTt.run('tt-thu-6', 'Thursday', '23N710', null, 6, '14:30', '15:20', 0);
      insertTt.run('tt-thu-7', 'Thursday', '23N710', null, 7, '15:30', '16:20', 0);
      insertTt.run('tt-thu-8', 'Thursday', '23N710', null, 8, '16:20', '17:10', 0);

      // FRIDAY
      insertTt.run('tt-fri-1', 'Friday', 'LIB', null, 1, '08:30', '09:20', 1);
      insertTt.run('tt-fri-2', 'Friday', '23N017', 'A315', 2, '09:20', '10:10', 0);
      insertTt.run('tt-fri-3', 'Friday', '23N002', 'Q306', 3, '10:30', '11:20', 0);
      insertTt.run('tt-fri-4', 'Friday', '23N020', 'Q306', 4, '11:20', '12:10', 0);
      insertTt.run('tt-fri-5', 'Friday', '23N003', 'Y202', 5, '13:40', '14:30', 0);
      insertTt.run('tt-fri-6', 'Friday', '23N701', 'Q302', 6, '14:30', '15:20', 0);
      insertTt.run('tt-fri-7', 'Friday', 'LIB', null, 7, '15:30', '16:20', 1);
    });
    insertManyTt();
  }
}

export default db;

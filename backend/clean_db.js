const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data/veritime.db');
const backupPath = path.join(__dirname, 'data/veritime.db.bak');

// Backup first
fs.copyFileSync(dbPath, backupPath);

const db = new Database(dbPath);

db.exec(`
  DELETE FROM teacher_decisions WHERE late_arrival_id IN (SELECT id FROM late_arrivals WHERE student_id != '23n236');
  DELETE FROM late_arrivals WHERE student_id != '23n236';
  DELETE FROM explanations WHERE student_id != '23n236';
  DELETE FROM checkins WHERE student_id != '23n236';
  DELETE FROM nfc_credentials WHERE student_id != '23n236';
  DELETE FROM students WHERE id != '23n236';
  
  DELETE FROM weather_records;
  DELETE FROM transport_events;
`);
console.log('Database cleaned');

// Verify records
const students = db.prepare('SELECT * FROM students').all();
const credentials = db.prepare('SELECT * FROM nfc_credentials').all();
console.log('Remaining students:', students);
console.log('Remaining credentials:', credentials);

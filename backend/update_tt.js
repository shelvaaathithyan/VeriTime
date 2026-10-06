const db = require('better-sqlite3')('data/veritime.db');
db.prepare(`INSERT OR REPLACE INTO timetable (id, day_of_week, subject, room, period, start_time, end_time, is_free_period) VALUES ('tt-tue-test', 'Tuesday', 'TEST-CLASS', 'Q301', 8, '18:00', '23:59', 0)`).run();
console.log('Database updated');

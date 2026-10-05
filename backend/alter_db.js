const Database = require('better-sqlite3');
const db = new Database('data/veritime.db');
try {
  db.exec('ALTER TABLE checkins ADD COLUMN schedule_status TEXT DEFAULT "ON_TIME"');
  console.log('Added column');
} catch(e) {
  console.log(e.message);
}

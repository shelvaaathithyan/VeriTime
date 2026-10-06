const dateObj = new Date('2026-10-06T13:56:26.000Z'); // 19:26 IST
const optionsTime = { 
  timeZone: 'Asia/Kolkata', 
  hour: '2-digit', 
  minute: '2-digit',
  hour12: false
};
const timeStr = new Intl.DateTimeFormat('en-US', optionsTime).format(dateObj);
console.log("timeStr:", timeStr);

import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 5001;

app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`\n🚀 VeriTime API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api\n`);
});

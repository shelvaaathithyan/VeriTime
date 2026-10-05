import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import EvidenceDetail from './pages/EvidenceDetail';
import StudentExplanation from './pages/StudentExplanation';
import Students from './pages/Students';
import StudentProfile from './pages/StudentProfile';
import NfcCredentials from './pages/NfcCredentials';
import TopBar from './components/TopBar';

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-navy-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top bar */}
          <TopBar />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/evidence/:id" element={<EvidenceDetail />} />
              <Route path="/explanation" element={<StudentExplanation />} />
              <Route path="/students" element={<Students />} />
              <Route path="/students/:id" element={<StudentProfile />} />
              <Route path="/nfc-credentials" element={<NfcCredentials />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;

import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import EvidenceDetail from './pages/EvidenceDetail';
import StudentExplanation from './pages/StudentExplanation';
import Students from './pages/Students';
import StudentProfile from './pages/StudentProfile';
import NfcCredentials from './pages/NfcCredentials';
import TopBar from './components/TopBar';
import Login, { homePathFor } from './pages/Login';
import LoadingSpinner from './components/LoadingSpinner';
import { AuthProvider, useAuth } from './context/AuthContext';

// Sends signed-out users to the login page and keeps each role on its own pages
function RequireRole({ role, children }: { role: 'STUDENT' | 'TEACHER'; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner message="Loading..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

function AdminShell() {
  return (
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
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/nfc-credentials" element={<NfcCredentials />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Student-facing page: opened on the student's phone, no admin navigation */}
        <Route
          path="/explanation"
          element={
            <RequireRole role="STUDENT">
              <main className="min-h-screen bg-navy-50">
                <StudentExplanation />
              </main>
            </RequireRole>
          }
        />
        <Route path="*" element={<RequireRole role="TEACHER"><AdminShell /></RequireRole>} />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

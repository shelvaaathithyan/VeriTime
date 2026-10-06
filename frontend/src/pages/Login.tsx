import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Shield, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function homePathFor(role: 'STUDENT' | 'TEACHER'): string {
  return role === 'STUDENT' ? '/explanation' : '/';
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Page the user was trying to reach before being sent to log in
  const from = (location.state as { from?: string } | null)?.from;

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login(username, password);
      const home = homePathFor(loggedIn.role);
      // Only return to the original page if this role is allowed there
      const isStudentPage = !!from && from.startsWith('/explanation');
      const canReturn = from && (loggedIn.role === 'STUDENT' ? isStudentPage : !isStudentPage);
      navigate(canReturn ? from! : home, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-navy-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-navy-900 rounded-lg flex items-center justify-center mb-3">
            <Shield className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-navy-900 font-display">VeriTime</h1>
          <p className="text-sm text-navy-500">Late Arrival Verification</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <div className="card-body space-y-4">
            <div>
              <label className="form-label" htmlFor="username">Roll number or staff username</label>
              <input
                id="username"
                className="form-input"
                autoComplete="username"
                autoCapitalize="none"
                placeholder="e.g. 23n236"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full justify-center"
              disabled={submitting || !username || !password}
            >
              <LogIn size={15} />
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="text-xs text-navy-400 text-center mt-4">
          Students sign in with their roll number. Teachers sign in with their staff username.
        </p>
      </div>
    </main>
  );
}

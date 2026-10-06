import { useLocation } from 'react-router-dom';
import { RefreshCw, Activity, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';

export default function TopBar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const date = new Date().toISOString();
  
  let title = 'Dashboard';
  if (location.pathname.startsWith('/teacher')) title = 'Teacher Review';
  else if (location.pathname.startsWith('/students/')) title = 'Student Profile';
  else if (location.pathname.startsWith('/students')) title = 'Student Directory';
  else if (location.pathname.startsWith('/evidence')) title = 'Late Arrival Review';
  else if (location.pathname.startsWith('/explanation')) title = 'Submit Explanation';
  else if (location.pathname.startsWith('/nfc-credentials')) title = 'Administration';
  else if (location.pathname.startsWith('/scan-simulator')) title = 'Scan Simulator';
  else if (location.pathname.startsWith('/classes/')) title = 'Class Attendance';
  else if (location.pathname.startsWith('/classes')) title = 'My Classes';

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <header className="bg-white border-b border-navy-200 px-8 py-3 flex items-center justify-between no-print sticky top-0 z-10">
      <div className="font-semibold text-navy-900 text-lg">
        {title}
      </div>
      <div className="flex items-center gap-6">
        <div className="text-sm text-navy-500 font-medium">
          {formatDate(date)}
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
          <Activity size={12} />
          System Online
        </div>
        <button 
          onClick={handleRefresh} 
          className="p-1.5 text-navy-400 hover:text-navy-700 hover:bg-navy-50 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
        {user && (
          <div className="flex items-center gap-3 pl-4 border-l border-navy-100">
            <span className="text-sm font-medium text-navy-700">{user.name}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800"
              title="Sign out"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

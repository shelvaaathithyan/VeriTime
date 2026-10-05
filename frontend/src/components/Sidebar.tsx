import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CreditCard,
  ChevronRight,
  Shield,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/teacher', label: 'Teacher Review', icon: GraduationCap },
  { path: '/students', label: 'Student Directory', icon: Users },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-navy-900 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-navy-600 rounded flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-white" size={18} />
          </div>
          <div>
            <div className="font-display font-bold text-white text-lg leading-tight">VeriTime</div>
            <div className="text-navy-300 text-xs">Late Arrival Verification</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-100 group ${
                isActive
                  ? 'bg-navy-600 text-white'
                  : 'text-navy-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={14} className="text-navy-300" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer note */}
      <div className="px-4 py-4 border-t border-white/10 mt-auto">
        <Link to="/nfc-credentials" className="flex items-center gap-2 text-navy-400 hover:text-navy-300 text-xs transition-colors">
          <CreditCard size={13} className="flex-shrink-0" />
          <span>Administration</span>
        </Link>
      </div>
    </aside>
  );
}

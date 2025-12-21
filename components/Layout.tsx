
import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { APP_NAME } from '../constants';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  Users,
  Settings,
  LogOut,
  PlusCircle,
  Menu,
  Sun,
  Moon,
  Bell,
  Folder,
  TrendingUp
} from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, theme, toggleTheme, unreadNotifications, refreshNotifications } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 5000); // Poll for notifications
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return <>{children}</>;

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) => (
    <Link
      to={to}
      className={`flex items-center justify-between px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 mb-1 group relative overflow-hidden ${isActive(to)
        ? 'text-white bg-brand-600 shadow-lg shadow-brand-500/20'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1e293b] hover:text-brand-600 dark:hover:text-white'
        }`}
      onClick={() => setMobileMenuOpen(false)}
    >
      <div className="flex items-center">
        <Icon className={`w-5 h-5 mr-3 transition-transform group-hover:scale-110 ${isActive(to) ? 'text-white' : 'text-slate-400 group-hover:text-brand-600 dark:group-hover:text-slate-300'}`} />
        {label}
      </div>
      {badge && badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">{badge}</span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070708] flex font-sans selection:bg-brand-500 selection:text-white transition-colors duration-300">
      {/* Background decoration - visible only in dark mode */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 hidden dark:block">
        <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-brand-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[800px] h-[800px] bg-slate-800/5 rounded-full blur-[120px]"></div>

        {/* Subtle texture overlay for premium feel */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full z-40 bg-white/90 dark:bg-[#0a0a0c]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-900 dark:text-white tracking-tight">{APP_NAME}</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link to="/notifications" className="relative p-1">
            <Bell className="w-6 h-6 text-slate-500 dark:text-slate-400" />
            {unreadNotifications > 0 && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#0a0a0c]"></span>
            )}
          </Link>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-500 dark:text-slate-400">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`w-72 bg-white/80 dark:bg-[#0a0a0c]/80 backdrop-blur-2xl border-r border-slate-200 dark:border-white/5 fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:flex flex-col`}>
        <div className="p-8 flex flex-col items-center text-center">
          <img src="/assets/logo.png" alt="Logo" className="h-28 w-auto mb-4 object-contain contrast-125 brightness-110 drop-shadow-[0_0_15px_rgba(225,29,72,0.1)]" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter leading-tight">{APP_NAME}</h1>
          <p className="text-[10px] text-brand-600 dark:text-brand-500 font-black tracking-[0.3em] uppercase mt-1">Unified Security Hub</p>
        </div>

        <nav className="flex-1 px-6 py-4 overflow-y-auto space-y-8">
          <div>
            <p className="px-4 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em] mb-4">
              Operational Access
            </p>
            <NavItem to="/dashboard" icon={Home} label="Dashboard" />

            <NavItem to="/notifications" icon={Bell} label="Notifications" badge={unreadNotifications} />

            {(user.role === UserRole.STUDENT) && (
              <>
                <NavItem to="/new-request" icon={PlusCircle} label="New Request" />
                <NavItem to="/my-requests" icon={FileText} label="My Requests" />
              </>
            )}

            {(user.role === UserRole.ADMIN || user.role === UserRole.STAFF) && (
              <NavItem to="/requests" icon={FileText} label="All Requests" />
            )}

            {user.role === UserRole.SUPER_ADMIN && (
              <>
                <NavItem to="/requests" icon={FileText} label="All Requests" />
                <NavItem to="/users" icon={Users} label="User Management" />
                <NavItem to="/documents" icon={Folder} label="Documents Portal" />
                <NavItem to="/predicted-grades" icon={TrendingUp} label="Predicted Grades" />
              </>
            )}
          </div>

          <div>
            <p className="px-4 text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em] mb-4">
              Personal Security
            </p>
            <NavItem to="/profile" icon={Settings} label="Manage Profile" />
          </div>
        </nav>

        <div className="p-6 border-t border-slate-200 dark:border-white/5 space-y-3">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="flex items-center w-full px-4 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-5 h-5 mr-3" />
                Surface Mode
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 mr-3" />
                Midnight Mode
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 rounded-xl hover:bg-red-500/5 hover:text-red-500 transition-all group"
          >
            <LogOut className="w-5 h-5 mr-3 text-slate-400 dark:text-slate-600 group-hover:text-red-500" />
            Logout Hub
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-72 p-6 md:p-10 overflow-y-auto h-screen scroll-smooth relative z-10">
        <div className="mt-14 md:mt-0">
          {/* Header - Desktop */}
          <div className="hidden md:flex justify-between items-end mb-10 animate-fade-in pl-2">
            <div>
              <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                {location.pathname === '/dashboard' ? 'Overview' :
                  location.pathname === '/new-request' ? 'Document Request' :
                    location.pathname === '/my-requests' ? 'My Records' :
                      location.pathname === '/requests' ? 'Institutional Records' :
                        location.pathname === '/users' ? 'System Users' :
                          location.pathname === '/notifications' ? 'System Alerts' :
                            location.pathname === '/profile' ? 'Security Profile' :
                              location.pathname === '/documents' ? 'Vault' :
                                location.pathname === '/predicted-grades' ? 'Analytics' : ''}
              </h2>
              <p className="text-slate-500 dark:text-slate-500 mt-1 font-bold text-xs uppercase tracking-widest">
                {location.pathname === '/dashboard' ? `Welcome, ${user.firstName}` :
                  'Secure document management and verification gateway.'}
              </p>
            </div>

            <div className="flex items-center space-x-4 bg-white dark:bg-white/5 px-3 py-2.5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 backdrop-blur-md">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-brand-700 to-brand-500 text-white flex items-center justify-center font-black shadow-lg shadow-brand-500/20 overflow-hidden text-lg">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span>{user.firstName[0]}{user.lastName[0]}</span>
                )}
              </div>
              <div className="pr-4">
                <p className="text-sm font-black text-slate-800 dark:text-slate-200 leading-none tracking-tight">{user.firstName} {user.lastName}</p>
                <p className="text-[10px] text-brand-600 dark:text-brand-500 font-bold capitalize mt-1.5 tracking-widest">{user.role.replace('_', ' ').toLowerCase()}</p>
              </div>
            </div>
          </div>

          <div className="animate-fade-in pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;

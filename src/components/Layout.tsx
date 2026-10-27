import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  Pill,
  LayoutDashboard,
  Scale,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Receipt,
  Shield,
  ShoppingCart,
  Activity,
  Trash2,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatWeekdayLong } from '@/lib/dates';
import toast from 'react-hot-toast';
import GlobalDrugSearch from '@/components/GlobalDrugSearch';
import ErrorBoundary from '@/components/ErrorBoundary';
import { motion } from 'framer-motion';

const baseNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/reconciliation', label: 'Manual Reconciliation', icon: Scale },
  { to: '/upload-file', label: 'Upload File', icon: FileText },
  { to: '/purchase-records', label: 'Purchase Records', icon: ShoppingCart },
  { to: '/dispensing-records', label: 'Dispensing Records', icon: Activity },
  { to: '/destruction-records', label: 'Destruction Records', icon: Trash2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminNavItems = [
  { to: '/admin', label: 'Admin Panel', icon: Shield },
];

export default function Layout() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Only show search bar on reconciliation page
  const showSearch = location.pathname === '/reconciliation';

  const navItems = profile?.role === 'admin' ? [...baseNavItems, ...adminNavItems] : baseNavItems;

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/login', { replace: true });
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const initials = (user?.email ?? 'U')
    .split('@')[0]
    .split(/[.\-_]/)
    .map((s) => s.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-ink-900/60 backdrop-blur-md transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 shadow-glow">
            <Pill className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg text-neutral-900">Narcotics Ledger</span>
          <button
            className="ml-auto rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-700 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/[0.06] text-neutral-900 before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-primary-500'
                      : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-800'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                        isActive ? 'text-primary-500' : 'text-neutral-400'
                      }`}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/[0.15] text-sm font-semibold text-primary-500">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-800">{user?.email}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                {profile?.role === 'admin' ? 'Administrator' : 'Pharmacist'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/5 bg-ink-950/70 px-4 backdrop-blur-md lg:px-8">
          <button
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden sm:flex sm:items-center sm:gap-3">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
                Live
              </span>
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-neutral-400 md:inline">
              ·
            </span>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-neutral-800">
                Welcome back, {profile?.pharmacy_name || 'Pharmacist'}
              </p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                {formatWeekdayLong()}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 xl:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
                All systems operational
              </span>
            </div>

            {showSearch && <GlobalDrugSearch />}

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/[0.15] text-sm font-semibold text-primary-500">
                  {initials}
                </div>
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 animate-slide-up rounded-lg border border-white/10 bg-surface shadow-elevated">
                    <div className="border-b border-white/5 px-4 py-3">
                      <p className="truncate text-sm font-medium text-neutral-800">{user?.email}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                        Signed in
                      </p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-800"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5 px-4 py-4 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
              © {new Date().getFullYear()} PharmaFlow · Encrypted · Role-based access · Every action
              logged
            </p>
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-5">
              <p className="text-[10px] text-neutral-400">
                123 Pharmacy Ave, Toronto, ON M5H 2N2, Canada
              </p>
              <Link
                to="/terms"
                className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 transition-colors hover:text-neutral-700"
              >
                Terms &amp; Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

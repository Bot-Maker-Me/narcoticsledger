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
  Package,
  ClipboardList,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import GlobalDrugSearch from '@/components/GlobalDrugSearch';
import ErrorBoundary from '@/components/ErrorBoundary';
import { motion } from 'framer-motion';

const baseNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/prescriptions', label: 'Prescriptions', icon: ClipboardList },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/reconciliation', label: 'Reconciliation', icon: Scale },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
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
  const [alertsOpen, setAlertsOpen] = useState(false);

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
    <div className="flex min-h-screen bg-neutral-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-neutral-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-neutral-100 bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-neutral-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
            <Pill className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-neutral-900">Narcotics Ledger</span>
          <button
            className="ml-auto rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-neutral-100 p-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-800">{user?.email}</p>
              <p className="text-xs text-neutral-400">{profile?.role === 'admin' ? 'Administrator' : 'Pharmacist'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-neutral-100 bg-white/80 px-4 backdrop-blur-md lg:px-8">
          <button
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden sm:block">
            <p className="text-sm font-medium text-neutral-800">
              Welcome back, {profile?.pharmacy_name || 'Pharmacist'} 👋
            </p>
            <p className="text-xs text-neutral-400">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {showSearch && <GlobalDrugSearch />}

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
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
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 animate-slide-up rounded-lg border border-neutral-100 bg-white shadow-elevated">
                    <div className="border-b border-neutral-100 px-4 py-3">
                      <p className="truncate text-sm font-medium text-neutral-800">{user?.email}</p>
                      <p className="text-xs text-neutral-400">Signed in</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
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
        <footer className="border-t border-neutral-100 bg-white px-4 py-4 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <p>© {new Date().getFullYear()} PharmaFlow. All rights reserved.</p>
              <span className="hidden sm:inline">•</span>
              <p>123 Pharmacy Ave, Toronto, ON M5H 2N2, Canada</p>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/terms" className="hover:text-neutral-700 transition-colors">
                Terms & Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

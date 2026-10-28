import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import Layout from '@/components/Layout';
import ErrorFallback from '@/components/ErrorFallback';
import SubscriptionPaywall from '@/components/SubscriptionPaywall';
import CookieConsent from '@/components/CookieConsent';
import { MotionProvider } from '@/lib/motion';
import { hasAccess } from '@/lib/access';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import ResetPassword from '@/pages/ResetPassword';
import AuthCallback from '@/pages/AuthCallback';

// Every signed-in page except the dashboard is split into its own chunk, so the first
// load only downloads what the landing/login/dashboard screens need. Reports additionally
// pulls in the chart library, and Reconciliation/Upload the spreadsheet parser.
const Inventory = lazy(() => import('@/pages/Inventory'));
const Prescriptions = lazy(() => import('@/pages/Prescriptions'));
const Reconciliation = lazy(() => import('@/pages/Reconciliation'));
const TransactionHistory = lazy(() => import('@/pages/TransactionHistory'));
const Admin = lazy(() => import('@/pages/Admin'));
const Terms = lazy(() => import('@/pages/Terms'));
const PurchaseRecords = lazy(() => import('@/pages/PurchaseRecords'));
const DispensingRecords = lazy(() => import('@/pages/DispensingRecords'));
const DestructionRecords = lazy(() => import('@/pages/DestructionRecords'));
const UploadFile = lazy(() => import('@/pages/UploadFile'));
const Settings = lazy(() => import('@/pages/Settings'));
const Reports = lazy(() => import('@/pages/Reports'));

/** Wraps a lazy page so only the content area shows a spinner while its chunk loads. */
function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
    </div>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />
      {/* Recovery links sign the user in, so this must NOT sit behind PublicRoute. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      {/* Legal pages are public: the signup form links to the terms. */}
      <Route
        path="/terms"
        element={
          <div className="min-h-screen px-4 py-8">
            <Lazy>
              <Terms />
            </Lazy>
          </div>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Lazy><Inventory /></Lazy>} />
        <Route path="/transactions" element={<Lazy><TransactionHistory /></Lazy>} />
        <Route path="/prescriptions" element={<Lazy><Prescriptions /></Lazy>} />
        <Route path="/reconciliation" element={<Lazy><Reconciliation /></Lazy>} />
        <Route
          path="/reports"
          element={
            <Lazy>
              <Reports />
            </Lazy>
          }
        />
        <Route path="/upload-file" element={<Lazy><UploadFile /></Lazy>} />
        <Route path="/purchase-records" element={<Lazy><PurchaseRecords /></Lazy>} />
        <Route path="/dispensing-records" element={<Lazy><DispensingRecords /></Lazy>} />
        <Route path="/destruction-records" element={<Lazy><DestructionRecords /></Lazy>} />
        <Route path="/settings" element={<Lazy><Settings /></Lazy>} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Lazy>
                <Admin />
              </Lazy>
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppWithPaywall() {
  const { profile, loading } = useAuth();

  return (
    <>
      <AppRoutes />
      {!loading && !hasAccess(profile) && <SubscriptionPaywall />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <MotionProvider>
      <AuthProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AppWithPaywall />
          </BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '10px',
                background: '#121A2B',
                color: '#E3E7EF',
                boxShadow: '0 24px 60px -20px rgba(0, 0, 0, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#7BA88B', secondary: '#121A2B' } },
              error: { iconTheme: { primary: '#E85A5A', secondary: '#121A2B' } },
            }}
          />
          <CookieConsent />
        </ConfirmProvider>
      </AuthProvider>
      </MotionProvider>
    </ErrorBoundary>
  );
}

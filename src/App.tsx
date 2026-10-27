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
import { hasAccess } from '@/lib/access';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import Prescriptions from '@/pages/Prescriptions';
import Reconciliation from '@/pages/Reconciliation';
import Settings from '@/pages/Settings';
import TransactionHistory from '@/pages/TransactionHistory';
import Admin from '@/pages/Admin';
import Terms from '@/pages/Terms';
import PurchaseRecords from '@/pages/PurchaseRecords';
import DispensingRecords from '@/pages/DispensingRecords';
import DestructionRecords from '@/pages/DestructionRecords';
import UploadFile from '@/pages/UploadFile';

// Reports pulls in the chart library, which is heavy and only needed on that route.
const Reports = lazy(() => import('@/pages/Reports'));

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
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/transactions" element={<TransactionHistory />} />
        <Route path="/prescriptions" element={<Prescriptions />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route
          path="/reports"
          element={
            <Suspense fallback={<FullPageSpinner />}>
              <Reports />
            </Suspense>
          }
        />
        <Route path="/upload-file" element={<UploadFile />} />
        <Route path="/purchase-records" element={<PurchaseRecords />} />
        <Route path="/dispensing-records" element={<DispensingRecords />} />
        <Route path="/destruction-records" element={<DestructionRecords />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
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
    </ErrorBoundary>
  );
}

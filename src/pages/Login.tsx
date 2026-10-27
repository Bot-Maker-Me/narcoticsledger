import { Link } from 'react-router-dom';
import { Pill, Mail, Lock, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import SectionMarker from '@/components/SectionMarker';
import { getErrorMessage } from '@/lib/errors';

export default function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const handleForgotPassword = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors((previous) => ({ ...previous, email: 'Enter your email address first' }));
      return;
    }

    setSendingReset(true);
    try {
      await resetPassword(email);
      toast.success(`Password reset link sent to ${email}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send the reset link'));
    } finally {
      setSendingReset(false);
    }
  };

  const validate = () => {
    const next: { email?: string; password?: string } = {};
    if (!email) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Password is required';
    else if (password.length < 6) next.password = 'Password must be at least 6 characters';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col px-4">
      {/* Status pill */}
      <div className="flex justify-end pt-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">
            All systems operational
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-glow">
              <Pill className="h-7 w-7 text-white" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary-500">
              Narcotics Ledger
            </p>
            <SectionMarker index="01" label="Sign In" className="mt-5 justify-center" />
            <h1 className="mt-5 font-display text-4xl text-neutral-900">Welcome back</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Sign in to your Narcotics Ledger account
            </p>
          </div>

          <div className="card mt-8 p-8">
            <SectionMarker index="02" label="Credentials" />

            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="field-label">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@pharmacy.com"
                    className="input-field pl-10"
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-error-600">{errors.email}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="field-label">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={sendingReset}
                    className="mb-1.5 text-xs font-medium text-primary-500 transition-colors hover:text-primary-700 disabled:opacity-50"
                  >
                    {sendingReset ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field pl-10"
                    autoComplete="current-password"
                  />
                </div>
                {errors.password && <p className="mt-1 text-xs text-error-600">{errors.password}</p>}
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-500">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-primary-500 hover:text-primary-700">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="pb-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
          © 2026 · Encrypted · Role-based access · Every action logged
        </p>
      </div>
    </div>
  );
}

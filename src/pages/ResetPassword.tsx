import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Lock, Mail, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/lib/errors';
import SectionMarker from '@/components/SectionMarker';

/**
 * Where the emailed password-recovery link lands.
 *
 * The link signs the user in (supabase-js exchanges the token on load), so this route
 * deliberately sits outside `PublicRoute` — that wrapper would bounce a newly recovered
 * session straight to the dashboard before a new password could be set.
 */
export default function ResetPassword() {
  const { user, loading, updatePassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  useEffect(() => {
    if (!loading && user?.email) setResendEmail(user.email);
  }, [loading, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next: { password?: string; confirmPassword?: string } = {};
    if (!password) next.password = 'Password is required';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (!confirmPassword) next.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
      toast.success('Password updated');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update your password'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail) {
      toast.error('Enter the email address you signed up with');
      return;
    }
    try {
      await resetPassword(resendEmail);
      toast.success('If that address has an account, a new link is on its way');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send a new link'));
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col px-4">
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-glow">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <SectionMarker index="01" label="Account recovery" className="justify-center" />
            <h1 className="mt-5 font-display text-4xl text-neutral-900">Set a new password</h1>
          </div>

          <div className="card mt-8 p-8">
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary-500" />
                <p className="mt-3 text-sm text-neutral-500">Checking your recovery link...</p>
              </div>
            ) : done ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success-500" />
                <p className="mt-3 text-sm text-neutral-600">
                  Your password has been updated. Taking you to your dashboard...
                </p>
              </div>
            ) : !user ? (
              <div className="space-y-4 py-4 text-center">
                <p className="text-sm text-neutral-600">
                  This recovery link is invalid or has expired. Enter your email and we will send a
                  new one.
                </p>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(event) => setResendEmail(event.target.value)}
                    placeholder="you@pharmacy.com"
                    className="input-field pl-10"
                    autoComplete="email"
                  />
                </div>
                <button onClick={handleResend} className="btn-primary w-full">
                  Send a new reset link
                </button>
                <Link
                  to="/login"
                  className="block text-sm font-medium text-primary-500 hover:text-primary-700"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="password" className="field-label">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      className="input-field pl-10"
                      autoComplete="new-password"
                    />
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-error-600">{errors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="field-label">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter your password"
                      className="input-field pl-10"
                      autoComplete="new-password"
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-error-600">{errors.confirmPassword}</p>
                  )}
                </div>

                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? 'Updating...' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

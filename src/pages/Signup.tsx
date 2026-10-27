import { Link } from 'react-router-dom';
import { Pill, Mail, Lock, Loader2, CheckCircle2, Building2, Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SectionMarker from '@/components/SectionMarker';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    pharmacyName?: string;
    ageConfirmed?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');

  const validate = () => {
    const next: { email?: string; password?: string; confirmPassword?: string; pharmacyName?: string; ageConfirmed?: string } = {};
    if (!email) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Password is required';
    else if (password.length < 6) next.password = 'Password must be at least 6 characters';
    if (!confirmPassword) next.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    if (!pharmacyName) next.pharmacyName = 'Pharmacy name is required';
    else if (pharmacyName.length < 2) next.pharmacyName = 'Pharmacy name must be at least 2 characters';
    if (!ageConfirmed) next.ageConfirmed = 'You must confirm you are at least 13 years old';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signUp(email, password, pharmacyName);
      toast.success('Account created! Starting your free trial...');
      setStep('success');
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign up';
      toast.error(message);
      setSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="relative flex min-h-screen flex-col px-4">
        <div className="flex flex-1 items-center justify-center py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <div className="card p-8 text-center">
              <SectionMarker index="03" label="Confirmed" className="justify-center" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mx-auto mb-6 mt-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-500/15"
              >
                <CheckCircle2 className="h-10 w-10 text-success-600" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-display text-3xl text-neutral-900"
              >
                Account Created!
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-2 text-sm text-neutral-500"
              >
                Your 14-day free trial has started. Redirecting to dashboard...
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-6"
              >
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary-500" />
              </motion.div>
            </div>
          </motion.div>
        </div>

        <div className="pb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
            © 2026 · Encrypted · Role-based access · Every action logged
          </p>
        </div>
      </div>
    );
  }

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-glow">
              <Pill className="h-7 w-7 text-white" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary-500">
              Narcotics Ledger
            </p>
            <SectionMarker index="01" label="Get Started" className="mt-5 justify-center" />
            <h1 className="mt-5 font-display text-4xl text-neutral-900">Create your account</h1>
            <p className="mt-2 text-sm text-neutral-500">Start your 14-day free trial</p>
          </div>

          <div className="card mt-8 p-8">
            <SectionMarker index="02" label="Details" />

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
                <label htmlFor="pharmacyName" className="field-label">
                  Pharmacy name
                </label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    id="pharmacyName"
                    type="text"
                    value={pharmacyName}
                    onChange={(e) => setPharmacyName(e.target.value)}
                    placeholder="e.g., Main Street Pharmacy"
                    className="input-field pl-10"
                    autoComplete="organization"
                  />
                </div>
                {errors.pharmacyName && <p className="mt-1 text-xs text-error-600">{errors.pharmacyName}</p>}
              </div>

              <div>
                <label htmlFor="password" className="field-label">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="input-field pl-10"
                    autoComplete="new-password"
                  />
                </div>
                {errors.password && <p className="mt-1 text-xs text-error-600">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="field-label">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="input-field pl-10"
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-error-600">{errors.confirmPassword}</p>
                )}
              </div>

              <div className="flex items-start gap-3">
                <div className="relative flex items-center">
                  <input
                    id="ageConfirmed"
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-white/20 bg-white/5 checked:border-primary-500 checked:bg-primary-600 focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-0"
                  />
                  <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
                </div>
                <label htmlFor="ageConfirmed" className="cursor-pointer text-sm text-neutral-500">
                  I confirm that I am at least 13 years old and agree to the{' '}
                  <Link to="/terms" className="text-primary-500 underline hover:text-primary-700">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/terms" className="text-primary-500 underline hover:text-primary-700">
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {errors.ageConfirmed && (
                <p className="mt-1 text-xs text-error-600">{errors.ageConfirmed}</p>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Creating account...' : 'Start Free Trial'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-500">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary-500 hover:text-primary-700">
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>
      </div>

      <div className="pb-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
          © 2026 · Encrypted · Role-based access · Every action logged
        </p>
      </div>
    </div>
  );
}

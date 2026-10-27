import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { User, Mail, Shield, LogOut, CreditCard, Loader2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';
import { useCreateBillingPortalSession, useCreateCheckoutSession } from '@/hooks/useAdmin';
import { getErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/dates';
import { hasAccess } from '@/lib/access';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Payment overdue',
  cancelled: 'Cancelled',
  revoked: 'Revoked',
  none: 'No subscription',
};

export default function Settings() {
  const { user, profile, signOut, resetPassword, updatePharmacyName } = useAuth();
  const checkoutMutation = useCreateCheckoutSession();
  const portalMutation = useCreateBillingPortalSession();

  const [pharmacyName, setPharmacyName] = useState(profile?.pharmacy_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    setPharmacyName(profile?.pharmacy_name ?? '');
  }, [profile?.pharmacy_name]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to sign out'));
    }
  };

  const handleSaveProfile = async () => {
    const trimmed = pharmacyName.trim();
    if (trimmed.length < 2) {
      toast.error('Pharmacy name must be at least 2 characters');
      return;
    }

    setSavingProfile(true);
    try {
      await updatePharmacyName(trimmed);
      toast.success('Pharmacy name updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save your profile'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast.error('No email address on this account');
      return;
    }

    setSendingReset(true);
    try {
      await resetPassword(user.email);
      toast.success(`Password reset link sent to ${user.email}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send the reset link'));
    } finally {
      setSendingReset(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { url } = await portalMutation.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to open the billing portal'));
    }
  };

  const handleSubscribe = async () => {
    try {
      const { url } = await checkoutMutation.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to start checkout'));
    }
  };

  const subscriptionStatus = profile?.subscription_status ?? 'none';
  const canManageBilling = Boolean(profile?.stripe_customer_id);
  const hasActiveAccess = hasAccess(profile);

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Settings" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage your account and preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className="input-field cursor-not-allowed border-white/10 bg-white/5 pl-10 text-neutral-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pharmacyName" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Pharmacy name
              </label>
              <input
                id="pharmacyName"
                type="text"
                value={pharmacyName}
                onChange={(event) => setPharmacyName(event.target.value)}
                placeholder="e.g., Main Street Pharmacy"
                className="input-field"
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleSaveProfile}
              disabled={savingProfile || pharmacyName.trim() === (profile?.pharmacy_name ?? '')}
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {savingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Subscription</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Status</span>
              <span className="text-sm font-medium text-neutral-800">
                {STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus}
              </span>
            </div>
            {profile?.trial_ends_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">Trial ends</span>
                <span className="text-sm font-medium text-neutral-800">
                  {formatDate(profile.trial_ends_at)}
                </span>
              </div>
            )}
            {canManageBilling ? (
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleManageSubscription}
                  disabled={portalMutation.isPending}
                  className="btn-secondary"
                >
                  {portalMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  {portalMutation.isPending ? 'Opening...' : 'Manage or cancel subscription'}
                </button>
                <p className="text-xs text-neutral-500">
                  Cancel any time with no penalty, update your card, or download invoices from the
                  Stripe billing portal.
                </p>
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleSubscribe}
                  disabled={checkoutMutation.isPending}
                  className="btn-primary"
                >
                  {checkoutMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {checkoutMutation.isPending ? 'Redirecting...' : 'Subscribe'}
                </button>
                <p className="text-xs text-neutral-500">
                  {hasActiveAccess
                    ? 'Subscribe to keep access when your trial ends. Billed monthly in Canadian dollars, cancel any time.'
                    : 'Billed monthly in Canadian dollars, cancel any time.'}
                </p>
                {profile?.stripe_customer_id && (
                  <p className="text-xs text-neutral-500">
                    Manage your subscription from the billing portal once a subscription is active.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Security */}
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Security</h2>
          </div>
          <div className="mt-4 space-y-2">
            <button
              className="btn-secondary"
              onClick={handleChangePassword}
              disabled={sendingReset}
            >
              {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sendingReset ? 'Sending...' : 'Change password'}
            </button>
            <p className="text-xs text-neutral-500">
              We email you a secure link that opens the password reset screen.
            </p>
          </div>
        </div>

        {/* Sign out */}
        <div className="card border-error-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Sign out</h2>
              <p className="mt-1 text-sm text-neutral-500">Sign out of your account on this device</p>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-lg bg-error-50 px-4 py-2.5 text-sm font-medium text-error-600 transition-colors hover:bg-error-100"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

import { Loader2, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSystemSettings, useCreateCheckoutSession } from '@/hooks/useAdmin';
import { hasAccess } from '@/lib/access';
import { formatPrice } from '@/lib/format';
import { formatDate } from '@/lib/dates';
import { getErrorMessage } from '@/lib/errors';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function SubscriptionPaywall() {
  const { profile } = useAuth();
  const { data: settings } = useSystemSettings();
  const checkoutMutation = useCreateCheckoutSession();

  // Admins should bypass the paywall
  if (!profile || profile.role === 'admin' || hasAccess(profile)) return null;

  const isExpired = profile.subscription_status === 'trialing' && !hasAccess(profile);
  const isRevoked = profile.subscription_status === 'revoked';
  const isCancelled = profile.subscription_status === 'cancelled';
  const isPastDue = profile.subscription_status === 'past_due';

  const title = isRevoked
    ? 'Access Revoked'
    : isCancelled
      ? 'Subscription Cancelled'
      : isPastDue
        ? 'Payment Overdue'
        : isExpired
          ? 'Trial Expired'
          : 'Upgrade Required';

  const message = isRevoked
    ? 'Your access has been revoked by an administrator. Please contact support.'
    : isCancelled
      ? 'Your subscription has been cancelled. Resubscribe to regain access.'
      : isPastDue
        ? 'Your last payment failed. Please update your payment method.'
        : isExpired
          ? 'Your free trial has ended. Subscribe to continue using Narcotics Ledger.'
          : 'Subscribe to continue using Narcotics Ledger.';

  const price = settings ? formatPrice(settings.subscription_price_cents) : '$29.00';

  const handleSubscribe = async () => {
    try {
      // The amount is decided by the server from system_settings; the browser never sends it.
      const { url } = await checkoutMutation.mutateAsync();
      window.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to start checkout'));
    }
  };

  const canSubscribe = !isRevoked;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-md animate-fade-in" />
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="card overflow-hidden">
          <div className="relative overflow-hidden border-b border-white/5 px-6 py-8 text-center">
            <div className="pointer-events-none absolute inset-x-0 -top-16 mx-auto h-32 w-2/3 rounded-full bg-primary-500/15 blur-3xl" />
            <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 shadow-glow">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h2 className="relative font-display text-2xl text-neutral-900">{title}</h2>
            <p className="mt-2 text-sm text-neutral-500">{message}</p>
            <p className="mt-2 text-xs text-neutral-400">Prices in Canadian dollars (CAD).</p>
          </div>

          <div className="p-6">
            {canSubscribe && (
              <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary-600" />
                    <span className="text-sm font-semibold text-neutral-800">Narcotics Ledger Pro</span>
                  </div>
                  <div className="text-right">
                    <span className="font-display text-3xl text-neutral-900">{price}</span>
                    <span className="text-sm text-neutral-400">/mo</span>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-neutral-600">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Unlimited inventory management
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Prescription tracking & dispensing
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Reconciliation cycles with file import
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Transaction history & audit logs
                  </li>
                </ul>
                <div className="mt-4 rounded-lg bg-neutral-100 p-3">
                  <p className="text-xs font-medium text-neutral-700">Subscription Terms:</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    • Monthly subscription at {price}/month<br/>
                    • Auto-renews each month until cancelled<br/>
                    • Cancel anytime from Settings with no penalty<br/>
                    • Billing continues until cancellation is processed<br/>
                    • Canadian taxes (GST/HST) may apply where required
                  </p>
                  <Link to="/terms" className="mt-2 block text-xs text-primary-600 hover:text-primary-700 underline">
                    View full terms and auto-renewal policy
                  </Link>
                </div>
              </div>
            )}

            {canSubscribe && (
              <button
                onClick={handleSubscribe}
                disabled={checkoutMutation.isPending || !settings}
                className="btn-primary mt-4 w-full"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {checkoutMutation.isPending ? 'Redirecting...' : `Subscribe for ${price}/mo`}
              </button>
            )}

            {isRevoked && (
              <p className="mt-4 text-center text-sm text-neutral-400">
                Contact your administrator to restore access.
              </p>
            )}

            {isExpired && profile.trial_ends_at && (
              <p className="mt-3 text-center text-xs text-neutral-400">
                Your trial ended on {formatDate(profile.trial_ends_at)}
              </p>
            )}

            <p className="mt-4 text-center text-xs text-neutral-400">
              Canadian support available during business hours. Contact us through Settings for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

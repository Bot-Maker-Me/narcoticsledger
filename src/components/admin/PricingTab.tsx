import { useState } from 'react';
import { DollarSign, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSystemSettings, useUpdatePricing } from '@/hooks/useAdmin';
import { formatPrice } from '@/types/admin';

export function PricingTab() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateMutation = useUpdatePricing();
  const [priceDollars, setPriceDollars] = useState('');
  const [trialDays, setTrialDays] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (isLoading && !initialized) {
    return (
      <div className="card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">Loading settings...</p>
      </div>
    );
  }

  if (settings && !initialized) {
    setPriceDollars((settings.subscription_price_cents / 100).toFixed(2));
    setTrialDays(String(settings.trial_days));
    setInitialized(true);
  }

  const handleSave = async () => {
    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    const days = parseInt(trialDays);

    if (isNaN(priceCents) || priceCents < 0) {
      toast.error('Please enter a valid price');
      return;
    }
    if (isNaN(days) || days < 0) {
      toast.error('Please enter valid trial days');
      return;
    }

    try {
      await updateMutation.mutateAsync({ priceCents, trialDays: days });
      toast.success('Pricing updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update pricing';
      toast.error(message);
    }
  };

  return (
    <div className="max-w-lg">
      <div className="card p-6">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Subscription Pricing</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Changes apply instantly to all new subscriptions and trials.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Monthly Subscription Price (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="input-field pl-7"
                placeholder="29.00"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Current: {settings ? formatPrice(settings.subscription_price_cents) : '—'}/mo
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Trial Duration (days)
            </label>
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="input-field"
              placeholder="14"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Current: {settings?.trial_days ?? '—'} days
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="btn-primary"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

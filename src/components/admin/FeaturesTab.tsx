import { useState } from 'react';
import { BarChart3, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSystemSettings } from '@/hooks/useAdmin';
import { formatPrice } from '@/lib/format';

export function FeaturesTab() {
  const { data: settings, isLoading } = useSystemSettings();
  const [features, setFeatures] = useState({
    excelExport: true,
    reports: true,
    advancedAnalytics: true,
    apiAccess: false,
  });

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">Loading feature settings...</p>
      </div>
    );
  }

  const handleToggleFeature = (feature: keyof typeof features) => {
    setFeatures(prev => ({ ...prev, [feature]: !prev[feature] }));
    toast.success(`${feature.replace(/([A-Z])/g, ' $1').trim()} ${!features[feature] ? 'enabled' : 'disabled'}`);
  };

  const featureItems = [
    { key: 'excelExport' as const, label: 'Excel Export', description: 'Allow users to export data to Excel format' },
    { key: 'reports' as const, label: 'Standard Reports', description: 'Enable generation of compliance reports' },
    { key: 'advancedAnalytics' as const, label: 'Advanced Analytics', description: 'Enable detailed charts and analytics' },
    { key: 'apiAccess' as const, label: 'API Access', description: 'Allow programmatic access via API' },
  ];

  return (
    <div className="max-w-2xl">
      <div className="card p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-neutral-900">Feature Toggles</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Control which features are available to users</p>

        <div className="mt-6 space-y-4">
          {featureItems.map((item) => (
            <div key={item.key} className="flex items-start justify-between rounded-lg border border-neutral-200 p-4">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-neutral-800">{item.label}</h3>
                <p className="mt-1 text-xs text-neutral-500">{item.description}</p>
              </div>
              <button
                onClick={() => handleToggleFeature(item.key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  features[item.key] ? 'bg-primary-600' : 'bg-neutral-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                  features[item.key] ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-800">Current Plan</p>
              <p className="text-xs text-neutral-500">{settings ? formatPrice(settings.subscription_price_cents) : '—'}/month</p>
            </div>
            <button onClick={() => toast.success('Feature settings saved')} className="btn-primary">
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

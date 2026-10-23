import { useState, useMemo } from 'react';
import {
  Shield,
  Users,
  DollarSign,
  Activity,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Save,
  CalendarPlus,
  Ban,
  UserCheck,
  FileText,
  TrendingUp,
  Filter,
  Search,
  BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminUsers,
  useSystemSettings,
  useSystemHealth,
  useAuditLogs,
  useExtendTrial,
  useActivateSubscription,
  useRevokeAccess,
  useUpdatePricing,
} from '@/hooks/useAdmin';
import type { AdminUser, SubscriptionStatus } from '@/types/admin';
import { formatPrice } from '@/types/admin';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

type Tab = 'users' | 'pricing' | 'health' | 'audit' | 'features';

const subStatusConfig: Record<SubscriptionStatus, { style: string; label: string }> = {
  trialing: { style: 'bg-warning-50 text-warning-700', label: 'Trialing' },
  active: { style: 'bg-success-50 text-success-700', label: 'Active' },
  past_due: { style: 'bg-error-50 text-error-700', label: 'Past Due' },
  cancelled: { style: 'bg-neutral-100 text-neutral-500', label: 'Cancelled' },
  revoked: { style: 'bg-error-50 text-error-700', label: 'Revoked' },
  none: { style: 'bg-neutral-100 text-neutral-500', label: 'None' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users');

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'pricing', label: 'Pricing Settings', icon: DollarSign },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'audit', label: 'Audit Log', icon: FileText },
    { id: 'features', label: 'Feature Toggles', icon: BarChart3 },
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-neutral-900">Admin Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Manage users, pricing, and system health</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-neutral-100 bg-white p-1 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                tab === t.id
                  ? 'bg-primary-600 text-white shadow-soft'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'pricing' && <PricingTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'features' && <FeaturesTab />}
    </div>
  );
}

// =================== USERS TAB ===================

function UsersTab() {
  const { data: users, isLoading, isError, refetch } = useAdminUsers();
  const extendTrialMutation = useExtendTrial();
  const activateMutation = useActivateSubscription();
  const revokeMutation = useRevokeAccess();
  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const [actionType, setActionType] = useState<'extend' | 'activate' | 'revoke' | null>(null);
  const [extendDays, setExtendDays] = useState('7');

  const handleAction = async () => {
    if (!actionTarget || !actionType) return;
    try {
      if (actionType === 'extend') {
        await extendTrialMutation.mutateAsync({
          userId: actionTarget.id,
          days: parseInt(extendDays) || 7,
        });
        toast.success(`Trial extended by ${extendDays} days`);
      } else if (actionType === 'activate') {
        await activateMutation.mutateAsync(actionTarget.id);
        toast.success('Subscription activated');
      } else if (actionType === 'revoke') {
        await revokeMutation.mutateAsync(actionTarget.id);
        toast.success('Access revoked');
      }
      setActionTarget(null);
      setActionType(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">Loading users...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-error-300" />
        <p className="mt-3 text-sm text-neutral-500">Failed to load users</p>
        <p className="mt-1 text-xs text-neutral-400">The users table may not exist in your database</p>
        <button onClick={() => refetch()} className="btn-secondary mt-3">
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Trial Ends</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Signup Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {(users ?? []).map((user) => {
                const config = subStatusConfig[user.subscription_status];
                return (
                  <tr key={user.id} className="transition-colors hover:bg-neutral-50/50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-neutral-800">{user.email ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        user.role === 'admin' ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${config.style}`}>
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">
                      {user.trial_ends_at ? formatDate(user.trial_ends_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setActionTarget(user);
                            setActionType('extend');
                            setExtendDays('7');
                          }}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-warning-50 hover:text-warning-600"
                          title="Extend trial"
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setActionTarget(user);
                            setActionType('activate');
                          }}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-success-50 hover:text-success-600"
                          title="Activate subscription"
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setActionTarget(user);
                            setActionType('revoke');
                          }}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                          title="Revoke access"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(users ?? []).length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-neutral-300" />
            <p className="mt-3 text-sm text-neutral-400">No users found</p>
          </div>
        )}
      </div>

      {/* Action confirmation modal */}
      {actionTarget && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => {
              setActionTarget(null);
              setActionType(null);
            }}
          />
          <div className="relative w-full max-w-sm animate-slide-up">
            <div className="card p-6 text-center">
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
                  actionType === 'extend'
                    ? 'bg-warning-50'
                    : actionType === 'activate'
                      ? 'bg-success-50'
                      : 'bg-error-50'
                }`}
              >
                {actionType === 'extend' ? (
                  <CalendarPlus className="h-6 w-6 text-warning-500" />
                ) : actionType === 'activate' ? (
                  <UserCheck className="h-6 w-6 text-success-500" />
                ) : (
                  <Ban className="h-6 w-6 text-error-500" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                {actionType === 'extend'
                  ? 'Extend Trial'
                  : actionType === 'activate'
                    ? 'Activate Subscription'
                    : 'Revoke Access'}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {actionType === 'extend'
                  ? `Extend trial for ${actionTarget.email ?? 'this user'}`
                  : actionType === 'activate'
                    ? `Activate subscription for ${actionTarget.email ?? 'this user'}`
                    : `Revoke access for ${actionTarget.email ?? 'this user'}`}
              </p>

              {actionType === 'extend' && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium text-neutral-600">Days to extend</label>
                  <input
                    type="number"
                    min={1}
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                    className="input-field text-center"
                  />
                </div>
              )}

              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setActionTarget(null);
                    setActionType(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={
                    extendTrialMutation.isPending ||
                    activateMutation.isPending ||
                    revokeMutation.isPending
                  }
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all active:scale-[0.98] disabled:opacity-50 ${
                    actionType === 'extend'
                      ? 'bg-warning-600 hover:bg-warning-700'
                      : actionType === 'activate'
                        ? 'bg-success-600 hover:bg-success-700'
                        : 'bg-error-600 hover:bg-error-700'
                  }`}
                >
                  {(extendTrialMutation.isPending ||
                    activateMutation.isPending ||
                    revokeMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =================== PRICING TAB ===================

function PricingTab() {
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

// =================== HEALTH TAB ===================

function HealthTab() {
  const { data: health, isLoading } = useSystemHealth();
  const { data: auditLogs } = useAuditLogs();

  const stats = [
    { label: 'Total Users', value: health?.total_users ?? 0, icon: Users, bg: 'bg-primary-50', text: 'text-primary-600' },
    { label: 'Active Subscriptions', value: health?.active_subscriptions ?? 0, icon: CheckCircle2, bg: 'bg-success-50', text: 'text-success-600' },
    { label: 'Trialing Users', value: health?.trialing_users ?? 0, icon: Clock, bg: 'bg-warning-50', text: 'text-warning-600' },
    { label: 'Active Cycles', value: health?.active_cycles ?? 0, icon: Activity, bg: 'bg-secondary-50', text: 'text-secondary-600' },
    { label: 'Webhook Errors', value: health?.recent_webhook_errors ?? 0, icon: AlertTriangle, bg: 'bg-error-50', text: 'text-error-600' },
  ];

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">Loading health data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                <Icon className={`h-5 w-5 ${stat.text}`} />
              </div>
              <p className="mt-3 text-2xl font-bold text-neutral-900">{stat.value}</p>
              <p className="text-xs text-neutral-500">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Audit log */}
      <div className="card overflow-hidden">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-800">Recent Admin Actions</h2>
        </div>
        <div className="divide-y divide-neutral-50">
          {(auditLogs ?? []).length === 0 ? (
            <div className="py-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-neutral-300" />
              <p className="mt-2 text-sm text-neutral-400">No admin actions logged yet</p>
            </div>
          ) : (
            (auditLogs ?? []).slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-800">
                    {log.action.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {log.performer_email ?? 'Unknown'} · {formatDate(log.created_at)}
                  </p>
                </div>
                {log.details && (
                  <code className="rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-500">
                    {JSON.stringify(log.details)}
                  </code>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// =================== AUDIT TAB ===================

function AuditTab() {
  const { data: auditLogs, isLoading } = useAuditLogs();
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');

  const filteredLogs = useMemo(() => {
    if (!auditLogs) return [];
    return auditLogs.filter(log => {
      const actionMatch = !filterAction || log.action.toLowerCase().includes(filterAction.toLowerCase());
      const userMatch = !filterUser || (log.performer_email?.toLowerCase().includes(filterUser.toLowerCase()) ?? false);
      return actionMatch && userMatch;
    });
  }, [auditLogs, filterAction, filterUser]);

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-400">Loading audit logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Filter by action..."
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Filter by user..."
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>
          <button onClick={() => { setFilterAction(''); setFilterUser(''); }} className="btn-secondary">
            Clear Filters
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">Audit Log</h2>
            <span className="text-xs text-neutral-500">{filteredLogs.length} entries</span>
          </div>
        </div>
        <div className="divide-y divide-neutral-50 max-h-96 overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-neutral-300" />
              <p className="mt-2 text-sm text-neutral-400">No audit logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  log.action.includes('extend') ? 'bg-warning-400' :
                  log.action.includes('activate') ? 'bg-success-400' :
                  log.action.includes('revoke') ? 'bg-error-400' :
                  'bg-primary-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800">
                    {log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {log.performer_email ?? 'Unknown'} · {formatDate(log.created_at)}
                  </p>
                  {log.target_user_id && (
                    <p className="text-xs text-neutral-500">Target: {log.target_user_id}</p>
                  )}
                </div>
                {log.details && (
                  <button onClick={() => toast.info(JSON.stringify(log.details, null, 2))} className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100" title="View details">
                    <FileText className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// =================== FEATURES TAB ===================

function FeaturesTab() {
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
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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

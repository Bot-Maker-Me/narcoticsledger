import { FileText, Scale, TrendingUp, AlertTriangle, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { usePrescriptions } from '@/hooks/usePrescriptions';
import { useReconciliationCycles } from '@/hooks/useReconciliation';
import { useAuth } from '@/context/AuthContext';
import { hasAccess } from '@/lib/access';
import { formatPrice } from '@/lib/format';
import { formatDayMonth, formatLongDate } from '@/lib/dates';
import { useSystemSettings } from '@/hooks/useAdmin';
import { useAllReconciliationItems } from '@/hooks/useReconciliation';
import { motion } from '@/lib/motion';
import SectionMarker from '@/components/SectionMarker';

export default function Dashboard() {
  const { data: prescriptions, isLoading: prescriptionsLoading } = usePrescriptions();
  const { data: cycles, isLoading: cyclesLoading } = useReconciliationCycles();
  const { data: allReconciliationItems } = useAllReconciliationItems();
  const { profile } = useAuth();
  const { data: settings } = useSystemSettings();

  const activePrescriptions = prescriptions?.filter((p) => p.status === 'active').length ?? 0;
  const activeCycles = cycles?.filter((c) => c.status === 'in_progress').length ?? 0;
  const completedCycles = cycles?.filter((c) => c.status === 'completed').length ?? 0;

  const recentActivity = useMemo(() => {
    if (prescriptionsLoading || cyclesLoading) return [];
    
    const activities: Array<{
      type: 'reconciliation' | 'prescription';
      message: string;
      time: Date;
      icon: typeof Scale;
    }> = [];
    
    // Add latest completed reconciliation cycle count
    const completedCycles = cycles?.filter(c => c.status === 'completed') ?? [];
    const pendingCycles = cycles?.filter(c => c.status === 'in_progress') ?? [];
    
    if (completedCycles.length > 0) {
      const latestCompleted = completedCycles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      activities.push({
        type: 'reconciliation',
        message: `${completedCycles.length} manual reconciliation cycle${completedCycles.length > 1 ? 's' : ''} completed`,
        time: new Date(latestCompleted.created_at),
        icon: Scale,
      });
    }
    
    if (pendingCycles.length > 0) {
      const latestPending = pendingCycles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      activities.push({
        type: 'reconciliation',
        message: `${pendingCycles.length} manual reconciliation cycle${pendingCycles.length > 1 ? 's' : ''} pending`,
        time: new Date(latestPending.created_at),
        icon: Scale,
      });
    }
    
    // Add recent prescriptions
    prescriptions?.slice(0, 3).forEach(rx => {
      activities.push({
        type: 'prescription',
        message: `Prescription for ${rx.patient_name}`,
        time: new Date(rx.created_at),
        icon: FileText,
      });
    });
    
    return activities.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5);
  }, [cycles, prescriptions, allReconciliationItems, prescriptionsLoading, cyclesLoading]);

  const stats = [
    {
      label: 'Manual Reconciliation Cycles',
      value: activeCycles,
      change: activeCycles > 0 ? 'In progress' : 'All completed',
      icon: Scale,
      iconBg: 'bg-warning-50',
      iconText: 'text-warning-600',
      changeText: activeCycles > 0 ? 'text-warning-600' : 'text-success-600',
    },
    {
      label: 'Completed Manual Reconciliation Cycle',
      value: completedCycles,
      change: completedCycles > 0 ? 'Total completed' : 'No cycles yet',
      icon: FileText,
      iconBg: 'bg-success-50',
      iconText: 'text-success-600',
      changeText: completedCycles > 0 ? 'text-success-600' : 'text-neutral-400',
    },
  ];

  if (prescriptionsLoading || cyclesLoading) {
    return <DashboardSkeleton />;
  }

  const trialActive = profile?.subscription_status === 'trialing' && hasAccess(profile);
  
  // Trial expiry banner (3 days before)
  const showTrialWarning = trialActive && profile?.trial_ends_at && 
    new Date(profile.trial_ends_at) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) &&
    new Date(profile.trial_ends_at) > new Date();

  const pastDue = profile?.subscription_status === 'past_due';

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Overview" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Overview of your pharmacy operations</p>
      </div>

      {/* Trial expiry banner */}
      {showTrialWarning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-warning-200 bg-warning-50 px-5 py-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-100">
            <AlertTriangle className="h-4 w-4 text-warning-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-800">
              Your trial ends soon
            </p>
            <p className="text-xs text-neutral-500">
              Trial ends on {formatLongDate(profile.trial_ends_at!)}
              {settings && ` · Upgrade to continue for ${formatPrice(settings.subscription_price_cents)}/mo`}
            </p>
          </div>
          <Link to="/settings" className="btn-primary text-xs">
            Upgrade Now
          </Link>
        </motion.div>
      )}

      {/* Past due banner */}
      {pastDue && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 px-5 py-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error-100">
            <AlertTriangle className="h-4 w-4 text-error-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-800">
              Payment failed
            </p>
            <p className="text-xs text-neutral-500">
              Your subscription payment failed. Please update your payment method to continue service.
            </p>
          </div>
          <Link to="/settings" className="btn-primary text-xs">
            Update Payment
          </Link>
        </motion.div>
      )}

      {/* Trial banner (normal) */}
      {trialActive && !showTrialWarning && profile?.trial_ends_at && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-warning-100 bg-warning-50/50 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-100">
            <TrendingUp className="h-4 w-4 text-warning-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-800">
              You're on a free trial
            </p>
            <p className="text-xs text-neutral-500">
              Trial ends on {formatLongDate(profile.trial_ends_at)}
              {settings && ` · ${formatPrice(settings.subscription_price_cents)}/mo after`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="card p-5 transition-all duration-200 hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.iconBg}`}>
                  <Icon className={`h-5 w-5 ${stat.iconText}`} />
                </div>
                <TrendingUp className="h-4 w-4 text-neutral-300" />
              </div>
              <p className="mt-4 font-display text-3xl text-neutral-900">{stat.value}</p>
              <p className="mt-0.5 text-sm text-neutral-500">{stat.label}</p>
              <p className={`mt-2 text-xs font-medium ${stat.changeText}`}>{stat.change}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity Feed */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <SectionMarker index="02" label="Recent Activity" />
            <button
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-700"
              title="Filter"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-1">
            {recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">No recent activity</p>
            ) : (
              recentActivity.map((activity, index) => {
                const Icon = activity.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-neutral-50"
                  >
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      activity.type === 'reconciliation' ? 'bg-success-400' :
                      'bg-primary-400'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-800">{activity.message}</p>
                      <p className="text-xs text-neutral-400">
                        {formatDayMonth(activity.time)} ·{' '}
                        {activity.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      activity.type === 'reconciliation' ? 'bg-success-50' :
                      'bg-primary-50'
                    }`}>
                      <Icon className={`h-4 w-4 ${
                        activity.type === 'reconciliation' ? 'text-success-600' :
                        'text-primary-600'
                      }`} />
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card p-6">
          <SectionMarker index="03" label="Quick Actions" />
          <div className="mt-4 space-y-2">
            <QuickActionLink to="/reconciliation" label="Manual Reconciliation" icon={Scale} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof FileText }) {
  return (
    <Link
      to={to}
      className="flex w-full items-center gap-3 rounded-lg border border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-700 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-neutral-200" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="card p-5">
            <div className="flex h-10 w-10 animate-pulse rounded-lg bg-neutral-200" />
            <div className="mt-4 h-8 w-16 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-4 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-neutral-200" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex h-6 w-40 animate-pulse rounded bg-neutral-200" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-16 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        </div>

        <div className="card p-6">
          <div className="h-6 w-32 animate-pulse rounded bg-neutral-200" />
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

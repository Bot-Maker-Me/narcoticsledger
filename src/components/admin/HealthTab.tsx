import { Users, CheckCircle2, Clock, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { useSystemHealth, useAuditLogs } from '@/hooks/useAdmin';
import { formatDate } from '@/lib/dates';
import { getErrorMessage } from '@/lib/errors';

export function HealthTab() {
  const { data: health, isLoading, isError, error, refetch } = useSystemHealth();
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

  if (isError) {
    return (
      <div className="card p-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-error-300" />
        <p className="mt-3 text-sm text-neutral-500">Failed to load system health</p>
        <p className="mt-1 text-xs text-neutral-400">{getErrorMessage(error)}</p>
        <button onClick={() => refetch()} className="btn-secondary mt-3">
          Try again
        </button>
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

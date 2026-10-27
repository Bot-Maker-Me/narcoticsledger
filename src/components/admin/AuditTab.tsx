import { useState, useMemo } from 'react';
import { Loader2, Search, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuditLogs } from '@/hooks/useAdmin';
import { formatDate } from '@/lib/dates';

export function AuditTab() {
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
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
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
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
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
                  <button onClick={() => toast(JSON.stringify(log.details, null, 2))} className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100" title="View details">
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

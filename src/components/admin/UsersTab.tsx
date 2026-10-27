import { useState } from 'react';
import {
  Users,
  Loader2,
  AlertTriangle,
  CalendarPlus,
  UserCheck,
  Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminUsers,
  useExtendTrial,
  useActivateSubscription,
  useRevokeAccess,
} from '@/hooks/useAdmin';
import type { AdminUser } from '@/types/admin';
import { subStatusConfig, formatDate } from '@/components/admin/shared';

export function UsersTab() {
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
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
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
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 ${
                    actionType === 'extend'
                      ? 'bg-warning-600 text-ink-950 hover:bg-warning-700'
                      : actionType === 'activate'
                        ? 'bg-success-500 text-ink-950 hover:bg-success-600'
                        : 'bg-error-500 text-white hover:bg-error-400'
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

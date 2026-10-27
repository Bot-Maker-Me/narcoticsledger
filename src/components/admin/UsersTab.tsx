import { useState } from 'react';
import {
  Users,
  Loader2,
  AlertTriangle,
  CalendarPlus,
  UserCheck,
  Ban,
  XCircle,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminUsers,
  useExtendTrial,
  useActivateSubscription,
  useCancelSubscription,
  useRevokeAccess,
  useSetUserRole,
} from '@/hooks/useAdmin';
import { useAuth } from '@/context/AuthContext';
import type { AdminUser, UserRole } from '@/types/admin';
import { subStatusConfig } from '@/components/admin/shared';
import { formatDate } from '@/lib/dates';
import { getErrorMessage } from '@/lib/errors';

type ActionType = 'extend' | 'activate' | 'cancel' | 'revoke' | 'promote' | 'demote';

interface ActionPresentation {
  title: string;
  icon: typeof Users;
  iconBg: string;
  iconColor: string;
  confirmClass: string;
  describe: (email: string) => string;
  /** Shown under the description, for anything the admin should know before confirming. */
  note?: string;
}

/** Presentation only — every action is enforced again by a SECURITY DEFINER RPC. */
const ACTIONS: Record<ActionType, ActionPresentation> = {
  extend: {
    title: 'Extend Trial',
    icon: CalendarPlus,
    iconBg: 'bg-warning-50',
    iconColor: 'text-warning-500',
    confirmClass: 'bg-warning-600 text-ink-950 hover:bg-warning-700',
    describe: (email) => `Push back the trial end date for ${email}.`,
  },
  activate: {
    title: 'Activate Subscription',
    icon: UserCheck,
    iconBg: 'bg-success-50',
    iconColor: 'text-success-500',
    confirmClass: 'bg-success-500 text-ink-950 hover:bg-success-600',
    describe: (email) => `Give ${email} full access as a subscriber.`,
  },
  cancel: {
    title: 'Cancel Subscription',
    icon: XCircle,
    iconBg: 'bg-neutral-100',
    iconColor: 'text-neutral-500',
    confirmClass: 'bg-neutral-200 text-ink-950 hover:bg-neutral-300',
    describe: (email) => `Mark the subscription for ${email} as cancelled.`,
    note:
      'This changes access in this app only. If they have an active Stripe subscription, cancel it in the Stripe dashboard (or have them cancel from Settings → Subscription) so billing stops.',
  },
  revoke: {
    title: 'Revoke Access',
    icon: Ban,
    iconBg: 'bg-error-50',
    iconColor: 'text-error-500',
    confirmClass: 'bg-error-500 text-white hover:bg-error-400',
    describe: (email) => `Cut off access for ${email} immediately. Their data is left untouched.`,
  },
  promote: {
    title: 'Make Admin',
    icon: ShieldCheck,
    iconBg: 'bg-primary-50',
    iconColor: 'text-primary-600',
    confirmClass: 'bg-primary-600 text-white hover:bg-primary-700',
    describe: (email) => `Give ${email} administrator rights.`,
    note:
      'Admins can manage every account, plan and audit log. They cannot read another pharmacy’s inventory or prescription data — those stay scoped to each owner by row level security.',
  },
  demote: {
    title: 'Remove Admin',
    icon: ShieldOff,
    iconBg: 'bg-error-50',
    iconColor: 'text-error-500',
    confirmClass: 'bg-error-500 text-white hover:bg-error-400',
    describe: (email) => `Return ${email} to a normal user account.`,
    note:
      'The last remaining admin cannot be demoted, and you cannot change your own role, so the panel is never left without an administrator.',
  },
};

export function UsersTab() {
  const { data: users, isLoading, isError, error, refetch } = useAdminUsers();
  const { user: currentUser } = useAuth();

  const extendTrialMutation = useExtendTrial();
  const activateMutation = useActivateSubscription();
  const cancelMutation = useCancelSubscription();
  const revokeMutation = useRevokeAccess();
  const roleMutation = useSetUserRole();

  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [extendDays, setExtendDays] = useState('7');

  const isPending =
    extendTrialMutation.isPending ||
    activateMutation.isPending ||
    cancelMutation.isPending ||
    revokeMutation.isPending ||
    roleMutation.isPending;

  const openAction = (user: AdminUser, type: ActionType) => {
    setActionTarget(user);
    setActionType(type);
    setExtendDays('7');
  };

  const closeAction = () => {
    setActionTarget(null);
    setActionType(null);
  };

  const handleAction = async () => {
    if (!actionTarget || !actionType) return;
    const email = actionTarget.email ?? 'this user';

    try {
      switch (actionType) {
        case 'extend': {
          const days = parseInt(extendDays, 10) || 7;
          await extendTrialMutation.mutateAsync({ userId: actionTarget.id, days });
          toast.success(`Trial extended by ${days} days for ${email}`);
          break;
        }
        case 'activate':
          await activateMutation.mutateAsync(actionTarget.id);
          toast.success(`Subscription activated for ${email}`);
          break;
        case 'cancel':
          await cancelMutation.mutateAsync(actionTarget.id);
          toast.success(`Subscription cancelled for ${email}`);
          break;
        case 'revoke':
          await revokeMutation.mutateAsync(actionTarget.id);
          toast.success(`Access revoked for ${email}`);
          break;
        case 'promote':
        case 'demote': {
          const role: UserRole = actionType === 'promote' ? 'admin' : 'user';
          await roleMutation.mutateAsync({ userId: actionTarget.id, role });
          toast.success(
            actionType === 'promote' ? `${email} is now an admin` : `${email} is no longer an admin`
          );
          break;
        }
      }
      closeAction();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'));
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
        <p className="mt-1 text-xs text-neutral-400">{getErrorMessage(error)}</p>
        <button onClick={() => refetch()} className="btn-secondary mt-3">
          Try again
        </button>
      </div>
    );
  }

  const presentation = actionType ? ACTIONS[actionType] : null;
  const ActionIcon = presentation?.icon;

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
                const isSelf = user.id === currentUser?.id;
                const roleAction: ActionType = user.role === 'admin' ? 'demote' : 'promote';
                const RoleIcon = ACTIONS[roleAction].icon;

                return (
                  <tr key={user.id} className="transition-colors hover:bg-neutral-50/50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-neutral-800">
                        {user.email ?? '—'}
                        {isSelf && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-primary-50 text-primary-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
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
                          onClick={() => openAction(user, 'extend')}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-warning-50 hover:text-warning-600"
                          title="Extend trial"
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openAction(user, 'activate')}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-success-50 hover:text-success-600"
                          title="Activate subscription"
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openAction(user, 'cancel')}
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                          title="Cancel subscription"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => openAction(user, roleAction)}
                            className={`rounded-lg p-2 text-neutral-400 transition-colors ${
                              user.role === 'admin'
                                ? 'hover:bg-error-50 hover:text-error-600'
                                : 'hover:bg-primary-50 hover:text-primary-600'
                            }`}
                            title={ACTIONS[roleAction].title}
                          >
                            <RoleIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openAction(user, 'revoke')}
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
      {actionTarget && actionType && presentation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
            onClick={closeAction}
          />
          <div className="relative w-full max-w-sm animate-slide-up">
            <div className="card p-6 text-center">
              <div
                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${presentation.iconBg}`}
              >
                {ActionIcon && <ActionIcon className={`h-6 w-6 ${presentation.iconColor}`} />}
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">{presentation.title}</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {presentation.describe(actionTarget.email ?? 'this user')}
              </p>

              {presentation.note && (
                <p className="mt-3 rounded-lg bg-neutral-100 p-3 text-left text-xs text-neutral-600">
                  {presentation.note}
                </p>
              )}

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
                <button onClick={closeAction} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={isPending}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 ${presentation.confirmClass}`}
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
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

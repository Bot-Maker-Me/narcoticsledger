import { Scale, Loader2, Edit3, CheckCircle2, Trash2 } from 'lucide-react';
import { formatDate } from '@/components/reconciliation/shared';

export interface PastCyclesViewProps {
  cycles: {
    id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    performed_by: string | null;
    verified_by: string | null;
    notes: string | null;
    created_at: string;
    name: string | null;
  }[];
  loading: boolean;
  onViewCycle: (id: string) => void;
  onNewCycle: () => void;
  onDeleteCycle: (id: string) => void;
}

export function PastCyclesView(props: PastCyclesViewProps) {
  const draftCycles = props.cycles.filter(c => c.status === 'draft');
  const otherCycles = props.cycles.filter(c => c.status !== 'draft');

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-neutral-900">Reconciliation Cycles</h1>
          <p className="mt-1 text-sm text-neutral-500">View and manage reconciliation history</p>
        </div>
        <button className="btn-primary mt-4 sm:mt-0" onClick={props.onNewCycle}>
          <Scale className="h-4 w-4" />
          New Reconciliation
        </button>
      </div>

      {props.loading ? (
        <div className="card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-400">Loading cycles...</p>
        </div>
      ) : props.cycles.length === 0 ? (
        <div className="card p-12 text-center">
          <Scale className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-400">No reconciliation cycles yet</p>
          <button className="btn-primary mt-4" onClick={props.onNewCycle}>
            <Scale className="h-4 w-4" />
            Start your first cycle
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending Drafts Section */}
          {draftCycles.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                Pending Drafts ({draftCycles.length})
              </h2>
              <div className="space-y-3">
                {draftCycles.map((cycle) => (
                  <div key={cycle.id} className="card p-5 border-l-4 border-warning-400 transition-all duration-200 hover:shadow-elevated">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning-50">
                          <Edit3 className="h-5 w-5 text-warning-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-neutral-900">
                              {cycle.name || `Draft - ${formatDate(cycle.created_at)}`}
                            </p>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-50 text-warning-700">
                              Draft
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-neutral-400">
                            Created {formatDate(cycle.created_at)} · Continue working on this reconciliation
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="btn-primary text-xs"
                          onClick={() => props.onViewCycle(cycle.id)}
                        >
                          Continue
                        </button>
                        <button
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                          onClick={() => props.onDeleteCycle(cycle.id)}
                          title="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed and In-Progress Cycles */}
          {otherCycles.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                {draftCycles.length > 0 ? 'Completed Cycles' : 'All Cycles'}
              </h2>
              <div className="space-y-3">
                {otherCycles.map((cycle) => {
                  const isCompleted = cycle.status === 'completed';
                  return (
                    <div key={cycle.id} className="card p-5 transition-all duration-200 hover:shadow-elevated">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${isCompleted ? 'bg-success-50' : 'bg-warning-50'}`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-success-600" />
                            ) : (
                              <Scale className="h-5 w-5 text-warning-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-neutral-900">
                                {cycle.start_date ? formatDate(cycle.start_date) : formatDate(cycle.created_at)}
                                {cycle.end_date ? ` — ${formatDate(cycle.end_date)}` : ''}
                              </p>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isCompleted ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                                {isCompleted ? 'Completed' : 'In Progress'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-400">
                              {cycle.performed_by && `Performed by ${cycle.performed_by}`}
                              {cycle.performed_by && cycle.verified_by && ' · '}
                              {cycle.verified_by && `Verified by ${cycle.verified_by}`}
                              {!cycle.performed_by && !cycle.verified_by && 'No performer/verifier assigned'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="btn-secondary text-xs" onClick={() => props.onViewCycle(cycle.id)}>
                            {isCompleted ? 'View' : 'Continue'}
                          </button>
                          <button
                            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                            onClick={() => props.onDeleteCycle(cycle.id)}
                            title="Delete cycle"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {cycle.notes && (
                        <p className="mt-3 text-xs text-neutral-400">{cycle.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeleteDialog({
  onCancel,
  onConfirm,
  deleting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-error-50">
            <Trash2 className="h-6 w-6 text-error-500" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900">Delete cycle?</h3>
          <p className="mt-1 text-sm text-neutral-500">
            This will permanently delete the reconciliation cycle and all its items. This cannot be undone.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-error-400 active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

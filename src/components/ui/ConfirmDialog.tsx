import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive coral treatment. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation dialog.
 *
 * Replaces the native `window.confirm`, which ignored the design system, could not be
 * themed or tested, and was duplicated verbatim across four record screens.
 *
 * Mount once near the app root, then `if (!(await confirm({ title: '…' }))) return;`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setRequest(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [request, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div
            className="absolute inset-0 animate-fade-in bg-ink-950/80 backdrop-blur-sm"
            onClick={() => settle(false)}
          />

          <div className="card relative z-[10000] w-full max-w-md animate-slide-up p-6">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  request.destructive ? 'bg-error-50' : 'bg-primary-50'
                }`}
              >
                <AlertTriangle
                  className={`h-5 w-5 ${request.destructive ? 'text-error-600' : 'text-primary-600'}`}
                />
              </div>
              <div className="min-w-0">
                <h3 id="confirm-dialog-title" className="text-lg font-semibold text-neutral-900">
                  {request.title}
                </h3>
                {request.description && (
                  <p className="mt-1 text-sm text-neutral-500">{request.description}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </button>
              <button type="button" className="btn-primary" onClick={() => settle(true)} autoFocus>
                {request.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm() must be used inside <ConfirmProvider>');
  }
  return context;
}

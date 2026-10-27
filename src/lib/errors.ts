/**
 * Small helpers for turning unknown thrown values into messages, and a single place where
 * unexpected errors are reported.
 *
 * Server errors used to be swallowed in several hooks (`catch { return [] }`), which is how
 * a completely broken admin panel went unnoticed. Callers now surface the error to the user
 * and let React Query keep the failure state.
 */

/** A human-readable message for anything that can be thrown. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return fallback;
}

/**
 * Reports an unexpected error. Wire a real reporter (Sentry, etc.) in here so every call
 * site starts sending data at once.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[error]', context ?? {}, error);
}

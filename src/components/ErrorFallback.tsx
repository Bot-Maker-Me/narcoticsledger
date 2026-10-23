import type { FallbackProps } from 'react-error-boundary';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-error-50">
          <AlertTriangle className="h-8 w-8 text-error-500" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-500">
          An unexpected error occurred. Try reloading the page, or go back to the dashboard.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-neutral-100 p-4 text-left text-xs text-neutral-600">
            {error instanceof Error ? error.message : String(error)}
          </pre>
        )}
        <button onClick={resetErrorBoundary} className="btn-primary mt-6">
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}

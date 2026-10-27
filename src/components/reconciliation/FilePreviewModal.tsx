import { CheckCircle2 } from 'lucide-react';
import type { FilePreview } from '@/lib/fileParser';

export interface FilePreviewModalProps {
  previews: {
    mckesson: FilePreview[];
    kroll: FilePreview[];
  };
  itemCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FilePreviewModal({ previews, itemCount, onConfirm, onCancel }: FilePreviewModalProps) {
  if (previews.mckesson.length === 0 && previews.kroll.length === 0) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-4xl animate-slide-up z-[10000] max-h-[90vh] overflow-y-auto">
        <div className="card p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-neutral-900">File Import Preview</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Review the parsed data before proceeding. {itemCount} unique DIN{itemCount === 1 ? '' : 's'} ready for this cycle from {previews.mckesson.length} McKesson and {previews.kroll.length} Kroll file(s).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* McKesson Files */}
            <div className="space-y-3">
              <h3 className="font-semibold text-neutral-800">McKesson Files ({previews.mckesson.length})</h3>
              {previews.mckesson.map((preview, index) => (
                <div key={index} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-800">{preview.fileName}</span>
                    <span className="text-xs font-medium uppercase text-neutral-500">{preview.format}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500">Rows:</span>
                      <span className="ml-1 font-medium text-neutral-800">{preview.totalRows}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">DINs:</span>
                      <span className="ml-1 font-medium text-primary-600">{preview.uniqueDINs}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Size:</span>
                      <span className="ml-1 font-medium text-neutral-800">{(preview.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Kroll Files */}
            <div className="space-y-3">
              <h3 className="font-semibold text-neutral-800">Kroll Files ({previews.kroll.length})</h3>
              {previews.kroll.map((preview, index) => (
                <div key={index} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-800">{preview.fileName}</span>
                    <span className="text-xs font-medium uppercase text-neutral-500">{preview.format}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500">Rows:</span>
                      <span className="ml-1 font-medium text-neutral-800">{preview.totalRows}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">DINs:</span>
                      <span className="ml-1 font-medium text-primary-600">{preview.uniqueDINs}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Size:</span>
                      <span className="ml-1 font-medium text-neutral-800">{(preview.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="btn-primary"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Start Reconciliation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

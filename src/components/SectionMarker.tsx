interface SectionMarkerProps {
  index: string;
  label: string;
  className?: string;
}

/** Small uppercase section label prefixed by a thin coral rule. */
export default function SectionMarker({ index, label, className = '' }: SectionMarkerProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="h-px w-8 shrink-0 bg-primary-500/80" />
      <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary-500">
        § {index} · {label}
      </span>
    </div>
  );
}

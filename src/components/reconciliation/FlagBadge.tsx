export function FlagBadge({ label, count, style }: { label: string; count: number; style: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${style}`}>
      <span>{label}</span>
      <span className="rounded-full bg-white/50 px-1.5 py-0.5 font-semibold">{count}</span>
    </div>
  );
}

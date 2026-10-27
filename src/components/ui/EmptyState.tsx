import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Shared empty/zero-result panel used inside data cards. */
export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <Icon className="mx-auto h-12 w-12 text-neutral-300" />
      <p className="mt-4 text-sm text-neutral-400">{title}</p>
      {description && <p className="mt-2 text-xs text-neutral-400">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

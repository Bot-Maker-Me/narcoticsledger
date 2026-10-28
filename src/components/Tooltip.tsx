import { Suspense, lazy, useLayoutEffect, useState } from 'react';

// Tippy + Popper are ~140 KB; they load the first time a tooltip is rendered.
const Tippy = lazy(() => import('./TippyTooltip'));

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function Tooltip({ content, children, placement = 'top', delay = 200 }: TooltipProps) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <>{children}</>;

  return (
    <Suspense fallback={<>{children}</>}>
      <Tippy content={content} placement={placement} delay={delay}>
        {children as React.ReactElement}
      </Tippy>
    </Suspense>
  );
}
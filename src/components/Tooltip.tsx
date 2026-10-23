import { useLayoutEffect, useRef, useState } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

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
    <Tippy
      content={content}
      placement={placement}
      delay={delay}
      theme="light"
      arrow={true}
      duration={200}
    >
      {children as React.ReactElement}
    </Tippy>
  );
}
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

interface TippyTooltipProps {
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  delay: number;
  children: React.ReactElement;
}

/** The actual Tippy wrapper, split out so `Tooltip` can load it lazily. */
export default function TippyTooltip({ content, placement, delay, children }: TippyTooltipProps) {
  return (
    <Tippy content={content} placement={placement} delay={delay} theme="light" arrow={true} duration={200}>
      {children}
    </Tippy>
  );
}

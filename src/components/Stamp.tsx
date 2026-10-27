import { useId } from 'react';

interface StampProps {
  /** Text running around the ring, e.g. "SECURE · AUDIT ·". */
  ring: string;
  /** Text in the middle, e.g. "VERIFIED". */
  center: string;
  className?: string;
}

/** Circular coral stamp used to mark verified / audited content. */
export default function Stamp({ ring, center, className = '' }: StampProps) {
  const ringId = useId();

  return (
    <div className={`h-24 w-24 select-none ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="h-full w-full text-primary-500/70">
        <defs>
          <path
            id={ringId}
            d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0"
            fill="none"
          />
        </defs>
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1" />
        <text className="fill-current text-[10px] font-medium uppercase" letterSpacing="1.6">
          <textPath href={`#${ringId}`} startOffset="0">
            {ring}
          </textPath>
        </text>
        <text
          x="50"
          y="55"
          textAnchor="middle"
          className="fill-current text-[13px] font-semibold uppercase"
          letterSpacing="1"
        >
          {center}
        </text>
      </svg>
    </div>
  );
}

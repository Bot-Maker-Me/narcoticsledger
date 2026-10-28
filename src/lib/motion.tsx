import type { ReactNode } from 'react';
import { AnimatePresence, LazyMotion, m } from 'framer-motion';

/**
 * Animation entry point for the whole app.
 *
 * Importing `motion` from 'framer-motion' pulls the entire library (about 450 KB before
 * compression) into the first bundle. `m` is the same component API without the bundled
 * features; `LazyMotion` fetches the small `domAnimation` feature set after first paint.
 * `strict` makes a stray full `motion.*` component throw in development instead of
 * silently re-adding the weight.
 */
export const motion = m;
export { AnimatePresence };

const loadFeatures = () => import('./motionFeatures').then((module) => module.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}

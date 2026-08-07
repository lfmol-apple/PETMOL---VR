'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps a fixed-position bottom sheet pinned to the actually-visible
 * (keyboard-aware) viewport instead of the full layout viewport.
 *
 * iOS/Android don't reliably resize `position: fixed` elements when the
 * on-screen keyboard opens — a sheet anchored with `bottom: 0` can end up
 * rendered partially or fully behind the keyboard instead of sliding up
 * above it. Listening to `visualViewport` resize/scroll and applying
 * `top`/`height` directly keeps the sheet matched to what's actually
 * visible, the same way BreedPicker already handled this.
 *
 * Usage: attach the returned ref to the sheet's outermost `fixed` wrapper
 * (the one that would otherwise use `inset-0`), keep `top: 0` and
 * `height: 100dvh` as the pre-JS/no-visualViewport fallback in its style.
 */
export function useKeyboardSheetViewport(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (!ref.current) return;
      ref.current.style.top = `${vv.offsetTop}px`;
      ref.current.style.height = `${vv.height}px`;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  return ref;
}

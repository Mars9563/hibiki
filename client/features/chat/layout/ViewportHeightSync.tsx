'use client';

import { useEffect } from 'react';

// Tracks the *real* visible viewport (visualViewport), which shrinks
// when the mobile keyboard opens — unlike dvh/vh, which doesn't.
// Writes the values as CSS vars on <html> so ChatLayout can read them
// without us re-rendering the whole tree on every keyboard event.
export function ViewportHeightSync() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;

    function setVH() {
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-offset-top', `${offsetTop}px`);
    }

    setVH();
    vv?.addEventListener('resize', setVH);
    vv?.addEventListener('scroll', setVH);
    window.addEventListener('resize', setVH); // fallback if visualViewport is unavailable

    return () => {
      vv?.removeEventListener('resize', setVH);
      vv?.removeEventListener('scroll', setVH);
      window.removeEventListener('resize', setVH);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-offset-top');
    };
  }, []);

  return null;
}

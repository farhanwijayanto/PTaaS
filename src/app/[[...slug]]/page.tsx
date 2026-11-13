'use client';

import { useEffect } from 'react';

export default function CatchAllPage() {
  useEffect(() => {
    import('../main.js').then((mod) => {
      mod.initPtaasApp?.();
    });
  }, []);

  return (
    <>
      <div id="root" />
      <div
        id="toasts"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
        aria-live="polite"
      />
    </>
  );
}

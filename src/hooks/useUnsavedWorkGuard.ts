import { useEffect, useRef } from 'react';
import { setUnsavedWorkSource } from '../pwa/updateManager';

// Registers this component instance as a source of unsaved work while `isDirty` is true — a
// pending app update (see src/pwa/updateManager.ts) is never auto-applied while any source is
// registered, so a deploy can never silently reload a tab out from under someone mid-form. Always
// clears itself on unmount, so a page that's simply closed/navigated away from never leaves a
// stale "dirty" flag behind.
export const useUnsavedWorkGuard = (isDirty: boolean): void => {
  const idRef = useRef<symbol>(Symbol('unsaved-work-source'));

  useEffect(() => {
    setUnsavedWorkSource(idRef.current, isDirty);
  }, [isDirty]);

  useEffect(() => {
    const id = idRef.current;
    return () => setUnsavedWorkSource(id, false);
  }, []);
};

import { useSyncExternalStore } from 'react';

export default function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

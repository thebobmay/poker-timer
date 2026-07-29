import { useEffect, useReducer } from 'react';

/** Force a re-render every `ms` so time-derived UI ticks smoothly. */
export function useTick(ms = 250): void {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(force, ms);
    return () => clearInterval(id);
  }, [ms]);
}

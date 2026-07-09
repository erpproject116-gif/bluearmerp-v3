import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

/** Debounces a signal value for use in query keys (e.g. search). */
export function useDebouncedSignal(source: Accessor<string>, ms = 350): Accessor<string> {
  const [debounced, setDebounced] = createSignal(source());
  createEffect(() => {
    const value = source();
    const timer = setTimeout(() => setDebounced(value), ms);
    onCleanup(() => clearTimeout(timer));
  });
  return debounced;
}

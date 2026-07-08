/** Returns a debounced wrapper; call `.cancel()` to clear a pending invocation. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}

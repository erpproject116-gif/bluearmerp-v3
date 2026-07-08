/** Lightweight fallback while a lazy route chunk loads. */
export function PageLoader() {
  return (
    <div class="flex min-h-[40vh] items-center justify-center p-8">
      <p class="text-sm text-text-secondary">Loading page…</p>
    </div>
  );
}

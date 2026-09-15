/** Lightweight fallback while a lazy route chunk loads. */
import { DEFAULT_BRAND_LOGO_URL } from "./branding/defaults";

export function PageLoader() {
  return (
    <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8">
      <img src={DEFAULT_BRAND_LOGO_URL} alt="" class="h-10 w-10 object-contain" width="40" height="40" />
      <p class="text-sm text-text-secondary">Loading page…</p>
    </div>
  );
}

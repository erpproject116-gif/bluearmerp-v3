import { createEffect, createSignal, onCleanup } from "solid-js";
import { fetchBrandingLogoBlob, isBrandingAssetMissing } from "./BrandingProvider";

/** Loads a tenant branding logo via authenticated fetch (img src cannot send Bearer tokens). */
export function useBrandingLogoUrl(logoAssetId: () => number | null | undefined) {
  const [url, setUrl] = createSignal<string | null>(null);

  createEffect(() => {
    const id = logoAssetId();
    if (!id || isBrandingAssetMissing(id)) {
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let active = true;
    void fetchBrandingLogoBlob(id).then((blobUrl) => {
      if (!active) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blobUrl;
      });
    });
    onCleanup(() => {
      active = false;
    });
  });

  onCleanup(() => {
    const u = url();
    if (u) URL.revokeObjectURL(u);
  });

  return url;
}

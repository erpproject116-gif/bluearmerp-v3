import { createEffect, createSignal, onCleanup } from "solid-js";
import { fetchBrandingLogoBlob } from "./BrandingProvider";
import { fetchReportLogoBlob } from "../reportTemplates/useReportTemplates";

export type PrintLogoRef =
  | { id: number; source: "branding" | "report" }
  | null
  | undefined;

export function usePrintLogoUrl(logoRef: () => PrintLogoRef) {
  const [url, setUrl] = createSignal<string | null>(null);

  createEffect(() => {
    const ref = logoRef();
    if (!ref?.id) {
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let active = true;
    const fetcher = ref.source === "report" ? fetchReportLogoBlob : fetchBrandingLogoBlob;
    void fetcher(ref.id).then((blobUrl) => {
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

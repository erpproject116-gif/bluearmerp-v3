import { createEffect, createSignal, Show } from "solid-js";
import { apiAbsoluteUrl } from "./api";
import { fetchBrandingLogoBlob, isBrandingAssetMissing } from "./branding/BrandingProvider";

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
  title?: string;
  class?: string;
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
};

function brandingAssetIdFromUrl(url: string): number | null {
  const m = url.match(/\/branding\/assets\/(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function UserAvatar(props: Props) {
  const [broken, setBroken] = createSignal(false);
  const [resolvedSrc, setResolvedSrc] = createSignal<string | null>(null);

  const initial = () => {
    const parts = props.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return (parts[0]?.charAt(0) ?? "?").toUpperCase();
  };

  createEffect(() => {
    const raw = props.avatarUrl?.trim() ?? "";
    setBroken(false);
    setResolvedSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (!raw) return;
    const assetId = brandingAssetIdFromUrl(raw);
    if (assetId) {
      if (isBrandingAssetMissing(assetId)) {
        setBroken(true);
        return;
      }
      void fetchBrandingLogoBlob(assetId).then((blobUrl) => {
        if (!blobUrl) {
          setBroken(true);
          return;
        }
        setResolvedSrc(blobUrl);
      });
      return;
    }
    setResolvedSrc(apiAbsoluteUrl(raw));
  });

  return (
    <span
      class={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700 ${sizeClass[props.size ?? "sm"]} ${props.class ?? ""}`}
      title={props.title ?? props.name}
    >
      <Show when={!broken() && resolvedSrc()} fallback={initial()}>
        {(url) => (
          <img
            src={url()}
            alt=""
            class="h-full w-full object-cover"
            referrerpolicy="no-referrer"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        )}
      </Show>
    </span>
  );
}

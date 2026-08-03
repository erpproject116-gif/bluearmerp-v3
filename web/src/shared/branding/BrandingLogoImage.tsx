import { Show } from "solid-js";
import { useBranding } from "./BrandingProvider";
import { usePrintLogoUrl } from "./usePrintLogoUrl";

type Props = {
  class?: string;
  alt?: string;
};

export function BrandingLogoImage(props: Props) {
  const branding = useBranding();
  const logoRef = () => {
    if (branding.logoMissing()) return null;
    const id = branding.settings().receipt.logo_asset_id;
    return id ? { id, source: "branding" as const } : null;
  };
  const url = usePrintLogoUrl(logoRef);

  return (
    <Show when={url()}>
      <img src={url()!} alt={props.alt ?? "Company logo"} class={props.class ?? "max-h-20 max-w-[12rem] object-contain"} />
    </Show>
  );
}

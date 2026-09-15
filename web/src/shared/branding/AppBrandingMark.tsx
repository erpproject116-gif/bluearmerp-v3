import { Show } from "solid-js";
import { useAuth } from "../auth-context";
import { useBranding } from "./BrandingProvider";
import { DEFAULT_BRAND_LOGO_URL } from "./defaults";
import { usePrintLogoUrl } from "./usePrintLogoUrl";

type Props = {
  size?: "sm" | "md";
  showText?: boolean;
};

export function AppBrandingMark(props: Props) {
  const auth = useAuth();
  const branding = useBranding();
  const logoRef = () => {
    if (branding.logoMissing()) return null;
    const id = branding.settings().receipt.logo_asset_id;
    return id ? { id, source: "branding" as const } : null;
  };
  const tenantLogoUrl = usePrintLogoUrl(logoRef);
  const logoUrl = () => tenantLogoUrl() ?? DEFAULT_BRAND_LOGO_URL;
  const companyName = () =>
    branding.settings().receipt.company_name?.trim() ||
    auth.me?.tenant.company_name ||
    "Bluearm";
  const boxClass = () => (props.size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg");

  return (
    <Show
      when={props.showText !== false}
      fallback={
        <img
          src={logoUrl()}
          alt=""
          class={`shrink-0 rounded-xl object-contain ${props.size === "sm" ? "h-8 w-8" : "h-10 w-10"}`}
        />
      }
    >
      <div class="flex min-w-0 items-center gap-3">
        <img src={logoUrl()} alt="" class={`shrink-0 rounded-xl object-contain ${boxClass()}`} />
        <div class="min-w-0">
          <p class="truncate text-lg font-semibold text-text-primary">{companyName()}</p>
        </div>
      </div>
    </Show>
  );
}

import { Show } from "solid-js";
import { useAuth } from "../auth-context";
import { useBranding } from "./BrandingProvider";
import {
  resolveLogoAssetId,
  resolvePrintCompanyName,
  resolvePrintHeaderText,
} from "./receiptBranding";
import { usePrintLogoUrl } from "./usePrintLogoUrl";

export type PrintBrandingOverrides = {
  printHeader?: string;
  printFooter?: string;
  logoAssetId?: number | null;
};

type Props = {
  docTitle: string;
  docSubtitle?: string;
  tenantFallbackName?: string;
  variant?: "quotation" | "repair";
  overrides?: PrintBrandingOverrides;
};

export function PrintBrandingHeader(props: Props) {
  const auth = useAuth();
  const branding = useBranding();
  const settings = () => branding.settings();
  const logoRef = () => {
    if (props.overrides?.logoAssetId) {
      return { id: props.overrides.logoAssetId, source: "report" as const };
    }
    const id = resolveLogoAssetId(null, settings());
    return id ? { id, source: "branding" as const } : null;
  };
  const fetchedLogoUrl = usePrintLogoUrl(logoRef);
  /** Prefer freshly fetched blob; fall back to provider preview (same asset). */
  const logoUrl = () => fetchedLogoUrl() ?? branding.logoPreviewUrl() ?? null;
  const companyName = () =>
    resolvePrintCompanyName(
      undefined,
      settings(),
      props.tenantFallbackName ?? auth.me?.tenant.company_name,
    );
  const headerMeta = () =>
    resolvePrintHeaderText(props.overrides?.printHeader, settings(), companyName());
  const initial = () => companyName().charAt(0).toUpperCase() || "B";
  const headerClass = () => (props.variant === "repair" ? "repair-print__header" : "quotation-print__header");
  const companyClass = () => (props.variant === "repair" ? "repair-print__company" : "quotation-print__company");
  const metaClass = () => (props.variant === "repair" ? "repair-print__meta" : "quotation-print__meta");
  const titleClass = () => (props.variant === "repair" ? "repair-print__doc-title" : "quotation-print__doc-title");

  return (
    <header class={headerClass()}>
      <div class="min-w-0">
        <div class="mb-2 flex items-start gap-3">
          <Show
            when={logoUrl()}
            fallback={
              <div
                class="print-brand-mark flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white"
                aria-hidden="true"
              >
                {initial()}
              </div>
            }
          >
            <img
              src={logoUrl()!}
              alt=""
              class="print-brand-logo max-h-16 max-w-[10rem] object-contain object-left"
            />
          </Show>
          <div class="min-w-0">
            <h1 class={companyClass()}>{companyName()}</h1>
            <Show when={headerMeta().trim()}>
              <p class={`${metaClass()} whitespace-pre-line`}>{headerMeta()}</p>
            </Show>
          </div>
        </div>
      </div>
      <div class={titleClass()}>
        <h2>{props.docTitle}</h2>
        <Show when={props.docSubtitle?.trim()}>
          <p class={metaClass()}>{props.docSubtitle}</p>
        </Show>
      </div>
    </header>
  );
}

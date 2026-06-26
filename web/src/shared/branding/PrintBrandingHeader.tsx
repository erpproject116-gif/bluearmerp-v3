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
  const logoUrl = usePrintLogoUrl(logoRef);
  const companyName = () =>
    resolvePrintCompanyName(
      undefined,
      settings(),
      props.tenantFallbackName ?? auth.me?.tenant.company_name,
    );
  const headerMeta = () => resolvePrintHeaderText(props.overrides?.printHeader, settings());
  const headerClass = () => (props.variant === "repair" ? "repair-print__header" : "quotation-print__header");
  const companyClass = () => (props.variant === "repair" ? "repair-print__company" : "quotation-print__company");
  const metaClass = () => (props.variant === "repair" ? "repair-print__meta" : "quotation-print__meta");
  const titleClass = () => (props.variant === "repair" ? "repair-print__doc-title" : "quotation-print__doc-title");

  return (
    <header class={headerClass()}>
      <div>
        <Show when={logoUrl()}>
          <img src={logoUrl()!} alt="Logo" class="mb-2 max-h-16 max-w-[10rem] object-contain" />
        </Show>
        <h1 class={companyClass()}>{companyName()}</h1>
        <Show when={headerMeta().trim()}>
          <p class={`${metaClass()} whitespace-pre-line`}>{headerMeta()}</p>
        </Show>
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

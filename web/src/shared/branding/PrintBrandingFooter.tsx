import { Show } from "solid-js";
import { useAuth } from "../auth-context";
import { useBranding } from "./BrandingProvider";
import { resolvePrintCompanyName, resolvePrintFooterText } from "./receiptBranding";
import type { PrintBrandingOverrides } from "./PrintBrandingHeader";

type Props = {
  overrides?: Pick<PrintBrandingOverrides, "printFooter">;
  defaultFooter?: string;
  class?: string;
};

export function PrintBrandingFooter(props: Props) {
  const auth = useAuth();
  const branding = useBranding();
  const text = () => {
    const custom = resolvePrintFooterText(props.overrides?.printFooter, branding.settings());
    if (custom.trim()) return custom;
    if (props.defaultFooter?.trim()) return props.defaultFooter.trim();
    // Consistent letterhead footer when branding footer is empty.
    return resolvePrintCompanyName(undefined, branding.settings(), auth.me?.tenant.company_name);
  };

  return (
    <Show when={text().trim()}>
      <footer
        class={
          props.class ??
          "print-brand-footer mt-6 border-t border-stroke pt-3 text-center text-sm text-text-secondary whitespace-pre-line"
        }
      >
        {text()}
      </footer>
    </Show>
  );
}

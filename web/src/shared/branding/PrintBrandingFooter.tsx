import { Show } from "solid-js";
import { useBranding } from "./BrandingProvider";
import { resolvePrintFooterText } from "./receiptBranding";
import type { PrintBrandingOverrides } from "./PrintBrandingHeader";

type Props = {
  overrides?: Pick<PrintBrandingOverrides, "printFooter">;
  defaultFooter?: string;
  class?: string;
};

export function PrintBrandingFooter(props: Props) {
  const branding = useBranding();
  const text = () => {
    const custom = resolvePrintFooterText(props.overrides?.printFooter, branding.settings());
    if (custom.trim()) return custom;
    return props.defaultFooter ?? "";
  };

  return (
    <Show when={text().trim()}>
      <footer class={props.class ?? "mt-6 border-t border-stroke pt-3 text-center text-sm text-text-secondary whitespace-pre-line"}>
        {text()}
      </footer>
    </Show>
  );
}

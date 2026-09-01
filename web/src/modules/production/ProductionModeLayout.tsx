import { createMemo, type ParentComponent } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProductionLayout } from "./ProductionLayout";
import { MFG_COPY, parseMfgMode, type MfgMode } from "./mfgProductionMode";

export type ProductionModeContext = {
  mode: MfgMode;
  copy: (typeof MFG_COPY)[MfgMode];
};

export function useProductionMode(): ProductionModeContext {
  const params = useParams<{ mode: string }>();
  const mode = createMemo(() => {
    const m = parseMfgMode(params.mode);
    if (!m) throw new Error("Invalid production mode");
    return m;
  });
  return {
    get mode() {
      return mode();
    },
    get copy() {
      return MFG_COPY[mode()];
    },
  };
}

/** Wraps Production pages under /production/:mode/* — validates mode segment. */
export const ProductionModeLayout: ParentComponent = (props) => {
  const params = useParams<{ mode: string }>();
  const mode = () => parseMfgMode(params.mode);
  return (
    <>
      {mode() ? (
        <ProductionLayout mode={mode()!}>{props.children}</ProductionLayout>
      ) : (
        <p class="text-sm text-red-600">Invalid production type.</p>
      )}
    </>
  );
};

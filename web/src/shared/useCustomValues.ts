import { createSignal } from "solid-js";

export function useCustomValues() {
  const [customValues, setCustomValues] = createSignal<Record<string, unknown>>({});

  const setCustom = (key: string, value: unknown) => {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  };

  const loadCustom = (values?: Record<string, unknown>) => {
    setCustomValues(values ?? {});
  };

  return { customValues, setCustom, loadCustom };
}

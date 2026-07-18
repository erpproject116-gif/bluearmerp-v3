import { createEffect } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { PESO_SIGN, setDisplayCurrencySign } from "./money";
import { useAuth } from "./auth-context";

type CurrencyRow = {
  currency_code: string;
  symbol?: string;
  is_default: boolean;
  status: string;
};

/**
 * Loads the tenant default currency sign once and sets it for formatMoney/formatPeso.
 * Display-only — never used in arithmetic.
 */
export function useBootstrapDisplayCurrency() {
  const auth = useAuth();
  const q = createQuery(() => ({
    queryKey: ["display-currency-sign", auth.me?.tenant?.id],
    enabled: Boolean(auth.me?.user && !auth.me.user.platform_only),
    queryFn: async () => {
      const res = await apiFetch<CurrencyRow[]>(
        "/api/v1/quotation/currencies?page=1&pageSize=50&status=active&sort=is_default&order=desc",
      );
      if (!res.ok) return PESO_SIGN;
      const rows = res.data ?? [];
      const def = rows.find((r) => r.is_default) ?? rows.find((r) => r.currency_code === "PHP") ?? rows[0];
      const sign = (def?.symbol || "").trim();
      if (sign) return sign;
      if (def?.currency_code === "PHP" || def?.currency_code === "DOMESTIC") return PESO_SIGN;
      return def?.currency_code?.trim() || PESO_SIGN;
    },
    staleTime: 5 * 60_000,
  }));

  createEffect(() => {
    if (q.data) setDisplayCurrencySign(q.data);
  });

  return q;
}

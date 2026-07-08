import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { CurrencyRow } from "./useCurrencyList";
import type { TaxTypeRow } from "./useTaxTypeList";

const ACTIVE_TAX_TYPES_KEY = ["quotation-tax-types", "active-modal"] as const;
const ACTIVE_CURRENCIES_KEY = ["quotation-currencies", "active-modal"] as const;

async function loadActiveTaxTypes(): Promise<TaxTypeRow[]> {
  const res = await apiFetch<TaxTypeRow[]>(
    "/api/v1/quotation/tax-types?page=1&pageSize=100&status=active&sort=sort_order&order=asc",
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load tax types");
  return res.data ?? [];
}

async function loadActiveCurrencies(): Promise<CurrencyRow[]> {
  const res = await apiFetch<CurrencyRow[]>(
    "/api/v1/quotation/currencies?page=1&pageSize=100&status=active&sort=name&order=asc",
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load currencies");
  return res.data ?? [];
}

/** Cached active tax types for document modals (quotation, SO, sales, PO, etc.). */
export function useActiveTaxTypes(enabled: () => boolean = () => true) {
  return createQuery(() => ({
    queryKey: ACTIVE_TAX_TYPES_KEY,
    enabled: enabled(),
    queryFn: loadActiveTaxTypes,
    staleTime: 300_000,
    gcTime: 600_000,
  }));
}

/** Cached active currencies for document modals. */
export function useActiveCurrencies(enabled: () => boolean = () => true) {
  return createQuery(() => ({
    queryKey: ACTIVE_CURRENCIES_KEY,
    enabled: enabled(),
    queryFn: loadActiveCurrencies,
    staleTime: 300_000,
    gcTime: 600_000,
  }));
}

export { ACTIVE_TAX_TYPES_KEY, ACTIVE_CURRENCIES_KEY, loadActiveTaxTypes, loadActiveCurrencies };

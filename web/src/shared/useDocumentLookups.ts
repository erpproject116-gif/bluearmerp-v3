import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { LookupOption } from "./LookupCombo";
import { queryClient } from "./queryClient";
import type { CurrencyRow } from "./useCurrencyList";
import type { TaxTypeRow } from "./useTaxTypeList";

const ACTIVE_TAX_TYPES_KEY = ["quotation-tax-types", "active-modal"] as const;
const ACTIVE_CURRENCIES_KEY = ["quotation-currencies", "active-modal"] as const;
const ACTIVE_LOCATIONS_KEY = ["inv-locations", "active-modal"] as const;
const ACTIVE_PARTNERS_KEY = ["inv-partners", "active-modal"] as const;

const LOCATIONS_PAGE_QS = "page=1&pageSize=20&status=active";
const PARTNERS_PAGE_QS = "page=1&pageSize=20&status=active";

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

async function loadActiveLocations(): Promise<LookupOption[]> {
  const res = await apiFetch<{ id: number; location_name: string }[]>(
    `/api/v1/inventory/locations?${LOCATIONS_PAGE_QS}`,
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load locations");
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

/**
 * Location options for document modals. Every modal opens with the identical
 * unfiltered first page, so that one is served from a shared 5-minute cache
 * entry; typed searches still go straight to the API.
 */
export async function fetchLocationOptions(q: string): Promise<LookupOption[]> {
  const term = q.trim();
  if (term) {
    const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", q: term });
    const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
    return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
  }
  return queryClient.fetchQuery({
    queryKey: ACTIVE_LOCATIONS_KEY,
    queryFn: loadActiveLocations,
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

type PartnerRow = { id: number; company_name: string; partner_code?: string; partner_kind: string };

/** Which partners a document accepts. `both` always qualifies. */
export type PartnerKindFilter = "customer" | "vendor";

async function loadActivePartners(): Promise<PartnerRow[]> {
  const res = await apiFetch<PartnerRow[]>(`/api/v1/inventory/partners?${PARTNERS_PAGE_QS}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load partners");
  return res.data ?? [];
}

const toPartnerOption = (p: PartnerRow, withCode: boolean): LookupOption =>
  withCode ? { id: p.id, label: p.company_name, sublabel: p.partner_code } : { id: p.id, label: p.company_name };

/**
 * Partner options for document modals. Like locations, every modal opens with the
 * same unfiltered first page, so it is fetched once and each caller filters it to
 * the partner kind it accepts. Typed searches still go straight to the API.
 */
export async function fetchPartnerOptions(
  q: string,
  kind: PartnerKindFilter,
  opts: { withCode?: boolean } = {},
): Promise<LookupOption[]> {
  const withCode = opts.withCode === true;
  const matches = (p: PartnerRow) => p.partner_kind === kind || p.partner_kind === "both";
  const term = q.trim();

  if (term) {
    const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", q: term });
    const res = await apiFetch<PartnerRow[]>(`/api/v1/inventory/partners?${qs}`);
    return (res.data ?? []).filter(matches).map((p) => toPartnerOption(p, withCode));
  }

  const rows = await queryClient.fetchQuery({
    queryKey: ACTIVE_PARTNERS_KEY,
    queryFn: loadActivePartners,
    staleTime: 300_000,
    gcTime: 600_000,
  });
  return rows.filter(matches).map((p) => toPartnerOption(p, withCode));
}

export {
  ACTIVE_TAX_TYPES_KEY,
  ACTIVE_CURRENCIES_KEY,
  ACTIVE_LOCATIONS_KEY,
  ACTIVE_PARTNERS_KEY,
  loadActiveTaxTypes,
  loadActiveCurrencies,
  loadActiveLocations,
  loadActivePartners,
};

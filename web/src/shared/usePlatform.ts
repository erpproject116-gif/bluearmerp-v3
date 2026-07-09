import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type Entitlement = {
  plan_kind?: string;
  status?: string;
  ends_at?: string;
  days_remaining?: number;
  urgency_label?: string;
  write_blocked?: boolean;
  message?: string;
};

export type PlatformCustomer = {
  id: number;
  email: string;
  full_name: string;
  company_name?: string | null;
  entry_source: string;
  urgency_label: string;
  tenant_id?: number | null;
  company_code?: string | null;
  plan_kind?: string | null;
  subscription_status?: string | null;
  ends_at?: string | null;
  days_remaining?: number;
  crm_lead_id?: number | null;
};

export type PlatformBillingSummary = {
  mrr: number;
  expiring_7_days: number;
  expiring_30_days: number;
  overdue_invoices: number;
  overdue_amount: number;
};

export type PlatformPlan = {
  id: number;
  plan_code: string;
  display_name: string;
  description?: string;
  lock_in_months: number;
  regular_monthly_amount: number;
  regular_total_amount?: number | null;
  promo_monthly_amount?: number | null;
  promo_total_amount?: number | null;
  promo_label?: string;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  inclusions?: string[] | unknown;
  effective_monthly_amount: number;
  effective_total_amount?: number | null;
  promo_active: boolean;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
};

export type BillingInvoice = {
  id?: number;
  invoice_no?: string;
  period_start?: string;
  period_end?: string;
  amount?: number;
  due_date?: string;
  paid_at?: string | null;
  status?: string;
};

export type BillingPayment = {
  id: number;
  invoice_id: number;
  invoice_no?: string;
  amount: number;
  currency?: string;
  provider?: string;
  provider_payment_id?: string | null;
  paid_at?: string;
  status?: string;
};

export function usePlatformPlansAdmin() {
  return createQuery(() => ({
    queryKey: ["platform-plans-admin"],
    queryFn: async () => {
      const res = await apiFetch<{ plans: PlatformPlan[] }>(
        "/api/v1/platform/console/plans?include_inactive=1",
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load plans");
      return res.data?.plans ?? [];
    },
  }));
}

export function usePlatformPlan(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-plan", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<{ plan: PlatformPlan }>(
        `/api/v1/platform/console/plans/${id()}`,
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load plan");
      return res.data!;
    },
  }));
}

export function usePublicPlans() {
  return createQuery(() => ({
    queryKey: ["platform-plans-public"],
    queryFn: async () => {
      const res = await apiFetch<{ plans: PlatformPlan[] }>("/api/v1/platform/plans");
      if (!res.ok) throw new Error(res.message ?? "Failed to load plans");
      return res.data?.plans ?? [];
    },
  }));
}

export function usePlatformBillingSummary() {
  return createQuery(() => ({
    queryKey: ["platform-billing-summary"],
    queryFn: async () => {
      const res = await apiFetch<PlatformBillingSummary>(
        "/api/v1/platform/console/billing/summary",
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load billing summary");
      return res.data!;
    },
  }));
}

export function usePlatformCustomers(q?: () => string) {
  return createQuery(() => ({
    queryKey: ["platform-customers", q?.() ?? ""],
    queryFn: async () => {
      const search = q?.() ? `?q=${encodeURIComponent(q()!)}` : "";
      const res = await apiFetch<{ customers: PlatformCustomer[] }>(
        `/api/v1/platform/console/customers${search}`,
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load customers");
      return res.data?.customers ?? [];
    },
  }));
}

export function usePlatformCustomer(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-customer", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<{ customer: Record<string, unknown>; subscriptions: unknown[]; invoices: unknown[] }>(
        `/api/v1/platform/console/customers/${id()}`,
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load customer");
      return res.data;
    },
  }));
}

export type OnboardingTrackStep = {
  id: string;
  label: string;
  href: string;
  done: boolean;
  required?: boolean;
  description?: string;
  ack_step?: boolean;
  kb_article_id?: string;
};

export type OnboardingTrack = {
  id: string;
  title: string;
  description: string;
  percent: number;
  steps: OnboardingTrackStep[];
};

export function useOnboarding() {
  return createQuery(() => ({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const res = await apiFetch<{
        steps: { id: string; label: string; href: string; done: boolean; required?: boolean }[];
        tracks?: OnboardingTrack[];
        percent: number;
        overall_percent?: number;
        show_setup_checklist?: boolean;
        show_playbook?: boolean;
        playbook_dismissed?: boolean;
        is_new_user?: boolean;
        dismissed?: boolean;
        required_complete?: boolean;
        ready?: boolean;
        blocking_reason?: string;
        next_step?: { id: string; label: string; href: string };
        next_extended_step?: {
          id: string;
          label: string;
          href: string;
          track_id: string;
          track_title: string;
        };
        meta?: { pos_enabled?: boolean; foundation_required_complete?: boolean };
      }>("/api/v1/platform/onboarding");
      if (!res.ok) throw new Error(res.message ?? "Failed to load onboarding");
      return res.data!;
    },
  }));
}

export type SetupReadiness = {
  percent: number;
  ready: boolean;
  required_complete: boolean;
  steps: { id: string; label: string; href: string; done: boolean; required: boolean }[];
  next_step?: { id: string; label: string; href: string };
  blocking_reason?: string;
  show_setup_banner?: boolean;
  show_breadcrumb_hint?: boolean;
  setup_wizard_skipped?: boolean;
};

export function useSetupReadiness() {
  return createQuery(() => ({
    queryKey: ["setup-readiness"],
    queryFn: async () => {
      const res = await apiFetch<SetupReadiness>("/api/v1/platform/setup-readiness");
      if (!res.ok) throw new Error(res.message ?? "Failed to load setup readiness");
      return res.data!;
    },
  }));
}

export function useBilling() {
  return createQuery(() => ({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await apiFetch<{
        subscription: Record<string, unknown> | null;
        invoices: BillingInvoice[];
        message?: string;
      }>("/api/v1/platform/billing");
      if (!res.ok) throw new Error(res.message ?? "Failed to load billing");
      return res.data!;
    },
  }));
}

export function useBillingPayments() {
  return createQuery(() => ({
    queryKey: ["billing-payments"],
    queryFn: async () => {
      const res = await apiFetch<{ payments: BillingPayment[] }>(
        "/api/v1/platform/billing/payments",
      );
      if (!res.ok) throw new Error(res.message ?? "Failed to load payment history");
      return res.data?.payments ?? [];
    },
  }));
}

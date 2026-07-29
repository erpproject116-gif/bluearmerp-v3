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
  tenant_status?: string | null;
  plan_kind?: string | null;
  subscription_status?: string | null;
  ends_at?: string | null;
  days_remaining?: number;
  crm_lead_id?: number | null;
  likely_misjoin?: boolean;
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

export function usePlatformCustomers(opts?: { q?: () => string; tenantStatus?: () => string }) {
  return createQuery(() => {
    const q = opts?.q?.() ?? "";
    const tenantStatus = opts?.tenantStatus?.() ?? "";
    return {
      queryKey: ["platform-customers", q, tenantStatus],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (tenantStatus) params.set("tenant_status", tenantStatus);
        const search = params.toString() ? `?${params}` : "";
        const res = await apiFetch<{ customers: PlatformCustomer[] }>(
          `/api/v1/platform/console/customers${search}`,
        );
        if (!res.ok) throw new Error(res.message ?? "Failed to load customers");
        return res.data?.customers ?? [];
      },
    };
  });
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

export function usePlatformCommandOverview() {
  return createQuery(() => ({
    queryKey: ["platform-command-overview"],
    queryFn: async () => {
      const res = await apiFetch<{
        counts: {
          open_tickets: number;
          trial_ending: number;
          inactive_trials: number;
          open_follow_ups: number;
          overdue_follow_ups?: number;
          pending_invites: number;
          pending_approvals?: number;
          product_gap_tickets?: number;
          no_docs_trials?: number;
          churn_risk?: number;
        };
        queue: Array<{
          kind: string;
          title: string;
          customer_id?: number;
          tenant_id?: number;
          ref?: string;
          due_at?: string;
          href?: string;
          severity?: string;
        }>;
      }>("/api/v1/platform/console/command");
      if (!res.ok) throw new Error(res.message ?? "Failed to load command overview");
      return res.data!;
    },
  }));
}

export function usePlatformCustomerOverview(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-customer-overview", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<Record<string, any>>(`/api/v1/platform/console/customers/${id()}/overview`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load customer overview");
      return res.data!;
    },
  }));
}

export type CsPlaybookStep = {
  code: string;
  title: string;
  hint: string;
  status: string;
  notes?: string;
  completed_at?: string | null;
};

export function usePlatformCustomerPlaybook(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-customer-playbook", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<{
        percent: number;
        done: number;
        total: number;
        steps: CsPlaybookStep[];
      }>(`/api/v1/platform/console/customers/${id()}/playbook`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load playbook");
      return res.data!;
    },
  }));
}

export type PlatformTicket = {
  id: number;
  tenant_id: number;
  ticket_no: string;
  subject: string;
  status: string;
  priority: string;
  created_at?: string;
  updated_at?: string;
  customer_id?: number | null;
  customer_name?: string;
  company_code?: string;
  tenant_name?: string;
  partner_name?: string;
  description?: string;
  product_gap_tag?: string;
  product_gap_note?: string;
  comments?: Array<{ id: number; user_id?: number | null; author_name: string; body: string; created_at: string }>;
  internal_notes?: Array<{ id: number; author_email: string; author_name: string; body: string; created_at: string }>;
};

export type PlatformTicketsPage = {
  tickets: PlatformTicket[];
  page: number;
  page_size: number;
  total: number;
};

export function usePlatformTickets(opts?: {
  q?: () => string;
  status?: () => string;
  page?: () => number;
  pageSize?: () => number;
}) {
  return createQuery(() => {
    const q = opts?.q?.() ?? "";
    const status = opts?.status?.() ?? "";
    const page = opts?.page?.() ?? 1;
    const pageSize = opts?.pageSize?.() ?? 50;
    return {
      queryKey: ["platform-tickets", q, status, page, pageSize],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (status) params.set("status", status);
        params.set("page", String(page));
        params.set("page_size", String(pageSize));
        const search = `?${params}`;
        const res = await apiFetch<PlatformTicketsPage>(`/api/v1/platform/console/tickets${search}`);
        if (!res.ok) throw new Error(res.message ?? "Failed to load tickets");
        return {
          tickets: res.data?.tickets ?? [],
          page: res.data?.page ?? page,
          page_size: res.data?.page_size ?? pageSize,
          total: res.data?.total ?? 0,
        } satisfies PlatformTicketsPage;
      },
    };
  });
}

export function usePlatformTicket(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-ticket", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<PlatformTicket>(`/api/v1/platform/console/tickets/${id()}`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load ticket");
      return res.data!;
    },
  }));
}

export function usePlatformOnboardingQueue() {
  return createQuery(() => ({
    queryKey: ["platform-onboarding-queue"],
    queryFn: async () => {
      const res = await apiFetch<{ customers: Array<Record<string, any>> }>("/api/v1/platform/console/onboarding");
      if (!res.ok) throw new Error(res.message ?? "Failed to load onboarding queue");
      return res.data?.customers ?? [];
    },
  }));
}

export function usePlatformFollowUps() {
  return createQuery(() => ({
    queryKey: ["platform-follow-ups"],
    queryFn: async () => {
      const res = await apiFetch<{ follow_ups: Array<Record<string, any>> }>("/api/v1/platform/console/follow-ups");
      if (!res.ok) throw new Error(res.message ?? "Failed to load follow-ups");
      return res.data?.follow_ups ?? [];
    },
  }));
}

export function usePlatformAccessLogs(kind?: string) {
  return createQuery(() => ({
    queryKey: ["platform-access-logs", kind ?? "all"],
    queryFn: async () => {
      const path = kind === "change" ? "/api/v1/platform/console/change-logs" : "/api/v1/platform/console/access-logs";
      const res = await apiFetch<{ items: Array<Record<string, any>> }>(path);
      if (!res.ok) throw new Error(res.message ?? "Failed to load access logs");
      return res.data?.items ?? [];
    },
  }));
}

export function usePlatformStaff() {
  return createQuery(() => ({
    queryKey: ["platform-staff"],
    queryFn: async () => {
      const res = await apiFetch<{ staff: Array<Record<string, any>> }>("/api/v1/platform/console/staff");
      if (!res.ok) throw new Error(res.message ?? "Failed to load staff");
      return res.data?.staff ?? [];
    },
  }));
}

export function usePlatformStaffInvites() {
  return createQuery(() => ({
    queryKey: ["platform-staff-invites"],
    queryFn: async () => {
      const res = await apiFetch<{ invites: Array<Record<string, any>> }>("/api/v1/platform/console/staff/invites");
      if (!res.ok) throw new Error(res.message ?? "Failed to load invites");
      return res.data?.invites ?? [];
    },
  }));
}

export type PlatformAnalyticsTotals = {
  sessions: number;
  page_views: number;
  unique_users: number;
  active_seconds: number;
  idle_seconds: number;
  active_now: number;
  abandoned_24h: number;
};

export function usePlatformAnalytics(days: () => number) {
  return createQuery(() => ({
    queryKey: ["platform-analytics", days()],
    queryFn: async () => {
      const res = await apiFetch<{
        days: number;
        totals: PlatformAnalyticsTotals;
        adoption?: {
          active_tenants: number;
          logged_in: number;
          first_sale: number;
          first_gr: number;
          first_or: number;
          days: number;
        };
        trend: Array<{ day: string; sessions: number; page_views: number; active_seconds: number; unique_users: number }>;
        top_pages: Array<{ route_pattern: string; page_label: string; views: number; active_seconds: number }>;
        customers: Array<{
          tenant_id: number;
          company_name: string;
          company_code: string;
          customer_id?: number | null;
          customer_name: string;
          sessions: number;
          unique_users: number;
          page_views: number;
          active_seconds: number;
          idle_seconds: number;
          last_activity_at?: string | null;
        }>;
      }>(`/api/v1/platform/console/analytics?days=${days()}`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load analytics");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export function usePlatformCustomerEngagement(id: () => number | undefined) {
  return createQuery(() => ({
    queryKey: ["platform-customer-engagement", id()],
    enabled: Boolean(id() && id()! > 0),
    queryFn: async () => {
      const res = await apiFetch<{
        tenant_id: number;
        summary: {
          last_login_at?: string | null;
          last_logout_at?: string | null;
          last_activity_at?: string | null;
          last_end_reason?: string | null;
          inactive_seconds?: number | null;
        };
        users: Array<{
          id: number;
          full_name: string;
          email: string;
          last_login_at?: string | null;
          last_logout_at?: string | null;
          last_activity_at?: string | null;
          last_end_reason?: string | null;
          inactive_seconds?: number | null;
        }>;
        sessions: Array<{
          id: number;
          user_id: number;
          user_name: string;
          started_at: string;
          ended_at?: string | null;
          last_activity_at?: string | null;
          active_seconds: number;
          idle_seconds: number;
          page_view_count: number;
          end_reason?: string;
          end_exact?: boolean;
        }>;
      }>(`/api/v1/platform/console/customers/${id()}/engagement`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load engagement");
      return res.data!;
    },
    staleTime: 15_000,
  }));
}

export function usePlatformCustomerSession(customerId: () => number | undefined, sessionId: () => number | null) {
  return createQuery(() => ({
    queryKey: ["platform-customer-session", customerId(), sessionId()],
    enabled: Boolean(customerId() && customerId()! > 0 && sessionId() && sessionId()! > 0),
    queryFn: async () => {
      const res = await apiFetch<{
        session: Record<string, any>;
        pages: Array<{
          id: number;
          seq: number;
          route_path: string;
          route_pattern: string;
          page_label: string;
          entered_at: string;
          exited_at?: string | null;
          active_seconds: number;
          idle_seconds: number;
        }>;
      }>(`/api/v1/platform/console/customers/${customerId()}/sessions/${sessionId()}`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load session");
      return res.data!;
    },
  }));
}

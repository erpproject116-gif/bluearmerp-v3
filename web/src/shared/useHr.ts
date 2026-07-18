import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type Employee = {
  id: number;
  employee_no: string;
  full_name: string;
  department: string;
  department_id?: number | null;
  job_title: string;
  hire_date: string;
  status: string;
  base_salary: number;
  user_id?: number | null;
  email?: string;
  notes?: string | null;
  tin?: string;
  sss_no?: string;
  philhealth_no?: string;
  pagibig_no?: string;
  tax_status?: string;
  bank_name?: string;
  bank_account_no?: string;
};

export type HrDepartment = {
  id: number;
  department_code: string;
  department_name: string;
  status: string;
};

export type PayPeriod = {
  id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  status: string;
};

export type Payslip = {
  id: number;
  pay_period_id: number;
  period_label?: string;
  employee_id: number;
  employee_no?: string;
  employee_name?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: string;
  journal_entry_id?: number | null;
};

export type PayrollRunResult = {
  pay_period_id: number;
  payslip_count: number;
  total_gross: number;
  total_net: number;
  journal_entry_id?: number | null;
};

export function useEmployees(params: () => {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  lifecycle?: string;
}) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    if (p.lifecycle && p.lifecycle !== "active") qs.set("lifecycle", p.lifecycle);
    return {
      queryKey: ["hr-employees", p],
      queryFn: async () => {
        const res = await apiFetch<Employee[]>(`/api/v1/hr/employees?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load employees");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateEmployees() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["hr-employees"] });
}

export function useHrDepartments() {
  return createQuery(() => ({
    queryKey: ["hr-departments"],
    queryFn: async () => {
      const res = await apiFetch<HrDepartment[]>("/api/v1/hr/departments");
      if (!res.success) throw new Error(res.message ?? "Failed to load departments");
      return res.data ?? [];
    },
    staleTime: 30_000,
  }));
}

export async function createHrDepartment(body: { department_name: string; department_code?: string }) {
  return apiFetch<HrDepartment>("/api/v1/hr/departments", { method: "POST", body: JSON.stringify(body) });
}

export function usePayPeriods() {
  return createQuery(() => ({
    queryKey: ["hr-pay-periods"],
    queryFn: async () => {
      const res = await apiFetch<PayPeriod[]>("/api/v1/hr/pay-periods?page=1&pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load pay periods");
      return res.data ?? [];
    },
    staleTime: 15_000,
  }));
}

export function usePayslips(payPeriodId: () => number | null) {
  return createQuery(() => {
    const id = payPeriodId();
    return {
      queryKey: ["hr-payslips", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<Payslip[]>(`/api/v1/hr/payslips?pay_period_id=${id}&page=1&pageSize=200`);
        if (!res.success) throw new Error(res.message ?? "Failed to load payslips");
        return res.data ?? [];
      },
      staleTime: 10_000,
    };
  });
}

export function useInvalidatePayroll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["hr-pay-periods"] });
    qc.invalidateQueries({ queryKey: ["hr-payslips"] });
  };
}

export async function createEmployee(body: Record<string, unknown>) {
  return apiFetch<Employee>("/api/v1/hr/employees", { method: "POST", body: JSON.stringify(body) });
}

export async function patchEmployee(id: number, body: Record<string, unknown>) {
  return apiFetch<Employee>(`/api/v1/hr/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export type PayrollPreviewRow = {
  employee_id: number;
  employee_no: string;
  employee_name: string;
  base_salary: number;
  premium_total: number;
  dtr_days: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
};

export type PayrollPreviewResult = {
  period_start: string;
  period_end: string;
  employee_count: number;
  total_gross: number;
  total_net: number;
  employees: PayrollPreviewRow[];
};

export async function previewPayroll(body: { period_start: string; period_end: string }) {
  return apiFetch<PayrollPreviewResult>("/api/v1/hr/payroll-runs/preview", { method: "POST", body: JSON.stringify(body) });
}

export async function runPayroll(body: { period_start: string; period_end: string; period_label?: string }) {
  return apiFetch<PayrollRunResult>("/api/v1/hr/payroll-runs", { method: "POST", body: JSON.stringify(body) });
}

export async function createPayslipShareLink(payslipId: number) {
  return apiFetch<{ token: string; url_path: string; expires_at: string }>(
    `/api/v1/hr/payslips/${payslipId}/share-link`,
    { method: "POST" },
  );
}

import { apiFetch } from "./api";
import type { SupplierInvoiceDetail } from "./useSupplierInvoiceList";

export async function submitSupplierInvoiceForApproval(id: number, remarks?: string) {
  return apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${id}/submit-for-approval`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks?.trim() || null }),
  });
}

export async function approveSupplierInvoice(id: number, remarks?: string) {
  return apiFetch<SupplierInvoiceDetail>(
    `/api/v1/finance/supplier-invoices/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ remarks: remarks?.trim() || null }),
    },
    { silent: true },
  );
}

export async function rejectSupplierInvoice(id: number, remarks: string) {
  return apiFetch<SupplierInvoiceDetail>(
    `/api/v1/finance/supplier-invoices/${id}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ remarks: remarks.trim() }),
    },
    { silent: true },
  );
}

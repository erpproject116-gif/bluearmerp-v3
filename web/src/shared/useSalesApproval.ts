import { apiFetch } from "./api";
import type { SalesDetail } from "../modules/sales/sales/SalesModal";

export async function submitSaleForApproval(id: number, remarks?: string) {
  return apiFetch<SalesDetail>(`/api/v1/sales/${id}/submit-for-approval`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks?.trim() || null }),
  });
}

export async function approveSale(id: number, remarks?: string) {
  return apiFetch<SalesDetail>(`/api/v1/sales/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks?.trim() || null }),
  }, { silent: true });
}

export async function rejectSale(id: number, remarks: string) {
  return apiFetch<SalesDetail>(`/api/v1/sales/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks.trim() }),
  }, { silent: true });
}

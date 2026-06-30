import { apiFetch } from "./api";
import type { PurchaseRequestDetail } from "../modules/purchase-request/purchase-request/PurchaseRequestModal";

export type PRApprovalRecord = {
  id: number;
  action: string;
  actor_name?: string;
  remarks?: string | null;
  from_status?: string | null;
  to_status: string;
  created_at: string;
};

export async function submitPurchaseRequestForApproval(id: number, remarks?: string) {
  return apiFetch<PurchaseRequestDetail>(`/api/v1/purchase-request/purchase-requests/${id}/submit-for-approval`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks?.trim() || null }),
  });
}

export async function approvePurchaseRequest(id: number, remarks?: string) {
  return apiFetch<PurchaseRequestDetail>(`/api/v1/purchase-request/purchase-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks?.trim() || null }),
  }, { silent: true });
}

export async function rejectPurchaseRequest(id: number, remarks: string) {
  return apiFetch<PurchaseRequestDetail>(`/api/v1/purchase-request/purchase-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ remarks: remarks.trim() }),
  }, { silent: true });
}

export async function fetchPurchaseRequestApprovals(id: number) {
  return apiFetch<PRApprovalRecord[]>(`/api/v1/purchase-request/purchase-requests/${id}/approvals`);
}

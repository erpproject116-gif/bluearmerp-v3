import { Show } from "solid-js";
import { useAuth, hasPermission } from "../../../shared/auth-context";
import { useToast } from "../../../shared/toast";
import { showBlockerResult } from "../../../shared/handleSaveResult";
import {
  approveSupplierInvoice,
  rejectSupplierInvoice,
  submitSupplierInvoiceForApproval,
} from "../../../shared/useSupplierInvoiceApproval";

type Props = {
  supplierInvoiceId: number;
  progressStatus: string;
  compact?: boolean;
  onChanged: () => void;
};

export function SupplierInvoiceApprovalPanel(props: Props) {
  const auth = useAuth();
  const toast = useToast();
  const canApprove = () => hasPermission(auth.me, "finance.supplier_invoices_approve", "write");

  const submit = async () => {
    const res = await submitSupplierInvoiceForApproval(props.supplierInvoiceId);
    if (!res.success) {
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't submit for approval. Try again." });
      return;
    }
    toast.success("Submitted for approval.");
    props.onChanged();
  };

  const approve = async () => {
    const res = await approveSupplierInvoice(props.supplierInvoiceId);
    if (!res.success) {
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't approve. Refresh and try again." });
      return;
    }
    toast.success("Purchase approved.");
    props.onChanged();
  };

  const reject = async () => {
    const remarks = window.prompt("Rejection remarks (required):");
    if (remarks === null) return;
    if (!remarks.trim()) {
      toast.warning("Rejection remarks are required.");
      return;
    }
    const res = await rejectSupplierInvoice(props.supplierInvoiceId, remarks);
    if (!res.success) {
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't reject. Refresh and try again." });
      return;
    }
    toast.success("Purchase rejected.");
    props.onChanged();
  };

  return (
    <div class={props.compact ? "space-y-1" : "col-span-full mt-4 rounded-lg border border-stroke bg-slate-50 p-4"}>
      <Show when={!props.compact}>
        <p class="mb-2 text-sm font-medium text-text-primary">Approval</p>
      </Show>
      <Show when={props.progressStatus === "unconfirmed"}>
        <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700" onClick={() => void submit()}>
          Submit for approval
        </button>
      </Show>
      <Show when={props.progressStatus === "e_approval" && canApprove()}>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700" onClick={() => void approve()}>
            Approve
          </button>
          <button type="button" class="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50" onClick={() => void reject()}>
            Reject
          </button>
        </div>
      </Show>
      <Show when={props.progressStatus === "e_approval" && !canApprove()}>
        <p class="text-sm text-amber-700">Pending approval</p>
      </Show>
    </div>
  );
}

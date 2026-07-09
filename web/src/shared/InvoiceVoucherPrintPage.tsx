import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "./ProtectedRoute";
import { InvoiceDocumentPrintView } from "./InvoiceDocumentPrintView";

function SalesInvoicePrintInner() {
  const params = useParams<{ id: string }>();
  return <InvoiceDocumentPrintView kind="sales" docId={() => Number(params.id)} />;
}

function PurchaseInvoicePrintInner() {
  const params = useParams<{ id: string }>();
  return <InvoiceDocumentPrintView kind="purchase" docId={() => Number(params.id)} />;
}

function PurchaseInvoicePrintByPurchaseIdInner() {
  const params = useParams<{ purchaseId: string }>();
  return <InvoiceDocumentPrintView kind="purchase" docId={() => Number(params.purchaseId)} />;
}

export function SalesInvoicePrintPage() {
  return (
    <ProtectedRoute>
      <SalesInvoicePrintInner />
    </ProtectedRoute>
  );
}

export function PurchaseInvoicePrintPage() {
  return (
    <ProtectedRoute>
      <PurchaseInvoicePrintInner />
    </ProtectedRoute>
  );
}

export function PurchaseInvoiceDocPrintPage() {
  return (
    <ProtectedRoute>
      <PurchaseInvoicePrintByPurchaseIdInner />
    </ProtectedRoute>
  );
}

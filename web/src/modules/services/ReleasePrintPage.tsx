import { createSignal, onMount, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";

export default function ReleasePrintPage() {
  const params = useParams();
  const [slip, setSlip] = createSignal<Record<string, unknown> | null>(null);
  onMount(() => {
    void apiFetch<Record<string, unknown>>(`/api/v1/services/load-slips/${params.id}/print`, {}, { silent: true }).then((res) => {
      if (res.success) setSlip(res.data ?? null);
    });
  });
  return (
    <div class="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <Show when={slip()} fallback={<p>Slip not found.</p>}>
        {(row) => (
          <>
            <h1 class="text-xl font-semibold">Service release {String(row().slip_no ?? "")}</h1>
            <p class="mt-2 text-sm">{String(row().slip_type)} · {String(row().status)} · {String(row().order_date)}</p>
            <p class="mt-4 text-sm">Recipient: {String(row().recipient_name || "____________________")}</p>
            <p class="mt-8 text-sm">Signature: ______________________________</p>
            <button type="button" class="mt-6 rounded border px-3 py-2 text-sm print:hidden" onClick={() => window.print()}>Print</button>
          </>
        )}
      </Show>
    </div>
  );
}

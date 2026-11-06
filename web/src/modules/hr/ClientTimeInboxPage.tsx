import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, HrTcard } from "./HrUi";

type Row = {
  id: number;
  client_name: string;
  site_name: string;
  period_start: string;
  period_end: string;
  status: string;
  file_name: string;
  accepted_hours: number;
};

/** Portal DTR submissions inbox — not the attendance Client DTR matrix. */
export default function ClientTimeInboxPage() {
  const toast = useToast();
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [rows, { refetch }] = createResource(
    async () => (await apiFetch<Row[]>("/api/v1/hr/client-time-inbox")).data ?? [],
  );

  const accept = async (row: Row) => {
    const raw = window.prompt("Accepted hours for this submission?", row.accepted_hours ? String(row.accepted_hours) : "8");
    if (raw == null) return;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0) return toast.warning("Enter a valid hours number.");
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/v1/hr/client-time/${row.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ accepted_hours: hours }),
      });
      if (!res.success) return toast.warning(res.message ?? "Could not accept.");
      toast.success("Submission accepted.");
      void refetch();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <HrLayout>
      <HrPageHead
        title="Client time inbox"
        subtitle="Portal DTR / time file submissions. Accept here before client billing. This is not the attendance Client DTR matrix."
      />
      <HrTcard>
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Site</th>
                <th>Period</th>
                <th>File</th>
                <th>Status</th>
                <th class="num">Hours</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={rows() ?? []}
                fallback={
                  <tr>
                    <td colspan="7">
                      <HrEmpty title="No submissions" hint="When a client uploads time in the portal, it appears here." />
                    </td>
                  </tr>
                }
              >
                {(row) => (
                  <tr>
                    <td class="font-semibold">{row.client_name}</td>
                    <td>{row.site_name}</td>
                    <td>
                      {row.period_start} → {row.period_end}
                    </td>
                    <td>{row.file_name || "—"}</td>
                    <td>
                      <HrBadge tone={row.status === "accepted" ? "success" : row.status === "submitted" ? "warning" : "neutral"}>
                        {row.status}
                      </HrBadge>
                    </td>
                    <td class="num">{row.accepted_hours || "—"}</td>
                    <td>
                      <Show when={row.status === "submitted"}>
                        <button
                          type="button"
                          class="hr-btn hr-btn-sm hr-btn-primary"
                          disabled={busyId() === row.id}
                          onClick={() => void accept(row)}
                        >
                          Accept
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>
    </HrLayout>
  );
}

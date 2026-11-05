import { createResource, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { KanbanBoard, type KanbanColumn } from "../../shared/KanbanBoard";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";

type Person = { assignment_id?: number; employee_id: number; employee_name: string; start_date?: string };
type Site = { id: number; client_name: string; site_name: string; people: Person[] };
type Board = { sites: Site[]; unassigned: Person[] };
type Card = Person & { key: string };

export default function WorkforcePage() {
  const toast = useToast();
  const [board, { refetch }] = createResource(async () => (await apiFetch<Board>("/api/v1/hr/workforce")).data);

  const columns = (): KanbanColumn<Card>[] => {
    const data = board();
    const sites = (data?.sites ?? []).map((site) => ({
      id: String(site.id),
      label: `${site.client_name} · ${site.site_name}`,
      items: (site.people ?? []).map((person) => ({ ...person, key: `a-${person.assignment_id}` })),
    }));
    return [
      ...sites,
      {
        id: "unassigned",
        label: "Not assigned",
        items: (data?.unassigned ?? []).map((person) => ({ ...person, key: `e-${person.employee_id}` })),
      },
    ];
  };

  const move = async (card: Card, _from: string, to: string) => {
    if (to === "unassigned") {
      if (!card.assignment_id) return;
      const res = await apiFetch(`/api/v1/hr/assignments/${card.assignment_id}`, { method: "PATCH", body: JSON.stringify({}) });
      if (!res.success) return toast.warning(res.message ?? "Could not end the assignment.");
      void refetch();
      return;
    }
    const res = await apiFetch("/api/v1/hr/assignments", {
      method: "POST",
      body: JSON.stringify({ employee_id: card.employee_id, site_id: Number(to) }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not move the employee.");
    void refetch();
  };

  return (
    <HrLayout>
      <HrPageHead title="Workforce board" subtitle="Drag a person to a site, or back to Not assigned. That does not change employment." />
      <KanbanBoard columns={columns()} getCardId={(row) => row.key} onDrop={(row, from, to) => void move(row, from, to)} renderCard={(row) => (
        <div>
          <p class="font-medium">{row.employee_name}</p>
          <Show when={row.start_date}><p class="text-xs text-text-secondary">{row.start_date}</p></Show>
        </div>
      )} loading={board.loading} />
    </HrLayout>
  );
}

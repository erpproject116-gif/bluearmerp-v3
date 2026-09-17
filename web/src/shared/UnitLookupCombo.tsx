import { createSignal, type Accessor } from "solid-js";
import { apiFetch } from "./api";
import { LookupCombo, type LookupOption } from "./LookupCombo";
import { useToast } from "./toast";

export type UnitOption = { id: number; code: string; name: string };

export function formatUnitLabel(u: Pick<UnitOption, "code" | "name">): string {
  return u.name && u.name !== u.code ? `${u.code} — ${u.name}` : u.code;
}

export async function fetchUnitOptions(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "30",
    status: "active",
    sort: "code",
    order: "asc",
  });
  if (q.trim()) qs.set("q", q.trim());
  const res = await apiFetch<UnitOption[]>(`/api/v1/inventory/units?${qs}`);
  return (res.data ?? []).map((u) => ({
    id: u.id,
    label: formatUnitLabel(u),
    meta: { code: u.code, name: u.name },
  }));
}

export async function createUnitFromQuery(raw: string): Promise<UnitOption | null> {
  const code = raw.trim().slice(0, 30);
  if (!code) return null;
  const res = await apiFetch<UnitOption>(
    "/api/v1/inventory/units",
    {
      method: "POST",
      body: JSON.stringify({ code, name: code, is_active: true }),
    },
    { silent: true },
  );
  if (!res.success || !res.data) return null;
  return res.data;
}

type Props = {
  label: string;
  /** Unique field key for aria/id when many UoM combos share the same visible label. */
  fieldKey?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  selectedId: Accessor<number | null>;
  value: Accessor<string>;
  onInput: (text: string) => void;
  onSelect: (unit: UnitOption) => void;
  onClear: () => void;
  /** Compact label styling for dense grids (component lines). */
  compact?: boolean;
};

/** Searchable UoM combo with “Add …” to create a custom unit on the fly. */
export function UnitLookupCombo(props: Props) {
  const toast = useToast();
  const [creating, setCreating] = createSignal(false);

  const handleCreate = async (query: string) => {
    // Prefer the code before an em dash (label format "code — name").
    const code = query.split("—")[0]?.trim().slice(0, 30) ?? "";
    if (!code) {
      toast.warning("Type a unit code first (e.g. mm, ft, roll), then choose Add unit.");
      return;
    }
    setCreating(true);
    const created = await createUnitFromQuery(code);
    setCreating(false);
    if (!created) {
      toast.warning("Could not create unit. It may already exist, or you need permission.");
      // Try selecting an existing match by re-fetching.
      const opts = await fetchUnitOptions(code);
      const hit = opts.find((o) => (o.meta?.code as string | undefined)?.toLowerCase() === code.toLowerCase());
      if (hit) {
        props.onSelect({
          id: hit.id,
          code: (hit.meta?.code as string) || code,
          name: (hit.meta?.name as string) || code,
        });
      }
      return;
    }
    toast.success(`Unit “${created.code}” added.`);
    props.onSelect(created);
  };

  return (
    <LookupCombo
      label={props.label}
      fieldKey={props.fieldKey}
      required={props.required}
      placeholder={props.placeholder ?? (creating() ? "Creating…" : "Search or add UoM…")}
      disabled={props.disabled || creating()}
      value={props.value}
      selectedId={props.selectedId}
      onInput={props.onInput}
      onSelect={(o) =>
        props.onSelect({
          id: o.id,
          code: (o.meta?.code as string) || o.label.split("—")[0]?.trim() || o.label,
          name: (o.meta?.name as string) || o.label,
        })
      }
      onClear={props.onClear}
      fetchOptions={fetchUnitOptions}
      onCreate={(q) => void handleCreate(q)}
      createLabel="Add unit"
    />
  );
}

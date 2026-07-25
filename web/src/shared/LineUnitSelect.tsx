import { For, Show, createResource } from "solid-js";
import { apiFetch } from "./api";
import { inputClass } from "./SpreadsheetGrid";
import type { UnitOption } from "./UnitLookupCombo";

let cache: Promise<UnitOption[]> | null = null;

/** Active units for line grids. Cached per page load; the list is small and rarely changes. */
export function loadActiveUnits(): Promise<UnitOption[]> {
  if (!cache) {
    cache = apiFetch<UnitOption[]>("/api/v1/inventory/units?page=1&pageSize=200&status=active&sort=code&order=asc")
      .then((res) => (res.success ? res.data ?? [] : []))
      .catch(() => [] as UnitOption[]);
  }
  return cache;
}

type Props = {
  unitId: number | null | undefined;
  unitCode: string | null | undefined;
  disabled?: boolean;
  onChange: (unit: { unit_id: number | null; unit_code: string }) => void;
};

/**
 * Optional UoM picker for document lines. Falls back to showing whatever code the
 * line already carries so historic free-text units stay visible.
 */
export function LineUnitSelect(props: Props) {
  const [units] = createResource(loadActiveUnits);

  const currentCode = () => (props.unitCode ?? "").trim();
  const isUnlisted = () =>
    !props.unitId && currentCode() !== "" && !(units() ?? []).some((u) => u.code === currentCode());

  return (
    <select
      class={`${inputClass} w-full`}
      disabled={props.disabled}
      value={props.unitId ? String(props.unitId) : isUnlisted() ? `code:${currentCode()}` : ""}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        if (!raw) {
          props.onChange({ unit_id: null, unit_code: "" });
          return;
        }
        if (raw.startsWith("code:")) {
          props.onChange({ unit_id: null, unit_code: raw.slice(5) });
          return;
        }
        const id = Number(raw);
        const hit = (units() ?? []).find((u) => u.id === id);
        props.onChange({ unit_id: id, unit_code: hit?.code ?? "" });
      }}
    >
      <option value="">—</option>
      <Show when={isUnlisted()}>
        <option value={`code:${currentCode()}`}>{currentCode()}</option>
      </Show>
      <For each={units() ?? []}>{(u) => <option value={String(u.id)}>{u.code}</option>}</For>
    </select>
  );
}

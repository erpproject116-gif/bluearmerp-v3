import { For, Show, createEffect, createResource } from "solid-js";
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
 * line already carries so historic free-text units stay visible. When unit_id is set
 * but missing from the active list (inactive / not loaded), keep a synthetic option
 * so the select does not look blank ("—").
 */
export function LineUnitSelect(props: Props) {
  const [units] = createResource(loadActiveUnits);

  const currentCode = () => (props.unitCode ?? "").trim();
  const listedById = () =>
    props.unitId != null && props.unitId > 0
      ? (units() ?? []).find((u) => u.id === props.unitId)
      : undefined;
  const listedByCode = () => {
    const code = currentCode();
    if (!code) return undefined;
    return (units() ?? []).find((u) => u.code.toLowerCase() === code.toLowerCase());
  };
  const isUnlistedCode = () =>
    !props.unitId && currentCode() !== "" && !listedByCode();
  const isOrphanId = () =>
    props.unitId != null && props.unitId > 0 && !listedById() && (units() !== undefined);

  const orphanLabel = () => currentCode() || `unit #${props.unitId}`;
  const selectValue = () => {
    if (props.unitId) return String(props.unitId);
    const byCode = listedByCode();
    if (byCode) return String(byCode.id);
    if (isUnlistedCode()) return `code:${currentCode()}`;
    return "";
  };

  // Persist free-text unit_code as a real unit_id once the master list loads.
  createEffect(() => {
    const list = units();
    if (!list || props.disabled) return;
    if (props.unitId != null && props.unitId > 0) return;
    const byCode = listedByCode();
    if (!byCode) return;
    props.onChange({ unit_id: byCode.id, unit_code: byCode.code });
  });

  return (
    <select
      class={`${inputClass} w-full`}
      disabled={props.disabled}
      value={selectValue()}
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
        props.onChange({
          unit_id: id,
          unit_code: hit?.code ?? (id === props.unitId ? currentCode() : ""),
        });
      }}
    >
      <option value="">—</option>
      <Show when={isUnlistedCode()}>
        <option value={`code:${currentCode()}`}>{currentCode()}</option>
      </Show>
      <Show when={isOrphanId()}>
        <option value={String(props.unitId)}>{orphanLabel()}</option>
      </Show>
      <For each={units() ?? []}>{(u) => <option value={String(u.id)}>{u.code}</option>}</For>
    </select>
  );
}

import { createSignal, For, Show } from "solid-js";
import type { PermissionModuleGroup } from "./usePermissions";
import {
  orderPermissionGroups,
  visibleGroupPermissions,
  type AccessLevel,
  type MatrixValue,
} from "./permissionMatrixView";

export type { AccessLevel, MatrixValue };

type Props = {
  groups: PermissionModuleGroup[];
  values: Record<string, MatrixValue>;
  onChange: (code: string, level: MatrixValue) => void;
  allowInherit?: boolean;
  roleDefaults?: Record<string, AccessLevel>;
  submitFlags?: Record<string, boolean>;
  cancelFlags?: Record<string, boolean>;
  onSubmitChange?: (code: string, enabled: boolean) => void;
  onCancelChange?: (code: string, enabled: boolean) => void;
  loading?: boolean;
  title?: string;
  /** When set, hide modules and features turned off under Apps & features. Hidden codes are not changed. */
  enabledModuleCodes?: string[] | null;
};

export function PermissionMatrix(props: Props) {
  const [query, setQuery] = createSignal("");
  const [filter, setFilter] = createSignal<"all" | "allowed" | "denied">("all");
  const [opened, setOpened] = createSignal<Record<string, boolean>>({});

  const enabled = () => (props.enabledModuleCodes == null ? null : new Set(props.enabledModuleCodes));

  const turnedOffGroups = () => {
    const set = enabled();
    if (set == null) return [];
    return props.groups.filter((g) => !set.has(g.module_code));
  };

  const sections = () => {
    const opts = {
      enabled: enabled(),
      query: query(),
      filter: filter(),
      values: props.values,
    };
    return orderPermissionGroups(props.groups)
      .map((group) => ({ group, rows: visibleGroupPermissions(group, opts) }))
      .filter((section) => section.rows.length > 0);
  };

  const columns = () => {
    if (props.allowInherit) {
      return [
        { key: "inherit" as const, label: "Role", title: "Use role default" },
        { key: "read" as const, label: "Read-only", title: "View only" },
        { key: "write" as const, label: "Read & Write", title: "Create and edit" },
        { key: "deny" as const, label: "D/A", title: "Do not allow" },
      ];
    }
    return [
      { key: "read" as const, label: "Read-only", title: "View only" },
      { key: "write" as const, label: "Read & Write", title: "Create and edit" },
      { key: "deny" as const, label: "D/A", title: "Do not allow" },
    ];
  };

  const showActions = () => props.onSubmitChange != null || props.onCancelChange != null;
  const searching = () => query().trim().length > 0 || filter() !== "all";
  const isOpen = (code: string) => searching() || opened()[code] === true;

  const applyLevel = (codes: string[], level: MatrixValue) => {
    for (const code of codes) props.onChange(code, level);
  };
  const applySubmit = (codes: string[], enabledFlag: boolean) => {
    for (const code of codes) props.onSubmitChange?.(code, enabledFlag);
  };
  const applyCancel = (codes: string[], enabledFlag: boolean) => {
    for (const code of codes) props.onCancelChange?.(code, enabledFlag);
  };

  const jump = (code: string) => {
    setOpened((prev) => ({ ...prev, [code]: true }));
    document.getElementById(`perm-mod-${code}`)?.scrollIntoView({ block: "start" });
  };

  return (
    <Show when={!props.loading} fallback={<p class="text-sm text-text-secondary">Loading permissions…</p>}>
      <p class="mb-3 text-sm text-text-secondary">
        {props.title ??
          "App-wide access for every module and feature. Effective access is the role level unless a per-user override changes it."}
      </p>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          class="min-w-[12rem] flex-1 rounded-lg border border-stroke px-3 py-1.5 text-sm"
          placeholder="Search permissions"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <div class="flex gap-1 text-xs">
          <button type="button" class="rounded-full border border-stroke px-2 py-1" classList={{ "bg-brand-600 text-white": filter() === "all" }} onClick={() => setFilter("all")}>All</button>
          <button type="button" class="rounded-full border border-stroke px-2 py-1" classList={{ "bg-brand-600 text-white": filter() === "allowed" }} onClick={() => setFilter("allowed")}>Allowed</button>
          <button type="button" class="rounded-full border border-stroke px-2 py-1" classList={{ "bg-brand-600 text-white": filter() === "denied" }} onClick={() => setFilter("denied")}>Not allowed</button>
        </div>
      </div>
      <div class="mb-3 flex flex-wrap gap-1.5">
        <For each={sections()}>
          {(section) => (
            <button
              type="button"
              class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
              onClick={() => jump(section.group.module_code)}
            >
              {section.group.module_label || section.group.module_code}
            </button>
          )}
        </For>
      </div>
      <Show when={turnedOffGroups().length > 0}>
        <div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p class="font-medium">Apps turned off for this company (not editable here)</p>
          <p class="mt-1 text-amber-900/90">
            Turn them on under{" "}
            <a href="/app/user-management/tenant-modules" class="font-medium underline hover:no-underline">
              Apps &amp; features
            </a>
            . Existing role permissions are kept but unused while the app is off.
          </p>
          <ul class="mt-2 flex flex-wrap gap-1.5">
            <For each={turnedOffGroups()}>
              {(g) => (
                <li class="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
                  {g.module_label || g.module_code}
                  <span class="ml-1 text-amber-700/80">App off</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <div class="max-h-[min(70vh,560px)] space-y-2 overflow-y-auto">
        <For each={sections()}>
          {(section) => {
            const codes = () => section.rows.map((row) => row.permission_code);
            return (
              <section id={`perm-mod-${section.group.module_code}`} class="rounded-lg border border-stroke">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-left"
                  onClick={() =>
                    setOpened((prev) => ({ ...prev, [section.group.module_code]: !isOpen(section.group.module_code) }))
                  }
                >
                  <span class="text-sm font-semibold text-text-primary">
                    {section.group.module_label || section.group.module_code}
                  </span>
                  <span class="text-xs text-text-secondary">{isOpen(section.group.module_code) ? "Hide" : "Show"}</span>
                </button>
                <Show when={isOpen(section.group.module_code)}>
                  <div class="flex flex-wrap gap-1 border-t border-stroke px-3 py-2 text-xs">
                    <button type="button" class="rounded border border-stroke px-2 py-0.5 hover:bg-slate-50" onClick={() => applyLevel(codes(), "read")}>Read</button>
                    <button type="button" class="rounded border border-stroke px-2 py-0.5 hover:bg-slate-50" onClick={() => applyLevel(codes(), "write")}>Write</button>
                    <button type="button" class="rounded border border-stroke px-2 py-0.5 hover:bg-slate-50" onClick={() => applyLevel(codes(), "deny")}>Deny</button>
                    <Show when={showActions()}>
                      <button type="button" class="rounded border border-stroke px-2 py-0.5 hover:bg-slate-50" onClick={() => applySubmit(codes(), true)}>All submit</button>
                      <button type="button" class="rounded border border-stroke px-2 py-0.5 hover:bg-slate-50" onClick={() => applyCancel(codes(), true)}>All cancel</button>
                    </Show>
                  </div>
                  <table class="w-full text-left text-sm">
                    <thead class="bg-white text-xs uppercase tracking-wide text-text-secondary">
                      <tr>
                        <th class="px-3 py-2 font-semibold">Module / Feature</th>
                        <For each={columns()}>
                          {(col) => <th class="px-2 py-2 text-center font-semibold">{col.label}</th>}
                        </For>
                        <Show when={showActions()}>
                          <th class="px-2 py-2 text-center font-semibold">Submit</th>
                          <th class="px-2 py-2 text-center font-semibold">Cancel</th>
                        </Show>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={section.rows}>
                        {(perm) => {
                          const isModule = !perm.feature_key;
                          const current = () => props.values[perm.permission_code] ?? (props.allowInherit ? "inherit" : "deny");
                          const roleHint = () => props.roleDefaults?.[perm.permission_code];
                          return (
                            <tr classList={{ "border-t border-stroke bg-slate-50/80": isModule, "border-t border-stroke/60": !isModule }}>
                              <td class="px-3 py-2">
                                <div classList={{ "font-semibold text-text-primary": isModule, "pl-4 text-text-primary": !isModule }}>
                                  {perm.label}
                                </div>
                                <Show when={props.allowInherit && roleHint()}>
                                  <div class="pl-4 text-xs text-text-secondary">Role: {roleHint()}</div>
                                </Show>
                              </td>
                              <For each={columns()}>
                                {(col) => (
                                  <td class="px-2 py-2 text-center">
                                    <input
                                      type="radio"
                                      name={`perm-${perm.permission_code}`}
                                      checked={current() === col.key}
                                      title={col.title}
                                      onChange={() => props.onChange(perm.permission_code, col.key)}
                                    />
                                  </td>
                                )}
                              </For>
                              <Show when={showActions()}>
                                <td class="px-2 py-2 text-center">
                                  <Show when={props.onSubmitChange}>
                                    <input
                                      type="checkbox"
                                      checked={props.submitFlags?.[perm.permission_code] ?? false}
                                      title="Allow submit/post actions"
                                      onChange={(e) => props.onSubmitChange?.(perm.permission_code, e.currentTarget.checked)}
                                    />
                                  </Show>
                                </td>
                                <td class="px-2 py-2 text-center">
                                  <Show when={props.onCancelChange}>
                                    <input
                                      type="checkbox"
                                      checked={props.cancelFlags?.[perm.permission_code] ?? false}
                                      title="Allow cancel/undo actions"
                                      onChange={(e) => props.onCancelChange?.(perm.permission_code, e.currentTarget.checked)}
                                    />
                                  </Show>
                                </td>
                              </Show>
                            </tr>
                          );
                        }}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </section>
            );
          }}
        </For>
      </div>
      <p class="mt-2 text-xs text-text-secondary">
        <strong>Read-only</strong> — view lists and details. <strong>Read & Write</strong> — create and edit.{" "}
        <strong>D/A</strong> — do not allow.
        {showActions() ? " Submit — post/confirm/submit actions. Cancel — cancel or undo actions." : null}
        {props.allowInherit ? " Role — inherit from the user’s assigned role (overrides can raise or lower it)." : null}
        {" "}Module Read, Write, and Deny, and All submit / All cancel, apply only to the rows shown in that module.
      </p>
    </Show>
  );
}

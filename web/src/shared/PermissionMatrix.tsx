import { For, Show } from "solid-js";
import type { PermissionModuleGroup } from "./usePermissions";

export type AccessLevel = "deny" | "read" | "write";
export type MatrixValue = AccessLevel | "inherit";

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
  /** When set, hide modules/features turned off under Module & Features (same as sidebar). */
  enabledModuleCodes?: string[] | null;
};

export function PermissionMatrix(props: Props) {
  const visibleGroups = () => {
    const codes = props.enabledModuleCodes;
    if (!codes?.length) return props.groups;
    const set = new Set(codes);
    return props.groups.filter((g) => set.has(g.module_code));
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

  const setModuleLevel = (group: PermissionModuleGroup, level: MatrixValue) => {
    for (const perm of group.permissions) {
      props.onChange(perm.permission_code, level);
    }
  };

  const showActions = () => props.onSubmitChange != null || props.onCancelChange != null;

  return (
    <Show when={!props.loading} fallback={<p class="text-sm text-text-secondary">Loading permissions…</p>}>
      <p class="mb-3 text-sm text-text-secondary">
        {props.title ??
          "App-wide access for every module and feature. Effective access is the highest level from role, groups, and per-user overrides."}
      </p>
      <div class="max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-stroke">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
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
            <For each={visibleGroups()}>
              {(group) => (
                <For each={group.permissions}>
                  {(perm) => {
                    const isModule = !perm.feature_key;
                    const current = () =>
                      props.values[perm.permission_code] ?? (props.allowInherit ? "inherit" : "deny");
                    const roleHint = () => props.roleDefaults?.[perm.permission_code];
                    return (
                      <tr classList={{ "border-t border-stroke bg-slate-50/80": isModule, "border-t border-stroke/60": !isModule }}>
                        <td class="px-3 py-2">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div
                                classList={{
                                  "font-semibold text-text-primary": isModule,
                                  "pl-4 text-text-primary": !isModule,
                                }}
                              >
                                {perm.label}
                              </div>
                              <Show when={props.allowInherit && roleHint()}>
                                <div class="text-xs text-text-secondary pl-4">Role: {roleHint()}</div>
                              </Show>
                            </div>
                            <Show when={isModule}>
                              <div class="flex flex-wrap gap-1 text-xs">
                                <button
                                  type="button"
                                  class="rounded border border-stroke px-2 py-0.5 hover:bg-white"
                                  onClick={() => setModuleLevel(group, "read")}
                                >
                                  All read-only
                                </button>
                                <button
                                  type="button"
                                  class="rounded border border-stroke px-2 py-0.5 hover:bg-white"
                                  onClick={() => setModuleLevel(group, "write")}
                                >
                                  All read & write
                                </button>
                                <button
                                  type="button"
                                  class="rounded border border-stroke px-2 py-0.5 hover:bg-white"
                                  onClick={() => setModuleLevel(group, "deny")}
                                >
                                  All D/A
                                </button>
                              </div>
                            </Show>
                          </div>
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
              )}
            </For>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-text-secondary">
        <strong>Read-only</strong> — view lists and details. <strong>Read & Write</strong> — create and edit.{" "}
        <strong>D/A</strong> — do not allow.
        {showActions() ? " **Submit** — post/confirm/submit actions. **Cancel** — cancel or undo actions." : null}
        {props.allowInherit ? " **Role** — inherit from the user’s assigned role (groups and overrides can raise access)." : null}
      </p>
    </Show>
  );
}

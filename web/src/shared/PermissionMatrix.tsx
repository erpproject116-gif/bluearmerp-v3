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
  loading?: boolean;
};

export function PermissionMatrix(props: Props) {
  const columns = () => {
    if (props.allowInherit) {
      return [
        { key: "inherit" as const, label: "Role", title: "Use role default" },
        { key: "read" as const, label: "Read", title: "View only" },
        { key: "write" as const, label: "Write", title: "Create and edit" },
        { key: "deny" as const, label: "D/A", title: "Do not allow" },
      ];
    }
    return [
      { key: "read" as const, label: "Read", title: "View only" },
      { key: "write" as const, label: "Write", title: "Create and edit" },
      { key: "deny" as const, label: "D/A", title: "Do not allow" },
    ];
  };

  return (
    <Show when={!props.loading} fallback={<p class="text-sm text-text-secondary">Loading permissions…</p>}>
      <div class="max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-stroke">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th class="px-3 py-2 font-semibold">Module / Feature</th>
              <For each={columns()}>
                {(col) => <th class="px-2 py-2 text-center font-semibold">{col.label}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.groups}>
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
        <strong>Read</strong> — view only. <strong>Write</strong> — create and edit. <strong>D/A</strong> — do not allow.
        {props.allowInherit ? " **Role** — inherit from the user’s assigned role." : null}
      </p>
    </Show>
  );
}

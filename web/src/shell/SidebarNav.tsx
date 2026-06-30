import { createSignal, For, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { useAuth } from "../shared/auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "../shared/moduleAccess";
import { ModuleIcon } from "./ModuleIcon";
import { useShell } from "./shell-context";
import {
  appModules,
  type AppModule,
  type ModuleFeature,
} from "./modules";
import {
  navGroups,
  navGroupStorageKey,
  subBranchByFeature,
  belowGroupModuleIds,
  ungroupedModuleIds,
  type NavGroupEntry,
} from "./navGroups";
import { isAnySubBranchPath } from "./sub-branch-nav";

function readExpanded(groupId: string, defaultExpanded: boolean): boolean {
  try {
    const v = localStorage.getItem(navGroupStorageKey(groupId));
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return defaultExpanded;
}

function NavModuleLink(props: { module: AppModule }) {
  const loc = useLocation();
  const shell = useShell();
  const inModule = () => loc.pathname.startsWith(props.module.basePath);
  const inSubBranch = () => isAnySubBranchPath(loc.pathname, props.module.subBranches);
  const moduleActive = () => inModule() && !inSubBranch();
  const moduleExpanded = () => inModule() && inSubBranch();

  return (
    <A
      href={props.module.href}
      title={shell.collapsed() ? props.module.label : undefined}
      class="flex items-center rounded-lg text-sm font-medium transition-colors"
      classList={{
        "justify-center px-2 py-2.5": shell.collapsed(),
        "gap-3 px-3 py-2.5": !shell.collapsed(),
        "bg-brand-50 text-brand-600": moduleActive(),
        "erp-panel text-text-primary": moduleExpanded(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !inModule(),
      }}
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        classList={{
          "bg-brand-100 text-brand-600": moduleActive(),
          "erp-panel-strong text-text-primary": moduleExpanded(),
          "erp-panel text-text-secondary": !inModule(),
        }}
      >
        <ModuleIcon id={props.module.id} />
      </span>
      <Show when={!shell.collapsed()}>
        <span class="truncate">{props.module.label}</span>
      </Show>
    </A>
  );
}

function NavSubBranchLink(props: { module: AppModule; branch: ModuleFeature }) {
  const loc = useLocation();
  const shell = useShell();
  const branchActive = () =>
    props.branch.prefix != null
      ? loc.pathname === props.branch.href ||
        loc.pathname === props.branch.settingsHref ||
        loc.pathname.startsWith(`${props.branch.prefix}/`)
      : loc.pathname === props.branch.href || loc.pathname === props.branch.settingsHref;

  return (
    <A
      href={props.branch.href}
      class="flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      classList={{
        "bg-brand-50 text-brand-600": branchActive(),
        "text-text-secondary hover:erp-panel hover:text-text-primary": !branchActive(),
      }}
    >
      <Show when={!shell.collapsed()}>
        <span class="truncate">{props.branch.label}</span>
      </Show>
    </A>
  );
}

function NavGroupBlock(props: {
  groupId: string;
  label: string;
  defaultExpanded: boolean;
  entries: NavGroupEntry[];
}) {
  const auth = useAuth();
  const shell = useShell();
  const [open, setOpen] = createSignal(readExpanded(props.groupId, props.defaultExpanded));

  const visibleEntries = () =>
    props.entries.filter((entry) => {
      if (entry.kind === "module") {
        return isTenantModuleEnabled(auth.me, entry.moduleId);
      }
      return isTenantFeatureEnabled(auth.me, entry.featureCode, entry.moduleId);
    });

  const toggle = () => {
    const next = !open();
    setOpen(next);
    try {
      localStorage.setItem(navGroupStorageKey(props.groupId), next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <Show when={visibleEntries().length > 0}>
      <div class="space-y-0.5">
        <Show
          when={!shell.collapsed()}
          fallback={
            <For each={visibleEntries()}>
              {(entry) => {
                const mod = () => appModules.find((m) => m.id === entry.moduleId);
                return (
                  <Show when={mod()}>
                    {(m) =>
                      entry.kind === "module" ? (
                        <NavModuleLink module={m()} />
                      ) : (
                        <Show when={subBranchByFeature(m(), entry.featureCode)}>
                          {(branch) => <NavSubBranchLink module={m()} branch={branch()} />}
                        </Show>
                      )
                    }
                  </Show>
                );
              }}
            </For>
          }
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-slate-50"
            onClick={toggle}
          >
            <span
              class="text-[10px] transition-transform"
              classList={{ "rotate-90": open() }}
              aria-hidden="true"
            >
              ▶
            </span>
            <span class="truncate">{props.label}</span>
          </button>
          <Show when={open()}>
            <div class="ml-2 space-y-0.5 border-l border-stroke pl-2">
              <For each={visibleEntries()}>
                {(entry) => {
                  const mod = () => appModules.find((m) => m.id === entry.moduleId);
                  return (
                    <Show when={mod()}>
                      {(m) =>
                        entry.kind === "module" ? (
                          <NavModuleLink module={m()} />
                        ) : (
                          <Show when={subBranchByFeature(m(), entry.featureCode)}>
                            {(branch) => <NavSubBranchLink module={m()} branch={branch()} />}
                          </Show>
                        )
                      }
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

export function SidebarNav() {
  const auth = useAuth();

  const ungrouped = () =>
    ungroupedModuleIds
      .map((id) => appModules.find((m) => m.id === id))
      .filter((m): m is AppModule => !!m && isTenantModuleEnabled(auth.me, m.id));

  const belowGroup = () =>
    belowGroupModuleIds
      .map((id) => appModules.find((m) => m.id === id))
      .filter((m): m is AppModule => !!m && isTenantModuleEnabled(auth.me, m.id));

  return (
    <nav class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
      <For each={ungrouped()}>{(module) => <NavModuleLink module={module} />}</For>

      <For each={navGroups}>
        {(group) => (
          <NavGroupBlock
            groupId={group.id}
            label={group.label}
            defaultExpanded={group.defaultExpanded}
            entries={group.entries}
          />
        )}
      </For>

      <For each={belowGroup()}>{(module) => <NavModuleLink module={module} />}</For>
    </nav>
  );
}

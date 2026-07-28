import { A, useLocation, useNavigate } from "@solidjs/router";
import { For } from "solid-js";
import {
  ECOUNT_TOP_MODULES,
  resolveEcountTopFromPath,
  writeStoredEcountTop,
  type EcountTopId,
} from "./ecount-top-nav";

export function EcountModuleStrip() {
  const loc = useLocation();
  const navigate = useNavigate();
  const active = () => resolveEcountTopFromPath(loc.pathname);

  const select = (id: EcountTopId, href: string) => {
    writeStoredEcountTop(id);
    navigate(href);
  };

  return (
    <div class="mb-3 flex flex-wrap items-center gap-1 border-b border-stroke pb-2">
      <A
        href="/app/dashboard/site-map"
        class="mr-2 rounded-md border border-stroke px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-brand-50 hover:text-brand-700"
        title="Search all programs"
      >
        Site Map
      </A>
      <For each={ECOUNT_TOP_MODULES}>
        {(mod) => (
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-semibold transition"
            classList={{
              "bg-brand-600 text-white shadow-sm": active() === mod.id,
              "text-text-secondary hover:bg-brand-50 hover:text-brand-700": active() !== mod.id,
            }}
            title={mod.hint}
            onClick={() => select(mod.id, mod.href)}
          >
            {mod.label}
          </button>
        )}
      </For>
    </div>
  );
}

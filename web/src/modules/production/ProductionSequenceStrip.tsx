import { A, useLocation, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";

/** Compact Production walkthrough — same sequence as the manufacturing Guide. */
const STEPS = [
  { id: "recipe", short: "1. Recipe", href: "/app/production/boms" },
  { id: "job", short: "2. Job", href: "/app/production/work-orders" },
  { id: "release", short: "3. Release", href: "/app/production/work-orders?status=draft" },
  { id: "floor", short: "4. Issue / Weigh", href: "/app/production/work-orders?status=released" },
  { id: "complete", short: "5. Complete", href: "/app/production/work-orders?status=released" },
  { id: "pack", short: "6. Pack", href: "/app/inventory/serial-lot/pack-station" },
] as const;

function matchStep(id: string, pathname: string, status: string): boolean {
  if (id === "recipe") return pathname.startsWith("/app/production/boms");
  if (id === "floor") {
    return (
      pathname.startsWith("/app/production/issue-station") ||
      pathname.startsWith("/app/production/receive-station") ||
      pathname.startsWith("/app/production/weigh-parts")
    );
  }
  if (id === "pack") return pathname.startsWith("/app/inventory/serial-lot/pack-station");
  if (id === "release") return pathname.startsWith("/app/production/work-orders") && status === "draft";
  if (id === "complete") return pathname.startsWith("/app/production/work-orders") && status === "released";
  if (id === "job") {
    return (
      (pathname === "/app/production" ||
        pathname === "/app/production/" ||
        pathname.startsWith("/app/production/work-orders")) &&
      !status
    );
  }
  return false;
}

export function ProductionSequenceStrip() {
  const loc = useLocation();
  const [params] = useSearchParams();
  const status = () => String(params.status ?? "").toLowerCase();

  const activeId = createMemo(() => {
    const p = loc.pathname;
    const st = status();
    // Prefer floor stations, then status-filtered Jobs views.
    for (const id of ["floor", "pack", "recipe", "release", "complete", "job"] as const) {
      if (matchStep(id, p, st)) return id;
    }
    return null;
  });

  return (
    <nav
      class="mb-4 overflow-x-auto rounded-xl border border-stroke bg-surface px-3 py-2.5"
      aria-label="Production sequence"
    >
      <p class="mb-2 text-xs text-text-secondary">
        Follow the job: recipe → create → release → issue / weigh on the job row → complete → pack.
      </p>
      <ol class="flex min-w-max flex-wrap items-center gap-1.5">
        <For each={[...STEPS]}>
          {(step, i) => (
            <>
              <li>
                <A
                  href={step.href}
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition"
                  classList={{
                    "bg-brand-600 text-white": activeId() === step.id,
                    "bg-panel-strong text-text-secondary hover:bg-brand-50 hover:text-brand-700": activeId() !== step.id,
                  }}
                  aria-current={activeId() === step.id ? "step" : undefined}
                >
                  {step.short}
                </A>
              </li>
              <Show when={i() < STEPS.length - 1}>
                <li aria-hidden="true" class="px-0.5 text-xs text-text-secondary">
                  →
                </li>
              </Show>
            </>
          )}
        </For>
      </ol>
    </nav>
  );
}

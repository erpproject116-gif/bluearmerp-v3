import { A } from "@solidjs/router";
import { For } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { ProductionLayout } from "./ProductionLayout";

const featureLinks = [
  { label: "Bills of materials", href: "/app/production/boms", desc: "Define components and yields for finished goods." },
  { label: "Work orders", href: "/app/production/work-orders", desc: "Create, release, and complete shop-floor work." },
  { label: "Issue station", href: "/app/production/issue-station", desc: "Issue component serials or lots to a released work order." },
  { label: "Receive station", href: "/app/production/receive-station", desc: "Stage finished-good serials or lots before completion." },
  { label: "Reports", href: "/app/production/reports", desc: "Work order status, progress, and stock movements." },
];

export default function ProductionWorkspacePage() {
  const auth = useAuth();

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <h1 class="text-lg font-semibold text-text-primary">Production</h1>
          <p class="mt-1 text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
          <p class="mt-1 text-sm text-text-secondary">
            Plan builds from BOMs, run work orders on the shop floor, and track material issue and finished-goods receipt.
          </p>
        </section>

        <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <For each={featureLinks}>
            {(link) => (
              <A
                href={link.href}
                class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <h2 class="font-semibold text-text-primary">{link.label}</h2>
                <p class="mt-2 text-sm text-text-secondary">{link.desc}</p>
              </A>
            )}
          </For>
        </section>
      </div>
    </ProductionLayout>
  );
}

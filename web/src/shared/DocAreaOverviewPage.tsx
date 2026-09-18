import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "./auth-context";

export type DocAreaAction = {
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
};

export type DocAreaLink = {
  label: string;
  href: string;
};

export type DocAreaOverviewConfig = {
  title: string;
  description: string;
  actions: DocAreaAction[];
  links?: DocAreaLink[];
};

/** Lightweight landing for Quotation / SO / RFQ / PR / PO / Expense overviews. */
export default function DocAreaOverviewPage(props: { config: DocAreaOverviewConfig }) {
  const auth = useAuth();
  const cfg = () => props.config;

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{cfg().title}</h1>
        <p class="mt-1 text-sm text-text-secondary">{cfg().description}</p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={cfg().actions}>
          {(action) => (
            <A
              href={action.href}
              class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">{action.eyebrow}</p>
              <h2 class="mt-1 text-lg font-semibold text-text-primary">{action.title}</h2>
              <p class="mt-2 text-sm text-text-secondary">{action.blurb}</p>
            </A>
          )}
        </For>
      </section>

      <Show when={(cfg().links?.length ?? 0) > 0}>
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <h3 class="mb-4 text-sm font-semibold text-text-primary">Jump to</h3>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <For each={cfg().links ?? []}>
              {(link) => (
                <li>
                  <A href={link.href} class="text-sm font-medium text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}

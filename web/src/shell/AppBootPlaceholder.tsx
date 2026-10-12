/** Static stand-in painted while /auth/me is still in flight, so the shell is not blank. */
export function AppBootPlaceholder() {
  const path = window.location.pathname;
  if (path === "/app/production" || path === "/app/production/") {
    return (
      <div class="space-y-5" aria-busy="true">
        <header>
          <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Manufacturing</h1>
          <p class="mt-1 text-sm text-text-secondary">Pick a type to start. Stock moves only when you post.</p>
        </header>
        <div class="grid gap-3 sm:grid-cols-3">
          <PlaceholderCard label="In progress" hint="Started jobs" />
          <PlaceholderCard label="Completed today" hint="— units" />
          <PlaceholderCard label="Shortages" hint="Open jobs short on materials" />
        </div>
        <section>
          <h2 class="mb-2 text-sm font-semibold text-text-primary">New order</h2>
          <div class="grid gap-3 md:grid-cols-3">
            <TypeCard title="Assembly" color="border-blue-200 bg-blue-50" badge="bg-blue-600" description="Many parts → one finished product" example="CPU + RAM + SSD → PC" />
            <TypeCard title="Cutting" color="border-emerald-200 bg-emerald-50" badge="bg-emerald-600" description="One whole → multiple cuts" example="Whole pork → Belly, Kasim, Ribs" />
            <TypeCard title="Recipe" color="border-orange-200 bg-orange-50" badge="bg-orange-500" description="Ingredients → finished product" example="Pork + spices → Tocino" />
          </div>
        </section>
      </div>
    );
  }
  return (
    <div class="space-y-5" aria-busy="true">
      <div class="h-8 w-48 rounded bg-slate-100" />
      <div class="h-40 rounded-xl border border-stroke bg-white" />
    </div>
  );
}

function PlaceholderCard(props: { label: string; hint: string }) {
  return (
    <div class="rounded-xl border border-stroke bg-white px-4 py-3 shadow-sm">
      <p class="text-xs font-medium text-text-secondary">{props.label}</p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-text-primary">—</p>
      <p class="mt-0.5 text-[11px] text-text-secondary">{props.hint}</p>
    </div>
  );
}

function TypeCard(props: { title: string; color: string; badge: string; description: string; example: string }) {
  return (
    <div class={`rounded-xl border p-4 text-left ${props.color}`}>
      <span class={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${props.badge}`}>
        {props.title}
      </span>
      <p class="mt-2 text-sm font-medium text-text-primary">{props.description}</p>
      <p class="mt-1 text-xs text-text-secondary">{props.example}</p>
    </div>
  );
}

import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { DecimalInput } from "../../shared/DecimalInput";
import { parseNum } from "../../shared/money";
import { usePlatformPlan } from "../../shared/usePlatform";

function parseInclusions(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatInclusions(arr: unknown): string {
  if (Array.isArray(arr)) return arr.map(String).join("\n");
  return "";
}

export default function PlatformPlanEditPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = () => params.id === "new";
  const planId = () => (isNew() ? undefined : Number(params.id));
  const q = usePlatformPlan(planId);

  const [planCode, setPlanCode] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [lockInMonths, setLockInMonths] = createSignal(0);
  const [regularMonthly, setRegularMonthly] = createSignal(0);
  const [regularTotal, setRegularTotal] = createSignal<number | "">("");
  const [promoMonthly, setPromoMonthly] = createSignal<number | "">("");
  const [promoTotal, setPromoTotal] = createSignal<number | "">("");
  const [promoLabel, setPromoLabel] = createSignal("");
  const [promoStarts, setPromoStarts] = createSignal("");
  const [promoEnds, setPromoEnds] = createSignal("");
  const [inclusions, setInclusions] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [isPublic, setIsPublic] = createSignal(true);
  const [sortOrder, setSortOrder] = createSignal(50);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const p = q.data?.plan;
    if (!p || isNew()) return;
    setPlanCode(String(p.plan_code));
    setDisplayName(String(p.display_name));
    setDescription(String(p.description ?? ""));
    setLockInMonths(Number(p.lock_in_months ?? 0));
    setRegularMonthly(Number(p.regular_monthly_amount ?? 0));
    setRegularTotal(p.regular_total_amount != null ? Number(p.regular_total_amount) : "");
    setPromoMonthly(p.promo_monthly_amount != null ? Number(p.promo_monthly_amount) : "");
    setPromoTotal(p.promo_total_amount != null ? Number(p.promo_total_amount) : "");
    setPromoLabel(String(p.promo_label ?? ""));
    setPromoStarts(p.promo_starts_at ? String(p.promo_starts_at).slice(0, 10) : "");
    setPromoEnds(p.promo_ends_at ? String(p.promo_ends_at).slice(0, 10) : "");
    setInclusions(formatInclusions(p.inclusions));
    setIsActive(Boolean(p.is_active));
    setIsPublic(Boolean(p.is_public));
    setSortOrder(Number(p.sort_order ?? 0));
  });

  const save = async () => {
    setError(null);
    setSaving(true);
    const body = {
      plan_code: planCode().trim(),
      display_name: displayName().trim(),
      description: description().trim(),
      lock_in_months: lockInMonths(),
      regular_monthly_amount: regularMonthly(),
      regular_total_amount: regularTotal() === "" ? null : Number(regularTotal()),
      promo_monthly_amount: promoMonthly() === "" ? null : Number(promoMonthly()),
      promo_total_amount: promoTotal() === "" ? null : Number(promoTotal()),
      promo_label: promoLabel().trim(),
      promo_starts_at: promoStarts() || null,
      promo_ends_at: promoEnds() || null,
      inclusions: parseInclusions(inclusions()),
      is_trial: false,
      is_demo: false,
      is_active: isActive(),
      is_public: isPublic(),
      sort_order: sortOrder(),
    };
    const path = isNew()
      ? "/api/v1/platform/console/plans"
      : `/api/v1/platform/console/plans/${planId()}`;
    const res = await apiFetch<{ id?: number }>(path, {
      method: isNew() ? "POST" : "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message ?? "Save failed.");
      return;
    }
    navigate("/app/platform-command/plans", { replace: true });
  };

  return (
    <div class="mx-auto max-w-2xl p-6">
      <h1 class="text-xl font-semibold">{isNew() ? "New subscription plan" : "Edit plan"}</h1>
      <p class="mt-1 text-sm text-text-secondary">
        Set regular pricing, optional promo window, and package inclusions (one bullet per line).
      </p>

      <div class="mt-6 space-y-4">
        <Show when={isNew()}>
          <label class="block text-sm">
            <span class="font-medium">Plan code</span>
            <input
              class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={planCode()}
              onInput={(e) => setPlanCode(e.currentTarget.value)}
              placeholder="e.g. standard_6mo"
            />
          </label>
        </Show>

        <label class="block text-sm">
          <span class="font-medium">Display name</span>
          <input
            class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
            value={displayName()}
            onInput={(e) => setDisplayName(e.currentTarget.value)}
          />
        </label>

        <label class="block text-sm">
          <span class="font-medium">Description</span>
          <textarea
            class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
            rows={2}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block text-sm">
            <span class="font-medium">Lock-in (months)</span>
            <DecimalInput
              mode="integer"
              class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={String(lockInMonths())}
              onValue={(v) => setLockInMonths(parseNum(v))}
            />
          </label>
          <label class="block text-sm">
            <span class="font-medium">Sort order</span>
            <DecimalInput
              mode="integer"
              class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={String(sortOrder())}
              onValue={(v) => setSortOrder(parseNum(v))}
            />
          </label>
        </div>

        <fieldset class="rounded-xl border border-stroke p-4">
          <legend class="px-1 text-sm font-semibold">Regular pricing</legend>
          <div class="mt-2 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm">
              <span>Monthly (₱)</span>
              <DecimalInput
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={String(regularMonthly())}
                onValue={(v) => setRegularMonthly(parseNum(v))}
              />
            </label>
            <label class="block text-sm">
              <span>Total contract (₱)</span>
              <DecimalInput
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={regularTotal() === "" ? "" : String(regularTotal())}
                onValue={(v) => setRegularTotal(v === "" ? "" : parseNum(v))}
              />
            </label>
          </div>
        </fieldset>

        <fieldset class="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <legend class="px-1 text-sm font-semibold">Promo / discount (optional)</legend>
          <label class="mt-2 block text-sm">
            <span>Promo label</span>
            <input
              class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={promoLabel()}
              onInput={(e) => setPromoLabel(e.currentTarget.value)}
              placeholder="e.g. Launch promo — 10% off"
            />
          </label>
          <div class="mt-3 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm">
              <span>Promo monthly (₱)</span>
              <DecimalInput
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={promoMonthly() === "" ? "" : String(promoMonthly())}
                onValue={(v) => setPromoMonthly(v === "" ? "" : parseNum(v))}
              />
            </label>
            <label class="block text-sm">
              <span>Promo total contract (₱)</span>
              <DecimalInput
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={promoTotal() === "" ? "" : String(promoTotal())}
                onValue={(v) => setPromoTotal(v === "" ? "" : parseNum(v))}
              />
            </label>
            <label class="block text-sm">
              <span>Starts</span>
              <input
                type="date"
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={promoStarts()}
                onInput={(e) => setPromoStarts(e.currentTarget.value)}
              />
            </label>
            <label class="block text-sm">
              <span>Ends</span>
              <input
                type="date"
                class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={promoEnds()}
                onInput={(e) => setPromoEnds(e.currentTarget.value)}
              />
            </label>
          </div>
        </fieldset>

        <label class="block text-sm">
          <span class="font-medium">Package inclusions (one per line)</span>
          <textarea
            class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 font-mono text-sm"
            rows={6}
            value={inclusions()}
            onInput={(e) => setInclusions(e.currentTarget.value)}
            placeholder={"Full ERP modules\nEmail support\n6-month minimum term"}
          />
        </label>

        <div class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
            Active (can be sold)
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
            Show on tenant billing page
          </label>
        </div>

        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>

        <div class="flex gap-2 pt-2">
          <button
            type="button"
            disabled={saving()}
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void save()}
          >
            {saving() ? "Saving…" : "Save plan"}
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm"
            onClick={() => navigate("/app/platform-command/plans")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

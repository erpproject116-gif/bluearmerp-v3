import { useNavigate } from "@solidjs/router";
import { A } from "@solidjs/router";

export default function ThankYouActivatedPage() {
  const navigate = useNavigate();

  return (
    <div class="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-12">
      <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">Activated</p>
      <h1 class="mt-2 text-2xl font-semibold text-text-primary">Thank you — you’re ready to trade</h1>
      <p class="mt-3 text-sm text-text-secondary">
        Your Day 1 payment was confirmed. You can now create purchase orders, receive goods, sell, and take payments.
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => navigate("/app/inventory", { replace: true })}
        >
          Go to Stocks
        </button>
        <A
          href="/app/dashboard"
          class="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-slate-50"
        >
          Dashboard
        </A>
        <button
          type="button"
          class="rounded-lg px-4 py-2.5 text-sm text-text-secondary hover:underline"
          onClick={() => navigate("/app/sales/sales", { replace: true })}
        >
          Start selling
        </button>
      </div>
    </div>
  );
}

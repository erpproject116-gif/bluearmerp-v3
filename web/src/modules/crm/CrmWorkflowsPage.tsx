import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { hasPermission, useAuth } from "../../shared/auth-context";

/** Path B Phase 1: CRM entry to Workflows engine (deep-link) + honest tier map. Not a GHL canvas. */
export default function CrmWorkflowsPage() {
  const auth = useAuth();
  const canRead = () => hasPermission(auth.me, "platform.workflows", "read") || hasPermission(auth.me, "platform.workflows", "write");
  const engineURL = () => (import.meta.env.VITE_WORKFLOWS_ENGINE_URL as string | undefined)?.trim() || "";

  return (
    <div class="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-text-primary">CRM Workflows</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Create and run multi-step CRM recipes on Bluearm’s operated Activepieces instance (Path B). This is{" "}
          <strong class="font-medium text-text-primary">not</strong> GoHighLevel, Make, or n8n parity — and not a second
          CRM.
        </p>
      </div>

      <Show
        when={canRead()}
        fallback={
          <p class="rounded-lg border border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
            You do not have permission to open CRM Workflows (`platform.workflows`).
          </p>
        }
      >
        <section class="space-y-2 rounded-xl border border-stroke bg-white p-4 text-sm">
          <h3 class="font-semibold text-text-primary">Three tiers (pick one per job)</h3>
          <ul class="list-disc space-y-1 pl-5 text-text-secondary">
            <li>
              <strong class="text-text-primary">Lite rules</strong> — Project Management →{" "}
              <A href="/app/operations/automation" class="text-brand-600 hover:underline">
                Automation
              </A>{" "}
              (`wm_automation_rules`: notify / log / email / set status).
            </li>
            <li>
              <strong class="text-text-primary">CRM Workflows</strong> — this page → Activepieces (named recipes R1–R3).
            </li>
            <li>
              <strong class="text-text-primary">BYO</strong> — User Management →{" "}
              <A href="/app/user-management/outbound-webhook" class="text-brand-600 hover:underline">
                Outbound webhooks
              </A>{" "}
              to your own Make/Zapier/n8n Cloud URL.
            </li>
          </ul>
        </section>

        <section class="space-y-2 rounded-xl border border-stroke bg-white p-4 text-sm">
          <h3 class="font-semibold text-text-primary">Named recipes (MVP)</h3>
          <ol class="list-decimal space-y-1 pl-5 text-text-secondary">
            <li>R1 — `booking.created` → Slack (or HTTP notify)</li>
            <li>R2 — `booking.created` → Bluearm follow-up via `crm.create_follow_up` (idempotent)</li>
            <li>R3 — `crm.alert.created` → external notify</li>
          </ol>
          <p class="text-xs text-text-secondary">
            Baiko may help you draft a recipe checklist; a human publishes in Activepieces. Qwen does not run on ERP
            events unattended.
          </p>
        </section>

        <Show
          when={!!engineURL()}
          fallback={
            <div class="rounded-xl border border-dashed border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
              <p class="font-medium text-text-primary">Engine URL not configured</p>
              <p class="mt-1">
                Operator must complete AEL-2 smoke (`docs/plans/workflows-step2-smoke.md`), host Activepieces, then set{" "}
                <code class="rounded bg-white px-1">VITE_WORKFLOWS_ENGINE_URL</code>. Until then use Outbound webhooks
                (BYO) or lite Automation rules.
              </p>
            </div>
          }
        >
          <a
            href={engineURL()}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open Workflows engine
          </a>
          <p class="text-xs text-text-secondary">Opens the Bluearm-operated Activepieces UI (Phase 1 deep-link).</p>
        </Show>
      </Show>
    </div>
  );
}

import { createSignal, For, Show, onMount } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import {
  crmNotificationHref,
  crmNotificationRelativeTime,
  crmNotificationSourceLabel,
} from "../../shared/crmNotificationRoutes";
import {
  markAllCrmNotificationsRead,
  markCrmNotificationRead,
  useCrmNotifications,
  useInvalidateCrmNotifications,
  type CrmNotification,
  type CrmNotificationSource,
} from "../../shared/useCrmNotifications";
import { useToast } from "../../shared/toast";
import { canManageCrmRules, useAuth } from "../../shared/auth-context";
import { CrmLayout } from "./CrmLayout";
import { LoadingText } from "../../shared/LoadingText";

const severityClass: Record<CrmNotification["severity"], string> = {
  info: "border-l-brand-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

type SourceFilter = "" | CrmNotificationSource;

const SOURCE_CHIPS: { value: SourceFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "rule", label: "Alerts" },
  { value: "support", label: "Support" },
  { value: "chat", label: "Chat" },
  { value: "activity", label: "Activity" },
];

export default function CrmNotificationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const [page, setPage] = createSignal(1);
  const [unreadOnly, setUnreadOnly] = createSignal(false);
  const [source, setSource] = createSignal<SourceFilter>("");
  const pageSize = 25;
  const toast = useToast();
  const invalidate = useInvalidateCrmNotifications();

  onMount(() => {
    const raw = searchParams.unread;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === "1" || v === "true") {
      setUnreadOnly(true);
    }
  });

  const list = useCrmNotifications(() => ({
    page: page(),
    pageSize,
    unreadOnly: unreadOnly(),
    source: source(),
    excludeActivityInfo: source() !== "activity",
  }));

  const totalPages = () => Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  const markRead = async (n: CrmNotification) => {
    if (n.read_at) return true;
    const res = await markCrmNotificationRead(n.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark as read.");
      return false;
    }
    invalidate();
    return true;
  };

  const markAll = async () => {
    const res = await markAllCrmNotificationsRead();
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark all as read.");
      return;
    }
    invalidate();
  };

  const openNotification = async (n: CrmNotification) => {
    const ok = await markRead(n);
    if (!ok) return;
    navigate(crmNotificationHref(n));
  };

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-secondary">
          Inbox for alerts, support, and high-value activity. Routine activity info is hidden unless you filter Activity.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={unreadOnly()}
              onChange={(e) => {
                setUnreadOnly(e.currentTarget.checked);
                setPage(1);
              }}
            />
            Unread only
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
            onClick={() => void markAll()}
          >
            Mark all read
          </button>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <For each={SOURCE_CHIPS}>
          {(chip) => (
            <button
              type="button"
              class="rounded-lg border px-3 py-1 text-xs font-medium transition"
              classList={{
                "border-brand-600 bg-brand-50 text-brand-700": source() === chip.value,
                "border-stroke text-text-secondary hover:bg-slate-50": source() !== chip.value,
              }}
              onClick={() => {
                setSource(chip.value);
                setPage(1);
              }}
            >
              {chip.label}
            </button>
          )}
        </For>
      </div>

      <div class="space-y-2">
        <Show when={list.isFetching}>
          <LoadingText class="text-sm text-text-secondary" as="p" />
        </Show>
        <Show when={!list.isFetching && (list.data?.rows.length ?? 0) === 0}>
          <div class="rounded-xl border border-stroke bg-white p-8 text-center text-sm text-text-secondary">
            <p>No notifications.</p>
            <Show when={canManageCrmRules(auth.me)}>
              <p class="mt-2">
                Configure when alerts are generated in{" "}
                <A href="/app/crm/settings/alert-rules" class="font-medium text-brand-600 hover:underline">
                  Alert Rules
                </A>
                .
              </p>
            </Show>
          </div>
        </Show>
        <For each={list.data?.rows ?? []}>
          {(n) => (
            <button
              type="button"
              class={`w-full rounded-xl border border-stroke border-l-4 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 ${severityClass[n.severity]}`}
              classList={{ "opacity-70": Boolean(n.read_at) }}
              onClick={() => void openNotification(n)}
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-medium text-text-primary">{n.title}</h3>
                    <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                      {crmNotificationSourceLabel(n.source)}
                    </span>
                  </div>
                  <Show when={n.body}>
                    <p class="mt-1 text-sm text-text-secondary">{n.body}</p>
                  </Show>
                  <p class="mt-2 text-xs text-text-secondary">
                    {crmNotificationRelativeTime(n.created_at)}
                    <span class="mx-1.5 text-stroke">·</span>
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                <Show when={!n.read_at}>
                  <span class="rounded-lg bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">Unread</span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2 text-sm">
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={page() <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Prev
        </button>
        <span>
          Page {page()} / {totalPages()}
        </span>
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={page() >= totalPages()}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </CrmLayout>
  );
}

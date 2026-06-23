import { createSignal, For, Show } from "solid-js";
import { presenceActivityLabel } from "./presenceLabels";
import { useAuth } from "./auth-context";
import { UserAvatar } from "./UserAvatar";
import { useOnlinePresence, type PresenceUser } from "./usePresence";

const MAX_STACK = 4;

function formatSeen(iso: string): string {
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 15) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

function activitySummary(user: PresenceUser): string {
  const verb = presenceActivityLabel(user.activity);
  return `${verb} ${user.current_label}`;
}

export function PresenceAvatars() {
  const auth = useAuth();
  const online = useOnlinePresence(() => Boolean(auth.me));
  const [open, setOpen] = createSignal(false);

  const users = () => online.data ?? [];
  const others = () => users().filter((u) => !u.is_self);
  const stack = () => others().slice(0, MAX_STACK);
  const overflow = () => Math.max(0, others().length - MAX_STACK);

  return (
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1 rounded-lg border border-stroke px-2 py-1.5 transition hover:bg-slate-50"
        aria-expanded={open()}
        aria-haspopup="true"
        title="Who's online"
        onClick={() => setOpen((v) => !v)}
      >
        <Show
          when={others().length > 0}
          fallback={
            <span class="flex items-center gap-2 px-1 text-xs text-text-secondary">
              <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Only you
            </span>
          }
        >
          <div class="flex items-center -space-x-2 pl-1">
            <For each={stack()}>
              {(user) => (
                <span class="relative inline-block">
                  <UserAvatar
                    name={user.full_name}
                    avatarUrl={user.avatar_url}
                    size="sm"
                    class="ring-2 ring-white"
                  />
                  <span
                    class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                    aria-hidden="true"
                  />
                </span>
              )}
            </For>
            <Show when={overflow() > 0}>
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white">
                +{overflow()}
              </span>
            </Show>
          </div>
          <span class="hidden text-xs font-medium text-text-secondary sm:inline">
            {others().length + 1} online
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-stroke bg-white py-2 shadow-lg"
          role="dialog"
          aria-label="Online teammates"
        >
          <div class="border-b border-stroke px-4 py-2">
            <p class="text-sm font-semibold text-text-primary">Online now</p>
            <p class="text-xs text-text-secondary">See who is in the app and what they are working on.</p>
          </div>
          <ul class="max-h-72 overflow-y-auto py-1">
            <For each={users()}>
              {(user) => (
                <li class="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span class="relative mt-0.5">
                    <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" />
                    <span
                      class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                      aria-hidden="true"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-text-primary">
                      {user.full_name}
                      <Show when={user.is_self}>
                        <span class="ml-1 text-xs font-normal text-text-secondary">(you)</span>
                      </Show>
                    </p>
                    <p class="truncate text-xs text-text-secondary">{activitySummary(user)}</p>
                    <p class="text-[11px] text-text-secondary/80">{formatSeen(user.last_seen_at)}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <Show when={users().length === 0 && !online.isFetching}>
            <p class="px-4 py-3 text-sm text-text-secondary">No teammates online right now.</p>
          </Show>
        </div>
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default"
          aria-label="Close online panel"
          onClick={() => setOpen(false)}
        />
      </Show>
    </div>
  );
}

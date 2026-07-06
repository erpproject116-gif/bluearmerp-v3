import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useAuth, canManageBranding } from "../shared/auth-context";
import { AvatarUploadButton } from "../shared/AvatarUploadButton";
import { signOutWithPresenceClear } from "../shared/PresenceHeartbeat";
import { UserAvatar } from "../shared/UserAvatar";
import { brandingLabel } from "../shared/branding/brandingStore";
import { useShell } from "./shell-context";

function BookIcon() {
  return (
    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function BrandingIcon() {
  return (
    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}


export function UserAccountMenu() {
  const auth = useAuth();
  const shell = useShell();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);

  const signOut = async () => {
    setOpen(false);
    await signOutWithPresenceClear();
    navigate("/signin", { replace: true });
  };

  onMount(() => {
    const closeClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-user-menu]")) setOpen(false);
    };
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", closeClick);
    document.addEventListener("keydown", closeKey);
    onCleanup(() => {
      document.removeEventListener("click", closeClick);
      document.removeEventListener("keydown", closeKey);
    });
  });

  return (
    <Show when={auth.me}>
      {(me) => (
        <div class="relative" data-user-menu>
          <button
            type="button"
            class="flex w-full items-center rounded-lg border border-stroke erp-panel text-left transition hover:erp-panel-strong"
            classList={{
              "justify-center p-2": shell.collapsed(),
              "gap-3 px-3 py-2.5": !shell.collapsed(),
            }}
            aria-expanded={open()}
            aria-haspopup="menu"
            title={shell.collapsed() ? me().user.full_name : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <UserAvatar
              name={me().user.full_name}
              avatarUrl={me().user.avatar_url}
              size="sm"
              class={shell.collapsed() ? "ring-2 ring-brand-50" : undefined}
            />
            <Show when={!shell.collapsed()}>
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{me().user.full_name}</span>
              <svg
                class="h-4 w-4 shrink-0 text-text-secondary transition-transform"
                classList={{ "rotate-180": open() }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </Show>
          </button>

          <Show when={open()}>
            <div
              role="menu"
              class="absolute z-50 w-64 rounded-xl border border-stroke bg-white shadow-lg"
              classList={{
                "bottom-full left-0 right-0 mb-2": !shell.collapsed(),
                "bottom-0 left-full ml-2": shell.collapsed(),
              }}
            >
              <div class="border-b border-stroke px-4 py-3">
                <div class="flex items-center gap-3">
                  <UserAvatar name={me().user.full_name} avatarUrl={me().user.avatar_url} size="sm" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-text-primary">{me().user.full_name}</p>
                    <p class="truncate text-xs text-text-secondary">{me().tenant.company_name}</p>
                    <AvatarUploadButton class="mt-0.5" />
                  </div>
                </div>
              </div>
              <div class="flex flex-col gap-1 p-2">
                <A
                  href="/app/documentation"
                  role="menuitem"
                  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                  onClick={() => setOpen(false)}
                >
                  <BookIcon />
                  Help &amp; guides
                </A>
                <Show when={canManageBranding(auth.me)}>
                  <A
                    href="/app/settings/branding"
                    role="menuitem"
                    class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                    onClick={() => setOpen(false)}
                  >
                    <BrandingIcon />
                    {brandingLabel("app.branding_link", "Branding")}
                  </A>
                </Show>
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary"
                  onClick={() => void signOut()}
                >
                  <SignOutIcon />
                  {brandingLabel("app.sign_out", "Sign out")}
                </button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

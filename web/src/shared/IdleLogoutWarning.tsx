import { Show } from "solid-js";
import { uiLabel } from "./branding/uiLabel";

type Props = {
  open: boolean;
  onStay: () => void;
  onLogout: () => void;
};

export function IdleLogoutWarning(props: Props) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
        <div
          class="w-full max-w-md rounded-xl border border-stroke bg-white p-6 shadow-xl"
          role="alertdialog"
          aria-labelledby="idle-logout-title"
          aria-describedby="idle-logout-desc"
        >
          <h2 id="idle-logout-title" class="text-lg font-semibold text-text-primary">
            {uiLabel("session.idle_warning_title", "Still there?")}
          </h2>
          <p id="idle-logout-desc" class="mt-2 text-sm text-text-secondary">
            {uiLabel(
              "session.idle_warning_body",
              "You have been inactive. You will be signed out in about 2 minutes unless you continue.",
            )}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
              onClick={() => props.onLogout()}
            >
              {uiLabel("session.sign_out_now", "Sign out now")}
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => props.onStay()}
            >
              {uiLabel("session.stay_signed_in", "Stay signed in")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

import { A } from "@solidjs/router";
import { Show, type ParentComponent } from "solid-js";
import { useAuth } from "../../shared/auth-context";

/** Minimal chrome for published articles at /articles — not AppShell. */
const CmsPublicLayout: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <div class="min-h-screen bg-body text-text-primary">
      <header class="border-b border-stroke bg-white">
        <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <A href="/articles" class="text-base font-semibold tracking-tight text-text-primary">
            BluearmERP
          </A>
          <Show when={!auth.bootstrapping && auth.me} fallback={
            <A href="/signin" class="text-sm text-brand-600 hover:underline">Sign in</A>
          }>
            <A href="/app/dashboard" class="text-sm text-brand-600 hover:underline">Open app</A>
          </Show>
        </div>
      </header>
      <main class="px-4 py-8">{props.children}</main>
    </div>
  );
};

export default CmsPublicLayout;

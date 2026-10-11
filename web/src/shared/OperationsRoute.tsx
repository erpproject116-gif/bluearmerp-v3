import { type ParentComponent, Show, Suspense, lazy } from "solid-js";
import { Navigate } from "@solidjs/router";
import { hasModuleAccess, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

const OperationsWorkspaceProvider = lazy(() =>
  import("../modules/operations/operationsWorkspace").then((m) => ({ default: m.OperationsWorkspaceProvider })),
);

export const OperationsRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={hasModuleAccess(auth.me, "operations")} fallback={<Navigate href="/app/dashboard" />}>
        <Suspense fallback={<SessionLoading />}>
          <OperationsWorkspaceProvider>{props.children}</OperationsWorkspaceProvider>
        </Suspense>
      </Show>
    </Show>
  );
};

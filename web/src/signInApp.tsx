import { QueryClientProvider } from "@tanstack/solid-query";
import { Navigate, Route, Router, useLocation } from "@solidjs/router";
import { lazy, onMount, Suspense } from "solid-js";
import { AuthProvider } from "./shared/auth-context";
import { ToastProvider } from "./shared/toast";
import { InlineGuidesProvider } from "./shared/inlineGuides";
import { BrandingProvider } from "./shared/branding/BrandingProvider";
import { AuthEntryRedirect, SessionLoading } from "./shared/AuthRedirect";
import { PageLoader } from "./shared/PageLoader";
import { UsageTracker } from "./shared/UsageTracker";
import { queryClient } from "./shared/queryClient";
import SignInPage from "./modules/auth/SignInPage";

const SignUpPage = lazy(() => import("./modules/auth/SignUpPage"));
const ForgotPasswordPage = lazy(() => import("./modules/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./modules/auth/ResetPasswordPage"));
const DemoSignupPage = lazy(() => import("./modules/auth/DemoSignupPage"));
const WelcomePage = lazy(() => import("./modules/auth/WelcomePage"));
const PendingApprovalPage = lazy(() => import("./modules/auth/PendingApprovalPage"));
const AuthCallbackPage = lazy(() => import("./modules/auth/AuthCallbackPage"));
const PortalLoginPage = lazy(() => import("./modules/portal/PortalLoginPage"));
const PortalDashboardPage = lazy(() => import("./modules/portal/PortalDashboardPage"));
const ClientPortalApp = lazy(() => import("./modules/portal/ClientPortalApp"));
const ApplyPage = lazy(() => import("./modules/hr/ApplyPage"));
const CareersBoardPage = lazy(() => import("./modules/careers/CareersBoardPage"));

/** The light shell has no product /app routes (except client portal). Reload the full app for other /app paths. */
function AppHandOff() {
  const loc = useLocation();
  onMount(() => {
    const next = `${loc.pathname}${loc.search}${loc.hash || ""}`;
    if (next === "/app/hr/client-portal" || next.startsWith("/app/hr/client-portal/")) return;
    if (next.startsWith("/app") || next.startsWith("/platform")) {
      window.location.replace(next);
    }
  });
  return <SessionLoading />;
}

function AuthLoginRedirect() {
  const loc = useLocation();
  return <Navigate href={`/signin${loc.search}`} />;
}

export default function SignInApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <InlineGuidesProvider>
            <BrandingProvider>
              <Router
                root={(props) => (
                  <Suspense fallback={<PageLoader />}>
                    <UsageTracker />
                    {props.children}
                  </Suspense>
                )}
              >
                <Route path="/signin" component={SignInPage} />
                <Route path="/auth/login" component={AuthLoginRedirect} />
                <Route path="/signup" component={SignUpPage} />
                <Route path="/forgot-password" component={ForgotPasswordPage} />
                <Route path="/auth/reset-password" component={ResetPasswordPage} />
                <Route path="/demo" component={DemoSignupPage} />
                <Route path="/welcome" component={WelcomePage} />
                <Route path="/pending-approval" component={PendingApprovalPage} />
                <Route path="/auth/callback" component={AuthCallbackPage} />
                <Route path="/portal/login" component={PortalLoginPage} />
                <Route path="/portal/dashboard" component={PortalDashboardPage} />
                <Route path="/app/hr/client-portal" component={ClientPortalApp} />
                <Route path="/app/hr/client-portal/*" component={ClientPortalApp} />
                <Route path="/apply/:code" component={ApplyPage} />
                <Route path="/careers/:code" component={CareersBoardPage} />
                <Route path="/careers/:code/:jobId" component={CareersBoardPage} />
                <Route path="/app/*" component={AppHandOff} />
                <Route path="/platform/*" component={AppHandOff} />
                <Route path="*" component={AuthEntryRedirect} />
              </Router>
            </BrandingProvider>
          </InlineGuidesProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

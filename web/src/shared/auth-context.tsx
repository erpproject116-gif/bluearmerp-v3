import { createContext, onCleanup, onMount, useContext, type ParentComponent } from "solid-js";
import { createStore } from "solid-js/store";
import { apiFetch, apiNetworkErrorMessage, supabase } from "./api";

export type MeData = {
  user: {
    id: number;
    email: string;
    full_name: string;
    tenant_role?: string;
    is_platform_superadmin?: boolean;
    is_tenant_owner?: boolean;
    is_store_admin?: boolean;
    can_manage_users?: boolean;
    can_manage_custom_fields?: boolean;
    can_view_activity_logs?: boolean;
    can_view_crm?: boolean;
    can_manage_crm_rules?: boolean;
  };
  tenant: {
    id: number;
    company_name: string;
    company_code: string;
    status: string;
    auto_enable_all_modules?: boolean;
  };
  enabled_module_codes: string[];
};

export function canManageFormSettings(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_manage_custom_fields || u.is_platform_superadmin || u.is_tenant_owner || u.is_store_admin);
}

export function canManageUsers(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_manage_users || u.is_platform_superadmin || u.is_tenant_owner);
}

export function canViewActivityLogs(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_view_activity_logs || u.is_platform_superadmin || u.is_tenant_owner);
}

export function canViewCrm(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_view_crm || u.is_platform_superadmin || u.is_tenant_owner);
}

export function canManageCrmRules(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(
    u.can_manage_crm_rules || u.is_platform_superadmin || u.is_tenant_owner || u.is_store_admin,
  );
}

export type BootstrapError = "network" | "unauthorized" | "forbidden" | null;

type AuthState = {
  me: MeData | null;
  loading: boolean;
  bootstrapError: BootstrapError;
  bootstrapMessage: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>();

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore({
    me: null as MeData | null,
    loading: true,
    bootstrapError: null as BootstrapError,
    bootstrapMessage: null as string | null,
  });

  const refresh = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setState({ me: null, loading: false, bootstrapError: null, bootstrapMessage: null });
      return;
    }

    setState("loading", true);
    try {
      const res = await apiFetch<MeData>("/api/v1/auth/me");
      if (res.success && res.data) {
        setState({ me: res.data, loading: false, bootstrapError: null, bootstrapMessage: null });
        return;
      }
      const bootstrapError: BootstrapError =
        res.status === 403 || res.code === "ERR_FORBIDDEN"
          ? "forbidden"
          : res.status === 401 || res.code === "ERR_UNAUTHORIZED"
            ? "unauthorized"
            : "network";
      setState({
        me: null,
        loading: false,
        bootstrapError,
        bootstrapMessage: res.message ?? null,
      });
    } catch {
      setState({
        me: null,
        loading: false,
        bootstrapError: "network",
        bootstrapMessage: apiNetworkErrorMessage(),
      });
    }
  };

  onMount(() => {
    void refresh();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void refresh();
        return;
      }
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        setState({ me: null, loading: false, bootstrapError: null, bootstrapMessage: null });
      }
    });

    onCleanup(() => sub.subscription.unsubscribe());
  });

  return (
    <AuthContext.Provider
      value={{
        get me() {
          return state.me;
        },
        get loading() {
          return state.loading;
        },
        get bootstrapError() {
          return state.bootstrapError;
        },
        get bootstrapMessage() {
          return state.bootstrapMessage;
        },
        refresh,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
};

import { createContext, onCleanup, onMount, useContext, type ParentComponent } from "solid-js";
import { createStore } from "solid-js/store";
import { apiFetch, apiNetworkErrorMessage, supabase } from "./api";
import {
  clearRolePreviewAttempt,
  clearRolePreviewFlag,
  isRolePreviewFlagSet,
  isRolePreviewSuspected,
  rolePreviewBootstrapMessage,
  setRolePreviewFlag,
} from "./rolePreviewClient";
import { getActiveTenantId, setActiveTenantId } from "./activeContext";

export type TenantMembership = {
  tenant_id: number;
  company_name: string;
  company_code: string;
  tenant_role?: string;
  status?: string;
};

export type MeData = {
  user: {
    id: number;
    email: string;
    full_name: string;
    avatar_url?: string;
    avatar_hidden_from_others?: boolean;
    tenant_role?: string;
    is_platform_superadmin?: boolean;
    is_tenant_owner?: boolean;
    is_store_admin?: boolean;
    home_location_id?: number;
    strict_branch_isolation?: boolean;
    transfer_handoff_v2?: boolean;
    can_manage_users?: boolean;
    can_manage_custom_fields?: boolean;
    can_manage_branding?: boolean;
    can_view_activity_logs?: boolean;
    can_view_change_logs?: boolean;
    can_view_crm?: boolean;
    can_manage_crm_rules?: boolean;
    can_view_all_crm?: boolean;
    can_manage_sales_team?: boolean;
    can_view_crm_analytics?: boolean;
    can_manage_all_support_tickets?: boolean;
    permissions?: Record<string, string> | null;
    can_access_platform_command?: boolean;
    can_start_role_preview?: boolean;
    platform_user_id?: number;
    platform_role?: string;
    platform_only?: boolean;
    platform_permissions?: Record<string, boolean> | null;
  };
  tenant: {
    id: number;
    company_name: string;
    company_code: string;
    status: string;
    auto_enable_all_modules?: boolean;
    is_demo?: boolean;
  };
  active_tenant_id?: number;
  memberships?: TenantMembership[];
  enabled_module_codes: string[];
  modules?: { module_code: string; module_name: string; is_enabled: boolean }[];
  entitlement?: {
    plan_kind?: string;
    status?: string;
    ends_at?: string;
    days_remaining?: number;
    urgency_label?: string;
    write_blocked?: boolean;
    message?: string;
  };
  commercial?: {
    status?: string;
    day1_completed_at?: string;
    amount_centavos?: number;
    write_blocked?: boolean;
    payment_requested_at?: string;
  };
  support_session?: {
    id: number;
    tenant_id: number;
    customer_id: number;
    company_code?: string;
    company_name?: string;
    ends_at: string;
    started_at?: string;
    access_mode: string;
    reason?: string;
    stealth?: boolean;
    extends_used?: number;
    can_extend?: boolean;
    previous_active_tenant_id?: number | null;
  } | null;
  role_preview?: {
    active: boolean;
    role_code: string;
    real_role?: string;
    home_location_id?: number;
    expires_at?: string;
    can_extend?: boolean;
  } | null;
};

/** True while owner/superadmin is in a role-template preview (effective flags are stripped). */
export function isRolePreviewActive(me: MeData | null | undefined): boolean {
  return Boolean(me?.role_preview?.active);
}

/** Platform superadmins — same Command Center + unrestricted ERP as itsjohnranel.
 *  bluearmph@gmail.com is also a store owner of the signed-in business. */
export const PLATFORM_CONSOLE_EMAILS = new Set([
  "itsjohnranel@gmail.com",
  "bluearmph@gmail.com",
  "erpproject116@gmail.com",
]);

function isProductOwnerEmail(email?: string): boolean {
  return PLATFORM_CONSOLE_EMAILS.has(email?.trim().toLowerCase() ?? "");
}

/** Email allowlist elevation — disabled during role preview (R5). */
function elevatedProductOwner(me: MeData | null | undefined): boolean {
  if (!me?.user || isRolePreviewActive(me)) return false;
  return isProductOwnerEmail(me.user.email);
}

export function canAccessPlatformConsole(me: MeData | null | undefined): boolean {
  if (!me?.user) return false;
  if (isRolePreviewActive(me)) return false;
  if (elevatedProductOwner(me) || me.user.is_platform_superadmin) return true;
  if (me.user.can_access_platform_command) return true;
  if (me.user.platform_permissions && Object.keys(me.user.platform_permissions).length > 0) {
    return Boolean(
      me.user.platform_permissions["platform.command.read"] ||
        me.user.platform_permissions["platform.customers.read"],
    );
  }
  return false;
}

export function hasPlatformPermission(me: MeData | null | undefined, code: string): boolean {
  if (!me?.user) return false;
  if (isRolePreviewActive(me)) return false;
  if (me.user.is_platform_superadmin || elevatedProductOwner(me)) return true;
  return Boolean(me.user.platform_permissions?.[code]);
}

export function canManageFormSettings(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_manage_custom_fields || u.is_platform_superadmin || u.is_tenant_owner || u.is_store_admin || elevatedProductOwner(me));
}

export function canManageBranding(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(
    u.can_manage_branding ??
      (u.can_manage_custom_fields || u.is_platform_superadmin || u.is_tenant_owner || u.is_store_admin || elevatedProductOwner(me)),
  );
}

export function canManageUsers(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  if (u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me)) return true;
  if (u.permissions && Object.keys(u.permissions).length > 0) {
    return hasPermission(me, "user_management.users", "write");
  }
  return Boolean(u.can_manage_users);
}

export function canViewActivityLogs(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  if (u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me)) return true;
  if (u.permissions && Object.keys(u.permissions).length > 0) {
    return hasPermission(me, "activity_logs.logs", "read");
  }
  return Boolean(u.can_view_activity_logs);
}

export function canViewChangeLogs(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  if (u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me)) return true;
  if (u.permissions && Object.keys(u.permissions).length > 0) {
    return (
      hasPermission(me, "activity_logs.changes", "read") || hasPermission(me, "activity_logs.logs", "read")
    );
  }
  return Boolean(u.can_view_change_logs ?? u.can_view_activity_logs);
}

export function canViewCrm(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_view_crm || u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me));
}

/** Same gate as the notifications inbox page (CrmRoute + ModuleAccessGate). */
export function canViewCrmNotifications(me: MeData | null | undefined): boolean {
  if (!canViewCrm(me)) return false;
  if (me?.user?.permissions && Object.keys(me.user.permissions).length > 0) {
    return hasPermission(me, "crm.notifications", "read");
  }
  return true;
}

export function canManageCrmRules(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(
    u.can_manage_crm_rules || u.is_platform_superadmin || u.is_tenant_owner || u.is_store_admin || elevatedProductOwner(me),
  );
}

export function canViewAllCrm(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.can_view_all_crm || u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me));
}

export function canManageSalesTeam(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(
    u.can_manage_sales_team || u.can_manage_users || u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me),
  );
}

export function canViewCrmAnalytics(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  if (u.permissions && Object.keys(u.permissions).length > 0) {
    return hasPermission(me, "crm.reports_customer_quotations", "read");
  }
  return Boolean(u.can_view_crm_analytics || u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me));
}

/** IT desk / superadmin — may view and manage every support ticket in the tenant. */
export function canManageAllSupportTickets(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(
    u.can_manage_all_support_tickets ||
      u.is_platform_superadmin ||
      u.is_tenant_owner ||
      u.is_store_admin ||
      elevatedProductOwner(me) ||
      hasPermission(me, "support.tickets_assign", "write"),
  );
}

export type AccessLevel = "deny" | "read" | "write";

export function permissionLevel(me: MeData | null | undefined, code: string): AccessLevel {
  const u = me?.user;
  if (!u) return "deny";
  if (u.is_platform_superadmin || u.is_tenant_owner || elevatedProductOwner(me)) return "write";
  const perms = u.permissions;
  if (perms && Object.keys(perms).length > 0) {
    if (perms[code]) return perms[code] as AccessLevel;
    const dot = code.lastIndexOf(".");
    if (dot > 0 && perms[code.slice(0, dot)]) {
      const parent = perms[code.slice(0, dot)] as AccessLevel;
      if (parent !== "deny") return parent;
    }
    return "deny";
  }
  return legacyPermissionLevel(me, code);
}

export function hasPermission(
  me: MeData | null | undefined,
  code: string,
  min: "read" | "write",
): boolean {
  const lvl = permissionLevel(me, code);
  if (min === "write") return lvl === "write";
  return lvl === "read" || lvl === "write";
}

export function hasModuleAccess(me: MeData | null | undefined, moduleId: string): boolean {
  if (!me) return false;
  if (moduleId === "production") moduleId = "manufacturing";
  if (hasPermission(me, moduleId, "read")) return true;
  const u = me.user;
  if (u?.permissions) {
    const prefix = `${moduleId}.`;
    for (const [code, lvl] of Object.entries(u.permissions)) {
      if (code.startsWith(prefix) && lvl !== "deny") return true;
    }
  }
  return legacyModuleAccess(me, moduleId);
}

function legacyPermissionLevel(me: MeData, code: string): AccessLevel {
  if (code.startsWith("user_management") || code === "settings.form_fields") {
    return canManageUsers(me) ? "write" : "deny";
  }
  if (code === "settings.form_fields") {
    return canManageFormSettings(me) ? "write" : "deny";
  }
  if (code.startsWith("activity_logs")) {
    return canViewActivityLogs(me) ? "read" : "deny";
  }
  if (code.startsWith("crm")) {
    if (!canViewCrm(me)) return "deny";
    if (code.includes("reports") || code.includes("settings_alert")) {
      return canViewCrmAnalytics(me) || canManageCrmRules(me) ? "read" : "deny";
    }
    return "read";
  }
  if (code.startsWith("support")) {
    if (!canViewCrm(me)) return "deny";
    return "write";
  }
  if (
    code.startsWith("inventory") ||
    code.startsWith("after_sales") ||
    code.startsWith("manufacturing") ||
    code.startsWith("quotation") ||
    code.startsWith("sales") ||
    code.startsWith("sales_order")
  ) {
    return "read";
  }
  return "deny";
}

function legacyModuleAccess(me: MeData, moduleId: string): boolean {
  if (moduleId === "user_management") return canManageUsers(me);
  if (moduleId === "activity_logs") return canViewActivityLogs(me);
  if (moduleId === "crm") return canViewCrm(me);
  if (moduleId === "support") return canViewCrm(me);
  if (moduleId === "finance") return false;
  return legacyPermissionLevel(me, moduleId) !== "deny";
}

export type BootstrapError = "network" | "unauthorized" | "forbidden" | null;

type AuthState = {
  me: MeData | null;
  loading: boolean;
  /** True only during the initial session bootstrap (no user profile yet). */
  bootstrapping: boolean;
  bootstrapError: BootstrapError;
  bootstrapMessage: string | null;
  refresh: (options?: { background?: boolean }) => Promise<void>;
  /** Switch the active business, persist it, and reload the session. */
  setActiveTenant: (tenantId: number) => Promise<void>;
};

const AuthContext = createContext<AuthState>();

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore({
    me: null as MeData | null,
    loading: true,
    bootstrapError: null as BootstrapError,
    bootstrapMessage: null as string | null,
  });

  const tryEndRolePreviewRecovery = async () => {
    if (!isRolePreviewSuspected()) return false;
    try {
      await apiFetch("/api/v1/auth/role-preview/end", { method: "POST", body: "{}" }, { silent: true });
    } catch {
      /* still attempt /me after clear attempt */
    }
    clearRolePreviewFlag();
    clearRolePreviewAttempt();
    return true;
  };

  const refresh = async (options?: { background?: boolean; _previewRecoveryTried?: boolean }) => {
    const background = options?.background ?? false;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setState({ me: null, loading: false, bootstrapError: null, bootstrapMessage: null });
      return;
    }

    if (!background && !state.me) {
      setState("loading", true);
    }

    try {
      const res = await apiFetch<MeData>("/api/v1/auth/me", {}, background ? { background: true } : undefined);
      if (res.success && res.data) {
        // Keep the persisted active tenant in sync with what the server resolved, so
        // subsequent requests send a stable X-Tenant-ID header.
        const resolved = res.data.active_tenant_id ?? res.data.tenant?.id;
        if (resolved && getActiveTenantId() !== resolved) {
          setActiveTenantId(resolved);
        }
        if (res.data.role_preview?.active) {
          setRolePreviewFlag();
          clearRolePreviewAttempt();
        } else {
          clearRolePreviewFlag();
          clearRolePreviewAttempt();
        }
        setState({ me: res.data, loading: false, bootstrapError: null, bootstrapMessage: null });
        return;
      }
      if (background && state.me) {
        return;
      }
      // Server 5xx / network after preview — recover without blaming CORS_ORIGIN first.
      if ((res.status >= 500 || res.status === 0) && !options?._previewRecoveryTried) {
        if (await tryEndRolePreviewRecovery()) {
          await refresh({ ...options, _previewRecoveryTried: true });
          return;
        }
      }
      const bootstrapError: BootstrapError =
        res.status === 403 || res.code === "ERR_FORBIDDEN"
          ? "forbidden"
          : res.status === 401 ||
              res.code === "ERR_UNAUTHORIZED" ||
              res.code === "ERR_SESSION_IDLE"
            ? "unauthorized"
            : "network";
      // After end+retry, attempt flags are cleared — still keep preview copy + Exit (D8).
      const suspected =
        isRolePreviewSuspected() ||
        isRolePreviewFlagSet() ||
        Boolean(options?._previewRecoveryTried);
      const bootstrapMessage =
        suspected
          ? rolePreviewBootstrapMessage(res.message)
          : res.status >= 500
            ? res.message ||
              "The API returned an error loading your session. Retry or use Exit role preview if you were viewing as another role."
            : (res.message ?? null);
      setState({
        me: null,
        loading: false,
        bootstrapError,
        bootstrapMessage,
      });
    } catch {
      if (background && state.me) {
        setState("loading", false);
        return;
      }
      if (!options?._previewRecoveryTried && (await tryEndRolePreviewRecovery())) {
        await refresh({ ...options, _previewRecoveryTried: true });
        return;
      }
      setState({
        me: null,
        loading: false,
        bootstrapError: "network",
        bootstrapMessage:
          isRolePreviewSuspected() || Boolean(options?._previewRecoveryTried)
            ? rolePreviewBootstrapMessage()
            : apiNetworkErrorMessage(),
      });
    }
  };

  /** Single-flight /auth/me — background waiters coalesce; foreground always re-fetches after wait (G6). */
  let refreshInflight: Promise<void> | null = null;
  const refreshCoalesced = async (options?: { background?: boolean }) => {
    if (refreshInflight) {
      await refreshInflight;
      if (options?.background) return;
      // Foreground (picker Start, Exit, Retry): do not trust the prior flight — fetch again.
    }
    const flight = refresh(options).finally(() => {
      if (refreshInflight === flight) refreshInflight = null;
    });
    refreshInflight = flight;
    await flight;
  };

  const setActiveTenant = async (tenantId: number) => {
    if (!tenantId || tenantId === state.me?.tenant?.id) return;
    const res = await apiFetch<{ tenant_id: number }>("/api/v1/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (!res.success) return;
    setActiveTenantId(tenantId);
    await refreshCoalesced();
  };

  onMount(() => {
    void refreshCoalesced();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") {
        void refreshCoalesced({ background: true });
        return;
      }
      if (event === "SIGNED_IN") {
        void refreshCoalesced({ background: state.me != null });
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
        get bootstrapping() {
          return state.loading && state.me == null;
        },
        get bootstrapError() {
          return state.bootstrapError;
        },
        get bootstrapMessage() {
          return state.bootstrapMessage;
        },
        refresh: refreshCoalesced,
        setActiveTenant,
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

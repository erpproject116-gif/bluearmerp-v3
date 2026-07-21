import { createContext, createEffect, createSignal, onMount, useContext } from "solid-js";
import { apiAbsoluteUrl, apiFetch, getAccessToken } from "../api";
import { getGlobalToast } from "../toast";
import { useAuth } from "../auth-context";
import { applyBrandingTheme } from "./applyTheme";
import { DEFAULT_BRANDING } from "./defaults";
import { setBrandingSnapshot } from "./brandingStore";
import type { BrandingPayload, BrandingSettings } from "./types";

function mergeSettings(raw: Partial<BrandingSettings> | undefined): BrandingSettings {
  return {
    colors: { ...DEFAULT_BRANDING.colors, ...raw?.colors },
    stages: { ...DEFAULT_BRANDING.stages, ...raw?.stages },
    labels: { ...DEFAULT_BRANDING.labels, ...raw?.labels },
    placeholders: { ...DEFAULT_BRANDING.placeholders, ...raw?.placeholders },
    receipt: { ...DEFAULT_BRANDING.receipt, ...raw?.receipt },
  };
}

type BrandingContextValue = {
  settings: () => BrandingSettings;
  canManage: () => boolean;
  logoPreviewUrl: () => string | undefined;
  loading: () => boolean;
  refresh: () => Promise<void>;
  /** Re-run theme CSS vars after light/dark preference changes. */
  reapplyTheme: () => void;
  save: (patch: Partial<BrandingSettings>) => Promise<boolean>;
  uploadLogo: (file: File) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
};

const BrandingContext = createContext<BrandingContextValue>();

export function BrandingProvider(props: { children?: import("solid-js").JSX.Element }) {
  const auth = useAuth();
  const [settings, setSettings] = createSignal<BrandingSettings>(mergeSettings(undefined));
  const [canManage, setCanManage] = createSignal(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = createSignal<string | undefined>();
  const [loading, setLoading] = createSignal(false);

  const loadLogoPreview = async (settings: BrandingSettings) => {
    const id = settings.receipt.logo_asset_id;
    if (!id) {
      setLogoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return undefined;
      });
      return;
    }
    const blobUrl = await fetchBrandingLogoBlob(id);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blobUrl ?? undefined;
    });
  };

  const apply = (s: BrandingSettings) => {
    setSettings(s);
    setBrandingSnapshot(s);
    applyBrandingTheme(s);
    void loadLogoPreview(s);
  };

  const refresh = async () => {
    if (!auth.me) return;
    setLoading(true);
    try {
      const res = await apiFetch<BrandingPayload>("/api/v1/branding", {}, { silent: true });
      if (res.success && res.data) {
        apply(mergeSettings(res.data.settings));
        setCanManage(Boolean(res.data.can_manage));
      }
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  createEffect(() => {
    if (auth.me) void refresh();
  });

  const save = async (patch: Partial<BrandingSettings>) => {
    const res = await apiFetch<{ settings: BrandingSettings }>("/api/v1/branding", {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    if (res.success && res.data?.settings) {
      apply(mergeSettings(res.data.settings));
      return true;
    }
    return false;
  };

  const uploadLogo = async (file: File) => {
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(apiAbsoluteUrl("/api/v1/branding/logo"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    let body: { success?: boolean; message?: string };
    try {
      body = await res.json();
    } catch {
      getGlobalToast()?.error("Logo upload failed — invalid server response.");
      return false;
    }
    if (!body.success) {
      getGlobalToast()?.error(body.message ?? "Logo upload failed.");
      return false;
    }
    getGlobalToast()?.success(body.message ?? "Logo uploaded.");
    await refresh();
    return true;
  };

  const uploadAvatar = async (file: File) => {
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(apiAbsoluteUrl("/api/v1/users/me/avatar"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const body = await res.json();
    if (!body.success) return null;
    const url = body.data?.avatar_url as string | undefined;
    if (url) await auth.refresh();
    return url ? apiAbsoluteUrl(url) : null;
  };

  const value: BrandingContextValue = {
    settings,
    canManage,
    logoPreviewUrl,
    loading,
    refresh,
    reapplyTheme: () => applyBrandingTheme(settings()),
    save,
    uploadLogo,
    uploadAvatar,
  };

  return <BrandingContext.Provider value={value}>{props.children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding requires BrandingProvider");
  return ctx;
}

export async function fetchBrandingLogoBlob(assetId: number): Promise<string | null> {
  const token = await getAccessToken();
  const res = await fetch(apiAbsoluteUrl(`/api/v1/branding/assets/${assetId}?inline=1`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

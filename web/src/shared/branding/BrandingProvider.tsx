import { createContext, createEffect, createSignal, onMount, useContext } from "solid-js";
import { apiAbsoluteUrl, apiFetch, getAccessToken } from "../api";
import { getGlobalToast } from "../toast";
import { useAuth } from "../auth-context";
import { applyBrandingTheme } from "./applyTheme";
import { DEFAULT_BRANDING } from "./defaults";
import { setBrandingSnapshot } from "./brandingStore";
import type { BrandingPayload, BrandingReceipt, BrandingSettings } from "./types";

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
  logoMissing: () => boolean;
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
  const [logoMissing, setLogoMissing] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  const loadLogoPreview = async (settings: BrandingSettings, missing: boolean) => {
    const id = settings.receipt.logo_asset_id;
    if (!id || missing) {
      setLogoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return undefined;
      });
      return;
    }
    const blobUrl = await fetchBrandingLogoBlob(id);
    if (!blobUrl) {
      // Asset row/file gone (e.g. ephemeral disk) — stop retrying on every auth refresh.
      markBrandingAssetMissing(id);
      setLogoMissing(true);
    }
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blobUrl ?? undefined;
    });
  };

  const apply = (s: BrandingSettings, missing = false) => {
    setSettings(s);
    setBrandingSnapshot(s);
    applyBrandingTheme(s);
    setLogoMissing(missing);
    void loadLogoPreview(s, missing);
  };

  const refresh = async () => {
    if (!auth.me) return;
    setLoading(true);
    try {
      const res = await apiFetch<BrandingPayload>("/api/v1/branding", {}, { silent: true });
      if (res.success && res.data) {
        const merged = mergeSettings(res.data.settings);
        const missing =
          Boolean(res.data.logo_missing) ||
          (merged.receipt.logo_asset_id != null &&
            isBrandingAssetMissing(merged.receipt.logo_asset_id));
        setCanManage(Boolean(res.data.can_manage));
        apply(merged, missing);
      }
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  // Refresh branding only when the signed-in user id changes — not on every auth.me object tick.
  createEffect(() => {
    const userId = auth.me?.user?.id;
    if (userId) void refresh();
  });

  const save = async (patch: Partial<BrandingSettings>) => {
    // Never send null logo_asset_id from a color/label save — that used to wipe the logo.
    // Blank company_name from a stale draft must not overwrite a known live name.
    const live = settings().receipt;
    const liveLogoId = live.logo_asset_id;
    const receipt = patch.receipt
      ? {
          ...patch.receipt,
          logo_asset_id: patch.receipt.logo_asset_id ?? liveLogoId ?? null,
          company_name:
            String(patch.receipt.company_name ?? "").trim() || live.company_name || "",
        }
      : undefined;
    const body: Partial<BrandingSettings> = receipt ? { ...patch, receipt } : { ...patch };
    if (body.receipt && (body.receipt.logo_asset_id == null || body.receipt.logo_asset_id === 0)) {
      const { logo_asset_id: _omit, ...restReceipt } = body.receipt;
      body.receipt = restReceipt as BrandingReceipt;
    }
    const res = await apiFetch<{ settings: BrandingSettings }>("/api/v1/branding", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (res.success && res.data?.settings) {
      const merged = mergeSettings(res.data.settings);
      const missing =
        logoMissing() ||
        (merged.receipt.logo_asset_id != null && isBrandingAssetMissing(merged.receipt.logo_asset_id));
      apply(merged, missing);
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
    // Fresh upload — allow the new (or restored) asset id to be fetched again.
    missingBrandingAssets.clear();
    fetchFailCounts.clear();
    await refresh();
    setLogoMissing(false);
    // Verify the asset is actually readable; otherwise surface missing immediately.
    const id = settings().receipt.logo_asset_id;
    if (id) {
      const blobUrl = await fetchBrandingLogoBlob(id);
      if (!blobUrl) {
        setLogoMissing(true);
        getGlobalToast()?.warning(
          "Logo was saved in settings, but the file could not be loaded from the server. Re-upload, or ask ops to mount a durable branding-assets volume.",
        );
      } else {
        setLogoPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return blobUrl;
        });
      }
    }
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
    logoMissing,
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

const missingBrandingAssets = new Set<number>();
const fetchFailCounts = new Map<number, number>();

export function markBrandingAssetMissing(assetId: number) {
  if (assetId > 0) missingBrandingAssets.add(assetId);
}

export function clearBrandingAssetMissing(assetId: number) {
  missingBrandingAssets.delete(assetId);
}

export function isBrandingAssetMissing(assetId: number): boolean {
  return missingBrandingAssets.has(assetId);
}

export async function fetchBrandingLogoBlob(assetId: number): Promise<string | null> {
  if (!assetId || missingBrandingAssets.has(assetId)) return null;
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(apiAbsoluteUrl(`/api/v1/branding/assets/${assetId}?inline=1`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404 || res.status === 410 || res.status === 403) {
    missingBrandingAssets.add(assetId);
    return null;
  }
  if (!res.ok) {
    // Treat repeated hard failures like missing so the UI stops flickering.
    const fails = (fetchFailCounts.get(assetId) ?? 0) + 1;
    fetchFailCounts.set(assetId, fails);
    if (fails >= 3) missingBrandingAssets.add(assetId);
    return null;
  }
  fetchFailCounts.delete(assetId);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

import { createSignal } from "solid-js";
import { useBranding } from "./branding/BrandingProvider";

const MAX_AVATAR_MB = 5;

export function AvatarUploadButton(props: { class?: string }) {
  const branding = useBranding();
  const [uploading, setUploading] = createSignal(false);

  return (
    <label class={`cursor-pointer text-xs text-brand-600 hover:underline ${props.class ?? ""}`}>
      {uploading() ? "Uploading…" : "Change photo"}
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        class="hidden"
        disabled={uploading()}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          if (f.size > MAX_AVATAR_MB * 1024 * 1024) return;
          setUploading(true);
          void branding.uploadAvatar(f).finally(() => setUploading(false));
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

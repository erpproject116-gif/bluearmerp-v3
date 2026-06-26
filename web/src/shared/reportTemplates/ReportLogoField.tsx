import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Field, inputClass } from "../SpreadsheetGrid";
import { useToast } from "../toast";
import { deleteReportLogo, fetchReportLogoBlob, uploadReportLogo } from "./useReportTemplates";
import type { ReportTemplateKey } from "./types";

type Props = {
  reportKey: ReportTemplateKey;
  logoAssetId: number | null;
  onChange: (assetId: number | null) => void;
};

export function ReportLogoField(props: Props) {
  const toast = useToast();
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  const [uploading, setUploading] = createSignal(false);

  const loadPreview = async (assetId: number) => {
    try {
      const url = await fetchReportLogoBlob(assetId);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewUrl(null);
    }
  };

  createEffect(() => {
    const id = props.logoAssetId;
    if (id) void loadPreview(id);
    else setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  });

  onCleanup(() => {
    const url = previewUrl();
    if (url) URL.revokeObjectURL(url);
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadReportLogo(props.reportKey, file);
      props.onChange(asset.id);
      await loadPreview(asset.id);
      toast.success("Logo uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    const id = props.logoAssetId;
    if (!id) return;
    try {
      await deleteReportLogo(id);
      props.onChange(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      toast.success("Logo removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove logo.");
    }
  };

  return (
    <Field label="Report logo (print)">
      <div class="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          class={inputClass}
          disabled={uploading()}
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        />
        <Show when={props.logoAssetId}>
          <button type="button" class="text-sm text-red-600 hover:underline" onClick={() => void remove()}>
            Remove logo
          </button>
        </Show>
      </div>
      <Show when={previewUrl()}>
        <img src={previewUrl()!} alt="Report logo preview" class="mt-2 max-h-16 max-w-[12rem] object-contain" />
      </Show>
    </Field>
  );
}

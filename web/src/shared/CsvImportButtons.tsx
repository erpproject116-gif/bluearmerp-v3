import { createSignal, Show } from "solid-js";
import type { ApiResult } from "./api";
import type { CsvImportCounts } from "./masterCsvImport";
import { useToast } from "./toast";

export function CsvImportButtons(props: {
  canWrite: boolean;
  download: () => Promise<void>;
  importFile: (file: File) => Promise<ApiResult<CsvImportCounts>>;
  onImported: () => void;
}) {
  const toast = useToast();
  const [importing, setImporting] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const runImport = async (file: File) => {
    setImporting(true);
    try {
      const res = await props.importFile(file);
      if (!res.success) {
        toast.warning(res.message ?? "Import failed.");
        return;
      }
      const data = res.data;
      toast.success(
        res.message ??
          `Imported ${data?.created ?? 0}, updated ${data?.updated ?? 0}, skipped ${data?.skipped ?? 0}, failed ${data?.failed ?? 0}.`,
      );
      props.onImported();
    } catch {
      toast.warning("Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Show when={props.canWrite}>
      <button
        type="button"
        class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
        onClick={() => void props.download().catch(() => toast.warning("Could not download template."))}
      >
        Download template
      </button>
      <button
        type="button"
        class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
        disabled={importing()}
        onClick={() => fileInput?.click()}
      >
        {importing() ? "Importing…" : "Import"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void runImport(file);
        }}
      />
    </Show>
  );
}

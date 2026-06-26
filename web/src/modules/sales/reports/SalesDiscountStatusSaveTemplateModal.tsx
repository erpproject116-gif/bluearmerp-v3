import { createSignal } from "solid-js";
import { Modal } from "../../../shared/Modal";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { loadPrintPageSettings } from "../../../shared/printPageSettings";
import { useToast } from "../../../shared/toast";
import type { SalesDiscountStatusTemplate } from "./salesDiscountStatusTemplate";
import {
  saveDiscountReportTemplate,
  settingsFromTemplate,
  useInvalidateDiscountReportTemplates,
} from "./useDiscountReportTemplates";

type Props = {
  open: boolean;
  template: () => SalesDiscountStatusTemplate;
  onClose: () => void;
  onSaved: (templateCode: string) => void;
};

export function SalesDiscountStatusSaveTemplateModal(props: Props) {
  const toast = useToast();
  const invalidate = useInvalidateDiscountReportTemplates();
  const [name, setName] = createSignal("");
  const [code, setCode] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    const templateName = name().trim();
    if (!templateName) {
      toast.error("Template name is required.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDiscountReportTemplate({
        template_name: templateName,
        template_code: code().trim() || undefined,
        settings: settingsFromTemplate(props.template(), loadPrintPageSettings()),
      });
      invalidate();
      toast.success("Template saved.");
      props.onSaved(saved.template_code);
      props.onClose();
      setName("");
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={props.open} title="Save Report Template" onClose={() => props.onClose()}>
      <div class="grid gap-4">
        <Field label="Template name">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="My discount layout" />
        </Field>
        <Field label="Template code (optional)">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="auto-generated from name" />
        </Field>
        <p class="text-xs text-text-secondary">
          Saves current sort/subtotal, display options, and page settings for this tenant.
        </p>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={saving()} onClick={() => void save()}>
          Save
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>Close</button>
      </div>
    </Modal>
  );
}

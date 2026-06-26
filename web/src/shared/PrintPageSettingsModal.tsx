import { createSignal } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import {
  loadPrintPageSettings,
  PAPER_SIZES,
  savePrintPageSettings,
  type PrintPageSettings,
} from "./printPageSettings";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (settings: PrintPageSettings) => void;
};

export function PrintPageSettingsModal(props: Props) {
  const [settings, setSettings] = createSignal<PrintPageSettings>(loadPrintPageSettings());

  const patch = (p: Partial<PrintPageSettings>) => setSettings((s) => ({ ...s, ...p }));

  const confirm = () => {
    const s = settings();
    savePrintPageSettings(s);
    props.onConfirm(s);
    props.onClose();
  };

  return (
    <Modal open={props.open} title="Page Settings" onClose={props.onClose}>
      <div class="grid gap-4">
        <Field label="Paper Size">
          <select class={inputClass} value={settings().paperSize} onChange={(e) => patch({ paperSize: e.currentTarget.value as PrintPageSettings["paperSize"] })}>
            {PAPER_SIZES.map((p) => (
              <option value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Print Orientation">
          <div class="flex gap-4">
            <label class="flex items-center gap-2">
              <input type="radio" name="orientation" checked={settings().orientation === "portrait"} onChange={() => patch({ orientation: "portrait" })} />
              Vertical
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="orientation" checked={settings().orientation === "landscape"} onChange={() => patch({ orientation: "landscape" })} />
              Row
            </label>
          </div>
        </Field>
        <Field label="Shrink to Page">
          <div class="flex gap-4">
            <label class="flex items-center gap-2">
              <input type="radio" name="shrink" checked={settings().shrinkToPage} onChange={() => patch({ shrinkToPage: true })} />
              Use
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="shrink" checked={!settings().shrinkToPage} onChange={() => patch({ shrinkToPage: false })} />
              Do Not Use
            </label>
          </div>
        </Field>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Top Margin (mm)">
            <input type="number" class={inputClass} value={settings().marginTopMm} onInput={(e) => patch({ marginTopMm: Number(e.currentTarget.value) || 0 })} />
          </Field>
          <Field label="Bottom Margin (mm)">
            <input type="number" class={inputClass} value={settings().marginBottomMm} onInput={(e) => patch({ marginBottomMm: Number(e.currentTarget.value) || 0 })} />
          </Field>
          <Field label="Left Margin (mm)">
            <input type="number" class={inputClass} value={settings().marginLeftMm} onInput={(e) => patch({ marginLeftMm: Number(e.currentTarget.value) || 0 })} />
          </Field>
          <Field label="Right Margin (mm)">
            <input type="number" class={inputClass} value={settings().marginRightMm} onInput={(e) => patch({ marginRightMm: Number(e.currentTarget.value) || 0 })} />
          </Field>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={confirm}>Confirm</button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

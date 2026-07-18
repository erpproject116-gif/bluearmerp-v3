import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { apiFetch } from "./api";
import { useToast } from "./toast";

export type CreatedDepartment = {
  id: number;
  department_name: string;
  status?: string;
};

type Props = {
  open: boolean;
  initialName?: string;
  /** Defaults to HR departments API. */
  apiPath?: string;
  onClose: () => void;
  onCreated: (dept: CreatedDepartment) => void;
};

export function QuickDepartmentModal(props: Props) {
  const toast = useToast();
  const [departmentName, setDepartmentName] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setDepartmentName(props.initialName ?? "");
      setError("");
      setSaving(false);
    }
  });

  const save = async () => {
    const name = departmentName().trim();
    if (!name) {
      setError("Department name is required.");
      return;
    }
    setSaving(true);
    const path = props.apiPath ?? "/api/v1/hr/departments";
    const res = await apiFetch<CreatedDepartment>(path, {
      method: "POST",
      body: JSON.stringify({ department_name: name, status: "active" }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const msg = res.errors?.department_name ?? res.message ?? "Failed to create department.";
      setError(msg);
      toast.warning(msg);
      return;
    }
    props.onCreated(res.data);
    props.onClose();
  };

  return (
    <Modal open={props.open} title="New department" onClose={props.onClose} stacked>
      <div class="space-y-4">
        <Field label="Department name *">
          <input
            class={inputClass}
            value={departmentName()}
            onInput={(e) => setDepartmentName(e.currentTarget.value)}
            autofocus
          />
        </Field>
        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>
      </div>
      <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={saving() || departmentName().trim() === ""}
          onClick={() => void save()}
        >
          {saving() ? "Creating…" : "Create department"}
        </button>
      </div>
    </Modal>
  );
}

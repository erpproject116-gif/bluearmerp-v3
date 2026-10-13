import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { WideEntityModal } from "../../shared/WideEntityModal";
import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { LookupCombo } from "../../shared/LookupCombo";
import { CustomFieldsSection } from "../../shared/CustomFieldsSection";
import { useCustomValues } from "../../shared/useCustomValues";
import { fetchLocationOptions, fetchPartnerOptions } from "../../shared/useDocumentLookups";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { isTenantModuleEnabled } from "../../shared/moduleAccess";

type Row = { id: number; [key: string]: unknown };

async function svc<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch<T>(`/api/v1/services${path}`, init ?? {}, { silent: true });
  if (!res.success) {
    const detail = res.errors ? Object.values(res.errors).filter(Boolean).join(" ") : "";
    throw new Error(detail || res.message || "Request failed.");
  }
  return res.data as T;
}

export function ServiceRequestsPage() {
  const toast = useToast();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [q, setQ] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [subject, setSubject] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [source, setSource] = createSignal("manual");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [types, setTypes] = createSignal<{ id: number; name: string }[]>([]);
  const { customValues, setCustom, loadCustom } = useCustomValues();

  const load = async () => {
    const data = await svc<Row[]>(`/requests?q=${encodeURIComponent(q())}`);
    setRows(data ?? []);
  };
  const boot = async () => {
    try {
      setTypes((await svc<{ id: number; name: string }[]>("/types")) ?? []);
      await load();
    } catch (err) {
      toast.warning(err instanceof Error ? err.message : "Could not load requests.");
    }
  };
  onMount(() => {
    void boot();
  });

  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "request_no", header: "Request no." },
          { key: "subject", header: "Subject" },
          { key: "customer_name", header: "Customer" },
          { key: "status", header: "Status" },
          { key: "source", header: "Source" },
        ]}
        rows={rows()}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => {
          void svc(`/requests/${row.id}/convert`, { method: "POST", body: "{}" })
            .then(() => toast.success("Existing or new service job returned."))
            .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not convert."));
        }}
        onNew={() => {
          loadCustom({});
          setOpen(true);
        }}
        newLabel="New request"
        codeKey="request_no"
        nameKey="subject"
        search={q()}
        onSearchChange={(value) => {
          setQ(value);
          void load();
        }}
        settingsHref="/app/services/requests/settings"
        onRefresh={() => void load()}
        toolbarExtra={
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            disabled={selectedId() == null}
            onClick={() => {
              const id = selectedId();
              if (!id) return;
              void svc(`/requests/${id}/convert`, { method: "POST", body: "{}" })
                .then(() => toast.success("Existing or new service job returned."))
                .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not convert."));
            }}
          >
            Convert to job
          </button>
        }
      />
      <WideEntityModal
        open={open()}
        title="New service request"
        onClose={() => setOpen(false)}
        onSave={() => {
          void (async () => {
            try {
              await svc("/requests", {
                method: "POST",
                body: JSON.stringify({
                  subject: subject(),
                  service_type_id: Number(typeId()),
                  partner_id: partnerId(),
                  location_id: locationId(),
                  source: source(),
                  custom_values: customValues(),
                }),
              });
              toast.success("Request created.");
              setOpen(false);
              await load();
            } catch (err) {
              toast.warning(err instanceof Error ? err.message : "Could not save.");
            }
          })();
        }}
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <Field label="Subject">
            <input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
          </Field>
          <Field label="Service type">
            <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
              <option value="">Choose</option>
              <For each={types()}>{(type) => <option value={type.id}>{type.name}</option>}</For>
            </select>
          </Field>
          <LookupCombo
            label="Customer"
            value={partnerLabel}
            selectedId={partnerId}
            onInput={setPartnerLabel}
            onSelect={(option) => {
              setPartnerId(option.id);
              setPartnerLabel(option.label);
            }}
            onClear={() => {
              setPartnerId(null);
              setPartnerLabel("");
            }}
            fetchOptions={(query) => fetchPartnerOptions(query, "customer")}
          />
          <LookupCombo
            label="Branch"
            value={locationLabel}
            selectedId={locationId}
            onInput={setLocationLabel}
            onSelect={(option) => {
              setLocationId(option.id);
              setLocationLabel(option.label);
            }}
            onClear={() => {
              setLocationId(null);
              setLocationLabel("");
            }}
            fetchOptions={fetchLocationOptions}
          />
          <Field label="Source">
            <select class={inputClass} value={source()} onChange={(e) => setSource(e.currentTarget.value)}>
              <option value="walk_in">Walk-in</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="portal">Portal (recorded manually)</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
        </div>
        <CustomFieldsSection entityType="svc_request" values={customValues} onChange={setCustom} />
      </WideEntityModal>
    </>
  );
}

export function ServiceJobsPage() {
  const toast = useToast();
  const auth = useAuth();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [q, setQ] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Row | null>(null);
  const [subject, setSubject] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [types, setTypes] = createSignal<{ id: number; name: string; config?: { equipment_tracking?: boolean; internal?: boolean } }[]>([]);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [tab, setTab] = createSignal("general");
  const { customValues, setCustom, loadCustom } = useCustomValues();

  const load = async () => {
    setRows((await svc<Row[]>(`/jobs?q=${encodeURIComponent(q())}`)) ?? []);
  };
  onMount(() => {
    void (async () => {
      try {
        setTypes((await svc("/types")) ?? []);
        await load();
      } catch (err) {
        toast.warning(err instanceof Error ? err.message : "Could not load jobs.");
      }
    })();
  });

  const selectedType = () => types().find((type) => String(type.id) === typeId());
  const tracking = () => !!editing()?.type_config_snapshot && (editing()?.type_config_snapshot as { equipment_tracking?: boolean }).equipment_tracking;

  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "job_no", header: "Job no." },
          { key: "subject", header: "Subject" },
          { key: "customer_name", header: "Customer" },
          { key: "operational_status", header: "Operational" },
          { key: "approval_status", header: "Approval" },
          { key: "inventory_posting_status", header: "Inventory" },
          { key: "billing_status", header: "Billing" },
        ]}
        rows={rows()}
        selectedId={null}
        onSelect={() => undefined}
        onEdit={(row) => {
          setEditing(row);
          setSubject(String(row.subject ?? ""));
          setTypeId(String(row.service_type_id ?? ""));
          loadCustom((row.custom_values as Record<string, unknown> | undefined) ?? {});
          setOpen(true);
          void svc<Row>(`/jobs/${row.id}`).then((detail) => {
            setEditing(detail);
            setSubject(String(detail.subject ?? ""));
            setDescription(String(detail.description ?? ""));
            loadCustom((detail.custom_values as Record<string, unknown> | undefined) ?? {});
          }).catch(() => undefined);
        }}
        onNew={() => {
          setEditing(null);
          setSubject("");
          loadCustom({});
          setOpen(true);
        }}
        newLabel="New job order"
        codeKey="job_no"
        nameKey="subject"
        search={q()}
        onSearchChange={(value) => {
          setQ(value);
          void load();
        }}
        settingsHref="/app/services/jobs/settings"
        onRefresh={() => void load()}
      />
      <WideEntityModal
        open={open()}
        title={editing() ? `Job ${String(editing()?.job_no ?? "")}` : "New service job"}
        tabs={[
          { id: "general", label: "General" },
          { id: "equipment", label: "Equipment" },
          { id: "tasks", label: "Tasks" },
          { id: "technicians", label: "Technicians" },
          { id: "materials", label: "Materials" },
          { id: "commercial", label: "Commercial" },
          { id: "history", label: "History" },
        ]}
        activeTab={tab()}
        onTabChange={setTab}
        onClose={() => setOpen(false)}
        onSave={() => {
          void (async () => {
            try {
              if (editing()?.id) {
                await svc(`/jobs/${editing()!.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    subject: subject(),
                    description: description(),
                    row_version: editing()?.row_version,
                    custom_values: customValues(),
                  }),
                });
              } else {
                await svc("/jobs", {
                  method: "POST",
                  body: JSON.stringify({
                    subject: subject(),
                    description: description(),
                    service_type_id: Number(typeId()),
                    partner_id: partnerId(),
                    location_id: locationId(),
                    custom_values: customValues(),
                  }),
                });
              }
              toast.success("Job saved.");
              setOpen(false);
              await load();
            } catch (err) {
              toast.warning(err instanceof Error ? err.message : "Could not save.");
            }
          })();
        }}
      >
        <Show when={tab() === "general"}>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field label="Subject">
              <input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
            </Field>
            <Show when={!editing()}>
              <Field label="Service type">
                <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
                  <option value="">Choose</option>
                  <For each={types()}>{(type) => <option value={type.id}>{type.name}</option>}</For>
                </select>
              </Field>
              <LookupCombo label="Customer" value={partnerLabel} selectedId={partnerId} onInput={setPartnerLabel} onSelect={(o) => { setPartnerId(o.id); setPartnerLabel(o.label); }} onClear={() => { setPartnerId(null); setPartnerLabel(""); }} fetchOptions={(query) => fetchPartnerOptions(query, "customer")} />
              <LookupCombo label="Branch" value={locationLabel} selectedId={locationId} onInput={setLocationLabel} onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }} onClear={() => { setLocationId(null); setLocationLabel(""); }} fetchOptions={fetchLocationOptions} />
            </Show>
            <Field label="Work description">
              <textarea class={inputClass} rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
            </Field>
            <Show when={editing()}>
              <p class="text-sm text-text-secondary">Operational {String(editing()?.operational_status)} · Approval {String(editing()?.approval_status)} · Inventory {String(editing()?.inventory_posting_status)} · Billing {String(editing()?.billing_status)}</p>
              <Show when={hasPermission(auth.me, "services.jobs_confirm", "write")}>
                <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => void svc(`/jobs/${editing()!.id}/confirm`, { method: "POST", body: JSON.stringify({ row_version: editing()?.row_version }) }).then(() => toast.success("Confirmed. No stock or journal was created.")).catch((err) => toast.warning(err instanceof Error ? err.message : "Confirm failed."))}>Confirm</button>
              </Show>
            </Show>
            <Show when={selectedType()?.config?.internal}>
              <p class="text-sm text-text-secondary">Internal work does not require a customer.</p>
            </Show>
          </div>
          <CustomFieldsSection entityType="svc_job" values={customValues} onChange={setCustom} />
        </Show>
        <Show when={tab() === "equipment"}>
          <p class="text-sm text-text-secondary">{tracking() || selectedType()?.config?.equipment_tracking ? "Link customer equipment from the Equipment register. It does not change saleable stock." : "Equipment tracking is off for this service type."}</p>
        </Show>
        <Show when={tab() === "tasks" || tab() === "technicians" || tab() === "materials" || tab() === "commercial" || tab() === "history"}>
          <JobRelated tab={tab()} job={editing()} />
        </Show>
      </WideEntityModal>
    </>
  );
}

function JobRelated(props: { tab: string; job: Row | null }) {
  const toast = useToast();
  const [lines, setLines] = createSignal<Row[]>([]);
  const [checks, setChecks] = createSignal<Row[]>([]);
  const [name, setName] = createSignal("");
  const [employeeId, setEmployeeId] = createSignal("");
  const [itemCode, setItemCode] = createSignal("");
  const load = async () => {
    if (!props.job?.id) return;
    if (props.tab === "tasks") {
      setLines((await svc<Row[]>(`/jobs/${props.job.id}/tasks`)) ?? []);
      setChecks((await svc<Row[]>(`/jobs/${props.job.id}/checklists`)) ?? []);
    } else if (props.tab === "technicians") {
      setLines((await svc<Row[]>(`/jobs/${props.job.id}/assignments`)) ?? []);
    } else if (props.tab === "materials") {
      setLines((await svc<Row[]>(`/jobs/${props.job.id}/materials`)) ?? []);
    }
  };
  onMount(() => {
    void load().catch(() => undefined);
  });
  return (
    <div class="space-y-3 text-sm">
      <Show when={props.tab === "commercial"}>
        <p>Sales order {String(props.job?.sales_order_id ?? "none")}. Billing stays in Sales. This job does not create an invoice.</p>
      </Show>
      <Show when={props.tab === "history"}>
        <A href="/app/services/history" class="text-brand-700">Open service history</A>
      </Show>
      <Show when={props.tab === "tasks" && props.job?.id}>
        <div class="flex gap-2">
          <input class={inputClass} placeholder="Task" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <button type="button" class="rounded-lg border border-stroke px-3" onClick={() => {
            void svc(`/jobs/${props.job!.id}/tasks`, { method: "POST", body: JSON.stringify({ name: name() }) })
              .then(() => { setName(""); return load(); })
              .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not add the task."));
          }}>Add task</button>
        </div>
        <div class="space-y-1">
          <p class="font-medium">Checklist</p>
          <For each={checks()}>{(item) => (
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={!!item.is_done} onChange={(e) => {
                void svc(`/checklist-results/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_done: e.currentTarget.checked, remarks: String(item.remarks ?? "") }) }).then(() => load());
              }} />
              {String(item.label)}
            </label>
          )}</For>
        </div>
      </Show>
      <Show when={props.tab === "technicians" && props.job?.id}>
        <div class="flex gap-2">
          <input class={inputClass} placeholder="Employee id" value={employeeId()} onInput={(e) => setEmployeeId(e.currentTarget.value)} />
          <button type="button" class="rounded-lg border border-stroke px-3" onClick={() => {
            void svc(`/jobs/${props.job!.id}/assignments`, { method: "POST", body: JSON.stringify({ employee_id: Number(employeeId()) }) })
              .then(() => load())
              .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not assign the technician."));
          }}>Assign</button>
          <button type="button" class="rounded-lg border border-stroke px-3" onClick={() => {
            void svc(`/jobs/${props.job!.id}/time-entries`, { method: "POST", body: JSON.stringify({ employee_id: Number(employeeId()), minutes: 0, notes: "Recorded from the job." }) })
              .then(() => toast.success("Time recorded. Payroll was not updated."))
              .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not record time."));
          }}>Record time</button>
        </div>
      </Show>
      <Show when={props.tab === "materials" && props.job?.id}>
        <div class="flex gap-2">
          <input class={inputClass} placeholder="Item code (not stock)" value={itemCode()} onInput={(e) => setItemCode(e.currentTarget.value)} />
          <button type="button" class="rounded-lg border border-stroke px-3" onClick={() => {
            void svc(`/jobs/${props.job!.id}/materials`, { method: "POST", body: JSON.stringify({ item_code: itemCode(), required_qty: 1 }) })
              .then(() => { setItemCode(""); return load(); })
              .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not add the material."));
          }}>Add material</button>
        </div>
        <p class="text-text-secondary">Materials stay not posted. They do not change company stock.</p>
      </Show>
      <For each={lines()}>{(line) => <p>{String(line.name ?? line.employee_name ?? line.description ?? line.item_code ?? line.label ?? line.id)} {line.posting_status ? `· ${String(line.posting_status)}` : ""}</p>}</For>
    </div>
  );
}

export function CustomerEquipmentPage() {
  const toast = useToast();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [serial, setSerial] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const load = async () => setRows((await svc<Row[]>("/equipment")) ?? []);
  onMount(() => {
    void load().catch((err) => toast.warning(err instanceof Error ? err.message : "Could not load equipment."));
  });
  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "name", header: "Equipment" },
          { key: "serial_no", header: "Serial" },
          { key: "customer_name", header: "Customer" },
          { key: "custody_status", header: "Custody" },
          { key: "qty_in_custody", header: "In custody" },
        ]}
        rows={rows()}
        selectedId={null}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onNew={() => {
          loadCustom({});
          setOpen(true);
        }}
        newLabel="New equipment"
        codeKey="serial_no"
        nameKey="name"
        settingsHref="/app/services/equipment/settings"
        onRefresh={() => void load()}
      />
      <WideEntityModal open={open()} title="Customer equipment" onClose={() => setOpen(false)} onSave={() => {
        void svc("/equipment", { method: "POST", body: JSON.stringify({ name: name(), serial_no: serial(), is_serialized: serial().trim() !== "", partner_id: partnerId(), location_id: locationId(), qty: 1, custom_values: customValues() }) })
          .then(() => { toast.success("Equipment saved. Stock was not changed."); setOpen(false); return load(); })
          .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not save."));
      }}>
        <div class="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></Field>
          <Field label="Serial"><input class={inputClass} value={serial()} onInput={(e) => setSerial(e.currentTarget.value)} /></Field>
          <LookupCombo label="Customer" value={partnerLabel} selectedId={partnerId} onInput={setPartnerLabel} onSelect={(o) => { setPartnerId(o.id); setPartnerLabel(o.label); }} onClear={() => { setPartnerId(null); setPartnerLabel(""); }} fetchOptions={(query) => fetchPartnerOptions(query, "customer")} />
          <LookupCombo label="Branch" value={locationLabel} selectedId={locationId} onInput={setLocationLabel} onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }} onClear={() => { setLocationId(null); setLocationLabel(""); }} fetchOptions={fetchLocationOptions} />
        </div>
        <CustomFieldsSection entityType="svc_customer_equipment" values={customValues} onChange={setCustom} />
      </WideEntityModal>
    </>
  );
}

export function TechnicianSchedulePage() {
  const toast = useToast();
  const [rows, setRows] = createSignal<Row[]>([]);
  onMount(() => {
    void svc<Row[]>("/schedule").then(setRows).catch((err) => toast.warning(err instanceof Error ? err.message : "Could not load the schedule."));
  });
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-7">
        <For each={days}>{(day) => <div class="rounded-lg border border-stroke p-2 text-sm font-medium">{day}</div>}</For>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "job_no", header: "Job" },
          { key: "employee_name", header: "Technician" },
          { key: "scheduled_start", header: "Start", render: (row) => String(row.scheduled_start ?? "") },
          { key: "notes", header: "Notes" },
        ]}
        rows={rows()}
        selectedId={null}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onNew={() => undefined}
        showNew={false}
        codeKey="job_no"
        nameKey="employee_name"
        settingsHref="/app/services/jobs/settings"
      />
    </div>
  );
}

export function ServiceReleasePage() {
  const toast = useToast();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [open, setOpen] = createSignal(false);
  const [slipType, setSlipType] = createSignal("receiving");
  const [origin, setOrigin] = createSignal<number | null>(null);
  const [originLabel, setOriginLabel] = createSignal("");
  const [destination, setDestination] = createSignal<number | null>(null);
  const [destinationLabel, setDestinationLabel] = createSignal("");
  const [equipmentId, setEquipmentId] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const load = async () => setRows((await svc<Row[]>("/load-slips")) ?? []);
  onMount(() => {
    void load().catch((err) => toast.warning(err instanceof Error ? err.message : "Could not load slips."));
  });
  return (
    <>
      <SpreadsheetGrid
        columns={[
          { key: "slip_no", header: "Slip no." },
          { key: "slip_type", header: "Type" },
          { key: "status", header: "Status" },
          { key: "order_date", header: "Date" },
        ]}
        rows={rows()}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => { window.open(`/app/services/releases/${row.id}/print`, "_blank"); }}
        onNew={() => {
          loadCustom({});
          setOpen(true);
        }}
        newLabel="New slip"
        codeKey="slip_no"
        nameKey="slip_type"
        settingsHref="/app/services/releases/settings"
        onRefresh={() => void load()}
        toolbarExtra={
          <div class="flex flex-wrap gap-2">
            <For each={["submit", "approve", "dispatch", "receive", "release"]}>{(action) => (
              <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" disabled={selectedId() == null} onClick={() => {
                const id = selectedId();
                if (!id) return;
                void svc(`/load-slips/${id}/${action}`, { method: "POST", body: "{}" })
                  .then(() => { toast.success(`${action} completed. Company stock was not changed.`); return load(); })
                  .catch((err) => toast.warning(err instanceof Error ? err.message : "The slip action was denied."));
              }}>{action}</button>
            )}</For>
          </div>
        }
      />
      <WideEntityModal open={open()} title="Service release slip" onClose={() => setOpen(false)} onSave={() => {
        void svc("/load-slips", { method: "POST", body: JSON.stringify({
          slip_type: slipType(),
          origin_location_id: origin(),
          destination_location_id: destination(),
          items: equipmentId().trim() ? [{ equipment_id: Number(equipmentId()), qty: Number(qty()) || 1 }] : [],
          custom_values: customValues(),
        }) })
          .then(() => { toast.success("Slip created."); setOpen(false); return load(); })
          .catch((err) => toast.warning(err instanceof Error ? err.message : "Could not save."));
      }}>
        <Field label="Type">
          <select class={inputClass} value={slipType()} onChange={(e) => setSlipType(e.currentTarget.value)}>
            <option value="receiving">Receiving / check-in</option>
            <option value="internal_transfer">Internal transfer</option>
            <option value="outbound">Outbound load slip</option>
            <option value="release">Return / release</option>
          </select>
        </Field>
        <LookupCombo label="Origin branch" value={originLabel} selectedId={origin} onInput={setOriginLabel} onSelect={(o) => { setOrigin(o.id); setOriginLabel(o.label); }} onClear={() => { setOrigin(null); setOriginLabel(""); }} fetchOptions={fetchLocationOptions} />
        <LookupCombo label="Destination branch" value={destinationLabel} selectedId={destination} onInput={setDestinationLabel} onSelect={(o) => { setDestination(o.id); setDestinationLabel(o.label); }} onClear={() => { setDestination(null); setDestinationLabel(""); }} fetchOptions={fetchLocationOptions} />
        <Field label="Equipment id">
          <input class={inputClass} value={equipmentId()} onInput={(e) => setEquipmentId(e.currentTarget.value)} />
        </Field>
        <Field label="Quantity">
          <input class={inputClass} value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
        </Field>
        <CustomFieldsSection entityType="svc_load_slip" values={customValues} onChange={setCustom} />
        <p class="text-sm text-text-secondary">A serial is released whole. A quantity can be partial. This slip does not move company stock.</p>
      </WideEntityModal>
    </>
  );
}

export function ServiceHistoryPage() {
  const toast = useToast();
  const [rows, setRows] = createSignal<Row[]>([]);
  const [q, setQ] = createSignal("");
  const load = async () => setRows((await svc<Row[]>(`/history?q=${encodeURIComponent(q())}`)) ?? []);
  onMount(() => {
    void load().catch((err) => toast.warning(err instanceof Error ? err.message : "Could not load history."));
  });
  return (
    <SpreadsheetGrid
      columns={[
        { key: "created_at", header: "When", render: (row) => String(row.created_at ?? "") },
        { key: "entity_type", header: "Record" },
        { key: "action", header: "Action" },
        { key: "from_status", header: "From" },
        { key: "to_status", header: "To" },
      ]}
      rows={rows()}
      selectedId={null}
      onSelect={() => undefined}
      onEdit={() => undefined}
      onNew={() => undefined}
      showNew={false}
      codeKey="action"
      nameKey="entity_type"
      search={q()}
      onSearchChange={(value) => { setQ(value); void load(); }}
      settingsHref="/app/services/settings"
    />
  );
}

export function ServiceReportsPage() {
  const toast = useToast();
  const [summary, setSummary] = createSignal<Record<string, number> | null>(null);
  onMount(() => {
    void svc<Record<string, number>>("/reports/summary").then(setSummary).catch((err) => toast.warning(err instanceof Error ? err.message : "Could not load reports."));
  });
  const cards = () => {
    const data = summary();
    if (!data) return [];
    return Object.entries(data);
  };
  return (
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <For each={cards()}>
        {([key, value]) => (
          <div class="rounded-xl border border-stroke bg-surface p-4">
            <p class="text-sm text-text-secondary">{key.replaceAll("_", " ")}</p>
            <p class="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        )}
      </For>
      <p class="sm:col-span-2 text-sm text-text-secondary">Counts come from service records. They are not revenue or cost.</p>
    </div>
  );
}

export function ServiceSettingsPage() {
  const toast = useToast();
  const [prefix, setPrefix] = createSignal("SJO");
  const [mode, setMode] = createSignal("A");
  const [types, setTypes] = createSignal<{ id: number; name: string; code: string }[]>([]);
  const [name, setName] = createSignal("");
  const [code, setCode] = createSignal("");
  onMount(() => {
    void (async () => {
      try {
        const settings = await svc<{ integration_mode: string; number_prefix: string }>("/settings");
        setMode(settings.integration_mode);
        setPrefix(settings.number_prefix);
        setTypes((await svc("/types")) ?? []);
      } catch (err) {
        toast.warning(err instanceof Error ? err.message : "Could not load settings.");
      }
    })();
  });
  return (
    <div class="max-w-3xl space-y-4">
      <div class="rounded-xl border border-stroke bg-surface p-4">
        <h2 class="font-semibold">Integration</h2>
        <p class="mt-1 text-sm text-text-secondary">Mode {mode()} records service work only. Confirmation does not post inventory or accounting.</p>
        <Field label="Document prefix">
          <input class={inputClass} value={prefix()} onInput={(e) => setPrefix(e.currentTarget.value)} />
        </Field>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white" onClick={() => void svc("/settings", { method: "PATCH", body: JSON.stringify({ number_prefix: prefix(), integration_mode: "A" }) }).then(() => toast.success("Saved.")).catch((err) => toast.warning(err instanceof Error ? err.message : "Could not save."))}>Save</button>
      </div>
      <div class="rounded-xl border border-stroke bg-surface p-4">
        <h2 class="font-semibold">Service types</h2>
        <ul class="mt-2 space-y-1 text-sm">
          <For each={types()}>{(type) => <li>{type.name} ({type.code})</li>}</For>
        </ul>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <input class={inputClass} placeholder="Code" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
          <input class={inputClass} placeholder="Name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <button type="button" class="mt-3 rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => void svc("/types", { method: "POST", body: JSON.stringify({ code: code(), name: name(), config: {} }) }).then(() => svc<{ id: number; name: string; code: string }[]>("/types")).then(setTypes).catch((err) => toast.warning(err instanceof Error ? err.message : "Could not add the type."))}>Add type</button>
      </div>
    </div>
  );
}

export function ServiceRequestSettingsPage() {
  return <EntityFormSettingsPage entityType="svc_request" featureLabel="Service request" listHref="/app/services/requests" />;
}
export function ServiceJobSettingsPage() {
  return <EntityFormSettingsPage entityType="svc_job" featureLabel="Service job" listHref="/app/services/jobs" />;
}
export function ServiceEquipmentSettingsPage() {
  return <EntityFormSettingsPage entityType="svc_customer_equipment" featureLabel="Customer equipment" listHref="/app/services/equipment" />;
}
export function ServiceSlipSettingsPage() {
  return <EntityFormSettingsPage entityType="svc_load_slip" featureLabel="Service release" listHref="/app/services/releases" />;
}

export function ServiceJobGenerateButton(props: { salesOrderId: number | null }) {
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = createSignal(false);
  const [typeId, setTypeId] = createSignal("");
  const [types, setTypes] = createSignal<{ id: number; name: string }[]>([]);
  const visible = () => isTenantModuleEnabled(auth.me, "services") && hasPermission(auth.me, "services.jobs", "write");
  onMount(() => {
    if (!visible()) return;
    void svc<{ id: number; name: string }[]>("/types").then(setTypes).catch(() => undefined);
  });
  return (
    <Show when={visible()}>
      <div class="flex flex-wrap items-end gap-2">
        <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
          <option value="">Service type</option>
          <For each={types()}>{(type) => <option value={type.id}>{type.name}</option>}</For>
        </select>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          disabled={busy() || props.salesOrderId == null || typeId() === ""}
          onClick={() => {
            const id = props.salesOrderId;
            if (!id) return;
            setBusy(true);
            void svc<{ id: number; job_no?: string; created?: boolean }>(`/jobs/from-sales-order/${id}`, {
              method: "POST",
              body: JSON.stringify({ service_type_id: Number(typeId()) }),
            }).then((job) => {
              toast.success(job.created === false ? `Existing job ${job.job_no ?? ""} returned.` : `Service job ${job.job_no ?? ""} created.`);
            }).catch((err) => toast.warning(err instanceof Error ? err.message : "Could not create the service job.")).finally(() => setBusy(false));
          }}
        >
          {busy() ? "Working…" : "Generate service job"}
        </button>
      </div>
    </Show>
  );
}

export function ServiceJobsPanel(props: { salesOrderId: number | null }) {
  const auth = useAuth();
  const [rows, setRows] = createSignal<Row[]>([]);
  const visible = () => !!props.salesOrderId && isTenantModuleEnabled(auth.me, "services") && hasPermission(auth.me, "services.jobs", "write");
  const load = () => {
    if (!visible() || !props.salesOrderId) return;
    void svc<Row[]>(`/jobs?sales_order_id=${props.salesOrderId}`).then(setRows).catch(() => setRows([]));
  };
  onMount(load);
  return (
    <Show when={visible()}>
      <div class="col-span-full rounded-lg border border-stroke p-3">
        <h3 class="mb-2 text-sm font-semibold">Service jobs</h3>
        <Show when={rows().length === 0}><p class="text-sm text-text-secondary">No service job is linked.</p></Show>
        <ul class="space-y-1 text-sm">
          <For each={rows()}>
            {(row) => <li><A href="/app/services/jobs" class="text-brand-700">{String(row.job_no)}</A> · {String(row.operational_status)} · {String(row.approval_status)}</li>}
          </For>
        </ul>
      </div>
    </Show>
  );
}

import { A, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { apiBase } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { SignaturePad } from "../../shared/SignaturePad";
import "../careers/careers-surface.css";
import "./hr-surface.css";
import { DemoFillButton } from "./DemoFillButton";
import { buildApplyDemoFill } from "./hrDemoFill";
import { HrSteps, HrTcard } from "./HrUi";

type SchemaField = {
  field_key: string;
  kind?: string;
  label: string;
  field_type: string;
  is_required?: boolean;
  is_visible?: boolean;
  is_disabled?: boolean;
  is_active?: boolean;
  sort_order?: number;
  placeholder?: string;
};

type CustomField = {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options?: { value: string; label: string }[] | string;
};

type Row = Record<string, string>;

const FALLBACK_FIELDS: SchemaField[] = [
  { field_key: "position_desired", label: "Position Desired", field_type: "text" },
  { field_key: "application_date", label: "Date", field_type: "date" },
  { field_key: "full_name", label: "Name", field_type: "text", is_required: true },
  { field_key: "gender", label: "Gender", field_type: "text" },
  { field_key: "civil_status", label: "Civil Status", field_type: "text" },
  { field_key: "city_address", label: "City Address", field_type: "text" },
  { field_key: "provincial_address", label: "Provincial Address", field_type: "text" },
  { field_key: "telephone", label: "Telephone", field_type: "text" },
  { field_key: "cellphone", label: "Cellphone No.", field_type: "text" },
  { field_key: "email", label: "Email Address", field_type: "text" },
  { field_key: "birth_date", label: "Date of Birth", field_type: "date" },
  { field_key: "birthplace", label: "Birthplace", field_type: "text" },
  { field_key: "citizenship", label: "Citizenship", field_type: "text" },
  { field_key: "religion", label: "Religion", field_type: "text" },
  { field_key: "height", label: "Height", field_type: "text" },
  { field_key: "weight", label: "Weight", field_type: "text" },
  { field_key: "spouse_name", label: "Spouse", field_type: "text" },
  { field_key: "spouse_occupation", label: "Occupation", field_type: "text" },
  { field_key: "father_name", label: "Father's Name", field_type: "text" },
  { field_key: "father_occupation", label: "Father's Occupation", field_type: "text" },
  { field_key: "mother_name", label: "Mother's Name", field_type: "text" },
  { field_key: "mother_occupation", label: "Mother's Occupation", field_type: "text" },
  { field_key: "languages", label: "Languages or Dialects spoken", field_type: "text" },
  { field_key: "emergency_name", label: "Person to be notified in case of emergency", field_type: "text" },
  { field_key: "emergency_address", label: "Emergency address", field_type: "text" },
  { field_key: "emergency_phone", label: "Emergency phone", field_type: "text" },
  { field_key: "elementary_school", label: "Elementary", field_type: "text" },
  { field_key: "elementary_year", label: "Elementary year graduated", field_type: "text" },
  { field_key: "high_school", label: "High School", field_type: "text" },
  { field_key: "high_school_year", label: "High School year graduated", field_type: "text" },
  { field_key: "college", label: "College", field_type: "text" },
  { field_key: "college_year", label: "College year graduated", field_type: "text" },
  { field_key: "degree_received", label: "Degree Received", field_type: "text" },
  { field_key: "special_skills", label: "Special Skills", field_type: "textarea" },
  { field_key: "res_cert_no", label: "Res. Cert. No.", field_type: "text" },
  { field_key: "res_cert_issued_at", label: "Issued at", field_type: "text" },
  { field_key: "res_cert_issued_on", label: "Issued on", field_type: "date" },
  { field_key: "sss_no", label: "SSS", field_type: "text" },
  { field_key: "tin", label: "TIN", field_type: "text" },
  { field_key: "nbi_no", label: "NBI No.", field_type: "text" },
  { field_key: "passport_no", label: "Passport No.", field_type: "text" },
];

const WIDE_KEYS = new Set([
  "full_name",
  "city_address",
  "provincial_address",
  "email",
  "languages",
  "emergency_name",
  "emergency_address",
  "degree_received",
  "special_skills",
]);

const pairGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const STEPS = ["Personal and contact", "Children", "Work history", "Character References", "Documents", "Review and consent"];

function inputTypeFor(field: SchemaField): string {
  if (field.field_type === "date") return "date";
  if (field.field_type === "number") return "number";
  if (field.field_key === "email" || field.field_type === "email") return "email";
  return "text";
}

function isCustomKind(field: SchemaField) {
  return field.kind === "custom";
}

export default function ApplyPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const code = () => params.code ?? "";
  const jobId = () => {
    const raw = search.job;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const [values, setValues] = createSignal<Record<string, string>>({});
  const [children, setChildren] = createSignal<Row[]>([{ name: "", birth_date: "" }]);
  const [jobs, setJobs] = createSignal<Row[]>([{ company: "", position: "", from: "", to: "" }]);
  const [refs, setRefs] = createSignal<Row[]>([{ name: "", position: "", company: "", contact: "" }]);
  const [custom, setCustom] = createSignal<Record<string, string>>({});
  const [certified, setCertified] = createSignal(false);
  const [signature, setSignature] = createSignal<string | null>(null);
  const [selfie, setSelfie] = createSignal<File | null>(null);
  const [ids, setIds] = createSignal<File[]>([]);
  const [resume, setResume] = createSignal<File | null>(null);
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [step, setStep] = createSignal(0);

  createEffect(() => {
    step();
    window.scrollTo(0, 0);
  });

  const [openings] = createResource(
    () => code(),
    async (c) => {
      if (!c) return [] as { id: number; title: string; site_name: string; headcount: number }[];
      const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(c)}/openings`);
      const body = await res.json().catch(() => ({}));
      return (body.data ?? []) as { id: number; title: string; site_name: string; headcount: number }[];
    },
  );

  const selectedJob = createMemo(() => {
    const id = jobId();
    if (!id) return null;
    return (openings() ?? []).find((o) => o.id === id) ?? null;
  });

  onMount(() => {
    const token = localStorage.getItem(`apply-draft:${code()}`);
    if (!token) return;
    void fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(code())}/draft?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((body) => {
        const form = body.data?.form;
        if (form && typeof form === "object") setValues({ ...values(), ...(form as Record<string, string>) });
      })
      .catch(() => undefined);
  });

  createEffect(() => {
    const snapshot = { ...values() };
    const c = code();
    const handle = window.setTimeout(() => {
      if (!snapshot.full_name) return;
      localStorage.setItem(`apply-draft-json:${c}`, JSON.stringify(snapshot));
      const token = localStorage.getItem(`apply-draft:${c}`) ?? "";
      void fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(c)}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, form: snapshot }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (body.data?.token) localStorage.setItem(`apply-draft:${c}`, body.data.token);
        })
        .catch(() => undefined);
    }, 800);
    onCleanup(() => window.clearTimeout(handle));
  });

  const [form] = createResource(
    () => code(),
    async (c) => {
      const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(c)}`);
      const text = await res.text();
      let body: {
        data?: { custom_fields?: CustomField[]; fields?: SchemaField[]; company_code?: string };
        success?: boolean;
      } = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
      return { ...(body.data ?? {}), unavailable: !res.ok || body.success === false };
    },
  );

  const schemaFields = createMemo(() => {
    const fromApi = (form()?.fields ?? []).filter(
      (f) => f.field_type !== "file" && f.is_visible !== false && f.is_active !== false,
    );
    if (fromApi.length > 0) {
      return [...fromApi].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    const customs = (form()?.custom_fields ?? [])
      .filter((f) => f.field_type !== "file")
      .map(
        (f): SchemaField => ({
          field_key: f.field_key,
          kind: "custom",
          label: f.label,
          field_type: f.field_type,
          is_required: f.is_required,
        }),
      );
    return [...FALLBACK_FIELDS, ...customs];
  });

  const resumeDraftLocal = () => {
    try {
      const raw = localStorage.getItem(`apply-draft-json:${code()}`);
      if (!raw) {
        setMessage("No saved draft on this device.");
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      setValues({ ...values(), ...parsed });
      setMessage("Draft restored from this device.");
      setStep(0);
    } catch {
      setMessage("Could not restore draft.");
    }
  };

  const goNext = () => {
    if (step() === 0) {
      const missing = schemaFields().find((f) => {
        if (!f.is_required || f.is_disabled) return false;
        const val = isCustomKind(f) ? custom()[f.field_key] : values()[f.field_key];
        return !String(val ?? "").trim();
      });
      if (missing) {
        setMessage(`${missing.label} is required.`);
        return;
      }
      if (!values().full_name?.trim() && schemaFields().some((f) => f.field_key === "full_name")) {
        setMessage("Name is required.");
        return;
      }
    }
    setMessage("");
    setStep(Math.min(step() + 1, STEPS.length - 1));
  };

  const set = (key: string, value: string) => setValues({ ...values(), [key]: value });
  const setRow = (list: Row[], index: number, key: string, value: string) =>
    list.map((row, i) => (i === index ? { ...row, [key]: value } : row));

  const fillDemo = () => {
    const packed = buildApplyDemoFill({ openings: openings() ?? [] });
    setValues({ ...values(), ...packed.values });
    setCustom({ ...custom(), ...packed.custom });
    setChildren(packed.children);
    setJobs(packed.jobs);
    setRefs(packed.refs);
    setCertified(true);
    setSignature(packed.signature);
    setSelfie(packed.selfie);
    setIds(packed.ids);
    setResume(packed.resume);
    setMessage("Demo fill loaded — review steps, then Submit application.");
    setStep(0);
  };

  const fieldValue = (field: SchemaField) =>
    isCustomKind(field) ? (custom()[field.field_key] ?? "") : (values()[field.field_key] ?? "");

  const setFieldValue = (field: SchemaField, value: string) => {
    if (isCustomKind(field)) setCustom({ ...custom(), [field.field_key]: value });
    else set(field.field_key, value);
  };

  const submit = async () => {
    setMessage("");
    if (!values().full_name?.trim()) return setMessage("Name is required.");
    if (!certified()) return setMessage("Confirm that the information is true and correct.");
    if (!signature()) return setMessage("Signature is required.");
    const data = new FormData();
    for (const [key, value] of Object.entries(values())) data.append(key, value);
    data.set("certified", certified() ? "true" : "false");
    data.set("signature_data_url", signature() ?? "");
    data.set("children_json", JSON.stringify(children().filter((row) => row.name.trim())));
    data.set("jobs_json", JSON.stringify(jobs().filter((row) => row.company.trim() || row.position.trim())));
    data.set("references_json", JSON.stringify(refs().filter((row) => row.name.trim())));
    data.set("custom_values", JSON.stringify(custom()));
    const posting = jobId();
    if (posting) data.set("job_posting_id", String(posting));
    if (selfie()) data.set("selfie", selfie()!);
    for (const file of ids()) data.append("id_photos", file);
    if (resume()) data.set("resume", resume()!);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(code())}`, { method: "POST", body: data });
      const text = await res.text();
      let body: { success?: boolean; message?: string; errors?: Record<string, string>; data?: { duplicate?: boolean } } = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        setMessage("Could not save the application.");
        return;
      }
      if (!res.ok || body.success === false) {
        const first = body.errors ? Object.values(body.errors)[0] : body.message;
        setMessage(String(first || "Could not save the application."));
        return;
      }
      setMessage(body.data?.duplicate ? "Application received and attached to the existing person." : "Application received.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="careers-surface hr-surface">
      <header class="ap-top">
        <div class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-extrabold text-white" aria-hidden="true">
          B
        </div>
        <div>
          <b>Application</b>
          <div class="text-xs text-text-secondary hide-sm">Applicant self-service · BluearmERP</div>
        </div>
        <span class="grow" />
        <nav class="flex flex-wrap items-center gap-3 text-sm" aria-label="Application">
          <A href={`/careers/${encodeURIComponent(code())}`}>Job board</A>
          <A href={`#track`} class="text-text-secondary" onClick={(e) => e.preventDefault()}>
            Track
          </A>
          <button type="button" class="text-text-secondary hover:underline" onClick={resumeDraftLocal}>
            Resume draft
          </button>
          <DemoFillButton always onFill={fillDemo} label="Auto fill" />
        </nav>
      </header>

      <main class="ap-wrap mx-auto max-w-3xl pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
        <Show when={selectedJob()}>
          {(job) => (
            <div class="job-card mb-4 flex flex-wrap items-center gap-3">
              <div class="grow" style={{ "min-width": "200px" }}>
                <div class="text-xs text-text-secondary">You are applying for</div>
                <b>{job().title}</b>
                <div class="text-xs text-text-secondary">
                  {job().site_name} · {job().headcount} {job().headcount === 1 ? "slot" : "slots"}
                </div>
              </div>
              <A class="hr-btn hr-btn-sm" href={`/careers/${encodeURIComponent(code())}`}>
                Change job
              </A>
            </div>
          )}
        </Show>
        <Show when={!selectedJob() && jobId() && !openings.loading}>
          <div class="job-card mb-4">
            <div class="text-xs text-text-secondary">You are applying for</div>
            <b>General application (pooling)</b>
            <div class="text-xs text-text-secondary">Selected opening was not found · any suitable role</div>
          </div>
        </Show>
        <Show when={!jobId()}>
          <div class="job-card mb-4 flex flex-wrap items-center gap-3">
            <div class="grow" style={{ "min-width": "200px" }}>
              <div class="text-xs text-text-secondary">You are applying for</div>
              <b>General application (pooling)</b>
              <div class="text-xs text-text-secondary">Any suitable opening</div>
            </div>
            <A class="hr-btn hr-btn-sm" href={`/careers/${encodeURIComponent(code())}`}>
              Browse jobs
            </A>
          </div>
        </Show>

        <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h1 class="text-2xl font-bold">Application form</h1>
          <DemoFillButton always onFill={fillDemo} label="Auto fill" />
        </div>
        <p class="mb-2 text-sm text-text-secondary">
          Step {step() + 1} of {STEPS.length} · You can leave and come back; a draft is saved on this device.
        </p>
        <HrSteps steps={STEPS.map((label, i) => `${i + 1}. ${label}`)} current={step()} onSelect={setStep} />
        <HrTcard class="mb-4">
          <div class="p-4">
            <Show when={form()?.unavailable}>
              <p class="mb-3">This application form is not available.</p>
            </Show>
            <section class={step() === 0 ? "" : "hidden"}>
              <h2 class="mb-3 text-base font-semibold">{STEPS[0]}</h2>
              <div class="grid grid-cols-1 gap-3 min-[1024px]:grid-cols-2">
                <For each={schemaFields()}>
                  {(field) => (
                    <Field
                      label={`${field.label}${field.is_required ? " *" : ""}`}
                      span={WIDE_KEYS.has(field.field_key) || field.field_type === "textarea" ? "full" : undefined}
                    >
                      <Show
                        when={field.field_type === "textarea"}
                        fallback={
                          <input
                            class={inputClass}
                            type={inputTypeFor(field)}
                            placeholder={field.placeholder ?? ""}
                            disabled={field.is_disabled}
                            required={field.is_required}
                            value={fieldValue(field)}
                            onInput={(e) => setFieldValue(field, e.currentTarget.value)}
                          />
                        }
                      >
                        <textarea
                          class={inputClass}
                          rows={3}
                          placeholder={field.placeholder ?? ""}
                          disabled={field.is_disabled}
                          required={field.is_required}
                          value={fieldValue(field)}
                          onInput={(e) => setFieldValue(field, e.currentTarget.value)}
                        />
                      </Show>
                    </Field>
                  )}
                </For>
              </div>
            </section>
            <section class={step() === 1 ? "mt-0" : "hidden"}>
              <h2 class="mb-3 text-base font-semibold">{STEPS[1]}</h2>
              <For each={children()}>
                {(row, index) => (
                  <div class={`${pairGrid} mb-3`}>
                    <Field label="Name">
                      <input
                        class={inputClass}
                        value={row.name}
                        onInput={(e) => setChildren(setRow(children(), index(), "name", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Date of Birth">
                      <input
                        type="date"
                        class={inputClass}
                        value={row.birth_date}
                        onInput={(e) => setChildren(setRow(children(), index(), "birth_date", e.currentTarget.value))}
                      />
                    </Field>
                  </div>
                )}
              </For>
              <button
                type="button"
                class="min-h-11 rounded border border-stroke px-3 py-2"
                onClick={() => setChildren([...children(), { name: "", birth_date: "" }])}
              >
                Add child
              </button>
            </section>
            <section class={step() === 2 ? "" : "hidden"}>
              <h2 class="mb-3 text-base font-semibold">{STEPS[2]}</h2>
              <For each={jobs()}>
                {(row, index) => (
                  <div class={`${pairGrid} mb-3`}>
                    <Field label="Company">
                      <input
                        class={inputClass}
                        value={row.company}
                        onInput={(e) => setJobs(setRow(jobs(), index(), "company", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Position">
                      <input
                        class={inputClass}
                        value={row.position}
                        onInput={(e) => setJobs(setRow(jobs(), index(), "position", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="From">
                      <input
                        type="date"
                        class={inputClass}
                        value={row.from}
                        onInput={(e) => setJobs(setRow(jobs(), index(), "from", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="To">
                      <input
                        type="date"
                        class={inputClass}
                        value={row.to}
                        onInput={(e) => setJobs(setRow(jobs(), index(), "to", e.currentTarget.value))}
                      />
                    </Field>
                  </div>
                )}
              </For>
              <button
                type="button"
                class="min-h-11 rounded border border-stroke px-3 py-2"
                onClick={() => setJobs([...jobs(), { company: "", position: "", from: "", to: "" }])}
              >
                Add job
              </button>
            </section>
            <section class={step() === 3 ? "" : "hidden"}>
              <h2 class="mb-3 text-base font-semibold">{STEPS[3]}</h2>
              <For each={refs()}>
                {(row, index) => (
                  <div class={`${pairGrid} mb-3`}>
                    <Field label="Name">
                      <input
                        class={inputClass}
                        value={row.name}
                        onInput={(e) => setRefs(setRow(refs(), index(), "name", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Position">
                      <input
                        class={inputClass}
                        value={row.position}
                        onInput={(e) => setRefs(setRow(refs(), index(), "position", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        class={inputClass}
                        value={row.company}
                        onInput={(e) => setRefs(setRow(refs(), index(), "company", e.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Contact No.">
                      <input
                        class={inputClass}
                        value={row.contact}
                        onInput={(e) => setRefs(setRow(refs(), index(), "contact", e.currentTarget.value))}
                      />
                    </Field>
                  </div>
                )}
              </For>
              <button
                type="button"
                class="min-h-11 rounded border border-stroke px-3 py-2"
                onClick={() => setRefs([...refs(), { name: "", position: "", company: "", contact: "" }])}
              >
                Add reference
              </button>
            </section>
            <section class={step() === 4 ? "mt-0" : "hidden"}>
              <h2 class="mb-3 text-base font-semibold">{STEPS[4]}</h2>
              <div class={pairGrid}>
                <Field label="Selfie">
                  <input
                    class={inputClass}
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSelfie(e.currentTarget.files?.[0] ?? null)}
                  />
                </Field>
                <Field label="Valid ID photos">
                  <input
                    class={inputClass}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setIds(Array.from(e.currentTarget.files ?? []))}
                  />
                </Field>
                <Field label="Resume" span="full">
                  <input
                    class={inputClass}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setResume(e.currentTarget.files?.[0] ?? null)}
                  />
                </Field>
              </div>
              <p class="mt-3 text-xs text-text-secondary">
                Extra file-type custom fields on the public form are not enabled yet.
              </p>
            </section>
            <section class={step() === 5 ? "space-y-3" : "hidden"}>
              <h2 class="text-base font-semibold">{STEPS[5]}</h2>
              <label class="flex min-h-11 items-start gap-2">
                <input
                  class="mt-1 h-5 w-5"
                  type="checkbox"
                  checked={certified()}
                  onChange={(e) => setCertified(e.currentTarget.checked)}
                />
                <span>I hereby certify that the above information is true and correct to the best of my knowledge and belief.</span>
              </label>
              <p class="text-xs text-text-secondary">Signature</p>
              <SignaturePad onChange={setSignature} />
            </section>
            <Show when={message()}>
              <p class="mt-4">{message()}</p>
            </Show>
            <div class="mt-4 flex gap-2">
              <Show when={step() > 0}>
                <button
                  type="button"
                  class="min-h-11 flex-1 rounded-lg border border-stroke px-4 py-2"
                  onClick={() => {
                    setMessage("");
                    setStep(step() - 1);
                  }}
                >
                  Back
                </button>
              </Show>
              <Show
                when={step() < STEPS.length - 1}
                fallback={
                  <button
                    type="button"
                    class="min-h-11 flex-1 rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-60"
                    disabled={busy()}
                    onClick={() => void submit()}
                  >
                    {busy() ? "Saving…" : "Submit application"}
                  </button>
                }
              >
                <button type="button" class="min-h-11 flex-1 rounded-lg bg-brand-600 px-4 py-2 text-white" onClick={goNext}>
                  Next
                </button>
              </Show>
            </div>
          </div>
        </HrTcard>
      </main>
    </div>
  );
}

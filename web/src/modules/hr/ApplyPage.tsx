import { useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { apiBase } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { SignaturePad } from "../../shared/SignaturePad";

type CustomField = { field_key: string; label: string; field_type: string; is_required: boolean; options?: { value: string; label: string }[] | string };
type Row = Record<string, string>;

const textFields: { key: string; label: string; type?: string; wide?: boolean }[] = [
  { key: "position_desired", label: "Position Desired" },
  { key: "application_date", label: "Date", type: "date" },
  { key: "full_name", label: "Name", wide: true },
  { key: "gender", label: "Gender" },
  { key: "civil_status", label: "Civil Status" },
  { key: "city_address", label: "City Address", wide: true },
  { key: "provincial_address", label: "Provincial Address", wide: true },
  { key: "telephone", label: "Telephone" },
  { key: "cellphone", label: "Cellphone No." },
  { key: "email", label: "Email Address", type: "email", wide: true },
  { key: "birth_date", label: "Date of Birth", type: "date" },
  { key: "birthplace", label: "Birthplace" },
  { key: "citizenship", label: "Citizenship" },
  { key: "religion", label: "Religion" },
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "spouse_name", label: "Spouse" },
  { key: "spouse_occupation", label: "Occupation" },
  { key: "father_name", label: "Father's Name" },
  { key: "father_occupation", label: "Father's Occupation" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "mother_occupation", label: "Mother's Occupation" },
  { key: "languages", label: "Languages or Dialects spoken", wide: true },
  { key: "emergency_name", label: "Person to be notified in case of emergency", wide: true },
  { key: "emergency_address", label: "Emergency address", wide: true },
  { key: "emergency_phone", label: "Emergency phone" },
  { key: "elementary_school", label: "Elementary" },
  { key: "elementary_year", label: "Elementary year graduated" },
  { key: "high_school", label: "High School" },
  { key: "high_school_year", label: "High School year graduated" },
  { key: "college", label: "College" },
  { key: "college_year", label: "College year graduated" },
  { key: "degree_received", label: "Degree Received", wide: true },
  { key: "special_skills", label: "Special Skills", wide: true },
  { key: "res_cert_no", label: "Res. Cert. No." },
  { key: "res_cert_issued_at", label: "Issued at" },
  { key: "res_cert_issued_on", label: "Issued on", type: "date" },
  { key: "sss_no", label: "SSS" },
  { key: "tin", label: "TIN" },
  { key: "nbi_no", label: "NBI No." },
  { key: "passport_no", label: "Passport No." },
];

const pairGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2";
const STEPS = ["Personal and contact", "Children", "Work history", "Character References", "Documents", "Review and consent"];

export default function ApplyPage() {
  const params = useParams();
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

  const [form] = createResource(async () => {
    const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(params.code ?? "")}`);
    const text = await res.text();
    let body: { data?: { custom_fields?: CustomField[] }; success?: boolean } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    return { ...(body.data ?? {}), unavailable: !res.ok || body.success === false };
  });

  const goNext = () => {
    if (step() === 0 && !values().full_name?.trim()) {
      setMessage("Name is required.");
      return;
    }
    setMessage("");
    setStep(Math.min(step() + 1, STEPS.length - 1));
  };

  const set = (key: string, value: string) => setValues({ ...values(), [key]: value });
  const setRow = (list: Row[], index: number, key: string, value: string) => list.map((row, i) => (i === index ? { ...row, [key]: value } : row));

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
    if (selfie()) data.set("selfie", selfie()!);
    for (const file of ids()) data.append("id_photos", file);
    if (resume()) data.set("resume", resume()!);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/hr/apply/${encodeURIComponent(params.code ?? "")}`, { method: "POST", body: data });
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
    <main class="mx-auto min-h-screen w-full max-w-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-sm">
      <h1 class="mb-1 text-xl font-semibold">Application form</h1>
      <p class="mb-4 text-text-secondary">Step {step() + 1} of {STEPS.length}</p>
      <Show when={form()?.unavailable}><p class="mb-3">This application form is not available.</p></Show>
      <section class={step() === 0 ? "" : "hidden"}>
        <h2 class="mb-3 text-base font-semibold">{STEPS[0]}</h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={textFields}>
            {(field) => (
              <Field label={field.label} span={field.wide ? "full" : undefined}>
                <input class={inputClass} type={field.type ?? "text"} value={values()[field.key] ?? ""} onInput={(e) => set(field.key, e.currentTarget.value)} />
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
              <Field label="Name"><input class={inputClass} value={row.name} onInput={(e) => setChildren(setRow(children(), index(), "name", e.currentTarget.value))} /></Field>
              <Field label="Date of Birth"><input type="date" class={inputClass} value={row.birth_date} onInput={(e) => setChildren(setRow(children(), index(), "birth_date", e.currentTarget.value))} /></Field>
            </div>
          )}
        </For>
        <button type="button" class="min-h-11 rounded border border-stroke px-3 py-2" onClick={() => setChildren([...children(), { name: "", birth_date: "" }])}>Add child</button>
      </section>
      <section class={step() === 2 ? "" : "hidden"}>
        <h2 class="mb-3 text-base font-semibold">{STEPS[2]}</h2>
        <For each={jobs()}>
          {(row, index) => (
            <div class={`${pairGrid} mb-3`}>
              <Field label="Company"><input class={inputClass} value={row.company} onInput={(e) => setJobs(setRow(jobs(), index(), "company", e.currentTarget.value))} /></Field>
              <Field label="Position"><input class={inputClass} value={row.position} onInput={(e) => setJobs(setRow(jobs(), index(), "position", e.currentTarget.value))} /></Field>
              <Field label="From"><input type="date" class={inputClass} value={row.from} onInput={(e) => setJobs(setRow(jobs(), index(), "from", e.currentTarget.value))} /></Field>
              <Field label="To"><input type="date" class={inputClass} value={row.to} onInput={(e) => setJobs(setRow(jobs(), index(), "to", e.currentTarget.value))} /></Field>
            </div>
          )}
        </For>
        <button type="button" class="min-h-11 rounded border border-stroke px-3 py-2" onClick={() => setJobs([...jobs(), { company: "", position: "", from: "", to: "" }])}>Add job</button>
      </section>
      <section class={step() === 3 ? "" : "hidden"}>
        <h2 class="mb-3 text-base font-semibold">{STEPS[3]}</h2>
        <For each={refs()}>
          {(row, index) => (
            <div class={`${pairGrid} mb-3`}>
              <Field label="Name"><input class={inputClass} value={row.name} onInput={(e) => setRefs(setRow(refs(), index(), "name", e.currentTarget.value))} /></Field>
              <Field label="Position"><input class={inputClass} value={row.position} onInput={(e) => setRefs(setRow(refs(), index(), "position", e.currentTarget.value))} /></Field>
              <Field label="Company"><input class={inputClass} value={row.company} onInput={(e) => setRefs(setRow(refs(), index(), "company", e.currentTarget.value))} /></Field>
              <Field label="Contact No."><input class={inputClass} value={row.contact} onInput={(e) => setRefs(setRow(refs(), index(), "contact", e.currentTarget.value))} /></Field>
            </div>
          )}
        </For>
        <button type="button" class="min-h-11 rounded border border-stroke px-3 py-2" onClick={() => setRefs([...refs(), { name: "", position: "", company: "", contact: "" }])}>Add reference</button>
      </section>
      <section class={step() === 4 ? pairGrid : "hidden"}>
        <For each={(form()?.custom_fields ?? []).filter((field) => field.field_type !== "file")}>
          {(field) => (
            <Field label={field.label}>
              <input class={inputClass} value={custom()[field.field_key] ?? ""} onInput={(e) => setCustom({ ...custom(), [field.field_key]: e.currentTarget.value })} />
            </Field>
          )}
        </For>
      </section>
      <section class={step() === 4 ? "mt-6" : "hidden"}>
        <h2 class="mb-3 text-base font-semibold">{STEPS[4]}</h2>
        <div class={pairGrid}>
          <Field label="Selfie"><input class={inputClass} type="file" accept="image/*" onChange={(e) => setSelfie(e.currentTarget.files?.[0] ?? null)} /></Field>
          <Field label="Valid ID photos"><input class={inputClass} type="file" accept="image/*" multiple onChange={(e) => setIds(Array.from(e.currentTarget.files ?? []))} /></Field>
          <Field label="Resume" span="full"><input class={inputClass} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setResume(e.currentTarget.files?.[0] ?? null)} /></Field>
        </div>
      </section>
      <section class={step() === 5 ? "space-y-3" : "hidden"}>
        <h2 class="text-base font-semibold">{STEPS[5]}</h2>
        <label class="flex min-h-11 items-start gap-2">
          <input class="mt-1 h-5 w-5" type="checkbox" checked={certified()} onChange={(e) => setCertified(e.currentTarget.checked)} />
          <span>I hereby certify that the above information is true and correct to the best of my knowledge and belief.</span>
        </label>
        <p class="text-xs text-text-secondary">Signature</p>
        <SignaturePad onChange={setSignature} />
      </section>
      <Show when={message()}><p class="mt-4">{message()}</p></Show>
      <div class="mt-4 flex gap-2">
        <Show when={step() > 0}>
          <button type="button" class="min-h-11 flex-1 rounded-lg border border-stroke px-4 py-2" onClick={() => { setMessage(""); setStep(step() - 1); }}>Back</button>
        </Show>
        <Show when={step() < STEPS.length - 1} fallback={
          <button type="button" class="min-h-11 flex-1 rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-60" disabled={busy()} onClick={() => void submit()}>
            {busy() ? "Saving…" : "Submit application"}
          </button>
        }>
          <button type="button" class="min-h-11 flex-1 rounded-lg bg-brand-600 px-4 py-2 text-white" onClick={goNext}>Next</button>
        </Show>
      </div>
    </main>
  );
}

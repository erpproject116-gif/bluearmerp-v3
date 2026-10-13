import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Course = { id: number; code: string; title: string; is_mandatory: boolean; pass_mark: number };
type Assignment = {
  id: number; course_code?: string; course_title?: string; employee_no?: string; employee_name?: string;
  status: string; due_date?: string | null;
};

export default function LearningPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [courseId, setCourseId] = createSignal("");
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [due, setDue] = createSignal("");
  const [courseOpen, setCourseOpen] = createSignal(false);
  const [assignOpen, setAssignOpen] = createSignal(false);
  const [courseCode, setCourseCode] = createSignal("");
  const [courseTitle, setCourseTitle] = createSignal("");
  const [passMark, setPassMark] = createSignal("");

  const courses = createQuery(() => ({
    queryKey: ["hr-courses"],
    queryFn: async () => (await apiFetch<Course[]>("/api/v1/hr/learning/courses")).data ?? [],
  }));
  const assignments = createQuery(() => ({
    queryKey: ["hr-learning-assignments"],
    queryFn: async () => (await apiFetch<Assignment[]>("/api/v1/hr/learning/assignments")).data ?? [],
  }));
  const compliance = createQuery(() => ({
    queryKey: ["hr-learning-compliance"],
    queryFn: async () => (await apiFetch<Assignment[]>("/api/v1/hr/learning/compliance")).data ?? [],
  }));

  const assign = async () => {
    if (!courseId() || !empId()) return toast.warning("Course and employee required.");
    const res = await apiFetch("/api/v1/hr/learning/assignments", {
      method: "POST",
      body: JSON.stringify({ course_id: Number(courseId()), employee_id: empId(), due_date: due() || undefined }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Assigned.");
    setAssignOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-learning-assignments"] });
    void qc.invalidateQueries({ queryKey: ["hr-learning-compliance"] });
  };

  const createCourse = async () => {
    if (!courseCode().trim() || !courseTitle().trim()) return toast.warning("Code and title required.");
    const mark = Number(passMark());
    const res = await apiFetch("/api/v1/hr/learning/courses", {
      method: "POST",
      body: JSON.stringify({
        code: courseCode().trim(),
        title: courseTitle().trim(),
        pass_mark: mark > 0 ? mark : undefined,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not create the course.");
    toast.success("Course created.");
    setCourseCode("");
    setCourseTitle("");
    setPassMark("");
    setCourseOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-courses"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Learning</h1>
      <p class="mb-6 text-sm text-text-secondary">Built-in courses and quizzes (no SCORM). Assignments can auto-link from hire onboarding.</p>

      <div class="mb-4 flex flex-wrap gap-2">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setCourseOpen(true)}>
          New course
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setAssignOpen(true)}>
          Assign
        </button>
      </div>
      <EntityModal open={courseOpen()} title="New course" onClose={() => setCourseOpen(false)} onSave={() => void createCourse()} saveLabel="Create course">
        <Field label="Code"><input class={inputClass} value={courseCode()} onInput={(e) => setCourseCode(e.currentTarget.value)} /></Field>
        <Field label="Title"><input class={inputClass} value={courseTitle()} onInput={(e) => setCourseTitle(e.currentTarget.value)} /></Field>
        <Field label="Pass mark">
          <input class={inputClass} value={passMark()} placeholder="70" onInput={(e) => setPassMark(e.currentTarget.value)} />
        </Field>
      </EntityModal>
      <EntityModal open={assignOpen()} title="Assign course" onClose={() => setAssignOpen(false)} onSave={() => void assign()} saveLabel="Assign">
        <Field label="Course">
          <select class={inputClass} value={courseId()} onChange={(e) => setCourseId(e.currentTarget.value)}>
            <option value="">Select…</option>
            <For each={courses.data ?? []}>{(c) => <option value={c.id}>{c.code} — {c.title}</option>}</For>
          </select>
        </Field>
        <LookupCombo
          label="Employee"
          value={empLabel}
          selectedId={empId}
          onInput={setEmpLabel}
          onSelect={(o) => { setEmpId(o.id); setEmpLabel(o.label); }}
          onClear={() => { setEmpId(null); setEmpLabel(""); }}
          fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
          placeholder="Search employees…"
        />
        <Field label="Due"><input type="date" class={inputClass} value={due()} onInput={(e) => setDue(e.currentTarget.value)} /></Field>
      </EntityModal>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Courses</h2>
        <For each={courses.data ?? []} fallback={<p class="text-sm text-text-secondary">No courses.</p>}>
          {(c) => (
            <div class="mb-1 text-sm">
              <span class="font-medium">{c.code}</span> — {c.title}
              {c.is_mandatory ? " · mandatory" : ""} · pass {c.pass_mark}%
            </div>
          )}
        </For>
      </section>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Assignments</h2>
        <For each={assignments.data ?? []} fallback={<p class="text-sm text-text-secondary">None.</p>}>
          {(a) => (
            <div class="mb-1 text-sm">
              {a.employee_no} — {a.course_code} · {a.status}
              <Show when={a.due_date}> · due {a.due_date}</Show>
            </div>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Compliance (overdue / incomplete mandatory)</h2>
        <For each={compliance.data ?? []} fallback={<p class="text-sm text-text-secondary">All clear.</p>}>
          {(a) => (
            <div class="mb-1 text-sm text-amber-900">
              {a.employee_no} — {a.course_title} · {a.status} · due {a.due_date ?? "—"}
            </div>
          )}
        </For>
      </section>
    </HrLayout>
  );
}

import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useEmployees } from "../../shared/useHr";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
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
  const emps = useEmployees(() => ({ page: 1, pageSize: 200, status: "active" }));
  const [courseId, setCourseId] = createSignal("");
  const [empId, setEmpId] = createSignal("");
  const [due, setDue] = createSignal("");

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
      body: JSON.stringify({ course_id: Number(courseId()), employee_id: Number(empId()), due_date: due() || undefined }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Assigned.");
    void qc.invalidateQueries({ queryKey: ["hr-learning-assignments"] });
    void qc.invalidateQueries({ queryKey: ["hr-learning-compliance"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Learning</h1>
      <p class="mb-6 text-sm text-text-secondary">Built-in courses and quizzes (no SCORM). Assignments can auto-link from hire onboarding.</p>

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
        <h2 class="mb-3 text-lg font-medium">Assign</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <Field label="Course">
            <select class={inputClass} value={courseId()} onChange={(e) => setCourseId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={courses.data ?? []}>{(c) => <option value={c.id}>{c.code} — {c.title}</option>}</For>
            </select>
          </Field>
          <Field label="Employee">
            <select class={inputClass} value={empId()} onChange={(e) => setEmpId(e.currentTarget.value)}>
              <option value="">Select…</option>
              <For each={emps.data?.rows ?? []}>{(e) => <option value={e.id}>{e.employee_no} — {e.full_name}</option>}</For>
            </select>
          </Field>
          <Field label="Due"><input type="date" class={inputClass} value={due()} onInput={(e) => setDue(e.currentTarget.value)} /></Field>
        </div>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void assign()}>Assign</button>
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

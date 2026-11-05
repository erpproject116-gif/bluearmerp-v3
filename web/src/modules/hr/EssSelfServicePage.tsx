import { A } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { ProtectedRoute } from "../../shared/ProtectedRoute";
import { formatPeso } from "../../shared/money";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { DemoFillButton } from "./DemoFillButton";
import {
  buildCorrDemoFill,
  buildEssRequestDemoFill,
  buildLeaveDemoFill,
  buildOtDemoFill,
} from "./hrDemoFill";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrNotice, HrPageHead, HrSteps, type HrBadgeTone } from "./HrUi";
import "./ess-surface.css";

type Screen =
  | "home"
  | "clock"
  | "time"
  | "corr"
  | "ot"
  | "hist"
  | "lv"
  | "lvw"
  | "pay"
  | "slip"
  | "ytd"
  | "gov"
  | "2316"
  | "req"
  | "loan"
  | "adv"
  | "disp"
  | "coe"
  | "resg"
  | "more"
  | "prof"
  | "docs"
  | "nte"
  | "evs"
  | "lrn"
  | "set"
  | "help";

type Tab = "home" | "time" | "pay" | "req" | "more";

const TAB_OF: Partial<Record<Screen, Tab>> = {
  home: "home",
  clock: "home",
  time: "time",
  corr: "time",
  ot: "time",
  hist: "time",
  lv: "req",
  lvw: "req",
  pay: "pay",
  slip: "pay",
  ytd: "pay",
  gov: "pay",
  "2316": "pay",
  req: "req",
  loan: "req",
  adv: "req",
  disp: "req",
  coe: "req",
  resg: "req",
  more: "more",
  prof: "more",
  docs: "more",
  nte: "more",
  evs: "more",
  lrn: "more",
  set: "more",
  help: "more",
};

const BACK: Partial<Record<Screen, Screen>> = {
  clock: "home",
  corr: "time",
  ot: "time",
  hist: "time",
  lvw: "lv",
  slip: "pay",
  ytd: "pay",
  gov: "pay",
  "2316": "pay",
  loan: "req",
  adv: "req",
  disp: "req",
  coe: "req",
  resg: "req",
  prof: "more",
  docs: "more",
  nte: "docs",
  evs: "more",
  lrn: "more",
  set: "more",
  help: "more",
};

const TITLES: Record<Screen, string> = {
  home: "My HR",
  clock: "Clock in",
  time: "Time",
  corr: "Time correction",
  ot: "File overtime",
  hist: "Attendance history",
  lv: "Leave",
  lvw: "File leave",
  pay: "Pay",
  slip: "Payslip",
  ytd: "YTD & 13th month",
  gov: "Government contributions",
  "2316": "BIR Form 2316",
  req: "Requests",
  loan: "Loan request",
  adv: "Salary advance",
  disp: "Pay question",
  coe: "Certificate request",
  resg: "Resignation",
  more: "More",
  prof: "Profile",
  docs: "Documents",
  nte: "Reply to memo",
  evs: "Evaluations",
  lrn: "Learning",
  set: "Settings & security",
  help: "Help & FAQ",
};

type EssMe = {
  id: number;
  employee_no: string;
  full_name: string;
  department: string;
  job_title: string;
  tin?: string;
  sss_no?: string;
  philhealth_no?: string;
  pagibig_no?: string;
  tax_status?: string;
};

type EssPayslip = {
  id: number;
  period_label?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  status: string;
};

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

function initials(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "HR";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Magandang umaga";
  if (h < 18) return "Magandang hapon";
  return "Magandang gabi";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function statusTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "approved" || s === "closed" || s === "posted" || s === "self_done" || s === "completed") return "success";
  if (s === "pending" || s === "assigned" || s === "open") return "warning";
  if (s === "processing") return "info";
  return "neutral";
}

function statusLabel(status: string) {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    loan: "Loan",
    salary_advance: "Salary advance",
    pay_question: "Pay question",
    certificate: "Certificate (COE)",
    resignation: "Resignation",
  };
  return map[kind] ?? kind;
}

function maskId(value?: string) {
  const v = (value || "").trim();
  if (!v) return "—";
  if (v.length <= 4) return "••••";
  return `${"•".repeat(Math.min(6, v.length - 3))}${v.slice(-3)}`;
}

function EssSelfServiceView() {
  const toast = useToast();
  const [screen, setScreen] = createSignal<Screen>("home");
  const [reveal, setReveal] = createSignal(false);
  const [slipId, setSlipId] = createSignal<number | null>(null);
  const [lvStep, setLvStep] = createSignal(0);
  const [typeId, setTypeId] = createSignal("");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [reqKind, setReqKind] = createSignal("loan");
  const [reqDetails, setReqDetails] = createSignal("");
  const [newPin, setNewPin] = createSignal("");
  const [currentPin, setCurrentPin] = createSignal("");
  const [punchPin, setPunchPin] = createSignal("");
  const [evComments, setEvComments] = createSignal("");
  const [nteText, setNteText] = createSignal("");
  const [nteCaseId, setNteCaseId] = createSignal<number | null>(null);
  const [nteConfirm, setNteConfirm] = createSignal(false);
  const [corrDate, setCorrDate] = createSignal("");
  const [corrIn, setCorrIn] = createSignal("06:00");
  const [corrOut, setCorrOut] = createSignal("14:00");
  const [corrReason, setCorrReason] = createSignal("");
  const [otDate, setOtDate] = createSignal("");
  const [otFrom, setOtFrom] = createSignal("14:00");
  const [otTo, setOtTo] = createSignal("16:00");
  const [otReason, setOtReason] = createSignal("");

  const fillLeaveDemo = () => {
    const packed = buildLeaveDemoFill((leaveTypes() ?? []).map((t) => String(t.id)));
    if (packed.typeId) setTypeId(packed.typeId);
    setFrom(packed.from);
    setTo(packed.to);
    setReason(packed.reason);
    setLvStep(3);
    toast.success("Demo fill loaded — review, then Submit leave.");
  };
  const fillCorrDemo = () => {
    const packed = buildCorrDemoFill();
    setCorrDate(packed.corrDate);
    setCorrIn(packed.corrIn);
    setCorrOut(packed.corrOut);
    setCorrReason(packed.corrReason);
    toast.success("Demo fill loaded — review, then Submit correction.");
  };
  const fillOtDemo = () => {
    const packed = buildOtDemoFill();
    setOtDate(packed.otDate);
    setOtFrom(packed.otFrom);
    setOtTo(packed.otTo);
    setOtReason(packed.otReason);
    toast.success("Demo fill loaded — review, then Submit OT.");
  };
  const fillReqDemo = (kind?: string) => {
    const packed = buildEssRequestDemoFill(kind || reqKind());
    setReqKind(packed.reqKind);
    setReqDetails(packed.reqDetails);
    toast.success("Demo fill loaded — review, then Submit.");
  };

  const go = (s: Screen) => {
    setScreen(s);
    if (s === "lvw") setLvStep(0);
  };

  const [me] = createResource(async () => {
    const res = await apiFetch<EssMe>("/api/v1/hr/ess/me");
    if (!res.success || !res.data) return null;
    return res.data;
  });
  const [payslips] = createResource(async () => {
    const res = await apiFetch<EssPayslip[]>("/api/v1/hr/ess/payslips");
    return res.success ? res.data ?? [] : [];
  });
  const [balances, { refetch: refetchBal }] = createResource(async () => {
    const res = await apiFetch<{ leave_code: string; leave_name: string; available: number }[]>("/api/v1/hr/ess/leave-balances");
    return res.success ? res.data ?? [] : [];
  });
  const [leaveReqs, { refetch: refetchLeave }] = createResource(async () => {
    const res = await apiFetch<{ id: number; leave_code?: string; date_from: string; date_to: string; days: number; status: string }[]>(
      "/api/v1/hr/ess/leave-requests",
    );
    return res.success ? res.data ?? [] : [];
  });
  const [leaveTypes] = createResource(async () => {
    const res = await apiFetch<{ id: number; code: string; name: string }[]>("/api/v1/hr/ess/leave-types");
    return res.success ? res.data ?? [] : [];
  });
  const [discipline, { refetch: refetchDisc }] = createResource(async () => {
    const res = await apiFetch<{ id: number; case_no: string; case_type: string; status: string; subject: string }[]>("/api/v1/hr/ess/discipline");
    return res.success ? res.data ?? [] : [];
  });
  const [learning] = createResource(async () => {
    const res = await apiFetch<{ id: number; course_title: string; status: string }[]>("/api/v1/hr/ess/learning");
    return res.success ? res.data ?? [] : [];
  });
  const [docs] = createResource(async () => {
    const res = await apiFetch<{ id: number; doc_type: string; title: string; created_at?: string }[]>("/api/v1/hr/ess/documents");
    return res.success ? res.data ?? [] : [];
  });
  const [reviews, { refetch: refetchReviews }] = createResource(async () => {
    const res = await apiFetch<{ id: number; status: string; self_comments: string; overall_score?: number; acknowledged_at?: string }[]>(
      "/api/v1/hr/ess/reviews",
    );
    return res.success ? res.data ?? [] : [];
  });
  const [punches, { refetch: refetchPunches }] = createResource(async () => {
    const res = await apiFetch<{ id: number; punched_at: string; has_selfie: boolean }[]>("/api/v1/hr/ess/punches");
    return res.success ? res.data ?? [] : [];
  });
  const [requests, { refetch: refetchReq }] = createResource(async () => {
    const res = await apiFetch<{ id: number; kind: string; status: string; details: string; created_at?: string }[]>("/api/v1/hr/ess/requests");
    return res.success ? res.data ?? [] : [];
  });
  const [taxPack] = createResource(async () => {
    const res = await apiFetch<{
      tax_year: number;
      gross_ytd: number;
      deductions_ytd: number;
      net_ytd: number;
      withholding_tax_ytd: number;
      tin: string;
      tax_status: string;
    }>("/api/v1/hr/ess/tax-certificate");
    return res.success ? res.data ?? null : null;
  });

  const latestPay = createMemo(() => (payslips() ?? [])[0] ?? null);
  const selectedSlip = createMemo(() => (payslips() ?? []).find((p) => p.id === slipId()) ?? latestPay());
  const openReviews = createMemo(() => (reviews() ?? []).filter((r) => r.status === "assigned" || r.status === "manager_done"));
  const openDiscipline = createMemo(() => (discipline() ?? []).filter((c) => c.status !== "closed" && c.status !== "cancelled"));
  const bal = (code: string) => (balances() ?? []).find((b) => b.leave_code.toLowerCase() === code.toLowerCase())?.available;

  const money = (n: number) => (reveal() ? formatPeso(n) : "₱ •••••");

  const punch = async () => {
    const body = {
      idempotency_key: crypto.randomUUID(),
      pin: punchPin(),
      selfie_name: "",
      selfie_base64: "",
    };
    localStorage.setItem("hr-punch-pending", JSON.stringify(body));
    try {
      const res = await apiFetch("/api/v1/hr/ess/punches", { method: "POST", body: JSON.stringify(body) });
      if (!res.success) {
        localStorage.removeItem("hr-punch-pending");
        return toast.warning(res.message ?? "Could not save the punch.");
      }
      localStorage.removeItem("hr-punch-pending");
      toast.success("Punch saved.");
      void refetchPunches();
      go("home");
    } catch {
      toast.warning("Saved on this phone. It will send when the connection returns.");
    }
  };

  onMount(() => {
    const retry = () => {
      const raw = localStorage.getItem("hr-punch-pending");
      if (!raw) return;
      void apiFetch("/api/v1/hr/ess/punches", { method: "POST", body: raw }).then((res) => {
        if (res.success) {
          localStorage.removeItem("hr-punch-pending");
          void refetchPunches();
        }
      });
    };
    window.addEventListener("online", retry);
    onCleanup(() => window.removeEventListener("online", retry));
  });

  const submitLeave = async () => {
    if (!typeId() || !from() || !to()) return toast.warning("Leave type and dates required.");
    const res = await apiFetch("/api/v1/hr/ess/leave-requests", {
      method: "POST",
      body: JSON.stringify({ leave_type_id: Number(typeId()), date_from: from(), date_to: to(), reason: reason() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Submit failed.");
    toast.success("Leave submitted.");
    setReason("");
    void refetchLeave();
    void refetchBal();
    go("lv");
  };

  const submitRequest = async () => {
    if (!reqDetails().trim()) return toast.warning("Details are required.");
    const res = await apiFetch("/api/v1/hr/ess/requests", {
      method: "POST",
      body: JSON.stringify({ kind: reqKind(), details: reqDetails().trim() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not submit.");
    toast.success("Request submitted.");
    setReqDetails("");
    void refetchReq();
    go("req");
  };

  const signReview = async (id: number) => {
    const res = await apiFetch(`/api/v1/hr/ess/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ self_comments: evComments() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not sign.");
    toast.success("Evaluation signed.");
    void refetchReviews();
    go("more");
  };

  const ackDiscipline = async (id: number) => {
    if (!nteConfirm()) return toast.warning("Confirm this is your own statement.");
    const res = await apiFetch(`/api/v1/hr/ess/discipline/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ notes: nteText() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Reply sent.");
    setNteText("");
    setNteConfirm(false);
    void refetchDisc();
    go("docs");
  };

  const savePin = async () => {
    const res = await apiFetch("/api/v1/hr/ess/punch-pin", {
      method: "PUT",
      body: JSON.stringify({ current_pin: currentPin(), pin: newPin() }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the PIN.");
    toast.success("PIN saved.");
    setCurrentPin("");
    setNewPin("");
  };

  const tab = () => TAB_OF[screen()] ?? "home";

  const Header = (props: { title: string; back?: Screen }) => (
    <div class="ess-apph">
      <Show when={props.back}>
        <button type="button" aria-label="Back" onClick={() => go(props.back!)}>
          ‹
        </button>
      </Show>
      <b>{props.title}</b>
    </div>
  );

  return (
    <HrLayout>
      <div class="ess-shell">
        <HrPageHead
          title="My HR · Employee self-service"
          subtitle="Mobile-first for deployed employees, also usable on desktop. Same BluearmERP account; you only see your own records."
        />

        <Show when={me.loading}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>
        <Show when={!me.loading && me() === null}>
          <HrNotice>
            No employee profile linked to your user. Ask HR to set <b>user_id</b> on your employee record.
          </HrNotice>
        </Show>

        <Show when={me()}>
          {(e) => (
            <div class="ess-app">
              <nav class="ess-desk" aria-label="My HR (desktop)">
                <button type="button" classList={{ on: tab() === "home" }} onClick={() => go("home")}>
                  🏠 Home
                </button>
                <button type="button" classList={{ on: tab() === "time" }} onClick={() => go("time")}>
                  🕒 Time &amp; DTR
                </button>
                <button type="button" classList={{ on: screen() === "lv" || screen() === "lvw" }} onClick={() => go("lv")}>
                  🌴 Leave
                </button>
                <button type="button" classList={{ on: tab() === "pay" }} onClick={() => go("pay")}>
                  ₱ Pay
                </button>
                <button type="button" classList={{ on: tab() === "req" && screen() !== "lv" && screen() !== "lvw" }} onClick={() => go("req")}>
                  📝 Requests
                </button>
                <button type="button" classList={{ on: screen() === "docs" || screen() === "nte" }} onClick={() => go("docs")}>
                  📁 Documents
                </button>
                <button type="button" classList={{ on: screen() === "evs" }} onClick={() => go("evs")}>
                  ★ Evaluations
                </button>
                <button type="button" classList={{ on: screen() === "lrn" }} onClick={() => go("lrn")}>
                  🎓 Learning
                </button>
                <button type="button" classList={{ on: screen() === "prof" }} onClick={() => go("prof")}>
                  👤 Profile
                </button>
              </nav>

              <div class="ess-main">
                <Header title={screen() === "slip" ? `Payslip · ${selectedSlip()?.period_label ?? ""}` : TITLES[screen()]} back={BACK[screen()]} />

                <div class="ess-body">
                  {/* HOME */}
                  <Show when={screen() === "home"}>
                    <div class="xs text-text-secondary mb-1">{todayLabel()}</div>
                    <div class="mb-3 text-lg font-bold">
                      {greeting()}, {firstName(e().full_name)}! 👋
                    </div>
                    <div class="ess-clock mb-3">
                      <div class="text-xs opacity-85">Today · {e().department || "Assignment"} · {e().job_title || "—"}</div>
                      <b class="block text-base mt-1">Clock-in stores a punch for you</b>
                      <div class="text-xs mt-1 opacity-90">
                        {(punches() ?? [])[0] ? `Last punch · ${punches()![0].punched_at}` : "Not clocked in yet"}
                      </div>
                      <button type="button" class="btn" onClick={() => go("clock")}>
                        Clock in
                      </button>
                    </div>
                    <div class="ess-tiles mb-3">
                      <button type="button" class="ess-tile" onClick={() => go("lvw")}>
                        <span>🌴</span>File leave
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("ot")}>
                        <span>⏱</span>File OT
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("pay")}>
                        <span>🧾</span>Payslip
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("req")}>
                        <span>📝</span>Request
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("corr")}>
                        <span>✏️</span>Fix time
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("certificate"); go("coe"); }}>
                        <span>📄</span>COE
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("prof")}>
                        <span>📍</span>Profile
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("help")}>
                        <span>❓</span>Help
                      </button>
                    </div>
                    <div class="ess-card">
                      <h4>
                        To do · {openReviews().length + openDiscipline().length}
                      </h4>
                      <For each={openReviews()}>
                        {(r) => (
                          <div class="ess-row">
                            <span aria-hidden="true">✍</span>
                            <div class="grow">
                              <b>Sign evaluation #{r.id}</b>
                              <div class="text-xs text-text-secondary">{statusLabel(r.status)}</div>
                            </div>
                            <button type="button" class="hr-btn hr-btn-sm" onClick={() => go("evs")}>
                              Open
                            </button>
                          </div>
                        )}
                      </For>
                      <For each={openDiscipline()}>
                        {(c) => (
                          <div class="ess-row">
                            <span aria-hidden="true">💬</span>
                            <div class="grow">
                              <b>{c.case_no} · {c.subject}</b>
                              <div class="text-xs text-text-secondary">{c.case_type}</div>
                            </div>
                            <button
                              type="button"
                              class="hr-btn hr-btn-sm"
                              onClick={() => {
                                setNteCaseId(c.id);
                                go("nte");
                              }}
                            >
                              Reply
                            </button>
                          </div>
                        )}
                      </For>
                      <Show when={openReviews().length + openDiscipline().length === 0}>
                        <p class="text-xs text-text-secondary">Nothing waiting.</p>
                      </Show>
                    </div>
                    <div class="ess-card">
                      <h4>
                        Announcements
                      </h4>
                      <p class="text-xs text-text-secondary">Company notices from Policies &amp; notices will show here when ESS feed is wired.</p>
                    </div>
                  </Show>

                  {/* CLOCK */}
                  <Show when={screen() === "clock"}>
                    <div class="ess-card text-center">
                      <div class="text-xs text-text-secondary">{e().department || "Site"} · {e().job_title || "—"}</div>
                      <div class="text-2xl font-bold my-2">
                        {new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div class="my-2 flex h-28 items-center justify-center rounded-xl bg-slate-100 text-sm text-text-secondary">
                        📍 Geofence map
                      </div>
                      <p class="text-xs text-text-secondary mb-2">
                        Location check · Selfie capture optional below
                      </p>
                      <Field label="Punch PIN (if set)">
                        <input class={inputClass} type="password" inputMode="numeric" value={punchPin()} onInput={(ev) => setPunchPin(ev.currentTarget.value)} />
                      </Field>
                      <button type="button" class="hr-btn hr-btn-primary mt-3 w-full" onClick={() => void punch()}>
                        Confirm clock in
                      </button>
                      <p class="text-xs text-text-secondary mt-2">If you are offline, this is saved and sent when you reconnect.</p>
                    </div>
                  </Show>

                  {/* TIME */}
                  <Show when={screen() === "time"}>
                    <div class="ess-card">
                      <div class="flex justify-between gap-3 text-center">
                        <div>
                          <div class="text-xs text-text-secondary">Punches</div>
                          <b class="text-xl">{(punches() ?? []).length}</b>
                        </div>
                        <div>
                          <div class="text-xs text-text-secondary">
                            Late
                          </div>
                          <b class="text-xl">—</b>
                        </div>
                        <div>
                          <div class="text-xs text-text-secondary">
                            OT
                          </div>
                          <b class="text-xl">—</b>
                        </div>
                      </div>
                    </div>
                    <div class="ess-card">
                      <h4>Recent punches</h4>
                      <For each={punches() ?? []} fallback={<HrEmpty title="No punches yet" hint="Use Clock in from Home." />}>
                        {(p) => (
                          <div class="ess-row">
                            <span aria-hidden="true">🕒</span>
                            <div class="grow">
                              <b>{p.punched_at}</b>
                              <div class="text-xs text-text-secondary">{p.has_selfie ? "With selfie" : "No selfie"}</div>
                            </div>
                            <HrBadge tone="neutral">Stored</HrBadge>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="hr-btn hr-btn-sm" onClick={() => go("corr")}>
                        ✏️ Request correction
                      </button>
                      <button type="button" class="hr-btn hr-btn-sm" onClick={() => go("ot")}>
                        ⏱ File OT
                      </button>
                      <button type="button" class="hr-btn hr-btn-sm" disabled title="Needs deployment roster">
                        📅 Schedule
                      </button>
                      <button type="button" class="hr-btn hr-btn-sm" onClick={() => go("hist")}>
                        History
                      </button>
                    </div>
                  </Show>

                  <Show when={screen() === "corr"}>
                    <div class="mb-2 flex justify-end">
                      <DemoFillButton onFill={fillCorrDemo} />
                    </div>
                    <div class="grid gap-3">
                      <Field label="Date">
                        <input class={inputClass} type="date" value={corrDate()} onInput={(ev) => setCorrDate(ev.currentTarget.value)} />
                      </Field>
                      <Field label="Correct time in">
                        <input class={inputClass} type="time" value={corrIn()} onInput={(ev) => setCorrIn(ev.currentTarget.value)} />
                      </Field>
                      <Field label="Correct time out">
                        <input class={inputClass} type="time" value={corrOut()} onInput={(ev) => setCorrOut(ev.currentTarget.value)} />
                      </Field>
                      <Field label="Reason">
                        <textarea class={inputClass} value={corrReason()} onInput={(ev) => setCorrReason(ev.currentTarget.value)} placeholder="e.g. biometric did not read" />
                      </Field>
                      <HrNotice>
                        Time correction request — submit as a pay question / request for now.
                      </HrNotice>
                      <button
                        type="button"
                        class="hr-btn hr-btn-primary w-full"
                        onClick={() => {
                          setReqKind("pay_question");
                          setReqDetails(`Time correction ${corrDate()} in ${corrIn()} out ${corrOut()}: ${corrReason()}`);
                          void submitRequest();
                        }}
                      >
                        Submit correction
                      </button>
                    </div>
                  </Show>

                  <Show when={screen() === "ot"}>
                    <div class="mb-2 flex justify-end">
                      <DemoFillButton onFill={fillOtDemo} />
                    </div>
                    <div class="grid gap-3">
                      <Field label="Date">
                        <input class={inputClass} type="date" value={otDate()} onInput={(ev) => setOtDate(ev.currentTarget.value)} />
                      </Field>
                      <Field label="From">
                        <input class={inputClass} type="time" value={otFrom()} onInput={(ev) => setOtFrom(ev.currentTarget.value)} />
                      </Field>
                      <Field label="To">
                        <input class={inputClass} type="time" value={otTo()} onInput={(ev) => setOtTo(ev.currentTarget.value)} />
                      </Field>
                      <Field label="Reason / approved by">
                        <textarea class={inputClass} value={otReason()} onInput={(ev) => setOtReason(ev.currentTarget.value)} />
                      </Field>
                      <p class="text-xs text-text-secondary">Client approver confirms OT in the portal; HR checks before payroll. Filing path — stored as request today.</p>
                      <button
                        type="button"
                        class="hr-btn hr-btn-primary w-full"
                        onClick={() => {
                          setReqKind("pay_question");
                          setReqDetails(`OT ${otDate()} ${otFrom()}–${otTo()}: ${otReason()}`);
                          void submitRequest();
                        }}
                      >
                        Submit OT
                      </button>
                    </div>
                  </Show>

                  <Show when={screen() === "hist"}>
                    <div class="ess-card">
                      <For each={punches() ?? []} fallback={<HrEmpty title="No history yet" />}>
                        {(p) => (
                          <div class="ess-row">
                            <span aria-hidden="true">📅</span>
                            <div class="grow">
                              <b>{p.punched_at}</b>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* LEAVE */}
                  <Show when={screen() === "lv"}>
                    <div class="ess-tiles mb-3" style={{ "grid-template-columns": "repeat(3,1fr)" }}>
                      <div class="ess-tile">
                        <span class="text-xl font-bold">{bal("VL") ?? bal("vl") ?? "—"}</span>Vacation
                      </div>
                      <div class="ess-tile">
                        <span class="text-xl font-bold">{bal("SL") ?? bal("sl") ?? "—"}</span>Sick
                      </div>
                      <div class="ess-tile">
                        <span class="text-xl font-bold">{bal("SIL") ?? bal("sil") ?? "—"}</span>SIL
                      </div>
                    </div>
                    <button type="button" class="hr-btn hr-btn-primary mb-3 w-full" onClick={() => go("lvw")}>
                      + File leave
                    </button>
                    <div class="ess-card">
                      <h4>My requests</h4>
                      <For each={leaveReqs() ?? []} fallback={<p class="text-xs text-text-secondary">No leave filed yet.</p>}>
                        {(r) => (
                          <div class="ess-row">
                            <span aria-hidden="true">🌴</span>
                            <div class="grow">
                              <b>
                                {r.leave_code || "Leave"} · {r.date_from}–{r.date_to}
                              </b>
                              <div class="text-xs text-text-secondary">{r.days} day(s)</div>
                            </div>
                            <HrBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</HrBadge>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={screen() === "lvw"}>
                    <div class="mb-2 flex justify-end">
                      <DemoFillButton onFill={fillLeaveDemo} />
                    </div>
                    <HrSteps steps={["Type", "Dates", "Reason", "Review"]} current={lvStep()} onSelect={setLvStep} />
                    <Show when={lvStep() === 0}>
                      <Field label="Leave type">
                        <select class={inputClass} value={typeId()} onChange={(ev) => setTypeId(ev.currentTarget.value)}>
                          <option value="">Select…</option>
                          <For each={leaveTypes() ?? []}>{(t) => <option value={t.id}>{t.code} — {t.name}</option>}</For>
                        </select>
                      </Field>
                      <p class="mt-2 text-xs text-text-secondary">
                        Balances: {(balances() ?? []).map((b) => `${b.leave_code} ${b.available}`).join(" · ") || "—"}
                      </p>
                    </Show>
                    <Show when={lvStep() === 1}>
                      <Field label="From">
                        <input class={inputClass} type="date" value={from()} onInput={(ev) => setFrom(ev.currentTarget.value)} />
                      </Field>
                      <Field label="To">
                        <input class={inputClass} type="date" value={to()} onInput={(ev) => setTo(ev.currentTarget.value)} />
                      </Field>
                    </Show>
                    <Show when={lvStep() === 2}>
                      <Field label="Reason">
                        <textarea class={inputClass} value={reason()} onInput={(ev) => setReason(ev.currentTarget.value)} />
                      </Field>
                    </Show>
                    <Show when={lvStep() === 3}>
                      <div class="ess-card text-sm">
                        <b>{leaveTypes()?.find((t) => String(t.id) === typeId())?.name ?? "Leave"}</b>
                        <p>
                          {from()} → {to()}
                        </p>
                        <p class="text-text-secondary">{reason() || "—"}</p>
                      </div>
                      <p class="text-xs text-text-secondary mb-2">Goes to your client supervisor (if set) then HR.</p>
                      <button type="button" class="hr-btn hr-btn-primary w-full" onClick={() => void submitLeave()}>
                        Submit leave
                      </button>
                    </Show>
                    <div class="mt-3 flex justify-between">
                      <button type="button" class="hr-btn hr-btn-sm" disabled={lvStep() === 0} onClick={() => setLvStep((s) => Math.max(0, s - 1))}>
                        ← Back
                      </button>
                      <Show when={lvStep() < 3}>
                        <button type="button" class="hr-btn hr-btn-primary hr-btn-sm" onClick={() => setLvStep((s) => Math.min(3, s + 1))}>
                          Next →
                        </button>
                      </Show>
                    </div>
                  </Show>

                  {/* PAY */}
                  <Show when={screen() === "pay"}>
                    <div class="ess-payhero">
                      <div class="text-xs opacity-80">Latest net pay · {latestPay()?.period_label ?? "—"}</div>
                      <div class="text-2xl font-bold my-1">{latestPay() ? money(latestPay()!.net_pay) : "—"}</div>
                      <button type="button" class="hr-btn hr-btn-sm" style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: 0 }} onClick={() => setReveal(!reveal())}>
                        👁 {reveal() ? "Hide amounts" : "Show amounts"}
                      </button>
                    </div>
                    <div class="ess-card">
                      <h4>Payslips</h4>
                      <For each={payslips() ?? []} fallback={<p class="text-xs text-text-secondary">No posted payslips yet.</p>}>
                        {(p) => (
                          <div class="ess-row">
                            <span aria-hidden="true">🧾</span>
                            <div class="grow">
                              <b>{p.period_label || `Payslip #${p.id}`}</b>
                              <div class="text-xs text-text-secondary">{statusLabel(p.status)} · Net {money(p.net_pay)}</div>
                            </div>
                            <button
                              type="button"
                              class="hr-btn hr-btn-sm"
                              onClick={() => {
                                setSlipId(p.id);
                                go("slip");
                              }}
                            >
                              View
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="ess-tiles" style={{ "grid-template-columns": "repeat(2,1fr)" }}>
                      <button type="button" class="ess-tile" onClick={() => go("ytd")}>
                        <span>📈</span>YTD &amp; 13th month
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("loan"); go("loan"); }}>
                        <span>🏦</span>Loans &amp; deductions
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("gov")}>
                        <span>🏛</span>Gov't contributions
                      </button>
                      <button type="button" class="ess-tile" onClick={() => go("2316")}>
                        <span>📄</span>BIR 2316
                      </button>
                    </div>
                  </Show>

                  <Show when={screen() === "slip"}>
                    <div class="ess-card">
                      <div class="text-xs text-text-secondary">
                        {e().job_title || "—"} · {selectedSlip()?.period_label ?? "—"}
                      </div>
                      <table class="mt-2 w-full text-xs">
                        <tbody>
                          <tr>
                            <td>Gross</td>
                            <td class="text-right">{selectedSlip() ? money(selectedSlip()!.gross_pay) : "—"}</td>
                          </tr>
                          <tr>
                            <td>Deductions</td>
                            <td class="text-right">{selectedSlip() ? money(selectedSlip()!.deductions) : "—"}</td>
                          </tr>
                          <tr>
                            <td>
                              <b>Net pay</b>
                            </td>
                            <td class="text-right">
                              <b>{selectedSlip() ? money(selectedSlip()!.net_pay) : "—"}</b>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <button type="button" class="hr-btn hr-btn-sm mt-2" onClick={() => setReveal(!reveal())}>
                        👁 {reveal() ? "Hide" : "Show"} amounts
                      </button>
                    </div>
                    <Show when={selectedSlip()}>
                      <A class="hr-btn w-full justify-center" href={`/app/hr/payslips/${selectedSlip()!.id}/print`} target="_blank">
                        ⬇ Open / print payslip
                      </A>
                    </Show>
                    <button type="button" class="hr-btn hr-btn-sm mt-2 w-full" onClick={() => { setReqKind("pay_question"); go("disp"); }}>
                      Question about this payslip?
                    </button>
                  </Show>

                  <Show when={screen() === "ytd"}>
                    <div class="ess-card">
                      <div class="ess-row">
                        <span>📈</span>
                        <div class="grow">
                          <b>YTD gross {taxPack()?.tax_year ?? ""}</b>
                        </div>
                        <span>{taxPack() ? money(taxPack()!.gross_ytd) : "—"}</span>
                      </div>
                      <div class="ess-row">
                        <span>🏛</span>
                        <div class="grow">
                          <b>YTD deductions</b>
                        </div>
                        <span>{taxPack() ? money(taxPack()!.deductions_ytd) : "—"}</span>
                      </div>
                      <div class="ess-row">
                        <span>🎄</span>
                        <div class="grow">
                          <b>
                            13th month (estimate)
                          </b>
                          <div class="text-xs text-text-secondary">PD 851 — estimate only</div>
                        </div>
                        <span>—</span>
                      </div>
                    </div>
                    <button type="button" class="hr-btn hr-btn-sm" onClick={() => setReveal(!reveal())}>
                      👁 Show amounts
                    </button>
                  </Show>

                  <Show when={screen() === "gov"}>
                    <div class="ess-card">
                      <div class="ess-row">
                        <span>🟦</span>
                        <div class="grow">
                          <b>SSS</b>
                          <div class="text-xs text-text-secondary">No. {maskId(e().sss_no)}</div>
                        </div>
                      </div>
                      <div class="ess-row">
                        <span>🟩</span>
                        <div class="grow">
                          <b>PhilHealth</b>
                          <div class="text-xs text-text-secondary">No. {maskId(e().philhealth_no)}</div>
                        </div>
                      </div>
                      <div class="ess-row">
                        <span>🟨</span>
                        <div class="grow">
                          <b>Pag-IBIG</b>
                          <div class="text-xs text-text-secondary">MID {maskId(e().pagibig_no)}</div>
                        </div>
                      </div>
                      <div class="ess-row">
                        <span>🟥</span>
                        <div class="grow">
                          <b>BIR / TIN</b>
                          <div class="text-xs text-text-secondary">
                            {maskId(e().tin || taxPack()?.tin)} · {e().tax_status || taxPack()?.tax_status || "—"}
                          </div>
                        </div>
                        <span>{taxPack() ? money(taxPack()!.withholding_tax_ytd) : "—"}</span>
                      </div>
                    </div>
                    <button type="button" class="hr-btn hr-btn-sm" onClick={() => setReveal(!reveal())}>
                      👁 Show amounts
                    </button>
                  </Show>

                  <Show when={screen() === "2316"}>
                    <div class="ess-card">
                      <div class="ess-row">
                        <span>📄</span>
                        <div class="grow">
                          <b>2316 · {taxPack()?.tax_year ?? new Date().getFullYear()}</b>
                          <div class="text-xs text-text-secondary">Tax certificate field pack (not certified eFPS)</div>
                        </div>
                        <HrBadge tone="info">Live pack</HrBadge>
                      </div>
                      <p class="text-xs text-text-secondary mt-2">
                        Gross YTD {taxPack() ? money(taxPack()!.gross_ytd) : "—"} · WHT {taxPack() ? money(taxPack()!.withholding_tax_ytd) : "—"}
                      </p>
                      <button type="button" class="hr-btn hr-btn-sm mt-2" disabled title="PDF export needs backend">
                        ⬇ Download PDF
                      </button>
                    </div>
                  </Show>

                  {/* REQUESTS */}
                  <Show when={screen() === "req"}>
                    <div class="ess-tiles mb-3" style={{ "grid-template-columns": "repeat(3,1fr)" }}>
                      <button type="button" class="ess-tile" onClick={() => go("lv")}>
                        <span>🌴</span>Leave
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("loan"); go("loan"); }}>
                        <span>🏦</span>Loan
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("salary_advance"); go("adv"); }}>
                        <span>💸</span>Salary advance
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("pay_question"); go("disp"); }}>
                        <span>❓</span>Pay question
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("certificate"); go("coe"); }}>
                        <span>📄</span>Certificate
                      </button>
                      <button type="button" class="ess-tile" onClick={() => { setReqKind("resignation"); go("resg"); }}>
                        <span>🚪</span>Resignation
                      </button>
                    </div>
                    <div class="ess-card">
                      <h4>My requests</h4>
                      <For each={requests() ?? []} fallback={<p class="text-xs text-text-secondary">No requests yet.</p>}>
                        {(r) => (
                          <div class="ess-row">
                            <span aria-hidden="true">📝</span>
                            <div class="grow">
                              <b>{kindLabel(r.kind)}</b>
                              <div class="text-xs text-text-secondary">{r.details}</div>
                            </div>
                            <HrBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</HrBadge>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={["loan", "adv", "disp", "coe", "resg"].includes(screen())}>
                    <div class="mb-2 flex justify-end">
                      <DemoFillButton onFill={() => fillReqDemo(reqKind())} />
                    </div>
                    <div class="grid gap-3">
                      <Field label="Type">
                        <select class={inputClass} value={reqKind()} onChange={(ev) => setReqKind(ev.currentTarget.value)} disabled>
                          <option value="loan">Company loan</option>
                          <option value="salary_advance">Salary advance</option>
                          <option value="pay_question">Pay question</option>
                          <option value="certificate">Certificate (COE)</option>
                          <option value="resignation">Resignation</option>
                        </select>
                      </Field>
                      <Field label="Details">
                        <textarea
                          class={inputClass}
                          rows={4}
                          value={reqDetails()}
                          onInput={(ev) => setReqDetails(ev.currentTarget.value)}
                          placeholder={
                            screen() === "coe"
                              ? "Purpose (bank / visa / new employer)…"
                              : screen() === "resg"
                                ? "Last working day and reason…"
                                : "Describe your request…"
                          }
                        />
                      </Field>
                      <Show when={screen() === "resg"}>
                        <p class="text-xs text-text-secondary">30 days' notice under Labor Code Art. 300 unless waived.</p>
                      </Show>
                      <Show when={screen() === "adv"}>
                        <p class="text-xs text-text-secondary">
                          Max % of earned pay rule — set in ESS settings later.
                        </p>
                      </Show>
                      <button type="button" class="hr-btn hr-btn-primary w-full" onClick={() => void submitRequest()}>
                        Submit
                      </button>
                    </div>
                  </Show>

                  {/* MORE */}
                  <Show when={screen() === "more"}>
                    <div class="ess-card flex items-center gap-3">
                      <div class="grid h-12 w-12 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{initials(e().full_name)}</div>
                      <div>
                        <b>{e().full_name}</b>
                        <div class="text-xs text-text-secondary">
                          {e().employee_no} · {e().job_title || "—"}
                        </div>
                      </div>
                    </div>
                    <div class="ess-card">
                      {(
                        [
                          ["prof", "👤", "Profile"],
                          ["docs", "📁", "Documents & 201 file"],
                          ["evs", "★", "Evaluations"],
                          ["lrn", "🎓", "Learning & certificates"],
                          ["set", "⚙", "Settings & security"],
                          ["help", "❓", "Help & FAQ"],
                        ] as const
                      ).map(([s, ico, label]) => (
                        <button type="button" class="ess-row w-full text-left" onClick={() => go(s)}>
                          <span>{ico}</span>
                          <div class="grow">
                            <b>{label}</b>
                          </div>
                          <span>›</span>
                        </button>
                      ))}
                    </div>
                  </Show>

                  <Show when={screen() === "prof"}>
                    <div class="ess-card">
                      <h4>Personal info</h4>
                      <div class="ess-row">
                        <span>🪪</span>
                        <div class="grow">
                          <b>{e().full_name}</b>
                          <div class="text-xs text-text-secondary">
                            {e().employee_no} · {e().department || "—"}
                          </div>
                        </div>
                      </div>
                      <div class="ess-row">
                        <span>💼</span>
                        <div class="grow">
                          <b>{e().job_title || "—"}</b>
                          <div class="text-xs text-text-secondary">Position</div>
                        </div>
                      </div>
                      <button type="button" class="hr-btn hr-btn-sm" disabled title="Needs approval workflow">
                        Request update
                      </button>
                    </div>
                    <p class="text-xs text-text-secondary">Changes are requests: HR approves before they update your 201 file.</p>
                  </Show>

                  <Show when={screen() === "docs"}>
                    <div class="ess-card">
                      <h4>Memos &amp; notices</h4>
                      <For each={openDiscipline()} fallback={<p class="text-xs text-text-secondary">No open memos.</p>}>
                        {(c) => (
                          <div class="ess-row">
                            <span>💬</span>
                            <div class="grow">
                              <b>
                                {c.case_no} · {c.subject}
                              </b>
                            </div>
                            <button
                              type="button"
                              class="hr-btn hr-btn-sm"
                              onClick={() => {
                                setNteCaseId(c.id);
                                go("nte");
                              }}
                            >
                              Reply
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                    <div class="ess-card">
                      <h4>My 201 file</h4>
                      <For each={docs() ?? []} fallback={<p class="text-xs text-text-secondary">No documents.</p>}>
                        {(d) => (
                          <div class="ess-row">
                            <span>📁</span>
                            <div class="grow">
                              <b>{d.title}</b>
                              <div class="text-xs text-text-secondary">
                                {d.doc_type}
                                {d.created_at ? ` · ${d.created_at.slice(0, 10)}` : ""}
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={screen() === "nte"}>
                    <div class="ess-card text-sm">
                      <b>Notice to explain / memo</b>
                      <p class="text-xs text-text-secondary mt-1">Write your explanation. Reply attaches to the discipline case.</p>
                    </div>
                    <Field label="Your explanation">
                      <textarea class={inputClass} value={nteText()} onInput={(ev) => setNteText(ev.currentTarget.value)} />
                    </Field>
                    <label class="mt-2 flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={nteConfirm()} onChange={(ev) => setNteConfirm(ev.currentTarget.checked)} />
                      <span>I confirm this is my own statement.</span>
                    </label>
                    <button
                      type="button"
                      class="hr-btn hr-btn-primary mt-3 w-full"
                      disabled={!nteCaseId()}
                      onClick={() => nteCaseId() && void ackDiscipline(nteCaseId()!)}
                    >
                      Send reply
                    </button>
                  </Show>

                  <Show when={screen() === "evs"}>
                    <For each={reviews() ?? []} fallback={<HrEmpty title="No evaluations yet" />}>
                      {(r) => (
                        <div class="ess-card">
                          <h4>Evaluation #{r.id}</h4>
                          <p class="text-xs">
                            Status <HrBadge tone={statusTone(r.status)}>{statusLabel(r.status)}</HrBadge>
                            <Show when={r.overall_score != null}> · overall <b>{r.overall_score} / 5</b></Show>
                          </p>
                          <Show when={r.status === "assigned" || r.status === "manager_done"}>
                            <Field label="Your comments (optional)">
                              <textarea class={inputClass} value={evComments()} onInput={(ev) => setEvComments(ev.currentTarget.value)} />
                            </Field>
                            <button type="button" class="hr-btn hr-btn-primary mt-2 w-full" onClick={() => void signReview(r.id)}>
                              ✍ Sign evaluation
                            </button>
                          </Show>
                        </div>
                      )}
                    </For>
                  </Show>

                  <Show when={screen() === "lrn"}>
                    <div class="ess-card">
                      <h4>Assigned</h4>
                      <For each={learning() ?? []} fallback={<p class="text-xs text-text-secondary">No assignments.</p>}>
                        {(c) => (
                          <div class="ess-row">
                            <span>🎓</span>
                            <div class="grow">
                              <b>{c.course_title}</b>
                              <div class="text-xs text-text-secondary">{statusLabel(c.status)}</div>
                            </div>
                            <HrBadge tone={statusTone(c.status)}>{statusLabel(c.status)}</HrBadge>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={screen() === "set"}>
                    <div class="ess-card">
                      <h4>Punch PIN</h4>
                      <Field label="Current PIN">
                        <input class={inputClass} type="password" value={currentPin()} onInput={(ev) => setCurrentPin(ev.currentTarget.value)} />
                      </Field>
                      <Field label="New PIN (4+ digits)">
                        <input class={inputClass} type="password" value={newPin()} onInput={(ev) => setNewPin(ev.currentTarget.value)} />
                      </Field>
                      <button type="button" class="hr-btn hr-btn-primary mt-2" onClick={() => void savePin()}>
                        Save PIN
                      </button>
                    </div>
                    <div class="ess-card">
                      <div class="ess-row">
                        <span>👆</span>
                        <div class="grow">
                          <b>
                            Biometric unlock
                          </b>
                          <div class="text-xs text-text-secondary">WebAuthn / device biometrics</div>
                        </div>
                      </div>
                      <div class="ess-row">
                        <span>🔑</span>
                        <div class="grow">
                          <b>Password &amp; 2FA</b>
                          <div class="text-xs text-text-secondary">Same BluearmERP account</div>
                        </div>
                      </div>
                    </div>
                  </Show>

                  <Show when={screen() === "help"}>
                    <div class="ess-card space-y-2 text-sm">
                      <details>
                        <summary class="font-semibold">I forgot to clock in</summary>
                        <p class="text-xs text-text-secondary mt-1">File a time correction from Time → Request correction.</p>
                      </details>
                      <details>
                        <summary class="font-semibold">How do I get a COE?</summary>
                        <p class="text-xs text-text-secondary mt-1">Requests → Certificate. HR processes the request.</p>
                      </details>
                      <details>
                        <summary class="font-semibold">Who can see my data?</summary>
                        <p class="text-xs text-text-secondary mt-1">Only HR and you. Clients see name, position and schedule only.</p>
                      </details>
                    </div>
                    <button type="button" class="hr-btn w-full" onClick={() => { setReqKind("pay_question"); go("disp"); }}>
                      Message HR
                    </button>
                  </Show>
                </div>

                <nav class="ess-tabbar" aria-label="App tabs">
                  <button type="button" classList={{ on: tab() === "home" }} onClick={() => go("home")}>
                    <span aria-hidden="true">🏠</span>Home
                  </button>
                  <button type="button" classList={{ on: tab() === "time" }} onClick={() => go("time")}>
                    <span aria-hidden="true">🕒</span>Time
                  </button>
                  <button type="button" classList={{ on: tab() === "pay" }} onClick={() => go("pay")}>
                    <span aria-hidden="true">₱</span>Pay
                  </button>
                  <button type="button" classList={{ on: tab() === "req" }} onClick={() => go("req")}>
                    <span aria-hidden="true">📝</span>Requests
                  </button>
                  <button type="button" classList={{ on: tab() === "more" }} onClick={() => go("more")}>
                    <span aria-hidden="true">☰</span>More
                  </button>
                </nav>
              </div>
            </div>
          )}
        </Show>
      </div>
    </HrLayout>
  );
}

export default function EssSelfServicePage() {
  return (
    <ProtectedRoute>
      <EssSelfServiceView />
    </ProtectedRoute>
  );
}

import { createEffect, onCleanup, onMount } from "solid-js";
import { useLocation } from "@solidjs/router";
import { apiFetch } from "./api";
import { useAuth } from "./auth-context";
import { describePresencePath } from "./presenceLabels";
import { isIdleLogoutExemptPath, LAST_ACTIVITY_STORAGE_KEY, readLocalActivity } from "./sessionIdleClient";

const HEARTBEAT_MS = 30_000;
const IDLE_THRESHOLD_MS = 2 * 60_000;
const SESSION_STORAGE_KEY = "erp_usage_client_session_id";

type PendingPage = {
  client_visit_id: string;
  seq: number;
  path: string;
  path_pattern: string;
  page_label: string;
  entered_at: string;
  exited_at?: string;
  active_seconds: number;
  idle_seconds: number;
};

type OpenVisit = {
  clientVisitId: string;
  seq: number;
  path: string;
  pathPattern: string;
  pageLabel: string;
  enteredAt: number;
  activeMs: number;
  idleMs: number;
};

let clientSessionId: string | null = null;
let sessionStarted = false;
let ending = false;
let seqCounter = 0;
let openVisit: OpenVisit | null = null;
let pendingPages: PendingPage[] = [];
let activeDeltaMs = 0;
let idleDeltaMs = 0;
let lastTickAt = Date.now();
let lastActivityAt = Date.now();

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeRoutePattern(path: string): string {
  return path
    .split("/")
    .map((seg) => (/^\d+$/.test(seg) ? ":id" : seg))
    .join("/") || "/";
}

function shouldTrackPath(pathname: string): boolean {
  if (!pathname.startsWith("/app")) return false;
  if (pathname.startsWith("/app/pos")) return false;
  return true;
}

function flushVisit(exitedAt = Date.now()) {
  if (!openVisit) return;
  const activeSec = Math.floor(openVisit.activeMs / 1000);
  const idleSec = Math.floor(openVisit.idleMs / 1000);
  pendingPages.push({
    client_visit_id: openVisit.clientVisitId,
    seq: openVisit.seq,
    path: openVisit.path,
    path_pattern: openVisit.pathPattern,
    page_label: openVisit.pageLabel,
    entered_at: new Date(openVisit.enteredAt).toISOString(),
    exited_at: new Date(exitedAt).toISOString(),
    active_seconds: activeSec,
    idle_seconds: idleSec,
  });
  openVisit = null;
}

function openNewVisit(pathname: string) {
  seqCounter += 1;
  const now = Date.now();
  openVisit = {
    clientVisitId: newId(),
    seq: seqCounter,
    path: pathname,
    pathPattern: normalizeRoutePattern(pathname),
    pageLabel: describePresencePath(pathname),
    enteredAt: now,
    activeMs: 0,
    idleMs: 0,
  };
}

function tickTimers() {
  const now = Date.now();
  const delta = Math.max(0, Math.min(now - lastTickAt, 60_000));
  lastTickAt = now;
  if (delta === 0) return;

  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  const localAct = readLocalActivity();
  if (localAct > 0) lastActivityAt = Math.max(lastActivityAt, localAct);
  const idleFor = now - lastActivityAt;
  const isIdle = !visible || idleFor >= IDLE_THRESHOLD_MS;

  if (isIdle) {
    idleDeltaMs += delta;
    if (openVisit) openVisit.idleMs += delta;
  } else {
    activeDeltaMs += delta;
    if (openVisit) openVisit.activeMs += delta;
  }
}

async function sendHeartbeat() {
  if (!clientSessionId || !sessionStarted || ending) return;
  tickTimers();

  // Include open visit checkpoint without closing it.
  const pages = [...pendingPages];
  if (openVisit) {
    pages.push({
      client_visit_id: openVisit.clientVisitId,
      seq: openVisit.seq,
      path: openVisit.path,
      path_pattern: openVisit.pathPattern,
      page_label: openVisit.pageLabel,
      entered_at: new Date(openVisit.enteredAt).toISOString(),
      active_seconds: Math.floor(openVisit.activeMs / 1000),
      idle_seconds: Math.floor(openVisit.idleMs / 1000),
    });
  }

  const activeDelta = Math.floor(activeDeltaMs / 1000);
  const idleDelta = Math.floor(idleDeltaMs / 1000);
  activeDeltaMs = activeDeltaMs % 1000;
  idleDeltaMs = idleDeltaMs % 1000;
  pendingPages = [];

  try {
    await apiFetch(
      "/api/v1/usage/events",
      {
        method: "POST",
        body: JSON.stringify({
          client_session_id: clientSessionId,
          last_activity_at: new Date(lastActivityAt).toISOString(),
          active_delta: activeDelta,
          idle_delta: idleDelta,
          pages,
        }),
      },
      { silent: true, background: true },
    );
  } catch {
    // Re-queue pages on failure so the next pulse can retry.
    pendingPages = [...pages.filter((p) => p.exited_at), ...pendingPages];
  }
}

async function startSession(pathname: string) {
  if (sessionStarted || ending) return;
  if (!shouldTrackPath(pathname)) return;

  let sid = clientSessionId;
  try {
    sid = sessionStorage.getItem(SESSION_STORAGE_KEY) || sid;
  } catch {
    /* ignore */
  }
  if (!sid) sid = newId();
  clientSessionId = sid;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
  } catch {
    /* ignore */
  }

  seqCounter = 0;
  openNewVisit(pathname);
  lastTickAt = Date.now();
  lastActivityAt = Math.max(Date.now(), readLocalActivity());

  try {
    await apiFetch(
      "/api/v1/usage/session/start",
      {
        method: "POST",
        body: JSON.stringify({
          client_session_id: sid,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : "",
          path: openVisit!.path,
          path_pattern: openVisit!.pathPattern,
          page_label: openVisit!.pageLabel,
          client_visit_id: openVisit!.clientVisitId,
        }),
      },
      { silent: true, background: true },
    );
    sessionStarted = true;
  } catch {
    sessionStarted = false;
  }
}

/** Ends the current usage session. Safe to call multiple times / without an open session. */
export async function endUsageSession(reason: "logout" | "idle_timeout" | "tab_closed" | "unknown" = "logout") {
  if (!clientSessionId || !sessionStarted || ending) return;
  ending = true;
  tickTimers();
  flushVisit();
  const activeDelta = Math.floor(activeDeltaMs / 1000);
  const idleDelta = Math.floor(idleDeltaMs / 1000);
  const pages = [...pendingPages];
  pendingPages = [];
  activeDeltaMs = 0;
  idleDeltaMs = 0;

  try {
    // Flush pending pages first, then end.
    if (pages.length > 0) {
      await apiFetch(
        "/api/v1/usage/events",
        {
          method: "POST",
          body: JSON.stringify({
            client_session_id: clientSessionId,
            last_activity_at: new Date(lastActivityAt).toISOString(),
            active_delta: activeDelta,
            idle_delta: idleDelta,
            pages,
          }),
        },
        { silent: true, background: true },
      );
    }
    await apiFetch(
      "/api/v1/usage/session/end",
      {
        method: "POST",
        body: JSON.stringify({
          client_session_id: clientSessionId,
          reason,
          active_delta: pages.length > 0 ? 0 : activeDelta,
          idle_delta: pages.length > 0 ? 0 : idleDelta,
        }),
      },
      { silent: true, background: true },
    );
  } catch {
    /* best-effort */
  } finally {
    sessionStarted = false;
    ending = false;
    clientSessionId = null;
    openVisit = null;
    seqCounter = 0;
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Router-level tracker: covers ERP + Command Center (not AppShell-only). */
export function UsageTracker() {
  const auth = useAuth();
  const loc = useLocation();
  let timer: ReturnType<typeof setInterval> | undefined;

  const onRoute = (pathname: string) => {
    if (!auth.me || !shouldTrackPath(pathname) || isIdleLogoutExemptPath(pathname)) return;
    if (!sessionStarted) {
      void startSession(pathname);
      return;
    }
    if (openVisit && openVisit.path === pathname) return;
    flushVisit();
    openNewVisit(pathname);
    void sendHeartbeat();
  };

  onMount(() => {
    const onVis = () => {
      tickTimers();
      if (document.visibilityState === "visible") void sendHeartbeat();
    };
    const onHide = () => {
      tickTimers();
      void sendHeartbeat();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_STORAGE_KEY) {
        const ts = readLocalActivity();
        if (ts > 0) lastActivityAt = Math.max(lastActivityAt, ts);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("storage", onStorage);
    timer = setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);

    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("storage", onStorage);
      if (timer) clearInterval(timer);
    });
  });

  createEffect(() => {
    const me = auth.me;
    const path = loc.pathname;
    if (!me) {
      if (sessionStarted) void endUsageSession("unknown");
      return;
    }
    onRoute(path);
  });

  return null;
}

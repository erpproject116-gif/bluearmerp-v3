import { apiAbsoluteUrl, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import type { HelpReplyHit } from "./helpTypes";

export type HelpAIConfig = {
  enabled: boolean;
  copilot?: boolean;
  provider: string;
  model: string;
  small_model?: string;
  medium_model?: string;
  daily_cap?: number;
  corpus_count?: number;
};

export type HelpComposeAIResult = {
  used_ai: boolean;
  message: string;
  article_ids: string[];
  provider?: string;
  model?: string;
  session_id?: number;
};

export type CopilotAskResult = {
  mode: "docs" | "ops" | "action" | string;
  message: string;
  used_ai: boolean;
  article_ids?: string[];
  hits?: Array<{
    article_id: string;
    title: string;
    snippet?: string;
    href?: string;
    score?: number;
  }>;
  tools?: unknown[];
  action_draft?: CopilotActionDraft | null;
  deep_links?: Array<{ label: string; href: string }>;
  entities?: CopilotEntityRef[];
  model?: string;
  session_id?: number;
};

export type CopilotEntityRef = {
  type: string;
  id: number;
  code?: string;
  label: string;
  extra?: string;
  href?: string;
};

export type CopilotActionDraft = {
  type: string;
  summary: string;
  payload: Record<string, unknown>;
  api?: string;
  method?: string;
};

let cachedConfig: HelpAIConfig | null = null;
let configFetchedAt = 0;

export async function fetchHelpAIConfig(force = false): Promise<HelpAIConfig | null> {
  const now = Date.now();
  if (!force && cachedConfig && now - configFetchedAt < 60_000) {
    return cachedConfig;
  }
  const res = await apiFetch<HelpAIConfig>("/api/v1/help/ai-config", {}, { silent: true, background: true });
  if (!res.success || !res.data) return cachedConfig;
  cachedConfig = res.data;
  configFetchedAt = now;
  return cachedConfig;
}

export async function postHelpFeedback(body: {
  query: string;
  pathname: string;
  article_id: string;
  vote: "up" | "down";
}) {
  return apiFetch<{ id: number }>("/api/v1/help/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  }, { silent: true, background: true });
}

export type HelpFeedbackAdminRow = {
  id: number;
  query: string;
  pathname: string;
  article_id: string;
  vote: "up" | "down" | string;
  user_id?: number | null;
  user_name?: string;
  created_at: string;
};

export type HelpFeedbackSummaryRow = {
  query: string;
  article_id: string;
  down_votes: number;
  up_votes: number;
  last_at: string;
  sample_pathname?: string;
};

export async function listHelpFeedbackAdmin(opts?: {
  vote?: "up" | "down";
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.vote) params.set("vote", opts.vote);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  const q = params.toString();
  return apiFetch<HelpFeedbackAdminRow[]>(`/api/v1/help/feedback${q ? `?${q}` : ""}`);
}

export async function summarizeHelpFeedback(opts?: { days?: number }) {
  const params = new URLSearchParams();
  if (opts?.days != null) params.set("days", String(opts.days));
  const q = params.toString();
  return apiFetch<HelpFeedbackSummaryRow[]>(`/api/v1/help/feedback/summary${q ? `?${q}` : ""}`);
}

export type HelpAttachmentPayload = {
  name: string;
  kind: string;
  text: string;
};

function hitsPayload(hits: HelpReplyHit[]) {
  return hits.map((h) => ({
    article_id: h.articleId,
    title: h.title,
    scenario: h.scenario ?? "",
    snippet: h.snippet,
    steps: h.steps ?? [],
  }));
}

export async function composeHelpWithAI(input: {
  query: string;
  pathname: string;
  hits: HelpReplyHit[];
  sessionId?: number;
  attachments?: HelpAttachmentPayload[];
}): Promise<HelpComposeAIResult | null> {
  const cfg = await fetchHelpAIConfig();
  if (!cfg?.enabled || !input.hits.length) return null;

  const branchId = getActiveBranchIdCurrent() ?? 0;
  const res = await apiFetch<HelpComposeAIResult>(
    "/api/v1/help/compose",
    {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        pathname: input.pathname,
        hits: hitsPayload(input.hits),
        session_id: input.sessionId,
        attachments: input.attachments ?? [],
        personalization: {
          pathname: input.pathname,
          branch_id: branchId || undefined,
        },
      }),
    },
    { silent: true, background: true },
  );
  if (!res.success || !res.data) return null;
  return res.data;
}

/** SSE stream compose; falls back to null on failure. */
export async function composeHelpWithAIStream(input: {
  query: string;
  pathname: string;
  hits: HelpReplyHit[];
  onDelta?: (text: string) => void;
}): Promise<HelpComposeAIResult | null> {
  const cfg = await fetchHelpAIConfig();
  if (!cfg?.enabled || !input.hits.length) return null;

  const token = await getAccessToken();
  if (!token) return null;
  const branchId = getActiveBranchIdCurrent() ?? 0;
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  if (branchId) headers["X-Branch-ID"] = String(branchId);

  const res = await fetch(apiAbsoluteUrl("/api/v1/help/compose"), {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      query: input.query,
      pathname: input.pathname,
      hits: hitsPayload(input.hits),
      stream: true,
      personalization: {
        pathname: input.pathname,
        branch_id: branchId || undefined,
      },
    }),
  });
  // Auth / DashScope failures: caller falls back to non-stream compose.
  if (!res.ok || !res.body) return null;

  const ctype = res.headers.get("content-type") || "";
  // Server may fall back to JSON when Flusher is unavailable.
  if (ctype.includes("application/json")) {
    try {
      const envelope = (await res.json()) as { success?: boolean; data?: HelpComposeAIResult };
      return envelope.data ?? null;
    } catch {
      return null;
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: HelpComposeAIResult | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      const lines = block.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === "delta" && typeof parsed.text === "string") {
          input.onDelta?.(parsed.text);
        }
        if (event === "done") {
          donePayload = parsed as unknown as HelpComposeAIResult;
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
  return donePayload;
}

export async function askCopilot(input: {
  query: string;
  pathname: string;
  sessionId?: number;
  attachments?: HelpAttachmentPayload[];
  entities?: CopilotEntityRef[];
}): Promise<CopilotAskResult | null> {
  const cfg = await fetchHelpAIConfig();
  if (!cfg?.copilot) return null;
  const res = await apiFetch<CopilotAskResult>(
    "/api/v1/copilot/ask",
    {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        pathname: input.pathname,
        session_id: input.sessionId,
        attachments: input.attachments ?? [],
        entities: input.entities ?? [],
      }),
    },
    { silent: true, background: true },
  );
  if (!res.success || !res.data) return null;
  return res.data;
}

export async function searchCopilotEntities(q: string, type?: string): Promise<CopilotEntityRef[]> {
  const params = new URLSearchParams({ q: q.trim() });
  if (type) params.set("type", type);
  const res = await apiFetch<{ entities: CopilotEntityRef[] }>(
    `/api/v1/copilot/entities/search?${params.toString()}`,
    {},
    { silent: true, background: true },
  );
  if (!res.success || !res.data?.entities) return [];
  return res.data.entities;
}

export function formatEntityMention(e: CopilotEntityRef): string {
  const label = (e.code && e.code !== e.label ? `${e.code} ${e.label}` : e.label || e.code || String(e.id)).trim();
  return `@[${e.type}:${e.id}|${label}]`;
}

export function parseEntityMentions(text: string): CopilotEntityRef[] {
  const re = /@\[([a-z_]+):(\d+)\|([^\]]+)\]/g;
  const out: CopilotEntityRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m[1], id: Number(m[2]), label: m[3].trim(), code: m[3].trim() });
  }
  return out;
}

export type CopilotSessionSummary = {
  id: number;
  title: string;
  pathname: string;
  updated_at: string;
  created_at: string;
};

export type CopilotSessionDetail = {
  id: number;
  title: string;
  pathname: string;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    article_ids?: unknown;
    attachments?: unknown;
    model?: string;
    created_at: string;
  }>;
};

export async function listCopilotSessions() {
  return apiFetch<CopilotSessionSummary[]>("/api/v1/copilot/sessions", {}, { silent: true, background: true });
}

export async function getCopilotSession(id: number) {
  return apiFetch<CopilotSessionDetail>(`/api/v1/copilot/sessions/${id}`, {}, { silent: true, background: true });
}

export async function deleteCopilotSession(id: number) {
  return apiFetch<{ id: number }>(`/api/v1/copilot/sessions/${id}`, { method: "DELETE" }, { silent: true });
}

export async function approveCopilotAction(draft: CopilotActionDraft, sessionId?: number) {
  return apiFetch<{ decision: string; result?: unknown }>("/api/v1/copilot/actions/approve", {
    method: "POST",
    body: JSON.stringify({ draft, session_id: sessionId }),
  });
}

export async function denyCopilotAction(draft: CopilotActionDraft, sessionId?: number) {
  return apiFetch<{ decision: string }>("/api/v1/copilot/actions/deny", {
    method: "POST",
    body: JSON.stringify({ draft, session_id: sessionId }),
  }, { silent: true });
}

const OPS_HINT =
  /\b(overdue|cash|stock|inventory|follow[- ]?up|financial health|receivable|payable|pipeline|on hand|look\s*up|serial|invoice|load\s*slip|transaction|customer|vendor|item code|expense|expenses|revenue|profit|margin|forecast|projection|predict|estimate|how much|how many|ytd|mtd|burn|kpi|aging|as of today)\b/i;
const ACTION_HINT =
  /\b(create recurring|add recurring|smart rfq|analyze rfq|process rfq|run rfq|quotation from rfq|draft quotation from rfq|import rfq|upload rfq|rfq pdf|generate quotation|create quotation|new quotation|send email|email quotation|send quotation|create follow[- ]?up|schedule follow[- ]?up|crm task|create sales order|new sales order|new sales|sales invoice|purchase request|create pr|purchase order|create po|create rfq|new rfq|supplier invoice|new purchase|bulk inventory|import items|pc build|product bundle|item build|bill of materials|compose email)\b/i;
const MENTION_HINT = /@\[|[^\S\r\n]@\w|^\s*@/;

/** Kept for tests / callers; Copilot UI now routes all asks to /copilot/ask when enabled. */
export function shouldUseCopilotAsk(query: string): boolean {
  return OPS_HINT.test(query) || ACTION_HINT.test(query) || MENTION_HINT.test(query);
}

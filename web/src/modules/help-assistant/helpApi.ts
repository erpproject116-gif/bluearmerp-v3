import { apiFetch } from "../../shared/api";
import type { HelpReplyHit } from "./helpTypes";

export type HelpAIConfig = {
  enabled: boolean;
  provider: string;
  model: string;
};

export type HelpComposeAIResult = {
  used_ai: boolean;
  message: string;
  article_ids: string[];
  provider?: string;
  model?: string;
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

export async function composeHelpWithAI(input: {
  query: string;
  pathname: string;
  hits: HelpReplyHit[];
}): Promise<HelpComposeAIResult | null> {
  const cfg = await fetchHelpAIConfig();
  if (!cfg?.enabled || !input.hits.length) return null;

  const res = await apiFetch<HelpComposeAIResult>(
    "/api/v1/help/compose",
    {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        pathname: input.pathname,
        hits: input.hits.map((h) => ({
          article_id: h.articleId,
          title: h.title,
          scenario: h.scenario ?? "",
          snippet: h.snippet,
          steps: h.steps ?? [],
        })),
      }),
    },
    { silent: true, background: true },
  );
  if (!res.success || !res.data) return null;
  return res.data;
}

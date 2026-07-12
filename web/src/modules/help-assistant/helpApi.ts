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

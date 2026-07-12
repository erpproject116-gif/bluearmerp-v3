import type { HelpFeedbackEvent, HelpFeedbackVote } from "./helpTypes";
import { postHelpFeedback } from "./helpApi";

const STORAGE_KEY = "bluearm-help-feedback-v1";
const MAX_EVENTS = 200;

function readAll(): HelpFeedbackEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HelpFeedbackEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(events: HelpFeedbackEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // ignore quota / private mode
  }
}

export function recordHelpFeedback(input: {
  query: string;
  pathname: string;
  articleId: string;
  vote: HelpFeedbackVote;
}): HelpFeedbackEvent {
  const event: HelpFeedbackEvent = {
    at: new Date().toISOString(),
    query: input.query.trim().slice(0, 240),
    pathname: input.pathname.slice(0, 200),
    articleId: input.articleId,
    vote: input.vote,
  };
  writeAll([...readAll(), event]);
  void postHelpFeedback({
    query: event.query,
    pathname: event.pathname,
    article_id: event.articleId,
    vote: event.vote,
  });
  return event;
}

export function listHelpFeedback(): HelpFeedbackEvent[] {
  return readAll();
}

export function clearHelpFeedback() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

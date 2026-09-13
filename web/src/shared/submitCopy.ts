/** Shared submit / preloader copy for non-tech operators. */
export const SUBMIT_COPY = {
  savingDraft: "Saving draft…",
  saving: "Saving…",
  postingStock: "Posting — stock will change…",
  posting: "Posting…",
  confirming: "Confirming…",
  couldNotSave: "Couldn’t save — see the message above, then try again.",
  couldNotPost: "Couldn’t post — see the message above, then try again.",
} as const;

export function submitBusyLabel(kind: "draft" | "save" | "post" | "confirm", busy: boolean, idle: string): string {
  if (!busy) return idle;
  switch (kind) {
    case "draft":
      return SUBMIT_COPY.savingDraft;
    case "post":
      return SUBMIT_COPY.postingStock;
    case "confirm":
      return SUBMIT_COPY.confirming;
    default:
      return SUBMIT_COPY.saving;
  }
}

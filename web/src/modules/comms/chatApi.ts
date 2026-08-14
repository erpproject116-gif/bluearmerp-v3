import { apiFetch } from "../../shared/api";

export const CHAT_MAX_ATTACH_BYTES = 25 * 1024 * 1024;

export type ChatChannel = {
  id: number;
  type: "channel" | "group" | "dm";
  name: string;
  topic?: string;
  is_private: boolean;
  created_by_user_id?: number | null;
  created_at: string;
  unread_count: number;
  member_count: number;
  last_message_at?: string | null;
  last_message_preview?: string;
};

export type ChatUser = {
  id: number;
  full_name: string;
  email: string;
};

export type ChatMessageLink = {
  id: number;
  entity_type: string;
  entity_id?: number | null;
  label: string;
  href: string;
};

export type ChatAttachment = {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  download_path: string;
  created_at: string;
};

export type ChatMessage = {
  id: number;
  channel_id: number;
  sender_user_id?: number | null;
  sender_name?: string;
  sender_kind?: "user" | "baiko" | "system";
  body: string;
  created_at: string;
  deleted_at?: string | null;
  parent_message_id?: number | null;
  forwarded_from_message_id?: number | null;
  parent_preview?: {
    id: number;
    body: string;
    sender_name?: string;
    deleted?: boolean;
  } | null;
  mention_ids?: number[];
  links?: ChatMessageLink[];
  attachments?: ChatAttachment[];
  reactions?: { emoji: string; count: number; me: boolean }[];
};

export type ChatTypingUser = {
  user_id: number;
  full_name: string;
};

export type ChatReminder = {
  id: number;
  channel_id?: number | null;
  title: string;
  body?: string;
  remind_at: string;
  status: string;
  notify_channel: boolean;
  crm_task_id?: number | null;
  created_at: string;
};

export type BaikoCapabilities = {
  can_use_baiko_slash: boolean;
  commands: string[];
  everyone_commands: string[];
};

export type SlashResult = {
  message?: ChatMessage;
  navigate?: string;
  action_draft?: { type: string; payload?: Record<string, unknown> };
  approve_hint?: string;
  ask_query?: string;
};

export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "👀", "✅"] as const;

export type DocSearchHit = {
  entity_type: string;
  entity_id: number;
  label: string;
  href: string;
};

export const CHAT_ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "quo_quotation", label: "Quotation" },
  { value: "so_sales_order", label: "Sales order" },
  { value: "sa_sales", label: "Sales invoice" },
  { value: "po_purchase_order", label: "Purchase order" },
  { value: "pr_purchase_request", label: "Purchase request" },
  { value: "gr_goods_receipt", label: "Goods receipt" },
  { value: "fin_supplier_invoice", label: "Supplier invoice" },
  { value: "fin_official_receipt", label: "Official receipt" },
  { value: "fin_payment_voucher", label: "Payment voucher" },
  { value: "support_ticket", label: "Support ticket" },
  { value: "crm_warranty_asset", label: "Warranty asset" },
  { value: "rfq_request", label: "RFQ" },
  { value: "job_cost_project", label: "Job cost project" },
  { value: "report_ar_book", label: "AR book (report)" },
  { value: "report_ap_book", label: "AP book (report)" },
  { value: "report_stock_ledger", label: "Stock ledger (report)" },
];

export async function listChatChannels() {
  return apiFetch<ChatChannel[]>("/api/v1/comms/chat/channels");
}

export async function createChatChannel(body: {
  type: "channel" | "group";
  name: string;
  topic?: string;
  is_private?: boolean;
  member_ids?: number[];
}) {
  return apiFetch<{ id: number }>("/api/v1/comms/chat/channels", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createOrGetDM(userId: number) {
  return apiFetch<{ id: number; created: boolean }>("/api/v1/comms/chat/dms", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function listChatMessages(channelId: number, beforeId?: number) {
  const qs = new URLSearchParams({ limit: "50" });
  if (beforeId) qs.set("before_id", String(beforeId));
  return apiFetch<ChatMessage[]>(`/api/v1/comms/chat/channels/${channelId}/messages?${qs}`);
}

export async function postChatMessage(
  channelId: number,
  body: {
    body: string;
    mention_ids?: number[];
    links?: { entity_type: string; entity_id?: number | null; label?: string }[];
    parent_message_id?: number | null;
  },
) {
  return apiFetch<ChatMessage>(`/api/v1/comms/chat/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  }, { silent: true });
}

export async function markChatRead(channelId: number, messageId?: number) {
  return apiFetch(`/api/v1/comms/chat/channels/${channelId}/read`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId ?? 0 }),
  }, { silent: true });
}

export async function listChatUsers(q = "") {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  return apiFetch<ChatUser[]>(`/api/v1/comms/chat/users?${qs}`);
}

export async function searchChatDocs(entityType: string, q = "") {
  const qs = new URLSearchParams({ entity_type: entityType, q });
  return apiFetch<DocSearchHit[]>(`/api/v1/comms/chat/doc-search?${qs}`);
}

export async function getChatMessage(id: number) {
  return apiFetch<ChatMessage>(`/api/v1/comms/chat/messages/${id}`);
}

export async function uploadChatAttachment(messageId: number, file: File) {
  const { apiBase, getAccessToken } = await import("../../shared/api");
  const { getActiveTenantId, getActiveBranchIdCurrent } = await import("../../shared/activeContext");
  const fd = new FormData();
  fd.append("file", file);
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  const res = await fetch(`${apiBase}/api/v1/comms/chat/messages/${messageId}/attachments`, {
    method: "POST",
    headers,
    body: fd,
  });
  const body = (await res.json()) as import("../../shared/api").ApiResult<ChatAttachment>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function downloadChatAttachment(att: ChatAttachment): Promise<boolean> {
  const { apiBase, getAccessToken } = await import("../../shared/api");
  const { getActiveTenantId, getActiveBranchIdCurrent } = await import("../../shared/activeContext");
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  const res = await fetch(`${apiBase}${att.download_path}`, { headers });
  if (!res.ok) return false;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = att.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

export async function addChatMembers(channelId: number, userIds: number[]) {
  return apiFetch(`/api/v1/comms/chat/channels/${channelId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function fetchChatUnreadTotal() {
  return apiFetch<{ unread_total: number }>("/api/v1/comms/chat/unread-total", {}, { silent: true });
}

export async function postChatTyping(channelId: number) {
  return apiFetch(`/api/v1/comms/chat/channels/${channelId}/typing`, { method: "POST", body: "{}" }, { silent: true });
}

export async function listChatTyping(channelId: number) {
  return apiFetch<ChatTypingUser[]>(`/api/v1/comms/chat/channels/${channelId}/typing`, {}, { silent: true });
}

export async function addChatReaction(messageId: number, emoji: string) {
  return apiFetch(`/api/v1/comms/chat/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  }, { silent: true });
}

export async function removeChatReaction(messageId: number, emoji: string) {
  return apiFetch(`/api/v1/comms/chat/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
    method: "DELETE",
  }, { silent: true });
}

export async function forwardChatMessage(messageId: number, channelId: number) {
  return apiFetch<ChatMessage>(`/api/v1/comms/chat/messages/${messageId}/forward`, {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId }),
  }, { silent: true });
}

export async function createChatReminder(body: {
  title: string;
  body?: string;
  remind_at: string;
  channel_id?: number | null;
  notify_channel?: boolean;
  also_crm_task?: boolean;
}) {
  return apiFetch<ChatReminder>("/api/v1/comms/chat/reminders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchDueChatReminders() {
  return apiFetch<ChatReminder[]>("/api/v1/comms/chat/reminders/due", {}, { silent: true });
}

export async function fetchBaikoCapabilities() {
  return apiFetch<BaikoCapabilities>("/api/v1/comms/chat/baiko-capabilities", {}, { silent: true });
}

export async function postChatSlash(channelId: number, command: string, args = "") {
  return apiFetch<SlashResult>(`/api/v1/comms/chat/channels/${channelId}/slash`, {
    method: "POST",
    body: JSON.stringify({ command, args }),
  }, { silent: true });
}

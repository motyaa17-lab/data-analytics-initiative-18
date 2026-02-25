export const BASE = "https://functions.poehali.dev/b1a16ec3-c9d7-4e46-bb90-e30137e5c534";

export function authHeaders(token: string) {
  return { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` };
}

export async function apiFriends(sub: string, token: string) {
  const res = await fetch(`${BASE}?action=friends&sub=${sub}`, { headers: authHeaders(token) });
  return res.json();
}

export async function apiSendFriendReq(username: string, token: string) {
  const res = await fetch(`${BASE}?action=friends`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sub: "send", username }),
  });
  return res.json();
}

export async function apiRespondReq(request_id: number, accept: boolean, token: string) {
  const res = await fetch(`${BASE}?action=friends`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sub: accept ? "accept" : "decline", request_id }),
  });
  return res.json();
}

export async function apiGetDM(withId: number, token: string) {
  const res = await fetch(`${BASE}?action=dm&with=${withId}`, { headers: authHeaders(token) });
  return res.json();
}

export async function apiSendDM(toId: number, content: string, token: string, voice_url?: string) {
  const res = await fetch(`${BASE}?action=dm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ to: toId, content, ...(voice_url ? { voice_url } : {}) }),
  });
  return res.json();
}

export interface Friend { id: number; username: string; favorite_game: string; }
export interface FriendRequest { request_id: number; user_id: number; username: string; favorite_game: string; }
export interface DMessage { id: number; content: string; created_at: string; username: string; is_removed?: boolean; edited?: boolean; voice_url?: string; }

export async function apiEditDM(msgId: number, content: string, token: string) {
  const res = await fetch(`${BASE}?action=edit_dm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ msg_id: msgId, content }),
  });
  return res.json();
}
export interface DMContextMenu { msgId: number; x: number; y: number; isMe: boolean; }

export type Tab = "friends" | "requests" | "add";

export function avatarColor(name: string) {
  const gradients = [
    "linear-gradient(135deg, #7c3aed, #3b82f6)",
    "linear-gradient(135deg, #6d28d9, #2563eb)",
    "linear-gradient(135deg, #8b5cf6, #60a5fa)",
    "linear-gradient(135deg, #9333ea, #3b82f6)",
    "linear-gradient(135deg, #7e22ce, #1d4ed8)",
    "linear-gradient(135deg, #a855f7, #38bdf8)",
    "linear-gradient(135deg, #6366f1, #06b6d4)",
    "linear-gradient(135deg, #8b5cf6, #2dd4bf)",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return gradients[Math.abs(h) % gradients.length];
}

export function getSeenMap(key: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

export function markSeen(key: string, friendId: number, lastId: number) {
  const m = getSeenMap(key);
  m[String(friendId)] = lastId;
  localStorage.setItem(key, JSON.stringify(m));
}
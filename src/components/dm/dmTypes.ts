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

export async function apiSendDM(toId: number, content: string, token: string) {
  const res = await fetch(`${BASE}?action=dm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ to: toId, content }),
  });
  return res.json();
}

export interface Friend { id: number; username: string; favorite_game: string; }
export interface FriendRequest { request_id: number; user_id: number; username: string; favorite_game: string; }
export interface DMessage { id: number; content: string; created_at: string; username: string; is_removed?: boolean; }
export interface DMContextMenu { msgId: number; x: number; y: number; isMe: boolean; }

export type Tab = "friends" | "requests" | "add";

export function avatarColor(name: string) {
  const colors = ["#5865f2","#eb459e","#ed4245","#fee75c","#57f287","#1abc9c","#3498db","#e91e63"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

export function getSeenMap(key: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

export function markSeen(key: string, friendId: number, lastId: number) {
  const m = getSeenMap(key);
  m[String(friendId)] = lastId;
  localStorage.setItem(key, JSON.stringify(m));
}

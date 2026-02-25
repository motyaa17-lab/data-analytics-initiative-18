const BASE = "https://functions.poehali.dev/b1a16ec3-c9d7-4e46-bb90-e30137e5c534";

function headers(method: string, token?: string | null) {
  const h: Record<string, string> = {};
  if (method !== "GET") h["Content-Type"] = "application/json";
  if (token) h["X-Authorization"] = `Bearer ${token}`;
  return h;
}

 
async function req(action: string, method: string, token?: string | null, body?: object, extra?: Record<string, string>, attempt = 0): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ action, ...extra });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${BASE}?${params}`, {
      method,
      headers: headers(method, token),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.json();
  } catch {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1000));
      return req(action, method, token, body, extra, attempt + 1);
    }
    return { error: "Нет соединения с сервером" };
  }
}

export const api = {
  messages: {
    get: (channel: string, token?: string | null, room_id?: number) =>
      req("messages", "GET", token, undefined, room_id ? { channel, room_id: String(room_id) } : { channel }),
    send: (token: string, content: string, channel: string, room_id?: number) =>
      req("messages", "POST", token, { content, channel, ...(room_id ? { room_id } : {}) }),
    remove: (token: string, msg_id: number) =>
      req("delete_msg", "POST", token, { msg_id }),
  },
  reactions: {
    add: (token: string, msg_id: number, emoji: string) =>
      req("react", "POST", token, { msg_id, emoji }),
    remove: (token: string, msg_id: number, emoji: string) =>
      req("unreact", "POST", token, { msg_id, emoji }),
  },
  rooms: {
    list: (token?: string | null) => req("rooms", "GET", token),
    create: (token: string, name: string, description: string, is_public: boolean) =>
      req("rooms", "POST", token, { name, description, is_public }),
    join: (token: string, code: string) => {
      const params = new URLSearchParams({ action: "join", code });
      return fetch(`${BASE}?${params}`, { method: "POST", headers: headers("POST", token) })
        .then(r => r.json())
        .catch(() => ({ error: "Нет соединения с сервером" }));
    },
    createInvite: (token: string, room_id: number) => {
      const params = new URLSearchParams({ action: "invite", room_id: String(room_id) });
      return fetch(`${BASE}?${params}`, { method: "POST", headers: headers("POST", token) })
        .then(r => r.json())
        .catch(() => ({ error: "Нет соединения с сервером" }));
    },
    inviteFriend: (token: string, room_id: number, friend_id: number) =>
      req("invite_friend", "POST", token, { room_id, friend_id }),
  },
  online: {
    get: () => req("online", "GET"),
  },
  settings: {
    get: (token: string) => req("settings", "GET", token),
    save: (token: string, data: { username?: string; favorite_game?: string }) =>
      req("settings", "POST", token, data),
  },
  dm: {
    get: (token: string, withId: number) =>
      req("dm", "GET", token, undefined, { with: String(withId) }),
    send: (token: string, toId: number, content: string) =>
      req("dm", "POST", token, { to: toId, content }),
    remove: (token: string, msg_id: number) =>
      req("delete_dm", "POST", token, { msg_id }),
  },
  admin: {
    stats: (token: string) => req("admin_stats", "GET", token),
    logs: (token: string, limit = 50, level = "") => {
      const extra: Record<string, string> = { limit: String(limit) };
      if (level) extra.level = level;
      return req("admin_logs", "GET", token, undefined, extra);
    },
    users: (token: string, q = "", limit = 50, offset = 0) => {
      const extra: Record<string, string> = { limit: String(limit), offset: String(offset) };
      if (q) extra.q = q;
      return req("admin_users", "GET", token, undefined, extra);
    },
    ban: (token: string, user_id: number, ban: boolean) =>
      req("admin_ban", "POST", token, { user_id, ban }),
  },
};

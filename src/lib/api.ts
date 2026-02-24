const BASE = "https://functions.poehali.dev/b1a16ec3-c9d7-4e46-bb90-e30137e5c534";

function headers(token?: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["X-Authorization"] = `Bearer ${token}`;
  return h;
}

async function req(action: string, method: string, token?: string | null, body?: object, extra?: Record<string, string>) {
  const params = new URLSearchParams({ action, ...extra });
  const res = await fetch(`${BASE}?${params}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export const api = {
  messages: {
    get: (channel: string, token?: string | null, room_id?: number) =>
      req("messages", "GET", token, undefined, room_id ? { channel, room_id: String(room_id) } : { channel }),
    send: (token: string, content: string, channel: string, room_id?: number) =>
      req("messages", "POST", token, { content, channel, ...(room_id ? { room_id } : {}) }),
  },
  rooms: {
    list: () => req("rooms", "GET"),
    create: (token: string, name: string, description: string, is_public: boolean) =>
      req("rooms", "POST", token, { name, description, is_public }),
    join: (token: string, code: string) => {
      const params = new URLSearchParams({ action: "join", code });
      return fetch(`${BASE}?${params}`, { method: "POST", headers: headers(token) }).then(r => r.json());
    },
    createInvite: (token: string, room_id: number) => {
      const params = new URLSearchParams({ action: "invite", room_id: String(room_id) });
      return fetch(`${BASE}?${params}`, { method: "POST", headers: headers(token) }).then(r => r.json());
    },
  },
  online: {
    get: () => req("online", "GET"),
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
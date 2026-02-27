const BASE = "/api";

type AnyObj = Record<string, any>;

function headers(method: string, token?: string | null) {
  const h: Record<string, string> = {};
  if (method !== "GET") h["Content-Type"] = "application/json";
  if (token) h["X-Authorization"] = `Bearer ${token}`;
  return h;
}

// На всякий: если сервер вернул не-JSON (HTML/текст)
async function safeParse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text || "Bad response" };
  }
}

// Гарантируем массив, чтобы UI не падал на .length
function asArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && Array.isArray(x.messages)) return x.messages;
  if (x && Array.isArray(x.rooms)) return x.rooms;
  if (x && Array.isArray(x.users)) return x.users;
  if (x && Array.isArray(x.logs)) return x.logs;
  return [];
}

function asObject(x: any): AnyObj {
  return x && typeof x === "object" ? x : {};
}

async function req(
  action: string,
  method: string,
  token?: string | null,
  body?: any,
  extra: Record<string, string> = {},
  attempt = 0
): Promise<any> {
  const params = new URLSearchParams({ action, ...extra });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      method,
      headers: headers(method, token),
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await safeParse(res);

    // Важно: не кидаем исключение — возвращаем объект ошибки
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && (data.error || data.message)) ||
        `HTTP ${res.status}`;
      return { error: String(msg), status: res.status, details: data };
    }

    return data;
  } catch (e) {
    clearTimeout(timeout);

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000));
      return req(action, method, token, body, extra, attempt + 1);
    }

    return { error: "Нет соединения с сервером" };
  }
}

export const api = {
  messages: {
    get: async (channel: string, token: string | null, room_id?: number) => {
      const r = await req(
        "messages",
        "GET",
        token ?? null,
        undefined,
        room_id ? { channel, room_id: String(room_id) } : { channel }
      );
      return asArray(r);
    },

    send: async (
      token: string,
      content: string,
      channel: string,
      room_id?: number,
      image_url?: string
    ) => {
      const r = await req(
        "messages",
        "POST",
        token,
        {
          content,
          channel,
          ...(room_id ? { room_id } : {}),
          ...(image_url ? { image_url } : {}),
        },
        {}
      );
      return r;
    },

    uploadImage: async (token: string, image: string) => {
      const r = await req("upload_image", "POST", token, { image }, {});
      return r;
    },

    uploadVoice: async (token: string, audio: string, ext: string) => {
      const r = await req("upload_voice", "POST", token, { audio, ext }, {});
      return r;
    },

    sendWithVoice: async (token: string, channel: string, voice_url: string, room_id?: number) => {
      const r = await req(
        "messages",
        "POST",
        token,
        { content: "", channel, voice_url, ...(room_id ? { room_id } : {}) },
        {}
      );
      return r;
    },

    remove: async (token: string, msg_id: number) => {
      const r = await req("delete_msg", "POST", token, { msg_id }, {});
      return r;
    },

    edit: async (token: string, msg_id: number, content: string) => {
      const r = await req("edit_msg", "POST", token, { msg_id, content }, {});
      return r;
    },
  },

  reactions: {
    add: async (token: string, msg_id: number, emoji: string) => {


r = await req("react", "POST", token, { msg_id, emoji }, {});
      return r;
    },

    remove: async (token: string, msg_id: number, emoji: string) => {
      const r = await req("unreact", "POST", token, { msg_id, emoji }, {});
      return r;
    },
  },

  profile: {
    get: async (username: string) => {
      const r = await req("profile", "GET", null, undefined, { username });
      return asObject(r);
    },

    uploadAvatar: async (token: string, image: string) => {
      const r = await req("upload_avatar", "POST", token, { image }, {});
      return r;
    },
  },

  rooms: {
    // КЛЮЧЕВОЕ: всегда массив, чтобы UI не падал на .length
    list: async (token?: string | null) => {
      const r = await req("rooms", "GET", token ?? null, undefined, {});
      return asArray(r);
    },

    create: async (token: string, name: string, description: string, is_public: boolean) => {
      const r = await req("rooms", "POST", token, { name, description, is_public }, {});
      return r;
    },

    // join/invite НЕ через "rooms" action — иначе action перезатирается и сервер отвечает 400/500
    join: async (token: string, code: string) => {
      const r = await req("join", "POST", token, undefined, { code });
      return r;
    },

    createInvite: async (token: string, room_id: number) => {
      const r = await req("invite", "POST", token, undefined, { room_id: String(room_id) });
      return r;
    },

    inviteFriend: async (token: string, room_id: number, friend_id: number) => {
      const r = await req("invite_friend", "POST", token, { room_id, friend_id }, {});
      return r;
    },
  },

  online: {
    get: async () => {
      const r = await req("online", "GET", null, undefined, {});
      // главное — не крашить UI
      if (typeof r === "boolean") return r;
      if (r && typeof r === "object" && typeof r.online === "boolean") return r.online;
      return false;
    },
  },

  settings: {
    get: async (token: string) => {
      const r = await req("settings", "GET", token, undefined, {});
      return asObject(r);
    },

    save: async (token: string, data: { username?: string; favorite_game?: string }) => {
      const r = await req("settings", "POST", token, data, {});
      return r;
    },
  },

  dm: {
    get: async (token: string, withId: number) => {
      const r = await req("dm", "GET", token, undefined, { with: String(withId) });
      return asArray(r);
    },

    send: async (token: string, toId: number, content: string) => {
      const r = await req("dm", "POST", token, { to: toId, content }, {});
      return r;
    },

    remove: async (token: string, msg_id: number) => {
      const r = await req("delete_dm", "POST", token, { msg_id }, {});
      return r;
    },
  },

  typing: {
    send: async (token: string, channel?: string, dm_with?: number) => {
      const r = await req("typing_start", "POST", token, {}, {
        ...(channel ? { channel } : {}),
        ...(dm_with ? { dm_with: String(dm_with) } : {}),
      });
      return r;
    },

    get: async (token: string, channel?: string, dm_with?: number) => {
      const r = await req("typing_get", "GET", token, undefined, {
        ...(channel ? { channel } : {}),
        ...(dm_with ? { dm_with: String(dm_with) } : {}),
      });
      return asObject(r);
    },
  },

  admin: {
    stats: async (token: string) => {
      const r = await req("admin_stats", "GET", token, undefined, {});
      return asObject(r);
    },

    logs: async (token: string, limit = 50, level = "") => {
      const extra: Record<string, string> = { limit: String(limit) };
      if (level) extra.level = level;
      const r = await req("admin_logs", "GET", token, undefined, extra);
      return asArray(r);
    },

    users: async (token: string, q = "", limit = 50, offset = 0) => {
      const extra: Record<string, string> = { limit: String(limit), offset: String(offset) };
      if (q) extra.q = q;
      const r = await req("admin_users", "GET", token, undefined, extra);
      return asArray(r);
    },

    ban: async (token: string, u


ser_id: number, ban: boolean) => {
      const r = await req("admin_ban", "POST", token, { user_id, ban }, {});
      return r;
    },

    messages: async (token: string, channel?: string, room_id?: number, limit = 50) => {
      const extra: Record<string, string> = { limit: String(limit) };
      if (channel) extra.channel = channel;
      if (room_id) extra.room_id = String(room_id);
      const r = await req("admin_messages", "GET", token, undefined, extra);
      return asArray(r);
    },

    clearChannel: async (token: string, channel: string) => {
      const r = await req("admin_clear", "POST", token, { channel }, {});
      return r;
    },

    clearRoom: async (token: string, room_id: number) => {
      const r = await req("admin_clear", "POST", token, { room_id }, {});
      return r;
    },

    deleteMsg: async (token: string, msg_id: number) => {
      const r = await req("admin_clear", "POST", token, { msg_id }, {});
      return r;
    },

    setBadge: async (token: string, user_id: number, badge: string) => {
      const r = await req("admin_set_badge", "POST", token, { user_id, badge }, {});
      return r;
    },
  },
}; const

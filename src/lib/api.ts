const BASE = "/api";

function headers(method: string, token?: string | null) {
  const h: Record<string, string> = {};
  if (method !== "GET") h["Content-Type"] = "application/json";
  if (token) h["X-Authorization"] = `Bearer ${token}`;
  return h;
}

// Всегда превращаем ответ в массив (чтобы фронт не падал на .length)
function asArray<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.items)) return x.items;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.rooms)) return x.rooms;
  if (Array.isArray(x?.messages)) return x.messages;
  if (Array.isArray(x?.result)) return x.result;
  return [];
}

async function req(
  action: string,
  method: string,
  token?: string | null,
  body?: any,
  extra: Record<string, string> = {},
  attempt = 0
) {
  const params = new URLSearchParams({ action, ...extra });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      method,
      headers: headers(method, token),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Иногда сервер может вернуть HTML/текст — безопасно читаем текст
    const text = await res.text();

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || "Bad response", status: res.status };
    }

    // Если статус не ОК — тоже отдаём объект с ошибкой, но НЕ кидаем исключение
    if (!res.ok) {
      return {
        error: data?.error || data?.message || `HTTP ${res.status}`,
        status: res.status,
        ...data,
      };
    }

    return data;
  } catch (e) {
    clearTimeout(timeout);

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800));
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
      // ВАЖНО: всегда массив
      return asArray(r);
    },

    send: (token: string, content: string, channel: string, room_id?: number, image_url?: string) =>
      req(
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
      ),

    uploadImage: (token: string, image: string) =>
      req("upload_image", "POST", token, { image }, {}),

    uploadVoice: (token: string, audio: string, ext: string) =>
      req("upload_voice", "POST", token, { audio, ext }, {}),

    sendWithVoice: (token: string, channel: string, voice_url: string, room_id?: number) =>
      req(
        "messages",
        "POST",
        token,
        {
          content: "",
          channel,
          voice_url,
          ...(room_id ? { room_id } : {}),
        },
        {}
      ),

    remove: (token: string, msg_id: number) =>
      req("delete_msg", "POST", token, { msg_id }, {}),

    edit: (token: string, msg_id: number, content: string) =>
      req("edit_msg", "POST", token, { msg_id, content }, {}),
  },

  reactions: {
    add: (token: string, msg_id: number, emoji: string) =>
      req("react", "POST", token, { msg_id, emoji }, {}),

    remove: (token: string, msg_id: number, emoji: string) =>
      req("unreact", "POST", token, { msg_id, emoji }, {}),
  },

  profile: {
    get: (username: string) =>
      req("profile", "GET", null, undefined, { username }),

    uploadAvatar: (token: string, image: string) =>
      req("upload_avatar", "POST", token, { image }, {}),
  },

  rooms: {
    // КЛЮЧЕВО: возвращаем массив, даже если сервер вернул ошибку
    list: async (token?: string | null) => {
      const r = await


("rooms", "GET", token ?? null);
      return asArray(r);
    },

    create: (token: string, name: string, description: string, is_public: boolean) =>
      req("rooms", "POST", token, { name, description, is_public }, {}),

    join: (token: string, code: string) =>
      req("join", "POST", token, undefined, { code }),

    createInvite: (token: string, room_id: number) =>
      req("invite", "POST", token, undefined, { room_id: String(room_id) }),

    inviteFriend: (token: string, room_id: number, friend_id: number) =>
      req("invite_friend", "POST", token, { room_id, friend_id }, {}),
  },

  online: {
    get: () => req("online", "GET", null),
  },

  settings: {
    get: (token: string) => req("settings", "GET", token),

    save: (token: string, data: { username?: string; favorite_game?: string }) =>
      req("settings", "POST", token, data, {}),
  },

  dm: {
    get: (token: string, withId: number) =>
      req("dm", "GET", token, undefined, { with: String(withId) }),

    send: (token: string, toId: number, content: string) =>
      req("dm", "POST", token, { to: toId, content }, {}),

    remove: (token: string, msg_id: number) =>
      req("delete_dm", "POST", token, { msg_id }, {}),
  },

  typing: {
    send: (token: string, channel?: string, dm_with?: number) =>
      req(
        "typing_start",
        "POST",
        token,
        {},
        {
          ...(channel ? { channel } : {}),
          ...(dm_with ? { dm_with: String(dm_with) } : {}),
        }
      ),

    get: (token: string, channel?: string, dm_with?: number) =>
      req(
        "typing_get",
        "GET",
        token,
        undefined,
        {
          ...(channel ? { channel } : {}),
          ...(dm_with ? { dm_with: String(dm_with) } : {}),
        }
      ),
  },

 admin: {
  stats: (token: string) =>
    req("admin_stats", "GET", token),

  logs: (token: string, limit = 50, level = "") => {
    const extra: Record<string, string> = {
      limit: String(limit),
    };

    if (level) extra.level = level;

    return req("admin_logs", "GET", token, undefined, extra);
  },

  users: (token: string, q = "", limit = 50, offset = 0) => {
    const extra: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
    };

    if (q) extra.q = q;

    return req("admin_users", "GET", token, undefined, extra);
  },

  ban: async (token: string, user_id: number, ban: boolean) => {
    return await req("admin_ban", "POST", token, {
      user_id,
      ban,
    });
  },

  messages: (
    token: string,
    channel?: string,
    room_id?: number,
    limit = 50
  ) => {
    const extra: Record<string, string> = {
      limit: String(limit),
    };

    if (channel) extra.channel = channel;
    if (room_id) extra.room_id = String(room_id);

    return req("admin_messages", "GET", token, undefined, extra);
  },

  clearChannel: (token: string, channel: string) =>
    req("admin_clear", "POST", token, { channel }),

  clearRoom: (token: string, room_id: number) =>
    req("admin_clear", "POST", token, { room_id }),

  deleteMsg: (token: string, msg_id: number) =>
    req("admin_clear", "POST", token, { msg_id }),

  setBadge: (token: string, user_id: number, badge: string) =>
    req("admin_set_badge", "POST", token, { user_id, badge }),
},

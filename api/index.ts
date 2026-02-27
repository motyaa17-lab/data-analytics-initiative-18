import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// ⚠️ У тебя в Supabase таблица messages сейчас с датой
// (по скрину: messages_2026-02-25). Поэтому ставим её сюда:
const TABLES = {
  rooms: "rooms",
  messages: "messages_2026-02-25",
  // если потом будешь делать онлайн через сессии — можно сюда добавить sessions_2026-02-25
};

function json(res: VercelResponse, status: number, payload: any) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return res.status(status).send(JSON.stringify(payload));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });

  // ВСЕГДА возвращаем эти поля, чтобы фронт не падал
  const safeBase = {
    rooms: [] as any[],
    messages: [] as any[],
    online: [] as any[],
  };

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;

  // Если env не настроены — НЕ 500 (иначе опять белый экран), а безопасный ответ
  if (!url || !key) {
    return json(res, 200, {
      ...safeBase,
      ok: false,
      error: "Missing env vars: SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)",
    });
  }

  const supabase = createClient(url, key);

  // action берём из query или body
  const action = String((req.query.action ?? (req.body as any)?.action ?? ""));

  try {
    // --- ROOMS ---
    if (action === "rooms") {
      if (req.method !== "GET") return json(res, 200, { ...safeBase, ok: false, error: "Method not allowed" });

      const { data, error } = await supabase
        .from(TABLES.rooms)
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        return json(res, 200, { ...safeBase, ok: false, error: error.message });
      }

      return json(res, 200, { ...safeBase, ok: true, rooms: data ?? [] });
    }

    // --- MESSAGES ---
    if (action === "messages") {
      if (req.method !== "GET") return json(res, 200, { ...safeBase, ok: false, error: "Method not allowed" });

      const channel = String(req.query.channel ?? "");
      const room_id = req.query.room_id ? Number(req.query.room_id) : undefined;

      // если channel не передали — тоже безопасно
      if (!channel) {
        return json(res, 200, { ...safeBase, ok: true, messages: [] });
      }

      let q = supabase
        .from(TABLES.messages)
        .select("*")
        .eq("channel", channel)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!Number.isNaN(room_id) && room_id !== undefined) {
        q = q.eq("room_id", room_id);
      }

      const { data, error } = await q;

      if (error) {
        return json(res, 200, { ...safeBase, ok: false, error: error.message });
      }

      return json(res, 200, { ...safeBase, ok: true, messages: data ?? [] });
    }

    // --- ONLINE ---
    if (action === "online") {
      // Пока просто отдаём пустой список, чтобы фронт не падал.
      // (Когда захочешь — подключим sessions_... и будем реально считать онлайн)
      return json(res, 200, { ...safeBase, ok: true, online: [] });
    }

    // --- UNKNOWN ACTION ---
    // Важно: НЕ отдаём 400, иначе фронт опять может упасть
    return json(res, 200, {
      ...safeBase,
      ok: false,
      error: Unknown action: ${action || "(empty)"},
    });
  } catch (e: any) {
    return json(res, 200, {
      ...safeBase,
      ok: false,
      error: e?.message || "Unknown server error",
    });
  }
}

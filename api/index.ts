import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// ВАЖНО:
// Чтобы реально тянуло данные — добавь переменные окружения в Vercel:
// SUPABASE_URL и SUPABASE_ANON_KEY (или SUPABASE_SERVICE_ROLE_KEY)
// Но даже без них этот код НЕ будет давать 500, и белый экран уйдёт.

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // всегда JSON
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const action = String(req.query.action ?? "");
  const supabase = getSupabase();

  try {
    // ---------- ROOMS ----------
    if (action === "rooms") {
      // Фолбек, чтобы фронт не падал
      if (!supabase) return res.status(200).json({ rooms: [] });

      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) return res.status(200).json({ rooms: [] }); // без 500
      return res.status(200).json({ rooms: data ?? [] });
    }

    // ---------- MESSAGES ----------
    if (action === "messages") {
      const channel = String(req.query.channel ?? "");
      const room_id_raw = req.query.room_id;
      const room_id =
        typeof room_id_raw === "string" && room_id_raw !== ""
          ? Number(room_id_raw)
          : null;

      if (!supabase) return res.status(200).json({ messages: [] });

      // Если у тебя сообщения только по channel — room_id можно игнорить.
      // Если по room_id — можно фильтровать по room_id.
      let q = supabase.from("messages").select("*").order("created_at", {
        ascending: true,
      });

      if (room_id && !Number.isNaN(room_id)) q = q.eq("room_id", room_id);
      else if (channel) q = q.eq("channel", channel);

      const { data, error } = await q;

      if (error) return res.status(200).json({ messages: [] }); // без 500
      return res.status(200).json({ messages: data ?? [] });
    }

    // ---------- ONLINE ----------
    if (action === "online") {
      // Если у тебя есть таблица online/sessions — подключишь позже.
      // Сейчас главное: не 500 и понятная форма ответа.
      if (!supabase) return res.status(200).json({ online: [] });

      // Попробуем "sessions" (если нет — просто вернём пусто)
      // Можешь заменить на свою таблицу, если она называется иначе.
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return res.status(200).json({ online: [] });
      return res.status(200).json({ online: data ?? [] });
    }

    // ---------- DEFAULT ----------
    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    // Тоже без 500-краша фронта: вернём безопасный JSON
    return res.status(200).json({
      rooms: action === "rooms" ? [] : undefined,
      messages: action === "messages" ? [] : undefined,
      online: action === "online" ? [] : undefined,
      error: e?.message || "Unknown server error",
    });
  }
}

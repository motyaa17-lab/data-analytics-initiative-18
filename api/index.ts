import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supabaseAnon() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"));
}

function supabaseService() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const action = String(req.query.action ?? "");

    // ===== ROOMS =====
    // GET /api?action=rooms
    if (action === "rooms") {
      const sb = supabaseAnon();
      const { data, error } = await sb.from("rooms").select("*").order("created_at", { ascending: true });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data ?? []);
    }

    // ===== MESSAGES =====
    // GET /api?action=messages&room_id=123
    if (action === "messages") {
      const roomId = Number(req.query.room_id);
      if (!roomId) return res.status(400).json({ error: "room_id is required" });

      const sb = supabaseAnon();
      const { data, error } = await sb
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data ?? []);
    }

    // ===== SEND MESSAGE (WRITE через service_role) =====
    // POST /api?action=sendMessage
    // body: { room_id: number, user_id: string|number, text: string }
    if (action === "sendMessage") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const body = req.body ?? {};
      const room_id = Number(body.room_id);
      const user_id = body.user_id;
      const text = String(body.text ?? "").trim();

      if (!room_id) return res.status(400).json({ error: "room_id is required" });
      if (!user_id) return res.status(400).json({ error: "user_id is required" });
      if (!text) return res.status(400).json({ error: "text is required" });

      const sb = supabaseService();

      // ВАЖНО: select().single() чтобы вернуть вставленную строку (иначе часто приходит пусто)
      const { data, error } = await sb
        .from("messages")
        .insert([{ room_id, user_id, text }])
        .select("*")
        .single();

      if (error) return res.status(400).json({ error: error.message });

      // ОБЯЗАТЕЛЬНО так:
      return res.status(200).json({ message: data });
    }

    // Если action не совпал
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}

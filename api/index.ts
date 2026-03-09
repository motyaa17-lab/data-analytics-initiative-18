import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getSupabaseKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

function supabaseAnon() {
  const url = process.env.SUPABASE_URL || "";
  const key = getSupabaseKey();

  if (!url) throw new Error("SUPABASE_URL is missing");
  if (!key) throw new Error("No Supabase key found in env");

  return createClient(url, key);
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
  const channel = String(req.query.channel ?? "").trim();
  const roomId = Number(req.query.room_id);

  const sb = supabaseAnon();

  let query = sb.from("messages").select("*").order("created_at", { ascending: true });

  if (roomId) {
    query = query.eq("room_id", roomId);
  } else if (channel) {
    query = query.eq("channel", channel);
  } else {
    return res.status(400).json({ error: "room_id or channel is required" });
  }

  const { data, error } = await query;

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
  const user_id = Number(body.user_id);
  const channel = String(body.channel ?? "").trim();
  const content = String(body.content ?? body.text ?? "").trim();
  const image_url = String(body.image_url ?? "").trim();

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  if (!content && !image_url) {
    return res.status(400).json({ error: "content or image_url is required" });
  }

  if (!room_id && !channel) {
    return res.status(400).json({ error: "room_id or channel is required" });
  }

  const sb = supabaseAnon();

  const payload: any = {
    user_id,
    content: content || null,
    image_url: image_url || null,
  };

  if (room_id) payload.room_id = room_id;
  if (channel) payload.channel = channel;

  const { data, error } = await sb
    .from("messages")
    .insert([payload])
    .select("*")
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: data });
}
if (action === "createRoom") {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const owner_id = Number(body.owner_id ?? body.user_id);
  const is_public = body.is_public !== false;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  if (!owner_id) {
    return res.status(400).json({ error: "owner_id is required" });
  }

  const sb = supabaseAnon();

  const { data, error } = await sb
    .from("rooms")
    .insert([
      {
        name,
        description: description || null,
        owner_id,
        is_public,
      },
    ])
    .select("*")
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ room: data });
}
 
    // Если action не совпал
    if (action === "settings") {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body ?? {};
  const user_id = Number(body.user_id);
  const username = String(body.username ?? "").trim();
  const favorite_game = String(body.favorite_game ?? "").trim();

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  if (!username) {
    return res.status(400).json({ error: "username is required" });
  }

  const sb = supabaseAnon();

  const { data, error } = await sb
    .from("users")
    .update({
      username,
      favorite_game: favorite_game || null,
    })
    .eq("id", user_id)
    .select("*")
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ user: data });
}
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}

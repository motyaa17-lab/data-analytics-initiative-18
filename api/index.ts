import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const action = String(req.query.action ?? "");
  const supabase = getSupabase();

  try {
    // ===== ROOMS =====
    if (action === "rooms") {
      if (!supabase) return res.status(200).json([]);

      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) return res.status(200).json([]);

      return res.status(200).json(data ?? []);
    }

    // ===== MESSAGES =====
    if (action === "messages") {
      if (!supabase) return res.status(200).json([]);

      const channel = String(req.query.channel ?? "");

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel", channel)
        .order("created_at", { ascending: true });

      if (error) return res.status(200).json([]);

      return res.status(200).json(data ?? []);
    }

    // ===== ONLINE =====
    if (action === "online") {
      return res.status(200).json([]);
    }

    return res.status(200).json([]);
  } catch {
    return res.status(200).json([]);
  }
}

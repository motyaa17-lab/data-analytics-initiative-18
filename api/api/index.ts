import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error:
        "Missing env vars: SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)",
    });
  }

  const supabase = createClient(url, key);

  const action = String(req.query.action || "");

  try {
    if (action === "rooms") {
      // ⚠️ поменяй "rooms" на точное имя таблицы, если у тебя другое
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ rooms: data ?? [] });
    }

    return res.status(400).json({ error: Unknown action: ${action} });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unknown server error" });
  }
}

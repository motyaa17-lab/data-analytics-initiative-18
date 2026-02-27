import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({
      rooms: [],
      error: "Missing SUPABASE env variables",
    });
  }

  const supabase = createClient(url, key);
  const action = String(req.query.action || "");

  try {
    // ================= ROOMS =================
    if (action === "rooms") {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        return res.status(200).json({
          rooms: [],
          error: error.message,
        });
      }

      return res.status(200).json({
        rooms: data || [],
      });
    }

    // ================= CREATE ROOM =================
    if (action === "rooms" && req.method === "POST") {
      const { name, description, is_public } = req.body;

      const { data, error } = await supabase
        .from("rooms")
        .insert([{ name, description, is_public }])
        .select()
        .single();

      if (error) {
        return res.status(200).json({
          room: null,
          error: error.message,
        });
      }

      return res.status(200).json({
        room: data,
      });
    }

    return res.status(400).json({
      rooms: [],
      error: "Unknown action",
    });

  } catch (e: any) {
    return res.status(200).json({
      rooms: [],
      error: e.message || "Server error",
    });
  }
}

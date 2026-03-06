import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl) {
      return res.status(500).json({ error: "SUPABASE_URL is missing" });
    }

    if (!supabaseKey) {
      return res.status(500).json({ error: "No Supabase key found in env" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email),
      password: String(password),
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

  return res.status(200).json({
  user: data.user,
  token: data.session?.access_token || "",
  session: data.session,
});
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

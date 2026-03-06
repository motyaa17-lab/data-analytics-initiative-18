import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

 const supabaseUrl = process.env.SUPABASE_URL as string;

const supabaseKey =
  (process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_KEY) as string;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email),
      password: String(password),
    });

    if (error || !data.user) {
      return res.status(400).json({ error: error?.message || "Login failed" });
    }

    const { data: appUser, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", String(email))
      .single();

    if (userError || !appUser) {
      return res.status(400).json({ error: userError?.message || "User not found in users table" });
    }

    return res.status(200).json({
      token: data.session?.access_token || "",
      user: appUser,
      session: data.session,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

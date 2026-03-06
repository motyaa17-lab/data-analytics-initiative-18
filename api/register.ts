import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  try {
    const { nickname, email, password, game } = req.body || {};

    if (!email || !password || !nickname) {
      return res.status(400).json({ error: "Nickname, email and password required" });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.auth.signUp({
      email: String(email),
      password: String(password),
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", String(email))
      .maybeSingle();

    let appUser = existingUser;

    if (!appUser) {
      const { data: insertedUser, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            username: String(nickname),
            email: String(email),
            password_hash: "supabase-auth",
            favorite_game: game ? String(game) : null,
            is_admin: false,
            is_banned: false,
          },
        ])
        .select("*")
        .single();

      if (insertError) {
        return res.status(400).json({ error: insertError.message });
      }

      appUser = insertedUser;
    }

    return res.status(200).json({
      user: appUser,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

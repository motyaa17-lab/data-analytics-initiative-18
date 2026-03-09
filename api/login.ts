import { createClient } from "@supabase/supabase-js";

function errText(err: any, fallback: string) {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err?.message === "string") return err.message;
  if (typeof err?.error_description === "string") return err.error_description;
  if (typeof err?.error === "string") return err.error;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const supabaseUrl = process.env.SUPABASE_URL as string;
    const supabaseKey = (
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_KEY
    ) as string;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email),
      password: String(password),
    });

    if (error || !data.user) {
      return res.status(400).json({
        error: errText(error, "Login failed"),
      });
    }

    const { data: foundUsers, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", String(email))
      .limit(1);

    if (userError) {
      return res.status(400).json({
        error: errText(userError, "User lookup failed"),
      });
    }

    let appUser = foundUsers?.[0];

    if (!appUser) {
      const username = String(email).split("@")[0];

      const { data: insertedUsers, error: insertError } = await supabase
        .from("users")
        .insert([
          {
            username,
            email: String(email),
            password_hash: "supabase-auth",
            favorite_game: null,
            is_admin: false,
            is_banned: false,
          },
        ])
        .select("*")
        .limit(1);

      if (insertError) {
        return res.status(400).json({
          error: errText(insertError, "User insert failed"),
        });
      }

      appUser = insertedUsers?.[0];
    }

    if (!appUser) {
      return res.status(400).json({ error: "User not found in users table" });
    }

    return res.status(200).json({
      token: data.session?.access_token || "",
      user: appUser,
      session: data.session,
    });
  } catch (e: any) {
    return res.status(500).json({
      error: errText(e, "Server error"),
    });
  }
}

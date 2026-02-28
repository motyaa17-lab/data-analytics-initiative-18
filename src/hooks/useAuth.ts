import { useEffect, useState } from "react";

export type User = {
  id?: number;
  username?: string;
  favorite_game?: string;
  is_admin?: boolean;
};

export const TOKEN_KEY = "frikords_token";
export const USER_KEY = "frikords_user";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;

    const u = JSON.parse(raw);
    if (!u || typeof u !== "object") return null;

    // минимальная проверка
    const username = typeof u.username === "string" ? u.username : "";
    return { ...u, username };
  } catch {
    return null;
  }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [user, setUser] = useState<User | null>(() => loadUser());

  const login = (newToken: string, newUser: User) => {
    try {
      localStorage.setItem(TOKEN_KEY, newToken ?? "");
      localStorage.setItem(USER_KEY, JSON.stringify(newUser ?? {}));
    } catch {}

    setToken(newToken ?? "");
    setUser(newUser ?? null);
  };

  const logout = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    setToken(null);
    setUser(null);
  };

  // если localStorage меняется (иногда удобно при ручных тестах)
  useEffect(() => {
    setToken(loadToken());
    setUser(loadUser());
  }, []);

  return { token, user, login, logout, setUser, setToken };
}

// src/lib/auth.ts
export const TOKEN_KEY = "frikords_token";
export const USER_KEY = "frikords_user";

// читаем токен (поддержка старого "token" на всякий)
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  // можно оставить для совместимости (не обязательно, но удобно)
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
}

export function getUserRaw(): string | null {
  return localStorage.getItem(USER_KEY) || localStorage.getItem("user");
}

export function getUser<T = any>(): T | null {
  const raw = getUserRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setUser(user: any) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // совместимость со старым ключом
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("user");
}

export function clearAuth() {
  clearToken();
  clearUser();
}

import { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@/hooks/useAuth";

const LOGIN_URL = "/api/login";

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (token: string, user: User) => void;
  onRegisterClick: () => void;
}

type LoginResponse = {
  token?: string;
  user?: User;
  error?: string;
};

export default function LoginModal({
  onClose,
  onSuccess,
  onRegisterClick,
}: LoginModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
        }),
      });

      // читаем тело как текст, чтобы уметь показать нормальную ошибку (даже если пришёл HTML/404)
      const raw = await res.text();

      // пробуем распарсить JSON
      let data: LoginResponse | null = null;
      try {
        data = JSON.parse(raw) as LoginResponse;
      } catch {
        // если это не JSON — значит сервер вернул HTML/текст (часто 404/500)
        throw new Error("Сервер вернул не JSON. Проверь /api/login (возможно 404 или HTML).");
      }

      // если сервер вернул ошибку или статус не ок
      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Ошибка входа. Попробуй ещё раз.");
      }

      if (!data?.user) {
        throw new Error("User не пришёл из API.");
      }

      // token может отсутствовать — тогда передаём пустую строку
      onSuccess(data.token ?? "", data.user);
      onClose();
    } catch (err) {
      console.error("LOGIN ERROR:", err);

      const msg =
        err instanceof Error
          ? err.message
          : "Ошибка подключения к серверу.";

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#36393f] rounded-xl w-full max-w-md shadow-2xl border border-[#202225]">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Войти</h2>
              <p className="text-[#b9bbbe] text-sm mt-1">Рады тебя видеть снова!</p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-2"
              onClick={onClose}
              type="button"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                placeholder="gamer@mail.ru"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Твой пароль"
                  required


value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 pr-10 text-sm outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#72767d] hover:text-[#b9bbbe]"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded px-3 py-2">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white"
            >
              {loading ? "Входим..." : "Войти"}
            </Button>

            <p className="text-[#72767d] text-xs text-center">
              Нет аккаунта?{" "}
              <span
                className="text-[#5865f2] hover:underline cursor-pointer"
                onClick={() => {
                  onClose();
                  onRegisterClick();
                }}
              >
                Зарегистрироваться
              </span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const REGISTER_URL = "/api/register";

interface RegisterModalProps {
  onClose: () => void;
}

const RegisterModal = ({ onClose }: RegisterModalProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", game: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.name,
        email: form.email,
        password: form.password,
        favorite_game: form.game,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok || !data.success) {
      setError(data.error || "Ошибка регистрации. Попробуй ещё раз.");
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#36393f] rounded-xl w-full max-w-md shadow-2xl border border-[#202225]">
        <div className="p-6 sm:p-8">
          {!submitted ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Создать аккаунт</h2>
                  <p className="text-[#b9bbbe] text-sm mt-1">Присоединяйся к Frikords</p>
                </div>
                <Button variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-2" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">Никнейм</label>
                  <input
                    type="text"
                    placeholder="ProGamer2000"
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="gamer@mail.ru"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">Пароль</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Минимум 8 символов"
                      required
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none transition-colors pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#72767d] hover:text-[#b9bbbe]">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1.5">Любимая игра</label>
                  <input
                    type="text"
                    placeholder="Например: Minecraft, CS2, Warzone..."
                    value={form.game}
                    onChange={e => setForm({ ...form, game: e.target.value })}
                    className="w-full bg-[#202225] border border-[#202225] focus:border-[#5865f2] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none transition-colors"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded px-3 py-2">
                    {error}
                  </div>
                )}

                <Button type="submit" disabled={loading} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white py-2.5 rounded font-medium mt-2 disabled:opacity-60">
                  {loading ? "Регистрируем..." : "Зарегистрироваться"}
                </Button>
                <p className="text-[#72767d] text-xs text-center">
                  Уже есть аккаунт?{" "}
                  <span className="text-[#5865f2] hover:underline cursor-pointer">Войти</span>
                </p>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[#3ba55c] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎮</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Добро пожаловать, {form.name}!</h2>
              <p className="text-[#b9bbbe] text-sm mb-6">Ты в Frikords — найди своих и играй вместе</p>
              <Button className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-8" onClick={onClose}>
                Начать
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterModal;

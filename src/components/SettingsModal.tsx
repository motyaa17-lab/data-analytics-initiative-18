import { useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { User } from "@/hooks/useAuth";
import { api } from "@/lib/api";

interface Props {
  user: User;
  token: string;
  onClose: () => void;
  onUpdate: (u: Partial<User>) => void;
}

export default function SettingsModal({ user, token, onClose, onUpdate }: Props) {
  const [username, setUsername] = useState(user.username);
  const [game, setGame] = useState(user.favorite_game || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>(user.avatar_url || "");
  const [avatarError, setAvatarError] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Файл больше 2MB");
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    setStatus(null);
    setAvatarError(false);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
      const data = await api.profile.uploadAvatar(token, dataUrl);
      setUploadingAvatar(false);
      if (data.ok) {
        const newUrl = data.avatar_url as string;
        setAvatarPreview(newUrl);
        onUpdate({ avatar_url: newUrl });
        setStatus("Аватарка обновлена!");
      } else {
        setError((data.error as string) || "Ошибка загрузки");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    const data = await api.settings.save(token, { username: username.trim(), favorite_game: game.trim() });
    setSaving(false);
    if (data.ok) {
      setStatus("Сохранено!");
      onUpdate({ username: data.username as string, favorite_game: data.favorite_game as string });
    } else {
      setError((data.error as string) || "Ошибка сохранения");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#36393f] rounded-xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="Settings" size={18} className="text-[#b9bbbe]" />
            <h2 className="text-white font-semibold text-base">Настройки профиля</h2>
          </div>
          <button onClick={onClose} className="text-[#b9bbbe] hover:text-white transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {avatarPreview && !avatarError ? (
              <img
                src={avatarPreview}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                style={{ background: avatarBg(username || user.username) }}
              >
                {(username || user.username)[0]?.toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar
                ? <Icon name="Loader2" size={20} className="text-white animate-spin" />
                : <Icon name="Camera" size={20} className="text-white" />
              }
            </div>
          </div>
          <div>
            <div className="text-white text-sm font-medium">{username || user.username}</div>
            <div className="text-[#b9bbbe] text-xs mb-1">{game || "Игра не указана"}</div>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-[#5865f2] text-xs hover:underline"
              disabled={uploadingAvatar}
            >
              Сменить аватарку
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Никнейм</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={32}
              className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
              placeholder="Твой никнейм"
            />
          </div>
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Любимая игра</label>
            <input
              value={game}
              onChange={e => setGame(e.target.value)}
              maxLength={64}
              className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
              placeholder="Например: Dota 2, CS2, Minecraft..."
            />
          </div>
        </div>

        {status && <p className="text-[#3ba55c] text-sm text-center">{status}</p>}
        {error && <p className="text-[#ed4245] text-sm text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !username.trim()}
          className="w-full bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white font-medium py-2 rounded-lg text-sm transition-colors"
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function avatarBg(name: string) {
  const colors = ["#5865f2","#eb459e","#ed4245","#fee75c","#57f287","#1abc9c","#3498db","#e91e63"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}
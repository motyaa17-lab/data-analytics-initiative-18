import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { api } from "@/lib/api";

interface ProfileData {
  id: number;
  username: string;
  favorite_game: string;
  avatar_url: string;
  created_at: string;
  message_count: number;
  badge?: string;
}

interface Props {
  username: string;
  onClose: () => void;
  onSendFriend?: (username: string) => void;
  onOpenDM?: (userId: number) => void;
  token?: string | null;
  currentUserId?: number;
}

interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  threshold: number;
  unlocked: boolean;
  color: string;
  glow: string;
}

function avatarBg(name: string) {
  const gradients = [
    "linear-gradient(135deg, #7c3aed, #3b82f6)",
    "linear-gradient(135deg, #6d28d9, #2563eb)",
    "linear-gradient(135deg, #8b5cf6, #60a5fa)",
    "linear-gradient(135deg, #9333ea, #3b82f6)",
    "linear-gradient(135deg, #7e22ce, #1d4ed8)",
    "linear-gradient(135deg, #a855f7, #38bdf8)",
    "linear-gradient(135deg, #6366f1, #06b6d4)",
    "linear-gradient(135deg, #8b5cf6, #2dd4bf)",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return gradients[Math.abs(h) % gradients.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Yekaterinburg"
  });
}

function getAchievements(messageCount: number): Achievement[] {
  return [
    {
      id: "newbie",
      icon: "🌱",
      title: "Новичок",
      desc: "10 сообщений",
      threshold: 10,
      unlocked: messageCount >= 10,
      color: "#57f287",
      glow: "shadow-[0_0_12px_#57f28755]",
    },
    {
      id: "got_it",
      icon: "💡",
      title: "Разобрался",
      desc: "100 сообщений",
      threshold: 100,
      unlocked: messageCount >= 100,
      color: "#fee75c",
      glow: "shadow-[0_0_12px_#fee75c55]",
    },
    {
      id: "pro",
      icon: "🔥",
      title: "Прошаренный",
      desc: "500 сообщений",
      threshold: 500,
      unlocked: messageCount >= 500,
      color: "#ed4245",
      glow: "shadow-[0_0_12px_#ed424555]",
    },
    {
      id: "legend",
      icon: "👑",
      title: "Легенда чатов",
      desc: "2000 сообщений",
      threshold: 2000,
      unlocked: messageCount >= 2000,
      color: "#faa61a",
      glow: "shadow-[0_0_16px_#faa61a88]",
    },
  ];
}

export default function ProfileModal({ username, onClose, onSendFriend, onOpenDM, token, currentUserId }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
    api.profile.get(username).then(data => {
      setLoading(false);
      if (data.error) setError(data.error as string);
      else setProfile(data as unknown as ProfileData);
    });
  }, [username]);

  const isOwnProfile = profile && currentUserId === profile.id;
  const showAvatar = profile?.avatar_url && !avatarError;
  const achievements = profile ? getAchievements(profile.message_count) : [];
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#36393f] rounded-xl w-full max-w-xs shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header banner */}
        <div className="h-20 bg-gradient-to-r from-[#5865f2] to-[#7c3aed] relative flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-white/70 hover:text-white transition-colors z-10"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Avatar — выступает над баннером */}
          <div className="relative -mt-10 mb-3 w-fit">
            {showAvatar ? (
              <img
                src={profile!.avatar_url}
                alt={profile!.username}
                className="w-20 h-20 rounded-full border-4 border-[#36393f] object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full border-4 border-[#36393f] flex items-center justify-center text-white font-bold text-2xl"
                style={{ background: avatarBg(username) }}
              >
                {username[0]?.toUpperCase()}
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-[#b9bbbe] text-sm py-4">
              <Icon name="Loader2" size={16} className="animate-spin" />
              Загружаем профиль...
            </div>
          )}

          {error && <p className="text-[#ed4245] text-sm py-2">{error}</p>}

          {profile && (
            <>
              <div className="mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white font-bold text-xl leading-tight">{profile.username}</h2>
                  {profile.badge && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#5865f2]/20 text-[#5865f2] border border-[#5865f2]/40 leading-none">
                      {profile.badge}
                    </span>
                  )}
                </div>
                {profile.favorite_game && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Icon name="Gamepad2" size={13} className="text-[#5865f2]" />
                    <span className="text-[#b9bbbe] text-sm">{profile.favorite_game}</span>
                  </div>
                )}
              </div>

              <div className="bg-[#2f3136] rounded-lg p-3 flex flex-col gap-2 mb-4">
                <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                  <Icon name="Calendar" size={13} />
                  <span>На сайте с {formatDate(profile.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                  <Icon name="MessageSquare" size={13} />
                  <span>{profile.message_count} сообщений</span>
                </div>
              </div>

              {/* Achievements */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide">Достижения</span>
                  <span className="text-[#72767d] text-xs">{unlockedCount}/{achievements.length}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {achievements.map(a => (
                    <div key={a.id} className="flex flex-col items-center gap-1" title={`${a.title} — ${a.desc}`}>
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                          a.unlocked
                            ? `bg-[#2f3136] ${a.glow} border border-white/10`
                            : "bg-[#2f3136] opacity-25 grayscale"
                        }`}
                      >
                        {a.icon}
                      </div>
                      <span
                        className="text-[9px] font-medium text-center leading-tight"
                        style={{ color: a.unlocked ? a.color : "#72767d" }}
                      >
                        {a.title}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Progress bar to next achievement */}
                {(() => {
                  const next = achievements.find(a => !a.unlocked);
                  if (!next) return (
                    <div className="mt-2 text-center text-[10px] text-[#faa61a]">🏆 Все достижения разблокированы!</div>
                  );
                  const prev = achievements.slice(0, achievements.indexOf(next));
                  const prevThreshold = prev.length > 0 ? prev[prev.length - 1].threshold : 0;
                  const progress = Math.min(((profile.message_count - prevThreshold) / (next.threshold - prevThreshold)) * 100, 100);
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#72767d] text-[10px]">до «{next.title}»</span>
                        <span className="text-[#72767d] text-[10px]">{profile.message_count} / {next.threshold}</span>
                      </div>
                      <div className="h-1.5 bg-[#2f3136] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, background: next.color }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {!isOwnProfile && token && (
                <div className="flex gap-2">
                  {onSendFriend && (
                    <button
                      onClick={() => { onSendFriend(profile.username); onClose(); }}
                      className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Icon name="UserPlus" size={14} />
                      Добавить
                    </button>
                  )}
                  {onOpenDM && (
                    <button
                      onClick={() => { onOpenDM(profile.id); onClose(); }}
                      className="flex-1 bg-[#40444b] hover:bg-[#4f545c] text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Icon name="MessageCircle" size={14} />
                      Написать
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
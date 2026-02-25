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
}

interface Props {
  username: string;
  onClose: () => void;
  onSendFriend?: (username: string) => void;
  onOpenDM?: (userId: number) => void;
  token?: string | null;
  currentUserId?: number;
}

function avatarBg(name: string) {
  const colors = ["#5865f2","#eb459e","#ed4245","#fee75c","#57f287","#1abc9c","#3498db","#e91e63"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Yekaterinburg"
  });
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#36393f] rounded-xl w-full max-w-xs shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header banner */}
        <div className="h-20 bg-gradient-to-r from-[#5865f2] to-[#7c3aed] relative rounded-t-xl overflow-hidden flex-shrink-0">
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
              <div className="mb-4">
                <h2 className="text-white font-bold text-xl leading-tight">{profile.username}</h2>
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

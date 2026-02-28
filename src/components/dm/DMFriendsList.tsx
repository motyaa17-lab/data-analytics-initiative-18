import Icon from "@/components/ui/icon";
import { Friend, FriendRequest, Tab, avatarColor } from "@/components/dm/dmTypes";

interface Props {
  tab: Tab;
  friends: Friend[];
  requests: FriendRequest[];
  unreadPerFriend: Record<number, number>;
  addUsername: string;
  addStatus: string | null;
  loading: boolean;
  onClose: () => void;
  onSetTab: (t: Tab) => void;
  onOpenFriend: (f: Friend) => void;
  onRespond: (req: FriendRequest, accept: boolean) => void;
  onAddUsernameChange: (v: string) => void;
  onAdd: () => void;
}

export default function DMFriendsList({
  tab, friends, requests, unreadPerFriend, addUsername, addStatus, loading,
  onClose, onSetTab, onOpenFriend, onRespond, onAddUsernameChange, onAdd,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-start bg-black/60" onClick={onClose}>
      <div
        className="relative flex flex-col chat-bg w-full max-w-sm h-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/30 backdrop-blur-sm border-b border-white/10">
          <span className="font-semibold text-white text-sm">Личные сообщения</span>
          <button className="text-[#b9bbbe] hover:text-white transition-colors" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/20">
          {(["friends", "requests", "add"] as Tab[]).map(t => (
            <button
              key={t}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                tab === t ? "text-white" : "text-[#72767d] hover:text-[#b9bbbe]"
              }`}
              onClick={() => onSetTab(t)}
            >
              {t === "friends" && "Друзья"}
              {t === "requests" && (
                <span className="flex items-center justify-center gap-1">
                  Запросы
                  {requests.length > 0 && (
                    <span className="bg-[#ed4245] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {requests.length}
                    </span>
                  )}
                </span>
              )}
              {t === "add" && "Добавить"}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5865f2]" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "friends" && (
            <div className="p-2">
              {friends.length === 0 && (
                <div className="text-center text-[#72767d] text-sm mt-8 px-4">
                  У тебя пока нет друзей.<br />Добавь кого-нибудь!
                </div>
              )}
              {friends.map(f => {
                const unread = unreadPerFriend[f.id] || 0;
                return (
                  <button
                    key={f.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[#40444b] transition-colors text-left"
                    onClick={() => onOpenFriend(f)}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ background: avatarColor(f.username) }}
                      >
                        {f.username?.[0]?.toUpperCase() || "?"}
                      </div>
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-[#ed4245] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${unread > 0 ? "text-white" : "text-[#dcddde]"}`}>{f.username}</div>
                      {f.favorite_game && (
                        <div className="text-[#b9bbbe] text-xs truncate">{f.favorite_game}</div>
                      )}
                    </div>
                    {unread > 0
                      ? <span className="ml-auto min-w-[20px] h-5 bg-[#ed4245] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">{unread}</span>
                      : <Icon name="MessageCircle" size={16} className="ml-auto text-[#72767d] flex-shrink-0" />
                    }
                  </button>
                );
              })}
            </div>
          )}

          {tab === "requests" && (
            <div className="p-2">
              {requests.length === 0 && (
                <div className="text-center text-[#72767d] text-sm mt-8 px-4">
                  Нет новых заявок в друзья
                </div>
              )}
              {requests.map(r => (
                <div key={r.request_id} className="flex items-center gap-3 px-3 py-2.5 rounded-md">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: avatarColor(r.username) }}
                  >
                    {f.username?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm font-medium truncate">{r.username}</div>
                    {r.favorite_game && (
                      <div className="text-[#b9bbbe] text-xs truncate">{r.favorite_game}</div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      className="w-7 h-7 rounded-full bg-[#3ba55c] hover:bg-[#2d9150] flex items-center justify-center transition-colors"
                      onClick={() => onRespond(r, true)}
                    >
                      <Icon name="Check" size={14} className="text-white" />
                    </button>
                    <button
                      className="w-7 h-7 rounded-full bg-[#ed4245] hover:bg-[#c53a3c] flex items-center justify-center transition-colors"
                      onClick={() => onRespond(r, false)}
                    >
                      <Icon name="X" size={14} className="text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "add" && (
            <div className="p-4">
              <p className="text-[#b9bbbe] text-xs mb-3">
                Введи никнейм пользователя, чтобы отправить заявку в друзья
              </p>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-[#40444b] text-white placeholder-[#72767d] text-sm px-3 py-2 rounded-md outline-none focus:ring-1 focus:ring-[#5865f2]"
                  placeholder="Никнейм"
                  value={addUsername}
                  onChange={e => onAddUsernameChange(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && onAdd()}
                />
                <button
                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                  onClick={onAdd}
                  disabled={loading || !addUsername.trim()}
                >
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : "Найти"}
                </button>
              </div>
              {addStatus && (
                <p className={`text-xs mt-2 ${addStatus.startsWith("✓") ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>
                  {addStatus}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

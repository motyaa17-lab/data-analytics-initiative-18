import { useState, useEffect } from "react";
import { ArrowRight, Hash, LogOut, Plus, X, Copy, Check, Link, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { User } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const CHANNELS = [
  { id: "general", label: "общий" },
  { id: "meet", label: "знакомства" },
  { id: "memes", label: "мемы" },
  { id: "teammates", label: "поиск-тиммейтов" },
];

function getAvatarColor(username?: string) {
  const colors = [
    "from-purple-500 to-pink-500",
    "from-green-500 to-blue-500",
    "from-orange-500 to-red-500",
    "from-[#5865f2] to-[#7c3aed]",
  ];

  const name = username ?? ""; // <- главное
  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

interface Room { id: number; name: string; description: string; members: number; invite_code?: string; }
interface Friend { id: number; username: string; favorite_game: string; }

interface ChannelsSidebarProps {
  mobileSidebarOpen: boolean;
  onClose: () => void;
  activeChannel: string;
  activeRoomId?: number;
  onChannelChange: (channel: string) => void;
  onRoomChange: (roomId: number, roomName: string) => void;
  user: User | null;
  token: string | null;
  onLogout: () => void;
  onAdminClick?: () => void;
  onDMClick?: () => void;
  onSettingsClick?: () => void;
  onProfileClick?: (username: string) => void;
}

const ChannelsSidebar = ({ mobileSidebarOpen, onClose, activeChannel, activeRoomId, onChannelChange, onRoomChange, user, token, onLogout, onAdminClick, onDMClick, onSettingsClick, onProfileClick }: ChannelsSidebarProps) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteFriendRoomId, setInviteFriendRoomId] = useState<number | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitingId, setInvitingId] = useState<number | null>(null);
  const [inviteStatus, setInviteStatus] = useState<Record<number, string>>({});

  const loadRooms = async () => {
    const data = await api.rooms.list(token);
    if (data.rooms) setRooms(data.rooms as Room[]);
  };

  const loadFriends = async () => {
    if (!token) return;
   const BASE = "/api";
    const res = await fetch(`${BASE}/action-friends&sub=list`, {
      headers: { "X-Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.friends) setFriends(data.friends as Friend[]);
  };

  useEffect(() => { loadRooms(); }, [token]);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newRoomName.trim()) return;
    setCreating(true);
    setError("");
    const data = await api.rooms.create(token, newRoomName.trim(), newRoomDesc.trim(), true);
    setCreating(false);
    if (data.room) {
      const room = data.room as Room;
      setRooms(prev => [room, ...prev]);
      setShowCreate(false);
      setNewRoomName("");
      setNewRoomDesc("");
      onRoomChange(room.id, room.name);
      onClose();
    } else {
      setError((data.error as string) || "Ошибка создания");
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteCode.trim()) return;
    setJoining(true);
    setError("");
    const data = await api.rooms.join(token, inviteCode.trim());
    setJoining(false);
    if (data.ok) {
      setShowJoin(false);
      setInviteCode("");
      loadRooms();
      onRoomChange(data.room_id as number, data.room_name as string);
      onClose();
    } else {
      setError((data.error as string) || "Ошибка вступления");
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getNewInvite = async (roomId: number) => {
    if (!token) return;
    const data = await api.rooms.createInvite(token, roomId);
    if (data.invite_code) {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, invite_code: data.invite_code as string } : r));
    }
  };

  const openInviteFriend = (roomId: number) => {
    setInviteFriendRoomId(roomId);
    setInviteStatus({});
    loadFriends();
  };

  const inviteFriend = async (friendId: number, roomId: number) => {
    if (!token) return;
    setInvitingId(friendId);
    const data = await api.rooms.inviteFriend(token, roomId, friendId);
    setInvitingId(null);
    if (data.ok) {
      setInviteStatus(s => ({ ...s, [friendId]: data.already_member ? "уже в комнате" : "приглашён!" }));
    } else {
      setInviteStatus(s => ({ ...s, [friendId]: (data.error as string) || "ошибка" }));
    }
  };

  return (
    <>
      {/* Мобильный overlay-фон */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      )}
      <div className={`${mobileSidebarOpen ? "flex fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs" : "hidden"} lg:flex lg:relative lg:w-60 bg-[#2f3136] flex-col`}>
        <div className="p-4 border-b border-[#202225] flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-semibold">Frikords</h2>
          <div className="flex items-center gap-1">
            {user && onDMClick && (
              <Button variant="ghost" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] w-10 h-10 p-0" onClick={onDMClick} title="Личные сообщения">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </Button>
            )}
            <Button variant="ghost" className="lg:hidden text-[#b9bbbe] hover:text-white hover:bg-[#40444b] w-10 h-10 p-0" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Каналы */}
          <div className="mb-3">
            <div className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
              <ArrowRight className="w-3 h-3" />
              <span>Каналы</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {CHANNELS.map((ch) => (
                <div
                  key={ch.id}
                  onClick={() => { onChannelChange(ch.id); onClose(); }}
                  className={`flex items-center gap-2 px-2 py-2.5 lg:py-1.5 rounded cursor-pointer transition-colors min-h-[44px] lg:min-h-0 ${
                    !activeRoomId && activeChannel === ch.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-white hover:bg-[#393c43]"
                  }`}
                >
                  <Hash className="w-5 h-5 lg:w-4 lg:h-4 flex-shrink-0" />
                  <span className="text-base lg:text-sm">{ch.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Комнаты */}
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex items-center gap-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                <ArrowRight className="w-3 h-3" />
                <span>Мои комнаты</span>
              </div>
              {user && (
                <div className="flex gap-0.5">
                  <button onClick={() => { setShowJoin(true); setShowCreate(false); setError(""); }} className="text-[#8e9297] hover:text-white w-8 h-8 flex items-center justify-center rounded hover:bg-[#40444b]" title="Вступить по инвайту">
                    <Link className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setShowCreate(true); setShowJoin(false); setError(""); }} className="text-[#8e9297] hover:text-white w-8 h-8 flex items-center justify-center rounded hover:bg-[#40444b]" title="Создать комнату">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Форма создания */}
            {showCreate && (
              <form onSubmit={createRoom} className="mx-2 mt-1 mb-2 p-2 bg-[#36393f] rounded border border-[#202225]">
                <input
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="Название комнаты"
                  className="w-full bg-[#202225] text-white placeholder-[#72767d] rounded px-2 py-1.5 text-xs outline-none mb-1.5"
                  required
                />
                <input
                  value={newRoomDesc}
                  onChange={e => setNewRoomDesc(e.target.value)}
                  placeholder="Описание (необязательно)"
                  className="w-full bg-[#202225] text-white placeholder-[#72767d] rounded px-2 py-1.5 text-xs outline-none mb-1.5"
                />
                {error && <div className="text-red-400 text-xs mb-1.5">{error}</div>}
                <div className="flex gap-1">
                  <Button type="submit" disabled={creating} size="sm" className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs py-1 h-auto">
                    {creating ? "..." : "Создать"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="text-[#8e9297] hover:text-white text-xs py-1 h-auto" onClick={() => setShowCreate(false)}>
                    Отмена
                  </Button>
                </div>
              </form>
            )}

            {/* Форма вступления */}
            {showJoin && (
              <form onSubmit={joinRoom} className="mx-2 mt-1 mb-2 p-2 bg-[#36393f] rounded border border-[#202225]">
                <input
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="Код инвайта"
                  className="w-full bg-[#202225] text-white placeholder-[#72767d] rounded px-2 py-1.5 text-xs outline-none mb-1.5"
                  required
                />
                {error && <div className="text-red-400 text-xs mb-1.5">{error}</div>}
                <div className="flex gap-1">
                  <Button type="submit" disabled={joining} size="sm" className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs py-1 h-auto">
                    {joining ? "..." : "Вступить"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="text-[#8e9297] hover:text-white text-xs py-1 h-auto" onClick={() => setShowJoin(false)}>
                    Отмена
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-1 space-y-0.5">
              {rooms.map((room) => (
                <div key={room.id}>
                  <div
                    onClick={() => { onRoomChange(room.id, room.name); onClose(); }}
                    className={`flex items-center justify-between px-2 py-2.5 lg:py-1.5 rounded cursor-pointer transition-colors group min-h-[44px] lg:min-h-0 ${
                      activeRoomId === room.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-white hover:bg-[#393c43]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Hash className="w-5 h-5 lg:w-4 lg:h-4 flex-shrink-0" />
                      <span className="text-base lg:text-sm truncate">{room.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#72767d]">{room.members}</span>
                      {user && (
                        <button
                          onClick={e => { e.stopPropagation(); openInviteFriend(room.id); }}
                          className="opacity-0 group-hover:opacity-100 text-[#72767d] hover:text-[#5865f2] transition-all p-0.5"
                          title="Пригласить друга"
                        >
                          <UserPlus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {activeRoomId === room.id && user && (
                    <div className="px-2 pb-1 space-y-1">
                      <button
                        onClick={() => openInviteFriend(room.id)}
                        className="text-[#5865f2] text-xs hover:underline flex items-center gap-1"
                      >
                        <UserPlus className="w-3 h-3" /> Пригласить друга
                      </button>
                      {room.invite_code ? (
                        <div className="flex items-center gap-1 bg-[#202225] rounded px-2 py-1 text-xs">
                          <span className="text-[#72767d] truncate flex-1">{room.invite_code}</span>
                          <button onClick={() => copyCode(room.invite_code!)} className="text-[#8e9297] hover:text-white flex-shrink-0">
                            {copiedCode === room.invite_code ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => getNewInvite(room.id)} className="text-[#5865f2] text-xs hover:underline flex items-center gap-1">
                          <Link className="w-3 h-3" /> Создать инвайт
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {rooms.length === 0 && !showCreate && (
                <div className="text-[#72767d] text-xs px-2 py-2">
                  {user ? "Ты не в комнатах. Создай или вступи!" : "Войди, чтобы видеть комнаты"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Профиль */}
        <div className="p-2 bg-[#292b2f] flex items-center gap-2 flex-shrink-0">
          {user ? (
            <>
              <button
                className="flex items-center gap-2 flex-1 min-w-0 hover:bg-[#40444b] rounded-lg p-1 -m-1 transition-colors text-left"
              onClick={() => onProfileClick?.(user?.username ?? "")}
                title="Мой профиль"
              >
                <div className={`... ${getAvatarColor(user?.username ?? "")} ...`}>
               {(user?.username?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-base lg:text-sm font-medium truncate">{user.username}</div>
                  {user.favorite_game && <div className="text-[#72767d] text-sm lg:text-xs truncate">{user.favorite_game}</div>}
                </div>
              </button>
              <div className="flex gap-0.5 flex-shrink-0">
                {user.is_admin && (
                  <Button variant="ghost" size="sm" className="w-9 h-9 p-0 hover:bg-[#40444b] text-[#faa61a]" onClick={onAdminClick} title="Админ-панель">
                    <span className="text-xs font-bold">A</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="w-9 h-9 p-0 hover:bg-[#40444b]" onClick={onSettingsClick} title="Настройки">
                  <Icon name="Settings" size={16} className="text-[#b9bbbe]" />
                </Button>
                <Button variant="ghost" size="sm" className="w-9 h-9 p-0 hover:bg-[#40444b]" onClick={onLogout} title="Выйти">
                  <LogOut className="w-4 h-4 text-[#b9bbbe]" />
                </Button>
              </div>
            </>
          ) : (
            <div className="text-[#72767d] text-xs px-1">Не авторизован</div>
          )}
        </div>
      </div>

      {/* Модал «Пригласить друга» */}
      {inviteFriendRoomId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setInviteFriendRoomId(null)}>
          <div
            className="bg-[#36393f] rounded-xl w-full max-w-xs shadow-2xl p-5 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#b9bbbe]" />
                <h3 className="text-white font-semibold text-sm">Пригласить друга</h3>
              </div>
              <button onClick={() => setInviteFriendRoomId(null)} className="text-[#b9bbbe] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {friends.length === 0 ? (
              <p className="text-[#72767d] text-sm text-center py-3">Друзей пока нет</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friends.map(f => (
                  <div key={f.id} className="flex items-center gap-2 bg-[#2f3136] rounded-lg px-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {f.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm truncate">{f.username}</div>
                      {f.favorite_game && <div className="text-[#72767d] text-xs truncate">{f.favorite_game}</div>}
                    </div>
                    {inviteStatus[f.id] ? (
                      <span className="text-xs text-[#3ba55c]">{inviteStatus[f.id]}</span>
                    ) : (
                      <button
                        onClick={() => inviteFriend(f.id, inviteFriendRoomId)}
                        disabled={invitingId === f.id}
                        className="text-xs bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white px-2 py-1 rounded transition-colors"
                      >
                        {invitingId === f.id ? "..." : "Добавить"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ChannelsSidebar;

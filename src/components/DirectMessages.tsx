import { useState, useEffect, useRef } from "react";
import { User } from "@/hooks/useAuth";
import Icon from "@/components/ui/icon";
import ProfileModal from "@/components/ProfileModal";

const BASE = "https://functions.poehali.dev/b1a16ec3-c9d7-4e46-bb90-e30137e5c534";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` };
}

async function apiFriends(sub: string, token: string) {
  const res = await fetch(`${BASE}?action=friends&sub=${sub}`, { headers: authHeaders(token) });
  return res.json();
}

async function apiSendFriendReq(username: string, token: string) {
  const res = await fetch(`${BASE}?action=friends`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sub: "send", username }),
  });
  return res.json();
}

async function apiRespondReq(request_id: number, accept: boolean, token: string) {
  const res = await fetch(`${BASE}?action=friends`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sub: accept ? "accept" : "decline", request_id }),
  });
  return res.json();
}

async function apiGetDM(withId: number, token: string) {
  const res = await fetch(`${BASE}?action=dm&with=${withId}`, { headers: authHeaders(token) });
  return res.json();
}

async function apiSendDM(toId: number, content: string, token: string) {
  const res = await fetch(`${BASE}?action=dm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ to: toId, content }),
  });
  return res.json();
}

interface Friend { id: number; username: string; favorite_game: string; }
interface FriendRequest { request_id: number; user_id: number; username: string; favorite_game: string; }
interface DMessage { id: number; content: string; created_at: string; username: string; is_removed?: boolean; }
interface DMContextMenu { msgId: number; x: number; y: number; isMe: boolean; }

function avatarColor(name: string) {
  const colors = ["#5865f2","#eb459e","#ed4245","#fee75c","#57f287","#1abc9c","#3498db","#e91e63"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

interface Props {
  user: User;
  token: string;
  onClose: () => void;
  seenKey?: string;
}

type Tab = "friends" | "requests" | "add";

function getSeenMap(key: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function markSeen(key: string, friendId: number, lastId: number) {
  const m = getSeenMap(key);
  m[String(friendId)] = lastId;
  localStorage.setItem(key, JSON.stringify(m));
}

export default function DirectMessages({ user, token, onClose, seenKey = "frikords_dm_seen" }: Props) {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [unreadPerFriend, setUnreadPerFriend] = useState<Record<number, number>>({});
  const [addUsername, setAddUsername] = useState("");
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<DMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [dmContextMenu, setDmContextMenu] = useState<DMContextMenu | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uid = (user as unknown as { id: number }).id;

  const isAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMsgCount(0);
  };

  const loadFriends = async () => {
    const data = await apiFriends("list", token);
    if (!data.friends) return;
    setFriends(data.friends);
    const seen = getSeenMap(seenKey);
    const counts: Record<number, number> = {};
    await Promise.all(
      data.friends.map(async (f: Friend) => {
        const d = await apiGetDM(f.id, token);
        if (!d.messages?.length) return;
        const seenId = seen[String(f.id)] || 0;
        counts[f.id] = d.messages.filter((m: DMessage) => m.id > seenId && m.username !== user.username).length;
      })
    );
    setUnreadPerFriend(counts);
  };

  const loadRequests = async () => {
    const data = await apiFriends("requests", token);
    if (data.requests) setRequests(data.requests);
  };

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  useEffect(() => {
    if (!activeFriend) return;
    setNewMsgCount(0);
    const load = async (isFirst = false) => {
      const data = await apiGetDM(activeFriend.id, token);
      if (data.messages) {
        setMessages(prev => {
          const msgs: DMessage[] = data.messages;
          if (!isFirst && msgs.length > prev.length) {
            const newOnes = msgs.slice(prev.length).filter((m: DMessage) => m.username !== user.username);
            if (newOnes.length > 0 && !isAtBottom()) {
              setNewMsgCount(c => c + newOnes.length);
            } else if (isAtBottom()) {
              setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            }
          }
          return msgs;
        });
        if (data.messages.length > 0) {
          markSeen(seenKey, activeFriend.id, data.messages[data.messages.length - 1].id);
        }
        if (isFirst) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 50);
        }
      }
    };
    load(true);
    pollRef.current = setInterval(() => load(false), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeFriend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAdd = async () => {
    if (!addUsername.trim()) return;
    setLoading(true);
    setAddStatus(null);
    const data = await apiSendFriendReq(addUsername.trim(), token);
    setLoading(false);
    if (data.ok) {
      setAddStatus("✓ Запрос отправлен!");
      setAddUsername("");
    } else {
      setAddStatus(data.error || "Ошибка");
    }
  };

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    await apiRespondReq(req.request_id, accept, token);
    setRequests(r => r.filter(x => x.request_id !== req.request_id));
    if (accept) loadFriends();
  };

  const handleSend = async () => {
    if (!msgText.trim() || !activeFriend) return;
    const text = msgText.trim();
    setMsgText("");
    const data = await apiSendDM(activeFriend.id, text, token);
    if (data.message) setMessages(m => [...m, data.message]);
  };

  const handleDeleteDM = async (msgId: number) => {
    const res = await fetch(`${BASE}?action=delete_dm`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ msg_id: msgId }),
    });
    const data = await res.json();
    if (data.ok) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_removed: true, content: "" } : m));
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (activeFriend) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-stretch justify-start bg-black/60"
        onClick={() => { onClose(); setDmContextMenu(null); }}
      >
        <div
          className="relative flex flex-col bg-[#36393f] w-full max-w-md h-full shadow-2xl"
          onClick={e => { e.stopPropagation(); setDmContextMenu(null); }}
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-[#2f3136] border-b border-black/20">
            <button
              className="text-[#b9bbbe] hover:text-white transition-colors p-1"
              onClick={() => setActiveFriend(null)}
            >
              <Icon name="ArrowLeft" size={18} />
            </button>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: avatarColor(activeFriend.username) }}
            >
              {activeFriend.username[0].toUpperCase()}
            </div>
            <div
              className="min-w-0 cursor-pointer hover:opacity-80"
              onClick={() => setProfileUsername(activeFriend.username)}
            >
              <div className="font-semibold text-white text-sm truncate">{activeFriend.username}</div>
              {activeFriend.favorite_game && (
                <div className="text-xs text-[#b9bbbe] truncate">{activeFriend.favorite_game}</div>
              )}
            </div>
            <button className="ml-auto text-[#b9bbbe] hover:text-white transition-colors" onClick={onClose}>
              <Icon name="X" size={18} />
            </button>
          </div>

          <div className="relative flex-1 min-h-0">
            <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {messages.length === 0 && (
                <div className="text-center text-[#72767d] text-sm mt-8">
                  Начни переписку с {activeFriend.username}
                </div>
              )}
              {messages.map(msg => {
                const isMe = msg.username === user.username;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 group ${isMe ? "flex-row-reverse" : ""}`}
                    onContextMenu={e => {
                      if (msg.is_removed) return;
                      e.preventDefault();
                      setDmContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isMe });
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 self-end cursor-pointer hover:opacity-80"
                      style={{ background: avatarColor(msg.username) }}
                      onClick={() => setProfileUsername(msg.username)}
                    >
                      {msg.username[0].toUpperCase()}
                    </div>
                    <div className={`relative max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {msg.is_removed ? (
                        <div className="px-3 py-2 rounded-2xl text-sm bg-[#2f3136] text-[#72767d] italic">
                          сообщение удалено
                        </div>
                      ) : (
                        <div className={`px-3 py-2 rounded-2xl text-sm break-words ${
                          isMe ? "bg-[#5865f2] text-white rounded-br-sm" : "bg-[#40444b] text-[#dcddde] rounded-bl-sm"
                        }`}>
                          {msg.content}
                        </div>
                      )}
                      {isMe && !msg.is_removed && (
                        <button
                          onClick={() => handleDeleteDM(msg.id)}
                          className="opacity-0 group-hover:opacity-100 text-[#72767d] hover:text-[#ed4245] transition-all text-xs self-end"
                          title="Удалить"
                        >
                          <Icon name="Trash2" size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {newMsgCount > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg transition-colors"
              >
                ↓ {newMsgCount} {newMsgCount === 1 ? "новое сообщение" : "новых сообщения"}
              </button>
            )}
          </div>

          <div className="px-4 py-3 bg-[#40444b] mx-4 mb-4 rounded-lg flex gap-2 items-center">
            <input
              className="flex-1 bg-transparent text-white placeholder-[#72767d] text-sm outline-none"
              placeholder={`Сообщение для ${activeFriend.username}...`}
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={handleKey}
            />
            <button
              className="text-[#b9bbbe] hover:text-white transition-colors disabled:opacity-40"
              onClick={handleSend}
              disabled={!msgText.trim()}
            >
              <Icon name="Send" size={16} />
            </button>
          </div>

          {/* Context menu */}
          {dmContextMenu && (
            <div
              className="fixed z-[60] bg-[#18191c] border border-[#202225] rounded-lg shadow-2xl py-1 min-w-[160px]"
              style={{ top: dmContextMenu.y, left: dmContextMenu.x }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  const msg = messages.find(m => m.id === dmContextMenu.msgId);
                  if (msg) navigator.clipboard.writeText(msg.content);
                  setDmContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
              >
                <Icon name="Copy" size={14} />
                Скопировать
              </button>
              {dmContextMenu.isMe && (
                <>
                  <div className="border-t border-[#202225] my-1" />
                  <button
                    onClick={() => {
                      handleDeleteDM(dmContextMenu.msgId);
                      setDmContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[#ed4245] hover:bg-[#ed4245] hover:text-white text-sm transition-colors"
                  >
                    <Icon name="Trash2" size={14} />
                    Удалить
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Profile modal */}
        {profileUsername && (
          <ProfileModal
            username={profileUsername}
            onClose={() => setProfileUsername(null)}
            token={token}
            currentUserId={uid}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-start bg-black/60" onClick={onClose}>
      <div
        className="relative flex flex-col bg-[#36393f] w-full max-w-sm h-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#2f3136] border-b border-black/20">
          <span className="font-semibold text-white text-sm">Личные сообщения</span>
          <button className="text-[#b9bbbe] hover:text-white transition-colors" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex border-b border-black/20">
          {(["friends", "requests", "add"] as Tab[]).map(t => (
            <button
              key={t}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                tab === t ? "text-white" : "text-[#72767d] hover:text-[#b9bbbe]"
              }`}
              onClick={() => { setTab(t); setAddStatus(null); }}
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
                    onClick={() => {
                      setActiveFriend(f);
                      setUnreadPerFriend(prev => ({ ...prev, [f.id]: 0 }));
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ background: avatarColor(f.username) }}
                      >
                        {f.username[0].toUpperCase()}
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
                    {r.username[0].toUpperCase()}
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
                      onClick={() => handleRespond(r, true)}
                    >
                      <Icon name="Check" size={14} className="text-white" />
                    </button>
                    <button
                      className="w-7 h-7 rounded-full bg-[#ed4245] hover:bg-[#c53a3c] flex items-center justify-center transition-colors"
                      onClick={() => handleRespond(r, false)}
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
                  onChange={e => setAddUsername(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
                <button
                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                  onClick={handleAdd}
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
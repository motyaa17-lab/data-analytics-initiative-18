import { useState, useEffect, useRef, useCallback } from "react";
import { Hash, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { User } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import ProfileModal from "@/components/ProfileModal";
import MessageItem from "@/components/chat/MessageItem";
import OnlinePanel from "@/components/chat/OnlinePanel";
import MessageInput from "@/components/chat/MessageInput";
import {
  Message, OnlineUser, ContextMenu,
  CHANNEL_LABELS, sendNotification,
} from "@/components/chat/chatTypes";

interface ChatAreaProps {
  onSidebarOpen: () => void;
  onRegisterClick: () => void;
  user: User | null;
  token: string | null;
  channel: string;
  roomId?: number;
  roomName?: string;
}

const ChatArea = ({ onSidebarOpen, onRegisterClick, user, token, channel, roomId, roomName }: ChatAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showUsers, setShowUsers] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(
    "Notification" in window && Notification.permission === "granted"
  );
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<{ id: number; content: string } | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const lastMsgIdRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uid = (user as unknown as { id: number } | null)?.id;

  const isAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMsgCount(0);
  };

  const fetchMessages = useCallback(async () => {
    const data = await api.messages.get(channel, token, roomId);
    if (Array.isArray(data.messages)) {
      const msgs = data.messages as Message[];
      setMessages(prev => {
        if (prev.length > 0 && msgs.length > prev.length) {
          const newOnes = msgs.slice(prev.length);
          const fromOthers = newOnes.filter(m => m.username !== user?.username).length;
          if (fromOthers > 0 && !isAtBottom()) {
            setNewMsgCount(c => c + fromOthers);
          } else if (isAtBottom()) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          }
        } else if (prev.length === 0) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 50);
        }
        return msgs;
      });
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        if (lastMsgIdRef.current !== null && last.id !== lastMsgIdRef.current && last.username !== user?.username) {
          sendNotification(last.username, last.content);
        }
        lastMsgIdRef.current = last.id;
      }
    }
  }, [channel, token, roomId, user]);

  const fetchOnline = useCallback(async () => {
    const data = await api.online.get();
    if (typeof data.online === "number") setOnline(data.online);
    if (Array.isArray(data.users)) setOnlineUsers(data.users as OnlineUser[]);
  }, []);

  useEffect(() => {
    setMessages([]);
    setNewMsgCount(0);
    lastMsgIdRef.current = null;
    setReplyTo(null);
    setEditingMsg(null);
    fetchMessages();
    fetchOnline();
    const interval = setInterval(() => { fetchMessages(); fetchOnline(); }, 5000);
    return () => clearInterval(interval);
  }, [channel, roomId]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", e => { if (e.key === "Escape") { setContextMenu(null); setEditingMsg(null); setReplyTo(null); } });
    return () => window.removeEventListener("click", close);
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !token) return;

    if (editingMsg) {
      const res = await api.messages.edit(token, editingMsg.id, input.trim());
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: input.trim(), edited: true } : m));
      }
      setEditingMsg(null);
      setInput("");
      return;
    }

    setSending(true);
    const content = replyTo
      ? `↩ @${replyTo.username}: "${replyTo.content.slice(0, 50)}${replyTo.content.length > 50 ? '…' : ''}"\n${input.trim()}`
      : input.trim();
    setInput("");
    setReplyTo(null);
    const data = await api.messages.send(token, content, channel, roomId);
    setSending(false);
    if (data.success && data.message) {
      const msg = data.message as Message;
      setMessages(prev => [...prev, msg]);
      lastMsgIdRef.current = msg.id;
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const handleDelete = async (msgId: number) => {
    if (!token) return;
    setContextMenu(null);
    const res = await api.messages.remove(token, msgId);
    if (res.ok) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_removed: true, content: "" } : m));
    }
  };

  const handleReact = async (msgId: number, emoji: string) => {
    if (!token || !user) return;
    setEmojiPickerFor(null);
    const data = await api.reactions.add(token, msgId, emoji);
    if (!data.ok) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const others = (m.reactions || []).filter(r => r.emoji !== emoji);
      const count = data.count as number;
      const users = data.users as number[];
      if (count > 0) return { ...m, reactions: [...others, { emoji, count, users }] };
      return { ...m, reactions: others };
    }));
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    if (msg.is_removed) return;
    e.preventDefault();
    setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY });
  };

  const handleCopy = (msgId: number) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg) navigator.clipboard.writeText(msg.content);
    setContextMenu(null);
  };

  const handleReply = (msgId: number) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      setReplyTo(msg);
      inputRef.current?.focus();
    }
    setContextMenu(null);
  };

  const handleEdit = (msgId: number) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      setEditingMsg({ id: msg.id, content: msg.content });
      setInput(msg.content);
      inputRef.current?.focus();
    }
    setContextMenu(null);
  };

  const handleEnableNotif = async () => {
    const perm = await Notification.requestPermission();
    setNotifEnabled(perm === "granted");
  };

  const label = roomId ? (roomName || "комната") : (CHANNEL_LABELS[channel] || channel);

  const ctxMsg = contextMenu ? messages.find(m => m.id === contextMenu.msgId) : null;
  const isCtxOwn = ctxMsg && uid === ctxMsg.author_id;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden" onClick={() => { setEmojiPickerFor(null); setContextMenu(null); }}>
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-2 flex-shrink-0">
          <Button variant="ghost" className="lg:hidden text-[#8e9297] hover:text-[#dcddde] hover:bg-[#40444b] w-10 h-10 p-0 mr-1 flex-shrink-0" onClick={onSidebarOpen}>
            <Menu className="w-6 h-6" />
          </Button>
          <Hash className="w-5 h-5 text-[#8e9297]" />
          <span className="text-white font-semibold">{label}</span>
          <div className="ml-auto flex items-center gap-3">
            {online !== null && (
              <div className="flex items-center gap-1.5 text-xs text-[#3ba55c]">
                <span className="w-2 h-2 rounded-full bg-[#3ba55c] inline-block"></span>
                {online} онлайн
              </div>
            )}
            {"Notification" in window && !notifEnabled && (
              <button onClick={handleEnableNotif} title="Включить уведомления" className="text-[#b9bbbe] hover:text-[#faa81a] transition-colors">
                <Icon name="BellOff" size={16} />
              </button>
            )}
            {"Notification" in window && notifEnabled && (
              <button onClick={() => setNotifEnabled(false)} title="Уведомления включены" className="text-[#3ba55c] hover:text-[#b9bbbe] transition-colors">
                <Icon name="Bell" size={16} />
              </button>
            )}
            <button onClick={() => setShowUsers(v => !v)} title="Пользователи онлайн" className={`transition-colors ${showUsers ? "text-white" : "text-[#b9bbbe] hover:text-white"}`}>
              <Icon name="Users" size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto p-3 space-y-1">
            {messages.length === 0 && (
              <div className="text-center text-[#72767d] text-sm py-12">
                Сообщений пока нет. Будь первым!
              </div>
            )}
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                uid={uid}
                user={user}
                isHovered={hoveredMsg === msg.id}
                emojiPickerFor={emojiPickerFor}
                onMouseEnter={() => setHoveredMsg(msg.id)}
                onMouseLeave={() => setHoveredMsg(null)}
                onContextMenu={handleContextMenu}
                onProfileClick={setProfileUsername}
                onReact={handleReact}
                onReply={handleReply}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleEmojiPicker={id => setEmojiPickerFor(v => v === id ? null : id)}
              />
            ))}
            <div ref={bottomRef} />
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

        <MessageInput
          user={user}
          input={input}
          sending={sending}
          replyTo={replyTo}
          editingMsg={editingMsg}
          label={label}
          inputRef={inputRef}
          onInputChange={setInput}
          onSubmit={sendMessage}
          onCancelReplyOrEdit={() => { setReplyTo(null); setEditingMsg(null); setInput(""); }}
          onRegisterClick={onRegisterClick}
        />
      </div>

      {/* Users panel */}
      {showUsers && (
        <OnlinePanel
          onlineUsers={onlineUsers}
          onClose={() => setShowUsers(false)}
          onProfileClick={setProfileUsername}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#18191c] border border-[#202225] rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => handleCopy(contextMenu.msgId)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
          >
            <Icon name="Copy" size={14} />
            Скопировать
          </button>
          {user && (
            <button
              onClick={() => handleReply(contextMenu.msgId)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
            >
              <Icon name="Reply" size={14} />
              Ответить
            </button>
          )}
          {isCtxOwn && (
            <button
              onClick={() => handleEdit(contextMenu.msgId)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
            >
              <Icon name="Pencil" size={14} />
              Изменить
            </button>
          )}
          {isCtxOwn && (
            <>
              <div className="border-t border-[#202225] my-1" />
              <button
                onClick={() => handleDelete(contextMenu.msgId)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[#ed4245] hover:bg-[#ed4245] hover:text-white text-sm transition-colors"
              >
                <Icon name="Trash2" size={14} />
                Удалить
              </button>
            </>
          )}
        </div>
      )}

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
};

export default ChatArea;
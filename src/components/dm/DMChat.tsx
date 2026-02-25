import { RefObject, useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import ProfileModal from "@/components/ProfileModal";
import { Friend, DMessage, DMContextMenu, avatarColor, BASE, authHeaders, apiEditDM } from "@/components/dm/dmTypes";
import { User } from "@/hooks/useAuth";

interface Props {
  user: User;
  token: string;
  uid: number;
  activeFriend: Friend;
  messages: DMessage[];
  msgText: string;
  newMsgCount: number;
  dmContextMenu: DMContextMenu | null;
  profileUsername: string | null;
  scrollContainerRef: RefObject<HTMLDivElement>;
  messagesEndRef: RefObject<HTMLDivElement>;
  onBack: () => void;
  onClose: () => void;
  onMsgTextChange: (v: string) => void;
  onSend: () => void;
  onKey: (e: React.KeyboardEvent) => void;
  onScrollToBottom: () => void;
  onSetContextMenu: (m: DMContextMenu | null) => void;
  onSetProfileUsername: (u: string | null) => void;
  onDeleteDM: (msgId: number) => void;
  setMessages: React.Dispatch<React.SetStateAction<DMessage[]>>;
}

export default function DMChat({
  user, token, uid, activeFriend, messages, msgText, newMsgCount,
  dmContextMenu, profileUsername, scrollContainerRef, messagesEndRef,
  onBack, onClose, onMsgTextChange, onSend, onKey, onScrollToBottom,
  onSetContextMenu, onSetProfileUsername, onDeleteDM, setMessages,
}: Props) {
  const [editingMsg, setEditingMsg] = useState<{ id: number; content: string } | null>(null);
  const [editText, setEditText] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingMsg) editInputRef.current?.focus();
  }, [editingMsg]);

  const handleStartEdit = (msgId: number) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    setEditingMsg({ id: msg.id, content: msg.content });
    setEditText(msg.content);
    onSetContextMenu(null);
  };

  const handleConfirmEdit = async () => {
    if (!editingMsg || !editText.trim()) return;
    const data = await apiEditDM(editingMsg.id, editText.trim(), token);
    if (data.ok) {
      setMessages(prev => prev.map(m =>
        m.id === editingMsg.id ? { ...m, content: editText.trim(), edited: true } : m
      ));
    }
    setEditingMsg(null);
    setEditText("");
  };

  const handleEditKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleConfirmEdit(); }
    if (e.key === "Escape") { setEditingMsg(null); setEditText(""); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-start bg-black/60"
      onClick={() => { onClose(); onSetContextMenu(null); }}
    >
      <div
        className="relative flex flex-col bg-[#36393f] w-full max-w-md h-full shadow-2xl"
        onClick={e => { e.stopPropagation(); onSetContextMenu(null); }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#2f3136] border-b border-black/20">
          <button className="text-[#b9bbbe] hover:text-white transition-colors p-1" onClick={onBack}>
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
            onClick={() => onSetProfileUsername(activeFriend.username)}
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

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <div className="text-center text-[#72767d] text-sm mt-8">
                Начни переписку с {activeFriend.username}
              </div>
            )}
            {messages.map(msg => {
              const isMe = msg.username === user.username;
              const isEditing = editingMsg?.id === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 group ${isMe ? "flex-row-reverse" : ""}`}
                  onContextMenu={e => {
                    if (msg.is_removed) return;
                    e.preventDefault();
                    onSetContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isMe });
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 self-end cursor-pointer hover:opacity-80"
                    style={{ background: avatarColor(msg.username) }}
                    onClick={() => onSetProfileUsername(msg.username)}
                  >
                    {msg.username[0].toUpperCase()}
                  </div>
                  <div className={`relative max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {msg.is_removed ? (
                      <div className="px-3 py-2 rounded-2xl text-sm bg-[#2f3136] text-[#72767d] italic">
                        сообщение удалено
                      </div>
                    ) : isEditing ? (
                      <div className="flex gap-1.5 items-center">
                        <input
                          ref={editInputRef}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={handleEditKey}
                          className="bg-[#40444b] text-white text-sm px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-[#5865f2] w-full"
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={handleConfirmEdit} className="text-[#3ba55c] hover:text-white transition-colors flex-shrink-0">
                          <Icon name="Check" size={14} />
                        </button>
                        <button onClick={() => { setEditingMsg(null); setEditText(""); }} className="text-[#72767d] hover:text-white transition-colors flex-shrink-0">
                          <Icon name="X" size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className={`px-3 py-2 rounded-2xl text-sm break-words ${
                        isMe ? "bg-[#5865f2] text-white rounded-br-sm" : "bg-[#40444b] text-[#dcddde] rounded-bl-sm"
                      }`}>
                        {msg.content}
                        {msg.edited && <span className="text-white/50 text-[10px] ml-1 italic">(изм.)</span>}
                      </div>
                    )}
                    {isMe && !msg.is_removed && !isEditing && (
                      <button
                        onClick={() => onDeleteDM(msg.id)}
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
              onClick={onScrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg transition-colors"
            >
              ↓ {newMsgCount} {newMsgCount === 1 ? "новое сообщение" : "новых сообщения"}
            </button>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 bg-[#40444b] mx-4 mb-4 rounded-lg flex gap-2 items-center">
          <input
            className="flex-1 bg-transparent text-white placeholder-[#72767d] text-sm outline-none"
            placeholder={`Сообщение для ${activeFriend.username}...`}
            value={msgText}
            onChange={e => onMsgTextChange(e.target.value)}
            onKeyDown={onKey}
          />
          <button
            className="text-[#b9bbbe] hover:text-white transition-colors disabled:opacity-40"
            onClick={onSend}
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
                onSetContextMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
            >
              <Icon name="Copy" size={14} />
              Скопировать
            </button>
            {dmContextMenu.isMe && (
              <>
                <button
                  onClick={() => handleStartEdit(dmContextMenu.msgId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[#dcddde] hover:bg-[#5865f2] hover:text-white text-sm transition-colors"
                >
                  <Icon name="Pencil" size={14} />
                  Изменить
                </button>
                <div className="border-t border-[#202225] my-1" />
                <button
                  onClick={() => {
                    onDeleteDM(dmContextMenu.msgId);
                    onSetContextMenu(null);
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
          onClose={() => onSetProfileUsername(null)}
          token={token}
          currentUserId={uid}
        />
      )}
    </div>
  );
}

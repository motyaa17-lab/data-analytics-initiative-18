import Icon from "@/components/ui/icon";
import { Message, Reaction, EMOJI_LIST, avatarBg, formatTime } from "@/components/chat/chatTypes";
import { User } from "@/hooks/useAuth";

interface Props {
  msg: Message;
  uid: number | undefined;
  user: User | null;
  isHovered: boolean;
  emojiPickerFor: number | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onProfileClick: (username: string) => void;
  onReact: (msgId: number, emoji: string) => void;
  onReply: (msgId: number) => void;
  onEdit: (msgId: number) => void;
  onDelete: (msgId: number) => void;
  onToggleEmojiPicker: (msgId: number) => void;
}

export default function MessageItem({
  msg, uid, user, isHovered, emojiPickerFor,
  onMouseEnter, onMouseLeave, onContextMenu, onProfileClick,
  onReact, onReply, onEdit, onDelete, onToggleEmojiPicker,
}: Props) {
  const isOwn = uid === msg.author_id;

  return (
    <div
      className="relative flex gap-3 hover:bg-[#32353b] rounded px-2 py-1.5 -mx-2 group"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={e => onContextMenu(e, msg)}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 md:w-9 md:h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 cursor-pointer overflow-hidden"
        style={{ background: msg.avatar_url ? undefined : avatarBg(msg.username) }}
        onClick={() => onProfileClick(msg.username)}
      >
        {msg.avatar_url
          ? <img src={msg.avatar_url} alt={msg.username} className="w-full h-full object-cover" />
          : <span className="text-white text-sm font-semibold">{msg.username[0].toUpperCase()}</span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
          <span
            className="text-white font-semibold text-base md:text-sm cursor-pointer hover:underline"
            onClick={() => onProfileClick(msg.username)}
          >
            {msg.username}
          </span>
          {msg.badge && !msg.is_removed && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#5865f2]/20 text-[#5865f2] border border-[#5865f2]/40 leading-none">
              {msg.badge}
            </span>
          )}
          {msg.favorite_game && !msg.is_removed && <span className="text-[#5865f2] text-xs hidden sm:inline">🎮 {msg.favorite_game}</span>}
          <span className="text-[#72767d] text-xs">{formatTime(msg.created_at)}</span>
          {msg.edited && !msg.is_removed && <span className="text-[#72767d] text-xs italic">(изменено)</span>}
        </div>
        {msg.is_removed ? (
          <p className="text-[#72767d] text-base md:text-sm italic">сообщение удалено</p>
        ) : (
          <>
            {msg.content && (
              <p className="text-[#dcddde] text-base md:text-sm break-words whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            )}
            {msg.image_url && (
              <div className="mt-1">
                <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={msg.image_url}
                    alt="фото"
                    className="max-w-xs max-h-72 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity border border-[#40444b]"
                    loading="lazy"
                  />
                </a>
              </div>
            )}
          </>
        )}
        {/* Reactions */}
        {!msg.is_removed && (msg.reactions || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(msg.reactions || []).map((r: Reaction) => {
              const iMine = user && uid !== undefined && r.users.includes(uid);
              return (
                <button
                  key={r.emoji}
                  onClick={e => { e.stopPropagation(); onReact(msg.id, r.emoji); }}
                  className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                    iMine
                      ? "bg-[#5865f2]/20 border-[#5865f2]/60 text-white"
                      : "bg-[#2f3136] border-[#40444b] text-[#dcddde] hover:border-[#5865f2]/50"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[10px] font-medium">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover action buttons */}
      {!msg.is_removed && user && isHovered && (
        <div
          className="absolute right-2 top-0 -translate-y-1/2 flex items-center gap-1 bg-[#2f3136] border border-[#202225] rounded-lg shadow-lg px-1 py-0.5 z-10"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onToggleEmojiPicker(msg.id)}
            className="text-[#b9bbbe] hover:text-white transition-colors p-1 rounded hover:bg-[#40444b]"
            title="Реакция"
          >
            <Icon name="Smile" size={14} />
          </button>
          <button
            onClick={() => onReply(msg.id)}
            className="text-[#b9bbbe] hover:text-white transition-colors p-1 rounded hover:bg-[#40444b]"
            title="Ответить"
          >
            <Icon name="Reply" size={14} />
          </button>
          {isOwn && (
            <>
              <button
                onClick={() => onEdit(msg.id)}
                className="text-[#b9bbbe] hover:text-white transition-colors p-1 rounded hover:bg-[#40444b]"
                title="Изменить"
              >
                <Icon name="Pencil" size={14} />
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="text-[#b9bbbe] hover:text-[#ed4245] transition-colors p-1 rounded hover:bg-[#40444b]"
                title="Удалить"
              >
                <Icon name="Trash2" size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Emoji picker */}
      {emojiPickerFor === msg.id && (
        <div
          className="absolute right-2 top-7 bg-[#2f3136] border border-[#202225] rounded-lg shadow-xl p-2 z-20 flex gap-1"
          onClick={e => e.stopPropagation()}
        >
          {EMOJI_LIST.map(emoji => (
            <button
              key={emoji}
              onClick={() => onReact(msg.id, emoji)}
              className="text-xl hover:scale-125 transition-transform p-0.5 rounded hover:bg-[#40444b]"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
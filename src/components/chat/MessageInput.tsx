import { RefObject } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { User } from "@/hooks/useAuth";
import { Message } from "@/components/chat/chatTypes";

interface Props {
  user: User | null;
  input: string;
  sending: boolean;
  replyTo: Message | null;
  editingMsg: { id: number; content: string } | null;
  label: string;
  inputRef: RefObject<HTMLInputElement>;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancelReplyOrEdit: () => void;
  onRegisterClick: () => void;
}

export default function MessageInput({
  user, input, sending, replyTo, editingMsg, label,
  inputRef, onInputChange, onSubmit, onCancelReplyOrEdit, onRegisterClick,
}: Props) {
  return (
    <>
      {/* Reply / Edit bar */}
      {(replyTo || editingMsg) && (
        <div className="mx-3 mb-1 px-3 py-2 bg-[#2f3136] rounded-t-lg border-l-2 border-[#5865f2] flex items-center gap-2">
          <Icon name={editingMsg ? "Pencil" : "Reply"} size={14} className="text-[#5865f2] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[#5865f2] text-xs font-medium">
              {editingMsg ? "Редактирование" : `Ответ для @${replyTo?.username}`}
            </span>
            {replyTo && (
              <p className="text-[#72767d] text-xs truncate">{replyTo.content}</p>
            )}
          </div>
          <button
            onClick={onCancelReplyOrEdit}
            className="text-[#72767d] hover:text-white flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 flex-shrink-0 border-t border-[#202225]">
        {user ? (
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => onInputChange(e.target.value)}
              placeholder={editingMsg ? "Редактировать сообщение..." : `Написать в #${label}...`}
              disabled={sending}
              className="flex-1 bg-[#40444b] text-white placeholder-[#72767d] rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-[#5865f2] disabled:opacity-60 min-h-[44px]"
            />
            <Button type="submit" disabled={!input.trim() || sending} className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 disabled:opacity-40 min-w-[44px] min-h-[44px]">
              <Send className="w-5 h-5" />
            </Button>
          </form>
        ) : (
          <div className="flex items-center justify-between bg-[#40444b] rounded-lg px-3 py-3 min-h-[44px]">
            <span className="text-[#72767d] text-sm">Войди, чтобы писать</span>
            <Button size="sm" className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs min-h-[36px]" onClick={onRegisterClick}>
              Войти
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
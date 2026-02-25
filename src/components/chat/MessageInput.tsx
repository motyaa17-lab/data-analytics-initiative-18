import { RefObject, useRef, useState, useEffect } from "react";
import { Send, X, ImagePlus } from "lucide-react";
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
  imagePreview: string | null;
  imageUploading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancelReplyOrEdit: () => void;
  onRegisterClick: () => void;
  onImageSelect: (file: File) => void;
  onImageRemove: () => void;
  onVoiceSend: (blob: Blob, ext: string) => void;
}

export default function MessageInput({
  user, input, sending, replyTo, editingMsg, label,
  inputRef, imagePreview, imageUploading,
  onInputChange, onSubmit, onCancelReplyOrEdit, onRegisterClick,
  onImageSelect, onImageRemove, onVoiceSend,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) onVoiceSend(blob, ext);
        setRecording(false);
        setRecSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      mr.start(200);
      mediaRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      alert("Нет доступа к микрофону");
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.onstop = () => {
        mediaRef.current!.stream?.getTracks().forEach(t => t.stop());
      };
      mediaRef.current.stop();
    }
    setRecording(false);
    setRecSeconds(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageSelect(file);
    e.target.value = "";
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const canSend = (input.trim() || imagePreview) && !sending && !imageUploading;

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
          <button onClick={onCancelReplyOrEdit} className="text-[#72767d] hover:text-white flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="mx-3 mb-1 relative w-fit">
          <div className="relative rounded-lg overflow-hidden border border-[#40444b]">
            <img src={imagePreview} alt="preview" className="max-h-40 max-w-xs object-contain rounded-lg" />
            {imageUploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <Icon name="Loader2" size={24} className="text-white animate-spin" />
              </div>
            )}
          </div>
          {!imageUploading && (
            <button
              onClick={onImageRemove}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#ed4245] rounded-full flex items-center justify-center text-white hover:bg-[#c03537] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-3 flex-shrink-0 border-t border-[#202225]">
        {user ? (
          recording ? (
            /* Recording UI */
            <div className="flex items-center gap-3 bg-[#40444b] rounded-lg px-3 py-3 min-h-[44px]">
              <div className="w-2 h-2 rounded-full bg-[#ed4245] animate-pulse flex-shrink-0" />
              <span className="text-white text-sm font-mono flex-1">{fmt(recSeconds)}</span>
              <button
                type="button"
                onClick={cancelRecording}
                className="text-[#72767d] hover:text-[#ed4245] transition-colors p-1"
                title="Отмена"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                disabled={sending}
                className="w-9 h-9 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0"
                title="Отправить"
              >
                <Icon name="Send" size={16} className="text-white" />
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex gap-2 items-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={sending || imageUploading || !!editingMsg}
                className="text-[#b9bbbe] hover:text-[#dcddde] hover:bg-[#40444b] rounded-lg p-2 transition-colors disabled:opacity-40 flex-shrink-0 min-w-[40px] min-h-[44px] flex items-center justify-center"
                title="Прикрепить фото"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => onInputChange(e.target.value)}
                placeholder={editingMsg ? "Редактировать сообщение..." : `Написать в #${label}...`}
                disabled={sending}
                className="flex-1 bg-[#40444b] text-white placeholder-[#72767d] rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-[#5865f2] disabled:opacity-60 min-h-[44px]"
              />
              {!input.trim() && !imagePreview && !editingMsg ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={sending}
                  className="text-[#b9bbbe] hover:text-[#dcddde] hover:bg-[#40444b] rounded-lg p-2 transition-colors disabled:opacity-40 flex-shrink-0 min-w-[40px] min-h-[44px] flex items-center justify-center"
                  title="Записать голосовое"
                >
                  <Icon name="Mic" size={20} />
                </button>
              ) : (
                <Button
                  type="submit"
                  disabled={!canSend}
                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 disabled:opacity-40 min-w-[44px] min-h-[44px]"
                >
                  {imageUploading
                    ? <Icon name="Loader2" size={18} className="animate-spin" />
                    : <Send className="w-5 h-5" />
                  }
                </Button>
              )}
            </form>
          )
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

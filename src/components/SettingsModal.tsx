import { useRef, useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { User } from "@/hooks/useAuth";
import { api } from "@/lib/api";

interface Props {
  user: User;
  token: string;
  onClose: () => void;
  onUpdate: (u: Partial<User>) => void;
}

type Tab = "profile" | "audio";

export default function SettingsModal({ user, token, onClose, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Profile state
  const [username, setUsername] = useState(user.username);
  const [game, setGame] = useState(user.favorite_game || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>(user.avatar_url || "");
  const [avatarError, setAvatarError] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Audio state
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0);
  const [micTesting, setMicTesting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeTab === "audio") loadDevices(false);
    return () => stopMicTest();
  }, [activeTab]);

  const loadDevices = async (withPermission = false) => {
    try {
      if (withPermission) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === "audioinput");
      if (mics.length === 0 && !withPermission) {
        return;
      }
      setMicDevices(mics);
      setMicError(null);
      const saved = localStorage.getItem("frikords_mic_id");
      if (saved && mics.find(m => m.deviceId === saved)) {
        setSelectedMic(saved);
      } else if (mics.length > 0) {
        setSelectedMic(mics[0].deviceId);
      }
    } catch {
      setMicError("Браузер запретил доступ к микрофону. Разреши его в настройках браузера.");
    }
  };

  const startMicTest = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      });
      await loadDevices();
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      setMicTesting(true);
      const tick = () => {
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, (avg / 128) * 100 * 2.5));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicError("Не удалось подключиться к микрофону");
    }
  };

  const stopMicTest = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicTesting(false);
    setMicLevel(0);
  }, []);

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    localStorage.setItem("frikords_mic_id", deviceId);
    if (micTesting) {
      stopMicTest();
      setTimeout(() => startMicTest(), 100);
    }
  };

  // Profile handlers
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Файл больше 2MB"); return; }
    setUploadingAvatar(true);
    setError(null);
    setStatus(null);
    setAvatarError(false);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
      const data = await api.profile.uploadAvatar(token, dataUrl);
      setUploadingAvatar(false);
      if (data.ok) {
        const newUrl = data.avatar_url as string;
        setAvatarPreview(newUrl);
        onUpdate({ avatar_url: newUrl });
        setStatus("Аватарка обновлена!");
      } else {
        setError((data.error as string) || "Ошибка загрузки");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    const data = await api.settings.save(token, { username: username.trim(), favorite_game: game.trim() });
    setSaving(false);
    if (data.ok) {
      setStatus("Сохранено!");
      onUpdate({ username: data.username as string, favorite_game: data.favorite_game as string });
    } else {
      setError((data.error as string) || "Ошибка сохранения");
    }
  };

  const dbColor = micLevel > 60 ? "#ed4245" : micLevel > 30 ? "#faa81a" : "#3ba55c";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { stopMicTest(); onClose(); }}>
      <div
        className="bg-[#36393f] rounded-xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <Icon name="Settings" size={18} className="text-[#b9bbbe]" />
            <h2 className="text-white font-semibold text-base">Настройки</h2>
          </div>
          <button onClick={() => { stopMicTest(); onClose(); }} className="text-[#b9bbbe] hover:text-white transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-1">
          {([["profile", "Профиль", "User"], ["audio", "Звук", "Mic"]] as const).map(([tab, label, icon]) => (
            <button
              key={tab}
              onClick={() => { if (tab !== "audio" && micTesting) stopMicTest(); setActiveTab(tab); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-[#5865f2] text-white" : "text-[#b9bbbe] hover:text-white hover:bg-[#40444b]"
              }`}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
          {/* === PROFILE TAB === */}
          {activeTab === "profile" && (
            <>
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
                  {avatarPreview && !avatarError ? (
                    <img src={avatarPreview} alt="avatar" className="w-16 h-16 rounded-full object-cover" onError={() => setAvatarError(true)} />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0" style={{ background: avatarBg(username || user.username) }}>
                      {(username || user.username)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? <Icon name="Loader2" size={20} className="text-white animate-spin" /> : <Icon name="Camera" size={20} className="text-white" />}
                  </div>
                </div>
                <div>
                  <div className="text-white text-sm font-medium">{username || user.username}</div>
                  <div className="text-[#b9bbbe] text-xs mb-1">{game || "Игра не указана"}</div>
                  <button onClick={() => fileRef.current?.click()} className="text-[#5865f2] text-xs hover:underline" disabled={uploadingAvatar}>
                    Сменить аватарку
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Никнейм</label>
                  <input value={username} onChange={e => setUsername(e.target.value)} maxLength={32} className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" placeholder="Твой никнейм" />
                </div>
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Любимая игра</label>
                  <input value={game} onChange={e => setGame(e.target.value)} maxLength={64} className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" placeholder="Например: Dota 2, CS2, Minecraft..." />
                </div>
              </div>

              {status && <p className="text-[#3ba55c] text-sm text-center">{status}</p>}
              {error && <p className="text-[#ed4245] text-sm text-center">{error}</p>}

              <button onClick={handleSave} disabled={saving || !username.trim()} className="w-full bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </>
          )}

          {/* === AUDIO TAB === */}
          {activeTab === "audio" && (
            <>
              {/* Mic select */}
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-2 block">Микрофон</label>
                {micDevices.length === 0 ? (
                  <div className="text-[#72767d] text-sm">Нет доступных микрофонов</div>
                ) : (
                  <select
                    value={selectedMic}
                    onChange={e => handleMicChange(e.target.value)}
                    className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2] cursor-pointer"
                  >
                    {micDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Volume meter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide">Уровень сигнала</label>
                  {micTesting && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3ba55c] animate-pulse" />
                      <span className="text-[#3ba55c] text-xs">Запись</span>
                    </div>
                  )}
                </div>

                {/* dB bar */}
                <div className="relative h-6 bg-[#2f3136] rounded-full overflow-hidden">
                  {/* Segments */}
                  <div className="absolute inset-0 flex gap-0.5 p-0.5">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const pct = ((i + 1) / 30) * 100;
                      const active = micLevel >= pct - 3.5;
                      const color = i > 19 ? "#ed4245" : i > 12 ? "#faa81a" : "#3ba55c";
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all duration-75"
                          style={{ background: active ? color : "#40444b" }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Labels */}
                <div className="flex justify-between mt-1 px-1">
                  <span className="text-[10px] text-[#72767d]">Тихо</span>
                  <span className="text-[10px] text-[#72767d]">Средне</span>
                  <span className="text-[10px] text-[#72767d]">Громко</span>
                </div>
              </div>

              {/* Big animated mic indicator */}
              {micTesting && (
                <div className="flex items-center justify-center py-2">
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-full transition-all duration-100"
                      style={{
                        background: dbColor,
                        opacity: 0.15,
                        transform: `scale(${1 + micLevel / 200})`,
                      }}
                    />
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ background: dbColor + "33", border: `2px solid ${dbColor}` }}
                    >
                      <Icon name="Mic" size={24} style={{ color: dbColor }} />
                    </div>
                  </div>
                </div>
              )}

              {micError && <p className="text-[#ed4245] text-sm text-center">{micError}</p>}

              <button
                onClick={micTesting ? stopMicTest : startMicTest}
                className={`w-full font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                  micTesting
                    ? "bg-[#ed4245] hover:bg-[#c03537] text-white"
                    : "bg-[#3ba55c] hover:bg-[#2d8c4e] text-white"
                }`}
              >
                <Icon name={micTesting ? "MicOff" : "Mic"} size={16} />
                {micTesting ? "Остановить проверку" : micDevices.length === 0 ? "Разрешить доступ и проверить" : "Проверить микрофон"}
              </button>

              <p className="text-[#72767d] text-xs text-center">
                Выбранный микрофон будет использоваться для звонков и голосовых сообщений
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
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
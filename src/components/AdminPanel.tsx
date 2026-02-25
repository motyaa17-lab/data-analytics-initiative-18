import { useState, useEffect } from "react";
import { X, AlertTriangle, Users, BarChart2, Ban, Search, MessageSquare, Trash2, Hash, Tag, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface AdminPanelProps {
  token: string;
  onClose: () => void;
}

type Tab = "stats" | "users" | "logs" | "messages";

const CHANNELS = ["general", "meet", "memes", "teammates"];

const AdminPanel = ({ token, onClose }: AdminPanelProps) => {
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState<"green" | "red">("green");
  const [selectedChannel, setSelectedChannel] = useState("general");
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [editBadgeId, setEditBadgeId] = useState<number | null>(null);
  const [badgeInput, setBadgeInput] = useState("");

  useEffect(() => {
    if (tab === "stats") loadStats();
    else if (tab === "users") loadUsers();
    else if (tab === "logs") loadLogs();
    else if (tab === "messages") loadMessages(selectedChannel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadStats = async () => {
    setLoading(true);
    const data = await api.admin.stats(token);
    if (data.stats) setStats(data.stats as Record<string, number>);
    setLoading(false);
  };

  const loadUsers = async (q = "") => {
    setLoading(true);
    const data = await api.admin.users(token, q);
    if (data.users) setUsers(data.users as Record<string, unknown>[]);
    setLoading(false);
  };

  const loadLogs = async () => {
    setLoading(true);
    const data = await api.admin.logs(token, 100);
    if (data.logs) setLogs(data.logs as Record<string, unknown>[]);
    setLoading(false);
  };

  const loadMessages = async (channel: string) => {
    setLoading(true);
    const data = await api.admin.messages(token, channel);
    if (data.messages) setMessages(data.messages as Record<string, unknown>[]);
    setLoading(false);
  };

  const handleBan = async (userId: number, ban: boolean) => {
    const data = await api.admin.ban(token, userId, ban);
    if (data.ok) {
      notify(ban ? "Пользователь заблокирован" : "Пользователь разблокирован", "green");
      loadUsers(search);
    }
  };

  const handleDeleteMsg = async (msgId: number) => {
    const data = await api.admin.deleteMsg(token, msgId);
    if (data.ok) {
      notify("Сообщение удалено", "green");
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_removed: true } : m));
    }
  };

  const handleSetBadge = async (userId: number) => {
    const data = await api.admin.setBadge(token, userId, badgeInput.trim());
    if (data.ok) {
      notify(badgeInput.trim() ? `Тег «${badgeInput.trim()}» выдан` : "Тег снят", "green");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, badge: badgeInput.trim() || null } : u));
    } else {
      notify("Ошибка", "red");
    }
    setEditBadgeId(null);
    setBadgeInput("");
  };

  const handleClearChannel = async (channel: string) => {
    const data = await api.admin.clearChannel(token, channel);
    if (data.ok) {
      notify(`Канал #${channel} очищен (${data.deleted} сообщений)`, "green");
      loadMessages(channel);
    } else {
      notify("Ошибка очистки", "red");
    }
    setConfirmClear(null);
  };

  const notify = (text: string, color: "green" | "red") => {
    setMsg(text);
    setMsgColor(color);
    setTimeout(() => setMsg(""), 4000);
  };

  const LEVEL_COLOR: Record<string, string> = {
    error: "text-red-400",
    warn: "text-yellow-400",
    info: "text-[#b9bbbe]",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[#2f3136] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-[#202225]">
        <div className="flex items-center justify-between p-4 border-b border-[#202225] flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Админ-панель</h2>
          <Button variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-1" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex border-b border-[#202225] flex-shrink-0 overflow-x-auto">
          {([
            ["stats", BarChart2, "Статистика"],
            ["users", Users, "Пользователи"],
            ["messages", MessageSquare, "Сообщения"],
            ["logs", AlertTriangle, "Логи"],
          ] as const).map(([t, Icon, label]) => (
            <button
              key={t}
              onClick={() => setTab(t as Tab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap transition-colors ${tab === t ? "text-white border-b-2 border-[#5865f2]" : "text-[#8e9297] hover:text-white"}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`mx-4 mt-3 text-sm rounded px-3 py-2 flex-shrink-0 ${msgColor === "green" ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-[#72767d] text-sm text-center py-8">Загрузка...</div>}

          {/* STATS */}
          {!loading && tab === "stats" && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ["Пользователей", stats.total_users],
                ["Заблокировано", stats.banned_users],
                ["Сообщений", stats.total_messages],
                ["Комнат", stats.total_rooms],
                ["Ошибок за 24ч", stats.errors_24h],
                ["Новых за 24ч", stats.new_users_24h],
                ["Сообщений 24ч", stats.messages_24h],
              ].map(([label, val]) => (
                <div key={label as string} className="bg-[#36393f] rounded-lg p-3">
                  <div className="text-[#8e9297] text-xs mb-1">{label as string}</div>
                  <div className="text-white text-2xl font-bold">{val as number}</div>
                </div>
              ))}
              {stats.db_size && (
                <div className="bg-[#36393f] rounded-lg p-3 col-span-2 sm:col-span-1">
                  <div className="text-[#8e9297] text-xs mb-1">База данных</div>
                  <div className="text-white text-2xl font-bold">{stats.db_size as string}</div>
                </div>
              )}
            </div>
          )}

          {/* USERS */}
          {!loading && tab === "users" && (
            <div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#72767d]" />
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); loadUsers(e.target.value); }}
                    placeholder="Поиск по нику или email..."
                    className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 pl-9 text-sm outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id as number} className="bg-[#36393f] rounded px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium">{u.username as string}</span>
                          {u.is_admin && <span className="bg-[#faa61a] text-black text-xs px-1 rounded font-bold">ADMIN</span>}
                          {u.is_banned && <span className="bg-red-500/20 text-red-400 text-xs px-1 rounded border border-red-500/30">БАН</span>}
                          {u.badge && <span className="bg-[#5865f2]/20 text-[#5865f2] text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[#5865f2]/40">{u.badge as string}</span>}
                        </div>
                        <div className="text-[#72767d] text-xs truncate">{u.email as string}</div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Выдать тег"
                          onClick={() => { setEditBadgeId(u.id as number); setBadgeInput(u.badge as string || ""); }}
                          className="text-[#5865f2] hover:bg-[#5865f2]/10 p-1 h-auto"
                        >
                          <Tag className="w-3.5 h-3.5" />
                        </Button>
                        {!u.is_admin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleBan(u.id as number, !u.is_banned)}
                            className={`text-xs flex-shrink-0 ${u.is_banned ? "text-green-400 hover:bg-green-500/10" : "text-red-400 hover:bg-red-500/10"}`}
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            {u.is_banned ? "Разбан" : "Бан"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {editBadgeId === (u.id as number) && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          autoFocus
                          value={badgeInput}
                          onChange={e => setBadgeInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSetBadge(u.id as number); if (e.key === "Escape") { setEditBadgeId(null); setBadgeInput(""); } }}
                          placeholder="Тег (пусто — снять)"
                          maxLength={64}
                          className="flex-1 bg-[#40444b] text-white placeholder-[#72767d] rounded px-2 py-1 text-xs outline-none border border-[#5865f2]/50 focus:border-[#5865f2]"
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleSetBadge(u.id as number)} className="text-green-400 hover:bg-green-500/10 p-1 h-auto">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditBadgeId(null); setBadgeInput(""); }} className="text-[#8e9297] hover:text-white p-1 h-auto">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {users.length === 0 && <div className="text-[#72767d] text-sm text-center py-4">Нет пользователей</div>}
              </div>
            </div>
          )}

          {/* MESSAGES */}
          {!loading && tab === "messages" && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4 items-center">
                <div className="flex gap-1 flex-wrap">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch}
                      onClick={() => { setSelectedChannel(ch); loadMessages(ch); }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors ${selectedChannel === ch ? "bg-[#5865f2] text-white" : "bg-[#40444b] text-[#b9bbbe] hover:bg-[#4f545c]"}`}
                    >
                      <Hash className="w-3 h-3" />
                      {ch}
                    </button>
                  ))}
                </div>
                <div className="ml-auto">
                  {confirmClear === selectedChannel ? (
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-xs">Очистить #{selectedChannel}?</span>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 text-xs h-7 px-2" onClick={() => handleClearChannel(selectedChannel)}>Да</Button>
                      <Button size="sm" variant="ghost" className="text-[#8e9297] hover:text-white text-xs h-7 px-2" onClick={() => setConfirmClear(null)}>Отмена</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 text-xs" onClick={() => setConfirmClear(selectedChannel)}>
                      <Trash2 className="w-3 h-3 mr-1" />
                      Очистить канал
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                {messages.map(m => (
                  <div key={m.id as number} className={`flex items-start gap-2 bg-[#36393f] rounded px-3 py-2 ${m.is_removed ? "opacity-40" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[#dcddde] text-xs font-semibold">{m.username as string}</span>
                        <span className="text-[#72767d] text-xs">{new Date(m.created_at as string).toLocaleString("ru-RU")}</span>
                        {m.is_removed && <span className="text-red-400 text-xs">[удалено]</span>}
                      </div>
                      <div className="text-[#b9bbbe] text-xs break-words">{m.content as string}</div>
                    </div>
                    {!m.is_removed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteMsg(m.id as number)}
                        className="text-red-400 hover:bg-red-500/10 p-1 h-auto flex-shrink-0"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {messages.length === 0 && <div className="text-[#72767d] text-sm text-center py-4">Нет сообщений</div>}
              </div>
            </div>
          )}

          {/* LOGS */}
          {!loading && tab === "logs" && (
            <div className="space-y-1">
              {logs.map(log => (
                <div key={log.id as number} className="bg-[#36393f] rounded px-3 py-2 text-xs font-mono">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={LEVEL_COLOR[log.level as string] || "text-[#b9bbbe]"}>[{(log.level as string).toUpperCase()}]</span>
                    <span className="text-[#8e9297]">{log.source as string}</span>
                    <span className="text-[#72767d] ml-auto">{new Date(log.created_at as string).toLocaleString("ru-RU")}</span>
                  </div>
                  <div className="text-[#dcddde]">{log.message as string}</div>
                  {log.ip && <div className="text-[#72767d]">IP: {log.ip as string}</div>}
                </div>
              ))}
              {logs.length === 0 && <div className="text-[#72767d] text-sm text-center py-4">Логов нет</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
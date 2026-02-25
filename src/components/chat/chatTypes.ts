export interface Reaction {
  emoji: string;
  count: number;
  users: number[];
}

export interface Message {
  id: number;
  content: string;
  created_at: string;
  username: string;
  favorite_game: string;
  avatar_url?: string;
  badge?: string;
  image_url?: string;
  voice_url?: string;
  is_removed?: boolean;
  author_id?: number;
  edited?: boolean;
  reactions?: Reaction[];
  replyTo?: { id: number; username: string; content: string };
}

export interface OnlineUser {
  username: string;
  favorite_game: string;
}

export interface ContextMenu {
  msgId: number;
  x: number;
  y: number;
}

export const CHANNEL_LABELS: Record<string, string> = {
  general: "общий",
  meet: "знакомства",
  memes: "мемы",
  teammates: "поиск-тиммейтов",
};

export const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👎", "🎮"];

export function avatarBg(name: string) {
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

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Yekaterinburg",
  });
}

export function sendNotification(username: string, content: string) {
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    new Notification(`${username} в Frikords`, {
      body: content.length > 60 ? content.slice(0, 60) + "…" : content,
      icon: "/favicon.ico",
    });
  }
}
import { useState, useEffect, useRef, useCallback } from "react";
import { Gamepad2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import ChannelsSidebar from "@/components/ChannelsSidebar";
import ChatArea from "@/components/ChatArea";
import RegisterModal from "@/components/RegisterModal";
import LoginModal from "@/components/LoginModal";
import AdminPanel from "@/components/AdminPanel";
import DirectMessages from "@/components/DirectMessages";
import SettingsModal from "@/components/SettingsModal";
import { useAuth } from "@/hooks/useAuth";
import { User } from "@/hooks/useAuth";
import Icon from "@/components/ui/icon";

const BASE = "https://functions.poehali.dev/b1a16ec3-c9d7-4e46-bb90-e30137e5c534";
const SEEN_KEY = "frikords_dm_seen";

function getSeenMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}

function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendNotif(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  }
}

const Index = () => {
  const { user, token, login, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDM, setShowDM] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeChannel, setActiveChannel] = useState("general");
  const [activeRoomId, setActiveRoomId] = useState<number | undefined>();
  const [activeRoomName, setActiveRoomName] = useState<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkUnread = useCallback(async () => {
    if (!user || !token) return;
    try {
      const res = await fetch(`${BASE}?action=friends&sub=list`, {
        headers: { "X-Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.friends) return;
      const seen = getSeenMap();
      let total = 0;
      await Promise.all(
        data.friends.map(async (f: { id: number; username: string }) => {
          const r = await fetch(`${BASE}?action=dm&with=${f.id}`, {
            headers: { "X-Authorization": `Bearer ${token}` },
          });
          const d = await r.json();
          if (!d.messages?.length) return;
          const seenId: number = seen[String(f.id)] || 0;
          const newMsgs = d.messages.filter((m: { id: number; username: string }) => m.id > seenId && m.username !== user.username);
          if (newMsgs.length > 0 && seenId > 0) {
            sendNotif(`💬 ${f.username}`, newMsgs[newMsgs.length - 1].content.slice(0, 80));
          }
          total += newMsgs.length;
        })
      );
      setUnreadCount(total);
    } catch (_e) { /* ignore */ }
  }, [user, token]);

  useEffect(() => {
    if (!user || !token) { setUnreadCount(0); return; }
    requestNotifPermission();
    checkUnread();
    pollRef.current = setInterval(checkUnread, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, token, checkUnread]);

  const handleOpenDM = () => {
    setShowDM(true);
  };

  const handleCloseDM = () => {
    setShowDM(false);
    checkUnread();
  };

  const handleChannelChange = (channel: string) => {
    setActiveChannel(channel);
    setActiveRoomId(undefined);
    setActiveRoomName(undefined);
  };

  const handleRoomChange = (roomId: number, roomName: string) => {
    setActiveRoomId(roomId);
    setActiveRoomName(roomName);
  };

  return (
    <div className="h-[100dvh] bg-[#36393f] text-white flex flex-col overflow-hidden">
      {showRegModal && <RegisterModal onClose={() => setShowRegModal(false)} />}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onSuccess={login} onRegisterClick={() => setShowRegModal(true)} />
      )}
      {showAdmin && token && <AdminPanel token={token} onClose={() => setShowAdmin(false)} />}
      {showDM && user && token && <DirectMessages user={user} token={token} onClose={handleCloseDM} seenKey={SEEN_KEY} />}
      {showSettings && user && token && (
        <SettingsModal
          user={user}
          token={token}
          onClose={() => setShowSettings(false)}
          onUpdate={(upd: Partial<User>) => login(token, { ...user, ...upd })}
        />
      )}

      {/* Navbar — только на десктопе */}
      <div className="hidden lg:block">
        <Navbar onRegisterClick={() => setShowRegModal(true)} onLoginClick={() => setShowLoginModal(true)} user={user} />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Левая иконка-панель — только на десктопе */}
        <div className="hidden lg:flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 flex-shrink-0">
          <div className="w-12 h-12 bg-[#5865f2] rounded-2xl flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div className="w-8 h-[2px] bg-[#36393f] rounded-full"></div>
          {user && (
            <button
              className="relative w-12 h-12 bg-[#2f3136] hover:bg-[#5865f2] rounded-2xl flex items-center justify-center transition-all duration-200 group"
              onClick={handleOpenDM}
              title="Личные сообщения"
            >
              <Icon name="MessageCircle" size={22} className="text-[#b9bbbe] group-hover:text-white transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#ed4245] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0">
          <ChannelsSidebar
            mobileSidebarOpen={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            activeChannel={activeChannel}
            activeRoomId={activeRoomId}
            onChannelChange={handleChannelChange}
            onRoomChange={handleRoomChange}
            user={user}
            token={token}
            onLogout={logout}
            onAdminClick={() => setShowAdmin(true)}
            onDMClick={handleOpenDM}
            onSettingsClick={() => setShowSettings(true)}
          />
          <ChatArea
            onSidebarOpen={() => setMobileSidebarOpen(true)}
            onRegisterClick={() => setShowLoginModal(true)}
            user={user}
            token={token}
            channel={activeChannel}
            roomId={activeRoomId}
            roomName={activeRoomName}
          />
        </div>
      </div>

      {/* Мобильная нижняя навигация */}
      <div className="lg:hidden flex-shrink-0 bg-[#202225] border-t border-[#111214] flex items-center justify-around px-2 safe-bottom" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 px-4 text-[#b9bbbe] active:text-white min-w-[56px] min-h-[56px] justify-center"
        >
          <Icon name="Hash" size={22} />
          <span className="text-[10px]">Каналы</span>
        </button>

        {user ? (
          <button
            onClick={handleOpenDM}
            className="relative flex flex-col items-center gap-0.5 py-2 px-4 text-[#b9bbbe] active:text-white min-w-[56px] min-h-[56px] justify-center"
          >
            <Icon name="MessageCircle" size={22} />
            <span className="text-[10px]">Сообщения</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-2 min-w-[16px] h-[16px] bg-[#ed4245] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex flex-col items-center gap-0.5 py-2 px-4 text-[#b9bbbe] active:text-white min-w-[56px] min-h-[56px] justify-center"
          >
            <Icon name="LogIn" size={22} />
            <span className="text-[10px]">Войти</span>
          </button>
        )}

        {user ? (
          <button
            onClick={() => setShowSettings(true)}
            className="flex flex-col items-center gap-0.5 py-2 px-4 text-[#b9bbbe] active:text-white min-w-[56px] min-h-[56px] justify-center"
          >
            <Icon name="Settings" size={22} />
            <span className="text-[10px]">Профиль</span>
          </button>
        ) : (
          <button
            onClick={() => setShowRegModal(true)}
            className="flex flex-col items-center gap-0.5 py-2 px-4 text-[#5865f2] min-w-[56px] min-h-[56px] justify-center"
          >
            <Icon name="UserPlus" size={22} />
            <span className="text-[10px] font-medium">Регистрация</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Index;

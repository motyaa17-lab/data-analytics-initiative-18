import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import ChannelsSidebar from "@/components/ChannelsSidebar";
import ChatArea from "@/components/ChatArea";
import RegisterModal from "@/components/RegisterModal";
import LoginModal from "@/components/LoginModal";
import AdminPanel from "@/components/AdminPanel";
import DirectMessages from "@/components/DirectMessages";
import { useAuth } from "@/hooks/useAuth";
import Icon from "@/components/ui/icon";

const Index = () => {
  const { user, token, login, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDM, setShowDM] = useState(false);
  const [activeChannel, setActiveChannel] = useState("general");
  const [activeRoomId, setActiveRoomId] = useState<number | undefined>();
  const [activeRoomName, setActiveRoomName] = useState<string | undefined>();

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
    <div className="h-screen bg-[#36393f] text-white flex flex-col overflow-hidden">
      {showRegModal && <RegisterModal onClose={() => setShowRegModal(false)} />}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onSuccess={login} onRegisterClick={() => setShowRegModal(true)} />
      )}
      {showAdmin && token && <AdminPanel token={token} onClose={() => setShowAdmin(false)} />}
      {showDM && user && token && <DirectMessages user={user} token={token} onClose={() => setShowDM(false)} />}

      <Navbar onRegisterClick={() => setShowRegModal(true)} onLoginClick={() => setShowLoginModal(true)} user={user} />

      <div className="flex flex-1 min-h-0">
        <div className="flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 flex-shrink-0">
          <div className="w-12 h-12 bg-[#5865f2] rounded-2xl flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div className="w-8 h-[2px] bg-[#36393f] rounded-full"></div>
          {user && (
            <button
              className="w-12 h-12 bg-[#2f3136] hover:bg-[#5865f2] rounded-2xl flex items-center justify-center transition-all duration-200 group"
              onClick={() => setShowDM(true)}
              title="Личные сообщения"
            >
              <Icon name="MessageCircle" size={22} className="text-[#b9bbbe] group-hover:text-white transition-colors" />
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-w-0">
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
            onDMClick={() => setShowDM(true)}
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
    </div>
  );
};

export default Index;
import { useState, useEffect, useRef } from "react";
import { User } from "@/hooks/useAuth";
import DMChat from "@/components/dm/DMChat";
import DMFriendsList from "@/components/dm/DMFriendsList";
import {
  Friend, FriendRequest, DMessage, DMContextMenu, Tab,
  apiFriends, apiSendFriendReq, apiRespondReq, apiGetDM, apiSendDM,
  authHeaders, BASE, getSeenMap, markSeen,
} from "@/components/dm/dmTypes";

interface Props {
  user: User;
  token: string;
  onClose: () => void;
  seenKey?: string;
}

export default function DirectMessages({ user, token, onClose, seenKey = "frikords_dm_seen" }: Props) {
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [unreadPerFriend, setUnreadPerFriend] = useState<Record<number, number>>({});
  const [addUsername, setAddUsername] = useState("");
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<DMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [dmContextMenu, setDmContextMenu] = useState<DMContextMenu | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uid = (user as unknown as { id: number }).id;

  const isAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMsgCount(0);
  };

  const loadFriends = async () => {
    const data = await apiFriends("list", token);
    if (!data.friends) return;
    setFriends(data.friends);
    const seen = getSeenMap(seenKey);
    const counts: Record<number, number> = {};
    await Promise.all(
      data.friends.map(async (f: Friend) => {
        const d = await apiGetDM(f.id, token);
        if (!d.messages?.length) return;
        const seenId = seen[String(f.id)] || 0;
        counts[f.id] = d.messages.filter((m: DMessage) => m.id > seenId && m.username !== user.username).length;
      })
    );
    setUnreadPerFriend(counts);
  };

  const loadRequests = async () => {
    const data = await apiFriends("requests", token);
    if (data.requests) setRequests(data.requests);
  };

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  useEffect(() => {
    if (!activeFriend) return;
    setNewMsgCount(0);
    const load = async (isFirst = false) => {
      const data = await apiGetDM(activeFriend.id, token);
      if (data.messages) {
        setMessages(prev => {
          const msgs: DMessage[] = data.messages;
          if (!isFirst && msgs.length > prev.length) {
            const newOnes = msgs.slice(prev.length).filter((m: DMessage) => m.username !== user.username);
            if (newOnes.length > 0 && !isAtBottom()) {
              setNewMsgCount(c => c + newOnes.length);
            } else if (isAtBottom()) {
              setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            }
          }
          return msgs;
        });
        if (data.messages.length > 0) {
          markSeen(seenKey, activeFriend.id, data.messages[data.messages.length - 1].id);
        }
        if (isFirst) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 50);
        }
      }
    };
    load(true);
    pollRef.current = setInterval(() => load(false), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeFriend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAdd = async () => {
    if (!addUsername.trim()) return;
    setLoading(true);
    setAddStatus(null);
    const data = await apiSendFriendReq(addUsername.trim(), token);
    setLoading(false);
    if (data.ok) {
      setAddStatus("✓ Запрос отправлен!");
      setAddUsername("");
    } else {
      setAddStatus(data.error || "Ошибка");
    }
  };

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    await apiRespondReq(req.request_id, accept, token);
    setRequests(r => r.filter(x => x.request_id !== req.request_id));
    if (accept) loadFriends();
  };

  const handleSend = async () => {
    if (!msgText.trim() || !activeFriend) return;
    const text = msgText.trim();
    setMsgText("");
    const data = await apiSendDM(activeFriend.id, text, token);
    if (data.message) setMessages(m => [...m, data.message]);
  };

  const handleDeleteDM = async (msgId: number) => {
    const res = await fetch(`${BASE}?action=delete_dm`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ msg_id: msgId }),
    });
    const data = await res.json();
    if (data.ok) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_removed: true, content: "" } : m));
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (activeFriend) {
    return (
      <DMChat
        user={user}
        token={token}
        uid={uid}
        activeFriend={activeFriend}
        messages={messages}
        msgText={msgText}
        newMsgCount={newMsgCount}
        dmContextMenu={dmContextMenu}
        profileUsername={profileUsername}
        scrollContainerRef={scrollContainerRef}
        messagesEndRef={messagesEndRef}
        onBack={() => setActiveFriend(null)}
        onClose={onClose}
        onMsgTextChange={setMsgText}
        onSend={handleSend}
        onKey={handleKey}
        onScrollToBottom={scrollToBottom}
        onSetContextMenu={setDmContextMenu}
        onSetProfileUsername={setProfileUsername}
        onDeleteDM={handleDeleteDM}
        setMessages={setMessages}
      />
    );
  }

  return (
    <DMFriendsList
      tab={tab}
      friends={friends}
      requests={requests}
      unreadPerFriend={unreadPerFriend}
      addUsername={addUsername}
      addStatus={addStatus}
      loading={loading}
      onClose={onClose}
      onSetTab={t => { setTab(t); setAddStatus(null); }}
      onOpenFriend={f => { setActiveFriend(f); setUnreadPerFriend(prev => ({ ...prev, [f.id]: 0 })); }}
      onRespond={handleRespond}
      onAddUsernameChange={setAddUsername}
      onAdd={handleAdd}
    />
  );
}

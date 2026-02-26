import { useState, useEffect, useRef, useCallback } from "react";
import { User } from "@/hooks/useAuth";
import DMChat from "@/components/dm/DMChat";
import DMFriendsList from "@/components/dm/DMFriendsList";
import CallModal, { CallInfo, CallSignal } from "@/components/dm/CallModal";
import {
  Friend, FriendRequest, DMessage, DMContextMenu, Tab,
  apiFriends, apiSendFriendReq, apiRespondReq, apiGetDM, apiSendDM,
  authHeaders, BASE, getSeenMap, markSeen,
} from "@/components/dm/dmTypes";
import { api } from "@/lib/api";

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
  const [activeCall, setActiveCall] = useState<CallInfo | null>(null);
  const [friendTyping, setFriendTyping] = useState(false);
  const [pendingSignals, setPendingSignals] = useState<CallSignal[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallRef = useRef<CallInfo | null>(null);
  const friendsRef = useRef<Friend[]>([]);

  // Синхронизируем refs
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { friendsRef.current = friends; }, [friends]);

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

  const pollCallSignals = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}?action=call_signal`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!data.signals?.length) return;

      const signals: CallSignal[] = data.signals;

      if (activeCallRef.current) {
        // Есть активный звонок — передаём сигналы в CallModal
        setPendingSignals(signals);
      } else {
        // Нет звонка — ищем входящий вызов
        const callSig = signals.find(s => s.type === "call");
        if (callSig) {
          const caller = friendsRef.current.find(f => f.id === callSig.from_user_id);
          if (caller) {
            // Сохраняем остальные сигналы (offer может уже прийти вместе с call)
            const rest = signals.filter(s => s.id !== callSig.id);
            if (rest.length) setPendingSignals(rest);
            setActiveCall({ friendId: caller.id, friendName: caller.username, state: "incoming" });
          }
        }
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  useEffect(() => {
    callPollRef.current = setInterval(pollCallSignals, 800);
    return () => { if (callPollRef.current) clearInterval(callPollRef.current); };
  }, [pollCallSignals]);

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

    const checkTyping = async () => {
      const data = await api.typing.get(token, undefined, activeFriend.id);
      setFriendTyping(Array.isArray(data.typing) && data.typing.length > 0);
    };
    checkTyping();
    typingPollRef.current = setInterval(checkTyping, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (typingPollRef.current) clearInterval(typingPollRef.current);
      setFriendTyping(false);
    };
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

  const handleStartCall = () => {
    if (!activeFriend) return;
    setActiveCall({ friendId: activeFriend.id, friendName: activeFriend.username, state: "calling" });
  };

  const handleVoiceSendDM = async (blob: Blob, ext: string) => {
    if (!activeFriend) return;
    const arrayBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    bytes.forEach(b => binary += String.fromCharCode(b));
    const b64 = btoa(binary);
    const upRes = await fetch(`${BASE}?action=upload_voice`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ audio: b64, ext }),
    }).then(r => r.json());
    if (!upRes.url) return;
    const data = await apiSendDM(activeFriend.id, "", token, upRes.url);
    if (data.message) setMessages(m => [...m, data.message]);
  };

  if (activeFriend) {
    return (
      <>
        {activeCall && (
          <CallModal
            call={activeCall}
            token={token}
            userId={uid}
            username={user.username}
            onEnd={() => { setActiveCall(null); setPendingSignals([]); }}
            externalSignals={pendingSignals}
            onSignalsProcessed={() => setPendingSignals([])}
          />
        )}
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
          onVoiceSend={handleVoiceSendDM}
          onCall={handleStartCall}
          typingUser={friendTyping}
        />
      </>
    );
  }

  return (
    <>
      {activeCall && (
        <CallModal
          call={activeCall}
          token={token}
          userId={uid}
          username={user.username}
          onEnd={() => { setActiveCall(null); setPendingSignals([]); }}
          externalSignals={pendingSignals}
          onSignalsProcessed={() => setPendingSignals([])}
        />
      )}
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
    </>
  );
}
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { avatarColor, BASE, authHeaders } from "@/components/dm/dmTypes";

export type CallState = "idle" | "calling" | "incoming" | "active" | "ended";

export interface CallInfo {
  friendId: number;
  friendName: string;
  state: CallState;
}

interface Props {
  call: CallInfo;
  token: string;
  userId: number;
  username: string;
  onEnd: () => void;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export default function CallModal({ call, token, userId, username, onEnd }: Props) {
  const [state, setState] = useState<CallState>(call.state);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [micLevel, setMicLevel] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);
  const endedRef = useRef(false);

  const savedMicId = localStorage.getItem("frikords_mic_id") || undefined;

  const sendSignal = useCallback(async (type: string, payload: string = "") => {
    await fetch(`${BASE}?action=call_signal`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ to: call.friendId, type, payload }),
    });
  }, [token, call.friendId]);

  const cleanup = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    if (durationRef.current) clearInterval(durationRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    setState("ended");
    setTimeout(onEnd, 1500);
  }, [onEnd]);

  const startMicMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const tick = () => {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      setMicLevel(Math.min(100, (avg / 128) * 100 * 3));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: savedMicId ? { deviceId: { exact: savedMicId } } : true,
    });
    localStreamRef.current = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    startMicMeter(stream);

    const audio = new Audio();
    audio.autoplay = true;
    remoteAudioRef.current = audio;

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal("ice", JSON.stringify(e.candidate));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setState("active");
        durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        if (!endedRef.current) cleanup();
      }
    };

    return pc;
  }, [savedMicId, sendSignal, startMicMeter, cleanup]);

  const startCall = useCallback(async () => {
    setState("calling");
    await sendSignal("call");
    const pc = await createPC();

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await sendSignal("offer", JSON.stringify(offer));
  }, [sendSignal, createPC]);

  const answerCall = useCallback(async (offerSdp: string) => {
    const pc = await createPC();
    const offer = JSON.parse(offerSdp);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("answer", JSON.stringify(answer));
    setState("active");
    durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, [createPC, sendSignal]);

  const handleSignals = useCallback(async (signals: { id: number; from_user_id: number; type: string; payload: string }[]) => {
    for (const sig of signals) {
      if (sig.from_user_id !== call.friendId) continue;
      const pc = pcRef.current;

      if (sig.type === "answer" && pc) {
        const answer = JSON.parse(sig.payload);
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          setState("active");
          durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
      } else if (sig.type === "ice" && pc && pc.remoteDescription) {
        const candidate = JSON.parse(sig.payload);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else if (sig.type === "hangup" || sig.type === "reject" || sig.type === "busy") {
        cleanup();
      } else if (sig.type === "offer" && state === "incoming") {
        await answerCall(sig.payload);
      }
    }
  }, [call.friendId, state, cleanup, answerCall]);

  const pollSignals = useCallback(async () => {
    const res = await fetch(`${BASE}?action=call_signal`, { headers: authHeaders(token) });
    const data = await res.json();
    if (data.signals?.length) await handleSignals(data.signals);
  }, [token, handleSignals]);

  useEffect(() => {
    endedRef.current = false;
    if (call.state === "calling") {
      startCall();
    }
    pollRef.current = setInterval(pollSignals, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleHangup = async () => {
    await sendSignal("hangup");
    cleanup();
  };

  const handleAccept = async () => {
    setState("connecting" as CallState);
    const res = await fetch(`${BASE}?action=call_signal`, { headers: authHeaders(token) });
    const data = await res.json();
    const offerSig = data.signals?.find((s: { from_user_id: number; type: string; payload: string }) => s.from_user_id === call.friendId && s.type === "offer");
    if (offerSig) {
      await answerCall(offerSig.payload);
    } else {
      const pc = await createPC();
      pollRef.current = setInterval(async () => {
        const r = await fetch(`${BASE}?action=call_signal`, { headers: authHeaders(token) });
        const d = await r.json();
        const offer = d.signals?.find((s: { from_user_id: number; type: string; payload: string }) => s.from_user_id === call.friendId && s.type === "offer");
        if (offer) {
          if (pollRef.current) clearInterval(pollRef.current);
          await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer.payload)));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", JSON.stringify(answer));
          setState("active");
          durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
          pollRef.current = setInterval(pollSignals, 1000);
        }
      }, 800);
    }
  };

  const handleReject = async () => {
    await sendSignal("reject");
    cleanup();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const next = !muted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
      setMuted(next);
    }
  };

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const bg = avatarColor(call.friendName);
  const initials = call.friendName[0]?.toUpperCase();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-80 bg-[#2f3136] rounded-2xl shadow-2xl overflow-hidden flex flex-col items-center py-8 px-6 gap-5">

        {/* Avatar with pulse ring */}
        <div className="relative">
          {(state === "calling" || state === "incoming") && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: bg, animationDuration: "1.5s" }} />
              <div className="absolute inset-0 rounded-full animate-ping opacity-10" style={{ background: bg, animationDuration: "2s", animationDelay: "0.5s" }} />
            </>
          )}
          {state === "active" && (
            <div
              className="absolute inset-0 rounded-full transition-all duration-100"
              style={{
                background: bg,
                opacity: 0.2,
                transform: `scale(${1 + micLevel / 250})`,
              }}
            />
          )}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl relative z-10"
            style={{ background: bg }}
          >
            {initials}
          </div>
        </div>

        {/* Name & status */}
        <div className="text-center">
          <div className="text-white font-semibold text-lg">{call.friendName}</div>
          <div className="text-[#b9bbbe] text-sm mt-0.5">
            {state === "calling" && "Вызов..."}
            {state === "incoming" && "Входящий звонок"}
            {(state as string) === "connecting" && "Соединение..."}
            {state === "active" && (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3ba55c] animate-pulse inline-block" />
                {fmtDur(duration)}
              </span>
            )}
            {state === "ended" && "Звонок завершён"}
          </div>
        </div>

        {/* Mic level bar (active only) */}
        {state === "active" && (
          <div className="w-full flex flex-col gap-1.5">
            <div className="h-1.5 bg-[#40444b] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: muted ? "0%" : `${micLevel}%`,
                  background: micLevel > 70 ? "#ed4245" : micLevel > 40 ? "#faa81a" : "#3ba55c",
                }}
              />
            </div>
            {muted && (
              <div className="flex items-center justify-center gap-1.5">
                <Icon name="MicOff" size={12} className="text-[#ed4245]" />
                <span className="text-[#ed4245] text-xs font-medium">Микрофон выключен</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {state === "incoming" && (
          <div className="flex gap-6 mt-2">
            <button
              onClick={handleReject}
              className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg"
              title="Отклонить"
            >
              <Icon name="PhoneOff" size={22} className="text-white" />
            </button>
            <button
              onClick={handleAccept}
              className="w-14 h-14 rounded-full bg-[#3ba55c] hover:bg-[#2d8c4e] flex items-center justify-center transition-colors shadow-lg"
              title="Принять"
            >
              <Icon name="Phone" size={22} className="text-white" />
            </button>
          </div>
        )}

        {(state === "calling" || (state as string) === "connecting") && (
          <button
            onClick={handleHangup}
            className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg mt-2"
            title="Отменить"
          >
            <Icon name="PhoneOff" size={22} className="text-white" />
          </button>
        )}

        {state === "active" && (
          <div className="flex gap-4 mt-2">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow ${
                muted ? "bg-[#ed4245] hover:bg-[#c03537]" : "bg-[#40444b] hover:bg-[#52565e]"
              }`}
              title={muted ? "Включить микрофон" : "Выключить микрофон"}
            >
              <Icon name={muted ? "MicOff" : "Mic"} size={20} className="text-white" />
            </button>
            <button
              onClick={handleHangup}
              className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg"
              title="Завершить"
            >
              <Icon name="PhoneOff" size={22} className="text-white" />
            </button>
          </div>
        )}

        {state === "ended" && (
          <div className="text-[#72767d] text-sm">Закрывается...</div>
        )}
      </div>
    </div>
  );
}
import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { avatarColor, BASE, authHeaders } from "@/components/dm/dmTypes";

export type CallState = "idle" | "calling" | "incoming" | "active" | "ended";

export interface CallInfo {
  friendId: number;
  friendName: string;
  state: CallState;
}

export interface CallSignal {
  id: number;
  from_user_id: number;
  type: string;
  payload: string;
}

interface Props {
  call: CallInfo;
  token: string;
  userId: number;
  username: string;
  onEnd: () => void;
  externalSignals?: CallSignal[];
  onSignalsProcessed?: () => void;
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:global.relay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:global.relay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export default function CallModal({ call, token, userId, username, onEnd, externalSignals, onSignalsProcessed }: Props) {
  const [state, setState] = useState<CallState>(call.state);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [micLevel, setMicLevel] = useState(0);

  // Все WebRTC refs — никаких stale closures
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const iceCandidateQueueRef = useRef<RTCIceCandidate[]>([]);
  const hasRemoteDescRef = useRef(false);
  const stateRef = useRef<CallState>(call.state);

  const savedMicId = localStorage.getItem("frikords_mic_id") || undefined;

  const setStateSync = (s: CallState) => {
    stateRef.current = s;
    setState(s);
  };

  const sendSignal = useCallback(async (type: string, payload: string = "") => {
    try {
      await fetch(`${BASE}?action=call_signal`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ to: call.friendId, type, payload }),
      });
    } catch { /* ignore */ }
  }, [token, call.friendId]);

  const cleanup = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    if (durationRef.current) clearInterval(durationRef.current);
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    setStateSync("ended");
    setTimeout(onEnd, 1500);
  }, [onEnd]);

  const startMicMeter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const tick = () => {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      setMicLevel(Math.min(100, (buf.reduce((a, b) => a + b, 0) / buf.length / 128) * 300));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // Применяем накопленные ICE кандидаты после setRemoteDescription
  const flushIceQueue = async (pc: RTCPeerConnection) => {
    const q = iceCandidateQueueRef.current;
    iceCandidateQueueRef.current = [];
    for (const c of q) {
      try { await pc.addIceCandidate(c); } catch { /* ignore */ }
    }
  };

  const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    hasRemoteDescRef.current = false;
    iceCandidateQueueRef.current = [];

    const audioConstraints: MediaTrackConstraints | boolean =
      savedMicId ? { deviceId: { ideal: savedMicId } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    localStreamRef.current = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    startMicMeter(stream);

    const audio = new Audio();
    audio.autoplay = true;
    remoteAudioRef.current = audio;

    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal("ice", JSON.stringify(e.candidate));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] iceState:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        setStateSync("active");
        if (!durationRef.current) durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } else if (pc.iceConnectionState === "failed") {
        console.log("[WebRTC] ICE failed, restarting...");
        pc.restartIce();
      } else if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (!endedRef.current && pc.iceConnectionState === "disconnected") cleanup();
        }, 5000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] connState:", pc.connectionState);
      if (pc.connectionState === "connected") {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        setStateSync("active");
        if (!durationRef.current) durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (!endedRef.current) cleanup();
      }
    };

    return pc;
  }, [savedMicId, sendSignal, cleanup]);

  const startCall = useCallback(async () => {
    setStateSync("calling");
    await sendSignal("call");
    const pc = await createPC();
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await sendSignal("offer", JSON.stringify(offer));

    connectTimeoutRef.current = setTimeout(() => {
      if (!endedRef.current) cleanup();
    }, 45000);
  }, [sendSignal, createPC, cleanup]);

  const answerCall = useCallback(async (offerSdp: string) => {
    const pc = pcRef.current || await createPC();
    if (pc.signalingState !== "stable") return;

    const offer = JSON.parse(offerSdp);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    hasRemoteDescRef.current = true;
    await flushIceQueue(pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("answer", JSON.stringify(answer));

    connectTimeoutRef.current = setTimeout(() => {
      if (!endedRef.current) cleanup();
    }, 45000);
  }, [createPC, sendSignal, cleanup]);

  // Обработка массива сигналов — вынесена отдельно чтобы использовать и из polling, и из externalSignals
  const processSignals = useCallback(async (signals: CallSignal[]) => {
    if (endedRef.current) return;
    for (const sig of signals) {
      if (sig.from_user_id !== call.friendId) continue;
      const pc = pcRef.current;
      const curState = stateRef.current;

      if (sig.type === "answer" && pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sig.payload)));
        hasRemoteDescRef.current = true;
        await flushIceQueue(pc);

      } else if (sig.type === "ice") {
        const candidate = new RTCIceCandidate(JSON.parse(sig.payload));
        if (pc && hasRemoteDescRef.current) {
          try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
        } else {
          iceCandidateQueueRef.current.push(candidate);
        }

      } else if (sig.type === "hangup" || sig.type === "reject" || sig.type === "busy") {
        cleanup();

      } else if (sig.type === "offer" && (curState === "incoming" || curState === "calling" || (curState as string) === "connecting")) {
        await answerCall(sig.payload);
      }
    }
  }, [call.friendId, cleanup, answerCall]);

  const pollSignals = useCallback(async () => {
    if (endedRef.current) return;
    try {
      const res = await fetch(`${BASE}?action=call_signal`, { headers: authHeaders(token) });
      const data = await res.json();
      if (data.signals?.length) await processSignals(data.signals);
    } catch { /* ignore */ }
  }, [token, processSignals]);

  useEffect(() => {
    endedRef.current = false;
    if (call.state === "calling") startCall();
    // Если нет внешнего источника сигналов — используем внутренний polling
    if (!externalSignals) {
      pollRef.current = setInterval(pollSignals, 800);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Обрабатываем внешние сигналы (из DirectMessages) и сразу сбрасываем
  useEffect(() => {
    if (externalSignals && externalSignals.length > 0) {
      processSignals(externalSignals);
      onSignalsProcessed?.();
    }
  }, [externalSignals]);

  const handleHangup = async () => {
    await sendSignal("hangup");
    cleanup();
  };

  const handleAccept = async () => {
    setStateSync("connecting" as CallState);
    // Сразу забираем сигналы — offer мог уже прийти
    await pollSignals();
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
          {(state === "calling" || state === "incoming" || (state as string) === "connecting") && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: bg, animationDuration: "1.5s" }} />
              <div className="absolute inset-0 rounded-full animate-ping opacity-10" style={{ background: bg, animationDuration: "2s", animationDelay: "0.5s" }} />
            </>
          )}
          {state === "active" && (
            <div
              className="absolute inset-0 rounded-full transition-all duration-100"
              style={{ background: bg, opacity: 0.2, transform: `scale(${1 + micLevel / 250})` }}
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

        {/* Mic level bar */}
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
            <button onClick={handleReject} className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg" title="Отклонить">
              <Icon name="PhoneOff" size={22} className="text-white" />
            </button>
            <button onClick={handleAccept} className="w-14 h-14 rounded-full bg-[#3ba55c] hover:bg-[#2d8c4e] flex items-center justify-center transition-colors shadow-lg" title="Принять">
              <Icon name="Phone" size={22} className="text-white" />
            </button>
          </div>
        )}

        {(state === "calling" || (state as string) === "connecting") && (
          <button onClick={handleHangup} className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg mt-2" title="Отменить">
            <Icon name="PhoneOff" size={22} className="text-white" />
          </button>
        )}

        {state === "active" && (
          <div className="flex gap-4 mt-2">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow ${muted ? "bg-[#ed4245] hover:bg-[#c03537]" : "bg-[#40444b] hover:bg-[#52565e]"}`}
              title={muted ? "Включить микрофон" : "Выключить микрофон"}
            >
              <Icon name={muted ? "MicOff" : "Mic"} size={20} className="text-white" />
            </button>
            <button onClick={handleHangup} className="w-14 h-14 rounded-full bg-[#ed4245] hover:bg-[#c03537] flex items-center justify-center transition-colors shadow-lg" title="Завершить">
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
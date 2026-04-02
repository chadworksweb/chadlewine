"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type Phase = "intro" | "ready" | "recording" | "preview" | "sending" | "sent";

interface VoiceMachineProps {
  introSrc?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MAX_DURATION = 180; // 3 minutes

export function VoiceMachine({ introSrc }: VoiceMachineProps) {
  const [phase, setPhase] = useState<Phase>(introSrc ? "intro" : "ready");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const introRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

  function playIntro() {
    const audio = introRef.current;
    if (!audio) return;
    audio.play();
    audio.onended = () => setPhase("ready");
  }

  function skipIntro() {
    const audio = introRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPhase("ready");
  }

  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setBlob(recorded);
        const url = URL.createObjectURL(recorded);
        setPreviewUrl(url);
        setPhase("preview");
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000); // 1s chunks
      setPhase("recording");
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev >= MAX_DURATION - 1) {
            recorder.stop();
            if (timerRef.current) clearInterval(timerRef.current);
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access denied. Check your browser permissions.");
    }
  }, []);

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  function discardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
    setPhase("ready");
  }

  async function sendRecording() {
    if (!blob) return;
    setPhase("sending");
    setError("");

    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    const fd = new FormData();
    fd.append("file", blob, `message.${ext}`);
    fd.append("duration_seconds", String(Math.round(elapsed)));

    const res = await fetch("/api/voice-message", { method: "POST", body: fd });

    if (res.ok) {
      setPhase("sent");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setBlob(null);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to send. Try again.");
      setPhase("preview");
    }
  }

  return (
    <div className="voice-machine">
      {introSrc && <audio ref={introRef} src={introSrc} preload="auto" />}

      {error && <p className="voice-machine__error">{error}</p>}

      {/* Phase: Intro */}
      {phase === "intro" && (
        <div className="voice-machine__phase">
          <p className="voice-machine__text">Before you record, listen to this.</p>
          <div className="voice-machine__actions">
            <button className="voice-machine__btn voice-machine__btn--primary" onClick={playIntro}>
              Play Intro
            </button>
            <button className="voice-machine__btn voice-machine__btn--secondary" onClick={skipIntro}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Phase: Ready */}
      {phase === "ready" && (
        <div className="voice-machine__phase">
          <p className="voice-machine__text">
            Record a voice message. Up to 3 minutes. Say what you need — I&rsquo;ll listen.
          </p>
          <button className="voice-machine__btn voice-machine__btn--record" onClick={startRecording}>
            <span className="voice-machine__record-dot" />
            Record
          </button>
        </div>
      )}

      {/* Phase: Recording */}
      {phase === "recording" && (
        <div className="voice-machine__phase">
          <div className="voice-machine__recording-indicator">
            <span className="voice-machine__record-dot voice-machine__record-dot--active" />
            <span className="voice-machine__timer">{formatTime(elapsed)}</span>
            <span className="voice-machine__timer-max">/ {formatTime(MAX_DURATION)}</span>
          </div>
          <button className="voice-machine__btn voice-machine__btn--stop" onClick={stopRecording}>
            Stop
          </button>
        </div>
      )}

      {/* Phase: Preview */}
      {phase === "preview" && previewUrl && (
        <div className="voice-machine__phase">
          <p className="voice-machine__text">
            Review your message ({formatTime(elapsed)})
          </p>
          <audio controls src={previewUrl} style={{ width: "100%", marginBottom: "var(--space-md)" }} />
          <div className="voice-machine__actions">
            <button className="voice-machine__btn voice-machine__btn--primary" onClick={sendRecording}>
              Send
            </button>
            <button className="voice-machine__btn voice-machine__btn--secondary" onClick={discardRecording}>
              Re-record
            </button>
          </div>
        </div>
      )}

      {/* Phase: Sending */}
      {phase === "sending" && (
        <div className="voice-machine__phase">
          <p className="voice-machine__text">Sending...</p>
        </div>
      )}

      {/* Phase: Sent */}
      {phase === "sent" && (
        <div className="voice-machine__phase">
          <p className="voice-machine__text">
            Received. If there&rsquo;s something there, you&rsquo;ll hear back.
          </p>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechRecognitionStatus = "idle" | "listening" | "error";

interface UseSpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onFinal?: (text: string) => void;
}

export function getSpeechRecognitionCtor(): { new (): SpeechRecognition } | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { language = "en-IN", continuous = true, interimResults = true, onFinal } = opts;
  const Ctor = getSpeechRecognitionCtor();
  const supported = !!Ctor;
  const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);

  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recogRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // SpeechRecognition hardening:
  // - isRecordingRef: prevent concurrent instances (mobile Chrome can spawn dupes)
  // - shouldRestartRef: desktop-only restart on benign engine endings
  // - mobileTranscriptRef + lastProcessedResultIndexRef: append only new mobile finals
  // - lastFinalRef + lastFinalAtRef: suppress duplicate final results fired by mobile engine
  const isRecordingRef = useRef(false);
  const shouldRestartRef = useRef(false);
  const mobileTranscriptRef = useRef("");
  const processedIndicesRef = useRef<Set<number>>(new Set());
  const lastFinalRef = useRef<string>("");
  const lastFinalAtRef = useRef<number>(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    stopTimer();
    setListening(false);
    setInterimTranscript("");
  }, []);

  const stop = useCallback(() => {
    // User-initiated stop: disable auto-restart first so onend doesn't re-spawn
    shouldRestartRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recogRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    if (!Ctor) {
      setError("Voice input not supported in this browser");
      return;
    }
    // Single-instance guard: ignore duplicate start() calls while a recognizer is live
    if (isRecordingRef.current) {
      return;
    }
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch { /* ignore */ }
    }
    setError(null);
    setInterimTranscript("");
    setElapsedMs(0);
    mobileTranscriptRef.current = "";
    processedIndicesRef.current = new Set();
    lastFinalRef.current = "";
    lastFinalAtRef.current = 0;
    shouldRestartRef.current = true;

    const recog = new Ctor();
    recog.lang = language;
    // Mobile: continuous=false per browser quirks; desktop keeps caller's setting.
    recog.continuous = isMobile ? false : continuous;
    recog.interimResults = interimResults;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      isRecordingRef.current = true;
      setListening(true);
      // Only (re)start the timer on the first start of this user session, not on auto-restarts
      if (!startedAtRef.current) {
        startedAtRef.current = Date.now();
      }
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 250);
      }
    };
    recog.onresult = (ev) => {
      if (isMobile) {
        // Mobile: per-index Set dedupe. Never process the same final index twice.
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = r[0]?.transcript || "";
          if (r.isFinal) {
            if (processedIndicesRef.current.has(i)) continue;
            processedIndicesRef.current.add(i);
            const trimmed = text.trim();
            if (!trimmed) continue;
            const sep = mobileTranscriptRef.current && !mobileTranscriptRef.current.endsWith(" ") ? " " : "";
            mobileTranscriptRef.current = `${mobileTranscriptRef.current}${sep}${trimmed}`;
            setInterimTranscript("");
            onFinalRef.current?.(trimmed);
          } else {
            interim += text;
          }
        }
        if (interim) setInterimTranscript(interim);
        return;
      }

      // Desktop: original flow unchanged.
      let interim = "";
      let finalChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const text = r[0]?.transcript || "";
        if (r.isFinal) finalChunk += text;
        else interim += text;
      }
      if (interim) setInterimTranscript(interim);
      if (finalChunk) {
        setInterimTranscript("");
        const trimmed = finalChunk.trim();
        const now = Date.now();
        if (trimmed && (trimmed !== lastFinalRef.current || now - lastFinalAtRef.current > 800)) {
          lastFinalRef.current = trimmed;
          lastFinalAtRef.current = now;
          onFinalRef.current?.(trimmed);
        }
      }
    };
    recog.onerror = (ev) => {
      const err = ev.error || "Voice error";
      // Benign errors are followed by onend auto-restart on both platforms.
      // Dedupe guards (lastProcessedResultIndexRef + lastFinalRef window) prevent duplicates.
      if (err === "no-speech" || err === "aborted" || err === "network") {
        return;
      }
      // Hard errors: stop for good
      shouldRestartRef.current = false;
      setError(err);
      isRecordingRef.current = false;
      startedAtRef.current = 0;
      cleanup();
    };
    recog.onend = () => {
      isRecordingRef.current = false;
      // Auto-restart on benign engine endings on both desktop and mobile so interim
      // transcript streams live. User-initiated stop() sets shouldRestartRef = false first.
      if (shouldRestartRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!shouldRestartRef.current) return;
          try {
            recog.start();
          } catch {
            // InvalidStateError or engine refused — rebuild a fresh recognizer
            try {
              recogRef.current = null;
              isRecordingRef.current = false;
              // Re-invoke start() to construct a new instance with the same handlers
              start();
            } catch {
              shouldRestartRef.current = false;
              startedAtRef.current = 0;
              cleanup();
            }
          }
        }, 150);
        return;
      }
      // True stop (user clicked stop or hard error)
      shouldRestartRef.current = false;
      startedAtRef.current = 0;
      cleanup();
    };

    recogRef.current = recog;
    try {
      recog.start();
    } catch (e: any) {
      shouldRestartRef.current = false;
      isRecordingRef.current = false;
      startedAtRef.current = 0;
      setError(e?.message || "Could not start voice input");
      cleanup();
    }
  }, [Ctor, language, continuous, interimResults, cleanup, isMobile]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      stopTimer();
      try { recogRef.current?.abort(); } catch { /* ignore */ }
    };
  }, []);

  return { supported, listening, interimTranscript, elapsedMs, error, start, stop };
}

export function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
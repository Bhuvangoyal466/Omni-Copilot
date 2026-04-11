"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Mic, MicOff, Sparkles, WandSparkles, X } from "lucide-react";

import { createId } from "@/lib/utils";
import { useAppStore } from "@/lib/store/app-store";

type StreamEvent = {
  event: string;
  data: unknown;
};

type VoiceStep = {
  id: string;
  agent: string;
  message: string;
  status: "running" | "completed" | "failed";
};

type VoiceLanguageMode = "auto" | "english" | "hindi";
type VoiceGender = "female" | "male";
type VoicePlaybackMode = "low-latency" | "studio";

type TtsResponse = {
  ok?: boolean;
  audioBase64?: string;
  mimeType?: string;
};

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function parseSseChunk(raw: string): StreamEvent[] {
  const packets = raw.split("\n\n").filter(Boolean);
  const events: StreamEvent[] = [];

  for (const packet of packets) {
    const lines = packet.split("\n");
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const text = dataLines.join("\n");
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    events.push({ event, data });
  }

  return events;
}

function detectLanguage(text: string) {
  if (/[\u0900-\u097F]/.test(text)) {
    return "hi";
  }

  const lowered = text.toLowerCase();
  const hindiHints = ["hai", "kya", "kar", "kr", "mera", "mujhe", "nahi", "haan"];
  const words = lowered.split(/[^a-z]+/).filter(Boolean);
  const score = words.filter((token) => hindiHints.includes(token)).length;
  return score >= 2 ? "hi" : "en";
}

function resolveReplyLanguage(command: string, mode: VoiceLanguageMode): "hi" | "en" {
  if (mode === "hindi") {
    return "hi";
  }
  if (mode === "english") {
    return "en";
  }
  return detectLanguage(command) as "hi" | "en";
}

function getRecognitionLocale(mode: VoiceLanguageMode): string {
  if (mode === "hindi") {
    return "hi-IN";
  }
  if (mode === "english") {
    return "en-US";
  }
  return "en-IN";
}

function buildFallbackSpeech(text: string, language: "hi" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "hi" ? "hi-IN" : "en-US";
  utterance.rate = 1.03;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function OmniVoiceLauncher() {
  const selectedModel = useAppStore((s) => s.selectedModel);

  const [isArenaOpen, setIsArenaOpen] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [commandDraft, setCommandDraft] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [steps, setSteps] = useState<VoiceStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiceLanguageMode, setVoiceLanguageMode] = useState<VoiceLanguageMode>("auto");
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("female");
  const [playbackMode, setPlaybackMode] = useState<VoicePlaybackMode>("low-latency");

  const chatIdRef = useRef<string>(createId("voice"));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalTranscriptRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listeningSupported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const addStep = useCallback((agent: string, message: string, status: "running" | "completed" | "failed") => {
    setSteps((prev) => [
      ...prev,
      {
        id: createId("voice-step"),
        agent,
        message,
        status
      }
    ]);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // noop
      }
    }
    clearSilenceTimer();
    setIsListening(false);
  }, [clearSilenceTimer]);

  const playTts = useCallback(
    async (
      text: string,
      sourceCommand: string,
      languageMode: VoiceLanguageMode,
      gender: VoiceGender,
      mode: VoicePlaybackMode
    ) => {
      const lang = resolveReplyLanguage(sourceCommand || text, languageMode);
      let fallbackStarted = false;

      const startFallback = () => {
        if (fallbackStarted) {
          return;
        }
        fallbackStarted = true;
        buildFallbackSpeech(text, lang);
      };

      const fallbackTimer =
        mode === "low-latency"
          ? window.setTimeout(() => {
              startFallback();
            }, 700)
          : null;

      try {
        const response = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: lang, voiceGender: gender })
        });

        if (fallbackTimer !== null) {
          window.clearTimeout(fallbackTimer);
        }

        if (fallbackStarted) {
          return;
        }

        if (!response.ok) {
          startFallback();
          return;
        }

        const payload = (await response.json()) as TtsResponse;
        if (!payload.ok || !payload.audioBase64 || !payload.mimeType) {
          startFallback();
          return;
        }

        const src = `data:${payload.mimeType};base64,${payload.audioBase64}`;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        const audio = new Audio(src);
        audioRef.current = audio;
        await audio.play();
      } catch {
        if (fallbackTimer !== null) {
          window.clearTimeout(fallbackTimer);
        }
        startFallback();
      }
    },
    []
  );

  const runCommand = useCallback(
    async (incomingCommand?: string) => {
      const command = (incomingCommand ?? commandDraft).trim();
      if (!command || isRunning) {
        return;
      }

      clearSilenceTimer();
      setError(null);
      setIsRunning(true);
      setAssistantResponse("");
      setSteps([]);
      setLastCommand(command);
      setCommandDraft(command);

      addStep("VoiceArena", "Voice command captured. Executing automatically.", "running");

      const commandLanguage = resolveReplyLanguage(command, voiceLanguageMode);

      try {
        const languageHint = commandLanguage === "hi" ? "Reply strictly in Hindi." : "Reply strictly in English.";

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatIdRef.current,
            message: `${command}\n\n${languageHint}`,
            model: selectedModel,
            voiceMode: true
          })
        });

        if (!response.ok || !response.body) {
          let messageText = `Voice command failed (${response.status})`;
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) {
              messageText = payload.error;
            }
          } catch {
            // noop
          }
          throw new Error(messageText);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let previewSpeechStarted = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const boundary = buffer.lastIndexOf("\n\n");
          if (boundary === -1) {
            continue;
          }

          const packetText = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const events = parseSseChunk(packetText);
          for (const evt of events) {
            if (evt.event === "token") {
              const token = typeof evt.data === "string" ? evt.data : "";
              assistantText += token;
              setAssistantResponse(assistantText);

              if (
                playbackMode === "low-latency" &&
                !previewSpeechStarted &&
                assistantText.length >= 64 &&
                /[.!?]/.test(assistantText)
              ) {
                buildFallbackSpeech(assistantText, commandLanguage);
                previewSpeechStarted = true;
              }
            }

            if (evt.event === "status" && typeof evt.data === "object" && evt.data !== null) {
              const data = evt.data as {
                agent?: string;
                message?: string;
                status?: "running" | "completed" | "failed";
              };
              if (data.agent && data.message && data.status) {
                addStep(data.agent, data.message, data.status);
              }
            }

            if (evt.event === "error") {
              const errText = typeof evt.data === "string" ? evt.data : "Unknown voice stream error";
              throw new Error(errText);
            }
          }
        }

        if (assistantText.trim()) {
          if (playbackMode === "studio" || !previewSpeechStarted) {
            await playTts(assistantText, command, voiceLanguageMode, voiceGender, playbackMode);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown voice execution error";
        setError(msg);
        addStep("VoiceArena", msg, "failed");
      } finally {
        setIsRunning(false);
      }
    },
    [
      addStep,
      clearSilenceTimer,
      commandDraft,
      isRunning,
      playbackMode,
      playTts,
      selectedModel,
      voiceGender,
      voiceLanguageMode
    ]
  );

  const queueAutoRunAfterSilence = useCallback(
    (draft: string) => {
      clearSilenceTimer();
      const normalizedDraft = draft.trim();
      if (!normalizedDraft || isRunning) {
        return;
      }

      silenceTimerRef.current = setTimeout(() => {
        stopListening();
        void runCommand(normalizedDraft);
      }, 2000);
    },
    [clearSilenceTimer, isRunning, runCommand, stopListening]
  );

  const startListening = useCallback(() => {
    if (!listeningSupported || isListening || isRunning) {
      return;
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    finalTranscriptRef.current = commandDraft.trim();
    const recognition = new RecognitionCtor();
    recognition.lang = getRecognitionLocale(voiceLanguageMode);
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = String(event.results[i][0]?.transcript || "").trim();
        if (!phrase) {
          continue;
        }

        if (event.results[i].isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${phrase}`.trim();
        } else {
          interim = `${interim} ${phrase}`.trim();
        }
      }

      const combined = `${finalTranscriptRef.current} ${interim}`.trim();
      setCommandDraft(combined);
      queueAutoRunAfterSilence(combined);
    };

    recognition.onerror = (event: any) => {
      setError(`Mic error: ${event?.error || "unknown"}`);
      clearSilenceTimer();
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      setError(null);
      queueAutoRunAfterSilence(commandDraft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to start microphone";
      setError(msg);
      setIsListening(false);
    }
  }, [
    clearSilenceTimer,
    commandDraft,
    isListening,
    isRunning,
    listeningSupported,
    queueAutoRunAfterSilence,
    voiceLanguageMode
  ]);

  const openArena = () => {
    setError(null);
    setIsEntering(true);
    window.setTimeout(() => {
      setIsEntering(false);
      setIsArenaOpen(true);
    }, 2000);
  };

  const closeArena = () => {
    stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsArenaOpen(false);
  };

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [clearSilenceTimer]);

  return (
    <>
      <motion.button
        onClick={openArena}
        className="fixed bottom-6 right-6 z-[70] rounded-full border border-amber-100/40 bg-[linear-gradient(140deg,#fef3c7_0%,#2dd4bf_35%,#0f172a_100%)] p-[2px] shadow-[0_20px_80px_rgba(15,118,110,0.48)]"
        whileHover={{ scale: 1.06, rotate: 1.5 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black tracking-[0.2em] text-amber-100">
          <motion.span
            className="pointer-events-none absolute inset-1 rounded-full border border-amber-200/35"
            animate={{ scale: [1, 1.09, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 1.45, repeat: Number.POSITIVE_INFINITY }}
          />
          VOICE
        </span>
      </motion.button>

      <AnimatePresence>
        {isEntering && (
          <motion.div
            className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/95"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.74, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.15, opacity: 0 }}
              className="w-[min(92vw,520px)] rounded-[2rem] border border-amber-200/30 bg-[linear-gradient(170deg,rgba(2,6,23,0.95),rgba(15,23,42,0.92))] p-10 text-center shadow-[0_0_120px_rgba(45,212,191,0.24)]"
            >
              <motion.div
                className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full border border-amber-200/45"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              >
                <Sparkles className="h-6 w-6 text-amber-100" />
              </motion.div>
              <p className="text-sm uppercase tracking-[0.24em] text-amber-100">Initializing Command Arena</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isArenaOpen && (
          <motion.section
            className="fixed inset-0 z-[80] overflow-hidden bg-slate-950"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.28 }}
          >
            <div className="absolute inset-0 [background:radial-gradient(circle_at_14%_10%,rgba(251,191,36,0.24),transparent_42%),radial-gradient(circle_at_78%_15%,rgba(45,212,191,0.22),transparent_38%),radial-gradient(circle_at_68%_84%,rgba(56,189,248,0.16),transparent_42%)]" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(250,204,21,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.16)_1px,transparent_1px)] [background-size:48px_48px]" />

            <div className="relative z-10 mx-auto flex h-full w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 sm:py-6">
              <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-100/20 bg-slate-900/65 px-4 py-3 backdrop-blur-xl">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/85">Voice Arena 21</p>
                  <h2 className="bg-gradient-to-r from-amber-100 via-teal-100 to-sky-200 bg-clip-text text-2xl font-semibold text-transparent">
                    Omni Neural Command Deck
                  </h2>
                  <p className="text-xs text-teal-100/75">No Run button. Silence for 2s and execution starts automatically.</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-amber-100">
                    {isRunning ? "Executing" : isListening ? "Listening" : "Idle"}
                  </span>
                  <button
                    onClick={closeArena}
                    className="rounded-xl border border-teal-100/25 bg-teal-500/10 p-2 text-teal-50 transition hover:bg-teal-500/20"
                    aria-label="Close Voice Arena"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[1.45fr_1fr]">
                <section className="rounded-[2rem] border border-amber-100/20 bg-slate-900/70 p-4 shadow-[0_0_90px_rgba(20,184,166,0.2)] backdrop-blur-xl sm:p-6">
                  <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
                    <div className="rounded-3xl border border-teal-100/20 bg-slate-950/60 p-4">
                      <div className="relative mx-auto mb-3 grid h-56 w-56 place-items-center">
                        <motion.div
                          className="absolute inset-0 rounded-full border border-amber-200/30"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                        />
                        <motion.div
                          className="absolute inset-5 rounded-full border border-teal-200/25"
                          animate={{ rotate: -360 }}
                          transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                        />
                        <motion.div
                          className="absolute inset-[3.1rem] rounded-full bg-[radial-gradient(circle,#14b8a6_0%,#0f172a_68%)]"
                          animate={{ boxShadow: isListening ? ["0 0 30px #2dd4bf", "0 0 90px #fbbf24", "0 0 30px #2dd4bf"] : ["0 0 20px #155e75", "0 0 28px #155e75", "0 0 20px #155e75"] }}
                          transition={{ duration: 1.45, repeat: Number.POSITIVE_INFINITY }}
                        />
                        <Sparkles className="relative z-10 h-9 w-9 text-amber-100" />
                      </div>

                      <div className="grid grid-cols-10 gap-1">
                        {Array.from({ length: 20 }).map((_, index) => (
                          <motion.span
                            key={`bar-${index}`}
                            className="h-2 rounded-full bg-teal-300/80"
                            animate={{ opacity: isListening ? [0.25, 1, 0.25] : [0.22, 0.34, 0.22], scaleY: isListening ? [0.6, 1.4, 0.6] : [0.5, 0.8, 0.5] }}
                            transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, delay: index * 0.03 }}
                          />
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-teal-100/75">
                        {isRunning ? "Agents executing your command..." : isListening ? "Listening in real-time. Pause to auto-trigger." : "Mic standby."}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          onClick={isListening ? stopListening : startListening}
                          disabled={!listeningSupported || isRunning}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:opacity-60"
                        >
                          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          {isListening ? "Stop Listening" : "Start Listening"}
                        </button>

                        <button
                          onClick={() => {
                            clearSilenceTimer();
                            setCommandDraft("");
                            finalTranscriptRef.current = "";
                          }}
                          disabled={isRunning}
                          className="rounded-xl border border-teal-200/20 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-50 transition hover:bg-teal-500/20"
                        >
                          Clear Draft
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="rounded-xl border border-teal-200/20 bg-slate-950/50 p-2 text-xs text-teal-100/90">
                          <span className="mb-1 block uppercase tracking-[0.12em] text-teal-100/70">Reply Language</span>
                          <select
                            value={voiceLanguageMode}
                            onChange={(event) => setVoiceLanguageMode(event.target.value as VoiceLanguageMode)}
                            className="w-full rounded-lg border border-teal-200/20 bg-slate-950/70 px-2 py-1 text-xs text-teal-50"
                          >
                            <option value="auto">Auto</option>
                            <option value="english">English</option>
                            <option value="hindi">Hindi</option>
                          </select>
                        </label>

                        <label className="rounded-xl border border-teal-200/20 bg-slate-950/50 p-2 text-xs text-teal-100/90">
                          <span className="mb-1 block uppercase tracking-[0.12em] text-teal-100/70">Voice</span>
                          <select
                            value={voiceGender}
                            onChange={(event) => setVoiceGender(event.target.value as VoiceGender)}
                            className="w-full rounded-lg border border-teal-200/20 bg-slate-950/70 px-2 py-1 text-xs text-teal-50"
                          >
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                          </select>
                        </label>

                        <label className="rounded-xl border border-teal-200/20 bg-slate-950/50 p-2 text-xs text-teal-100/90">
                          <span className="mb-1 block uppercase tracking-[0.12em] text-teal-100/70">Speech Mode</span>
                          <select
                            value={playbackMode}
                            onChange={(event) => setPlaybackMode(event.target.value as VoicePlaybackMode)}
                            className="w-full rounded-lg border border-teal-200/20 bg-slate-950/70 px-2 py-1 text-xs text-teal-50"
                          >
                            <option value="low-latency">Instant</option>
                            <option value="studio">Studio (Groq)</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-amber-200/20 bg-slate-950/55 p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-amber-200/75">Live Transcript</p>
                          <p className="mt-2 min-h-20 text-sm leading-relaxed text-amber-50/95">
                            {commandDraft || "Bolo naturally... 2 second pause ke baad auto-execution start hoga."}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-teal-200/20 bg-slate-950/55 p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-teal-200/75">Omni Reply Stream</p>
                          <p className="mt-2 min-h-20 text-sm leading-relaxed text-teal-50/95">
                            {assistantResponse || "Response yahin stream hoga aur auto-speak trigger hoga."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className="rounded-[2rem] border border-teal-100/20 bg-slate-900/70 p-4 backdrop-blur-xl sm:p-6">
                  <div className="mb-3 flex items-center gap-2 text-teal-100">
                    <AudioLines className="h-4 w-4" />
                    <p className="text-sm font-semibold">Execution Feed</p>
                  </div>

                  <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1 sm:max-h-[44vh]">
                    {steps.length === 0 && (
                      <p className="text-sm text-teal-200/70">No live steps yet. Start mic and speak your command.</p>
                    )}

                    {steps.map((step) => (
                      <div key={step.id} className="rounded-xl border border-teal-200/15 bg-slate-950/60 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-teal-300/85">{step.agent}</p>
                          <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.11em] text-amber-100/90">
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-teal-50/95">{step.message}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-teal-200/15 bg-slate-950/60 p-3">
                    <p className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-teal-100/75">
                      <WandSparkles className="h-3.5 w-3.5" />
                      Session Context
                    </p>
                    <p className="mt-1 text-xs text-teal-50/90">Model: {selectedModel}</p>
                    <p className="text-xs text-teal-50/90">Reply language: {voiceLanguageMode}</p>
                    <p className="text-xs text-teal-50/90">Voice: {voiceGender}</p>
                    <p className="text-xs text-teal-50/90">Speech mode: {playbackMode}</p>
                    <p className="text-xs text-teal-50/90">Last command: {lastCommand || "-"}</p>
                    {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
                  </div>
                </aside>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

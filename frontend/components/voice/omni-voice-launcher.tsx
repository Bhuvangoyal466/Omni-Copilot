"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Mic, MicOff, Send, Sparkles, X } from "lucide-react";

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
  utterance.rate = 1;
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

  const listeningSupported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  const openArena = () => {
    setError(null);
    setIsEntering(true);
    window.setTimeout(() => {
      setIsEntering(false);
      setIsArenaOpen(true);
    }, 2000);
  };

  const closeArena = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // noop
      }
    }
    setIsListening(false);
    setIsArenaOpen(false);
  };

  const addStep = (agent: string, message: string, status: "running" | "completed" | "failed") => {
    setSteps((prev) => [
      ...prev,
      {
        id: createId("voice-step"),
        agent,
        message,
        status
      }
    ]);
  };

  const playTts = useCallback(async (
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
          }, 900)
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
  }, []);

  const runCommand = useCallback(async () => {
    const command = commandDraft.trim();
    if (!command || isRunning) {
      return;
    }

    setError(null);
    setIsRunning(true);
    setAssistantResponse("");
    setSteps([]);
    setLastCommand(command);

    addStep("VoiceArena", "Sending command to Omni", "running");

    try {
      const commandLanguage = resolveReplyLanguage(command, voiceLanguageMode);
      const languageHint =
        commandLanguage === "hi"
          ? "Reply strictly in Hindi."
          : "Reply strictly in English.";

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatIdRef.current,
          message: `${command}\n\n${languageHint}`,
          model: selectedModel
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
          }

          if (evt.event === "status" && typeof evt.data === "object" && evt.data !== null) {
            const data = evt.data as { agent?: string; message?: string; status?: "running" | "completed" | "failed" };
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

      await playTts(assistantText, command, voiceLanguageMode, voiceGender, playbackMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown voice execution error";
      setError(msg);
      addStep("VoiceArena", msg, "failed");
    } finally {
      setIsRunning(false);
    }
  }, [commandDraft, isRunning, playbackMode, playTts, selectedModel, voiceGender, voiceLanguageMode]);

  const startListening = () => {
    if (!listeningSupported || isListening) {
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

      setCommandDraft(`${finalTranscriptRef.current} ${interim}`.trim());
    };

    recognition.onerror = (event: any) => {
      setError(`Mic error: ${event?.error || "unknown"}`);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to start microphone";
      setError(msg);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) {
      return;
    }
    try {
      recognitionRef.current.stop();
    } catch {
      // noop
    }
    setIsListening(false);
  };

  return (
    <>
      <motion.button
        onClick={openArena}
        className="fixed bottom-6 right-6 z-[70] overflow-hidden rounded-full border border-cyan-300/30 bg-gradient-to-br from-cyan-300 via-cyan-400 to-blue-500 px-5 py-3 text-xs font-semibold tracking-[0.16em] text-black shadow-2xl shadow-cyan-900/50"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
      >
        <span className="relative z-10">OMNI VOICE</span>
        <motion.span
          className="absolute inset-0 bg-white/35"
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY }}
        />
      </motion.button>

      <AnimatePresence>
        {isEntering && (
          <motion.div
            className="fixed inset-0 z-[75] grid place-items-center bg-black/85"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl border border-cyan-300/25 bg-black/65 p-10 text-center shadow-2xl shadow-cyan-900/40"
            >
              <motion.div
                className="mx-auto mb-4 h-20 w-20 rounded-full border border-cyan-300/35"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              />
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">Entering Voice Arena</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isArenaOpen && (
          <motion.section
            className="fixed inset-0 z-[80] overflow-hidden bg-[radial-gradient(circle_at_top,_#0e2438,_#04070d_55%)]"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.35 }}
          >
            <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,rgba(0,255,255,0.24),transparent_40%),radial-gradient(circle_at_70%_70%,rgba(0,140,255,0.28),transparent_42%)]" />
            <div className="relative z-10 flex h-full flex-col p-4 sm:p-8">
              <header className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/75">Voice Arena</p>
                  <h2 className="text-xl font-semibold text-cyan-100">OMNI Jarvis Console</h2>
                </div>

                <button
                  onClick={closeArena}
                  className="rounded-xl border border-cyan-200/20 bg-cyan-500/10 p-2 text-cyan-100 hover:bg-cyan-500/20"
                  aria-label="Close Voice Arena"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-3xl border border-cyan-200/20 bg-black/35 p-4 backdrop-blur-xl sm:p-6">
                  <div className="mb-5 flex items-center justify-center">
                    <motion.div
                      className="relative grid h-44 w-44 place-items-center rounded-full border border-cyan-300/25 bg-cyan-500/10"
                      animate={{ boxShadow: isListening ? ["0 0 20px #0ff", "0 0 48px #0ff", "0 0 20px #0ff"] : "0 0 18px #0aa" }}
                      transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
                    >
                      <motion.div
                        className="absolute inset-2 rounded-full border border-cyan-300/30"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      />
                      <Sparkles className="h-8 w-8 text-cyan-200" />
                    </motion.div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      onClick={isListening ? stopListening : startListening}
                      disabled={!listeningSupported || isRunning}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-sm font-medium text-black transition hover:bg-cyan-300 disabled:opacity-60"
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      {isListening ? "Stop Mic" : "Start Mic"}
                    </button>

                    <button
                      onClick={() => {
                        setCommandDraft("");
                        finalTranscriptRef.current = "";
                      }}
                      disabled={isRunning}
                      className="rounded-xl border border-cyan-200/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      Clear
                    </button>

                    <button
                      onClick={() => {
                        stopListening();
                        void runCommand();
                      }}
                      disabled={isRunning || !commandDraft.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {isRunning ? "Running..." : "Run Command"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="rounded-xl border border-cyan-200/20 bg-black/40 p-2 text-xs text-cyan-100/90">
                      <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-200/70">Reply Language</span>
                      <select
                        value={voiceLanguageMode}
                        onChange={(event) => setVoiceLanguageMode(event.target.value as VoiceLanguageMode)}
                        className="w-full rounded-lg border border-cyan-200/20 bg-black/50 px-2 py-1 text-xs text-cyan-50"
                      >
                        <option value="auto">Auto</option>
                        <option value="english">English</option>
                        <option value="hindi">Hindi</option>
                      </select>
                    </label>

                    <label className="rounded-xl border border-cyan-200/20 bg-black/40 p-2 text-xs text-cyan-100/90">
                      <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-200/70">Voice</span>
                      <select
                        value={voiceGender}
                        onChange={(event) => setVoiceGender(event.target.value as VoiceGender)}
                        className="w-full rounded-lg border border-cyan-200/20 bg-black/50 px-2 py-1 text-xs text-cyan-50"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </label>

                    <label className="rounded-xl border border-cyan-200/20 bg-black/40 p-2 text-xs text-cyan-100/90">
                      <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-200/70">Speech Mode</span>
                      <select
                        value={playbackMode}
                        onChange={(event) => setPlaybackMode(event.target.value as VoicePlaybackMode)}
                        className="w-full rounded-lg border border-cyan-200/20 bg-black/50 px-2 py-1 text-xs text-cyan-50"
                      >
                        <option value="low-latency">Instant</option>
                        <option value="studio">Studio (Groq)</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-cyan-200/15 bg-black/40 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">Live Voice Transcript</p>
                    <p className="mt-2 min-h-14 text-sm leading-relaxed text-cyan-50/95">
                      {commandDraft || "Speak your command and watch live transcript here..."}
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-cyan-200/15 bg-black/40 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">Omni Response</p>
                    <p className="mt-2 min-h-20 text-sm leading-relaxed text-cyan-50/95">
                      {assistantResponse || "Response will stream here with voice playback."}
                    </p>
                  </div>
                </div>

                <aside className="rounded-3xl border border-cyan-200/20 bg-black/35 p-4 backdrop-blur-xl sm:p-6">
                  <div className="mb-3 flex items-center gap-2 text-cyan-100">
                    <AudioLines className="h-4 w-4" />
                    <p className="text-sm font-medium">Execution Feed</p>
                  </div>

                  <div className="space-y-2">
                    {steps.length === 0 && (
                      <p className="text-sm text-cyan-200/65">No steps yet. Execute a voice command to see live orchestration.</p>
                    )}

                    {steps.map((step) => (
                      <div
                        key={step.id}
                        className="rounded-xl border border-cyan-200/15 bg-black/35 p-2"
                      >
                        <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-300/80">{step.agent}</p>
                        <p className="text-sm text-cyan-50/95">{step.message}</p>
                        <p className="mt-1 text-[11px] text-cyan-200/70">{step.status}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-cyan-200/15 bg-black/35 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">Context</p>
                    <p className="mt-1 text-xs text-cyan-50/85">Model: {selectedModel}</p>
                    <p className="text-xs text-cyan-50/85">Reply language: {voiceLanguageMode}</p>
                    <p className="text-xs text-cyan-50/85">Voice: {voiceGender}</p>
                    <p className="text-xs text-cyan-50/85">Speech mode: {playbackMode}</p>
                    <p className="text-xs text-cyan-50/85">Last command: {lastCommand || "-"}</p>
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

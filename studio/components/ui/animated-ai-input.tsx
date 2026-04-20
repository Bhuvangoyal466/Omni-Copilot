"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowRight, Bot, Check, ChevronDown, Mic, MicOff, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AIPromptProps {
  onSubmit?: (message: string, options?: { voiceMode?: boolean }) => void;
  disabled?: boolean;
  placeholder?: string;
}

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

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

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

const MODEL_OPTIONS = [
  "GPT-5.4 Mini",
  "GPT-5.4",
  "Llama 3.3 70B",
  "Qwen QwQ 32B",
  "DeepSeek R1 Distill Llama 70B"
];

const MODEL_ICONS: Record<string, ReactNode> = {
  "GPT-5.4 Mini": <Bot className="h-4 w-4" />,
  "GPT-5.4": <Bot className="h-4 w-4" />,
  "Llama 3.3 70B": <Bot className="h-4 w-4" />,
  "Qwen QwQ 32B": <Bot className="h-4 w-4" />,
  "DeepSeek R1 Distill Llama 70B": <Bot className="h-4 w-4" />
};

export function AI_Prompt({ onSubmit, disabled = false, placeholder = "What can I do for you?" }: AIPromptProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [selectedModel, setSelectedModel] = useState("GPT-5.4 Mini");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 88, maxHeight: 280 });

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
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

  const submitMessage = useCallback(
    (rawMessage: string, options?: { voiceMode?: boolean }) => {
      const message = rawMessage.trim();
      if (!message || disabled) {
        return;
      }

      onSubmit?.(message, options);
      setValue("");
      finalTranscriptRef.current = "";
      adjustHeight(true);
    },
    [adjustHeight, disabled, onSubmit]
  );

  const submitValue = () => {
    const message = value.trim();
    if (!message || disabled) {
      return;
    }

    if (isListening) {
      stopListening();
    }

    submitMessage(message);
  };

  const queueVoiceSubmit = useCallback(
    (draft: string) => {
      clearSilenceTimer();
      const message = draft.trim();
      if (!message || disabled) {
        return;
      }

      silenceTimerRef.current = window.setTimeout(() => {
        stopListening();
        submitMessage(message, { voiceMode: true });
      }, 1200);
    },
    [clearSilenceTimer, disabled, stopListening, submitMessage]
  );

  const startListening = useCallback(() => {
    if (!speechSupported || isListening || disabled) {
      return;
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setMicError("Speech recognition is not supported in this browser.");
      return;
    }

    finalTranscriptRef.current = value.trim();
    const recognition = new RecognitionCtor();
    recognition.lang = "en-IN";
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
      setValue(combined);
      adjustHeight();
      queueVoiceSubmit(combined);
    };

    recognition.onerror = (event: any) => {
      setMicError(`Mic error: ${event?.error || "unknown"}`);
      setIsListening(false);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setMicError(null);
      setIsListening(true);
      queueVoiceSubmit(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start microphone";
      setMicError(message);
      setIsListening(false);
    }
  }, [adjustHeight, clearSilenceTimer, disabled, isListening, queueVoiceSubmit, speechSupported, value]);

  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (disabled && isListening) {
      stopListening();
    }
  }, [disabled, isListening, stopListening]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // noop
        }
      }
    };
  }, [clearSilenceTimer]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && value.trim()) {
      event.preventDefault();
      submitValue();
    }
  };

  return (
    <div className="w-full rounded-md border border-border bg-card p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Bot className="h-4 w-4" />
            <span>Message Omni</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 rounded-md px-3 text-xs">
                <span className="inline-flex items-center gap-2">
                  {MODEL_ICONS[selectedModel]}
                  {selectedModel}
                  <ChevronDown className="h-3.5 w-3.5" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[min(92vw,18rem)] sm:min-w-[12rem]">
              {MODEL_OPTIONS.map((model) => (
                <DropdownMenuItem key={model} onSelect={() => setSelectedModel(model)} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    {MODEL_ICONS[model]}
                    {model}
                  </span>
                  {selectedModel === model && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Textarea
          id="ai-input-15"
          value={value}
          placeholder={placeholder}
          className={cn("min-h-[88px] resize-none rounded-md border-border bg-background px-3 py-2 focus-visible:ring-0 focus-visible:ring-offset-0")}
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            setValue(event.target.value);
            adjustHeight();
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
              <input type="file" className="hidden" disabled={disabled} />
              <Paperclip className="h-4 w-4" />
              Attach
            </label>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              onClick={isListening ? stopListening : startListening}
              disabled={disabled || !speechSupported}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              Voice
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            aria-label="Send message"
            disabled={disabled || !value.trim()}
            onClick={submitValue}
          >
            Send
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {micError && <p className="text-xs text-rose-600">{micError}</p>}
      </div>
    </div>
  );
}
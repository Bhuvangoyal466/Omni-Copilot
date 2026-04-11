"use client";

import { ArrowRight, Bot, Check, ChevronDown, Mic, MicOff, Paperclip } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

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

function useAutoResizeTextarea({
    minHeight,
    maxHeight,
}: UseAutoResizeTextareaProps) {
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

            const newHeight = Math.max(
                minHeight,
                Math.min(
                    textarea.scrollHeight,
                    maxHeight ?? Number.POSITIVE_INFINITY
                )
            );

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

const OPENAI_ICON = (
    <>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 256 260"
            aria-label="OpenAI Icon"
            className="w-4 h-4 dark:hidden block"
        >
            <title>OpenAI Icon Light</title>
            <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
        </svg>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 256 260"
            aria-label="OpenAI Icon"
            className="w-4 h-4 hidden dark:block"
        >
            <title>OpenAI Icon Dark</title>
            <path
                fill="#fff"
                d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
            />
        </svg>
    </>
);

const GROQ_ICON = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-label="Groq Icon"
        className="w-4 h-4"
    >
        <title>Groq Icon</title>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity="0.16" />
        <path
            d="M8.2 12a3.8 3.8 0 0 1 3.8-3.8h3.6v1.8H12a2 2 0 1 0 0 4h2v-1.2h-2v-1.7h3.8v4.7H12A3.8 3.8 0 0 1 8.2 12Z"
            fill="currentColor"
        />
    </svg>
);

export function AI_Prompt({
    onSubmit,
    disabled = false,
    placeholder = "What can I do for you?",
}: AIPromptProps) {
    const [value, setValue] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [micError, setMicError] = useState<string | null>(null);
    const [speechSupported, setSpeechSupported] = useState(false);
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 72,
        maxHeight: 300,
    });
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const finalTranscriptRef = useRef("");
    const silenceTimerRef = useRef<number | null>(null);
    const [selectedModel, setSelectedModel] = useState("GPT-5.4 Mini");

    const AI_MODELS = [
        "GPT-5.4 Mini",
        "GPT-5.4",
        "Llama 3.3 70B",
        "Qwen QwQ 32B",
        "DeepSeek R1 Distill Llama 70B",
    ];

    const MODEL_ICONS: Record<string, React.ReactNode> = {
        "GPT-5.4 Mini": OPENAI_ICON,
        "GPT-5.4": OPENAI_ICON,
        "Llama 3.3 70B": GROQ_ICON,
        "Qwen QwQ 32B": GROQ_ICON,
        "DeepSeek R1 Distill Llama 70B": GROQ_ICON,
    };

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
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to start microphone";
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && value.trim()) {
            e.preventDefault();
            submitValue();
        }
    };

    return (
        <div className="w-full py-2">
            <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-1.5">
                <div className="relative">
                    <div className="relative flex flex-col">
                        <div
                            className="overflow-y-auto"
                            style={{ maxHeight: "400px" }}
                        >
                            <Textarea
                                id="ai-input-15"
                                value={value}
                                placeholder={placeholder}
                                className={cn(
                                    "w-full rounded-xl rounded-b-none px-4 py-3 bg-black/5 dark:bg-white/5 border-none dark:text-white placeholder:text-black/70 dark:placeholder:text-white/70 resize-none focus-visible:ring-0 focus-visible:ring-offset-0",
                                    "min-h-[72px]"
                                )}
                                ref={textareaRef}
                                onKeyDown={handleKeyDown}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    adjustHeight();
                                }}
                            />
                        </div>

                        <div className="h-14 bg-black/5 dark:bg-white/5 rounded-b-xl flex items-center">
                            <div className="absolute left-3 right-3 bottom-3 flex items-center justify-between w-[calc(100%-24px)]">
                                <div className="flex items-center gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className="flex h-8 max-w-[11rem] items-center gap-1 rounded-md pl-1 pr-2 text-xs hover:bg-black/10 focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-0 dark:text-white dark:hover:bg-white/10 sm:max-w-none"
                                            >
                                                <AnimatePresence mode="wait">
                                                    <motion.div
                                                        key={selectedModel}
                                                        initial={{
                                                            opacity: 0,
                                                            y: -5,
                                                        }}
                                                        animate={{
                                                            opacity: 1,
                                                            y: 0,
                                                        }}
                                                        exit={{
                                                            opacity: 0,
                                                            y: 5,
                                                        }}
                                                        transition={{
                                                            duration: 0.15,
                                                        }}
                                                        className="flex items-center gap-1"
                                                    >
                                                        {MODEL_ICONS[selectedModel]}
                                                        <span className="max-w-[6.5rem] truncate sm:max-w-none">
                                                            {selectedModel}
                                                        </span>
                                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                                    </motion.div>
                                                </AnimatePresence>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            className={cn(
                                                "w-[min(92vw,18rem)] sm:min-w-[12rem]",
                                                "border-black/10 dark:border-white/10",
                                                "bg-gradient-to-b from-white via-white to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-800"
                                            )}
                                        >
                                            {AI_MODELS.map((model) => (
                                                <DropdownMenuItem
                                                    key={model}
                                                    onSelect={() =>
                                                        setSelectedModel(model)
                                                    }
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {MODEL_ICONS[model] || (
                                                            <Bot className="w-4 h-4 opacity-50" />
                                                        )}
                                                        <span>{model}</span>
                                                    </div>
                                                    {selectedModel ===
                                                        model && (
                                                        <Check className="w-4 h-4 text-blue-500" />
                                                    )}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5" />
                                    <label
                                        className={cn(
                                            "rounded-lg p-2 bg-black/5 dark:bg-white/5 cursor-pointer",
                                            "hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500",
                                            "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                                        )}
                                        aria-label="Attach file"
                                    >
                                        <input type="file" className="hidden" disabled={disabled} />
                                        <Paperclip className="w-4 h-4 transition-colors" />
                                    </label>
                                    <button
                                        type="button"
                                        className={cn(
                                            "rounded-lg p-2 bg-black/5 dark:bg-white/5",
                                            "hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500",
                                            isListening ? "text-cyan-600 dark:text-cyan-300" : "text-black/50 dark:text-white/55"
                                        )}
                                        aria-label={isListening ? "Stop voice input" : "Start voice input"}
                                        onClick={isListening ? stopListening : startListening}
                                        disabled={disabled || !speechSupported}
                                    >
                                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className={cn(
                                        "rounded-lg p-2 bg-black/5 dark:bg-white/5",
                                        "hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500"
                                    )}
                                    aria-label="Send message"
                                    disabled={disabled || !value.trim()}
                                    onClick={submitValue}
                                >
                                    <ArrowRight
                                        className={cn(
                                            "w-4 h-4 dark:text-white transition-opacity duration-200",
                                            value.trim()
                                                ? "opacity-100"
                                                : "opacity-30"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                    {micError && <p className="px-3 pt-2 text-xs text-rose-500 dark:text-rose-300">{micError}</p>}
                </div>
            </div>
        </div>
    );
}

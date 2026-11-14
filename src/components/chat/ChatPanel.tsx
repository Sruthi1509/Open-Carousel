// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-00809c4b
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { AlertCircle, Plug, Loader2 } from "lucide-react";
import type { ReferenceImage } from "@/types/carousel";
import type { OllamaHealthStatus } from "@/lib/ollama-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  carouselId: string;
  referenceImages?: ReferenceImage[];
  claudeAvailable?: boolean;
  aiAvailability?: OllamaHealthStatus | null;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatPanel({
  carouselId,
  claudeAvailable,
  aiAvailability,
  referenceImages = [],
  onStreamStart,
  onStreamEnd,
  chatInputRef,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"ollama" | "claude">("ollama");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("preferred-ai-provider") as "ollama" | "claude" | null;
    if (saved && (saved === "claude" ? aiAvailability?.claudeAvailable : aiAvailability?.available)) {
      setProvider(saved);
    } else if (aiAvailability?.activeProvider) {
      setProvider(aiAvailability.activeProvider);
    }
  }, [aiAvailability]);

  // Load session ID and chat history from localStorage
  useEffect(() => {
    const storedSession = localStorage.getItem(`chat-session-${carouselId}`);
    if (storedSession) setSessionId(storedSession);
    try {
      const storedMessages = localStorage.getItem(`chat-messages-${carouselId}`);
      if (storedMessages) setMessages(JSON.parse(storedMessages));
    } catch {
      // ignore corrupted data
    }
  }, [carouselId]);

  // Persist messages to localStorage
  const persistMessages = useCallback(
    (msgs: Message[]) => {
      try {
        localStorage.setItem(`chat-messages-${carouselId}`, JSON.stringify(msgs));
      } catch {
        // ignore quota errors
      }
    },
    [carouselId]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setStatusMessage(null);
    localStorage.removeItem(`chat-messages-${carouselId}`);
    localStorage.removeItem(`chat-session-${carouselId}`);
  }, [carouselId]);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatusMessage(null);
    onStreamEnd?.();
  }, [onStreamEnd]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, statusMessage]);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);
      setStatusMessage("Connecting to AI...");
      onStreamStart?.();

      // Add user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add empty assistant message for streaming
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId,
            carouselId,
            provider,
            history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || "Failed to connect to AI"
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "status" && typeof data.text === "string") {
                  setStatusMessage(data.text);
                } else if (data.type === "token" && typeof data.text === "string") {
                  accumulated += data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated }
                        : m
                    )
                  );
                } else if (data.type === "result" && typeof data.text === "string") {
                  accumulated = data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated }
                        : m
                    )
                  );
                } else if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(
                    `chat-session-${carouselId}`,
                    data.sessionId
                  );
                }
              } catch {
                // skip unparseable
              }
            } else if (line.startsWith("event: done")) {
              setStatusMessage(null);
            } else if (line.startsWith("event: error")) {
              // Wait for data line containing error details
            }
          }
        }

        // Parse any remaining buffer
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "status" && typeof data.text === "string") {
                  setStatusMessage(data.text);
                } else if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(
                    `chat-session-${carouselId}`,
                    data.sessionId
                  );
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const errMsg = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errMsg);
        // Remove empty assistant message on error
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== assistantId || m.content.length > 0
          )
        );
      } finally {
        setIsStreaming(false);
        setStatusMessage(null);
        abortRef.current = null;
        // Persist messages after stream completes
        setMessages((prev) => {
          persistMessages(prev);
          return prev;
        });
        onStreamEnd?.();
      }
    },
    [isStreaming, sessionId, carouselId, provider, messages, onStreamStart, onStreamEnd, persistMessages]
  );

  const isAvailable = aiAvailability ? aiAvailability.available : (claudeAvailable ?? true);

  if (!isAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">Connect an AI Provider</h3>
        <p className="text-xs text-muted-foreground max-w-[280px] mb-4">
          Open Carrusel supports local Ollama and Claude CLI. Connect either to start designing.
        </p>
        <div className="w-full max-w-xs space-y-3 text-left">
          <div className="p-3 rounded-lg border border-border bg-muted/40">
            <div className="text-xs font-semibold mb-1">Option 1: Local Ollama (Free & Offline)</div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Run in your terminal:</p>
            <div className="bg-muted px-2.5 py-1 rounded text-[10px] font-mono select-all">
              ollama serve && ollama pull qwen2.5:3b
            </div>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/40">
            <div className="text-xs font-semibold mb-1">Option 2: Claude CLI</div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Install Claude Code CLI:</p>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-accent underline"
            >
              Claude CLI installation guide &rarr;
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">AI Assistant</h2>
            {aiAvailability?.claudeAvailable && (aiAvailability?.available || aiAvailability?.ollamaReachable) ? (
              <div className="inline-flex items-center bg-muted/80 rounded-full p-0.5 border border-border text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setProvider("ollama");
                    localStorage.setItem("preferred-ai-provider", "ollama");
                  }}
                  className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                    provider === "ollama"
                      ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Ollama
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProvider("claude");
                    localStorage.setItem("preferred-ai-provider", "claude");
                  }}
                  className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                    provider === "claude"
                      ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Claude CLI
                </button>
              </div>
            ) : provider === "claude" || (!aiAvailability?.available && aiAvailability?.claudeAvailable) ? (
              <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-mono font-normal">
                Claude CLI
              </span>
            ) : aiAvailability?.model ? (
              <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-mono font-normal">
                {aiAvailability.model}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {provider === "claude"
              ? "Autonomous slide design via Claude CLI"
              : "Autonomous slide design via local Ollama"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded"
          >
            Clear
          </button>
        )}
      </div>

      <ReferenceImages
        carouselId={carouselId}
        images={referenceImages}
        onImagesChange={() => onStreamEnd?.()}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <p className="text-sm mb-1">No messages yet</p>
            <p className="text-xs">
              Tell me what carousel you&apos;d like to create
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={
              isStreaming &&
              msg.role === "assistant" &&
              msg.id === messages[messages.length - 1]?.id
            }
          />
        ))}

        {/* Live progress indicator banner */}
        {isStreaming && (
          <div className="mx-4 my-2 flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/60 border border-border/50 rounded-lg p-2.5 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 text-accent animate-spin shrink-0" />
            <span className="font-medium text-foreground">
              {statusMessage || "AI is working..."}
            </span>
          </div>
        )}

        {error && (
          <div className="mx-4 my-2 flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        statusMessage={statusMessage}
        textareaRef={chatInputRef}
        onStop={handleStopGenerating}
      />
    </div>
  );
}

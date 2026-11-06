// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { NextRequest, NextResponse } from "next/server";
import {
  checkOllamaHealth,
  getOllamaBaseUrl,
  getOllamaModel,
  type OllamaChatMessage,
  type OllamaToolCall,
} from "@/lib/ollama-client";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand } from "@/lib/brand";
import { getCarousel } from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";
import { CAROUSEL_TOOLS, executeCarouselTool } from "@/lib/tools/carousel-tools";
import {
  getCarouselHistory,
  appendCarouselHistory,
} from "@/lib/chat-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_AGENT_ITERATIONS = 10;

interface RequestBody {
  message?: string;
  sessionId?: string;
  carouselId?: string;
  stylePresetId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function POST(request: NextRequest) {
  // 1. Health check: Ensure Ollama is reachable and model is available
  const health = await checkOllamaHealth();
  if (!health.available) {
    return NextResponse.json(
      {
        error:
          health.error ||
          "Ollama is not available. Please verify Ollama is running and the model is downloaded.",
      },
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, sessionId, carouselId, stylePresetId, history: clientHistory } = body;

  if (
    !message ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 10000
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const effectiveCarouselId = carouselId || "";
  const resolvedSessionId = sessionId || effectiveCarouselId || crypto.randomUUID();

  // 2. Build dynamic system prompt with current brand + carousel + style preset context
  const brand = await getBrand();
  const carousel = effectiveCarouselId ? await getCarousel(effectiveCarouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset);

  // 3. Prepare conversation history
  const storedHistory = effectiveCarouselId
    ? await getCarouselHistory(effectiveCarouselId)
    : [];

  // Fallback to client history if stored history is empty
  let conversationHistory: OllamaChatMessage[] = storedHistory;
  if (conversationHistory.length === 0 && Array.isArray(clientHistory) && clientHistory.length > 0) {
    conversationHistory = clientHistory
      .slice(-10)
      .map((h) => ({ role: h.role, content: h.content }));
  }

  const messages: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  // Connect client abort signal
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendToken = (text: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`)
        );
      };

      const sendError = (errMessage: string) => {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errMessage })}\n\n`
          )
        );
      };

      const sendDone = () => {
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              sessionId: resolvedSessionId,
              exitCode: 0,
            })}\n\n`
          )
        );
      };

      const baseUrl = getOllamaBaseUrl();
      const model = getOllamaModel();
      let iteration = 0;
      let finalAssistantResponse = "";
      const executedToolSignatures = new Set<string>();

      try {
        while (iteration < MAX_AGENT_ITERATIONS) {
          iteration++;

          if (abortController.signal.aborted) {
            break;
          }

          const response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages,
              tools: CAROUSEL_TOOLS,
              stream: true,
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            sendError(`Ollama inference error (${response.status}): ${errBody || response.statusText}`);
            controller.close();
            return;
          }

          if (!response.body) {
            sendError("No response body received from Ollama.");
            controller.close();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let iterationText = "";
          const iterationToolCalls: OllamaToolCall[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line);
                if (chunk.message) {
                  // Stream text content to user
                  if (typeof chunk.message.content === "string" && chunk.message.content) {
                    iterationText += chunk.message.content;
                    sendToken(chunk.message.content);
                  }

                  // Accumulate tool calls
                  if (Array.isArray(chunk.message.tool_calls)) {
                    for (const tc of chunk.message.tool_calls) {
                      iterationToolCalls.push(tc);
                    }
                  }
                }
              } catch {
                // Skip malformed chunk line
              }
            }
          }

          // Process any trailing bytes in buffer
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.message) {
                if (typeof chunk.message.content === "string" && chunk.message.content) {
                  iterationText += chunk.message.content;
                  sendToken(chunk.message.content);
                }
                if (Array.isArray(chunk.message.tool_calls)) {
                  for (const tc of chunk.message.tool_calls) {
                    iterationToolCalls.push(tc);
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          finalAssistantResponse += iterationText;

          // If no tool calls were requested, the model has completed its final answer
          if (iterationToolCalls.length === 0) {
            break;
          }

          // Add assistant message with tool calls to conversation history
          messages.push({
            role: "assistant",
            content: iterationText,
            tool_calls: iterationToolCalls,
          });

          // Execute each tool call securely in-process
          for (const toolCall of iterationToolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;
            const signature = `${toolName}:${JSON.stringify(toolArgs)}`;

            // Loop prevention: check if identical tool call was already executed this turn
            if (executedToolSignatures.has(signature)) {
              messages.push({
                role: "tool",
                content: JSON.stringify({
                  success: false,
                  error: `Duplicate tool execution rejected: '${toolName}' was already executed with identical arguments.`,
                }),
              });
              continue;
            }
            executedToolSignatures.add(signature);

            // Execute native tool
            const result = await executeCarouselTool(
              toolName,
              toolArgs,
              effectiveCarouselId
            );

            // Append structured result as tool response message
            messages.push({
              role: "tool",
              content: JSON.stringify(result),
            });
          }
        }

        // Persist the user message and final assistant summary to history
        if (effectiveCarouselId) {
          await appendCarouselHistory(effectiveCarouselId, [
            { role: "user", content: message },
            {
              role: "assistant",
              content:
                finalAssistantResponse.trim() ||
                "Carousel updated successfully.",
            },
          ]);
        }

        sendDone();
      } catch (err) {
        if (!abortController.signal.aborted) {
          const errMessage = err instanceof Error ? err.message : "Unknown error during inference";
          sendError(errMessage);
        }
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      }
    },

    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

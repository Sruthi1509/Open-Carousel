// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import crossSpawn from "cross-spawn";
import type { Agent } from "undici";
import {
  APP_REQUEST_TIMEOUT_MS,
  ollamaDispatcher,
  formatTimeoutErrorMessage,
} from "@/lib/chat-timeouts";
import {
  checkOllamaHealth,
  getOllamaBaseUrl,
  getOllamaModel,
  type OllamaChatMessage,
  type OllamaToolCall,
} from "@/lib/ollama-client";
import { getClaudePath, isClaudeAvailable } from "@/lib/claude-path";
import { buildSystemPrompt, buildClaudeSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand } from "@/lib/brand";
import { getCarousel } from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";
import {
  CAROUSEL_TOOLS,
  executeCarouselTool,
  parseToolArguments,
} from "@/lib/tools/carousel-tools";
import {
  getCarouselHistory,
  appendCarouselHistory,
} from "@/lib/chat-history";
import {
  buildRemainingSlidesInstruction,
  detectRequestedSlideCount,
  getSlideGenerationState,
} from "@/lib/slide-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// maxDuration is a Vercel serverless hint only — it does not configure standalone Node.js.
export const maxDuration = 900;

export { APP_REQUEST_TIMEOUT_MS, ollamaDispatcher };

const MAX_AGENT_ITERATIONS = 10;

interface RequestBody {
  message?: string;
  sessionId?: string;
  carouselId?: string;
  stylePresetId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: "ollama" | "claude";
}

/**
 * Strips verbose HTML from assistant tool arguments before adding to conversation
 * history to keep subsequent prompt iterations small and fast on CPU.
 */
function sanitizeToolCallsForHistory(toolCalls: OllamaToolCall[]): OllamaToolCall[] {
  return toolCalls.map((tc) => {
    if (tc.function.name === "create_slide" || tc.function.name === "update_slide") {
      const args = parseToolArguments(tc.function.arguments);
      if (typeof args.html === "string" && args.html.length > 80) {
        return {
          ...tc,
          function: {
            ...tc.function,
            arguments: {
              ...args,
              html: `[HTML slide content (${args.html.length} chars)]`,
            },
          },
        };
      }
    }
    return tc;
  });
}

function formatToolStatusMessage(toolName: string, state: "start" | "done" | "error", extra?: string): string {
  switch (toolName) {
    case "create_slide":
      return state === "start"
        ? "Designing new slide..."
        : state === "done"
        ? "Slide created successfully"
        : `Slide creation notice: ${extra || "failed"}`;
    case "update_slide":
      return state === "start"
        ? "Updating slide content..."
        : state === "done"
        ? "Slide updated successfully"
        : `Slide update notice: ${extra || "failed"}`;
    case "delete_slide":
      return state === "start"
        ? "Removing slide..."
        : state === "done"
        ? "Slide deleted"
        : `Delete notice: ${extra || "failed"}`;
    case "reorder_slides":
      return state === "start"
        ? "Reordering slides..."
        : state === "done"
        ? "Slides reordered"
        : `Reorder notice: ${extra || "failed"}`;
    case "set_caption":
      return state === "start"
        ? "Writing post caption & hashtags..."
        : state === "done"
        ? "Caption and hashtags updated"
        : `Caption notice: ${extra || "failed"}`;
    case "save_style_preset":
      return state === "start"
        ? "Saving style preset..."
        : state === "done"
        ? "Style preset saved"
        : `Preset notice: ${extra || "failed"}`;
    case "fetch_web_content":
      return state === "start"
        ? "Fetching web research..."
        : state === "done"
        ? "Web research content loaded"
        : `Web fetch notice: ${extra || "failed"}`;
    default:
      return state === "start"
        ? `Executing ${toolName}...`
        : state === "done"
        ? `${toolName} executed`
        : `Tool notice: ${extra || "error"}`;
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    message,
    sessionId,
    carouselId,
    stylePresetId,
    history: clientHistory,
    provider: requestedProvider,
  } = body;

  if (
    !message ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 10000
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const envProvider = (process.env.AI_PROVIDER || "").toLowerCase();
  const claudeAvailable = isClaudeAvailable();

  let targetProvider: "ollama" | "claude" = "ollama";
  if (requestedProvider === "claude" || requestedProvider === "ollama") {
    targetProvider = requestedProvider;
  } else if (envProvider === "claude") {
    targetProvider = "claude";
  } else if (envProvider === "ollama") {
    targetProvider = "ollama";
  } else if (claudeAvailable) {
    const ollamaCheck = await checkOllamaHealth().catch(() => ({ available: false }));
    if (!ollamaCheck.available) {
      targetProvider = "claude";
    }
  }

  if (targetProvider === "claude") {
    if (!claudeAvailable) {
      return NextResponse.json(
        {
          error:
            "Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code or set CLAUDE_CLI_PATH in .env.local",
        },
        { status: 503 }
      );
    }
    return handleClaudeChat({
      message,
      sessionId,
      carouselId,
      stylePresetId,
      request,
    });
  }

  // 1. Health check: Ensure Ollama is reachable and model is available
  const health = await checkOllamaHealth();
  if (!health.available) {
    const suggestion = claudeAvailable
      ? " Or switch provider to Claude CLI."
      : "";
    return NextResponse.json(
      {
        error:
          (health.error ||
          "Ollama is not available. Please verify Ollama is running and the model is downloaded.") +
          suggestion,
      },
      { status: 503 }
    );
  }

  const effectiveCarouselId = carouselId || "";
  const resolvedSessionId = sessionId || effectiveCarouselId || crypto.randomUUID();
  const requestedSlideCount = detectRequestedSlideCount(message);

  // 2. Build dynamic system prompt with current brand + carousel + style preset context + explicit user color requirements
  const brand = await getBrand();
  const carousel = effectiveCarouselId ? await getCarousel(effectiveCarouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset, message);

  // 3. Prepare bounded conversation history to prevent prompt bloat
  const storedHistory = effectiveCarouselId
    ? await getCarouselHistory(effectiveCarouselId)
    : [];

  let rawHistory: OllamaChatMessage[] = storedHistory;
  if (rawHistory.length === 0 && Array.isArray(clientHistory) && clientHistory.length > 0) {
    rawHistory = clientHistory
      .slice(-6)
      .map((h) => ({ role: h.role, content: h.content }));
  } else {
    rawHistory = rawHistory.slice(-6);
  }

  // Bound message content in history
  const boundedHistory: OllamaChatMessage[] = rawHistory.map((m) => {
    if (m.content && m.content.length > 1200) {
      return { ...m, content: m.content.substring(0, 1200) + "..." };
    }
    return m;
  });

  const messages: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...boundedHistory,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const abortController = new AbortController();

  // Connect client abort signal (user pressing Stop)
  request.signal.addEventListener("abort", () => {
    abortController.abort("user_cancel");
  });

  // Application-level wall-clock guard. This remains the authoritative finite
  // deadline and preserves the separate user-cancellation signal.
  const appTimeoutHandle = setTimeout(() => {
    abortController.abort("app_timeout");
  }, APP_REQUEST_TIMEOUT_MS);

  const stream = new ReadableStream({
    async start(controller) {
      const sendToken = (text: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`)
        );
      };

      const sendStatus = (text: string, stage: string, tool?: string) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "status", text, stage, tool })}\n\n`
          )
        );
      };

      const sendError = (errMessage: string) => {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errMessage })}\n\n`
          )
        );
      };

      const sendDone = (diagnosticsData?: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              sessionId: resolvedSessionId,
              exitCode: 0,
              diagnostics: diagnosticsData,
            })}\n\n`
          )
        );
      };

      const baseUrl = getOllamaBaseUrl();
      const model = getOllamaModel();
      let iteration = 0;
      let finalAssistantResponse = "";
      const executedToolSignatures = new Set<string>();
      let successfulSlideCreations = 0;
      let actualSlideCount = carousel?.slides.length ?? 0;

      const refreshActualSlideCount = async (): Promise<number> => {
        if (!effectiveCarouselId) return actualSlideCount;
        const currentCarousel = await getCarousel(effectiveCarouselId);
        if (!currentCarousel) {
          throw new Error(`Carousel '${effectiveCarouselId}' no longer exists.`);
        }
        actualSlideCount = currentCarousel.slides.length;
        return actualSlideCount;
      };

      const diagnostics = {
        requestsCount: 0,
        iterationsCount: 0,
        totalPromptTokens: 0,
        totalPromptEvalDurationMs: 0,
        totalEvalTokens: 0,
        totalEvalDurationMs: 0,
        toolsExecuted: [] as Array<{
          name: string;
          durationMs: number;
          success: boolean;
          error?: string;
        }>,
        requestedSlideCount,
        requestedSlides: requestedSlideCount,
        actualSlideCount,
        actualSlides: actualSlideCount,
        successfulSlideCreations: 0,
        createdSlides: 0,
        terminationReason: "unknown",
      };

      sendStatus("Planning carousel...", "thinking");

      // Periodic SSE keep-alive heartbeat to prevent client socket/body timeouts during CPU inference
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 4000);

      try {
        while (iteration < MAX_AGENT_ITERATIONS) {
          iteration++;
          diagnostics.iterationsCount = iteration;
          actualSlideCount = await refreshActualSlideCount();
          diagnostics.actualSlideCount = actualSlideCount;
          diagnostics.actualSlides = actualSlideCount;

          if (abortController.signal.aborted) {
            diagnostics.terminationReason = "aborted";
            break;
          }

          const slideGenerationState = getSlideGenerationState(
            requestedSlideCount,
            actualSlideCount
          );
          if (slideGenerationState.targetReached) {
            diagnostics.terminationReason = "requested_slide_count_reached";
            break;
          }

          if (iteration > 1) {
            const remaining = slideGenerationState.remainingSlides;
            sendStatus(
              remaining === null
                ? `Step ${iteration}: Continuing carousel work...`
                : `Step ${iteration}: Creating ${remaining} remaining slide${remaining === 1 ? "" : "s"}...`,
              "planning"
            );
          }

          diagnostics.requestsCount++;
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages,
              tools: CAROUSEL_TOOLS,
              stream: true,
              options: {
                num_predict: 1024,
                temperature: 0.6,
              },
            }),
            signal: abortController.signal,
            // `dispatcher` is Undici's Node-only fetch extension. Next.js
            // forwards unknown RequestInit fields to the native fetch.
            dispatcher: ollamaDispatcher,
          } as RequestInit & { dispatcher: Agent });

          if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            diagnostics.terminationReason = `ollama_http_${response.status}`;
            sendError(
              `Ollama inference error (${response.status}): ${errBody || response.statusText}`
            );
            controller.close();
            return;
          }

          if (!response.body) {
            diagnostics.terminationReason = "no_response_body";
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

                // Collect inference performance diagnostics
                if (chunk.prompt_eval_count) {
                  diagnostics.totalPromptTokens += chunk.prompt_eval_count;
                }
                if (chunk.prompt_eval_duration) {
                  diagnostics.totalPromptEvalDurationMs += chunk.prompt_eval_duration / 1e6;
                }
                if (chunk.eval_count) {
                  diagnostics.totalEvalTokens += chunk.eval_count;
                }
                if (chunk.eval_duration) {
                  diagnostics.totalEvalDurationMs += chunk.eval_duration / 1e6;
                }

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

          // Process trailing bytes in buffer
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.prompt_eval_count) diagnostics.totalPromptTokens += chunk.prompt_eval_count;
              if (chunk.prompt_eval_duration) diagnostics.totalPromptEvalDurationMs += chunk.prompt_eval_duration / 1e6;
              if (chunk.eval_count) diagnostics.totalEvalTokens += chunk.eval_count;
              if (chunk.eval_duration) diagnostics.totalEvalDurationMs += chunk.eval_duration / 1e6;

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

          actualSlideCount = await refreshActualSlideCount();
          diagnostics.actualSlideCount = actualSlideCount;
          diagnostics.actualSlides = actualSlideCount;
          const postResponseSlideState = getSlideGenerationState(
            requestedSlideCount,
            actualSlideCount
          );

          // A no-tool response is only final if the requested target has been met.
          if (iterationToolCalls.length === 0) {
            if (postResponseSlideState.remainingSlides !== null && postResponseSlideState.remainingSlides > 0) {
              messages.push({ role: "assistant", content: iterationText });
              messages.push({
                role: "user",
                content: buildRemainingSlidesInstruction(postResponseSlideState.remainingSlides),
              });
              sendStatus(
                `The model paused before all slides were created. Continuing with ${postResponseSlideState.remainingSlides} remaining...`,
                "continuing"
              );
              continue;
            }
            diagnostics.terminationReason = postResponseSlideState.targetReached
              ? "requested_slide_count_reached"
              : "no_tool_calls";
            break;
          }

          // Add assistant message with sanitized tool calls to avoid re-ingesting raw HTML
          messages.push({
            role: "assistant",
            content: iterationText,
            tool_calls: sanitizeToolCallsForHistory(iterationToolCalls),
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
                  recovery: "Do not repeat the identical tool call. Proceed to the next slide or wrap up.",
                }),
              });
              continue;
            }
            executedToolSignatures.add(signature);

            if (toolName === "create_slide" && requestedSlideCount !== null) {
              actualSlideCount = await refreshActualSlideCount();
              diagnostics.actualSlideCount = actualSlideCount;
              diagnostics.actualSlides = actualSlideCount;
              if (actualSlideCount >= requestedSlideCount) {
                messages.push({
                  role: "tool",
                  content: JSON.stringify({
                    success: false,
                    error: "Slide creation skipped because the requested slide count has already been reached.",
                    recovery: "Do not create duplicate slides. Continue with any remaining non-slide work.",
                  }),
                });
                continue;
              }
            }

            sendStatus(formatToolStatusMessage(toolName, "start"), "tool_start", toolName);
            const toolStartTime = Date.now();

            // Execute native tool with active carousel isolation
            const result = await executeCarouselTool(
              toolName,
              toolArgs,
              effectiveCarouselId
            );

            const toolDurationMs = Date.now() - toolStartTime;
            diagnostics.toolsExecuted.push({
              name: toolName,
              durationMs: toolDurationMs,
              success: result.success,
              error: result.error,
            });

            if (toolName === "create_slide" && result.success) {
              successfulSlideCreations++;
              diagnostics.successfulSlideCreations = successfulSlideCreations;
              diagnostics.createdSlides = successfulSlideCreations;
              actualSlideCount = await refreshActualSlideCount();
              diagnostics.actualSlideCount = actualSlideCount;
              diagnostics.actualSlides = actualSlideCount;
              diagnostics.actualSlides = actualSlideCount;
            }

            if (result.success) {
              sendStatus(formatToolStatusMessage(toolName, "done"), "tool_done", toolName);
            } else {
              sendStatus(
                formatToolStatusMessage(toolName, "error", result.error),
                "tool_error",
                toolName
              );
            }

            // Append structured result as tool response message
            messages.push({
              role: "tool",
              content: JSON.stringify(result),
            });
          }

          if (getSlideGenerationState(requestedSlideCount, actualSlideCount).targetReached) {
            diagnostics.terminationReason = "requested_slide_count_reached";
            break;
          }
        }

        const finalSlideState = getSlideGenerationState(requestedSlideCount, actualSlideCount);
        if (iteration >= MAX_AGENT_ITERATIONS && diagnostics.terminationReason === "unknown") {
          diagnostics.terminationReason = finalSlideState.remainingSlides && finalSlideState.remainingSlides > 0
            ? "max_iterations_incomplete"
            : "max_iterations";
        }

        if (finalSlideState.remainingSlides && finalSlideState.remainingSlides > 0) {
          sendError(
            `Generation stopped after ${iteration} iterations: ${actualSlideCount} of ${requestedSlideCount} requested slides exist.`
          );
          sendDone(diagnostics);
          return;
        }

        sendStatus("Finalizing response...", "finalizing");

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

        // Print non-sensitive diagnostics to server stdout
        console.log(
          `[AI-AGENT] Carousel: ${effectiveCarouselId || "none"} | ` +
          `Requests: ${diagnostics.requestsCount} | ` +
          `Iterations: ${diagnostics.iterationsCount} | ` +
          `Requested Slides: ${requestedSlideCount ?? "unspecified"} | ` +
          `Actual Slides: ${actualSlideCount} | ` +
          `Created Slides: ${successfulSlideCreations} | ` +
          `Prompt: ${diagnostics.totalPromptTokens} tokens (${(diagnostics.totalPromptEvalDurationMs / 1000).toFixed(2)}s) | ` +
          `Eval: ${diagnostics.totalEvalTokens} tokens (${(diagnostics.totalEvalDurationMs / 1000).toFixed(2)}s) | ` +
          `Tools: [${diagnostics.toolsExecuted.map((t) => `${t.name}:${t.success ? "ok" : "fail"}(${t.durationMs}ms)`).join(", ")}] | ` +
          `Termination: ${diagnostics.terminationReason}`
        );

        sendDone(diagnostics);
      } catch (err) {
        if (!abortController.signal.aborted) {
          diagnostics.terminationReason = "exception";
          const errMessage = err instanceof Error ? err.message : "Unknown error during inference";
          sendError(errMessage);
        } else {
          // Distinguish user cancel vs app timeout in diagnostics
          const reason = abortController.signal.reason;
          diagnostics.terminationReason =
            reason === "app_timeout" ? "app_timeout" :
            reason === "user_cancel" ? "user_cancel" : "aborted";
          if (reason === "app_timeout") {
            sendError(formatTimeoutErrorMessage(APP_REQUEST_TIMEOUT_MS));
          }
          // user_cancel: no error message — user initiated, UI already reflects stop
        }
      } finally {
        clearTimeout(appTimeoutHandle);
        clearInterval(heartbeat);
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

async function handleClaudeChat({
  message,
  sessionId,
  carouselId,
  stylePresetId,
  request,
}: {
  message: string;
  sessionId?: string;
  carouselId?: string;
  stylePresetId?: string;
  request: NextRequest;
}): Promise<Response> {
  const brand = await getBrand();
  const carousel = carouselId ? await getCarousel(carouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildClaudeSystemPrompt(brand, carousel, stylePreset, message);

  const claudePath = getClaudePath();
  const abortController = new AbortController();

  request.signal.addEventListener("abort", () => {
    abortController.abort("user_cancel");
  });

  const appTimeoutHandle = setTimeout(() => {
    abortController.abort("app_timeout");
  }, APP_REQUEST_TIMEOUT_MS);

  const args = [
    "-p",
    message,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--append-system-prompt",
    systemPrompt,
    "--allowedTools",
    "Bash",
    "--allowedTools",
    "WebFetch",
    "--allowedTools",
    "Read",
    "--max-budget-usd",
    "1.00",
    "--name",
    "carrusel-chat",
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let childProcess: ReturnType<typeof spawn>;

      const spawner = process.platform === "win32" ? crossSpawn : spawn;

      try {
        childProcess = spawner(claudePath, args, {
          cwd: process.cwd(),
          signal: abortController.signal,
          stdio: ["pipe", "pipe", "pipe"],
        });
        childProcess.stdin?.end();
      } catch (err) {
        clearTimeout(appTimeoutHandle);
        const e = err as NodeJS.ErrnoException;
        console.error("[chat] failed to spawn Claude CLI", {
          claudePath,
          platform: process.platform,
          code: e?.code,
          message: e?.message,
        });
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: "Failed to start Claude CLI",
              code: e?.code,
              path: claudePath,
              message: e?.message,
            })}\n\n`
          )
        );
        controller.close();
        return;
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "status", text: "Connecting to Claude CLI...", stage: "thinking" })}\n\n`
        )
      );

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 4000);

      let buffer = "";
      let resolvedSessionId = sessionId ?? "";
      let accumulatedAssistantText = "";

      childProcess.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleClaudeEvent(
              event,
              controller,
              encoder,
              (id) => {
                resolvedSessionId = id;
              },
              (token) => {
                accumulatedAssistantText += token;
              }
            );
          } catch {
            // skip unparseable lines
          }
        }
      });

      let stderrBuf = "";
      const STDERR_CAP = 8192;
      childProcess.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < STDERR_CAP) {
          stderrBuf = (stderrBuf + chunk.toString()).slice(-STDERR_CAP);
        }
      });

      childProcess.on("error", (err) => {
        clearTimeout(appTimeoutHandle);
        clearInterval(heartbeat);
        const e = err as NodeJS.ErrnoException;
        console.error("[chat] Claude subprocess error", {
          claudePath,
          platform: process.platform,
          code: e?.code,
          syscall: e?.syscall,
          path: e?.path,
          message: e?.message,
          stderr: stderrBuf,
        });
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: err.message,
                code: e?.code,
                syscall: e?.syscall,
                path: e?.path,
                stderr: stderrBuf || undefined,
              })}\n\n`
            )
          );
          controller.close();
        } catch {
          // stream already closed
        }
      });

      childProcess.on("exit", async (code) => {
        clearTimeout(appTimeoutHandle);
        clearInterval(heartbeat);

        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            handleClaudeEvent(
              event,
              controller,
              encoder,
              (id) => {
                resolvedSessionId = id;
              },
              (token) => {
                accumulatedAssistantText += token;
              }
            );
          } catch {
            // skip
          }
        }

        if (code && code !== 0 && !abortController.signal.aborted) {
          console.error("[chat] Claude subprocess exited non-zero", {
            exitCode: code,
            stderr: stderrBuf,
          });
          try {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: `Claude CLI exited with code ${code}`,
                  exitCode: code,
                  stderr: stderrBuf || undefined,
                })}\n\n`
              )
            );
          } catch {
            // stream already closed
          }
        }

        if (carouselId && (accumulatedAssistantText.trim() || code === 0)) {
          await appendCarouselHistory(carouselId, [
            { role: "user", content: message },
            {
              role: "assistant",
              content:
                accumulatedAssistantText.trim() || "Carousel updated successfully via Claude CLI.",
            },
          ]);
        }

        try {
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                sessionId: resolvedSessionId,
                exitCode: code ?? 0,
                provider: "claude",
              })}\n\n`
            )
          );
          controller.close();
        } catch {
          // stream already closed
        }
      });
    },

    cancel() {
      abortController.abort("user_cancel");
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

function handleClaudeEvent(
  event: Record<string, unknown>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  onSessionId: (id: string) => void,
  onToken: (text: string) => void
) {
  if (event.type === "system" && event.subtype === "init" && event.session_id) {
    onSessionId(event.session_id as string);
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ sessionId: event.session_id })}\n\n`
      )
    );
    return;
  }

  if (event.type === "assistant" && event.message) {
    const msg = event.message as Record<string, unknown>;
    if (msg.type === "message" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          onToken(b.text);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "token", text: b.text })}\n\n`
            )
          );
        }
      }
    }
    return;
  }

  if (event.type === "result") {
    if (event.session_id) {
      onSessionId(event.session_id as string);
    }
    if (typeof event.result === "string" && event.result) {
      onToken(event.result);
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "result", text: event.result })}\n\n`
        )
      );
    }
    return;
  }
}

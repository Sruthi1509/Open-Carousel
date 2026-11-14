// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { NextResponse } from "next/server";
import { checkOllamaHealth, type OllamaHealthStatus } from "@/lib/ollama-client";
import { isClaudeAvailable, findClaudePath } from "@/lib/claude-path";

export const dynamic = "force-dynamic";

export async function GET() {
  const [ollamaStatus, claudeOk] = await Promise.all([
    checkOllamaHealth().catch((err) => ({
      available: false,
      ollamaReachable: false,
      modelAvailable: false,
      model: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434",
      error: err instanceof Error ? err.message : "Ollama connection failed",
    })),
    Promise.resolve(isClaudeAvailable()),
  ]);

  const claudePath = findClaudePath();
  const envProvider = (process.env.AI_PROVIDER || "").toLowerCase();

  let activeProvider: "ollama" | "claude" = "ollama";
  if (envProvider === "claude" && claudeOk) {
    activeProvider = "claude";
  } else if (envProvider === "ollama" && ollamaStatus.available) {
    activeProvider = "ollama";
  } else if (claudeOk && !ollamaStatus.available) {
    activeProvider = "claude";
  } else if (ollamaStatus.available) {
    activeProvider = "ollama";
  } else if (claudeOk) {
    activeProvider = "claude";
  }

  const response: OllamaHealthStatus = {
    ...ollamaStatus,
    available: ollamaStatus.available || claudeOk,
    claudeAvailable: claudeOk,
    claudePath,
    activeProvider,
    defaultProvider: activeProvider,
    error: !ollamaStatus.available && !claudeOk ? ollamaStatus.error : undefined,
  };

  return NextResponse.json(response);
}

// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModelInfo {
  name: string;
  model?: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: OllamaModelDetails;
}

export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

export interface OllamaToolCall {
  id?: string;
  function: {
    index?: number;
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaChatRequest {
  model?: string;
  messages: OllamaChatMessage[];
  tools?: OllamaToolDefinition[];
  stream?: boolean;
  options?: Record<string, unknown>;
  keep_alive?: string | number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaHealthStatus {
  available: boolean;
  ollamaReachable: boolean;
  modelAvailable: boolean;
  model: string;
  baseUrl: string;
  error?: string;
  claudeAvailable?: boolean;
  claudePath?: string | null;
  activeProvider?: "ollama" | "claude";
  defaultProvider?: "ollama" | "claude";
}

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "qwen2.5:3b";
}

/**
 * Check if a model name matches any model in the list, accounting for
 * default tags like ":latest".
 */
export function modelMatches(installedName: string, targetName: string): boolean {
  if (installedName === targetName) return true;
  if (installedName === `${targetName}:latest`) return true;
  if (`${installedName}:latest` === targetName) return true;
  return false;
}

/**
 * Probes Ollama daemon and checks whether the configured model is available.
 */
export async function checkOllamaHealth(
  targetModel?: string,
  timeoutMs = 4000
): Promise<OllamaHealthStatus> {
  const baseUrl = getOllamaBaseUrl();
  const model = targetModel || getOllamaModel();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return {
        available: false,
        ollamaReachable: false,
        modelAvailable: false,
        model,
        baseUrl,
        error: `Ollama returned HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const models = Array.isArray(data.models) ? data.models : [];
    const found = models.some((m) => modelMatches(m.name, model));

    if (!found) {
      return {
        available: false,
        ollamaReachable: true,
        modelAvailable: false,
        model,
        baseUrl,
        error: `Model "${model}" is not installed in Ollama. Run: ollama pull ${model}`,
      };
    }

    return {
      available: true,
      ollamaReachable: true,
      modelAvailable: true,
      model,
      baseUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout");
    return {
      available: false,
      ollamaReachable: false,
      modelAvailable: false,
      model,
      baseUrl,
      error: isTimeout
        ? `Connection to Ollama timed out at ${baseUrl}`
        : `Could not connect to Ollama at ${baseUrl} (${message})`,
    };
  }
}

/**
 * Retrieves the list of locally installed models from Ollama.
 */
export async function listOllamaModels(timeoutMs = 5000): Promise<OllamaModelInfo[]> {
  const baseUrl = getOllamaBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Ollama tags request failed: ${response.statusText}`);
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return Array.isArray(data.models) ? data.models : [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a non-streaming chat request to Ollama.
 */
export async function sendOllamaChat(
  request: OllamaChatRequest,
  timeoutMs = 180000
): Promise<OllamaChatResponse> {
  const baseUrl = getOllamaBaseUrl();
  const model = request.model || getOllamaModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        model,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama chat error (${response.status}): ${errText || response.statusText}`);
    }

    return (await response.json()) as OllamaChatResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Initiates a streaming chat request to Ollama, returning the raw fetch Response.
 */
export async function streamOllamaChat(
  request: OllamaChatRequest,
  signal?: AbortSignal
): Promise<Response> {
  const baseUrl = getOllamaBaseUrl();
  const model = request.model || getOllamaModel();

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...request,
      model,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Ollama stream error (${response.status}): ${errText || response.statusText}`);
  }

  return response;
}


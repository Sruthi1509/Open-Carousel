// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { Agent } from "undici";

/**
 * Maximum wall-clock time (ms) allowed for a single /api/chat request.
 * Set to 15 minutes to allow sufficient headroom for multi-slide generation
 * on slow CPU inference (e.g. Intel i3-7020U with 4-5 slides).
 * When this fires, the error clearly identifies "app_timeout" in diagnostics.
 */
export const APP_REQUEST_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Node's built-in fetch uses Undici, whose default header and body inactivity
// timeouts are both 300 seconds. Ollama does not send response headers until it
// has started producing a generation, so slow prompt evaluation used to hit that
// outbound client limit. Scope the longer finite limits to Ollama only; do not
// alter the standalone HTTP server's inbound-request protections.
export const ollamaDispatcher = new Agent({
  headersTimeout: APP_REQUEST_TIMEOUT_MS,
  bodyTimeout: APP_REQUEST_TIMEOUT_MS,
});

export function formatTimeoutErrorMessage(timeoutMs: number = APP_REQUEST_TIMEOUT_MS): string {
  return (
    `Generation exceeded the maximum allowed time (${timeoutMs / 60000} minutes). ` +
    `Try requesting fewer slides or a shorter prompt.`
  );
}


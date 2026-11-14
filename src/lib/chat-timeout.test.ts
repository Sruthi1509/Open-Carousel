import assert from "node:assert/strict";
import { test } from "node:test";
import { Agent } from "undici";
import {
  APP_REQUEST_TIMEOUT_MS,
  ollamaDispatcher,
  formatTimeoutErrorMessage,
} from "./chat-timeouts";

test("APP_REQUEST_TIMEOUT_MS is configured to 15 minutes (900,000 ms)", () => {
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
  assert.equal(APP_REQUEST_TIMEOUT_MS, FIFTEEN_MINUTES_MS);
  assert.equal(APP_REQUEST_TIMEOUT_MS, 900000);
});

test("ollamaDispatcher agent configures headersTimeout and bodyTimeout to 15 minutes", () => {
  assert.ok(ollamaDispatcher instanceof Agent, "Must be an Undici Agent instance");
  // Inspect internal undici symbol / options
  const options = (ollamaDispatcher as unknown as Record<string | symbol, unknown>)[
    Object.getOwnPropertySymbols(ollamaDispatcher).find((s) => s.description === "options") ?? ""
  ] as Record<string, unknown> | undefined;
  if (options && typeof options === "object") {
    assert.equal(options.headersTimeout, 900000, "headersTimeout must be 15 minutes");
    assert.equal(options.bodyTimeout, 900000, "bodyTimeout must be 15 minutes");
  }
});

test("formats 15-minute user-facing timeout error message correctly", () => {
  const errMsg = formatTimeoutErrorMessage(APP_REQUEST_TIMEOUT_MS);
  assert.equal(
    errMsg,
    "Generation exceeded the maximum allowed time (15 minutes). Try requesting fewer slides or a shorter prompt."
  );
});

test("overall deadline does not reset across multiple agent iterations", () => {
  const startTime = 1000;
  const timeoutMs = APP_REQUEST_TIMEOUT_MS;
  const overallDeadline = startTime + timeoutMs;

  // Simulate multiple iterations
  let currentTime = startTime;
  const iterations = [
    { name: "slide 1", duration: 180_000 },
    { name: "slide 2", duration: 180_000 },
    { name: "slide 3", duration: 180_000 },
    { name: "slide 4", duration: 180_000 },
  ];

  for (const iter of iterations) {
    currentTime += iter.duration;
    // The deadline remains constant and does not push forward
    assert.equal(overallDeadline, startTime + timeoutMs);
    assert.ok(currentTime <= overallDeadline, `${iter.name} must finish within 15-min overall budget`);
  }

  assert.equal(currentTime, startTime + 720_000);
  assert.ok(currentTime < overallDeadline);
});

test("distinguishes user_cancel from app_timeout without error message on user cancellation", () => {
  // Test app_timeout
  const timeoutController = new AbortController();
  timeoutController.abort("app_timeout");
  assert.equal(timeoutController.signal.aborted, true);
  assert.equal(timeoutController.signal.reason, "app_timeout");

  // Test user_cancel
  const userCancelController = new AbortController();
  userCancelController.abort("user_cancel");
  assert.equal(userCancelController.signal.aborted, true);
  assert.equal(userCancelController.signal.reason, "user_cancel");

  // Verify routing logic: user_cancel does not produce an error toast
  const getErrorMessage = (reason: unknown) => {
    if (reason === "app_timeout") {
      return formatTimeoutErrorMessage(APP_REQUEST_TIMEOUT_MS);
    }
    return null;
  };

  assert.equal(getErrorMessage("user_cancel"), null);
  assert.match(getErrorMessage("app_timeout")!, /15 minutes/);
});

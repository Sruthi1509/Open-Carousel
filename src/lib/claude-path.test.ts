import assert from "node:assert/strict";
import { test } from "node:test";
import { findClaudePath, isClaudeAvailable } from "./claude-path";

test("findClaudePath returns null or a valid string without throwing", () => {
  const result = findClaudePath();
  assert.ok(result === null || typeof result === "string");
});

test("isClaudeAvailable returns a boolean matching findClaudePath", () => {
  const available = isClaudeAvailable();
  const path = findClaudePath();
  assert.equal(available, path !== null);
});

test("honors CLAUDE_CLI_PATH environment variable if file exists", () => {
  // Test with non-existent path
  const originalEnv = process.env.CLAUDE_CLI_PATH;
  try {
    process.env.CLAUDE_CLI_PATH = "/tmp/non-existent-claude-test-binary";
    // Should skip non-existent file
    const path = findClaudePath();
    assert.notEqual(path, "/tmp/non-existent-claude-test-binary");
  } finally {
    if (originalEnv) {
      process.env.CLAUDE_CLI_PATH = originalEnv;
    } else {
      delete process.env.CLAUDE_CLI_PATH;
    }
  }
});


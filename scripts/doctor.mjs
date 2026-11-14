#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-00809c4b
// Open Carrusel — environment diagnostic.
// Pure Node, no dependencies, safe to run pre-`npm install`.
// Exit 0 if everything required is OK; exit 1 on any required failure.

import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";
import { join } from "node:path";

const CHECK = "✓";
const FAIL = "✗";
const INFO = "○";
const WARN = "!";

const checks = [];
let hardFailures = 0;

function add(symbol, label, detail, fatal = false) {
  checks.push({ symbol, label, detail });
  if (fatal && symbol === FAIL) hardFailures += 1;
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

// 1. Node version
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) {
  add(CHECK, "Node", `v${process.versions.node}`);
} else {
  add(FAIL, "Node", `v${process.versions.node} (need ≥20 — install from https://nodejs.org)`, true);
}

// 2. AI Providers (Ollama and/or Claude CLI)
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const targetModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

let ollamaReachable = false;
let modelFound = false;

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const res = await fetch(`${ollamaBaseUrl}/api/tags`, {
    signal: controller.signal,
    headers: { Accept: "application/json" },
  }).finally(() => clearTimeout(timeout));

  if (res.ok) {
    ollamaReachable = true;
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    modelFound = models.some(
      (m) =>
        m.name === targetModel ||
        m.name === `${targetModel}:latest` ||
        `${m.name}:latest` === targetModel
    );
  }
} catch {
  // connection failed or timed out
}

let claudePath = null;
if (process.env.CLAUDE_CLI_PATH && existsSync(process.env.CLAUDE_CLI_PATH)) {
  claudePath = process.env.CLAUDE_CLI_PATH;
} else {
  const probe = tryExec(platform() === "win32" ? "where claude" : "command -v claude");
  if (probe) claudePath = probe.split(/\r?\n/)[0].trim();
}

const ollamaReady = ollamaReachable && modelFound;
const claudeReady = Boolean(claudePath && existsSync(claudePath));
const anyAiReady = ollamaReady || claudeReady;

if (ollamaReachable) {
  add(CHECK, "Ollama Daemon", `reachable at ${ollamaBaseUrl}`);
} else {
  add(claudeReady ? INFO : FAIL, "Ollama Daemon", `not reachable at ${ollamaBaseUrl} — run 'ollama serve'`, !anyAiReady);
}

if (modelFound) {
  add(CHECK, "Ollama Model", `model "${targetModel}" ready`);
} else if (ollamaReachable) {
  add(claudeReady ? INFO : FAIL, "Ollama Model", `model "${targetModel}" not found — run 'ollama pull ${targetModel}'`, !anyAiReady);
} else {
  add(claudeReady ? INFO : WARN, "Ollama Model", `could not verify model "${targetModel}" (daemon offline)`);
}

if (claudeReady) {
  add(CHECK, "Claude CLI", `ready at ${claudePath}`);
} else {
  add(ollamaReady ? INFO : WARN, "Claude CLI", "not installed (optional when Ollama is available)");
}

// 3. Dependencies
if (existsSync("node_modules") && statSync("node_modules").isDirectory()) {
  add(CHECK, "Dependencies", "node_modules present");
} else {
  add(FAIL, "Dependencies", "node_modules missing — run `npm install`", true);
}

// 4. Data files
const dataFiles = ["brand.json", "carousels.json", "templates.json", "staged-actions.json", "style-presets.json"];
const missingData = dataFiles.filter((f) => !existsSync(join("data", f)));
if (missingData.length === 0) {
  add(CHECK, "Data files", "all 5 seeded");
} else if (missingData.length === dataFiles.length) {
  add(FAIL, "Data files", "none seeded — run `npm run setup`", true);
} else {
  add(WARN, "Data files", `${missingData.length} missing: ${missingData.join(", ")}`);
}

// 5. Port 3000 / 3001
let portStatus = "free";
let portFree = true;
if (platform() !== "win32") {
  const pid =
    tryExec("lsof -ti :3000") ||
    tryExec("fuser 3000/tcp 2>/dev/null") ||
    (tryExec("ss -tulpn")?.includes(":3000 ") ? "in use" : null);

  if (pid) {
    portStatus = `in use (${pid.trim()}) — Next.js will auto-use port 3001`;
    portFree = false;
  }
} else {
  const out = tryExec("netstat -ano -p tcp");
  if (out && /:3000\s+.+LISTENING/i.test(out)) {
    portStatus = "in use — Next.js will auto-use port 3001";
    portFree = false;
  }
}
add(portFree ? CHECK : INFO, "Port 3000", portStatus);

// Output
const labelWidth = Math.max(...checks.map((c) => c.label.length));
console.log("");
for (const { symbol, label, detail } of checks) {
  console.log(`  ${symbol}  ${label.padEnd(labelWidth)}   ${detail}`);
}
console.log("");

if (hardFailures > 0) {
  console.log(`  ${hardFailures} required check${hardFailures > 1 ? "s" : ""} failed.`);
  process.exit(1);
} else {
  process.exit(0);
}

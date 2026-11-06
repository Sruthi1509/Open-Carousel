#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// Cross-platform setup for Open Carrusel. Runs on macOS, Linux, and Windows.

import fs from "node:fs";
import path from "node:path";
import crossSpawn from "cross-spawn";

const ROOT = process.cwd();

function log(msg) {
  process.stdout.write(msg + "\n");
}

function runSync(cmd, args, opts = {}) {
  const res = crossSpawn.sync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${res.status}`);
  }
}

async function checkOllamaSetup() {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const targetModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      log(`  ⚠️  Ollama returned HTTP ${res.status} at ${baseUrl}`);
      return false;
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const hasModel = models.some(
      (m) =>
        m.name === targetModel ||
        m.name === `${targetModel}:latest` ||
        `${m.name}:latest` === targetModel
    );

    if (hasModel) {
      log(`  ✅ Ollama daemon reachable and model "${targetModel}" is ready!`);
      return true;
    } else {
      log(`  ⚠️  Ollama is running, but model "${targetModel}" is not downloaded.`);
      log(`  Run: ollama pull ${targetModel}`);
      return false;
    }
  } catch {
    log(`  ⚠️  Ollama daemon is not reachable at ${baseUrl}.`);
    log("  Start it with: ollama serve");
    log("  Then download the model with: ollama pull qwen2.5:3b");
    return false;
  }
}

function seedDataFiles() {
  const dataDir = path.join(ROOT, "data");
  const uploadsDir = path.join(ROOT, "public", "uploads");
  const exportsDir = path.join(dataDir, "exports");
  const fontCacheDir = path.join(dataDir, ".font-cache");

  for (const dir of [dataDir, uploadsDir, exportsDir, fontCacheDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const seeds = {
    "brand.json": {
      name: "",
      colors: {
        primary: "#1a1a2e",
        secondary: "#16213e",
        accent: "#e94560",
        background: "#ffffff",
        surface: "#f5f5f5",
      },
      fonts: { heading: "Inter", body: "Inter" },
      customFonts: [],
      logoPath: null,
      styleKeywords: [],
      createdAt: "",
      updatedAt: "",
    },
    "carousels.json": { carousels: [] },
    "templates.json": { templates: [] },
    "staged-actions.json": { actions: [] },
    "style-presets.json": { presets: [] },
    "chat-history.json": { sessions: {} },
  };

  for (const [name, contents] of Object.entries(seeds)) {
    const filePath = path.join(dataDir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(contents, null, 2), "utf-8");
      log(`  Created ${path.relative(ROOT, filePath)}`);
    }
  }
}

async function main() {
  log("🎠 Setting up Open Carrusel...");
  log("");

  log(
    "📦 Installing dependencies (this may take a moment — Puppeteer downloads Chromium ~300MB)..."
  );
  runSync("npm", ["install"]);
  log("");

  log("📁 Creating data directories...");
  seedDataFiles();
  log("");

  log("🔍 Checking Ollama AI status...");
  await checkOllamaSetup();
  log("");

  if (process.env.OC_SETUP_NO_DEV) {
    log("✅ Setup complete. (Dev server start skipped — caller will handle it.)");
    return;
  }

  log("🚀 Starting Open Carrusel...");
  log("  Open http://localhost:3000 in your browser");
  log("");
  runSync("npm", ["run", "dev"]);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});

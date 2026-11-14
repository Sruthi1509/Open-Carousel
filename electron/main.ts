// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import path from "path";
import net from "net";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import fs from "fs/promises";
import { existsSync, chmodSync } from "fs";

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: ChildProcess | null = null;
let serverPort: number | null = null;
let isQuitting = false;

/**
 * Finds an unassigned ephemeral TCP port on localhost.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to obtain port from server address")));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

/**
 * Ensures user data directories and default JSON files exist.
 */
async function initializeUserData(): Promise<{ dataDir: string; uploadsDir: string }> {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  const uploadsDir = path.join(dataDir, "uploads");
  const fontCacheDir = path.join(dataDir, ".font-cache");

  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(fontCacheDir, { recursive: true });

  // Default seed data files
  const defaultSeeds: Record<string, unknown> = {
    "carousels.json": { carousels: [] },
    "templates.json": { templates: [] },
    "brand.json": { brand: null },
    "style-presets.json": { presets: [] },
    "chat-history.json": { sessions: {} },
  };

  // If source data directory exists (e.g. dev workspace), copy existing data on first run
  const localProjectData = path.resolve(process.cwd(), "data");

  for (const [filename, defaultValue] of Object.entries(defaultSeeds)) {
    const targetPath = path.join(dataDir, filename);
    if (!existsSync(targetPath)) {
      const sourcePath = path.join(localProjectData, filename);
      if (existsSync(sourcePath)) {
        try {
          const content = await fs.readFile(sourcePath, "utf-8");
          await fs.writeFile(targetPath, content, "utf-8");
          continue;
        } catch {
          // Fall back to default
        }
      }
      await fs.writeFile(targetPath, JSON.stringify(defaultValue, null, 2), "utf-8");
    }
  }

  return { dataDir, uploadsDir };
}

/**
 * Checks if Ollama is running and responding.
 */
async function checkOllamaStatus(): Promise<{ running: boolean; modelAvailable: boolean }> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { running: false, modelAvailable: false };
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const modelAvailable = Boolean(
      data.models?.some((m) => m.name.startsWith("qwen2.5:3b"))
    );
    return { running: true, modelAvailable };
  } catch {
    return { running: false, modelAvailable: false };
  }
}

/**
 * Checks if Claude CLI is installed and available in PATH.
 */
function checkClaudeStatus(): boolean {
  if (process.env.CLAUDE_CLI_PATH && existsSync(process.env.CLAUDE_CLI_PATH)) {
    return true;
  }
  try {
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "where" : "command";
    const args = isWindows ? ["claude"] : ["-v", "claude"];
    const res = spawnSync(cmd, args, { encoding: "utf-8", timeout: 2000, shell: !isWindows });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Resolves the bundled Chrome executable path across Linux and Windows.
 */
function getBundledChromePath(): string | null {
  const isWindows = process.platform === "win32";
  const chromeExe = isWindows ? "chrome.exe" : "chrome";
  const chromeSubdir = isWindows ? "chrome-win64" : "chrome-linux64";

  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "chromium", chromeSubdir, chromeExe),
        path.join(process.resourcesPath, "chromium", chromeExe),
        path.join(process.resourcesPath, "chromium", "chrome-win64", "chrome.exe"),
        path.join(process.resourcesPath, "chromium", "chrome-linux64", "chrome"),
      ]
    : [
        path.resolve(process.cwd(), "bundled-chromium", chromeSubdir, chromeExe),
        path.resolve(process.cwd(), "bundled-chromium", chromeExe),
        path.resolve(process.cwd(), "bundled-chromium", "chrome-win64", "chrome.exe"),
        path.resolve(process.cwd(), "bundled-chromium", "chrome-linux64", "chrome"),
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      if (!isWindows) {
        try {
          chmodSync(candidate, 0o755);
        } catch {
          // Ignore chmod errors
        }
      }
      return candidate;
    }
  }
  return null;
}

/**
 * Starts the Next.js server as a child process.
 */
async function startNextServer(
  port: number,
  dataDir: string,
  uploadsDir: string
): Promise<ChildProcess> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    OPEN_CAROUSEL_DATA_DIR: dataDir,
    OPEN_CAROUSEL_UPLOADS_DIR: uploadsDir,
  };

  // Configure bundled Puppeteer Chrome
  const chromePath = getBundledChromePath();
  if (chromePath) {
    console.log(`[Electron] Using bundled Chrome at: ${chromePath}`);
    env.PUPPETEER_EXECUTABLE_PATH = chromePath;
  } else {
    console.warn("[Electron] Warning: Bundled Chrome was not found; export may fail.");
  }

  // Resolve standalone server path outside ASAR.
  const standaloneServer = app.isPackaged
    ? path.join(process.resourcesPath, "standalone", "server.js")
    : path.join(process.cwd(), ".next", "standalone", "server.js");

  let child: ChildProcess;

  if (existsSync(standaloneServer)) {
    const standaloneDir = path.dirname(standaloneServer);
    console.log(`[Electron] Launching standalone server from: ${standaloneServer}`);
    console.log(`[Electron] Working directory: ${standaloneDir}`);

    const runEnv = app.isPackaged
      ? { ...env, ELECTRON_RUN_AS_NODE: "1" }
      : env;

    child = spawn(process.execPath, [standaloneServer], {
      cwd: standaloneDir,
      env: runEnv,
      stdio: "pipe",
      windowsHide: true,
    });
  } else {
    console.warn(
      `[Electron] Standalone server not found at ${standaloneServer}, falling back to npx next start`
    );
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    child = spawn(npxCmd, ["next", "start", "-p", String(port)], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
      windowsHide: true,
      shell: process.platform === "win32",
    });
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString();
    if (!msg.includes("GET /") && !msg.includes("POST /")) {
      console.log(`[Next.js Server] ${msg.trim()}`);
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[Next.js Server Error] ${chunk.toString().trim()}`);
  });

  child.on("exit", (code, signal) => {
    if (!isQuitting) {
      console.warn(`[Next.js Server] Unexpectedly exited with code ${code}, signal ${signal}`);
    }
  });

  return child;
}

/**
 * Waits for Next.js server to respond at its health check endpoint.
 */
async function waitForServerReady(port: number, maxWaitMs = 30000): Promise<boolean> {
  const startTime = Date.now();
  const url = `http://127.0.0.1:${port}/api/chat/check`;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status === 200) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Safely kills the Next.js server process and its process tree.
 */
function terminateNextServer() {
  if (nextServerProcess && !nextServerProcess.killed) {
    const pid = nextServerProcess.pid;
    try {
      if (process.platform === "win32" && pid) {
        // Forcefully terminate process tree on Windows
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        nextServerProcess.kill("SIGTERM");
        setTimeout(() => {
          if (nextServerProcess && !nextServerProcess.killed && pid) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // Already dead
            }
          }
        }, 3000);
      }
    } catch {
      // Ignore errors on exit
    }
  }
}

/**
 * Creates the primary application window.
 */
function createMainWindow(port: number) {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Open Carrusel",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Handle external link clicks safely in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // 1. Initialize persistent directories
      const { dataDir, uploadsDir } = await initializeUserData();
      console.log(`[Electron] Persistent Data Dir: ${dataDir}`);
      console.log(`[Electron] Uploads Dir: ${uploadsDir}`);

      // 2. Select free port
      serverPort = await findFreePort();
      console.log(`[Electron] Selected local port: ${serverPort}`);

      // 3. Start Next.js server
      nextServerProcess = await startNextServer(serverPort, dataDir, uploadsDir);

      // 4. Wait for server readiness
      console.log(`[Electron] Waiting for Next.js server at http://127.0.0.1:${serverPort}...`);
      const ready = await waitForServerReady(serverPort, 30000);
      if (!ready) {
        throw new Error(`Next.js server failed to start within 30 seconds on port ${serverPort}.`);
      }
      console.log("[Electron] Next.js server is ready!");

      // 5. Check AI availability (Ollama or Claude CLI)
      const ollama = await checkOllamaStatus();
      const claudeAvailable = checkClaudeStatus();
      if (!ollama.running && !claudeAvailable) {
        dialog.showMessageBox({
          type: "info",
          title: "AI Provider Not Detected",
          message: "No AI provider is currently running.",
          detail:
            "To use AI features, start Ollama ('ollama serve') or install Claude CLI. You can continue and connect anytime.",
          buttons: ["Continue Anyway"],
        });
      } else if (ollama.running && !ollama.modelAvailable && !claudeAvailable) {
        dialog.showMessageBox({
          type: "info",
          title: "Model Required",
          message: "Ollama is running, but 'qwen2.5:3b' was not found.",
          detail: "Please run 'ollama pull qwen2.5:3b' to enable the AI carousel designer.",
          buttons: ["OK"],
        });
      }

      // 6. Open main window
      createMainWindow(serverPort);
    } catch (err) {
      console.error("[Electron] Startup error:", err);
      dialog.showErrorBox(
        "Application Startup Error",
        err instanceof Error ? err.message : String(err)
      );
      terminateNextServer();
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      isQuitting = true;
      terminateNextServer();
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    terminateNextServer();
  });

  process.on("SIGINT", () => {
    isQuitting = true;
    terminateNextServer();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    isQuitting = true;
    terminateNextServer();
    process.exit(0);
  });
}

// IPC Handlers
ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("ollama:get-status", async () => {
  return await checkOllamaStatus();
});
ipcMain.on("app:open-external", (_event, url: string) => {
  if (url.startsWith("http:") || url.startsWith("https:")) {
    shell.openExternal(url);
  }
});

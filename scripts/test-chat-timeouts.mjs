// Exercises the exact standalone server that Electron packages. It is intentionally
// dependency-free so it can run against a built artifact before an AppImage rebuild.
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const STANDALONE_DIR = path.resolve(
  process.env.STANDALONE_DIR ||
    "release/linux-unpacked/resources/standalone"
);
const SERVER_ENTRY = path.join(STANDALONE_DIR, "server.js");
const DELAY_MS = Number(process.env.SLOW_RESPONSE_MS || 305_000);
const EXPECT_FAILURE = process.env.EXPECT_FAILURE === "1";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ollama = http.createServer(async (req, res) => {
  if (req.url === "/api/tags") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ models: [{ name: "qwen2.5:3b" }] }));
    return;
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    // Consume the complete request immediately. This separates an upstream
    // response-header delay from Node's inbound request-body timeout.
    for await (const chunk of req) void chunk;
    await sleep(DELAY_MS);
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    res.end(JSON.stringify({ message: { content: "slow response" }, done: true }) + "\n");
    return;
  }

  res.writeHead(404).end();
});

const ollamaPort = await listen(ollama);
const appPortProbe = http.createServer();
const appPort = await listen(appPortProbe);
await close(appPortProbe);

const server = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: STANDALONE_DIR,
  env: {
    ...process.env,
    PORT: String(appPort),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    OLLAMA_BASE_URL: `http://127.0.0.1:${ollamaPort}`,
    OLLAMA_MODEL: "qwen2.5:3b",
    OPEN_CAROUSEL_DATA_DIR: path.join(ROOT, ".tmp-timeout-test-data"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

try {
  const deadline = Date.now() + 30_000;
  while (!serverLog.includes("Ready") && Date.now() < deadline) await sleep(100);
  if (!serverLog.includes("Ready")) throw new Error(`standalone server did not start:\n${serverLog}`);

  const startedAt = Date.now();
  const response = await fetch(`http://127.0.0.1:${appPort}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The entire request body is transmitted before the mock starts delaying.
    body: JSON.stringify({ message: "Create one slide" }),
  });

  if (!response.ok || !response.body) throw new Error(`chat response failed: HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const elapsedMs = Date.now() - startedAt;
    const chunk = decoder.decode(value, { stream: true });
    chunks.push({ elapsedMs, chunk });
    text += chunk;
  }
  const elapsedMs = Date.now() - startedAt;
  const heartbeatCount = (text.match(/: keepalive/g) || []).length;
  const summary = { elapsedMs, heartbeatCount, chunks: chunks.map(({ elapsedMs: at }) => at), serverLog };
  console.log(JSON.stringify(summary, null, 2));

  if (EXPECT_FAILURE) {
    if (!text.includes("event: error")) throw new Error("expected the upstream header timeout to produce an SSE error");
  } else {
    if (elapsedMs <= 300_000) throw new Error(`response ended too early (${elapsedMs}ms)`);
    if (heartbeatCount < 70) throw new Error(`expected SSE heartbeats throughout delay; got ${heartbeatCount}`);
    if (!text.includes("slow response")) throw new Error("slow upstream response was not forwarded");
  }
} finally {
  server.kill("SIGTERM");
  await once(server, "exit").catch(() => {});
  await close(ollama);
}

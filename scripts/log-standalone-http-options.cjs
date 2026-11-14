/* eslint-disable @typescript-eslint/no-require-imports */
// Preload only for inspecting the HTTP server made by a standalone Next build.
// It observes the instance without changing any timeout values.
const http = require("node:http");
const createServer = http.createServer;

http.createServer = (...args) => {
  const server = createServer(...args);
  console.log("[standalone-http-options]", JSON.stringify({
    requestTimeout: server.requestTimeout,
    timeout: server.timeout,
    headersTimeout: server.headersTimeout,
    keepAliveTimeout: server.keepAliveTimeout,
  }));
  return server;
};

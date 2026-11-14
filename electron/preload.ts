// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { contextBridge, ipcRenderer } from "electron";

// Secure, minimal desktop API exposed to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getOllamaStatus: () => ipcRenderer.invoke("ollama:get-status"),
  openExternal: (url: string) => {
    // Only allow HTTP/HTTPS URLs
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        ipcRenderer.send("app:open-external", url);
      }
    } catch {
      // Invalid URL, ignore
    }
  },
});


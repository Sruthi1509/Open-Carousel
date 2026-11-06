// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import { readDataSafe, writeData } from "./data";
import type { OllamaChatMessage } from "./ollama-client";

const FILE = "chat-history.json";
const MAX_HISTORY_MESSAGES = 16;

export interface ChatHistoryStore {
  sessions: Record<string, OllamaChatMessage[]>;
}

async function loadStore(): Promise<ChatHistoryStore> {
  return readDataSafe<ChatHistoryStore>(FILE, { sessions: {} });
}

async function saveStore(store: ChatHistoryStore): Promise<void> {
  await writeData(FILE, store);
}

/**
 * Retrieve recent conversation history for a carousel.
 */
export async function getCarouselHistory(
  carouselId: string,
  limit = MAX_HISTORY_MESSAGES
): Promise<OllamaChatMessage[]> {
  const store = await loadStore();
  const msgs = store.sessions[carouselId] || [];
  return msgs.slice(-limit);
}

/**
 * Append messages to a carousel's conversation history.
 */
export async function appendCarouselHistory(
  carouselId: string,
  newMessages: OllamaChatMessage[]
): Promise<void> {
  if (!newMessages.length) return;
  const store = await loadStore();
  const current = store.sessions[carouselId] || [];
  const updated = [...current, ...newMessages];

  // Truncate if history exceeds MAX_HISTORY_MESSAGES, but always keep recent turns
  if (updated.length > MAX_HISTORY_MESSAGES * 2) {
    store.sessions[carouselId] = updated.slice(-MAX_HISTORY_MESSAGES);
  } else {
    store.sessions[carouselId] = updated;
  }

  await saveStore(store);
}

/**
 * Clear conversation history for a carousel.
 */
export async function clearCarouselHistory(carouselId: string): Promise<void> {
  const store = await loadStore();
  if (store.sessions[carouselId]) {
    delete store.sessions[carouselId];
    await saveStore(store);
  }
}


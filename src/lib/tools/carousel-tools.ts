// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import dns from "dns/promises";
import net from "net";
import type { OllamaToolDefinition } from "@/lib/ollama-client";
import {
  addSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  getCarousel,
  updateCarousel,
} from "@/lib/carousels";
import { getBrand } from "@/lib/brand";
import { createPreset } from "@/lib/style-presets";
import type { AspectRatio } from "@/types/carousel";

/**
 * Native tool schemas exposed to Ollama (optimized for compact token footprint with Qwen2.5:3B).
 */
export const CAROUSEL_TOOLS: OllamaToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_slide",
      description:
        "Create and append a slide. HTML must be body-level markup with inline CSS only (no <html> or <body> tags).",
      parameters: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "Self-contained slide HTML styled with inline CSS.",
          },
          notes: {
            type: "string",
            description: "Optional short slide note (e.g. 'Hook', 'Point 1', 'CTA').",
          },
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
        required: ["html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_slide",
      description: "Update an existing slide's HTML markup or notes.",
      parameters: {
        type: "object",
        properties: {
          slideId: {
            type: "string",
            description: "ID of the slide to update.",
          },
          html: {
            type: "string",
            description: "New slide HTML markup.",
          },
          notes: {
            type: "string",
            description: "Optional updated notes.",
          },
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
        required: ["slideId", "html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_slide",
      description: "Delete an existing slide from the carousel by its slide ID.",
      parameters: {
        type: "object",
        properties: {
          slideId: {
            type: "string",
            description: "ID of the slide to delete.",
          },
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
        required: ["slideId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_slides",
      description: "Reorder all slides by providing slide IDs in desired sequence.",
      parameters: {
        type: "object",
        properties: {
          slideIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of slide IDs in the desired order.",
          },
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
        required: ["slideIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_carousel",
      description: "Retrieve current carousel info, slide count, IDs, and captions.",
      parameters: {
        type: "object",
        properties: {
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_caption",
      description: "Set the Instagram caption text and hashtags for the carousel.",
      parameters: {
        type: "object",
        properties: {
          caption: {
            type: "string",
            description: "Full caption text for the post.",
          },
          hashtags: {
            type: "array",
            items: { type: "string" },
            description: "Hashtags without '#' symbol.",
          },
          carouselId: {
            type: "string",
            description: "Optional target carousel ID (defaults to active carousel).",
          },
        },
        required: ["caption", "hashtags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_style_preset",
      description: "Save a reusable visual style preset for future carousels.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Preset name.",
          },
          designRules: {
            type: "string",
            description: "Visual layout and design rules.",
          },
          aspectRatio: {
            type: "string",
            enum: ["1:1", "4:5", "9:16"],
            description: "Aspect ratio ('1:1', '4:5', '9:16').",
          },
          exampleSlideHtml: {
            type: "string",
            description: "Optional reference slide HTML.",
          },
        },
        required: ["name", "designRules", "aspectRatio"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_web_content",
      description: "Safely fetch and extract text from an external public URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Public HTTP or HTTPS URL to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
];

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  recovery?: string;
}

/**
 * Parses raw tool call arguments into a plain JS object safely.
 */
export function parseToolArguments(rawArgs: unknown): Record<string, unknown> {
  if (typeof rawArgs === "object" && rawArgs !== null) {
    return rawArgs as Record<string, unknown>;
  }
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Safely resolves the target carousel ID:
 * - If activeCarouselId is set:
 *   - Rejects any mismatching carouselId supplied by the model to preserve carousel isolation.
 *   - Automatically defaults to activeCarouselId if omitted or null.
 * - If activeCarouselId is unset:
 *   - Requires a valid non-empty string carouselId from args.
 */
export function resolveCarouselId(
  args: Record<string, unknown>,
  activeCarouselId?: string
): string {
  const modelSupplied =
    typeof args.carouselId === "string" && args.carouselId.trim()
      ? args.carouselId.trim()
      : undefined;

  if (activeCarouselId && activeCarouselId.trim()) {
    const trustedId = activeCarouselId.trim();
    if (modelSupplied && modelSupplied !== trustedId) {
      throw new Error(
        `Target carousel ID '${modelSupplied}' does not match active carousel '${trustedId}'. Access denied.`
      );
    }
    return trustedId;
  }

  if (modelSupplied) {
    return modelSupplied;
  }

  throw new Error("No active carousel context and no carousel ID provided.");
}

/**
 * Validates that an argument is a non-empty string.
 */
function requireString(args: Record<string, unknown>, key: string): string {
  const val = args[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new Error(`Argument '${key}' must be a non-empty string.`);
  }
  return val.trim();
}

/**
 * Validates that an argument is a string array.
 */
function requireStringArray(args: Record<string, unknown>, key: string): string[] {
  const val = args[key];
  if (!Array.isArray(val)) {
    throw new Error(`Argument '${key}' must be an array of strings.`);
  }
  return val.map((item) => String(item).trim()).filter(Boolean);
}

/**
 * Checks if an IP address belongs to a private, loopback, or reserved range.
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 addresses.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  let cleanIp = ip.toLowerCase();
  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.substring(7);
  }

  // IPv4 checks
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    const [a, b, c] = parts;

    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 Carrier-grade NAT
    if (a === 127) return true; // 127.0.0.0/8 Loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 Private
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 Private
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 Benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
    if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 Multicast
    if (a >= 240) return true; // 240.0.0.0/4 Reserved & Broadcast

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(cleanIp)) {
    if (cleanIp === "::1" || cleanIp === "::") return true; // Loopback & Unspecified
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // Unique local fc00::/7
    if (
      cleanIp.startsWith("fe8") ||
      cleanIp.startsWith("fe9") ||
      cleanIp.startsWith("fea") ||
      cleanIp.startsWith("feb")
    )
      return true; // Link-local fe80::/10
    return false;
  }

  return true; // Unknown IP format, treat as unsafe
}

/**
 * Validates a web URL against SSRF, DNS resolution to private IPs, and IP obfuscation.
 */
export async function validatePublicUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are permitted.");
  }

  // Remove brackets for IPv6 literals (e.g. [::1] -> ::1)
  const rawHost = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // Explicit hostnames and domain patterns that indicate private/local access
  if (
    rawHost === "localhost" ||
    rawHost.endsWith(".internal") ||
    rawHost.endsWith(".local") ||
    rawHost.endsWith(".localhost") ||
    rawHost === "0.0.0.0"
  ) {
    throw new Error("Access to local or private network addresses is forbidden.");
  }

  // Check alternative integer/hexadecimal representations (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(rawHost) || /^\d+$/.test(rawHost)) {
    throw new Error("Alternative integer or hexadecimal IP representations are forbidden.");
  }

  // Check if hostname is an IP literal
  if (net.isIP(rawHost)) {
    if (isPrivateOrReservedIP(rawHost)) {
      throw new Error("Access to local or private network addresses is forbidden.");
    }
    return parsed;
  }

  // Resolve hostname via DNS to prevent DNS rebinding attacks targeting private IPs
  try {
    const addresses = await dns.lookup(rawHost, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(`Failed to resolve host: ${rawHost}`);
    }
    for (const record of addresses) {
      if (isPrivateOrReservedIP(record.address)) {
        throw new Error(
          `Access to local or private network addresses is forbidden (resolved to ${record.address}).`
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("forbidden")) {
      throw err;
    }
    throw new Error(
      `DNS resolution failed for '${rawHost}': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return parsed;
}

/**
 * Safely fetches web content following up to 3 redirects, validating each hop
 * against private IPs, with an 8s timeout and a 512KB response-size limit.
 */
async function safeFetchWebContent(startUrl: string): Promise<string> {
  let currentUrl = await validatePublicUrl(startUrl);
  const MAX_HOPS = 3;
  const MAX_BYTES = 512 * 1024; // 512 KB

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(currentUrl.toString(), {
        headers: {
          "User-Agent": "OpenCarrusel/1.0 (+https://github.com/Hainrixz/open-carrusel)",
          Accept: "text/html,text/plain",
        },
        signal: controller.signal,
        redirect: "manual",
      });

      // Handle Redirects safely
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          throw new Error(`Redirect HTTP ${res.status} missing Location header.`);
        }
        if (hop === MAX_HOPS) {
          throw new Error("Too many redirects (max 3 hops exceeded).");
        }
        const nextUrlString = new URL(location, currentUrl).toString();
        currentUrl = await validatePublicUrl(nextUrlString);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.body) {
        return "";
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalBytes += value.length;
          if (totalBytes >= MAX_BYTES) {
            await reader.cancel();
            break;
          }
        }
      }

      const decoder = new TextDecoder("utf-8");
      return decoder.decode(Buffer.concat(chunks));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Request could not be completed.");
}

/**
 * Executes a registered native carousel tool with strict input validation and isolation.
 */
export async function executeCarouselTool(
  toolName: string,
  rawArgs: unknown,
  activeCarouselId?: string
): Promise<ToolExecutionResult> {
  const args = parseToolArguments(rawArgs);

  try {
    switch (toolName) {
      case "create_slide": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const html = requireString(args, "html");
        const notes = typeof args.notes === "string" ? args.notes.trim() : "";

        const slide = await addSlide(carouselId, html, notes);
        if (!slide) {
          return {
            success: false,
            error: "Carousel not found or maximum slide limit (20) reached.",
            recovery: "Ensure target carousel exists and has fewer than 20 slides.",
          };
        }
        return {
          success: true,
          data: {
            slideId: slide.id,
            order: slide.order + 1,
            message: `Slide ${slide.order + 1} created successfully with ID ${slide.id}`,
          },
        };
      }

      case "update_slide": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const slideId = requireString(args, "slideId");
        const html = requireString(args, "html");
        const notes = typeof args.notes === "string" ? args.notes.trim() : undefined;

        const updated = await updateSlide(carouselId, slideId, {
          html,
          ...(notes !== undefined ? { notes } : {}),
        });
        if (!updated) {
          return {
            success: false,
            error: `Slide '${slideId}' or carousel '${carouselId}' not found.`,
            recovery: "Call get_carousel to inspect current slide IDs.",
          };
        }
        return {
          success: true,
          data: {
            slideId: updated.id,
            order: updated.order + 1,
            message: `Slide ${updated.order + 1} updated successfully.`,
          },
        };
      }

      case "delete_slide": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const slideId = requireString(args, "slideId");

        const ok = await deleteSlide(carouselId, slideId);
        if (!ok) {
          return {
            success: false,
            error: `Slide '${slideId}' could not be deleted or was not found in carousel '${carouselId}'.`,
            recovery: "Verify the slideId with get_carousel before deleting.",
          };
        }
        return {
          success: true,
          data: {
            message: `Slide ${slideId} deleted successfully.`,
          },
        };
      }

      case "reorder_slides": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const slideIds = requireStringArray(args, "slideIds");

        const ok = await reorderSlides(carouselId, slideIds);
        if (!ok) {
          return {
            success: false,
            error: `Could not reorder slides. Ensure all slide IDs belong to carousel '${carouselId}'.`,
            recovery: "Pass all valid slide IDs for this carousel in the desired order.",
          };
        }
        return {
          success: true,
          data: {
            message: `Slides reordered successfully. New order: ${slideIds.join(", ")}`,
          },
        };
      }

      case "get_carousel": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const carousel = await getCarousel(carouselId);
        if (!carousel) {
          return {
            success: false,
            error: `Carousel with ID '${carouselId}' not found.`,
            recovery: "Verify the carousel ID exists.",
          };
        }
        return {
          success: true,
          data: {
            id: carousel.id,
            name: carousel.name,
            aspectRatio: carousel.aspectRatio,
            slideCount: carousel.slides.length,
            slides: carousel.slides.map((s) => ({
              id: s.id,
              order: s.order + 1,
              notes: s.notes || "",
            })),
            caption: carousel.caption || "",
            hashtags: carousel.hashtags || [],
          },
        };
      }

      case "set_caption": {
        const carouselId = resolveCarouselId(args, activeCarouselId);
        const caption = typeof args.caption === "string" ? args.caption.trim() : "";
        const hashtags = Array.isArray(args.hashtags)
          ? (args.hashtags as unknown[]).map((h) => String(h).trim()).filter(Boolean)
          : [];

        const updated = await updateCarousel(carouselId, {
          caption,
          hashtags: hashtags.map((h) => h.replace(/^#/, "")),
        });
        if (!updated) {
          return {
            success: false,
            error: `Carousel '${carouselId}' not found.`,
            recovery: "Ensure the active carousel exists.",
          };
        }
        return {
          success: true,
          data: {
            message: "Caption and hashtags updated successfully.",
            caption: updated.caption,
            hashtags: updated.hashtags,
          },
        };
      }

      case "save_style_preset": {
        const name = requireString(args, "name");
        const designRules = requireString(args, "designRules");
        const rawRatio = typeof args.aspectRatio === "string" ? args.aspectRatio.trim() : "4:5";
        const validRatios: AspectRatio[] = ["1:1", "4:5", "9:16"];
        const aspectRatio: AspectRatio = validRatios.includes(rawRatio as AspectRatio)
          ? (rawRatio as AspectRatio)
          : "4:5";
        const description = typeof args.description === "string" ? args.description : "";
        const exampleSlideHtml =
          typeof args.exampleSlideHtml === "string" ? args.exampleSlideHtml : "";
        const brand = await getBrand();

        const preset = await createPreset({
          name,
          description,
          brand,
          designRules,
          aspectRatio,
          exampleSlideHtml,
          tags: [],
        });
        return {
          success: true,
          data: {
            presetId: preset.id,
            name: preset.name,
            message: `Style preset '${preset.name}' created with ID ${preset.id}.`,
          },
        };
      }

      case "fetch_web_content": {
        const urlStr = requireString(args, "url");
        const rawContent = await safeFetchWebContent(urlStr);

        // Extract text cleanly, removing scripts and styles
        const stripped = rawContent
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Limit snippet to 1000 chars to avoid prompt context bloat
        const snippet = stripped.substring(0, 1000);
        return {
          success: true,
          data: {
            url: urlStr,
            contentSnippet: snippet,
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool name: '${toolName}'. Supported tools: ${CAROUSEL_TOOLS.map((t) => t.function.name).join(", ")}`,
          recovery: "Call only supported tools from the provided tool definitions.",
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      recovery: "Correct the arguments and invoke the tool again. Do NOT output raw HTML in chat text.",
    };
  }
}

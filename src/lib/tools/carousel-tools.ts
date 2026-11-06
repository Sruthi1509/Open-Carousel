// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

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
 * Native tool schemas exposed to Ollama.
 */
export const CAROUSEL_TOOLS: OllamaToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_slide",
      description:
        "Create and append a new slide to the carousel. The HTML must be BODY-LEVEL content only (no <html>, <head>, <body>, or <!DOCTYPE> tags) styled with inline CSS or <style> tags.",
      parameters: {
        type: "object",
        properties: {
          carouselId: {
            type: "string",
            description: "The ID of the target carousel.",
          },
          html: {
            type: "string",
            description:
              "The slide HTML markup. Must be self-contained body content styled with inline CSS.",
          },
          notes: {
            type: "string",
            description: "Optional short note explaining the purpose of this slide (e.g., 'Hook slide').",
          },
        },
        required: ["carouselId", "html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_slide",
      description:
        "Update the HTML content or notes of an existing slide in the carousel.",
      parameters: {
        type: "object",
        properties: {
          carouselId: {
            type: "string",
            description: "The ID of the target carousel.",
          },
          slideId: {
            type: "string",
            description: "The ID of the slide to update.",
          },
          html: {
            type: "string",
            description: "The updated slide HTML markup.",
          },
          notes: {
            type: "string",
            description: "Updated notes for this slide.",
          },
        },
        required: ["carouselId", "slideId", "html"],
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
          carouselId: {
            type: "string",
            description: "The ID of the target carousel.",
          },
          slideId: {
            type: "string",
            description: "The ID of the slide to delete.",
          },
        },
        required: ["carouselId", "slideId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_slides",
      description: "Reorder all slides in the carousel by providing the complete list of slide IDs in the desired order.",
      parameters: {
        type: "object",
        properties: {
          carouselId: {
            type: "string",
            description: "The ID of the target carousel.",
          },
          slideIds: {
            type: "array",
            description: "Array of slide IDs in the desired sequential order.",
          },
        },
        required: ["carouselId", "slideIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_carousel",
      description: "Retrieve current carousel details including all existing slides, aspect ratio, caption, and hashtags.",
      parameters: {
        type: "object",
        properties: {
          carouselId: {
            type: "string",
            description: "The ID of the carousel to fetch.",
          },
        },
        required: ["carouselId"],
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
          carouselId: {
            type: "string",
            description: "The ID of the target carousel.",
          },
          caption: {
            type: "string",
            description: "The full caption text for the Instagram post.",
          },
          hashtags: {
            type: "array",
            description: "List of relevant hashtag strings (without the '#' symbol).",
          },
        },
        required: ["carouselId", "caption", "hashtags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_style_preset",
      description: "Save a reusable visual style preset with design rules for future carousels.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Descriptive name for the style preset.",
          },
          designRules: {
            type: "string",
            description: "Detailed visual and layout rules (colors, font treatments, margins).",
          },
          aspectRatio: {
            type: "string",
            description: "Aspect ratio for this preset ('1:1', '4:5', or '9:16').",
          },
          exampleSlideHtml: {
            type: "string",
            description: "Optional reference slide HTML demonstrating the style.",
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
      description: "Safely fetch and extract textual content from an external web URL to research a topic or extract statistics.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The public HTTP or HTTPS web URL to fetch.",
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
 * Validates a web URL against SSRF and private networks.
 */
function validatePublicUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are permitted.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Access to local or private network addresses is forbidden.");
  }

  return parsed;
}

/**
 * Executes a registered native carousel tool with strict input validation.
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
        const carouselId = requireString(args, "carouselId");
        if (activeCarouselId && carouselId !== activeCarouselId) {
          throw new Error(`Target carousel ID '${carouselId}' does not match active carousel '${activeCarouselId}'.`);
        }
        const html = requireString(args, "html");
        const notes = typeof args.notes === "string" ? args.notes.trim() : "";

        const slide = await addSlide(carouselId, html, notes);
        if (!slide) {
          return {
            success: false,
            error: "Carousel not found or maximum slide limit (20) reached.",
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
        const carouselId = requireString(args, "carouselId");
        if (activeCarouselId && carouselId !== activeCarouselId) {
          throw new Error(`Target carousel ID '${carouselId}' does not match active carousel '${activeCarouselId}'.`);
        }
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
        const carouselId = requireString(args, "carouselId");
        if (activeCarouselId && carouselId !== activeCarouselId) {
          throw new Error(`Target carousel ID '${carouselId}' does not match active carousel '${activeCarouselId}'.`);
        }
        const slideId = requireString(args, "slideId");

        const ok = await deleteSlide(carouselId, slideId);
        if (!ok) {
          return {
            success: false,
            error: `Slide '${slideId}' could not be deleted or was not found in carousel '${carouselId}'.`,
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
        const carouselId = requireString(args, "carouselId");
        if (activeCarouselId && carouselId !== activeCarouselId) {
          throw new Error(`Target carousel ID '${carouselId}' does not match active carousel '${activeCarouselId}'.`);
        }
        const slideIds = requireStringArray(args, "slideIds");

        const ok = await reorderSlides(carouselId, slideIds);
        if (!ok) {
          return {
            success: false,
            error: `Could not reorder slides. Ensure all slide IDs belong to carousel '${carouselId}'.`,
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
        const carouselId = requireString(args, "carouselId");
        const carousel = await getCarousel(carouselId);
        if (!carousel) {
          return {
            success: false,
            error: `Carousel with ID '${carouselId}' not found.`,
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
              notes: s.notes,
              previewSnippet: s.html.substring(0, 150),
            })),
            caption: carousel.caption || "",
            hashtags: carousel.hashtags || [],
          },
        };
      }

      case "set_caption": {
        const carouselId = requireString(args, "carouselId");
        if (activeCarouselId && carouselId !== activeCarouselId) {
          throw new Error(`Target carousel ID '${carouselId}' does not match active carousel '${activeCarouselId}'.`);
        }
        const caption = typeof args.caption === "string" ? args.caption.trim() : "";
        const hashtags = requireStringArray(args, "hashtags");

        const updated = await updateCarousel(carouselId, {
          caption,
          hashtags: hashtags.map((h) => h.replace(/^#/, "")),
        });
        if (!updated) {
          return {
            success: false,
            error: `Carousel '${carouselId}' not found.`,
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
        const rawRatio = requireString(args, "aspectRatio");
        const validRatios: AspectRatio[] = ["1:1", "4:5", "9:16"];
        const aspectRatio: AspectRatio = validRatios.includes(rawRatio as AspectRatio)
          ? (rawRatio as AspectRatio)
          : "4:5";
        const description = typeof args.description === "string" ? args.description : "";
        const exampleSlideHtml = typeof args.exampleSlideHtml === "string" ? args.exampleSlideHtml : "";
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
        const validUrl = validatePublicUrl(urlStr);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
          const res = await fetch(validUrl.toString(), {
            headers: {
              "User-Agent": "OpenCarrusel/1.0 (+https://github.com/Hainrixz/open-carrusel)",
              Accept: "text/html,text/plain",
            },
            signal: controller.signal,
          });

          if (!res.ok) {
            return {
              success: false,
              error: `HTTP ${res.status}: ${res.statusText}`,
            };
          }

          const html = await res.text();
          // Extract text cleanly, removing scripts and styles
          const stripped = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const snippet = stripped.substring(0, 3000);
          return {
            success: true,
            data: {
              url: validUrl.toString(),
              contentSnippet: snippet,
            },
          };
        } finally {
          clearTimeout(timeout);
        }
      }

      default:
        return {
          success: false,
          error: `Unknown tool name: '${toolName}'. Supported tools: ${CAROUSEL_TOOLS.map((t) => t.function.name).join(", ")}`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

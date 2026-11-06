// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import type { BrandConfig } from "@/types/brand";
import type { Carousel } from "@/types/carousel";
import type { StylePreset } from "@/types/style-preset";
import { DIMENSIONS, MAX_SLIDES } from "@/types/carousel";

export function buildSystemPrompt(
  brand: BrandConfig,
  carousel?: Carousel | null,
  stylePreset?: StylePreset | null
): string {
  const brandSummary = brand.name
    ? `Brand: ${brand.name} | Primary: ${brand.colors.primary} | Accent: ${brand.colors.accent} | Bg: ${brand.colors.background} | Fonts: ${brand.fonts.heading}/${brand.fonts.body}`
    : "Brand: Professional minimal | Dark text on light background | Font: Inter";

  const dimensions = carousel
    ? DIMENSIONS[carousel.aspectRatio]
    : DIMENSIONS["4:5"];

  const slidesSummary = carousel && carousel.slides.length > 0
    ? carousel.slides.map((s) => `Slide ${s.order + 1} (${s.id}): ${s.notes || "Slide"}`).join(", ")
    : "No slides yet";

  return `You are the AI design engine for Open Carrusel. Proactively create and edit Instagram carousels.

Current Carousel ID: ${carousel?.id || "unknown"}
Dimensions: ${dimensions.width}x${dimensions.height}px (${carousel?.aspectRatio || "4:5"})
${brandSummary}
Current Slides: ${slidesSummary}
${stylePreset ? `Active Style Preset: "${stylePreset.name}" - ${stylePreset.designRules}` : ""}

### Rules:
1. Always call native tools for actions:
   - 'create_slide': Create a new slide.
   - 'update_slide': Update slide HTML.
   - 'delete_slide': Remove slide.
   - 'reorder_slides': Change slide order.
   - 'set_caption': Save Instagram caption and hashtags.
2. Slide HTML Rules (CRITICAL):
   - Body-level HTML only (NO <!DOCTYPE>, <html>, <head>, or <body>).
   - Exact size: width: ${dimensions.width}px; height: ${dimensions.height}px; overflow: hidden;
   - Inline styles or <style> tags only.
   - No JavaScript (blocked by sandbox).
   - Use Google Fonts in font-family.
   - Flexbox or CSS Grid for layouts.
3. Multi-slide Workflow:
   - When given a topic, sequentially call 'create_slide' for each slide (e.g. 3 slides: Slide 1 Hook, Slide 2 Key Insight/Value, Slide 3 Summary & CTA).
   - Once slides are created, call 'set_caption' with the post caption and hashtags.
   - Keep final text response to 1-2 brief sentences describing what was created.`;
}

// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import type { BrandConfig } from "@/types/brand";
import type { Carousel } from "@/types/carousel";
import type { StylePreset } from "@/types/style-preset";
import { DIMENSIONS, MAX_SLIDES } from "@/types/carousel";
import { resolveEffectivePalette, type DesignPalette } from "./design-palette";

export function buildSystemPrompt(
  brand: BrandConfig,
  carousel?: Carousel | null,
  stylePreset?: StylePreset | null,
  userMessage?: string
): string {
  const palette: DesignPalette = resolveEffectivePalette(userMessage || "", brand);

  const dimensions = carousel
    ? DIMENSIONS[carousel.aspectRatio]
    : DIMENSIONS["4:5"];

  const slidesSummary =
    carousel && carousel.slides.length > 0
      ? carousel.slides
          .map((s) => `Slide ${s.order + 1} (${s.id}): ${s.notes || "Slide"}`)
          .join(", ")
      : "No slides yet";

  return `You are the AI visual presentation designer for Open Carrusel.
Canvas: ${dimensions.width}x${dimensions.height}px (${carousel?.aspectRatio || "4:5"}).
Active Carousel: ${carousel?.id || "active"} | Slides: ${slidesSummary}
${stylePreset ? `Preset: "${stylePreset.name}" - ${stylePreset.designRules}` : ""}

### MANDATORY DESIGN PALETTE (Strict consistency across all slides):
- Background: ${palette.background}
- Card/Surface Container: ${palette.surface}
- Primary Brand Accent: ${palette.accent}
- Main Text: ${palette.text}
- Muted/Secondary Text: ${palette.muted}
- Borders/Dividers: ${palette.border}
${userMessage ? `* Note: User specified colors have been mapped to this palette. Never use red or random default colors when blue, white, or teal was requested!` : ""}

### DESIGN INTELLIGENCE & QUALITY RULES:
1. NEVER PRODUCE PLAIN TEXT DOCUMENTS.
   - Use visual cards, highlighted keywords, structured grids, badges, and metric boxes.
   - Every slide must feel like a premium Instagram presentation carousel, not a text article.
   - Keep whitespace balanced (60-80px padding).
2. DIVERSE SLIDE LAYOUTS (Do NOT make all slides identical):
   - Slide 1: Hero / Hook title (tagline badge, bold 70px+ headline, swipe indicator).
   - Slide 2: Feature grid or Comparison (2-column cards, checkmarks/crosses).
   - Slide 3: Statistics / Infographic (giant 100px+ metric number + descriptive callout).
   - Slide 4+: Step-by-step roadmap or Conclusion summary with a Call-To-Action button box.
3. VISUAL ELEMENTS:
   - Use clean inline SVG icons (star, check, cross, sparkles, arrow_right) with accent coloring.
   - Add visual badge tags: \`display:inline-flex;padding:8px 16px;border-radius:100px;font-weight:700;\`
   - Use glowing container accents: \`border:1px solid ${palette.border};box-shadow:0 8px 24px rgba(0,0,0,0.1);\`
4. TOOL CALLING DISCIPLINE:
   - Call 'create_slide' with valid HTML for each slide.
   - Body-level HTML only. Root element MUST have:
     style="width:${dimensions.width}px;height:${dimensions.height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;overflow:hidden;"
   - NEVER output raw HTML in conversational text. Always call the 'create_slide' tool.`;
}

export function buildClaudeSystemPrompt(
  brand: BrandConfig,
  carousel?: Carousel | null,
  stylePreset?: StylePreset | null,
  userMessage?: string
): string {
  const palette: DesignPalette = resolveEffectivePalette(userMessage || "", brand);
  const apiHost = `http://127.0.0.1:${process.env.PORT || 3000}`;

  const dimensions = carousel
    ? DIMENSIONS[carousel.aspectRatio]
    : DIMENSIONS["4:5"];

  const brandSection = brand.name
    ? `## Brand identity
- Name: ${brand.name}
- Primary: ${palette.accent} | Secondary: ${brand.colors.secondary || palette.muted} | Accent: ${palette.accent}
- Background: ${palette.background} | Surface: ${palette.surface}
- Heading font: "${brand.fonts.heading}" | Body font: "${brand.fonts.body}"
- Logo: ${brand.logoPath ? brand.logoPath : "none"}
- Style: ${brand.styleKeywords.length > 0 ? brand.styleKeywords.join(", ") : "professional, clean"}`
    : `## Brand identity
- Background: ${palette.background} | Surface: ${palette.surface} | Accent: ${palette.accent}
- Text: ${palette.text} | Muted: ${palette.muted}`;

  const carouselSection = carousel
    ? `## Current carousel
- ID: ${carousel.id}
- Name: "${carousel.name}"
- Aspect ratio: ${carousel.aspectRatio} (${dimensions.width}x${dimensions.height}px)
- Slides: ${carousel.slides.length}/${MAX_SLIDES}
${carousel.slides.length > 0 ? carousel.slides.map((s) => `  - Slide ${s.order + 1} (ID: ${s.id})${s.notes ? ` — ${s.notes}` : ""}`).join("\n") : "  (no slides yet)"}
${(carousel.referenceImages?.length ?? 0) > 0 ? `\n## Reference images (use Read to view these)\n${carousel.referenceImages.map((r) => `- "${r.name}" → ${r.absPath}`).join("\n")}` : ""}`
    : "";

  const presetSection = stylePreset
    ? `## Active style preset: "${stylePreset.name}"
Follow these design rules for ALL slides:
${stylePreset.designRules}`
    : "";

  return `You are the autonomous AI design engine for Open Carrusel. You create stunning Instagram carousels proactively — don't wait for permission, just create.

${brandSection}

${carouselSection}

${presetSection}

### MANDATORY DESIGN PALETTE (Strict consistency across all slides):
- Background: ${palette.background}
- Card/Surface Container: ${palette.surface}
- Primary Accent: ${palette.accent}
- Main Text: ${palette.text}
- Muted/Secondary Text: ${palette.muted}
- Borders/Dividers: ${palette.border}
${userMessage ? `* Note: User specified colors have been mapped to this palette. Never use red or random default colors when blue, white, or teal was requested!` : ""}

## AUTONOMOUS MODE — How you work

### When the user gives you a TOPIC or IDEA:
1. Immediately start creating slides using the API below — don't ask "what do you want?"
2. Plan an engaging narrative arc:
   - Slide 1: HOOK — provocative question or bold headline with a swipe indicator
   - Slide 2: Feature grid or comparison cards
   - Slide 3: Big stat/infographic or core insight
   - Final Slide: CTA (Call To Action) box
3. Create each slide via the API using curl, one by one.
4. After all slides are created, offer to generate caption + hashtags.

## API — Use curl for all slide operations

### Create a slide:
curl -s -X POST ${apiHost}/api/carousels/${carousel?.id || "{ID}"}/slides \\
  -H "Content-Type: application/json" \\
  -d '{"html": "YOUR_HTML_HERE", "notes": "description"}'

### Update a slide:
curl -s -X PUT ${apiHost}/api/carousels/${carousel?.id || "{ID}"}/slides/{SLIDE_ID} \\
  -H "Content-Type: application/json" \\
  -d '{"html": "UPDATED_HTML"}'

### Delete a slide:
curl -s -X DELETE ${apiHost}/api/carousels/${carousel?.id || "{ID}"}/slides/{SLIDE_ID}

### Save caption + hashtags:
curl -s -X PUT ${apiHost}/api/carousels/${carousel?.id || "{ID}"}/caption \\
  -H "Content-Type: application/json" \\
  -d '{"caption": "Your caption text...", "hashtags": ["tag1", "tag2", "tag3"]}'

## Slide HTML rules (CRITICAL)

Each slide is BODY-LEVEL HTML only. No <!DOCTYPE>, <html>, <head>, or <body> tags — the system adds those.
1. Inline styles or <style> tags only — no external CSS.
2. Root element MUST have:
   style="width:${dimensions.width}px;height:${dimensions.height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;overflow:hidden;"
3. Use diverse visual components: cards, badges, inline SVGs, and highlighted callouts.
4. Keep critical content within safe margins.`;
}

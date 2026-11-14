import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractColorPreferences,
  resolveEffectivePalette,
  PRESET_PALETTES,
} from "./design-palette";
import {
  SlideLayouts,
  renderSvgIcon,
  sanitizeSlideImageUrl,
} from "./slide-layouts";
import { wrapSlideHtml } from "./slide-html";

test("Theme & Color: extracts user requested blue, white and teal colors", () => {
  const result = extractColorPreferences("Create a 4-slide carousel using blue, white and teal colors for an AI startup");
  assert.equal(result.hasBlue, true);
  assert.equal(result.hasTeal, true);
  assert.equal(result.hasWhite, true);
});

test("Theme & Color: user requested blue/teal never falls back to red accents", () => {
  const defaultBrandWithRed = {
    colors: {
      primary: "#1a1a2e",
      secondary: "#16213e",
      accent: "#e94560", // default red/pink accent
      background: "#ffffff",
    },
  };

  const palette = resolveEffectivePalette(
    "Please use blue and teal colors with a dark modern theme",
    defaultBrandWithRed
  );

  // Palette must use cyan/teal accent (#06b6d4 or #0d9488), never the brand's #e94560 red
  assert.notEqual(palette.accent.toLowerCase(), "#e94560");
  assert.equal(palette.accent, "#06b6d4");
  assert.match(palette.name || "", /blue & teal/i);
});

test("Theme & Color: light theme with blue and white correctly maps light background", () => {
  const palette = resolveEffectivePalette("Create 4 slides with blue, white and teal in clean light theme");
  assert.equal(palette.background, "#ffffff");
  assert.equal(palette.accent, "#0d9488"); // teal
  assert.notEqual(palette.accent, "#e94560"); // not red
});

test("Multiple Slide Layouts: hero layout generates valid styled HTML", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.hero({
    tagline: "AI REVOLUTION",
    headline: "Unlocking Intelligent Workflows",
    subheadline: "How high-leverage teams scale without headcount",
    palette,
  });

  assert.match(html, /Unlocking Intelligent Workflows/);
  assert.match(html, /Swipe to read/);
  assert.match(html, new RegExp(palette.accent));
  assert.match(html, /svg/i); // includes visual SVG icon
});

test("Multiple Slide Layouts: feature grid generates 2-column cards", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.featureGrid({
    title: "Core Architecture",
    features: [
      { title: "Smart Prompts", desc: "Targeted context", icon: "sparkles" },
      { title: "Native Tools", desc: "Full control", icon: "shield" },
    ],
    palette,
  });

  assert.match(html, /grid-template-columns:1fr 1fr/);
  assert.match(html, /Smart Prompts/);
  assert.match(html, /Native Tools/);
});

test("Multiple Slide Layouts: stat infographic renders giant metric callout", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.statInfographic({
    title: "Performance Metrics",
    bigStat: "94.2%",
    statLabel: "Accuracy improvement across agent tasks",
    supportingPoints: [{ label: "Latency", text: "Reduced by 3x" }],
    palette,
  });

  assert.match(html, /94\.2%/);
  assert.match(html, /font-size:110px/);
  assert.match(html, /Accuracy improvement/);
});

test("Multiple Slide Layouts: comparison layout renders side-by-side contrasts", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.comparison({
    title: "Traditional vs Modern",
    leftTitle: "Legacy Way",
    leftPoints: ["Slow manual edits", "Inconsistent styles"],
    rightTitle: "Open Carrusel Way",
    rightPoints: ["Instant AI layouts", "Perfect brand fidelity"],
    palette,
  });

  assert.match(html, /Legacy Way/);
  assert.match(html, /Open Carrusel Way/);
  assert.match(html, /Instant AI layouts/);
});

test("Multiple Slide Layouts: timeline layout renders step numbers", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.timeline({
    title: "Implementation Roadmap",
    steps: [
      { stepNumber: 1, label: "Audit Needs", desc: "Identify key slides" },
      { stepNumber: 2, label: "Generate Draft", desc: "Run Open Carrusel" },
    ],
    palette,
  });

  assert.match(html, /Audit Needs/);
  assert.match(html, /Generate Draft/);
  assert.match(html, /STEP-BY-STEP PROCESS/);
});

test("Multiple Slide Layouts: conclusion layout renders call to action", () => {
  const palette = PRESET_PALETTES.blueTeal;
  const html = SlideLayouts.conclusion({
    title: "Summary & Key Takeaways",
    takeaways: ["Structure before copy", "Visual diversity drives retention"],
    callToAction: "Bookmark this guide for your next presentation",
    palette,
  });

  assert.match(html, /Summary & Key Takeaways/);
  assert.match(html, /Visual diversity drives retention/);
  assert.match(html, /Save Post/);
});

test("Visual Elements & Images: SVG icons render properly", () => {
  const checkIcon = renderSvgIcon("check", "#06b6d4", 24);
  assert.match(checkIcon, /<svg/);
  assert.match(checkIcon, /stroke="#06b6d4"/);
  assert.match(checkIcon, /polyline/);
});

test("Visual Elements & Images: image sanitization blocks arbitrary unverified external domains", () => {
  assert.equal(sanitizeSlideImageUrl("http://random-untrusted-site.com/pic.jpg"), null);
  assert.equal(sanitizeSlideImageUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeSlideImageUrl("/uploads/slide-photo.png"), "/uploads/slide-photo.png");
  assert.equal(
    sanitizeSlideImageUrl("https://images.unsplash.com/photo-123456"),
    "https://images.unsplash.com/photo-123456"
  );
});

test("Renderer Integration: wrapSlideHtml handles graceful image fallback CSS", () => {
  const wrapped = wrapSlideHtml("<div class='slide'>Hello</div>", "4:5");
  assert.match(wrapped, /img\[src=""\], img:not\(\[src\]\) \{ display: none !important; \}/);
});


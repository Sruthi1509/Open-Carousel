// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

import type { DesignPalette } from "./design-palette";

export type SlideLayoutType =
  | "hero"
  | "split"
  | "feature_grid"
  | "stat_infographic"
  | "comparison"
  | "timeline"
  | "conclusion";

export interface ReusableIcon {
  name: "check" | "cross" | "arrow_right" | "chart" | "star" | "sparkles" | "lightbulb" | "shield" | "target";
}

/**
 * Returns inline clean SVG markup for requested icon without relying on external CDNs or network.
 */
export function renderSvgIcon(name: string, color = "currentColor", size = 28): string {
  switch (name) {
    case "check":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    case "cross":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case "arrow_right":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    case "chart":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    case "star":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    case "sparkles":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
    case "shield":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    case "target":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    case "lightbulb":
    default:
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
  }
}

/**
 * Validates or falls back an image URL securely (only allows internal uploads, data URLs, or approved HTTPS unpkg/unsplash CDNs).
 * Never uses unverified domains.
 */
export function sanitizeSlideImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  if (trimmed.startsWith("https://images.unsplash.com/") || trimmed.startsWith("https://assets.")) {
    return trimmed;
  }
  return null;
}

/**
 * Builds HTML for 7 modern, high-engagement Instagram carousel slide layouts.
 */
export const SlideLayouts = {
  hero(options: {
    tagline?: string;
    headline: string;
    subheadline?: string;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { tagline = "CAROUSEL GUIDE", headline, subheadline = "", palette, width = 1080, height = 1350 } = options;
    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:96px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;position:relative;overflow:hidden;">
  <!-- Background Glow Element -->
  <div style="position:absolute;top:-120px;right:-120px;width:500px;height:500px;background:${palette.accent};opacity:0.12;filter:blur(100px);border-radius:50%;pointer-events:none;"></div>
  
  <!-- Header Tag -->
  <div style="display:flex;align-items:center;gap:12px;z-index:2;">
    <div style="background:${palette.surface};border:1px solid ${palette.border};color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border-radius:100px;display:flex;align-items:center;gap:8px;">
      ${renderSvgIcon("sparkles", palette.accent, 18)}
      <span>${tagline}</span>
    </div>
  </div>

  <!-- Center Content -->
  <div style="margin:auto 0;z-index:2;">
    <h1 style="font-size:72px;line-height:1.12;font-weight:800;letter-spacing:-1.5px;color:${palette.text};margin:0 0 32px 0;">
      ${headline}
    </h1>
    ${subheadline ? `<p style="font-size:28px;line-height:1.45;color:${palette.muted};margin:0;max-width:880px;font-weight:400;">${subheadline}</p>` : ""}
  </div>

  <!-- Footer Hook -->
  <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${palette.border};padding-top:36px;z-index:2;">
    <span style="font-size:20px;color:${palette.muted};font-weight:500;">Swipe to read</span>
    <div style="width:48px;height:48px;background:${palette.accent};color:${palette.background};border-radius:50%;display:flex;align-items:center;justify-content:center;">
      ${renderSvgIcon("arrow_right", palette.background, 24)}
    </div>
  </div>
</div>`.trim();
  },

  featureGrid(options: {
    category?: string;
    title: string;
    features: Array<{ title: string; desc: string; icon?: string }>;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { category = "KEY PRINCIPLES", title, features, palette, width = 1080, height = 1350 } = options;
    const cards = features.slice(0, 4).map((f) => `
      <div style="background:${palette.surface};border:1px solid ${palette.border};border-radius:24px;padding:36px;display:flex;flex-direction:column;gap:16px;">
        <div style="width:52px;height:52px;background:rgba(6,182,212,0.12);border-radius:14px;display:flex;align-items:center;justify-content:center;">
          ${renderSvgIcon(f.icon || "star", palette.accent, 26)}
        </div>
        <h3 style="font-size:26px;font-weight:700;color:${palette.text};margin:0;line-height:1.25;">${f.title}</h3>
        <p style="font-size:18px;line-height:1.45;color:${palette.muted};margin:0;">${f.desc}</p>
      </div>
    `).join("");

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;position:relative;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${category}</div>
    <h2 style="font-size:48px;line-height:1.15;font-weight:800;letter-spacing:-0.5px;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:40px 0;">
    ${cards}
  </div>

  <div style="display:flex;justify-content:flex-end;border-top:1px solid ${palette.border};padding-top:24px;">
    <span style="font-size:18px;color:${palette.muted};">Open Carrusel</span>
  </div>
</div>`.trim();
  },

  statInfographic(options: {
    category?: string;
    title: string;
    bigStat: string;
    statLabel: string;
    supportingPoints?: Array<{ label: string; text: string }>;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { category = "DATA INSIGHT", title, bigStat, statLabel, supportingPoints = [], palette, width = 1080, height = 1350 } = options;
    const points = supportingPoints.map((p) => `
      <div style="background:${palette.surface};border:1px solid ${palette.border};border-radius:20px;padding:24px 32px;display:flex;align-items:center;gap:20px;">
        <div style="color:${palette.accent};">${renderSvgIcon("check", palette.accent, 24)}</div>
        <div>
          <div style="font-size:20px;font-weight:700;color:${palette.text};margin-bottom:4px;">${p.label}</div>
          <div style="font-size:16px;color:${palette.muted};line-height:1.35;">${p.text}</div>
        </div>
      </div>
    `).join("");

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:88px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;position:relative;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${category}</div>
    <h2 style="font-size:52px;line-height:1.18;font-weight:800;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="background:${palette.surface};border:2px solid ${palette.border};border-radius:32px;padding:56px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${palette.accent};"></div>
    <div style="font-size:110px;line-height:1;font-weight:900;color:${palette.accent};letter-spacing:-3px;margin-bottom:12px;">${bigStat}</div>
    <div style="font-size:26px;font-weight:600;color:${palette.text};max-width:680px;margin:0 auto;line-height:1.35;">${statLabel}</div>
  </div>

  <div style="display:flex;flex-direction:column;gap:16px;">
    ${points}
  </div>
</div>`.trim();
  },

  comparison(options: {
    category?: string;
    title: string;
    leftTitle: string;
    leftPoints: string[];
    rightTitle: string;
    rightPoints: string[];
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { category = "COMPARISON", title, leftTitle = "Old Way", leftPoints = [], rightTitle = "Better Way", rightPoints = [], palette, width = 1080, height = 1350 } = options;
    const leftItems = leftPoints.map(p => `
      <div style="display:flex;align-items:flex-start;gap:14px;font-size:18px;color:${palette.muted};line-height:1.4;">
        <span style="color:#ef4444;flex-shrink:0;">${renderSvgIcon("cross", "#ef4444", 22)}</span>
        <span>${p}</span>
      </div>
    `).join("");

    const rightItems = rightPoints.map(p => `
      <div style="display:flex;align-items:flex-start;gap:14px;font-size:18px;color:${palette.text};font-weight:500;line-height:1.4;">
        <span style="color:${palette.accent};flex-shrink:0;">${renderSvgIcon("check", palette.accent, 22)}</span>
        <span>${p}</span>
      </div>
    `).join("");

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${category}</div>
    <h2 style="font-size:48px;line-height:1.15;font-weight:800;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:40px 0;">
    <!-- Left Column (Avoid/Negative) -->
    <div style="background:${palette.surface};border:1px solid rgba(239,68,68,0.25);border-radius:24px;padding:36px;display:flex;flex-direction:column;gap:20px;">
      <h3 style="font-size:24px;font-weight:700;color:#ef4444;margin:0 0 10px 0;">${leftTitle}</h3>
      ${leftItems}
    </div>

    <!-- Right Column (Ideal/Positive) -->
    <div style="background:${palette.surface};border:2px solid ${palette.accent};border-radius:24px;padding:36px;display:flex;flex-direction:column;gap:20px;box-shadow:0 12px 32px rgba(6,182,212,0.12);">
      <h3 style="font-size:24px;font-weight:700;color:${palette.accent};margin:0 0 10px 0;">${rightTitle}</h3>
      ${rightItems}
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;border-top:1px solid ${palette.border};padding-top:24px;color:${palette.muted};font-size:18px;">
    <span>Key Takeaway</span>
    <span>Swipe for more &rarr;</span>
  </div>
</div>`.trim();
  },

  timeline(options: {
    category?: string;
    title: string;
    steps: Array<{ stepNumber: number | string; label: string; desc: string }>;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { category = "STEP-BY-STEP PROCESS", title, steps, palette, width = 1080, height = 1350 } = options;
    const stepCards = steps.slice(0, 4).map((s, idx) => `
      <div style="display:flex;gap:28px;align-items:flex-start;position:relative;">
        <div style="width:56px;height:56px;background:${palette.accent};color:${palette.background};border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0;">
          ${s.stepNumber || idx + 1}
        </div>
        <div style="background:${palette.surface};border:1px solid ${palette.border};border-radius:20px;padding:28px 32px;flex:1;">
          <h4 style="font-size:24px;font-weight:700;color:${palette.text};margin:0 0 8px 0;">${s.label}</h4>
          <p style="font-size:18px;line-height:1.45;color:${palette.muted};margin:0;">${s.desc}</p>
        </div>
      </div>
    `).join("");

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:88px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${category}</div>
    <h2 style="font-size:50px;line-height:1.15;font-weight:800;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="display:flex;flex-direction:column;gap:24px;margin:36px 0;">
    ${stepCards}
  </div>

  <div style="border-top:1px solid ${palette.border};padding-top:24px;color:${palette.muted};font-size:18px;">
    <span>Follow this roadmap for best results</span>
  </div>
</div>`.trim();
  },

  conclusion(options: {
    tagline?: string;
    title: string;
    takeaways: string[];
    callToAction: string;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { tagline = "SUMMARY & ACTION", title, takeaways = [], callToAction, palette, width = 1080, height = 1350 } = options;
    const items = takeaways.map(t => `
      <div style="display:flex;align-items:center;gap:18px;background:${palette.surface};border:1px solid ${palette.border};border-radius:18px;padding:24px 30px;">
        <div style="color:${palette.accent};flex-shrink:0;">${renderSvgIcon("check", palette.accent, 24)}</div>
        <span style="font-size:20px;font-weight:600;color:${palette.text};line-height:1.35;">${t}</span>
      </div>
    `).join("");

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:88px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${tagline}</div>
    <h2 style="font-size:52px;line-height:1.15;font-weight:800;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="display:flex;flex-direction:column;gap:18px;margin:32px 0;">
    ${items}
  </div>

  <!-- Call to Action Box -->
  <div style="background:${palette.surface};border:2px solid ${palette.accent};border-radius:24px;padding:32px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:22px;font-weight:700;color:${palette.text};margin-bottom:4px;">Ready to implement?</div>
      <div style="font-size:16px;color:${palette.muted};">${callToAction}</div>
    </div>
    <div style="background:${palette.accent};color:${palette.background};padding:14px 28px;border-radius:100px;font-size:18px;font-weight:700;">
      Save Post
    </div>
  </div>
</div>`.trim();
  },

  split(options: {
    tagline?: string;
    title: string;
    description: string;
    bullets?: string[];
    imageUrl?: string | null;
    palette: DesignPalette;
    width?: number;
    height?: number;
  }): string {
    const { tagline = "SPOTLIGHT", title, description, bullets = [], imageUrl = null, palette, width = 1080, height = 1350 } = options;
    const bulletList = bullets.map(b => `
      <div style="display:flex;align-items:center;gap:12px;font-size:18px;color:${palette.muted};">
        <span style="color:${palette.accent};">${renderSvgIcon("star", palette.accent, 20)}</span>
        <span>${b}</span>
      </div>
    `).join("");

    const visualSide = imageUrl
      ? `<div style="flex:1;border-radius:24px;overflow:hidden;border:1px solid ${palette.border};background:#000;">
           <img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
         </div>`
      : `<div style="flex:1;border-radius:24px;background:${palette.surface};border:1px solid ${palette.border};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">
           <div style="width:72px;height:72px;background:rgba(6,182,212,0.12);border-radius:20px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
             ${renderSvgIcon("target", palette.accent, 36)}
           </div>
           <div style="font-size:24px;font-weight:700;color:${palette.text};margin-bottom:8px;">Core Insight</div>
           <div style="font-size:16px;color:${palette.muted};line-height:1.4;">Focus on deep visual hierarchy over dense text blocks</div>
         </div>`;

    return `
<div style="width:${width}px;height:${height}px;background:${palette.background};color:${palette.text};box-sizing:border-box;padding:88px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:'Inter',sans-serif;">
  <div>
    <div style="color:${palette.accent};font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">${tagline}</div>
    <h2 style="font-size:50px;line-height:1.15;font-weight:800;color:${palette.text};margin:0;">${title}</h2>
  </div>

  <div style="display:flex;gap:36px;height:680px;margin:32px 0;">
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;">
      <p style="font-size:22px;line-height:1.5;color:${palette.muted};margin:0;">${description}</p>
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${bulletList}
      </div>
    </div>
    ${visualSide}
  </div>

  <div style="border-top:1px solid ${palette.border};padding-top:24px;color:${palette.muted};font-size:18px;">
    <span>Swipe for the next section</span>
  </div>
</div>`.trim();
  },
};

/**
 * template.ts: HTML for the share cards and app icons, rendered to PNG by
 * build-og-images.ts. Colours are the rebuild's design tokens
 * (src/styles/global.css); type is the site's own webfont stack.
 *
 * Card layout (brand brief §6): Warm Paper ground, loon mark at ~25% width
 * on the left, eyebrow + title + verdict/description + domain line on the
 * right, Deep Pine footer band with the wordmark. No photos, no gradients.
 */

import { loonMarkSvg } from "../../lib/loon-mark";
import { OG_DOMAIN, OG_WIDTH, OG_HEIGHT, type OgEntry } from "../../lib/og";

const T = {
  paper: "#f7f2e8",
  lake950: "#0b1f1c",
  pine700: "#1f5247",
  moss100: "#e3ece6",
  ink: "#16201d",
  inkSoft: "#4b5753",
  onDark: "#f2ede2",
  onDarkSoft: "#b9c8c2",
  gold: "#c9971f",
  goldBright: "#e4b94e",
  goldDeep: "#7c5a0f",
};

/** Card title face. The brand brief names Inter Tight; the rebuild's display face is used instead. */
const TITLE_FONT = `"Fraunces", Georgia, serif`;
const BODY_FONT = `"Instrument Sans", system-ui, sans-serif`;

const BAND_H = 92;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const WORDMARK = `Loonie<em>Logic</em>`;

/** `fontCss`: the site's @font-face rules with the files inlined (fonts.ts). */
function page(body: string, css: string, fontCss: string): string {
  return `<!doctype html><html lang="en-CA"><head><meta charset="utf-8">
<style>${fontCss}</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden}
body{font-family:${BODY_FONT};-webkit-font-smoothing:antialiased}
.wm{font-family:"Fraunces",serif;font-optical-sizing:auto;font-weight:650;letter-spacing:-0.03em;line-height:1}
.wm em{font-style:italic;font-weight:500}
${css}
</style></head><body>${body}</body></html>`;
}

export function cardHtml(e: OgEntry, fontCss: string): string {
  const css = `
body{background:${T.paper};color:${T.ink}}
.main{position:absolute;left:0;top:0;right:0;bottom:${BAND_H}px;display:flex;align-items:center;padding:0 72px 0 64px;gap:56px}
.mark{flex:0 0 250px;display:flex;justify-content:center}
.mark svg{width:250px;height:250px;display:block}
.col{flex:1;min-width:0;display:flex;flex-direction:column;gap:22px}
.eyebrow{display:flex;align-items:center;gap:14px;font-weight:600;font-size:21px;letter-spacing:.16em;text-transform:uppercase;color:${T.goldDeep}}
.eyebrow::before{content:"";width:40px;height:3px;background:${T.gold};border-radius:2px}
.title{font-family:${TITLE_FONT};font-optical-sizing:auto;font-weight:700;font-size:70px;line-height:1.04;letter-spacing:-0.022em;text-wrap:balance;color:${T.ink}}
.line{font-size:27px;line-height:1.35;color:${T.inkSoft};text-wrap:pretty}
.line.verdict{color:${T.ink};font-weight:500}
.tag{display:inline-block;background:${T.moss100};color:${T.pine700};font-weight:700;font-size:18px;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;border-radius:6px;margin-right:12px;vertical-align:4px}
.domain{font-weight:600;font-size:22px;letter-spacing:.02em;color:${T.pine700}}
.band{position:absolute;left:0;right:0;bottom:0;height:${BAND_H}px;background:${T.lake950};display:flex;align-items:center;padding:0 64px}
.band .wm{font-size:36px;color:${T.onDark}}
.band .wm em{color:${T.goldBright}}
`;
  const eyebrow = e.eyebrow ? `<p class="eyebrow">${esc(e.eyebrow)}</p>` : "";
  const line = e.isVerdict
    ? `<p class="line verdict"><span class="tag">Verdict</span>${esc(e.line)}</p>`
    : `<p class="line">${esc(e.line)}</p>`;
  return page(
    `<div class="main">
  <div class="mark">${loonMarkSvg({ size: 250 })}</div>
  <div class="col">${eyebrow}<h1 class="title">${esc(e.title)}</h1>${line}<p class="domain">${esc(OG_DOMAIN)}</p></div>
</div>
<div class="band"><span class="wm">${WORDMARK}</span></div>`,
    css,
    fontCss,
  );
}

/** Alt fallback (brand brief §6): a plain-colour card with the wordmark, for pages without art. */
export function wordmarkHtml(fontCss: string): string {
  const css = `
body{background:${T.lake950};color:${T.onDark};display:flex;align-items:center;justify-content:center}
.lockup{display:flex;align-items:center;gap:48px}
.lockup svg{width:200px;height:200px;display:block}
.wm{font-size:112px;color:${T.onDark}}
.wm em{color:${T.goldBright}}
.domain{margin-top:22px;font-weight:600;font-size:28px;letter-spacing:.04em;color:${T.onDarkSoft}}
`;
  return page(
    `<div class="lockup">${loonMarkSvg({ size: 200 })}<div><p class="wm">${WORDMARK}</p><p class="domain">${esc(OG_DOMAIN)}</p></div></div>`,
    css,
    fontCss,
  );
}

/**
 * App icon: the mark at `scale` of the canvas, centred, on `background`
 * (transparent when omitted).
 */
export function iconHtml(size: number, scale: number, background?: string): string {
  const inner = Math.round(size * scale);
  return `<!doctype html><html><head><style>
*{margin:0;padding:0}
html,body{width:${size}px;height:${size}px;overflow:hidden;background:${background ?? "transparent"}}
body{display:flex;align-items:center;justify-content:center}
svg{display:block}
</style></head><body>${loonMarkSvg({ size: inner })}</body></html>`;
}

/** Deep Pine ground for the opaque icons (apple-touch, maskable); matches theme-color. */
export const ICON_BACKGROUND = T.lake950;

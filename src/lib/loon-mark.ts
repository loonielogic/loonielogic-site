/**
 * loon-mark.ts: the LoonieLogic brand mark as an SVG string, so the header,
 * footer, 404 page, and favicon all draw from one source.
 *
 * The mark is an 11-sided gold coin (the loonie's real shape) carrying a
 * common loon in profile: black head and body, dagger bill, white necklace
 * and back checks, red eye, riding a waterline. Built on a 64 x 64 grid and
 * kept to a bold silhouette so it still reads at 24px.
 */

const COIN = "M32 1.5L48.49 6.34L59.74 19.33L62.19 36.34L55.05 51.97L40.59 61.26L23.41 61.26L8.95 51.97L1.81 36.34L4.26 19.33L15.51 6.34Z";
const RIM = "M32 5L46.6 9.29L56.56 20.78L58.73 35.84L52.41 49.68L39.61 57.91L24.39 57.91L11.59 49.68L5.27 35.84L7.44 20.78L17.4 9.29Z";
const LOON =
  "M10.5 30.4L21.4 26.6C22.4 22.6 25 21 27.8 21.2C31 21.4 33 24 33 27.4C33 30.4 34 32.6 37.5 33.2C43 33.6 50 34 54.5 36.4C53.8 38.6 52.6 40.2 50.6 41L24.6 41C21.4 39.6 20.4 36.2 21.6 33.2C21.8 31.6 21.6 30.6 21 30Z";

const CHECKS = [
  [38.5, 35.6], [41.5, 35.5], [44.5, 35.6], [47.5, 35.9],
  [37, 38.1], [40, 38], [43, 38], [46, 38.1], [49, 38.3],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.62"/>`)
  .join("");

export interface LoonMarkOptions {
  size?: number;
  /** Accessible name; omit for decorative use (aria-hidden). */
  title?: string;
  className?: string;
}

export function loonMarkSvg({ size = 32, title, className }: LoonMarkOptions = {}): string {
  const a11y = title ? `role="img" aria-label="${title}"` : `aria-hidden="true" focusable="false"`;
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" ${a11y}>`
    + `<path d="${COIN}" fill="#E1B24A"/>`
    + `<path d="${RIM}" fill="none" stroke="#9C7416" stroke-width="1.1" stroke-linejoin="round"/>`
    + `<path d="${LOON}" fill="#111a17"/>`
    + `<path d="M29 30.1l3.4-.95M29.4 31.8l3.2-.85" stroke="#F7F2E8" stroke-width=".85" stroke-linecap="round"/>`
    + `<g fill="#F7F2E8">${CHECKS}</g>`
    + `<circle cx="25.7" cy="24.9" r="1.45" fill="#C8322B"/>`
    + `<path d="M9.5 42.6H54.5" stroke="#5E440C" stroke-width="1.7" stroke-linecap="round"/>`
    + `<path d="M16 47.4H48" stroke="#5E440C" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>`
    + `</svg>`;
}

/** Data URI for <link rel="icon">. */
export const loonFaviconHref = `data:image/svg+xml,${encodeURIComponent(loonMarkSvg({ size: 64 }))}`;

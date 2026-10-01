/**
 * calc-kit.ts: small shared helpers for the wave 3 results renderers
 * (income tax, TFSA vs RRSP, RRSP room, house affordability, rent vs buy).
 * Formatting and markup snippets only; no math lives here. The classes match
 * src/styles/calc-kit.css.
 */

import type { FigureLog } from "./figures";

const whole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole dollars: 1234.5 -> "$1,235". */
export const $ = (n: number) => (Number.isFinite(n) ? whole.format(Math.round(n)) : "n/a");
/** Dollars and cents: 1234.5 -> "$1,234.50". */
export const $c = (n: number) => (Number.isFinite(n) ? cents.format(Math.round(n * 100) / 100) : "n/a");
/** 0.3148 -> "31.48%" (digits = 2); trailing zeros dropped. */
export const pct = (n: number, digits = 2) => `${Number((n * 100).toFixed(digits))}%`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2027-03-01" -> "March 1, 2027" (no Date parsing, so no time-zone drift). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const flag = (text: string) => `<span class="ck-flag">${text}</span>`;
/** The required label for any figure the research has not verified. */
export const NOT_VERIFIED = `<span class="ck-flag ck-flag-unverified">Not yet verified</span>`;

export const card = (title: string, body: string) => `<section class="ck-card"><h2>${title}</h2>${body}</section>`;

export function row(label: string, value: string, cls = ""): string {
  return `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${label}</th><td>${value}</td></tr>`;
}

export function table(rows: string[], caption = "", head = ""): string {
  return `<div class="ck-table-wrap"><table class="ck-table">${caption ? `<caption>${caption}</caption>` : ""}${head}<tbody>${rows.join("")}</tbody></table></div>`;
}

export function facts(items: [string, string, boolean?][]): string {
  return `<dl class="ck-facts">${items
    .map(([dt, dd, binding]) => `<div${binding ? ` class="ck-binding"` : ""}><dt>${dt}</dt><dd>${dd}</dd></div>`)
    .join("")}</dl>`;
}

export interface Alert {
  tone: "info" | "warn";
  html: string;
}

export function alerts(list: Alert[]): string {
  if (list.length === 0) return "";
  return `<ul class="ck-alerts">${list.map((a) => `<li class="ck-alert${a.tone === "warn" ? " ck-alert-warn" : ""}">${a.html}</li>`).join("")}</ul>`;
}

export function blocked(messages: string[], lead = "Fix the highlighted answer to see your results."): string {
  return `<div class="ck-blocked"><p><strong>${lead}</strong></p><ul>${messages.map((m) => `<li>${m}</li>`).join("")}</ul></div>`;
}

/** Inline source label for a registry figure, e.g. "canada.ca, verified 2026-09-27". */
export function sourceTag(log: FigureLog, key: string): string {
  const f = log.get(key);
  if (!f) throw new Error(`figure "${key}" was not read by this calculator`);
  if (!f.source.startsWith("http")) return `<span class="ck-src">design default</span>`;
  return `<a class="ck-src" href="${f.source}" rel="noopener">${new URL(f.source).hostname}, verified ${f.verified_date}</a>`;
}

/**
 * figure-provenance.ts: pure helpers behind the "How we compare" block and
 * the promo gates on comparison pages.
 *
 * The figures registry (src/data/figures/*.json) is the single source of
 * truth for every number a comparison quotes. A page's front matter lists
 * the keys it cites; these helpers turn those keys into the reader-facing
 * provenance list (label, verified date, status) and decide whether a
 * time-limited promo may still be shown.
 *
 * Kept free of Astro/Vite APIs so node:test can exercise it directly; the
 * components pass in the registry entries they load with import.meta.glob.
 */

export interface RegistryEntry {
  key: string;
  label: string;
  status: string; // verified | needs_reverification | assumption | rejected
  verified_date: string; // YYYY-MM-DD
  expires: string | null; // YYYY-MM-DD: the figure (or promo) is stale from this day
  source?: string;
  source_note?: string;
}

export interface RegistryFile {
  entries?: RegistryEntry[];
}

export interface ProvenanceRow {
  key: string;
  label: string;
  verified: string;
  status: "verified" | "unconfirmed" | "expired";
}

export function indexRegistry(files: RegistryFile[]): Map<string, RegistryEntry> {
  const index = new Map<string, RegistryEntry>();
  for (const f of files) {
    for (const e of f.entries ?? []) {
      if (e && typeof e.key === "string") index.set(e.key, e);
    }
  }
  return index;
}

/** YYYY-MM-DD for a Date, in UTC (build machines run UTC). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * One row per cited key, in citation order. Unknown keys throw: a page must
 * never cite a figure the registry does not hold (validate-content catches
 * this first; the throw is the render-time backstop).
 */
export function provenanceRows(
  keys: string[],
  registry: Map<string, RegistryEntry>,
  today: string,
): ProvenanceRow[] {
  return keys.map((key) => {
    const e = registry.get(key);
    if (!e) throw new Error(`figure key "${key}" is not in src/data/figures/`);
    const status: ProvenanceRow["status"] =
      e.expires && e.expires <= today
        ? "expired"
        : e.status === "verified"
          ? "verified"
          : "unconfirmed";
    return { key, label: e.label, verified: e.verified_date, status };
  });
}

/** Oldest and newest verified dates across the rows, or null when empty. */
export function verifiedRange(rows: ProvenanceRow[]): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  const dates = rows.map((r) => r.verified).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/**
 * A promo may be shown only while its registry entry is verified and not
 * yet expired. Conservative on purpose: unknown key, unconfirmed status, or
 * a missing expiry all mean "don't claim it".
 */
export function promoIsLive(
  key: string,
  registry: Map<string, RegistryEntry>,
  today: string,
): boolean {
  const e = registry.get(key);
  if (!e || e.status !== "verified" || !e.expires) return false;
  return today < e.expires;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-28" -> "September 28, 2026" (absolute dates, no "last week"). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * figures.ts: typed access to the figure registry (src/data/figures/*.json)
 * for calculator code. Every constant a calculator uses is looked up here by
 * registry key, so a missing or rejected key fails loudly at build and test
 * time instead of silently shipping a stale number.
 */

import bankPromos from "../../data/figures/bank-promos.json";
import bpa from "../../data/figures/basic-personal-amounts-2026.json";
import closingCosts from "../../data/figures/closing-costs-2026.json";
import cpp from "../../data/figures/cpp-2026.json";
import eiQpip from "../../data/figures/ei-qpip-2026.json";
import federalBrackets from "../../data/figures/federal-brackets-2026.json";
import fhsaHbp from "../../data/figures/fhsa-hbp-2026.json";
import fthb from "../../data/figures/fthb-incentives-2026.json";
import homeOffice from "../../data/figures/home-office-2026.json";
import ltt from "../../data/figures/ltt-2026.json";
import mortgage from "../../data/figures/mortgage-2026.json";
import oasGis from "../../data/figures/oas-gis-2026-q3.json";
import provincialBrackets from "../../data/figures/provincial-brackets-2026.json";
import qpp from "../../data/figures/qpp-2026.json";
import rentHousing from "../../data/figures/rent-housing-2026.json";
import rrsp from "../../data/figures/rrsp-2026.json";
import taxCredits from "../../data/figures/tax-credits-2026.json";
import taxDeadlines from "../../data/figures/tax-deadlines-2026.json";
import tfsa from "../../data/figures/tfsa-2026.json";

export interface FigureEntry {
  key: string;
  label: string;
  value: unknown;
  status: string;
  source: string;
  source_note?: string;
  verified_date: string;
  expires?: string | null;
  notes?: string;
}

const FILES: Record<string, { entries: FigureEntry[] }> = {
  "bank-promos.json": bankPromos as { entries: FigureEntry[] },
  "basic-personal-amounts-2026.json": bpa as { entries: FigureEntry[] },
  "closing-costs-2026.json": closingCosts as { entries: FigureEntry[] },
  "cpp-2026.json": cpp as { entries: FigureEntry[] },
  "ei-qpip-2026.json": eiQpip as { entries: FigureEntry[] },
  "federal-brackets-2026.json": federalBrackets as { entries: FigureEntry[] },
  "fhsa-hbp-2026.json": fhsaHbp as { entries: FigureEntry[] },
  "fthb-incentives-2026.json": fthb as { entries: FigureEntry[] },
  "home-office-2026.json": homeOffice as { entries: FigureEntry[] },
  "ltt-2026.json": ltt as { entries: FigureEntry[] },
  "mortgage-2026.json": mortgage as { entries: FigureEntry[] },
  "oas-gis-2026-q3.json": oasGis as { entries: FigureEntry[] },
  "provincial-brackets-2026.json": provincialBrackets as { entries: FigureEntry[] },
  "qpp-2026.json": qpp as { entries: FigureEntry[] },
  "rent-housing-2026.json": rentHousing as { entries: FigureEntry[] },
  "rrsp-2026.json": rrsp as { entries: FigureEntry[] },
  "tax-credits-2026.json": taxCredits as { entries: FigureEntry[] },
  "tax-deadlines-2026.json": taxDeadlines as { entries: FigureEntry[] },
  "tfsa-2026.json": tfsa as { entries: FigureEntry[] },
};

export type FigureLog = Map<string, FigureEntry & { file: string }>;

/** Keys read through figure(), in first-use order, for the sources footer. */
export const usedFigures: FigureLog = new Map();

/**
 * Look up a registry entry and record it in `log` (default: usedFigures).
 * A calculator that renders its own sources footer passes its own log so
 * its keys do not leak into another page's footer during a shared build.
 */
export function figureEntry(file: string, key: string, log: FigureLog = usedFigures): FigureEntry {
  const data = FILES[file];
  if (!data) throw new Error(`figure file ${file} is not registered in figures.ts`);
  const entry = data.entries.find((e) => e.key === key);
  if (!entry) throw new Error(`figure key "${key}" not found in ${file}`);
  if (entry.status === "rejected") throw new Error(`figure key "${key}" is REJECTED; do not use it`);
  if (!log.has(key)) log.set(key, { ...entry, file });
  return entry;
}

export function figure<T>(file: string, key: string, log: FigureLog = usedFigures): T {
  return figureEntry(file, key, log).value as T;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  indexRegistry,
  longDate,
  promoIsLive,
  provenanceRows,
  verifiedRange,
  type RegistryFile,
} from "./figure-provenance.ts";

const FIGURES_DIR = join(import.meta.dirname, "..", "data", "figures");
const realRegistry = indexRegistry(
  readdirSync(FIGURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(FIGURES_DIR, f), "utf8")) as RegistryFile),
);

const fixture = indexRegistry([
  {
    entries: [
      { key: "a", label: "A", status: "verified", verified_date: "2026-09-28", expires: "2026-10-15" },
      { key: "b", label: "B", status: "needs_reverification", verified_date: "2026-09-26", expires: "2027-01-01" },
      { key: "promo", label: "P", status: "verified", verified_date: "2026-09-29", expires: "2026-10-01" },
      { key: "noexp", label: "N", status: "verified", verified_date: "2026-09-29", expires: null },
    ],
  },
]);

test("provenance rows carry registry label, date, and a reader-facing status", () => {
  const rows = provenanceRows(["a", "b", "promo"], fixture, "2026-10-02");
  assert.deepEqual(rows, [
    { key: "a", label: "A", verified: "2026-09-28", status: "verified" },
    { key: "b", label: "B", verified: "2026-09-26", status: "unconfirmed" },
    { key: "promo", label: "P", verified: "2026-09-29", status: "expired" },
  ]);
});

test("unknown figure keys throw instead of rendering an unsourced row", () => {
  assert.throws(() => provenanceRows(["missing"], fixture, "2026-09-30"), /not in src\/data\/figures/);
});

test("verified range spans oldest to newest check", () => {
  const rows = provenanceRows(["a", "b"], fixture, "2026-09-30");
  assert.deepEqual(verifiedRange(rows), { from: "2026-09-26", to: "2026-09-28" });
  assert.equal(verifiedRange([]), null);
});

test("promos are live only before expiry, only when verified", () => {
  assert.equal(promoIsLive("promo", fixture, "2026-09-30"), true);
  assert.equal(promoIsLive("promo", fixture, "2026-10-01"), false);
  assert.equal(promoIsLive("b", fixture, "2026-09-30"), false, "unconfirmed never shows");
  assert.equal(promoIsLive("noexp", fixture, "2026-09-30"), false, "no expiry means no claim");
  assert.equal(promoIsLive("missing", fixture, "2026-09-30"), false);
});

test("real registry: Simplii bonus is gone from Feb 1, 2027, Tangerine from Nov 1", () => {
  assert.equal(promoIsLive("simplii.bonus_2026", realRegistry, "2027-01-31"), true);
  assert.equal(promoIsLive("simplii.bonus_2026", realRegistry, "2027-02-01"), false);
  assert.equal(promoIsLive("tangerine.payroll_250", realRegistry, "2026-10-31"), true);
  assert.equal(promoIsLive("tangerine.payroll_250", realRegistry, "2026-11-01"), false);
});

test("real registry: Questwealth fees verified until Nov 1; Questrade promos stay unconfirmed", () => {
  const [row] = provenanceRows(["qt.questwealth"], realRegistry, "2026-10-01");
  assert.equal(row.status, "verified");
  assert.equal(promoIsLive("qt.questwealth", realRegistry, "2026-10-31"), true);
  assert.equal(promoIsLive("qt.questwealth", realRegistry, "2026-11-01"), false);
  assert.equal(promoIsLive("qt.promos.2026", realRegistry, "2026-10-01"), false, "third-party cash back never shows");
});

test("longDate writes absolute dates", () => {
  assert.equal(longDate("2026-09-28"), "September 28, 2026");
  assert.equal(longDate("2027-01-01"), "January 1, 2027");
});

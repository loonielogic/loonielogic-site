/**
 * Tests for the Tools dropdown data: every calculator manifest is listed
 * once, with a built page and a short descriptor that follows the copy rules.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import manifests from "../data/calculator-manifests.json";
import { TOOLS, TOOL_GROUPS } from "./tools-nav";

test("all 10 calculators appear exactly once", () => {
  const slugs = manifests.manifests.map((m) => m.slug).sort();
  assert.equal(slugs.length, 10);
  assert.deepEqual(TOOLS.map((t) => t.slug).sort(), slugs);
  assert.equal(new Set(TOOLS.map((t) => t.slug)).size, TOOLS.length);
  assert.ok(TOOL_GROUPS.every((g) => g.tools.length > 0));
});

test("every tool has a page and a short descriptor", () => {
  for (const t of TOOLS) {
    assert.ok(existsSync(`src/pages${t.slug}.astro`), `${t.slug} has no page`);
    assert.ok(t.descriptor.length > 0 && t.descriptor.length <= 90, `${t.slug} descriptor length`);
    assert.ok(!t.descriptor.includes("—") && !t.name.includes("—"));
  }
});

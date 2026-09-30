import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAffiliateHtml, checkSitemapHasNoGo, DISCLOSURE_MARKER } from "./affiliate-gates.ts";

const disclosure = `<div class="disclosure-bar" ${DISCLOSURE_MARKER}><p>Heads up</p></div>`;
const goodLink = `<a class="btn" href="/go/questrade/?src=compare%2Fx&pos=quiz&v=1" rel="sponsored noopener">Open Questrade<span> (affiliate link)</span></a>`;

test("a disclosed, tagged, labelled /go/ link passes", () => {
  assert.deepEqual(checkAffiliateHtml("/compare/x", disclosure + goodLink), []);
});

test("pages with only placeholders and plain links pass", () => {
  const html = `<a href="https://www.questrade.com" rel="noopener">Visit Questrade</a><a href="/compare/">Back</a>`;
  assert.deepEqual(checkAffiliateHtml("/compare/x", html), []);
});

test("missing sponsored or noopener fails", () => {
  const html = disclosure + `<a href="/go/questrade/" rel="noopener">Open (affiliate link)</a>`;
  assert.match(checkAffiliateHtml("/compare/x", html).join("\n"), /missing rel="sponsored noopener"/);
});

test("missing visible marker fails", () => {
  const html = disclosure + `<a href="/go/questrade/" rel="sponsored noopener">Open Questrade</a>`;
  assert.match(checkAffiliateHtml("/compare/x", html).join("\n"), /no visible "\(affiliate link\)" marker/);
});

test("affiliate link above the disclosure fails", () => {
  assert.match(checkAffiliateHtml("/compare/x", goodLink + disclosure).join("\n"), /before \(or without\)/);
  assert.match(checkAffiliateHtml("/compare/x", goodLink).join("\n"), /before \(or without\)/);
});

test("leaked tokens and invented UTMs fail", () => {
  assert.equal(checkAffiliateHtml("/x", "<p>__SUBID__</p>").length, 1);
  assert.equal(checkAffiliateHtml("/x", `<a href="https://q.example/?utm_source=loonielogic">x</a>`).length, 1);
});

test("sitemap.xml must not list /go/ paths", () => {
  assert.deepEqual(checkSitemapHasNoGo("<loc>https://x.dev/compare/</loc>"), []);
  assert.equal(checkSitemapHasNoGo("<loc>https://x.dev/go/questrade/</loc>").length, 1);
});

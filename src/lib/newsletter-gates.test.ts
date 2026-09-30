/**
 * Tests for the newsletter build gates. The HTML fixtures mirror what
 * NewsletterCapture / NewsletterLeadMagnetForm render in each state; the
 * same checks run over the real dist/ output as the last step of the build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NEWSLETTER_COPY as C, leadMagnetDeliveryLine } from "../config/newsletter.ts";
import {
  checkEspConfig,
  checkRenderedPage,
  checkSitemapXml,
  checkSourceFile,
  routeOf,
  textOf,
} from "./newsletter-gates.ts";

const LEGAL = new Set(["/about", "/privacy", "/terms", "/affiliate-disclosure"]);
const ESP = "https://example-esp.com/forms/abc123/subscribe";
// Built from its code point so no dash character sits in this file.
const DASH = String.fromCharCode(0x2014);

interface FormOpts {
  configured?: boolean;
  purpose?: string | null;
  heading?: string;
  privacyLink?: boolean;
  submitDisabled?: boolean;
  status?: boolean;
  action?: string | null;
}

/** Mirrors NewsletterCapture's markup (attribute escaping as Astro renders it). */
function captureForm(o: FormOpts = {}): string {
  const configured = o.configured ?? false;
  const action = o.action !== undefined ? o.action : configured ? ESP : null;
  const disabled = o.submitDisabled ?? !configured;
  const status = o.status ?? !configured;
  const purpose = o.purpose === undefined ? C.purpose : o.purpose;
  return `<div class="nl nl-inline"><form class="nl-form" method="post"${action ? ` action="${action}"` : ""} data-newsletter-form="capture" data-state="${configured ? "open" : "unconfigured"}">
    <h2 class="nl-title" id="nl-home_inline-h" data-nl-copy="heading">${o.heading ?? C.heading}</h2>
    ${purpose === null ? "" : `<p class="nl-purpose" data-nl-copy="purpose">${purpose}</p>`}
    <label><span data-nl-copy="emailLabel">${C.emailLabel}</span><input type="email" name="email" required autocomplete="email" placeholder="${C.emailPlaceholder}"></label>
    <label><span data-nl-copy="firstNameLabel">${C.firstNameLabel}</span><input type="text" name="first_name"></label>
    <button class="btn btn-gold nl-submit" type="submit"${disabled ? " disabled" : ""} data-nl-copy="submit">${C.submit}</button>
    ${status ? `<p class="nl-status" data-nl-copy="unconfigured">${C.unconfigured}</p>` : ""}
    <p class="nl-privacy"><span data-nl-copy="privacyNotice">${C.privacyNotice}</span> ${o.privacyLink === false ? "" : `<a href="/privacy" data-nl-copy="privacyLinkLabel">${C.privacyLinkLabel}</a>`}.</p>
  </form></div>`;
}

function magnetForm({ checked = false, configured = false } = {}): string {
  return `<form method="post"${configured ? ` action="${ESP}"` : ""} data-newsletter-form="lead_magnet">
    <input type="email" name="email" required placeholder="${C.emailPlaceholder}">
    <p data-nl-copy="leadMagnetDelivery">${leadMagnetDeliveryLine("TFSA room worksheet").replace("'", "&#39;")}</p>
    <label><input type="checkbox" name="newsletter_opt_in" value="yes"${checked ? " checked" : ""}><span data-nl-copy="leadMagnetOptIn">${C.leadMagnetOptIn}</span></label>
    <button type="submit"${configured ? "" : " disabled"}>Send me the worksheet</button>
    ${configured ? "" : `<p data-nl-copy="unconfigured">${C.unconfigured}</p>`}
    <p><span data-nl-copy="privacyNotice">${C.privacyNotice}</span> <a href="/privacy" data-nl-copy="privacyLinkLabel">${C.privacyLinkLabel}</a>.</p>
  </form>`;
}

const page = (body: string, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const check = (route: string, body: string, configured = false, head = "") =>
  checkRenderedPage({ route, html: page(body, head), configured, legalRoutes: LEGAL });

describe("checkEspConfig", () => {
  it("placeholder is a warning, never a failure", () => {
    const r = checkEspConfig("REPLACE_WITH_ESP_FORM_ACTION_URL");
    assert.equal(r.errors.length, 0);
    assert.equal(r.warnings.length, 1);
  });
  it("a real https URL passes silently", () => {
    assert.deepEqual(checkEspConfig(ESP), { errors: [], warnings: [] });
  });
  it("anything else fails the build", () => {
    assert.equal(checkEspConfig("http://example-esp.com/f").errors.length, 1);
    assert.equal(checkEspConfig("TODO").errors.length, 1);
  });
});

describe("rendered pages: unconfigured (current state)", () => {
  it("a correct unconfigured form passes", () => {
    assert.deepEqual(check("/", captureForm()), []);
  });

  it("fails without the purpose line", () => {
    const errs = check("/", captureForm({ purpose: null }));
    assert.ok(errs.some((e) => e.includes("purpose line")), errs.join("\n"));
  });

  it("fails without the privacy-policy link", () => {
    const errs = check("/", captureForm({ privacyLink: false }));
    assert.ok(errs.some((e) => e.includes("privacy-policy link")), errs.join("\n"));
  });

  it("fails when the submit button is enabled", () => {
    const errs = check("/", captureForm({ submitDisabled: false }));
    assert.ok(errs.some((e) => e.includes("must be disabled")), errs.join("\n"));
  });

  it("fails when the form has an action URL", () => {
    const errs = check("/", captureForm({ action: ESP }));
    assert.ok(errs.some((e) => e.includes("action URL")), errs.join("\n"));
  });

  it("fails without the honest status line", () => {
    const errs = check("/", captureForm({ status: false }));
    assert.ok(errs.some((e) => e.includes("opens at launch")), errs.join("\n"));
  });

  it("fails if the 'check your inbox' confirmation appears", () => {
    const errs = check("/", captureForm() + `<p>${C.confirmationScreen}</p>`);
    assert.ok(errs.some((e) => e.includes("check your inbox")), errs.join("\n"));
  });

  it("fails if the placeholder value leaks into HTML", () => {
    const errs = check("/", captureForm({ action: "REPLACE_WITH_ESP_FORM_ACTION_URL" }));
    assert.ok(errs.some((e) => e.includes("placeholder config value leaked")), errs.join("\n"));
  });
});

describe("rendered pages: configured", () => {
  it("a correct configured form passes", () => {
    assert.deepEqual(check("/", captureForm({ configured: true }), true), []);
  });

  it("the purpose + privacy rule still applies", () => {
    const errs = check("/", captureForm({ configured: true, purpose: null, privacyLink: false }), true);
    assert.equal(errs.length, 2, errs.join("\n"));
  });
});

describe("rendered pages: copy drift", () => {
  it("fails when a tagged string differs from the registry", () => {
    const errs = check("/", captureForm({ heading: "Get our newsletter" }));
    assert.ok(errs.some((e) => e.includes(`"heading" drifted`)), errs.join("\n"));
  });

  it("fails on the spec's dashed wording (the registry is the source)", () => {
    const dashed = C.purpose.replace(", about", ` ${DASH} about`);
    const errs = check("/", captureForm({ purpose: dashed }));
    assert.ok(errs.some((e) => e.includes(`"purpose" drifted`)), errs.join("\n"));
  });

  it("decodes HTML entities before comparing", () => {
    assert.equal(textOf("You&#39;re one &amp; <b>only</b>"), "You're one & only");
    assert.deepEqual(check("/newsletter", magnetForm(), false, `<meta name="robots" content="noindex, nofollow">`), []);
  });

  it("fails on an unknown copy key", () => {
    const errs = check("/", `<p data-nl-copy="madeUp">x</p>`);
    assert.ok(errs.some((e) => e.includes("unknown newsletter copy key")));
  });
});

describe("rendered pages: placement rules", () => {
  for (const route of ["/privacy", "/terms", "/about", "/affiliate-disclosure", "/404", "/go/questrade", "/learn/glossary", "/calculators/down-payment-planner", "/newsletter/confirmed"]) {
    it(`no form allowed on ${route}`, () => {
      const errs = check(route, captureForm(), false, `<meta name="robots" content="noindex">`);
      assert.ok(errs.some((e) => e.includes("may not carry one")), `${route}: ${errs.join("\n")}`);
    });
  }

  for (const route of ["/", "/learn", "/calculators", "/compare", "/learn/tfsa", "/compare/tfsa-vs-rrsp"]) {
    it(`form allowed on ${route}`, () => {
      assert.deepEqual(check(route, captureForm()), []);
    });
  }

  it("a pre-ticked lead-magnet opt-in fails", () => {
    const head = `<meta name="robots" content="noindex">`;
    assert.deepEqual(check("/newsletter", magnetForm({ checked: false }), false, head), []);
    const errs = check("/newsletter", magnetForm({ checked: true }), false, head);
    assert.ok(errs.some((e) => e.includes("pre-ticked")), errs.join("\n"));
  });

  it("draft newsletter pages must be noindex", () => {
    const errs = check("/newsletter", captureForm());
    assert.ok(errs.some((e) => e.includes("must be noindex")), errs.join("\n"));
    assert.deepEqual(check("/newsletter", captureForm(), false, `<meta name="robots" content="noindex, nofollow">`), []);
  });
});

describe("sitemap and routes", () => {
  it("draft newsletter pages must stay off sitemap.xml", () => {
    const xml = (loc: string) => `<urlset><url><loc>https://x.dev${loc}</loc></url></urlset>`;
    assert.equal(checkSitemapXml(xml("/newsletter"), false).length, 1);
    assert.equal(checkSitemapXml(xml("/newsletter/confirmed"), false).length, 1);
    assert.equal(checkSitemapXml(xml("/learn/tfsa"), false).length, 0);
    assert.equal(checkSitemapXml(xml("/newsletter"), true).length, 0);
  });

  it("maps dist paths to routes", () => {
    assert.equal(routeOf("index.html"), "/");
    assert.equal(routeOf("learn/tfsa/index.html"), "/learn/tfsa");
    assert.equal(routeOf("newsletter/confirmed/index.html"), "/newsletter/confirmed");
    assert.equal(routeOf("404.html"), "/404");
  });
});

describe("source pass", () => {
  it("fails on hard-coded newsletter copy in a page", () => {
    const errs = checkSourceFile("src/pages/index.astro", `<h2>${C.heading}</h2>`);
    assert.equal(errs.length, 1);
  });

  it("catches a pasted spec string with a dash", () => {
    const errs = checkSourceFile("src/components/Foo.astro", `<p>New guides, tool updates, and Canadian money deadlines ${DASH} about twice a month. You can unsubscribe anytime.</p>`);
    assert.equal(errs.length, 1);
  });

  it("allows registry references and ignores non-page files", () => {
    assert.deepEqual(checkSourceFile("src/components/NewsletterCapture.astro", "<h2>{C.heading}</h2>"), []);
    assert.deepEqual(checkSourceFile("src/config/newsletter.ts", `heading: "${C.heading}"`), []);
    assert.deepEqual(checkSourceFile("src/lib/x.test.ts", C.heading), []);
    assert.deepEqual(checkSourceFile("src/content/legal/privacy.mdx", C.privacyNotice), []);
  });

  it("bans popup, timer, and scroll machinery in newsletter components", () => {
    for (const bad of ["setTimeout(show, 5000)", "document.addEventListener('mouseleave', f)", "new IntersectionObserver(f)", "<dialog open>", ".nl { position: fixed; }"]) {
      assert.equal(checkSourceFile("src/components/NewsletterPopup.astro", bad).length, 1, bad);
    }
  });
});

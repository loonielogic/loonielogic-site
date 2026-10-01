/**
 * Kids lessons (/learn/kids/*): the two Segment A pilot pages validate against
 * kidsLessonSchema, match their src/data/sitemap.json rows, stay draft and
 * noindex, and pass the validate-content house-style gates.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { kidsLessonSchema } from "../schemas/page-manifest.ts";
import { checkContentText } from "../scripts/validate-content.ts";
import { answerIndex, answerLabel, checkDraftKidsPage, choiceLetter, type KidsQuizItem } from "./kids-lesson.ts";
import sitemap from "../data/sitemap.json";

const ROOT = join(import.meta.dirname, "..", "..");
const KIDS_DIR = join(ROOT, "src", "content", "explainers", "kids");
// Built from its code point so no dash character sits in this file.
const DASH = String.fromCharCode(0x2014);

const files = readdirSync(KIDS_DIR).filter((f) => f.endsWith(".mdx")).sort();
const lessons = files.map((f) => {
  const raw = readFileSync(join(KIDS_DIR, f), "utf8");
  const fm = yaml.load(raw.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
  return { file: f, raw, fm };
});
const sitemapKids = (sitemap as { pages: { slug: string; page_type: string; title: string; meta_description: string; related: string[]; status?: string }[] }).pages.filter(
  (p) => p.page_type === "kids-lesson",
);

describe("kids lesson pages", () => {
  it("ships both pilot lessons", () => {
    assert.deepEqual(files, ["growing-savings.mdx", "needs-vs-wants.mdx"]);
    assert.equal(sitemapKids.length, 2);
  });

  for (const { file, raw, fm } of lessons) {
    describe(file, () => {
      it("validates against kidsLessonSchema", () => {
        const r = kidsLessonSchema.safeParse(fm);
        assert.ok(r.success, JSON.stringify(r.error?.issues));
      });

      it("has exactly 3 quiz questions, each with an answer and a why", () => {
        const quiz = fm.quiz as KidsQuizItem[];
        assert.equal(quiz.length, 3);
        for (const q of quiz) {
          assert.ok(q.answer && q.why);
          if (q.choices) assert.ok(answerIndex(q) >= 0, `answer ${q.answer} does not match a choice`);
          else assert.match(q.answer, /^(true|false)$/);
        }
      });

      it("matches its sitemap.json row (slug, page_type, title, meta, related)", () => {
        const row = sitemapKids.find((p) => p.slug === fm.slug);
        assert.ok(row, `${fm.slug} missing from sitemap.json`);
        assert.equal(row.page_type, "kids-lesson");
        assert.equal(fm.title, row.title);
        assert.equal(fm.meta_description, row.meta_description);
        assert.deepEqual(fm.related, row.related);
        assert.equal(fm.slug, `/learn/kids/${file.replace(/\.mdx$/, "")}`);
      });

      it("is a draft with no figures, affiliate links, or newsletter form", () => {
        assert.equal(fm.status, "draft");
        assert.equal(row(fm.slug as string)?.status, "draft");
        assert.equal(fm.publish_date, null);
        assert.deepEqual(fm.figures, []);
        assert.ok(["none", "soft-link"].includes(fm.newsletter_placement as string));
        assert.ok(!fm.affiliate_links || (fm.affiliate_links as unknown[]).length === 0);
      });

      it("passes the house-style text gates", () => {
        assert.deepEqual(checkContentText(raw, "kids-lesson"), []);
        assert.ok(!raw.includes(DASH));
        assert.ok(!/you should/i.test(raw));
      });
    });
  }
});

function row(slug: string) {
  return sitemapKids.find((p) => p.slug === slug);
}

describe("kidsLessonSchema rejects template violations", () => {
  const base = lessons[0].fm;

  it("rejects a quiz that is not exactly 3 questions", () => {
    const quiz = base.quiz as unknown[];
    assert.ok(!kidsLessonSchema.safeParse({ ...base, quiz: quiz.slice(0, 2) }).success);
    assert.ok(!kidsLessonSchema.safeParse({ ...base, quiz: [...quiz, quiz[0]] }).success);
  });

  it("rejects inline newsletter forms", () => {
    assert.ok(!kidsLessonSchema.safeParse({ ...base, newsletter_placement: "inline" }).success);
  });

  it("rejects affiliate links and registry figures", () => {
    const link = { merchant: "wealthsimple", position: "hero", label: "Open an account" };
    assert.ok(!kidsLessonSchema.safeParse({ ...base, affiliate_links: [link] }).success);
    const fig = { key: "tfsa.annual_limit.2026", source: "canada.ca", verified: "2026-09-29", expires: null };
    assert.ok(!kidsLessonSchema.safeParse({ ...base, figures: [fig] }).success);
  });

  it("requires the key_takeaway stem", () => {
    assert.ok(!kidsLessonSchema.safeParse({ ...base, key_takeaway: "Kids learn to sort purchases." }).success);
  });
});

describe("checkContentText", () => {
  it("flags em dashes and 'you should' on any page type", () => {
    assert.equal(checkContentText(`a ${DASH} b`, "explainer").length, 1);
    assert.equal(checkContentText("You should save.", "explainer").length, 1);
  });

  it("flags affiliate links and sponsored copy only on kids lessons", () => {
    assert.equal(checkContentText("[x](/go/wealthsimple/)", "kids-lesson").length, 1);
    assert.equal(checkContentText('rel="sponsored"', "kids-lesson").length, 1);
    assert.equal(checkContentText("[x](/go/wealthsimple/)", "comparison").length, 0);
  });
});

describe("quiz rendering helpers", () => {
  it("labels letter answers with their choice and capitalizes true/false", () => {
    assert.equal(choiceLetter(1), "(b)");
    assert.equal(answerLabel({ question: "q", choices: ["need", "want"], answer: "(a)", why: "w" }), "(a) need");
    assert.equal(answerLabel({ question: "q", answer: "false", why: "w" }), "False");
    assert.equal(answerIndex({ question: "q", choices: ["x"], answer: "(c)", why: "w" }), -1);
  });
});

describe("draft noindex rendering", () => {
  const slug = "/learn/kids/needs-vs-wants";
  const noindex = '<head><meta name="robots" content="noindex, nofollow" /></head>';

  it("the kids route sets noindex for any non-live lesson", () => {
    const route = readFileSync(join(ROOT, "src", "pages", "learn", "kids", "[slug].astro"), "utf8");
    assert.match(route, /noindex=\{d\.status !== "live"\}/);
  });

  it("checkDraftKidsPage passes a noindex page absent from sitemap.xml", () => {
    assert.deepEqual(checkDraftKidsPage(slug, noindex, "<urlset></urlset>"), []);
  });

  it("checkDraftKidsPage fails an indexable page, a missing page, or a sitemap listing", () => {
    assert.equal(checkDraftKidsPage(slug, "<head></head>", null).length, 1);
    assert.equal(checkDraftKidsPage(slug, null, null).length, 1);
    const xml = `<url><loc>https://loonielogic-site.pages.dev${slug}</loc></url>`;
    assert.equal(checkDraftKidsPage(slug, noindex, xml).length, 1);
  });

  it("built output (when present) is noindex and off sitemap.xml", (t) => {
    const dist = join(ROOT, "dist");
    if (!existsSync(dist)) return t.skip("no dist/ yet");
    const xml = existsSync(join(dist, "sitemap.xml")) ? readFileSync(join(dist, "sitemap.xml"), "utf8") : null;
    for (const s of sitemapKids.map((p) => p.slug)) {
      const page = join(dist, s.replace(/^\//, ""), "index.html");
      const html = existsSync(page) ? readFileSync(page, "utf8") : null;
      if (html === null) return t.skip(`${s} not in this dist/ (stale build)`);
      assert.deepEqual(checkDraftKidsPage(s, html, xml), []);
    }
  });
});

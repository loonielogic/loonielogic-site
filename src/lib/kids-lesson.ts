/**
 * kids-lesson.ts: pure helpers for rendering /learn/kids/* quiz items.
 *
 * Quiz answers are stored verbatim from the lesson drafts: "(a)"-style letters
 * for multiple choice, "true"/"false" for true/false (no `choices`).
 */

export interface KidsQuizItem {
  question: string;
  choices?: string[];
  answer: string;
  why: string;
}

/** 0 -> "(a)", 1 -> "(b)", ... */
export function choiceLetter(i: number): string {
  return `(${String.fromCharCode(97 + i)})`;
}

/** Index of the correct choice for a letter answer, or -1 (true/false items, unknown letters). */
export function answerIndex(item: KidsQuizItem): number {
  if (!item.choices) return -1;
  const m = item.answer.trim().match(/^\(?([a-z])\)?$/i);
  if (!m) return -1;
  const i = m[1].toLowerCase().charCodeAt(0) - 97;
  return i < item.choices.length ? i : -1;
}

/** Answer as shown on the page: "(b) If you would be okay without it, it is a want" or "False". */
export function answerLabel(item: KidsQuizItem): string {
  const i = answerIndex(item);
  if (i >= 0) return `${choiceLetter(i)} ${item.choices![i]}`;
  const a = item.answer.trim();
  return a.charAt(0).toUpperCase() + a.slice(1);
}

/**
 * Post-build gate for a non-live kids lesson: the rendered page must be
 * noindex and its URL must stay out of sitemap.xml. Returns error strings.
 */
export function checkDraftKidsPage(slug: string, html: string | null, sitemapXml: string | null): string[] {
  const errors: string[] = [];
  if (html === null) errors.push(`${slug}: draft kids lesson was not built`);
  else if (!/<meta name="robots" content="noindex/.test(html)) errors.push(`${slug}: draft kids lesson must be noindex`);
  if (sitemapXml !== null && sitemapXml.includes(`${slug}</loc>`)) {
    errors.push(`${slug}: draft kids lesson must not appear in sitemap.xml`);
  }
  return errors;
}

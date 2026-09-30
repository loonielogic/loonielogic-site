/**
 * fonts.ts: fetch the site's webfont stylesheet (WEBFONT_CSS) and inline
 * its latin font files as data URIs, so the headless browser needs no
 * network of its own (it cannot use an authenticated egress proxy) and the
 * cards render in exactly the faces the pages use.
 */

import { WEBFONT_CSS } from "../../lib/site";

// A current Chrome UA so Google Fonts serves woff2.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export async function inlineWebfontCss(): Promise<string> {
  const res = await fetch(WEBFONT_CSS, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`webfont stylesheet: HTTP ${res.status}`);
  const css = await res.text();

  // Google annotates each @font-face with its subset: keep /* latin */ only
  // (it covers the ellipsis and curly quotes the cards use).
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
    .filter((m) => m[1] === "latin")
    .map((m) => m[2]);
  if (blocks.length === 0) throw new Error("webfont stylesheet: no latin @font-face blocks found");

  const out: string[] = [];
  for (const block of blocks) {
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error("webfont stylesheet: @font-face without a url()");
    const font = await fetch(url, { headers: { "user-agent": UA } });
    if (!font.ok) throw new Error(`webfont ${url}: HTTP ${font.status}`);
    const b64 = Buffer.from(await font.arrayBuffer()).toString("base64");
    out.push(block.replace(url, `data:font/woff2;base64,${b64}`));
  }
  return out.join("\n");
}

#!/usr/bin/env node
/* Inline css/ and js/ into one self-contained HTML file.
   Used to publish the game somewhere that can only serve a single page.

     node build-standalone.js [outfile]

   Reads the real sources, so the bundle can never drift from the repo. */

const fs = require("fs");
const path = require("path");

/* --fragment drops the document skeleton, for hosts that supply their own
   <!doctype>/<head>/<body> and only want the page content. */
const args = process.argv.slice(2);
const fragment = args.includes("--fragment");

const root = __dirname;
const out = args.find((a) => !a.startsWith("--")) || path.join(root, "college-tycoon.html");

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

/* Script order matters: util defines helpers the data tables call at runtime. */
/* util defines MONTH_NAMES, which i18n reads; data/engine/ui all call t(). */
const SCRIPTS = ["js/util.js", "js/i18n.js", "js/sprites.js", "js/data.js",
                 "js/engine.js", "js/campus.js", "js/ui.js", "js/main.js"];

let html = read("index.html");

html = html.replace(
  /<link rel="stylesheet" href="css\/game\.css">/,
  `<style>\n${read("css/game.css")}\n</style>`);

for (const src of SCRIPTS) {
  const tag = `<script src="${src}"></script>`;
  if (!html.includes(tag)) throw new Error(`index.html no longer loads ${src}`);
  html = html.replace(tag, `<script>\n${read(src)}\n</script>`);
}

/* data: URIs are self-contained; anything else would be a network fetch. */
const external = html.match(/<(?:link|script|img)[^>]+(?:href|src)="(?!data:)([^"]*)"/g);
if (external) {
  throw new Error("bundle still references external files:\n  " + external.join("\n  "));
}

if (fragment) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n${style}\n${body.trim()}\n`;
}

fs.writeFileSync(out, html);
console.log(`${out} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB${fragment ? " (fragment)" : ""}`);

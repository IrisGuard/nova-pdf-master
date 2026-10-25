/**
 * Keep the CSP sha256 allow-list in sync with the built HTML.
 *
 * Why this exists: the theme-init script is inline on purpose (it has to run
 * before first paint, or the page flashes the wrong theme). A CSP that allows
 * `'self'` only would block it, so its own hash must be declared — and that
 * hash changes whenever the snippet changes. Keeping it by hand is how the
 * homepage ended up with `Executing inline script violates … Content Security
 * Policy` on every load (Atlas user walk, 2026-10-23): the hash in `worker.js`
 * and `public/_headers` was stale.
 *
 * Runs as `postbuild`, so the deployed CSP can never disagree with the HTML.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();

/** Only executable inline scripts need a hash; JSON-LD data blocks do not. */
function inlineScriptHashes(file) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return [];
  const html = fs.readFileSync(abs, "utf8");
  const hashes = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue; // external file: covered by 'self'
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (/json|template|text\/plain/i.test(type)) continue; // not executed
    const body = match[2] || "";
    if (!body.trim()) continue;
    hashes.push(`'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return hashes;
}

const hashes = [
  ...new Set([
    ...inlineScriptHashes("dist/index.html"),
    ...inlineScriptHashes("dist/app/index.html"),
    ...inlineScriptHashes("dist/404.html"),
  ]),
];

if (!hashes.length) {
  console.error("sync-csp-hash: no inline scripts found — refusing to blank the allow-list");
  process.exit(1);
}

/**
 * Rewrite the script-src directive of one CSP string: drop every existing
 * `'sha256-…'` token and append the current set. Idempotent by construction —
 * running twice must produce byte-identical output (an earlier version
 * appended the hash a second time, which broke the live CSP).
 */
function withHashes(csp) {
  const directives = csp.split(";").map((d) => d.trim()).filter(Boolean);
  const out = directives.map((directive) => {
    if (!directive.startsWith("script-src ")) return directive;
    const tokens = directive
      .split(/\s+/)
      .slice(1)
      .filter((t) => t && !t.startsWith("'sha256-"));
    return ["script-src", ...tokens, ...hashes].join(" ");
  });
  const scriptSrc = out.find((d) => d.startsWith("script-src "));
  if (!scriptSrc) throw new Error("no script-src directive to update");
  return out.join("; ");
}

let worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
const quotedCsp = /"script-src [^"\n]*"/;
if (!quotedCsp.test(worker)) throw new Error("worker.js: script-src not found");
worker = worker.replace(quotedCsp, JSON.stringify(withHashes(worker.match(quotedCsp)[0].slice(1, -1))));
fs.writeFileSync(path.join(root, "worker.js"), worker);

const headersPath = path.join(root, "public/_headers");
let headers = fs.readFileSync(headersPath, "utf8");
headers = headers.replace(/^(  Content-Security-Policy: )(.+)$/m, (_all, lead, csp) => lead + withHashes(csp.trim()));
fs.writeFileSync(headersPath, headers);

// The asset layer serves dist/, and `_headers` is copied there DURING the build —
// i.e. BEFORE this postbuild step runs. Writing only public/_headers left the
// deployed copy with the previous hash list, so a CSP that looked correct in the
// source blocked the newly added inline script at the edge (GA4 snippet,
// 2026-10-25: script-src shipped 1 of 2 hashes). Keep the built copy in step.
const distHeaders = path.join(root, "dist/_headers");
if (fs.existsSync(distHeaders)) {
  let built = fs.readFileSync(distHeaders, "utf8");
  built = built.replace(/^(  Content-Security-Policy: )(.+)$/m, (_all, lead, csp) => lead + withHashes(csp.trim()));
  fs.writeFileSync(distHeaders, built);
}

console.log(`sync-csp-hash: ${hashes.length} inline script hash(es) synced`);
console.log(`               public/_headers + dist/_headers updated`);
for (const h of hashes) console.log("  ", h);

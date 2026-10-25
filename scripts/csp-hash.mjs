import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const files = ["dist/index.html", "dist/app/index.html", "dist/404.html"];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(f, "inline scripts:", blocks.length);
  for (const b of blocks) {
    const body = b[1];
    const hash = crypto.createHash("sha256").update(body, "utf8").digest("base64");
    console.log("   ", `sha256-${hash}`, JSON.stringify(body.slice(0, 70)));
  }
}

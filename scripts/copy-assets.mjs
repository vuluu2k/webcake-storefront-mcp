// After `tsc`, mirror runtime JSON/PNG assets from src/ into dist/, then make the
// CLI entrypoint executable.
//
// `tsc` only emits .js, so any *.json or *.png under src/ (e.g. the generated
// changelog.json that web-guide.ts reads via readFileSync at runtime) must be
// copied to the matching dist/ path. Globbing the tree picks up new assets
// automatically — no per-file copy line to maintain.
import { readdirSync, statSync, mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");

let count = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith(".") || name === "node_modules") continue; // skip state/tooling dirs
      walk(p);
    } else if (name.endsWith(".json") || name.endsWith(".png")) {
      const dest = join(dist, p.slice(src.length + 1));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(p, dest);
      count++;
      console.log(`[copy-assets] ${p} -> ${dest}`);
    }
  }
}

if (existsSync(src)) walk(src);
console.log(`[copy-assets] copied ${count} asset(s).`);

const entry = join(dist, "index.js");
if (existsSync(entry)) {
  chmodSync(entry, 0o755);
  console.log("chmod +x dist/index.js");
}

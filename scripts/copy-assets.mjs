// Mirror non-TS runtime assets from src/ into dist/ after `tsc`, then make the
// CLI entrypoint executable so `npx` / bin can run it directly.
import { cpSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");

// Knowledge markdown is read at runtime relative to the built tools dir.
const knowledgeSrc = join(src, "knowledge");
if (existsSync(knowledgeSrc)) {
  cpSync(knowledgeSrc, join(dist, "knowledge"), { recursive: true });
  console.log("copied knowledge/ -> dist/knowledge/");
}

const entry = join(dist, "index.js");
if (existsSync(entry)) {
  chmodSync(entry, 0o755);
  console.log("chmod +x dist/index.js");
}

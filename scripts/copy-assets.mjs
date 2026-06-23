// After `tsc`, make the CLI entrypoint executable so `npx` / bin can run it directly.
import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const entry = join(dist, "index.js");
if (existsSync(entry)) {
  chmodSync(entry, 0o755);
  console.log("chmod +x dist/index.js");
}

import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "www");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "supabase-config.js",
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of files) {
  await copyFile(join(root, file), join(outDir, file));
}

console.log(`Built Capacitor web assets in ${outDir}`);

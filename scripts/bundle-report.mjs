import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";

const directory = path.resolve(process.argv[2] ?? "dist");
const manifest = JSON.parse(await readFile(path.join(directory, ".vite/manifest.json"), "utf8"));
function dependencies(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dependency of manifest[key]?.imports ?? []) dependencies(dependency, seen);
  return seen;
}
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entry) throw new Error("Production build manifest has no entry point");
const routes = {};
const hashes = {};
for (const key of Object.keys(manifest).filter((key) => manifest[key].isEntry || manifest[key].isDynamicEntry)) {
  const files = new Set();
  for (const dependency of new Set([...dependencies(entry), ...dependencies(key)])) {
    const chunk = manifest[dependency];
    if (chunk?.file) files.add(chunk.file);
    for (const css of chunk?.css ?? []) files.add(css);
  }
  let raw = 0, gzip = 0, brotli = 0;
  for (const file of files) {
    const bytes = await readFile(path.join(directory, file));
    hashes[file] = createHash("sha256").update(bytes).digest("hex");
    raw += bytes.length; gzip += gzipSync(bytes).length; brotli += brotliCompressSync(bytes).length;
  }
  routes[key] = { files: [...files], raw, gzip, brotli };
}
const report = { revision: process.env.BENCHMARK_REVISION ?? "unrecorded", buildDirectory: directory, files: hashes, node: process.version, generatedAt: new Date().toISOString(), compression: "Estimates; actual server transfer bytes must be measured separately", routes };
await mkdir("artifacts", { recursive: true });
await writeFile(process.argv[3] ?? "artifacts/bundle.json", JSON.stringify(report, null, 2));
console.table(Object.entries(routes).map(([route, size]) => ({ route, rawKB: +(size.raw / 1024).toFixed(1), gzipKB: +(size.gzip / 1024).toFixed(1) })));

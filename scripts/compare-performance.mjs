import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "artifacts");
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) throw new Error("Cannot summarize an empty measurement series");
  return sorted[Math.floor(sorted.length / 2)];
};
async function reports(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".report.json"));
  if (!files.length) throw new Error(`No Lighthouse reports in ${directory}`);
  const groups = new Map();
  for (const file of files) {
    const report = JSON.parse(await readFile(path.join(directory, file), "utf8"));
    if (report.runtimeError) throw new Error(`Invalid Lighthouse run: ${file}`);
    const route = new URL(report.requestedUrl).pathname;
    const group = groups.get(route) ?? [];
    group.push(report);
    groups.set(route, group);
  }
  for (const [route, group] of groups) {
    if (group.length !== 5)
      throw new Error(`Expected five runs for ${route}, found ${group.length}`);
  }
  return groups;
}
const rows = [];
for (const profile of ["mobile", "desktop"]) {
  const before = await reports(path.join(root, `baseline-${profile}`));
  const after = await reports(path.join(root, `lighthouse-${profile}`));
  for (const [route, runs] of after) {
    const previous = before.get(route);
    if (!previous) throw new Error(`No baseline for ${route}`);
    const categories = {};
    for (const category of ["performance", "accessibility", "best-practices", "seo"]) {
      const values = runs.map((run) => run.categories[category].score * 100);
      categories[category] = {
        before: median(previous.map((run) => run.categories[category].score * 100)),
        after: median(values),
        range: [Math.min(...values), Math.max(...values)],
      };
    }
    const metrics = {};
    for (const metric of [
      "largest-contentful-paint",
      "total-blocking-time",
      "cumulative-layout-shift",
    ]) {
      metrics[metric] = {
        before: median(previous.map((run) => run.audits[metric].numericValue)),
        after: median(runs.map((run) => run.audits[metric].numericValue)),
      };
    }
    rows.push({ profile, route, categories, metrics });
  }
}
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "performance-comparison.json"), JSON.stringify(rows, null, 2));
const lines = [
  "# Local Lighthouse comparison",
  "",
  "Five production-build runs per route/profile; category medians before → after. These seeded local pages do not establish production or media-heavy performance.",
  "",
  "| Profile | Route | Performance | Accessibility | Best practices | SEO | Performance range after |",
  "| --- | --- | --- | --- | --- | --- | --- |",
];
for (const row of rows) {
  const values = Object.values(row.categories).map((value) => `${value.before} → ${value.after}`);
  lines.push(
    `| ${row.profile} | ${row.route} | ${values.join(" | ")} | ${row.categories.performance.range.join("–")} |`,
  );
}
lines.push(
  "",
  "Full timings are in performance-comparison.json; raw audit reports are preserved alongside it.",
);
await writeFile(path.join(root, "performance-comparison.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

import fs from "node:fs/promises";
import path from "node:path";

function number(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function improvement(before, after, direction = "lower") {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return "—";
  const delta = direction === "lower"
    ? (before - after) / Math.abs(before)
    : (after - before) / Math.abs(before);
  return `${(delta * 100).toFixed(1)}%`;
}

function scenarioKey(result) {
  return `${result.fixture.size}/${result.fixture.shape}`;
}

export function createMarkdownReport(report) {
  const lines = [
    "# Large graph benchmark report",
    "",
    `- Commit: \`${report.environment.commit}\``,
    `- Chromium: ${report.environment.browserVersion}`,
    `- Platform: ${report.environment.platform}`,
    `- Viewport: ${report.environment.viewport.width}×${report.environment.viewport.height} @ ${report.environment.deviceScaleFactor}x`,
    `- Warmups: ${report.methodology.warmupRuns}; measured runs: ${report.methodology.measuredRuns}`,
    "",
    "## Before and after",
    "",
    "| Fixture | Metric | Baseline median | Final median | Improvement | Final p95 | Budget |",
    "|---|---:|---:|---:|---:|---:|---:|"
  ];

  const baseline = new Map(report.iterations.baseline.map((result) => [scenarioKey(result), result]));
  const final = new Map(report.iterations.final.map((result) => [scenarioKey(result), result]));
  for (const [key, after] of final) {
    const before = baseline.get(key);
    if (!before) continue;
    const rows = [
      ["First usable", before.metrics.firstUsable.median, after.metrics.firstUsable.median, after.metrics.firstUsable.p95, "lower", "ms"],
      ["Filter", before.metrics.filter?.median, after.metrics.filter?.median, after.metrics.filter?.p95, "lower", "ms"],
      ["Selection", before.metrics.selection?.median, after.metrics.selection?.median, after.metrics.selection?.p95, "lower", "ms"],
      ["Viewport FPS", before.metrics.viewport?.medianFps, after.metrics.viewport?.medianFps, null, "higher", "fps"]
    ];
    for (const [label, beforeValue, afterValue, p95Value, direction, unit] of rows) {
      lines.push(`| ${key} | ${label} | ${number(beforeValue)} ${unit} | ${number(afterValue)} ${unit} | ${improvement(beforeValue, afterValue, direction)} | ${number(p95Value)} ${p95Value == null ? "" : unit} | — |`);
    }
  }

  lines.push("", "## Optimization iterations", "", "| Iteration | Primary change | Large first usable | Large filter p95 | Large viewport FPS | Max long task |", "|---|---|---:|---:|---:|---:|");
  for (const iteration of report.iterationSummary) {
    lines.push(`| ${iteration.name} | ${iteration.change} | ${number(iteration.firstUsable)} ms | ${number(iteration.filterP95)} ms | ${number(iteration.viewportFps)} | ${number(iteration.maxLongTask)} ms |`);
  }

  lines.push("", "## Built-in layouts", "", "| Layout | Median duration | p95 duration |", "|---|---:|---:|");
  for (const [name, values] of Object.entries(report.layouts.layouts)) {
    lines.push(`| ${name} | ${number(values.median)} ms | ${number(values.p95)} ms |`);
  }

  lines.push("", "## Trace notes", "");
  for (const note of report.traceNotes) lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] || "benchmarks/results/graph-final.json";
  const output = process.argv[3] || "benchmarks/results/graph-report.md";
  const report = JSON.parse(await fs.readFile(input, "utf8"));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, createMarkdownReport(report));
  console.log(output);
}

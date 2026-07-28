import fs from "node:fs/promises";

const baselinePath = process.argv[2] || "benchmarks/baseline/graph-baseline.json";
const candidatePath = process.argv[3] || "benchmarks/results/graph-final.json";
const limit = Number(process.env.GRAPH_BENCH_REGRESSION_LIMIT || 0.1);

const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
const failures = [];

function key(result) {
  return `${result.fixture.size}/${result.fixture.shape}`;
}

function compareMetric(name, before, after, lowerIsBetter = true) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return;
  const regression = lowerIsBetter ? (after - before) / before : (before - after) / before;
  if (regression > limit) failures.push(`${name} regressed ${(regression * 100).toFixed(1)}%`);
}

const expected = new Map((baseline.iterations?.final || baseline.results || []).map((result) => [key(result), result]));
for (const result of candidate.iterations?.final || candidate.results || []) {
  const previous = expected.get(key(result));
  if (!previous) continue;
  const prefix = key(result);
  compareMetric(`${prefix} first usable`, previous.metrics.firstUsable.median, result.metrics.firstUsable.median);
  compareMetric(`${prefix} filter p95`, previous.metrics.filter?.p95, result.metrics.filter?.p95);
  compareMetric(`${prefix} selection p95`, previous.metrics.selection?.p95, result.metrics.selection?.p95);
  compareMetric(`${prefix} viewport FPS`, previous.metrics.viewport?.medianFps, result.metrics.viewport?.medianFps, false);
  compareMetric(`${prefix} incremental update 100`, previous.metrics.incrementalElements?.update?.[100]?.median, result.metrics.incrementalElements?.update?.[100]?.median);
}

if (failures.length) {
  console.error(`Graph benchmark regressions exceed ${(limit * 100).toFixed(0)}%:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Graph benchmark comparison passed");

import fs from "node:fs/promises";

const baselinePath = process.argv[2] || "benchmarks/baseline/graph-baseline.json";
const candidatePath = process.argv[3] || "benchmarks/results/graph-final.json";
const limit = Number(process.env.GRAPH_BENCH_REGRESSION_LIMIT || 0.1);

if (!Number.isFinite(limit) || limit < 0) {
  throw new TypeError("GRAPH_BENCH_REGRESSION_LIMIT must be a finite non-negative number");
}

const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
const failures = [];

function key(result) {
  return `${result.fixture.size}/${result.fixture.shape}`;
}

function resultMap(report, label) {
  const results = report.iterations?.final || report.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`${label} benchmark result set is empty`);
  }
  const entries = results.map((result) => [key(result), result]);
  const map = new Map(entries);
  if (map.size !== entries.length) throw new Error(`${label} benchmark contains duplicate scenarios`);
  return map;
}

function requireFinite(value, name) {
  if (!Number.isFinite(value)) {
    failures.push(`${name} is missing or non-finite`);
    return null;
  }
  return value;
}

function compareMetric(name, beforeValue, afterValue, direction = "lower") {
  const before = requireFinite(beforeValue, `${name} baseline`);
  const after = requireFinite(afterValue, `${name} candidate`);
  if (before === null || after === null) return;

  const denominator = Math.max(Math.abs(before), Number.EPSILON);
  const regression = direction === "lower"
    ? (after - before) / denominator
    : (before - after) / denominator;
  if (regression > limit) failures.push(`${name} regressed ${(regression * 100).toFixed(1)}%`);
}

const expected = resultMap(baseline, "Baseline");
const actual = resultMap(candidate, "Candidate");

for (const scenario of expected.keys()) {
  if (!actual.has(scenario)) failures.push(`${scenario} candidate scenario is missing`);
}
for (const scenario of actual.keys()) {
  if (!expected.has(scenario)) failures.push(`${scenario} has no reviewed baseline`);
}

for (const [scenario, previous] of expected) {
  const result = actual.get(scenario);
  if (!result) continue;
  compareMetric(`${scenario} first usable`, previous.metrics.firstUsable?.median, result.metrics.firstUsable?.median);
  compareMetric(`${scenario} filter p95`, previous.metrics.filter?.p95, result.metrics.filter?.p95);
  compareMetric(`${scenario} selection p95`, previous.metrics.selection?.p95, result.metrics.selection?.p95);
  compareMetric(`${scenario} viewport FPS`, previous.metrics.viewport?.medianFps, result.metrics.viewport?.medianFps, "higher");
  compareMetric(
    `${scenario} incremental update 100`,
    previous.metrics.incrementalElements?.update?.[100]?.median,
    result.metrics.incrementalElements?.update?.[100]?.median
  );
}

if (failures.length) {
  console.error(`Graph benchmark regressions exceed ${(limit * 100).toFixed(0)}%:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Graph benchmark comparison passed");

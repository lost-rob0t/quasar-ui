import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createMarkdownReport } from "./bench-graph-report.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.GRAPH_BENCH_PORT || 4174);
const BASE_URL = `http://${HOST}:${PORT}`;
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;
const updateBaseline = process.argv.includes("--update-baseline");
const profile = process.env.GRAPH_BENCH_PROFILE || "full";

const iterations = [
  {
    name: "baseline",
    change: "Original full replacement, full detail, unbounded default layout",
    strategy: "replace",
    detailMode: "full",
    layoutMode: "legacy"
  },
  {
    name: "reconciliation",
    change: "ID-based differential Cytoscape reconciliation",
    strategy: "reconcile",
    detailMode: "full",
    layoutMode: "legacy"
  },
  {
    name: "adaptive",
    change: "Interaction-local rendering and deterministic level of detail",
    strategy: "reconcile",
    detailMode: "adaptive",
    layoutMode: "legacy"
  },
  {
    name: "final",
    change: "Size-aware bounded layouts and final renderer policy",
    strategy: "reconcile",
    detailMode: "adaptive",
    layoutMode: "size-aware"
  }
];

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function stats(values) {
  const numeric = values.filter(Number.isFinite);
  return {
    samples: numeric.length,
    median: percentile(numeric, 0.5),
    p95: percentile(numeric, 0.95),
    min: numeric.length ? Math.min(...numeric) : null,
    max: numeric.length ? Math.max(...numeric) : null
  };
}

function isSummary(value) {
  return value && typeof value === "object" && "median" in value && "p95" in value;
}

function aggregate(values) {
  const present = values.filter((value) => value !== undefined && value !== null);
  if (!present.length) return null;
  if (present.every(Number.isFinite)) return stats(present);
  if (present.every(isSummary)) {
    return {
      samples: present.reduce((total, value) => total + (value.samples || 0), 0),
      median: percentile(present.map((value) => value.median).filter(Number.isFinite), 0.5),
      p95: percentile(present.map((value) => value.p95).filter(Number.isFinite), 0.95),
      min: Math.min(...present.map((value) => value.min).filter(Number.isFinite)),
      max: Math.max(...present.map((value) => value.max).filter(Number.isFinite)),
      ...(present.some((value) => Number.isFinite(value.medianFps))
        ? { medianFps: percentile(present.map((value) => value.medianFps).filter(Number.isFinite), 0.5) }
        : {})
    };
  }
  if (present.every((value) => typeof value === "object" && !Array.isArray(value))) {
    const keys = new Set(present.flatMap((value) => Object.keys(value)));
    return Object.fromEntries([...keys].map((key) => [key, aggregate(present.map((value) => value[key]))]));
  }
  return present.at(-1);
}

function scalar(value, field = "median") {
  if (Number.isFinite(value)) return value;
  return Number.isFinite(value?.[field]) ? value[field] : null;
}

function resultKey(result) {
  return `${result.fixture.size}/${result.fixture.shape}`;
}

function budgetStatus(result) {
  const size = result.fixture.size;
  if (!["large", "very-large"].includes(size)) return null;
  const metrics = result.metrics;
  const budgets = size === "large"
    ? {
      firstUsable: 1_500,
      viewportFps: 55,
      viewportP95: 25,
      selectionP95: 50,
      contextMenuP95: 75,
      filterP95: 100,
      update100: 100,
      interactionLongTask: 150
    }
    : {
      firstUsable: 3_000,
      viewportFps: 45,
      viewportP95: 40,
      selectionP95: 100,
      filterP95: 200,
      update100: 200,
      interactionLongTask: 250
    };
  const actual = {
    firstUsable: scalar(metrics.firstUsable),
    viewportFps: metrics.viewport?.medianFps,
    viewportP95: metrics.viewport?.p95,
    selectionP95: metrics.selection?.p95,
    contextMenuP95: metrics.contextMenu?.p95,
    filterP95: metrics.filter?.p95,
    update100: scalar(metrics.incrementalElements?.update?.[100]),
    interactionLongTask: scalar(metrics.interactionLongTasks?.max, "max")
  };
  const checks = {
    firstUsable: actual.firstUsable <= budgets.firstUsable,
    viewportFps: actual.viewportFps >= budgets.viewportFps,
    viewportP95: actual.viewportP95 <= budgets.viewportP95,
    selectionP95: actual.selectionP95 <= budgets.selectionP95,
    filterP95: actual.filterP95 <= budgets.filterP95,
    update100: actual.update100 <= budgets.update100,
    interactionLongTask: actual.interactionLongTask <= budgets.interactionLongTask,
    ...(size === "large" ? { contextMenuP95: actual.contextMenuP95 <= budgets.contextMenuP95 } : {})
  };
  return { budgets, actual, checks, pass: Object.values(checks).every(Boolean) };
}

async function waitForServer(server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}`);
    try {
      const response = await fetch(`${BASE_URL}/graph-benchmark.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for benchmark server");
}

async function runMeasured(page, configuration, tracePath = null, context = null) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await page.evaluate((config) => window.__quasarGraphBenchmark.runScenario(config), configuration);
  }
  const runs = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    if (tracePath && index === 0) {
      await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
    }
    runs.push(await page.evaluate((config) => window.__quasarGraphBenchmark.runScenario(config), configuration));
    if (tracePath && index === 0) await context.tracing.stop({ path: tracePath });
  }
  const first = runs[0];
  return {
    fixture: first.fixture,
    mode: first.mode,
    metrics: aggregate(runs.map((run) => run.metrics))
  };
}

async function runLayouts(page) {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    await page.evaluate(() => window.__quasarGraphBenchmark.benchmarkLayouts({ size: "medium", shape: "mixed" }));
  }
  const runs = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    runs.push(await page.evaluate(() => window.__quasarGraphBenchmark.benchmarkLayouts({ size: "medium", shape: "mixed" })));
  }
  return {
    size: "medium",
    shape: "mixed",
    nodeCount: runs[0].nodeCount,
    edgeCount: runs[0].edgeCount,
    layouts: Object.fromEntries(Object.keys(runs[0].layouts).map((name) => [
      name,
      stats(runs.map((run) => run.layouts[name]))
    ]))
  };
}

async function main() {
  await fs.mkdir("benchmarks/results/traces", { recursive: true });
  const server = spawn("npm", ["run", "dev", "--", "--host", HOST, "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_BASE_PATH: "/" }
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-precise-memory-info", "--js-flags=--expose-gc", "--disable-background-timer-throttling"]
    });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    await page.goto(`${BASE_URL}/graph-benchmark.html`);
    await page.waitForFunction(() => Boolean(window.__quasarGraphBenchmark));

    const sizes = profile === "quick" ? ["small", "medium"] : ["small", "medium", "large", "very-large"];
    const iterationResults = {};
    for (const iteration of iterations) {
      iterationResults[iteration.name] = [];
      for (const size of sizes) {
        const isLarge = ["large", "very-large", "stress"].includes(size);
        const configuration = {
          size,
          shape: "mixed",
          strategy: iteration.strategy,
          detailMode: iteration.detailMode,
          layoutMode: iteration.layoutMode,
          interactionIterations: isLarge ? (iteration.name === "baseline" ? 1 : 3) : 8,
          viewportFrames: isLarge ? 60 : 90,
          includeIncremental: iteration.name === "baseline" ? !isLarge : true,
          graphSwitchIterations: isLarge ? (iteration.name === "baseline" ? 2 : 5) : 10
        };
        const tracePath = size === "large" && ["baseline", "final"].includes(iteration.name)
          ? path.resolve(`benchmarks/results/traces/${iteration.name}-large.zip`)
          : null;
        console.log(`benchmark ${iteration.name} ${size}/mixed`);
        iterationResults[iteration.name].push(await runMeasured(page, configuration, tracePath, context));
      }
    }

    if (profile !== "quick") {
      console.log("benchmark final stress/mixed");
      iterationResults.final.push(await runMeasured(page, {
        size: "stress",
        shape: "mixed",
        strategy: "reconcile",
        detailMode: "adaptive",
        layoutMode: "size-aware",
        interactionIterations: 2,
        viewportFrames: 60,
        includeIncremental: false,
        graphSwitchIterations: 2
      }, null, context));
    }

    const shapeCoverage = [];
    const shapes = ["sparse-random", "hierarchy", "hub-heavy", "disconnected", "multigraph", "long-labels", "unresolved", "mixed"];
    for (const shape of profile === "quick" ? ["mixed", "unresolved"] : shapes) {
      console.log(`benchmark shape small/${shape}`);
      shapeCoverage.push(await runMeasured(page, {
        size: "small",
        shape,
        strategy: "reconcile",
        detailMode: "adaptive",
        layoutMode: "size-aware",
        interactionIterations: 4,
        viewportFrames: 45,
        includeIncremental: false,
        graphSwitchIterations: 2
      }, null, context));
    }

    console.log("benchmark built-in layouts");
    const layouts = await runLayouts(page);
    const browserVersion = await browser.version();
    const largeByIteration = Object.fromEntries(iterations.map((iteration) => [
      iteration.name,
      iterationResults[iteration.name].find((result) => result.fixture.size === "large")
        || iterationResults[iteration.name].at(-1)
    ]));
    const iterationSummary = iterations.map((iteration) => {
      const result = largeByIteration[iteration.name];
      return {
        name: iteration.name,
        change: iteration.change,
        firstUsable: scalar(result.metrics.firstUsable),
        filterP95: result.metrics.filter?.p95 ?? null,
        viewportFps: result.metrics.viewport?.medianFps ?? null,
        maxLongTask: scalar(result.metrics.interactionLongTasks?.max, "max")
      };
    });
    const originalLarge = largeByIteration.baseline;
    const finalLarge = largeByIteration.final;
    const traceNotes = [
      `The original renderer removed and recreated every element; large-graph filter p95 was ${originalLarge.metrics.filter?.p95?.toFixed?.(1) ?? "unavailable"} ms.`,
      `The original position restoration performed one linear node search per Cytoscape node, producing quadratic mount and filter work.`,
      `After differential reconciliation, large-graph filter p95 was ${finalLarge.metrics.filter?.p95?.toFixed?.(1) ?? "unavailable"} ms.`,
      `Interaction long-task maximum changed from ${scalar(originalLarge.metrics.interactionLongTasks?.max, "max")?.toFixed?.(1) ?? "unavailable"} ms to ${scalar(finalLarge.metrics.interactionLongTasks?.max, "max")?.toFixed?.(1) ?? "unavailable"} ms.`,
      `Trace archives are written for baseline-large and final-large under benchmarks/results/traces.`
    ];

    const commit = process.env.GITHUB_SHA || process.env.GRAPH_BENCH_COMMIT || "working-tree";
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        commit,
        browserVersion,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model || "unknown",
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR
      },
      methodology: {
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        reported: "median and p95",
        fixtureSeed: 0x5eed1234,
        profile
      },
      iterations: iterationResults,
      iterationSummary,
      shapeCoverage,
      layouts,
      budgets: Object.fromEntries(iterationResults.final
        .map((result) => [resultKey(result), budgetStatus(result)])
        .filter(([, value]) => value)),
      traceNotes
    };

    await fs.writeFile("benchmarks/results/graph-final.json", `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile("benchmarks/results/graph-original-baseline.json", `${JSON.stringify({
      ...report,
      iterations: { baseline: report.iterations.baseline },
      iterationSummary: report.iterationSummary.slice(0, 1)
    }, null, 2)}\n`);
    await fs.writeFile("benchmarks/results/graph-report.md", createMarkdownReport(report));
    if (updateBaseline) {
      await fs.mkdir("benchmarks/baseline", { recursive: true });
      await fs.writeFile("benchmarks/baseline/graph-baseline.json", `${JSON.stringify({
        schemaVersion: report.schemaVersion,
        generatedAt: report.generatedAt,
        environment: report.environment,
        methodology: report.methodology,
        iterations: { final: report.iterations.final }
      }, null, 2)}\n`);
    }
    console.log("benchmarks/results/graph-final.json");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (server.exitCode && server.exitCode !== 0 && server.exitCode !== 143) {
      console.error(serverOutput);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

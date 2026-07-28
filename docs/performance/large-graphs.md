# Large graph performance

This document records the deterministic large-graph benchmark methodology and the measured optimization iterations for Quasar.

## Status

Benchmark execution and final environment-specific results are pending the fixed Chromium validation run for this branch. Do not treat the branch as merge-ready until this section is replaced with the completed before/after tables and all required checks pass.

## Benchmark environment

The browser harness fixes the viewport at 1440×900 with device scale factor 1, runs two warmups and five measured samples, and reports medians plus p95 values where applicable. The final report records the exact operating system, CPU, memory, Node.js version, Chromium version, and commit SHA emitted by the runner.

## Fixtures

The seeded fixture generator covers 250/500, 1,000/2,000, 5,000/10,000, 10,000/25,000, and 25,000/50,000 node/edge targets. Shapes include sparse random, hierarchy, hub-heavy, disconnected, multigraph, long-label, unresolved-endpoint, and mixed StarIntel dtype/dataset graphs.

## Methodology

The benchmark records StarIntel projection, Cytoscape first usable and stable frames, input readiness, layout duration, filtering, selection, context menus, dragging, pan/zoom frame timing and FPS, long tasks, incremental document and element changes, heap usage when exposed by Chromium, repeated graph-switch growth, and each built-in Quasar layout.

The original renderer replacement path and the differential reconciler are measured separately. The comparison command rejects important median regressions above 10% unless the checked baseline and written explanation are updated together.

## Optimization sequence

1. Establish the deterministic browser and algorithmic harness.
2. Replace full Cytoscape destruction/recreation with ID-based batched reconciliation.
3. Keep viewport and drag interaction state out of the global React render path.
4. Apply deterministic, reversible rendering detail based on graph size, zoom, and interaction state.
5. Bound and cancel layouts and use graph-size-aware layout options.
6. Record final regression data, rejected experiments, trace notes, and remaining limits here.

## Reproduction

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run check:boundaries
npm run check:static
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run bench:graph
npm run bench:graph:report
```

Use `npm run bench:graph:update` only when intentionally accepting a reviewed baseline change. Use `npm run bench:graph:compare` to validate a candidate result against the checked baseline.

# Web edition and standalone delivery roadmap

This document is the repository execution plan for [roadmap issue #2](https://github.com/lost-rob0t/quasar-ui/issues/2). The issue and its linked implementation issues own scope and acceptance criteria. The machine-readable [dependency manifest](roadmap.json) mirrors their dependency declarations and is validated in the test suite.

This roadmap describes the target architecture for **`quasar-ui` as the browser UI and standalone web edition**. It does not define the complete Quasar/StarIntel deployment and it does not supersede the canonical Common Lisp runtime in `lost-rob0t/quasar`, the persistent backend in `lost-rob0t/starintel-server`, or external actor services such as `lost-rob0t/star-bbpd`.

See [CAPABILITY-BOUNDARY.md](CAPABILITY-BOUNDARY.md) for the cross-repository split.

Existing prototype behavior is not evidence that a roadmap item is complete: an item is complete only when its issue acceptance criteria are tested, merged, and the issue is closed.

## Fixed target for standalone browser mode

When `quasar-ui` runs by itself:

- TypeScript, React, and Vite comprise the browser application platform.
- IndexedDB is the target canonical **browser-local** workspace store.
- Cytoscape.js is accessible only through a strict graph adapter.
- Manual edits, imports, and actions emit validated graph-operation batches.
- Web Workers run browser-safe local actions and expensive parsing/layout work.
- XState owns browser startup, interaction, connection, and action lifecycles where adopted by the roadmap.
- TanStack Query owns optional remote adapter state only.
- Optional service connectivity uses typed adapters and fails closed.
- Dashboard, graph, map, table, and timeline surfaces are projections over stable identifiers.
- The standalone web edition is a static, installable PWA.

These requirements define **standalone mode**, not the entire Quasar architecture.

## Connected runtime mode

When the UI is attached to canonical `lost-rob0t/quasar` runtime services:

- the browser remains the presentation and high-frequency interaction layer;
- migrated durable operations use the canonical Quasar command/revision boundary;
- persistent Sento actors, privileged host integrations, replay and runtime capability discovery belong behind the Common Lisp runtime boundary;
- `starintel-server` may provide persistent StarIntel ingest, storage, search, RabbitMQ routing and other backend services;
- external services such as `star-bbpd` may provide long-running collectors/analyzers and native tool processes;
- browser-local data may remain standalone state, transient state, cache or projection depending on the migrated subject, but it must not silently overrule newer canonical runtime state;
- unavailable services reduce the advertised capability set rather than being silently replaced with weaker browser semantics.

The web edition therefore has two valid deployments:

```text
standalone
  quasar-ui

connected
  quasar-ui -> quasar -> starintel-server / external actor services
```

There is no requirement to put React rendering, Cytoscape interaction, or ordinary browser-local behavior inside the Common Lisp process. Conversely, the existence of a static PWA does not prohibit or replace the runtime-backed connected path.

## Delivery policy

Work is admitted in dependency order from [roadmap.json](roadmap.json). Independent issues may proceed in parallel, but a pull request must not rely on an open dependency's unmerged implementation. Cross-phase work can start when its declared dependencies are complete; a phase is not declared complete until every issue in it is closed and its exit gate passes against a clean checkout.

Every implementation pull request must:

1. link its owning roadmap issue and state which dependency versions it was tested against;
2. preserve one canonical mutation path for the deployment mode being changed;
3. include deterministic regression coverage at the lowest useful layer;
4. pass formatting, linting, strict type checking, unit/browser tests, and the production build;
5. update migrations, retained fixtures, diagnostics, and user documentation when contracts change;
6. preserve the runtime/service capability boundary described in `CAPABILITY-BOUNDARY.md`.

Status is derived from GitHub issue state. Similar prototype code, a merged partial implementation, or a checked box copied into documentation does not override an open issue.

## Migration from the browser prototype

The browser-first prototype remains useful as interaction and import/export reference behavior. Migration proceeds through explicit boundaries:

1. phase 0 establishes enforceable TypeScript packages, validation and deterministic fixtures;
2. phase 1 establishes the standalone browser graph/document core, commands, revision history and IndexedDB repository;
3. supported prototype data enters the graph core through canonical import and graph-operation paths;
4. phase 2 replaces direct renderer/persistence coupling with application services and the graph adapter;
5. phase 3 moves browser-safe actors to bounded worker actions and defines typed optional service adapters;
6. phases 4 and 5 add browser projections and production PWA behavior without making renderers authoritative stores;
7. connected-mode migration separately moves selected durable or privileged operations behind canonical `quasar` commands without deleting standalone browser functionality.

No destructive in-place conversion is permitted. A storage migration must retain fixtures, validate the complete source before commit, use an atomic destination transaction where the chosen store supports one, and preserve an export or recovery path until the migrated workspace is verified.

## Phases and gates

### Phase 0 — Foundation

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#3](https://github.com/lost-rob0t/quasar-ui/issues/3) | TypeScript/React/Vite workspace | — |
| [#4](https://github.com/lost-rob0t/quasar-ui/issues/4) | Package boundaries and architecture rules | #3 |
| [#5](https://github.com/lost-rob0t/quasar-ui/issues/5) | Quality, test, and CI baseline | #3 |
| [#6](https://github.com/lost-rob0t/quasar-ui/issues/6) | Deterministic fixtures and schema conformance | #3, #4, #5 |

Exit gate: a clean checkout builds and tests, architecture boundaries are enforceable, and deterministic fixtures exist.

### Phase 1 — Local-first graph core

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#7](https://github.com/lost-rob0t/quasar-ui/issues/7) | Canonical browser graph document and type registry | #4, #6 |
| [#8](https://github.com/lost-rob0t/quasar-ui/issues/8) | Graph commands and atomic browser batch engine | #7 |
| [#9](https://github.com/lost-rob0t/quasar-ui/issues/9) | Transaction undo/redo and revisions | #8 |
| [#10](https://github.com/lost-rob0t/quasar-ui/issues/10) | IndexedDB repository and migrations | #7, #9 |
| [#11](https://github.com/lost-rob0t/quasar-ui/issues/11) | Canonical JSON, GraphML and CSV interchange | #6, #7, #8, #10 |

Exit gate: standalone graphs can be created, edited through commands, saved offline, reopened, undone/redone, imported and exported without a server.

### Phase 2 — Editable workbench MVP

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#12](https://github.com/lost-rob0t/quasar-ui/issues/12) | Resizable investigation shell | #3, #10 |
| [#13](https://github.com/lost-rob0t/quasar-ui/issues/13) | Cytoscape graph adapter and extension loader | #7, #8, #12 |
| [#14](https://github.com/lost-rob0t/quasar-ui/issues/14) | Node and edge editing gestures | #8, #9, #13 |
| [#15](https://github.com/lost-rob0t/quasar-ui/issues/15) | Typed node and edge inspector | #7, #8, #12, #14 |
| [#16](https://github.com/lost-rob0t/quasar-ui/issues/16) | Persisted layouts, viewport, selection and views | #9, #10, #13, #14 |
| [#17](https://github.com/lost-rob0t/quasar-ui/issues/17) | Command palette, keymap and navigation | #12, #14, #15, #16 |

Exit gate: a standalone user can open a workspace, create/connect typed nodes, edit properties, arrange the graph, save/reopen it, and operate the core editor by pointer or keyboard.

### Phase 3 — Browser actions and optional integrations

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#18](https://github.com/lost-rob0t/quasar-ui/issues/18) | Action registry and applicability | #7, #14, #17 |
| [#19](https://github.com/lost-rob0t/quasar-ui/issues/19) | Sandboxed Web Worker action runner | #18 |
| [#20](https://github.com/lost-rob0t/quasar-ui/issues/20) | Validated, undoable action batches | #8, #9, #19 |
| [#21](https://github.com/lost-rob0t/quasar-ui/issues/21) | Action progress, cancellation, logs and traces | #18, #19, #20 |
| [#22](https://github.com/lost-rob0t/quasar-ui/issues/22) | Typed optional StarIntel/runtime adapter | #7, #18, #21 |

Exit gate: a local worker action can be discovered, invoked, cancelled, validated, applied and undone; optional remote/runtime integration remains capability-gated.

Browser workers are not substitutes for persistent Quasar actors or external actor services. A capability requiring persistent supervision, privileged host access, RabbitMQ service consumption or native recon processes must remain behind the runtime/service boundary.

### Phase 4 — Investigation projections and dashboard

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#23](https://github.com/lost-rob0t/quasar-ui/issues/23) | Virtualized table projection | #7, #12, #16 |
| [#24](https://github.com/lost-rob0t/quasar-ui/issues/24) | MapLibre adapter and layer registry | #7, #12, #16 |
| [#25](https://github.com/lost-rob0t/quasar-ui/issues/25) | Timeline adapter and temporal filtering | #7, #12, #16 |
| [#26](https://github.com/lost-rob0t/quasar-ui/issues/26) | Shared selection, filters and time | #13, #23, #24, #25 |
| [#27](https://github.com/lost-rob0t/quasar-ui/issues/27) | Dashboard manifests, panels and layouts | #12, #23, #24, #25, #26 |
| [#28](https://github.com/lost-rob0t/quasar-ui/issues/28) | Projection coordinator and refresh scheduler | #22, #23, #24, #25, #27 |
| [#29](https://github.com/lost-rob0t/quasar-ui/issues/29) | CodeMirror and optional Star-Lang integration | #7, #11, #17, #22 |
| [#30](https://github.com/lost-rob0t/quasar-ui/issues/30) | Evidence and document inspection | #10, #15, #22, #26 |

Exit gate: graph, table, map, timeline, dashboard, editor and document views coordinate through stable identifiers without creating duplicate authoritative stores.

### Phase 5 — Production web edition

| Issue | Deliverable | Depends on |
| --- | --- | --- |
| [#31](https://github.com/lost-rob0t/quasar-ui/issues/31) | Installable offline PWA | #10, #12, #16, #27 |
| [#32](https://github.com/lost-rob0t/quasar-ui/issues/32) | Secure local files and recovery | #10, #11, #30, #31 |
| [#33](https://github.com/lost-rob0t/quasar-ui/issues/33) | CSP, import, renderer and extension hardening | #11, #19, #22, #29, #30, #31 |
| [#34](https://github.com/lost-rob0t/quasar-ui/issues/34) | Accessibility, responsive and touch support | #12, #14, #15, #17, #23, #24, #25, #27 |
| [#35](https://github.com/lost-rob0t/quasar-ui/issues/35) | Performance workers, fixtures and budgets | #6, #13, #19, #23, #24, #25, #28, #29, #32 |
| [#36](https://github.com/lost-rob0t/quasar-ui/issues/36) | Production CI and static deployment | #5, #31, #33, #34, #35 |
| [#37](https://github.com/lost-rob0t/quasar-ui/issues/37) | Versioning, diagnostics and operations | #31, #32, #33, #35, #36 |

Exit gate: the standalone web edition is reproducibly deployed, installable, offline-capable, secure under its CSP, accessible, performance-budgeted, recoverable, versioned and rollback-ready.

## Production-readiness decisions

### Standalone web edition

A standalone release candidate is production-ready only after all browser phase gates pass and evidence covers:

- retained graph and storage fixtures across supported migrations;
- offline reload, service-worker update, backup, restore and rollback scenarios;
- clean static artifacts built without requiring backend services;
- CSP, accessibility, performance-budget and direct-route checks;
- optional integrations failing closed while local graph creation/editing continue;
- diagnostics for application, graph format, storage schema, dashboard manifest and action contract versions;
- a retained known-good artifact and rollback procedure.

### Connected deployment

A connected deployment has additional gates owned jointly with canonical Quasar and StarIntel services. Browser production-readiness alone does **not** prove:

- canonical runtime command/revision correctness;
- persistent actor supervision;
- server-side ingest/storage/search correctness;
- RabbitMQ routing/service settlement;
- BBPD or other external actor-service readiness;
- reconnect/replay behavior for migrated durable operations.

Those capabilities must be validated by their owning repositories and exposed to the UI through capability discovery.

## Release promotion

Standalone release promotion uses one immutable static artifact:

1. CI builds the static site from a clean, lockfile-enforced checkout and records its version/digest.
2. The unchanged artifact passes direct-route, install, offline, update, recovery, CSP, accessibility and performance checks.
3. An approved main-branch or tagged release promotes that exact artifact to GitHub Pages and retains it for alternate static hosting.
4. Post-deployment smoke checks record the deployed version, service-worker version, artifact digest and result.
5. A failed smoke check restores the retained previous known-good artifact and publishes the failure in release diagnostics.

Connected runtime/service releases are versioned and promoted independently by their owning repositories. The UI consumes their advertised compatible capabilities rather than assuming lockstep deployment.

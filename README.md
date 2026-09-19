# Quasar UI

`quasar-ui` is the **browser user interface and standalone web edition** of
Quasar. It provides the React/Vite/Cytoscape investigation workspace, mobile and
PWA behavior, browser-local editing, imports/exports, local persistence, and a
bounded browser-safe capability set.

It is **not** the complete Quasar or StarIntel runtime.

The full deployment is layered:

```text
quasar-ui
  browser UI / graph renderer / standalone subset
        |
        | typed commands, projections, capability discovery
        v
quasar
  canonical Common Lisp control plane and runtime
        |
        | StarIntel APIs and service adapters
        v
starintel-server
  persistent ingest / storage / search / routing / RabbitMQ
        |
        +-----------------------------+
        |                             |
        v                             v
star-bbpd                       other actor services
  external recon actors          collectors / analyzers / tools
```

`quasar-ui` remains useful without the backend stack, but standalone mode is a
**subset deployment**, not capability parity. Features that require persistent
Sento supervision, privileged host access, backend databases/search, distributed
queues, long-running collectors, or external tool processes require the
corresponding runtime/service.

For the normative split, see
[`docs/CAPABILITY-BOUNDARY.md`](docs/CAPABILITY-BOUNDARY.md).

## Roles

### Quasar UI

This repository owns:

- React/Vite application shell;
- Cytoscape graph rendering and transient graph interaction;
- browser document, graph, dataset, import, settings, statistics and agent UI;
- mobile and PWA behavior;
- browser-local standalone workspaces;
- local imports/exports and supported browser persistence;
- browser-safe bounded workers/actions;
- display of capability discovery, runtime state, service results and errors.

### Canonical Quasar runtime

`lost-rob0t/quasar` owns the Common Lisp control plane for migrated operations,
including canonical command/revision authority, persistent Sento supervision,
privileged/local integrations, reconnect/replay behavior and runtime capability
discovery.

When this UI is connected to canonical Quasar, durable migrated mutations are
requests to that runtime rather than competing browser-side commits.

### StarIntel Server

`lost-rob0t/starintel-server` owns persistent StarIntel backend functions such as
document ingest, storage, querying/search, RabbitMQ routing and distributed
service coordination where configured.

### BBPD and other external services

`lost-rob0t/star-bbpd` is a concrete external actor service. It consumes
actor-specific RabbitMQ targets, runs Subfinder, Nmap, Httpx, Katana and DNS
workflows, and publishes derived StarIntel documents, relations and actor events.

The UI may submit targets and display BBPD state/results through StarIntel
interfaces. That does not make BBPD a browser capability, and JavaScript does not
need to reimplement those scanners.

## Current browser implementation

Current functionality includes:

- strict TypeScript application entrypoint and package contracts;
- React and Vite application shell;
- Cytoscape investigation graph with relationship navigation and context menus;
- local StarIntel document storage and saved graph workspaces;
- canonical StarIntel v0.9 validation through `starintel_doc.js`;
- document creation/editing and typed relation creation;
- searchable/filterable document table;
- JSON, JSONL, NDJSON and CSV import;
- dataset and actor manifest resolution;
- statistics dashboard;
- JSONL export;
- transaction-level undo/redo;
- connection path finder;
- browser actors in Web Workers;
- persistent operator-agent UI with provider adapters and scoped memory;
- permissioned database, graph, actor and graph-mutation tools;
- optional Brave search, bounded URL extraction and MCP tools;
- saved graph construction from document IDs or database queries;
- run checkpoints, recovery, loop detection, budgets and cost logs;
- desktop/mobile agent console;
- service-worker based offline reopening;
- GitHub Actions CI and Pages deployment.

Some prototype integrations can talk directly to StarIntel services. The
migration direction is to keep presentation in this repository while moving
privileged, persistent or distributed behavior behind the canonical runtime and
service capability boundaries.

## Data boundary

The graph is a projection of StarIntel documents and workspace state. A renderer
is never the authoritative database merely because it displays or edits a
projection.

Standalone browser mode may own browser-local state. Connected mode must honor
the canonical Quasar command/revision boundary for migrated operations.

Quasar-only UI state includes items such as:

- graph positions;
- viewport and selection;
- layout choice;
- saved graph definitions;
- browser settings;
- standalone integration configuration.

Canonical StarIntel documents must remain distinguishable from UI-only state.

## Routes

```text
/graph
/documents
/documents/new
/documents/:id
/documents/:id/edit
/import
/stats
/settings
/agents
```

## Development

From a clean checkout:

```bash
npm ci
npm run dev
```

Validation and production commands:

```bash
npm run check
npm run typecheck
npm run check:boundaries
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Node.js 22.12 or newer and the committed npm lockfile define the reproducible
toolchain.

Development and production builds use root hosting by default. Set
`VITE_BASE_PATH` for subpath deployments:

```bash
VITE_BASE_PATH=/quasar-ui/ npm run build
```

## Package direction

The TypeScript package boundaries are organized around:

```text
src/app
src/core
src/storage
src/graph
src/actions
src/projections
src/integrations
src/components
src/testing
```

Renderer, storage, runtime and provider integrations should remain adapters
around stable graph/document and command contracts.

## Actors and agents

Browser actors receive cloned input and return declarative transform plans. They
must not mutate Cytoscape or persistence directly. Plans are validated and
applied through the normal mutation path.

Browser workers are intentionally bounded. Long-running or privileged actors
belong behind canonical Quasar/StarIntel service boundaries.

The `/agents` UI manages roles, providers, memory, runs, tools, checkpoints,
usage and cost. Provider and service availability should be exposed through
capability discovery rather than assumed from the presence of a button.

See [`docs/AGENT_SYSTEM.md`](docs/AGENT_SYSTEM.md) for the agent contracts.

## StarIntel connectivity

Connected deployments may expose StarIntel HTTP/WebSocket/RabbitMQ-backed
services through typed adapters. The UI should fail closed when a capability is
unavailable and preserve standalone editing when possible.

The architectural rule is simple:

> **Quasar UI presents capabilities. Quasar and StarIntel services provide the
> full runtime capability set.**

The standalone browser edition does not supersede the Common Lisp runtime or
external StarIntel services.

## Roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the delivery roadmap for the **web
edition and standalone browser responsibilities**. It must not be read as a ban
on the connected Common Lisp runtime path.

For cross-repository authority and capability boundaries, use
[`docs/CAPABILITY-BOUNDARY.md`](docs/CAPABILITY-BOUNDARY.md) and the canonical
Quasar documentation.

# Quasar UI capability boundary

`quasar-ui` is the browser user interface and standalone web edition of Quasar.
It is **not** the complete StarIntel or Quasar runtime.

## Deployment layers

```text
quasar-ui
  React / Vite / Cytoscape
  browser presentation + local standalone subset
        |
        | typed commands, projections, capability discovery
        v
quasar
  canonical Common Lisp control plane/runtime
        |
        | StarIntel service APIs and adapters
        v
starintel-server
  persistent ingest / storage / search / routing / RabbitMQ
        |
        +-----------------------------+
        |                             |
        v                             v
star-bbpd                       other actor services
  recon tool actors              collectors / analyzers / tools
```

## What `quasar-ui` owns

- browser presentation and navigation;
- Cytoscape graph rendering and transient graph interaction;
- mobile and PWA behavior;
- local imports and exports;
- browser-local settings and standalone workspaces;
- browser-safe bounded workers and actions;
- local/offline operation when the user explicitly runs the standalone edition;
- presentation of runtime/service capabilities, status, results and errors.

## What `quasar-ui` does not replace

The browser UI does not replace or imply parity with:

- canonical Quasar command/revision authority;
- persistent Common Lisp/Sento actor supervision;
- privileged local execution and host integrations;
- StarIntel Server document ingest and persistence;
- CouchDB-backed server storage and search;
- RabbitMQ routing and distributed service coordination;
- long-running external collectors or analyzers;
- external tool processes such as Subfinder, Nmap, Httpx and Katana.

Those capabilities belong to `quasar`, `starintel-server`, and external StarIntel
services as configured by a deployment.

## BBPD

`star-bbpd` is a concrete external service in the current stack. It is a
Python/Pykka actor service that consumes actor-specific targets from RabbitMQ,
runs Subfinder, Nmap, Httpx, Katana and DNS workflows, and publishes derived
StarIntel documents, relations and actor events.

Quasar UI may expose controls and results for BBPD through the runtime/service
interfaces. It must not claim that browser-side JavaScript provides the same
service merely because the UI can submit a target or display its output.

## Standalone mode

Standalone Quasar UI remains first-class and useful. It can edit and inspect
local documents and graphs, import/export data, persist supported browser-local
state, and run explicitly browser-safe capabilities.

Standalone mode is a **subset deployment**. A feature that requires persistent
supervision, privileged host access, backend databases/search, distributed
queues, or external tool processes must be reported as unavailable unless the
corresponding runtime/service is connected.

## Connected mode

When connected to canonical Quasar services:

1. UI rendering and transient interaction remain in the browser.
2. Migrated durable mutations cross the canonical Quasar command boundary.
3. Runtime capabilities are discovered rather than assumed.
4. StarIntel Server owns the backend ingest/storage/search/routing functions
   assigned to it.
5. External actor services remain independent service processes behind their
   declared transport and capability contracts.
6. Missing services reduce the advertised capability set; the UI must not
   silently substitute weaker browser semantics.

## Naming rule

Documentation in this repository should distinguish:

- **Quasar UI / `quasar-ui`** — browser UI and standalone web edition;
- **Quasar / `quasar`** — canonical Common Lisp control plane/runtime for
  migrated operations;
- **StarIntel Server / `starintel-server`** — persistent StarIntel backend;
- **BBPD / `star-bbpd`** — external reconnaissance actor service.

The standalone edition does not forbid or supersede the connected
runtime-backed deployment.

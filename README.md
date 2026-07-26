# Quasar UI

Quasar is a browser-first, offline-first StarIntel investigation workspace. It follows the graph-document and reversible-operation boundaries from the Quasar designs in `starintel-auto-research`, while replacing the earlier CLOG/backend-first prototype assumption with a full JavaScript client.

The [JavaScript-only deployment roadmap](docs/ROADMAP.md) defines the target architecture, dependency order, phase gates, and production-readiness decision. The implementation list below describes the current prototype and does not supersede the roadmap's IndexedDB-based target.

## Current implementation

- strict TypeScript application entrypoint and package contracts
- React and Vite application shell
- Cytoscape investigation graph with Maltego-style selection and relationship navigation
- PouchDB canonical local corpus
- separate PouchDB workspace/settings store
- optional push, pull, one-shot, or live CouchDB replication
- canonical StarIntel v0.9 validation through `starintel_doc.js`
- graph-created documents and relations
- standalone manual document adder/editor
- stable single-document routes at `/documents/:id`
- searchable/filterable table view
- single-file upload
- bulk multi-file upload
- JSON, JSONL, NDJSON, and CSV import
- save-and-open graph navigation for newly imported records
- dataset and actor manifest file resolution
- statistics dashboard
- JSONL export
- transaction-level undo and redo
- connection path finder
- opt-in custom browser actors executed in Web Workers
- runtime service worker for offline reopening
- GitHub Actions CI and Pages deployment

## Data boundary

Quasar stores canonical StarIntel documents directly in `quasar-starintel-v09`.
The graph is a projection of that local corpus: it hydrates on startup and refreshes from the PouchDB changes feed. Import navigation carries only selection/focus state and does not create a second graph document store.

Quasar-only state is stored separately in `quasar-ui-state-v1`:

- graph positions
- viewport
- selected nodes
- layout choice
- CouchDB settings
- browser actor manifests

Only the StarIntel corpus database is replicated to CouchDB. UI state does not contaminate the StarIntel schema.

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
```

The Pages build includes `404.html` as an SPA fallback so direct document routes remain loadable.

## Development

```bash
npm ci
npm run dev
npm run check
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Node.js 22 or newer and the committed npm lockfile define the reproducible
toolchain. `npm run check` includes strict TypeScript validation plus syntax
checks for the static service-worker runtime.

The TypeScript package entrypoints establish the intended dependency areas:

```text
src/app
src/core
src/storage
src/graph
src/actions
src/projections
src/components
src/testing
```

Existing JavaScript feature modules remain available behind those entrypoints
while they are migrated incrementally; new package contracts and the browser
entrypoint are type-checked with `strict: true`.

The application pins the tested v0.9 runtime commit from `starintel_doc.js`:

```text
github:lost-rob0t/starintel_doc.js#108310c1bcee403cb7e40dabfd3547a6b5228c51
```

The dependency and this documented revision must stay aligned so import diagnostics identify the validator actually bundled into the application.

## Import conventions

- `.json`: one document, an array, or an object containing `documents`/`docs`
- `.jsonl` and `.ndjson`: one document per line
- `.csv`: common envelope columns plus `data` JSON or `data.<field>` columns
- manifests: select the manifest and referenced files in the same bulk file picker

Imports are atomic by default: every candidate and duplicate ID is checked before PouchDB writes. A failed PouchDB bulk result triggers compensating rollback, and the report preserves file, record, validation-path, and write-phase details. Existing IDs are replaced only when explicitly requested or when the incoming version/date is newer.

Import reports also show the active `starintel_doc` schema revision and profile. Production navigation is network-first, while content-hashed assets remain cache-first; service-worker update checks bypass the HTTP cache and replace an obsolete application shell on reload.

## Browser actors

Actors are disabled by default. An actor manifest contains:

```json
{
  "id": "quasar.actor.example",
  "label": "Example actor",
  "version": 1,
  "accepts": ["org", "person"],
  "source": "(context) => ({ documents: [], message: 'done' })"
}
```

Actors receive cloned selection/corpus data and return StarIntel documents. They cannot mutate the Cytoscape instance or PouchDB directly. Returned batches use the same validation and undo path as manual edits and imports.

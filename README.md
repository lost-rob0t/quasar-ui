# Quasar UI

Quasar is a browser-first, offline-first StarIntel investigation workspace. It follows the graph-document and reversible-operation boundaries from the Quasar designs in `starintel-auto-research`, while replacing the earlier CLOG/backend-first prototype assumption with a full JavaScript client.

## Current implementation

- strict TypeScript application entrypoint and package contracts
- React and Vite application shell
- Cytoscape investigation graph with Maltego-style selection and relationship navigation
- PouchDB canonical local corpus
- separate PouchDB workspace/settings store
- optional push, pull, one-shot, or live CouchDB replication
- canonical StarIntel v0.9 validation through `starintel_doc.js`
- graph-created documents and relations
- multiple saved graph workspaces with independent membership, layout, viewport, and selection
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
- saved graph definitions and active graph
- CouchDB settings
- browser actor manifests

Only the StarIntel corpus database is replicated to CouchDB. UI state does not contaminate the StarIntel schema.

The initial **All documents** graph dynamically projects the complete local corpus. Additional graphs start blank and store only document IDs plus graph-local view state; creating or deleting a graph never duplicates or deletes canonical corpus documents.

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

From a clean checkout, install the pinned dependencies and start the local
application at `http://localhost:5173` with one command:

```bash
npm ci && npm run dev
```

The individual validation and production commands are:

```bash
npm ci
npm run dev
npm run check
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Node.js 22.12 or newer and the committed npm lockfile define the reproducible
toolchain. `npm run check` includes strict TypeScript validation plus syntax
checks for the static service-worker runtime.

Development and production builds use root hosting by default. Set
`VITE_BASE_PATH` to an absolute URL path when deploying below a site root:

```bash
VITE_BASE_PATH=/quasar-ui/ npm run build
```

The Pages workflow sets this value from the repository name. The same normalized
base path configures Vite assets, React Router, the web manifest, and service
worker registration, so no backend or runtime URL rewriting is required.

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

Bundled actors are available by default; user-supplied actor code is disabled until explicitly enabled. An actor manifest contains:

```json
{
  "id": "quasar.actor.example",
  "label": "Example actor",
  "description": "Describe what this actor returns.",
  "version": 1,
  "accepts": ["org", "person"],
  "minSelection": 1,
  "maxSelection": 8,
  "source": "(context) => ({ documents: [], message: 'done' })"
}
```

Bundled actors are available without enabling custom actor code. The first built-ins generate username candidates from person/entity names and prepare `whatsmyname.app` enumeration links for existing or generated usernames. The live WhatsMyName check opens in its browser application because cross-origin profile sites cannot be reliably verified from a Quasar Web Worker.

Actors receive cloned selection/corpus data and return StarIntel documents. They cannot mutate the Cytoscape instance or PouchDB directly. Returned batches use the same validation and undo path as manual edits and imports. Selection bounds and accepted dtypes are checked before execution; actor output is capped before it reaches validation.

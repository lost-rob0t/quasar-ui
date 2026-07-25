# Quasar UI

Quasar is a browser-first, offline-first StarIntel investigation workspace. It follows the graph-document and reversible-operation boundaries from the Quasar designs in `starintel-auto-research`, while replacing the earlier CLOG/backend-first prototype assumption with a full JavaScript client.

## Current implementation

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
npm install
npm run dev
npm run check
npm test
npm run build
```

The `starintel_doc` dependency currently tracks the v0.9 port branch:

```text
github:lost-rob0t/starintel_doc.js#agent/starintel-v0.9-browser
```

Switch it to the released package or merged default branch after the specification PR lands.

## Import conventions

- `.json`: one document, an array, or an object containing `documents`/`docs`
- `.jsonl` and `.ndjson`: one document per line
- `.csv`: common envelope columns plus `data` JSON or `data.<field>` columns
- manifests: select the manifest and referenced files in the same bulk file picker

All candidate records are validated before PouchDB writes. Existing IDs are replaced only when explicitly requested or when the incoming version/date is newer.

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

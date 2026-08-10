# Melissa integration

Melissa enrichment is owned by the Common Lisp `quasar` backend.

The browser actor pack has been retired. Quasar UI no longer:

- stores Melissa license keys in browser `localStorage`;
- stores actor configuration in the browser;
- injects `context.configuration` into browser actor execution;
- intercepts browser `fetch` calls to inject Melissa credentials;
- calls Melissa endpoints directly from browser actors;
- installs `quasar.actor.melissa-*` actors into browser settings;
- normalizes Melissa responses in JavaScript.

## Backend boundary

The backend exposes Melissa through the Quasar control plane.

A request uses the `melissa.request` command with a canonical `person` or `target` entity:

```json
{
  "v": 1,
  "kind": "command",
  "id": "request-1",
  "command": "melissa.request",
  "payload": {
    "entity": {
      "_id": "person:example",
      "dataset": "example",
      "dtype": "person",
      "title": "Example Person",
      "data": {
        "name": "Example Person"
      },
      "extensions": {}
    },
    "options": {
      "service": "personator-search"
    }
  }
}
```

The Common Lisp backend validates the command, hands it to the Sento Melissa request router, and returns the correlated canonical result after the actor pipeline completes.

The Sento topology is:

```text
requesting actor
    |
    v
Melissa request router
    |
    v
round-robin lookup workers
    |
    v
Melissa normalizer
    |
    v
requestor forwarder
    |
    v
original requesting actor
```

Every operation carries a stable request ID and the requesting Sento actor reference. Completion order is not assumed.

## Configuration and credentials

Actor configuration and privileged credentials belong on the Quasar backend, not in browser storage or browser actor execution context.

Configure Melissa credentials on the backend. The default Quasar startup path reads:

```text
QUASAR_MELISSA_LICENSE_KEY
```

There is no browser actor-configuration registry. Browser actors receive only their ordinary execution context and capability API. Anything requiring configuration or secrets must cross the backend/control-plane boundary.

## Legacy browser migration

Quasar UI removes persisted `quasar.actor.melissa-*` browser actors and deletes both obsolete browser configuration stores when the application starts:

```text
quasar:melissa-actor-config:v1
quasar:actor-configuration:v1
```

The migration code does not perform Melissa lookups; it only removes obsolete browser-owned state.

# Melissa browser actors

Quasar ships an installable Melissa actor pack for browser-side person, business, address, property, contact, identity, and IP enrichment.

## Included actors

| Actor                               | Melissa service        | Main output                                                                        |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Melissa person search               | Personator Search      | Person or organization matches plus structured address, phone, and email documents |
| Melissa people and business search  | People Business Search | Partial person and business matches                                                |
| Melissa consumer verify and append  | Personator Consumer    | Check, Verify, Append, and Move results                                            |
| Melissa identity check              | Personator Identity    | Check and Screen results                                                           |
| Melissa reverse geocoder            | Reverse GeoCoder       | Nearby `location` documents                                                        |
| Melissa property lookup             | Property               | `asset` property records, locations, owners, and relations                         |
| Melissa global address verification | Global Address         | Corrected and geocoded `location` documents                                        |
| Melissa global name                 | Global Name            | Parsed `person` or `org` documents                                                 |
| Melissa global phone                | Global Phone           | Validated `phone` documents                                                        |
| Melissa global email                | Global Email           | Validated `email` documents                                                        |
| Melissa global IP                   | Global IP              | IP entities and related geolocation documents                                      |

## Configuration

Open **Settings**, then select **Melissa actors** in the lower-right corner.

The configuration panel stores these values locally in the current browser:

- Melissa license key or customer ID
- Default country and transmission reference
- Personator Consumer action: Check, Verify, Append, or Move
- Personator Identity action: Check or Screen
- People Business Search record and match limits
- Reverse geocoder distance and record limits
- Service-specific option and column strings
- Optional CORS proxy template

The license key is stored under `quasar:melissa-actor-config:v1` in browser `localStorage`. It is not embedded in actor manifests, StarIntel documents, or Quasar settings exports. Actor manifests are persisted in Quasar's local settings database and reload with the application.

## CORS proxy

Melissa requests are sent directly from the browser by default. When a deployment cannot call a Melissa endpoint because of browser CORS policy, set a proxy template containing `{url}`:

```text
https://proxy.example/fetch?url={url}
```

Quasar substitutes the URL-encoded Melissa request at runtime. The proxy must be controlled by the operator because the expanded request contains the Melissa license key.

## Input conventions

Actors read standard StarIntel v0.9 fields and common aliases. Examples:

- Person: `full_name`, `fname`, `mname`, `lname`
- Address/location: `street`, `street2`, `city`, `state`, `region`, `postal`, `country`, `lat`, `long`
- Email: `address` or `value`
- Phone: `number` or `value`
- Melissa identifiers: `mak`, `mik`, `melissa_address_key`, `melissa_identity_key`
- Property: `apn`, `fips`, `account`, or `free_form`
- IP: `ip`, `ip_address`, or `address`

A selected input may override configured Personator behavior with `data.melissa_action`, `data.melissa_options`, or `data.melissa_columns`.

## Document output

Every result passes through the normal StarIntel v0.9 validator before it is committed. Melissa raw response records remain under `extensions["melissa.api"].record`; typed fields are projected into schema-valid `person`, `org`, `location`, `asset`, `phone`, `email`, `entity`, and `relation` documents.

Relations are explicit and directed. Typical predicates include:

- `matched-to`
- `verified-as`
- `identity-check-result`
- `located-at`
- `has-phone`
- `has-email`
- `property-record`
- `owned-by`
- `normalized-as`
- `resolved-to`

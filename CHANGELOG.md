# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The client is generated from aio v0.26.0's document, which adds the catalogue a site's backend and its apps sell from: a product's `sku_prices` (every active sku's price per currency, with the renewal `interval` and `interval_count` of a subscription sku), the backend client's `store_currency`, an optional `sku` on each checkout line (member and backend), and `payment_url` on the `subscription-awaiting-payment` refusal of a checkout or a subscription change, where the member finishes paying the waiting order. A backend client holding `catalogue:read` may read products. No operation the document keys was added, so the operations sent a generated `Idempotency-Key` are unchanged.
- **BREAKING** — the backend's entitlements list answers `ListedAccountStatePage`: each member carries `entitlements_changed_at`, the list takes `changed_since`, and every page carries `next_changed_since`, where the next reconciliation walk starts. The `AccountStatePage` schema is no longer exported, since the document no longer declares it.
- Since aio v0.25.0's document, every parameter a public operation takes is typed (the billing entry's query, account states, sync pulls, webhook delivery filters and paging), along with the site app backend's operations; `Idempotency-Key` is filled for every operation the document keys (registering a webhook endpoint, starting a secret rotation, redelivering a delivery, a member's or a backend's checkout and portal session, a member's subscription cancellation, change and resumption, and a subscription's test clock and its advance).
- The operations aio 0.23.0 to 0.25.0 added are typed: a member's checkout sessions, portal sessions, subscriptions (list, cancel, change, resume) and store purchases (intents and transactions); the backend's checkout and portal sessions, store purchases, client, feature keys and product feature values, roles and role assignments, seats and seat pools, return targets and subscription test clocks.
- **BREAKING** — a record's `id`, and every field naming a record, is the record's opaque reference as aio 0.25.0 sends it (a UUID, an order number for an order, the account subject for a member), never its database key; an id stored from an earlier aio names nothing. The `List` schema is no longer exported, since the document no longer declares it; a list's type is the one its operation answers (such as `ArticlePage`).
- **BREAKING** — the client follows the API's plain-HTTP wire format. A success's `data` is the resource itself, or `{ data, next_cursor }` for a list, in place of a `status`/`message`/`data` envelope; a `202` or `204` with no body resolves with `data` undefined. A refusal's `error` is the RFC 9457 problem document (`type`, `title`, `status`, `detail`, and extensions such as `errors`), with `type` typed to the problem URIs each operation documents, in place of `ApiError`. Lists page by `limit` and the opaque `cursor`, in place of `per_page` and `page`, and every `id` is a string.
- A create the document keys (creating an article or a member address, redelivering a webhook) is sent a generated `Idempotency-Key` when the caller passes none, a new one per call; a key passed in `params.header` is sent as given, and a `fetch` that retries the `Request` it is given repeats its key.

### Added

- `billingEntry(client, query)` asks whether the app shows "Manage billing" here: `entry` is the platform's answer when the entry appears (its wording, the presentation to open it with, whether the store's own token is needed first, and the address), `null` when it does not, and a refusal is the problem document in `error`.
- `createClient`, an [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client typed from the OpenAPI document of one aio release, with every schema exported from the package root under its own name.
- A Sanctum personal access token sent as `Authorization: Bearer` on every request; a token that is empty or not a single run of visible ASCII is refused when the client is created, and `baseUrl` must be an absolute `http` or `https` URL.
- `package.json` records the aio release the client was generated from (`appsolutely.spec`: tag, commit and sha256 of the document).

### Security

- A path parameter that is empty, `.` or `..` is refused with a `TypeError` before anything is sent, since the URL would resolve to another route.

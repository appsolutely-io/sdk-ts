# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Generate the runtime idempotency registry with the client types, so a newly documented keyed operation builds and receives an `Idempotency-Key` without updating a separate list.

### Changed

- This release requires aio v0.32.0 or later. `POST /api/v1/fulfilments` returns `404` on aio 0.30 and 0.31.
- Generated from the released aio v0.32.0 document, including `subscription-change-refused` when resuming a member subscription.

- **BREAKING** — the install no longer answers an administrator on this API, so the client no longer describes the administrator's operations: `/api/v1/pages`, `/api/v1/articles`, `/api/v1/orders`, `/api/v1/form-entries`, `/api/v1/account-states`, the webhook subscription deliveries and their redelivery, and the administrator sync feeds (`/api/v1/sync/articles`, `pages`, `products`, `orders` and `form-entries`). Their schemas that nothing else answers (`ArticlePage`, `PagePage`, `FormEntryPage`, `AccountStateList`, `WebhookDelivery`, `WebhookDeliveryPage`, the feeds and the article payloads) are no longer exported. An administrator's work is done through the install's Administrator API (`/api/admin/v1`).
- **BREAKING** — `/api/v1/products` answers the site backend alone, with a token holding `catalogue:read`.
- `token` is described as what it now is: a signed-in member's access token, or the token the site backend's machine client is granted.

### Added

- `POST /api/v1/fulfilments`, the backend fulfilling a pending digital delivery with `fulfilments:write` (`FulfillDeliveryPayload`, answered as `Fulfilment`). It is keyed, so it is sent a generated `Idempotency-Key` when the caller passes none.

## [0.2.0] - 2026-10-16

The first release. It describes the API of aio v0.30.0 and needs an install at least that new.

### Changed

- The client is generated from aio v0.30.0's document. A member carries `terms` (`MemberTerms`: the site's `current` terms version, null when it asks for no acceptance, and whether the member has `accepted` it), and an account state's `totals` are integers by entitlement key. `ListedAccountState` is declared as `AccountState` with `entitlements_changed_at`, so it reads as that intersection.
- **BREAKING** — a member's subscription change (`POST /api/v1/me/subscriptions/{subscription}/changes`) requires `return_url`, as resuming one does: whether the member must confirm the change on the site is not known beforehand, so a body without it is a compile error.
- **BREAKING (for a caller branching on the status or the type)** — a magic-link exchange that still needs the member's second factor is refused `403` with `second-factor-required` rather than `401`, and one locked out after too many codes `429` with `rate-limited`, whose `Retry-After` says when to ask again.
- **BREAKING (for a caller passing a large `limit`)** — a sync pull whose `limit` is above the install's maximum is refused `422` with `validation-failed`; the install used to cut it to the maximum, which read like the end of the changes.
- aio v0.27.0's document declares every webhook payload under `webhooks`, so each event type (`ArticleCreatedEvent`, `OrderPaidEvent`, `SubscriptionRenewedEvent` and the rest, with `WebhookEnvelope`) is exported, along with `Refund`.
- Since aio v0.26.0's document, the client describes the catalogue a site's backend and its apps sell from: a product's `sku_prices` (every active sku's price per currency, with the renewal `interval` and `interval_count` of a subscription sku), the backend client's `store_currency`, an optional `sku` on each checkout line (member and backend), and `payment_url` on the `subscription-awaiting-payment` refusal of a checkout or a subscription change, where the member finishes paying the waiting order. A backend client holding `catalogue:read` may read products. No operation the document keys was added, so the operations sent a generated `Idempotency-Key` are unchanged.
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

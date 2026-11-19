# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Generate the complete Site API surface at aio commit `efbdc4df4`, including announcements, account deletion, member inbox and changes, message preferences, realtime transport metadata, order payment-method switching, backend member-message delivery and address reference data. The pin remains untagged (`tag: null`); package versions are unchanged.
- Opt-in conditional reads through documented `If-None-Match` headers. `GET` and `request('get', ...)` return a bodyless 304 with the original Response and neither data nor error; callers retain their saved representation and inspect the status.

### Compatibility

- The regenerated `Order` type requires `attempts`; order fixtures must provide it. The bundled order answers now include empty attempt lists. Order payment methods and current-payment references, address region/entry fields and the payment-method-switched event are typed from the adopted document.
- Newly documented required inputs remain mandatory in the public types: the inbox change cursor, read-all's string `through_sequence`, realtime polling's `after`, preference choices and the payment method when switching an order. The client supplies documented idempotency keys unless the caller passes one; no runtime retry, realtime connection or deletion-flow orchestration is added.
- Existing unconditional requests keep their behavior. A conditional 304 is no longer exposed as an empty error string by the underlying HTTP client. The Administrator API is still outside this package's scope, and bundled mock coverage remains partial.

## [0.1.0-next.0] - 2026-11-06

A pre-release, published under the `next` dist-tag. It describes the API document at aio commit `074e28bce` on aio's default branch, which no aio release contains yet. Use an install running that commit or a newer one.

### Added

- `createClient`, an [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client typed from the pinned OpenAPI 3.1 document, with every schema exported from the package root under its own name. A success's `data` is the resource itself, or `{ data, next_cursor }` for a list. A refusal resolves as the RFC 9457 problem document in `error`, with `type` typed to the problem URIs each operation documents.
- The operations a member's access token reaches (`/api/v1/me/...`: profile, addresses, entitlements, orders, subscriptions, checkout and portal sessions, store purchases, trials, referrals, push devices, organisations with their members, seats, roles, invitations, transfers, billing and dissolution), the backend client's operations (catalogue, entitlements, seats, roles, checkout, portal and store purchases, webhook endpoints and deliveries, return targets, test clocks), and the sign-in, discovery and OAuth endpoints.
- A bearer credential sent as `Authorization: Bearer`. A token that is not a single run of visible ASCII is refused when the client is created, and `baseUrl` must be an absolute `http` or `https` URL with no query or fragment.
- A generated `Idempotency-Key` on every create the document keys, one per call, unless the caller passes its own. A `fetch` that retries the `Request` it is given repeats its key.
- `billingEntry(client, query)` asks whether the app shows "Manage billing" here: `entry` is the platform's answer when the entry appears, `null` when it does not, and a refusal is the problem document in `error`.
- Mock mode, off by default: `createClient({ mock: true })` answers from bundled sample data (`aio.json`) and sends nothing over the network. `client.mock` reports it, creation logs one notice, and every answer carries the `x-appsolutely-mock: 1` header (`MOCK_HEADER`). A `baseUrl` passed alongside is ignored, and the notice says so. With mock mode off, a missing or unusable `baseUrl` is a `TypeError` that names the fix. `mock.operations` layers answers per operation, typed by what each operation documents, and `bundled: false` drops the bundled ones. `mockOperations` exports the bundled answers, frozen.
- `@asly/sdk`, an alias that re-exports this package unchanged at the same version, so every value is the same object under either name.
- `package.json` records the aio document the client was generated from (`appsolutely.spec`: tag, commit and sha256).

### Security

- A path parameter that is empty, `.` or `..` is refused with a `TypeError` before anything is sent, since the URL would resolve to another route.

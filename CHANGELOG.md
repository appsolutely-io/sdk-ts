# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The client is generated from aio v0.22.0's document: every parameter a public operation takes is now typed (the billing entry's query, account states, sync pulls, webhook delivery filters and paging), along with the site app backend's operations; `Idempotency-Key` is filled for its keyed creates (registering a webhook endpoint, starting a secret rotation, redelivering a delivery).
- **BREAKING** — the client follows the API's plain-HTTP wire format. A success's `data` is the resource itself, or `{ data, next_cursor }` for a list, in place of a `status`/`message`/`data` envelope; a `202` or `204` with no body resolves with `data` undefined. A refusal's `error` is the RFC 9457 problem document (`type`, `title`, `status`, `detail`, and extensions such as `errors`), with `type` typed to the problem URIs each operation documents, in place of `ApiError`. Lists page by `limit` and the opaque `cursor`, in place of `per_page` and `page`, and every `id` is a string.
- A create the document keys (creating an article or a member address, redelivering a webhook) is sent a generated `Idempotency-Key` when the caller passes none, a new one per call; a key passed in `params.header` is sent as given, and a `fetch` that retries the `Request` it is given repeats its key.

### Added

- `createClient`, an [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client typed from the OpenAPI document of one aio release, with every schema exported from the package root under its own name.
- A Sanctum personal access token sent as `Authorization: Bearer` on every request; a token that is empty or not a single run of visible ASCII is refused when the client is created, and `baseUrl` must be an absolute `http` or `https` URL.
- `package.json` records the aio release the client was generated from (`appsolutely.spec`: tag, commit and sha256 of the document).

### Security

- A path parameter that is empty, `.` or `..` is refused with a `TypeError` before anything is sent, since the URL would resolve to another route.

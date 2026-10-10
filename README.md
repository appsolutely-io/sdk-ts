# @appsolutely/sdk

A typed TypeScript client for the Appsolutely public API (`/api/v1`). Its types are generated from the OpenAPI 3.1 document an aio release ships, so every path, parameter, request body and response is checked at compile time.

The client addresses one install by its URL. It works the same against a self-hosted install and a hosted one.

## Install

```sh
npm i @appsolutely/sdk
```

Requires Node.js 20 or newer (or any runtime with `fetch`), and TypeScript 5.4 or newer for the types.

## Use

```ts
import { createClient, type Article } from '@appsolutely/sdk';

const client = createClient({
  baseUrl: 'https://example.com',
  token: process.env.APPSOLUTELY_TOKEN,
});

const { data, error } = await client.GET('/api/v1/articles', {
  params: { query: { limit: 20 } },
});
if (error) {
  throw new Error(`${error.type}: ${error.detail ?? error.title}`);
}
const articles: Article[] = data.data;
const next = data.next_cursor; // absent on the last page

const created = await client.POST('/api/v1/articles', {
  body: { title: 'Hello', content: '<p>First post</p>', status: 0 },
});
```

- `baseUrl` is the install's address, including any path it is served under. It must be an absolute `http` or `https` URL.
- `token` is a Sanctum personal access token issued by the install (`php artisan aio:api:token`), sent as `Authorization: Bearer` on every request. Leave it out for the routes that need none.
- `headers` adds headers to every request, in any form `new Headers()` accepts; an `Accept` header you set replaces the default, and `token` always sets `Authorization`. `fetch` replaces the fetch implementation.
- Each HTTP method is a client method (`GET`, `POST`, `PATCH`, `DELETE`, ...), typed by path. A success's `data` is the resource itself, or `{ data, next_cursor }` for a list; a `202` or `204` with no body resolves with `data` undefined. `response` is always the raw `Response`.
- A refusal does not throw: it resolves with `error` set to the RFC 9457 problem document (`type`, `title`, `status`, `detail`, and extensions such as `errors` on `validation-failed`) and `data` undefined. Branch on `error.type`, a URI under `https://appsolutely.io/problems/` typed to the ones each operation documents.
- A list is paged by `limit` (1 to 100) and `cursor`: send the previous page's `next_cursor` as `cursor` with the query otherwise unchanged; `next_cursor` is absent on the last page.
- A create the document keys (creating an article or a member address, redelivering a webhook) is sent a generated `Idempotency-Key`, a new one per call. To retry a create safely after a lost answer, pass your own in `params.header` and send the same one again; a `fetch` that retries the `Request` it is given repeats its key. On `409`, `429` or `503` the answer's `Retry-After` says when to send it again.
- A path parameter that is empty, `.` or `..` rejects with a `TypeError` before anything is sent, since the URL would resolve to another route.
- Every schema in the document is exported from the package root under its own name (`Article`, `ArticlePage`, `Page`, `Product`, `Order`, `FormEntry`, `Problem`, `ValidationProblem`, ...), alongside `paths`, `components` and `operations`.

The client is [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), whose documentation covers middleware, query and body serialisation, and the other request options.

## Which install it matches

`package.json` records the aio release the client was generated from:

```json
"appsolutely": {
  "spec": {
    "path": "docs/api/openapi.yaml",
    "tag": "v0.7.0",
    "commit": "…",
    "sha256": "…"
  }
}
```

An install running that aio release, or a newer one with the same API major version, serves everything this client describes: within a major version, fields are added and never removed or retyped. The package's own version follows its own semver; the aio tag, not the package version, names the release it matches.

## Develop

The scripts and tests are TypeScript run directly by Node, which needs Node.js 22.18 or newer.

```sh
pnpm install
pnpm verify
```

| Script                                       | What it does                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`                                | Everything below short of the contract test: formatting, the document, the generated types, the type checks, the tests and the consumer check.                                                                                                                           |
| `pnpm spec:pin --aio <checkout> --ref <tag>` | Copies `docs/api/openapi.yaml` from a local aio checkout at a release tag, or at a commit on aio's `master` (the checkout needs `origin/master`), into `spec/openapi.yaml` and records the pin in `package.json`.                                                        |
| `pnpm check:spec`                            | Validates the pinned document against the OpenAPI 3.1 schema and checks it is the one the pin records.                                                                                                                                                                   |
| `pnpm generate` / `pnpm check:generated`     | Writes `src/generated/schema.ts` from the pinned document with openapi-typescript, or fails when the committed file is not what it generates.                                                                                                                            |
| `pnpm typecheck`                             | Type-checks the sources, scripts and tests, including the compile-time assertions in `test/types.test.ts`.                                                                                                                                                               |
| `pnpm test`                                  | Unit tests.                                                                                                                                                                                                                                                              |
| `pnpm test:contract`                         | Checks a running install serves every operation the pinned document describes, then round-trips a read and a write. Set `APPSOLUTELY_CONTRACT_BASE_URL` and `APPSOLUTELY_CONTRACT_TOKEN` (abilities `articles:read` and `articles:write`); it creates one draft article. |
| `pnpm check:consumer`                        | Packs the package, installs it into a fresh project, type-checks a consumer under several TypeScript versions and module resolutions, and runs a request through the installed client.                                                                                   |
| `pnpm check:publishable`                     | Refuses a publish whose pin names no final aio release, whose document or generated types are stale, or whose built files carry vocabulary the client must not.                                                                                                          |

`src/generated/` is never edited by hand. To follow a new aio document, repin and regenerate.

## Release

Releases are cut by the **Release** workflow, run by hand from the repository's default branch after an aio release with that release's tag and the package version to publish; naming the tag already pinned ships a fix to the client alone. It refuses to run while the repository is private, since npm signs provenance only for a package published from a public repository, and it refuses a tag older than the pin or not containing the pinned commit, and a version npm already has or that does not move forward. It repoints the pin at exactly that tag, validates the document and regenerates, runs every check including the contract test, commits and tags the release on that branch, and then publishes the tarball it checked to npm with provenance, from a separate job that installs and runs no dependency. The contract test checks the install serves every operation the pinned document describes, so point it at an install running that aio release or a newer one. If publishing fails after the release was recorded, dispatching the workflow again with the same inputs publishes the recorded commit.

The **Watch aio releases** workflow runs daily and fails when aio has a release the pin is behind, naming the tag to release from: for a pin at a release, any newer release; for a pin at an untagged commit, a release that contains it.

The workflows need these repository secrets:

| Secret                          | Used for                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AIO_READ_TOKEN`                | Reading aio's tags and checking out its release (a token with read access to the aio repository). |
| `NPM_TOKEN`                     | Publishing `@appsolutely/sdk`.                                                                    |
| `APPSOLUTELY_CONTRACT_BASE_URL` | The address of an install running the aio release being published, or a newer one.                |
| `APPSOLUTELY_CONTRACT_TOKEN`    | A token on that install with `articles:read` and `articles:write`.                                |

And this repository variable:

| Variable         | Used for                                                        |
| ---------------- | --------------------------------------------------------------- |
| `AIO_REPOSITORY` | The aio repository the releases are read from, as `owner/name`. |

## Licence

MIT

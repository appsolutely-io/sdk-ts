# @appsolutely-io/sdk

A typed TypeScript client for the Appsolutely public API (`/api/v1`). Its types are generated from the OpenAPI 3.1 document an aio release ships, so every path, parameter, request body and response is checked at compile time.

The client addresses one install by its URL. It works the same against a self-hosted install and a hosted one.

## Install

```sh
npm i @appsolutely-io/sdk@next
```

The package is a pre-release, published under the `next` dist-tag. Requires Node.js 20.19 or newer on the 20 line, or 22.12 or newer (or any runtime with `fetch` and JSON module imports), and TypeScript 5.4 or newer for the types.

The same package is also published as [`@asly/sdk`](packages/asly-sdk), an alias that re-exports it unchanged at the same version. Install one or the other, not both.

## Use

```ts
import { createClient, type UserAddress } from '@appsolutely-io/sdk';

const client = createClient({
  baseUrl: 'https://example.com',
  token: memberAccessToken, // the access token the member's sign-in returned
});

const { data, error } = await client.GET('/api/v1/me/addresses', {
  params: { query: { limit: 20 } },
});
if (error) {
  throw new Error(`${error.type}: ${error.detail ?? error.title}`);
}
const addresses: UserAddress[] = data.data;
const next = data.next_cursor; // absent on the last page

const filed = await client.POST('/api/v1/me/addresses', {
  body: { name: 'Ada Lovelace', address: '1 Main St' },
});
```

- `baseUrl` is the install's address, including any path it is served under. It must be an absolute `http` or `https` URL. Leave the key out to run in [mock mode](#mock-mode).
- `token` is the bearer credential sent as `Authorization: Bearer` on every request: a signed-in member's access token for the member's own routes (`/api/v1/me/...`), or, for the site backend's routes, the token its machine client is granted by the client-credentials grant. Leave it out for the routes that need none. An administrator's work is not in this API: it is done through the install's Administrator API (`/api/admin/v1`), which this client does not describe.
- `headers` adds headers to every request, in any form `new Headers()` accepts; an `Accept` header you set replaces the default, and `token` always sets `Authorization`. `fetch` replaces the fetch implementation.
- Each HTTP method is a client method (`GET`, `POST`, `PATCH`, `DELETE`, ...), typed by path. A success's `data` is the resource itself, or `{ data, next_cursor }` for a list; a `202` or `204` with no body resolves with `data` undefined. `response` is always the raw `Response`.
- A refusal does not throw: it resolves with `error` set to the RFC 9457 problem document (`type`, `title`, `status`, `detail`, and extensions such as `errors` on `validation-failed`) and `data` undefined. Branch on `error.type`, a URI under `https://appsolutely.io/problems/` typed to the ones each operation documents.
- A list is paged by `limit` (1 to 100) and `cursor`: send the previous page's `next_cursor` as `cursor` with the query otherwise unchanged; `next_cursor` is absent on the last page.
- A create the document keys (filing a member address, fulfilling a digital delivery, redelivering a webhook) is sent a generated `Idempotency-Key`, a new one per call. To retry a create safely after a lost answer, pass your own in `params.header` and send the same one again; a `fetch` that retries the `Request` it is given repeats its key. On `409`, `429` or `503` the answer's `Retry-After` says when to send it again.
- A path parameter that is empty, `.` or `..` rejects with a `TypeError` before anything is sent, since the URL would resolve to another route.
- Every schema in the document is exported from the package root under its own name (`Product`, `ProductPage`, `Order`, `UserAddress`, `Fulfilment`, `Problem`, `ValidationProblem`, ...), alongside `paths`, `components` and `operations`.

The client is [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), whose documentation covers middleware, query and body serialisation, and the other request options.

## Mock mode

A client created without a `baseUrl` runs in mock mode: every request is answered from sample data bundled with the package (`dist/mock/aio.json`), and nothing is sent over the network. This lets an app run and render before it is connected to an install.

```ts
const client = createClient(); // no baseUrl: mock mode
client.mock; // true
const { data } = await client.GET('/api/v1/me'); // the sample member, member@example.test
```

- **It says so.** `client.mock` is `true`, and creating the client logs one `console.warn` notice.
- **What is bundled.** One sample member at `example.test`, its entitlements, subscription, orders, address and billing entry, the OAuth userinfo, the backend client info, a catalogue with two plans and a one-off product, and the backend's entitlement reads. Every answer matches the response schema the pinned API document declares. `mockOperations` exports them.
- **Matching.** Answers are keyed by `METHOD /path/{template}`, as the document names the operation (`GET /api/v1/products/{id}`). Any path parameter value matches, and the query is ignored; a literal segment wins over a parameter in the same place. An operation with no answer gets a `501` problem document in `error`.
- **Layering your own data.** `mock.operations` replaces the bundled answer for each operation it names and keeps the rest. Each `body` is typed as what that operation documents, a success or a problem document. Spread a bundled answer to change one field; the exported bundle is frozen. Set `bundled: false` to serve only your own answers. A status outside 200 to 599, or a body on a `204`, `205` or `304`, is refused when the client is created.

  ```ts
  import { createClient, mockOperations } from '@appsolutely-io/sdk';

  const client = createClient({
    mock: {
      operations: {
        'GET /api/v1/me': { status: 200, body: { ...mockOperations['GET /api/v1/me']?.body!, name: 'Grace' } },
        'GET /api/v1/me/orders': { status: 200, body: { data: [] } },
        'DELETE /api/v1/me/addresses/{id}': { status: 204 },
      },
    },
  });
  ```

- **Switching it off.** Pass a `baseUrl`. Mock mode is on by itself only when the `baseUrl` key is left out. A `baseUrl` key holding `undefined`, the usual shape of an unset setting, is a `TypeError`, and so is an empty one, so a missing setting in production never answers from sample data. To choose mock mode from a setting, say so: `createClient({ baseUrl: env.API_URL || undefined, mock: !env.API_URL })`. `mock: false` turns mock mode off and makes a missing `baseUrl` a `TypeError`. `mock: true`, or an object as above, turns it on even when a `baseUrl` is given.
- In mock mode the `fetch` option is not called.

## Answers worth checking

A store-purchase transaction answers a required `belongs_to_you` boolean. Check it to decide whether the answer credits the purchase to the caller: a `recorded` outcome with no subscription reference can also describe an unowned ended purchase. Store-purchase problems describe `outcome`, `belongs_to_you` and rejection `refusal` as optional extensions, since the same response status also serves other problem types. A recorded or definitively rejected transaction is final; an unclaimed transaction awaits restore, and an unavailable result can be retried after its cause is resolved.

OAuth token request types require `refresh_token` for the refresh grant, `code`, `redirect_uri` and `code_verifier` for the authorization-code grant, and `device_code` for the device grant. The server also rejects empty required values through the document's `minLength` rules. TypeScript string types do not enforce those runtime length rules.

## Which install it matches

`package.json` records the aio document the client was generated from:

```json
"appsolutely": {
  "spec": {
    "path": "docs/api/openapi.yaml",
    "tag": null,
    "commit": "074e28bced08374ca80c33d2882bdbfa8203c14f",
    "sha256": "029ec0513e035a1c056bffe50c9ad9b7b6b7b979f089094b1517aee0819cbb2b"
  }
}
```

This pre-release is a typed client for aio at commit `074e28bce` on its default branch, which no aio release contains yet (`tag` is null); it does not run or claim the aio SDK conformance suite. Use an install running that aio commit or a newer one. It exposes typed HTTP operations; retry scheduling, cursor recovery, sign-in sessions, credential storage and application flows remain the caller's responsibility. While aio is below 1.0.0, minor releases may remove operations or change their shapes, even when the API path stays at v1. Check the release's breaking changes before upgrading an install. The package's own version follows its own semver; the document pin names the contract it matches. A final version requires a pin at a final aio release; a pre-release may pin a commit on aio's default branch.

## Develop

The scripts and tests are TypeScript run directly by Node, which needs Node.js 22.18 or newer.

```sh
pnpm install
pnpm verify
```

| Script                                       | What it does                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                | Everything below short of the contract test: formatting, the document, the generated types, the type checks, the tests and the consumer check.                                                                                                                                         |
| `pnpm spec:pin --aio <checkout> --ref <tag>` | Copies `docs/api/openapi.yaml` from a local aio checkout at a release tag, or at a commit on aio's `master` (the checkout needs `origin/master`), into `spec/openapi.yaml` and records the pin in `package.json`.                                                                      |
| `pnpm check:spec`                            | Validates the pinned document against the OpenAPI 3.1 schema and checks it is the one the pin records.                                                                                                                                                                                 |
| `pnpm generate` / `pnpm check:generated`     | Writes the types and runtime keyed-operation registry in `src/generated/schema.ts` from the pinned document, or fails when the committed file is not what it generates.                                                                                                                |
| `pnpm typecheck`                             | Type-checks the sources, scripts and tests, including the compile-time assertions in `test/types.test.ts`.                                                                                                                                                                             |
| `pnpm test`                                  | Unit tests.                                                                                                                                                                                                                                                                            |
| `pnpm test:contract`                         | Checks a running install serves every operation the pinned document describes, then round-trips a read and a write. Set `APPSOLUTELY_CONTRACT_BASE_URL` and `APPSOLUTELY_CONTRACT_TOKEN` (a member's access token with `me:read` and `me:write`); it files one address and deletes it. |
| `pnpm check:consumer`                        | Packs the package, installs it into a fresh project, type-checks a consumer under several TypeScript versions and module resolutions, and runs a request through the installed client.                                                                                                 |
| `pnpm check:publishable`                     | Refuses a publish of a final version whose pin names no final aio release, and any publish whose document or generated types are stale, or whose built files carry vocabulary the client must not.                                                                                     |

`src/generated/` is never edited by hand. To follow a new aio document, repin and regenerate.

## Release

Final releases are cut by the **Release** workflow and published under the `latest` dist-tag. A pre-release such as `0.1.0-next.0` is published by hand from a checkout with `npm publish`, which `publishConfig` sends to the `next` dist-tag with public access; `prepublishOnly` builds and runs `pnpm check:publishable` first. The **Release** workflow is run by hand from the repository's default branch after an aio release with that release's tag and the package version to publish; naming the tag already pinned ships a fix to the client alone. It refuses to run while the repository is private, since npm signs provenance only for a package published from a public repository, and it refuses a tag older than the pin or not containing the pinned commit, and a version npm already has or that does not move forward. It repoints the pin at exactly that tag, validates the document and regenerates, runs every check including the contract test, commits and tags the release on that branch, and then publishes the tarball it checked to npm with provenance, from a separate job that installs and runs no dependency. The contract test checks the install serves every operation the pinned document describes, so point it at an install running that aio release or a newer one. If publishing fails after the release was recorded, dispatching the workflow again with the same inputs publishes the recorded commit.

The **Watch aio releases** workflow runs daily and fails when aio has a release the pin is behind, naming the tag to release from: for a pin at a release, any newer release; for a pin at an untagged commit, a release that contains it.

The workflows need these repository secrets:

| Secret                          | Used for                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AIO_READ_TOKEN`                | Reading aio's tags and checking out its release (a token with read access to the aio repository). |
| `NPM_TOKEN`                     | Publishing `@appsolutely-io/sdk`.                                                                 |
| `APPSOLUTELY_CONTRACT_BASE_URL` | The address of an install running the aio release being published, or a newer one.                |
| `APPSOLUTELY_CONTRACT_TOKEN`    | A member's access token on that install with `me:read` and `me:write`.                            |

And this repository variable:

| Variable         | Used for                                                        |
| ---------------- | --------------------------------------------------------------- |
| `AIO_REPOSITORY` | The aio repository the releases are read from, as `owner/name`. |

The alias in `packages/asly-sdk` is published after the main package, at the same version; the **Release** workflow publishes both. `pnpm set-version <version>` is the one way to change the version: it writes it into both manifests. Its manifest follows the main one: `pnpm test` and its `prepublishOnly` refuse a version, an exact dependency pin, export subpaths, licence, repository or publish settings that differ, and `pnpm check:consumer` installs both packages and checks the alias hands out the same objects.

## Design decisions

The [decision records](docs/decisions/README.md) explain the implementation choices and their tradeoffs.

## Licence

MIT

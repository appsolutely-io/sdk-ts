# Answer from bundled sample data only when asked

## Decision

Mock mode is off by default and is turned on only by the caller, with `mock: true` or a `mock` object. Its transport answers each request from `src/mock/aio.json` instead of the network, matched by method and path template. The mode is visible three ways: `client.mock`, one notice when the client is created, and the `x-appsolutely-mock: 1` header on every answer. A `baseUrl` passed with mock mode on is ignored, and the notice says so. With mock mode off, a missing or unusable `baseUrl` is a `TypeError` that names the fix. Callers can layer their own answers per operation, or turn the bundled data off.

## Rationale

An app has to render its signed-in screens, plans and entitlements before anyone has connected it to an install. Bundling one generic set means every app starts from answers that match the pinned document. The test suite validates each bundled body against the document's response schema, so the sample data cannot drift from the types.

Sample data served where real data was expected is worse than an error, so it never follows from a missing setting. An unset address arrives as a missing key, `undefined` or an empty string. Each of these is a configuration error that the app sees when it starts. The header lets an app label mocked screens even when the notice scrolls past, and it marks answers no matter which code path made the request.

## Alternatives and costs

Turning mock mode on when `baseUrl` is missing was rejected. It is one setting fewer, but an unset environment variable in production would serve sample data with only a console line to show for it. A separate mock server would need a process and a port, which an app's first run should not need. Mock data written in TypeScript would need no JSON import, but a JSON file can be read and copied by tools in any language. The JSON import loads without an experimental warning from Node.js 20.19 and 22.12. Answers are static: a path parameter or query does not change them, and nothing is stored between requests. That keeps the transport small, and a caller wanting a different answer layers it. Deep merging of layered bodies was rejected because it cannot remove a field or empty a list. Callers spread the exported bundled answer when they want to change one field.

## Current implementation

[src/mock.ts](../../src/mock.ts) defines the options, the merge and the transport. [src/client.ts](../../src/client.ts) decides the mode. [test/mock.test.ts](../../test/mock.test.ts) covers the mode switch, layering, matching and validation of the bundled bodies against the document.

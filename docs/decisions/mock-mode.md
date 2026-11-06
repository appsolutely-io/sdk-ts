# Answer from bundled sample data when no install is given

## Decision

A client created without a `baseUrl` runs in mock mode. Its transport answers each request from `src/mock/aio.json` instead of the network, matched by method and path template. `client.mock` reports the mode, and creating such a client logs one notice. Callers can layer their own answers per operation, or turn the bundled data off. `mock: false` makes a missing `baseUrl` an error.

## Rationale

An app has to render its signed-in screens, plans and entitlements before anyone has connected it to an install. Each app used to write its own stand-in for the same API shapes. Bundling one generic set means every app starts from answers that match the pinned document. The test suite validates each bundled body against the document's response schema, so the sample data cannot drift from the types.

Mock mode is easy to switch on by accident, so it is never silent, and it never follows from an unset setting alone. Only leaving the `baseUrl` key out turns it on by itself. A key holding `undefined` or an empty string is refused unless `mock` asks for mock mode, because that is how a missing environment variable arrives. The flag and the notice make the mode visible, and `mock: false` lets a production build refuse to start without an install.

## Alternatives and costs

A separate mock server would need a process and a port, which an app's first run should not need. Mock data written in TypeScript would need no JSON import, but a JSON file can be read and copied by tools in any language. The JSON import loads without an experimental warning from Node.js 20.19 and 22.12. Answers are static: a path parameter or query does not change them, and nothing is stored between requests. That keeps the transport small, and a caller wanting a different answer layers it. Deep merging of layered bodies was rejected because it cannot remove a field or empty a list. Callers spread the exported bundled answer when they want to change one field.

## Current implementation

[src/mock.ts](../../src/mock.ts) defines the options, the merge and the transport. [src/client.ts](../../src/client.ts) decides the mode. [test/mock.test.ts](../../test/mock.test.ts) covers the mode switch, layering, matching and validation of the bundled bodies against the document.

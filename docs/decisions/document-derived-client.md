# Derive the client contract and keyed operation inventory from the document

## Decision

Generate path and schema types from the pinned OpenAPI document and use openapi-fetch for requests. Adapt only the idempotency header's optionality in the public client types, and generate the runtime keyed-operation inventory from that same document.

## Rationale

A generated contract makes documented parameters, bodies and answers available to TypeScript without a second handwritten schema set. The SDK supplies a key where the document requires one, so callers may omit that header; other required parameters retain their generated constraints. The generated runtime list and a document-derived `KeyedOperation` union must agree so a new keyed operation receives its middleware without a separate list edit.

## Alternatives and costs

Making all parameters optional would discard useful contract checks. Maintaining an untyped runtime list would permit drift after regeneration. Reimplementing the HTTP client would duplicate request serialization already provided by openapi-fetch. The generator resolves effective required headers, including referenced and inherited parameters, and emits a stable registry alongside the types. Generated types provide compile-time checks, not runtime validation of arbitrary server JSON or string lengths.

The middleware places a generated key on the actual Request, so a fetch implementation repeating that Request repeats its key. Generating another key on each transport retry would lose that protection. Separate client calls intentionally get distinct keys unless the caller supplies one. The SDK itself does not schedule retries.

## Current implementation

[src/client.ts](../../src/client.ts) defines `WithOptionalKey`, `ClientPaths`, `KeyedOperation`, `KEYED_OPERATIONS` and the request middleware. [scripts/lib/generate.ts](../../scripts/lib/generate.ts) generates schema types and the keyed-operation registry from the pin. [test/types.test.ts](../../test/types.test.ts) checks the public types, [test/spec.test.ts](../../test/spec.test.ts) guards generation and new keyed operations, and [test/client.test.ts](../../test/client.test.ts) exercises requests. The [use guide](../../README.md#use) covers error documents, paging, caller-supplied keys and path validation; the [development guide](../../README.md#develop) covers generation and packed consumers.

# Keep the typed HTTP client distinct from SDK conformance

## Decision

Release the typed HTTP client against aio v0.39.0 without running or claiming the aio SDK conformance suite. Runtime client policies require separate design and implementation, one domain at a time.

## Rationale

The client exposes generated request and response types, bearer headers, path validation and generated idempotency keys. It returns typed HTTP responses for the caller to interpret. It has no retry scheduler, cursor-recovery loop, OAuth session or credential storage, device sign-in, navigation decisions, sync orchestration or webhook receiver.

The aio contract requires those behaviors in its declared domains. Its journeys must drive actual SDK behavior. An adapter that implements a missing policy itself would test the adapter instead of the released client. Empty domain declarations are invalid, and failed mandatory journeys cannot be waived.

## Alternatives and costs

Adding runtime policies would introduce scheduling, state ownership and application integration choices beyond the current HTTP interface. Those choices need a capability design and tests before a domain can be declared. The current release leaves orchestration with consumers and makes that boundary explicit in the [compatibility statement](../../README.md#which-install-it-matches).

A generated operation or annotation proves the wire contract is available to the client; it does not prove that the client follows every behavioral rule. A passing run only establishes the coverage it exercised: aio reports `conformant`, `verdict` and per-rule `coverage` separately. A future integration must pin the suite and document to the same tag and supply the required independent transport, storage and runner evidence before making a support claim.

## Current implementation

[package.json](../../package.json) pins the released API document. [scripts/lib/generate.ts](../../scripts/lib/generate.ts) and [src/client.ts](../../src/client.ts) supply the types and HTTP client. No conformance declaration, report, evidence artifact, pinned suite or adapter is shipped by this release.

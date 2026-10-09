# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `createClient`, an [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client typed from the OpenAPI document of one aio release, with every schema exported from the package root under its own name.
- A Sanctum personal access token sent as `Authorization: Bearer` on every request; a token that is empty or not a single run of visible ASCII is refused when the client is created, and `baseUrl` must be an absolute `http` or `https` URL.
- `package.json` records the aio release the client was generated from (`appsolutely.spec`: tag, commit and sha256 of the document).

### Security

- A path parameter that is empty, `.` or `..` is refused with a `TypeError` before anything is sent, since the URL would resolve to another route.

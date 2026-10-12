# SDK changes

## 0.1.0

Initial portable developer kit for Android host 0.0.16 and bridge V1: public runtime
helpers/types, complete capability/manifest documentation, developer-owned backend
and optional shared-AppView examples, browser fixtures and local validation.
The reference bridge is synchronized from the host's canonical source. This kit
is distributed through npm and a portable GitHub release.

## Public developer preview

- Package metadata, AGPL-3.0-only license, typed mock-host export and standalone
  manifest-validation CLI for `@tabschat/miniapp-sdk`.
- Public docs generated from the kit's Markdown, example downloads and manual
  app-submission intake through GitHub issues.
- Standalone verification and reviewed npm publication workflows, with a
  documented trusted-publisher setup for future releases.

## 2026-10-03 — host 0.0.51 capabilities

- Add `identity.authenticate`, `host.auth.getAssertion`, portable sign-in and server
  verification helpers, and a complete developer-owned login/upload example.
- Add `files.select` and `selectFiles`, using standard HTML File APIs backed by
  Android's permission-checked document picker.
- Document app-owned sessions/media services, issuer configuration, temporary file
  limits and the remaining ATProto delegation needed for third-party media.

## 2026-10-03 — host 0.0.52 protocol media

- Add `blobs.upload` for browser Blobs and standard ATProto references, with scoped single-use HTTPS permits.
- Support strict JSON blob references and signed repository media indexing.
- Document quotas, revocation, own-backend uploads and remaining service-auth delegation.

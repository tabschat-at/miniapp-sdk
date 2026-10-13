# SDK changes

## 0.2.0

- Add the production-safe `@tabschat/miniapp-sdk/bootstrap` browser-host entrypoint, preserving native Tabs and standalone browsing.
- Offer optional passkey sign-in with a real Tabs account in the hosted simulator; simulated users remain the default.
- Use approved server policy, genuine app-scoped assertions and validated record operations in live mode, with a persistent real-data notice. Native payments, wallet signing, chat opening and blob uploads remain native-only.
- Update setup instructions and the AI prompt for browser bootstrap and live testing.

## 2026-10-11 — developer tools and URL submission

- Host the simulator and app-package builder on the developer site; provide the
  current source kit for localhost/offline testing.
- Discover manifests and Lexicons from HTML head links, show validation and
  permission review, and submit package snapshots through the developer site.
- Add an operator App review queue with atomic approval/publication and rejection.
- Update quickstart, publishing instructions and the AI coding-agent prompt.
- Match the developer tools to the docs, start new workspaces with the inspector
  closed, and introduce the simulated user and Add app button in a one-time tour.
- Hide the playground's proposed share and message previews.

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

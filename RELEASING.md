# Releasing the Tabs mini-app SDK

This repository contains the public SDK, examples and developer docs only. The
Tabs application source and its history are maintained separately.

## First npm publication

From a verified SDK checkout with Node 24.x:

```sh
npm ci
npm run check
npm run typecheck
npm run docs:build
npm pack --dry-run
npm login --registry=https://registry.npmjs.org/
npm publish --access public
```

The publishing account must have write access to the `tabschat` npm organization.
Complete npm browser authentication and any two-factor challenge yourself. Do not
put credentials in this repository or an issue.

After the first publication, configure an npm trusted publisher in the package's
settings with GitHub owner `tabschat-at`, repository `miniapp-sdk`, workflow
`publish.yml`, and environment `npm`. Allow direct publishing. Then run the
**Publish SDK** workflow for subsequent reviewed versions. It uses GitHub OIDC
and provenance rather than a stored npm publishing token.

## Subsequent releases

Update package.json's version and CHANGELOG.md, verify compatibility with the
supported Android host, run all checks above and inspect the packed files. The
browser runtime has no production dependencies; server auth remains a separate
export. Release the matching tag and portable source archive on GitHub. A failed
publish must not be reported as an npm release.

## Documentation

`npm run docs:build` generates a portable static site in `dist/` from the Markdown
in this repository. The Verify SDK workflow attaches it as an artifact. The site
can be served by any static HTTPS host. Publish that artifact when changing docs,
and keep the SDK version and availability information current.

The docs and developer tools are served at https://developers.tabschat.com.
Publish the generated site through the existing private deployment process.
Host configuration and credentials do not belong in the public npm package.
Keep versioned browser bootstrap URLs available when shipping future versions.

The URL submission tool is the current review intake. Listings require operator
review, publisher verification and user consent; submission is not publication.

# EPP Mini Program

Native read-only star-map client and explicit website-login confirmation. MIT licensed. Requires a compatible EPP API for online functions. Never put AppSecret or real credentials in this repository.

The contracts dependency is pinned to @szepp/contracts@0.1.0-rc.2 from the public npm registry. pnpm-lock.yaml records its exact version and integrity. The package includes compiled JavaScript and declarations; installation needs no Git package build, sibling checkout or npm login.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
cp config.example.js config.js
```

Import this directory into WeChat Devtools. The default project uses touristappid; select your own authorized AppID locally. config.js and project.private.config.json are ignored. Local Fake API access requires your own isolated EPP environment and local-only domain-check configuration; the shipped project keeps domain checking enabled. Fake QR codes cannot open the mini-program in mobile WeChat.

The contracts package is pinned; do not edit the generated contracts/ directory. Build and offline tests do not require a private EPP checkout or API account. UI and contract changes must preserve the two-tab navigation, explicit confirmation/cancellation and restricted credentials.

The Vite build uses Rolldown options to produce one CommonJS bundle. CI rejects build deprecation warnings as well as build failures.

This repository is the mini-program source of truth. Make changes and review PRs here; the private EPP repository does not copy sources into it. Upgrade the contracts dependency and lockfile together, keeping its exact npm version aligned with EPP Shared. For cross-repository wire tests in EPP, set EPP_MINI_PROGRAM_ROOT to this checkout and EPP_MINI_PROGRAM_WIRE=1.

# EPP Mini Program

Native read-only star-map client and explicit website-login confirmation. MIT licensed. Requires a compatible EPP API for online functions. Never put AppSecret or real credentials in this repository.

Registry installation and CI are pending publication of @epp/contracts@0.1.0-rc.2 and generation of the registry lockfile. The commands below apply after that release setup is complete.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
cp config.example.js config.js
```

Import this directory into WeChat Devtools. The default project uses touristappid; select your own authorized AppID locally. config.js and project.private.config.json are ignored. Local Fake API access requires your own isolated EPP environment and local-only domain-check configuration; the shipped project keeps domain checking enabled. Fake QR codes cannot open the mini-program in mobile WeChat.

The contracts package is pinned; do not edit the generated contracts/ directory. Build and offline tests do not require a private EPP checkout or API account. UI and contract changes must preserve the two-tab navigation, explicit confirmation/cancellation and restricted credentials.

This is a source migration candidate. @epp/contracts@0.1.0-rc.2 has not been published; independent installation from the public registry will be enabled after its release. Local verification installs the reviewed tarball in a separate clean checkout and records its exact dependency override there, not in this candidate manifest.

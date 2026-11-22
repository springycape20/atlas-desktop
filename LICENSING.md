# ATLAS licensing scope

## 15 November 2026 sandbox release decision

Update — 16 November 2026: all Colab execution in the official sandbox preview requires verified Pro; Assistant remains Free after sign-in. This updates the distribution's feature split without revoking MIT permissions in previously distributed or current MIT-licensed code. Prices and sandbox-only payments remain unchanged.

The owner now requests Free/Pro action gates in the official sandbox preview and private source hosting with public installer downloads. The official preview requires verified Pro access for advanced multi-milestone Colab, parallel task batches and workflow benchmarks. Basic work and saved-data access remain available. This is a distribution/business-policy change, not a withdrawal of MIT permissions or a claim that existing MIT code has become exclusive. The root MIT notice and third-party notices remain; recipients may exercise their existing licence rights. No live sales or proprietary terms are introduced. The earlier preparation description below records the previous stage and is superseded by this decision for the sandbox preview.

ATLAS is beginning an open-core transition: the existing application remains an MIT-licensed core, and separately developed future Pro additions may use proprietary terms. No Pro software, subscription requirement or paid entitlement is introduced by this preparation.

## Existing core and releases

The root `LICENSE` continues to cover the existing ATLAS core, including the pending usability improvements and disconnected account screens. All current features remain usable in this core build. The plan preview proposes paid access to advanced workflows in a future official edition; that business proposal does not withdraw existing MIT grants or make their source exclusive. Third-party components retain their own licences and notices.

`legal/mit-core-baseline.json` records the source files present when this transition began, their normalized-text hashes, the current Git commit and the fact that uncommitted core work was included. It is evidence of the boundary, not a claim of sole ownership of every component and not a freeze on future MIT core improvements. Earlier MIT grants remain intact; a future Pro licence does not retroactively restrict those copies.

## Future Pro additions

`proprietary/` contains only transition notices. It contains no Pro implementation. Do not move existing MIT code there and present it as newly exclusive. Any independently developed Pro implementation needs its own explicit scope, provenance and reviewed terms before distribution. Reused MIT-covered material must retain its required notices and remains subject to its original permissions.

Keep future private implementation in a separate private repository. `private-pro/` is ignored as a local staging precaution; it is not secure storage and is not a replacement for a separate repository. The current core installer excludes both directories, and the packaging guard rejects executable material added to the public placeholder directory.

The current package metadata remains `MIT` because the shipped application is still the MIT core. A future mixed distribution must accurately identify its component licences and ship both its proprietary terms and the applicable third-party notices. Minification does not alter these permissions.

## Commercial launch

`legal/commercial-transition.json` records preparation status and unresolved launch requirements. It is not an EULA, provider approval or legal certification. Commercial provider access, component ownership, native-runtime obligations, customer terms and billing/entitlement behaviour require their own implementation and evidence. See [the transition plan](docs/COMMERCIAL-TRANSITION.md).

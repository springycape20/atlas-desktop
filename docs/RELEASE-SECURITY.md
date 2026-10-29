# Release security and licensing checks

For 0.8.3 the owner authorized removing bundled Kokoro and releasing an unsigned patch after SignPath denied the application. The owner explicitly approved replacing mandatory signing/lawyer-approval gate conditions with a documented technical review. This is not legal certification. See [patch review](PATCH-RELEASE-REVIEW.md).

1. Review the production dependency lock, generate notices and inventory, and inspect the exact package. The release policy rejects removed Kokoro/eSpeak/ONNX/sharp dependencies and new GPL/LGPL entries pending renewed review. Historical licence/source questions must be resolved before reintroducing those components.
2. Record a completed technical review and the exact dependency-lock SHA-256 in `legal/release-review.json` only after verification. `package-lock.json` must use the LF bytes enforced by `.gitattributes` before hashing; verify the record against a fresh Git checkout. The ordinary unit suite checks the actual review/lock pair before tagging. Do not record a lawyer's approval unless one actually exists.
3. Run unit, formatting and Electron fixture checks. Verify packaged version, binary fuses, ASAR integrity, private-path exclusions, pinned Whisper resource hashes, notices and updater hashes. No real provider accounts are needed for these checks.
4. Clearly disclose unsigned releases. When signing becomes available, require the actual publisher, valid app/installer signatures and an isolated update-transition test. Checksums alone do not authenticate a publisher.
5. Confirm private vulnerability reporting and current dependency advisories. Triage future reports and keep software maintained; do not request raw private logs in public issues.
6. Reassess Australian and other applicable requirements when the product or distribution changes. Qualified legal review remains useful for fact-specific questions and historical releases; tests cannot guarantee compliance or immunity from claims.

Publish only with owner authorization, passing CI and verified final artifacts. Retain the exact release hashes and review evidence.

The current 0.10.0 dependency and feature review is [RELEASE-0.10.0-REVIEW.md](RELEASE-0.10.0-REVIEW.md). Native terminal and PDF dependencies require their included notices. Public distribution remains unsigned under the recorded owner decision.

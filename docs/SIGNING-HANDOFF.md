# SignPath approval handoff

Status corrected 28 October 2026: the maintainer reports that SignPath denied the application because ATLAS has no active users. No approval is pending. The GitHub repository currently has no Actions variables or secrets. The proposed local workflow has not been pushed. No signing account or certificate has been activated by this work. These instructions apply only if signing is approved in future.

## Ready in the repository

The release workflow has pinned SignPath actions, separate app and installer artifact configurations under `docs/signpath/`, manual signing approval, signed-installer updater metadata regeneration and signature verification. The owner authorized unsigned 0.8.3 publication after a technical dependency review. When signing is enabled, public tags additionally require the actual publisher. Existing unsigned review builds do not establish successful signing.

## After approval

1. Use the approved SignPath account and enable MFA. Confirm the actual project roles and the public code signing policy against [Foundation conditions](https://signpath.org/terms). Account creation and agreement to service terms must be performed by the maintainer; [SignPath terms](https://signpath.io/terms-of-service) require human account registration.
2. Configure project `atlas-desktop`, trusted GitHub build integration, artifact configurations `app-exe` and `installer`, and signing policy `release-signing` requiring manual approval. If SignPath supplies different slugs, use those and set the matching GitHub variables.
3. Add Actions secret `SIGNPATH_API_TOKEN` and variable `SIGNPATH_ORGANIZATION_ID` from the approved account. Optional variables: `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG`. Never commit or share the token in chat. See [GitHub Actions settings](https://github.com/springycape20/atlas-desktop/settings/secrets/actions).
4. Resolve the dependency review before submitting artifacts for signing. Obtain SignPath's assessment of the actual Electron application and bundled upstream executables; do not assume that an application approval clears every artifact or third-party licence.
5. After the owner authorizes pushing the reviewed workflow, run a manual draft build. Approve each signing request in SignPath. Inspect both executable signatures and record the actual certificate publisher, certificate details and SHA-256 artifact hashes. A failed or incomplete request is not an approved signature.
6. Set `SIGNPATH_UPDATER_PUBLISHER` to the exact verified publisher name. Build another draft so that the packaged updater configuration contains it. Confirm valid signatures and test the previous unsigned version's update into this draft in an isolated installation, plus rejection of wrong-publisher/tampered updates.
7. Complete the final-installer technical review in `legal/release-review.json` using actual verification evidence. Publish only after explicit owner authorization and passing the public-release gate.

## Information to bring back after approval

The non-secret organization ID, actual project/policy slugs, confirmation that the token is stored as a GitHub Actions secret, and any artifact restrictions SignPath provides are enough to continue configuration. Do not supply passwords, MFA codes, private keys or API tokens in chat.

Approval, the initial signing requests, the actual-certificate update test and the dependency legal review remain outstanding. This document prepares those steps; it does not declare them complete.

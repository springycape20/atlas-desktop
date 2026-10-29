> Current decision: the owner authorized unsigned releases beginning with 0.8.3 after SignPath denial, with dependency removal and a documented technical review. Signing instructions below describe a future option. See [release checks](RELEASE-SECURITY.md).

# Code signing with SignPath

ATLAS's Windows releases are set up to be signed through the [SignPath Foundation](https://signpath.org) free program for open-source projects. The release workflow already contains the signing steps. They stay off until the GitHub settings in step 4 exist. Unsigned public releases require the recorded owner decision and a matching technical dependency review. If signing is enabled, publisher pinning and valid signatures are required.

## 1. Before applying

- Turn on two-factor authentication for your GitHub account. SignPath requires it for everyone on the project.
- The repository needs an OSI-approved license ([MIT](../LICENSE)) and a public code signing policy ([README](../README.md#code-signing-policy)). Both are in place.

## 2. Apply

Apply at [signpath.org/apply](https://signpath.org/apply) with:

- **Repository:** https://github.com/springycape20/atlas-desktop
- **Download page:** https://github.com/springycape20/atlas-desktop/releases
- **What it is:** a Windows desktop assistant for Codex and Claude Code, built by GitHub Actions from this public repository.

The maintainer confirmed on 28 October 2026 that SignPath denied the application because the project has no active users. There is no pending approval or active certificate. The setup below is a future option if an application is accepted; no approval date is assumed.

## 3. Set up the SignPath project

After approval, in SignPath:

1. Create a project with the slug **`atlas-desktop`**, linked to this repository.
2. Add GitHub as a trusted build system for the project.
3. Add two artifact configurations, pasting in the files from [`docs/signpath`](signpath):
   - slug **`app-exe`** from [`app-exe.xml`](signpath/app-exe.xml), which signs `ATLAS.exe`.
   - slug **`installer`** from [`installer.xml`](signpath/installer.xml), which signs the installer.
4. Create a signing policy with the slug **`release-signing`** that uses the release certificate and requires manual approval.
5. Create an API token for a user who can submit signing requests to that policy.

If you choose different slugs, set the repository variables `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_POLICY_SLUG` to match.

## 4. Turn signing on in GitHub

In the repository, open **Settings → Secrets and variables → Actions** and add:

| Kind | Name | Value |
|---|---|---|
| Secret | `SIGNPATH_API_TOKEN` | the SignPath API token |
| Variable | `SIGNPATH_ORGANIZATION_ID` | your SignPath organization ID |

Keep the token in GitHub's secret store; do not paste it into a chat, tracked file or repository variable. See [post-approval handoff](SIGNING-HANDOFF.md) for the first signed draft and publisher verification.

First run the workflow manually to produce a **draft**, once the dependency review permits signing. The workflow:

1. Packages the app.
2. Sends `ATLAS.exe` to SignPath, and **waits up to an hour for you to approve** the signing request.
3. Builds the installer from the signed app.
4. Sends the installer for signing, again with your approval.
5. Rebuilds the updater files (`latest.yml` and the blockmap) for the signed installer, because signing changes the file.
6. Checks that both files carry a valid SignPath Foundation signature before publishing.

To approve a signing request, open it from the link in the workflow log or in SignPath.

## 5. Before the first public signed release: lock updates to the verified publisher

The release log prints the certificate's signer, for example `Verified signature on ATLAS-Setup-….exe: CN=SignPath Foundation, …`. Add the repository variable `SIGNPATH_UPDATER_PUBLISHER` with **exactly the CN value** (for example `SignPath Foundation`).

Rebuild a second draft with this variable configured. Inspect its packaged updater configuration and test updating an isolated installation from the previous unsigned version. When signing is enabled, public tags require the verified publisher; the first signed draft resolves this bootstrap step without publishing an unpinned signed release.

- **Set it only after a signed draft has confirmed the exact name.** If it doesn't match the real certificate, every user's updates fail.
- **All later releases must be signed.** The release check already enforces this while signing is on.

## Notes

- With the free program, Windows shows the publisher as **SignPath Foundation**.
- Signing establishes a verifiable publisher signature. It does not guarantee acceptance by Windows reputation or application-control systems.
- To check a signature on your PC, run this in PowerShell:

  ```powershell
  Get-AuthenticodeSignature 'C:\path\to\ATLAS-Setup-x.y.z.exe'
  ```

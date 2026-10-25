# Code signing with SignPath

ATLAS's Windows releases are set up to be signed through the [SignPath Foundation](https://signpath.org) free program for open-source projects. The release workflow already contains the signing steps. They stay off until the GitHub settings in step 4 exist, so releases keep working unsigned until then.

## 1. Before applying

- Turn on two-factor authentication for your GitHub account. SignPath requires it for everyone on the project.
- The repository needs an OSI-approved license ([MIT](../LICENSE)) and a public code signing policy ([README](../README.md#code-signing-policy)). Both are in place.

## 2. Apply

Apply at [signpath.org/apply](https://signpath.org/apply) with:

- **Repository:** https://github.com/springycape20/atlas-desktop
- **Download page:** https://github.com/springycape20/atlas-desktop/releases
- **What it is:** a Windows desktop assistant for Codex and Claude Code, built by GitHub Actions from this public repository.

Approval reportedly takes about 1–2 weeks.

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

From the next tagged release on, the workflow:

1. Packages the app.
2. Sends `ATLAS.exe` to SignPath, and **waits up to an hour for you to approve** the signing request.
3. Builds the installer from the signed app.
4. Sends the installer for signing, again with your approval.
5. Rebuilds the updater files (`latest.yml` and the blockmap) for the signed installer, because signing changes the file.
6. Checks that both files carry a valid SignPath Foundation signature before publishing.

To approve a signing request, open it from the link in the workflow log or in SignPath.

## 5. After the first signed release: lock updates to signed builds

The release log prints the certificate's signer, for example `Verified signature on ATLAS-Setup-….exe: CN=SignPath Foundation, …`. Add the repository variable `SIGNPATH_UPDATER_PUBLISHER` with **exactly the CN value** (for example `SignPath Foundation`).

From the following release on, installed copies only accept updates signed by that publisher.

- **Set it only after a signed release has confirmed the exact name.** If it doesn't match the real certificate, every user's updates fail.
- **All later releases must be signed.** The release check already enforces this while signing is on.

## Notes

- With the free program, Windows shows the publisher as **SignPath Foundation**.
- Signing lets ATLAS pass Smart App Control. SmartScreen reputation still builds up per release as people download it, so some early downloads may still see a warning.
- To check a signature on your PC, run this in PowerShell:

  ```powershell
  Get-AuthenticodeSignature 'C:\path\to\ATLAS-Setup-x.y.z.exe'
  ```

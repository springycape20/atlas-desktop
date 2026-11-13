ATLAS 0.11.2 adds an optional, local Markdown notes source, including Obsidian vaults.

- **Choose your notes:** open Library → Markdown vault, select a dedicated local folder and enable the source. No Obsidian installation, plugin, server or new dependency is required.
- **Review before sending:** opt in separately in each Chat or Colab chat's Context panel and refresh the preview. Only bounded, relevant Markdown excerpts are included when you send the prompt. Changed excerpts require a fresh preview.
- **Read-only and separate:** ATLAS never modifies vault files, follows note links or treats note text/frontmatter as permission. Vault discovery does not change project maps, project memory or provider filesystem permissions.
- **Visible limits:** scans cap directory entries, note count, note size, bytes read, depth and excerpt size. Private/hidden paths, denied paths and symlinks are excluded; incomplete scans are disclosed.
- **Disable or remove:** stop future scans/inclusion without deleting notes. Source changes block subsequent provider calls in tasks using the previous source. Calls already in progress may finish; previously shared context cannot be erased.

The source defaults off. Existing unconfigured/disabled context behavior is preserved. Notes are scanned locally without a retained note cache; sending selected context shares it with your chosen providers under their existing policies. See the repository's project tools and privacy documentation for setup and limits.

No dependency versions changed and no publisher telemetry was added. The production audit has two moderate transitive-package findings; their affected routing, rendering and upgrade configurations are not used by ATLAS's authenticated loopback MCP endpoint. The release review records the assessment and limitations.

**Updating:** use Settings → App updates or install the download over your current version. Users on 0.10.2 or older must download the installer because those versions' in-app installation fails. Windows x64; close older ATLAS instances before installing. Retain a pre-update backup: earlier versions do not understand the history storage introduced in 0.11.1.

The installer remains unsigned under the existing owner-authorized policy; Windows may show a warning. No legal or security certification is claimed.

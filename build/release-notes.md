ATLAS 0.12.1 fixes unreadable errors while preparing an app update.

- Browser-history backup failures now retain their error message instead of showing `[object Object]`.
- If recovery preparation or installer startup fails, the downloaded update remains ready for an explicit retry. ATLAS still requires recovery approval and waits for running work to stop.
- CI and release checks now exercise real Electron backup serialization, recovery failure and retry, including the backup worker and recovery copy.

If an older installed version remains blocked during recovery, download the installer from this release and open it directly. This patch does not claim to repair damaged history records or bypass failed backups.

Windows distribution remains unsigned under the repository owner's existing policy. Checksums verify file consistency; they do not authenticate a publisher. Dependencies and existing privacy, preview and tool-permission boundaries are unchanged.

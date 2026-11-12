# Background backups and saved visual references (0.11.0)

## Backups

**Backups and recovery** now creates archives in a worker, including automatic copies, manual exports and the local-record archive used by update recovery. Collection and compression run off the main process. A progress line shows the phase, file count and source bytes read; it does not invent a completion percentage. Preparing the browser-state snapshot still runs through the app's existing save flow.

Choose **Back up now** for an immediate automatic-folder copy, or **Cancel current backup** to stop collection/compression. Only one archive can be built at a time. Cancellation preserves previous copies and manual exports are written only after archive creation succeeds. A five-minute worker limit prevents indefinite work. Per-file changes detected during collection stop the attempt so it can be retried. A backup is not a transaction across every application record, and it excludes external worktrees/provider-owned histories as before.

**Choose automatic backup location** opens a directory picker. ATLAS creates an owned `ATLAS automatic backups` subfolder there; it refuses to adopt a populated unowned folder, a different data folder's destination, or a linked/changed destination. Only matching automatic-backup files in the selected owned folder are pruned. **Use default backup location** switches future copies back to ATLAS data. Changing locations preserves copies in previous locations. The existing daily schedule and newest-seven retention remain; Back up now can run even when daily backups are disabled.

Archives remain compressed, not encrypted. External copies survive local-data reset; default copies inside ATLAS data do not. Disconnecting an external drive produces a visible destination error so you can choose another folder. Backup location and owner metadata are local. No upload or publisher service is added.

## Saved visual baselines

In **Live preview > Visual review**, capture an image, expand **Saved visual baselines**, enter a name and choose **Save current baseline**. Later, open the same project's preview URL, choose a saved image and load it before comparing. Saved references persist across preview/app restarts. Use Delete selected baseline to remove one.

Baselines are scoped to the canonical project folder and the exact page URL; comparison still requires matching image dimensions. Changes to local server ports or query parameters require opening the recorded URL or capturing a new baseline. The current unsaved baseline remains session-only. No interaction, network request or model call starts just because an image is saved.

Up to 20 saved images / 16 MiB of raw image data are retained, with 8 MiB per image. They live in `visual-baselines.json` with names, URLs, dimensions and integrity hashes. They are included in local-record backups and removed by local-data reset. Screenshots and URLs may contain private project information; review any backup or exported material you share. Integrity checking detects changed bytes, not whether the reference is visually correct. Pixel differences retain their existing dynamic-content/font/animation limitations; ignored regions are not implemented yet.

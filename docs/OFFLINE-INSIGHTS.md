# ATLAS Insights: optional offline statistics

This feature is in source after 0.9.1 and is not part of the published 0.9.1 installer. There is no reporting server, automatic upload, tracking identifier, background collector or new analytics dependency.

## For an ATLAS user

Open **Settings → Optional statistics report**. Choose a reporting month, acknowledge the optional notice, and choose **Preview optional report**. Review the exact JSON, acknowledge the review, then save it locally. Saving does not send anything. No report is created merely by opening ATLAS or this settings page. Each preview has a five-minute export window; closing Settings or discarding the preview invalidates it.

The report includes a report-specific random receipt, UTC calendar month, app release family (for example, `0.9`), and rounded counts from retained finished tasks. Outcomes are completed/failed/cancelled. Feature counters describe Colab, isolated workspaces, completion checks and environment setup used by those tasks. No separate feature-event history is recorded. Counts are rounded to the nearest five; feature counts are capped to rounded task totals. Small counts can disappear or round upward. These are approximate samples, not all activity in the month. ATLAS normally retains only a bounded set of finished task records, so older or deleted work is missing.

The schema contains no chats, prompts, replies, files, paths, project names, commands, raw errors, provider names, account details, credentials, IP addresses, location, device fingerprint, precise event times or persistent installation identifier. Its receipt identifies the report file, not a person or device. Keep the receipt if you later ask a recipient to delete that report.

Sharing is optional and separate from ATLAS. Do not put reports in public issues. A named email, GitHub account or delivery service may reveal your identity or add its own metadata. A report without a name is not guaranteed anonymous. You can decline without affecting normal app use. Deleting a local export does not delete copies already shared.

## For the administrator

Release family identifies the app preparing the export, rather than the version originally running each historical task.

Run `npm run admin` from the source checkout or double-click `Start-ATLAS-Insights.cmd`. A separate **ATLAS Insights** app opens. It has no ATLAS provider/chat access, account sign-in, publisher endpoint or network access. Import only statistics JSON files users voluntarily choose to share. There is no mailbox/folder scan or automatic import.

The importer accepts at most 100 files per action, 8 KiB each, and reconstructs the exact schema. Unknown fields, invalid values and oversized files are rejected; original file names and rejected contents are not retained in its report store. Duplicate report receipts with identical content are ignored. A conflicting receipt is rejected. This is not a cryptographic authenticity check: people can edit/fabricate reports or export several reports for the same activity.

The dashboard shows **reports received**, approximate task counts, outcomes, reported features, month and release-family distributions. It cannot measure unique users, daily/monthly active users, retention, churn, geographic reach, total installations or population-wide success rates. Do not treat the voluntary sample as representative. An app's completed status does not establish code correctness or customer satisfaction. Overlapping feature counters must not be summed as distinct tasks.

Single-receipt and full deletion require confirmation. The store automatically removes reports outside the latest twelve UTC calendar months when opened or accessed; at most 5,000 reports are retained. The retention policy is a design choice, not a universal legal rule. Store files reside under `%APPDATA%\atlas-insights` on Windows and use the Windows account's permissions. The app does not encrypt them. Use account security/disk encryption and restrict access. Delete source files, sharing messages, exports and backups separately according to their purpose and any obligations.

**Save aggregate summary** exports totals over all retained reports, without report receipts or raw reports. It still needs a disclosure-risk review before public sharing, especially with small groups. Never enrich or join receipts to contact lists, profiles or advertising data. The app has no multi-user access control because it is an offline, single-account application; it is not safe to expose as a public admin website.

## Build a separate Windows app

`npm run dist:admin` builds a portable **ATLAS Insights 0.1.0** executable under `dist/insights`. It uses the existing Electron tooling and adds no package dependency. The admin app is excluded from the normal ATLAS package; reporting/export functionality remains in ATLAS. The portable build is unsigned unless signing is separately configured. It is not automatically published or distributed to ATLAS users.

## Privacy operations

Read [the privacy assessment](STATISTICS-PRIVACY-ASSESSMENT.md). It links current primary sources and distinguishes engineering safeguards from legal requirements. The absence of chats or an automatic server reduces exposure but does not certify compliance in every circumstance.

Before asking for reports, explain the improvement purpose, what the file contains, the voluntary nature, your retention/deletion process and a private contact channel. Do not retain unnecessary sender metadata. Use GitHub private reporting for sensitive privacy inquiries: [private reporting](https://github.com/springycape20/atlas-desktop/security/advisories/new). A recipient may need to assess applicable Australian/overseas law, delivery-channel metadata, access/deletion requests, complaints and security incidents. Reassess this design before adding automatic analytics, user/device IDs, payments, public charts, cloud storage or hosted dashboards.

Tests cover data minimisation, strict validation, consent/review tokens, imports, duplicate handling, retention/deletion and the real offline admin renderer. Synthetic reports used in screenshots are examples only.

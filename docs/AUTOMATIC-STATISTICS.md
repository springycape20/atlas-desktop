# Automatic statistics: local opt-in prototype

This is an unhosted development prototype after 0.9.1. Nothing has been deployed or enabled for public users. Normal ATLAS builds have `statistics-config.json` set to disabled with no receiving endpoint. Existing manual-report acknowledgments do not opt anyone into network reporting.

## Try it safely on this computer

From the checkout, in one terminal:

```powershell
npm run statistics:receiver
```

In another terminal:

```powershell
npm run start:statistics-demo
```

The separate demo app uses **synthetic counters** and its own `.statistics-demo/client` profile. It does not open the normal ATLAS profile, provider accounts, conversations or projects. The receiver binds only to `127.0.0.1:43127`. If the port is occupied, stop the process you recognise as using it; do not expose this prototype to the internet.

In the demo, choose **Review recipient and current sample**, inspect its JSON, tick the opt-in box, and choose **Enable automatic reporting**. Enabling sends nothing. **Send reviewed local sample once** makes an explicit one-off request to this computer. You can turn reporting off and request deletion. Closing the demo does not reset a remembered opt-in; it remains separate from the normal app's choice. Repeated accepted samples for the same month are suppressed.

To inspect receiver data without networking the admin app:

```powershell
npm run statistics:snapshot
npm run admin
```

Import the newly created `.statistics-demo/snapshot*.json` file(s) into Insights. The command authenticates locally using the private `.statistics-demo/admin-token` file and exports validated reports only. The files omit deletion secrets and hashes. Larger exports are split into batches of at most 1,000 reports. Do not mix synthetic reports with future real statistics. Delete old snapshots separately; importing a later snapshot does not remove previously imported reports automatically.

The receiver, private token, local reports and demo profile are excluded from Git and normal ATLAS packaging. No package installation or model request is needed. Stop the receiver with Ctrl+C. The source demo is not included in packaged end-user ATLAS.

## Normal-client behaviour

The **Automatic statistics** section is separate from manual report export. There is no recipient in the default build, so enabling is unavailable. A future reviewed configuration must name a fixed HTTPS endpoint, operator, contact, privacy notice and notice version. Client users cannot type arbitrary endpoints into this settings screen.

When configured, opting in requires a fresh payload/recipient preview and affirmative checkbox. The preview is a current example: future monthly counts, report IDs and deletion secrets differ. Consent is bound to the endpoint, schema and notice configuration; changes require renewed opt-in. Existing manual choice or app updates do not grant consent. Refusal does not limit normal app functionality.

The normal scheduler checks on startup and hourly while ATLAS is running. It sends at most one fixed sample for the previous completed UTC month, starting with the opt-in month; no earlier backfill or historical catch-up is attempted. It does not create a separate event history and reads only permitted fields of retained task records. Small values are rounded to five, zero rounded samples are skipped, and retained-task limits can omit activity. It cannot establish unique users, active users, retention, total installations or population-wide success rates.

Reports use the existing strict allowlist. The envelope adds a per-report random deletion secret. There are no chats, prompts, replies, files, paths, commands, accounts, provider names, raw errors, IP/location fields, device fingerprint, exact event times or stable installation identifier. The transport and hosting infrastructure still receive connection metadata such as IP addresses. Do not advertise this as guaranteed anonymous or fully offline reporting.

On a failed delivery, retries use the same report ID, secret and frozen body, no sooner than 24 hours later. Requests time out after ten seconds, do not follow redirects, and send no provider credentials or cookies. A pending snapshot is discarded on withdrawal. In-flight requests are aborted where possible, but bytes already received cannot be recalled. The client retains a local deletion receipt even when delivery is uncertain. Same-receipt duplicate submissions are idempotent.

**Turn off and request deletion** withdraws consent first, then sends the stored per-report deletion proof to the configured recipient. It is an explicit network action even while reporting is off. The receiver stores a deletion tombstone to prevent a late/retried POST from recreating the same report. Changing the endpoint may require contacting the previous operator. Separate local Insights imports, export files, delivery records and backups require operator handling. Deleting/resetting ATLAS data first loses local deletion credentials; request deletion or preserve the relevant local records beforehand.

## Receiver prototype controls

Only allowlisted POST/DELETE routes and a token-authenticated admin snapshot route exist. Public payloads are limited to 8 KiB with exact keys and bounded counters. The application does not store request IP addresses, user agents, cookies or raw request bodies; it stores reconstructed reports and hashed deletion proofs. There is no session-cookie or user-account system. Browser-origin requests are rejected. The admin token is never placed in reports or printed by the launch command.

The service serialises storage mutations, retains accepted reporting months within the latest twelve UTC calendar months on access, and caps both report records and deletion tombstones at 5,000. A process-wide 60-request/minute write budget avoids retaining IP-based rate-limit identifiers. These are prototype limits, not sufficient internet-scale abuse protection. Reports are forgeable self-reports; schema validation is not an authenticity guarantee. Disk stores are not encrypted by this code.

Insights remains offline. It accepts strict individual reports up to 8 KiB or validated snapshots up to 1 MiB and 1,000 reports, with a 10 MiB budget per import action. It stores no snapshot provenance or original filenames. Imported copies are not automatically removed by receiver deletion requests.

## Before any public enablement

Do not turn on the packaged configuration or publish an endpoint based on this local test alone. Choose the operator and hosting jurisdiction; verify TLS, hosting/CDN/proxy access logs, subprocessors, contracts, backup/deletion behaviour, access control, breach handling and appropriate privacy contact/notice. Proxy and hosting logs can identify people even when the application omits IP fields. The global write budget and shared admin token need a production security review and operational plan.

Update ATLAS's no-collection statements before enabling the service. Assess Australian and applicable overseas requirements, lawful handling and international disclosures, and consent withdrawal/deletion across all copies. Consent is not permission to collect unnecessary information. Read the source-linked [privacy assessment addendum](STATISTICS-PRIVACY-ASSESSMENT.md). This implementation is not legal certification or an anonymity guarantee.

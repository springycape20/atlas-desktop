# Offline statistics reports: privacy assessment

Assessed 29 October 2026. Scope: optional local ATLAS statistics reports that a user previews, saves and independently chooses to share, then imports into an offline administrator app. This assessment records design controls and operator responsibilities. It is not legal certification, an independent security audit, or a finding that every jurisdiction is satisfied. Implementation tests and release evidence must be recorded separately.

## Purpose and data flow

The limited purpose is understanding reported app use, task outcomes and feature adoption to improve ATLAS. There is no automatic upload, publisher collection endpoint, remote analytics service, advertising identifier or cross-device tracking.

The implemented flow is: existing retained task metadata → allowlisted aggregate report → exact user preview → user-chosen file → optional user-arranged sharing → local administrator import. No separate usage-event history is recorded. Saving a file does not send it. Refusing to create or share a report leaves normal app functions available.

Reports contain only a report-specific random identifier, a coarse reporting month, a coarse app version and bounded fixed-category counts. The schema excludes chats, prompts, replies, files and paths, project names, commands, model/account identifiers, credentials, names, contact details, IP addresses, geolocation, device fingerprints, free-text errors and precise event times. Rounded counts reduce detail but do not establish anonymity. New fields need a fresh necessity and identification-risk review.

## Legal applicability and limits

Australian coverage must be checked against the publisher's actual circumstances. OAIC guidance says most businesses with annual turnover of A$3 million or less are exempt from the Privacy Act, but identifies exceptions regardless of turnover, including trading in personal information, health services and certain Commonwealth contracting. Free distribution and low revenue alone do not establish an exemption. Do not rely on the exemption as the privacy design. [OAIC small-business guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business).

Where the Australian Privacy Principles apply, relevant duties include transparent policies and collection notices, reasonably necessary collection, limits on use/disclosure, security and handling access/correction requests. Unneeded personal information generally requires destruction or de-identification, subject to lawful retention requirements. These are conditional legal duties; the controls below are design choices for meeting or exceeding them, not statutory safe harbours. [APPs 1, 3, 5, 6, 11–13](https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles).

Foreign laws need an applicability assessment if distribution or handling changes. The European Commission explains that GDPR can apply to an overseas business offering services to people in the EU or monitoring their behaviour; services can be free. This does not mean a GitHub download, on its own, automatically establishes targeting. Territorial scope, the personal-data question and the actual processing must be assessed together. [European Commission applicability guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en), [EDPB territorial-scope guidance](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf).

## Statistics are not guaranteed anonymous

OAIC treats identification risk as contextual: available external information and who can access the data matter. A report sent from a named email address or GitHub account may be identifiable to its recipient even when its JSON omits a name. Rare combinations of month, version and counts can also carry context. Describe this feature as optional statistics reporting rather than promising anonymity or declaring privacy laws inapplicable. [OAIC de-identification guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/de-identification-and-the-privacy-act).

A random report identifier supports duplicate-file rejection and deletion requests. It must not become a persistent installation identifier or be joined to a contact list. The EDPB distinguishes pseudonymisation from genuine anonymisation; replacing direct identifiers does not itself remove data-protection obligations. [EDPB explanation](https://www.edpb.europa.eu/topics/ai-and-technology/anonymisation-pseudonymisation_en).

The panel should label report totals and reported activity accurately. It cannot infer unique users, population adoption, retention, geography or verified app success from self-selected manually submitted files. Repeated exports and fabricated reports remain possible.

## User choice and notice

Do not record additional statistics before a clear optional local-recording choice; alternatively, derive a report from existing metadata only when the user explicitly requests it. Explain this distinction in the UI. Provide the exact export preview, purpose, recipient choice, exclusions and limits before saving. Do not preselect sharing or bundle it with access to ATLAS.

OAIC's consent guidance requires a genuine choice, understandable information, specificity and a current decision. A privacy-policy link alone is insufficient evidence of informed agreement. Consent is not a general permission to collect unnecessary information. [OAIC consent guidance](https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information/consent-to-the-handling-of-personal-information).

Explain that the sharing method may reveal sender metadata and copied files remain outside app control. There is no separate counter store: discarding the preview removes the prepared report, exported files can be deleted by their owner, and existing app-data deletion controls cover retained task records. Provide a report identifier the user can retain for later recipient-removal requests. Update the existing privacy statement before release: no automated publisher telemetry can remain true, while the publisher may receive files that users deliberately send.

## Technical and operator controls

These are recommended engineering safeguards, not a claim that the law prescribes this exact implementation:

- Strictly validate an allowlisted schema at export and import. Reject unknown fields, excessive files/bytes, invalid categories and unreasonable numbers. Store reconstructed validated objects, not arbitrary originals or source filenames. Render imported values as text.
- Keep the admin interface offline, with no remote scripts, fonts, trackers or network connections. Use a restrictive content policy and no imported executable content. Import only explicitly selected files; do not scan user folders or mailboxes.
- Keep imported reports in a separate local store. Provide single-report deletion, full deletion and an understandable retention policy. The implementation retains the latest twelve calendar months when accessed; this period is a product/operator decision, not a universal legal requirement.
- Protect the administrator's Windows account and device, use disk encryption where appropriate, and restrict access. Local storage is not inherently encrypted or immune to malware, backups or cloud-folder synchronisation.
- Do not keep a sender-to-report mapping, enrich reports with public profiles, profile individuals, or use the records for marketing. Do not publish individual reports or small-group breakdowns. Public summaries need a separate disclosure-risk assessment.
- If a submission includes unsolicited chats or contact information, do not import that material. Assess and remove unnecessary originals and associated messages as appropriate; deleting the panel's copy does not delete email, GitHub or backup copies.
- Publish an accessible contact and process for privacy inquiries, report deletion and complaints. Reassess receiving/sharing channels and cross-border handling before introducing hosted collection or support integrations.

## Review before distribution

Verify the actual schema, default behaviour, exact preview, absence of upload paths, import rejection, deduplication, deletion and retention in tests. Confirm UI claims match the code and the privacy statement. Record unresolved risks and repeat this assessment if telemetry, identifiers, payment records, public dashboards or new metrics are added. OAIC recommends adapting privacy impact assessments to a project's scale and risk; this document is one part of that ongoing process. [OAIC PIA guide](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/privacy-impact-assessments/guide-to-undertaking-privacy-impact-assessments).

## Development addendum: proposed automatic opt-in reporting

Assessed 29 October 2026 following the owner's choice to try automatic reporting. This is an additional development design, **not a deployed collection service or approval to claim legal compliance**. The manual offline flow above remains available. Its statements about having no upload path apply to that manual flow, not to this proposed optional network mode.

Automatic reporting changes the data flow: a user-approved local monthly snapshot would travel to a publisher-operated endpoint and be stored there. The report schema remains restricted as above; no chat content, raw errors, file paths or account information may be added. The planned send is one bounded snapshot for the previous completed UTC month, derived from retained task metadata; it represents only that available sample. A snapshot must remain fixed during retries, rather than silently incorporating later activity. Counts still cannot establish unique users, complete usage or retention.

### Consent and withdrawal

Network reporting must be off by default and unavailable without a complete owner-controlled configuration identifying the operator, fixed HTTPS endpoint, purpose, privacy notice and contact. Do not accept arbitrary user-entered collection URLs or ship placeholder operator details as a usable consent configuration. Display the exact current payload and the destination before enabling. Bind the recorded consent version to the endpoint, schema and purpose; a material change must stop sending until renewed agreement. Existing manual-export choices are not consent to automatic transmission.

The disable control must be easy to find, preserve ordinary app access, stop new work and abort queued/in-flight requests where technically possible. Explain that an already received report cannot be recalled by cancelling a request. Withdrawal and deletion are separate actions: offer a specific deletion request for already received reports, without continuing general reporting. EU consent guidance requires accessible withdrawal when consent is the applicable basis. [EDPB consent guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en), [OAIC consent guidance](https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information/consent-to-the-handling-of-personal-information).

### Service controls and metadata

These are proposed engineering safeguards, not statutory numerical thresholds:

- Enforce the exact schema and an 8 KiB request limit at the receiver. Reject unknown fields and excessive values. Reconstruct the stored object from validated fields; never retain an arbitrary request body.
- Use a different random identifier for each report, with no persistent installation ID. Keep a local deletion receipt containing a high-entropy proof secret; store only its verifier at the service. Protect receipt secrets from logs and exports. Restrict administrator export/deletion endpoints using credentials that are never bundled into distributed clients.
- Reject duplicate report IDs and conflicting retry contents. Keep admin access private and authenticated. Apply bounded storage, request handling and retention; public submissions are untrusted and can be fabricated. Avoid introducing persistent IP tracking as an abuse-control shortcut.
- Do not intentionally log report bodies, source IPs, request headers, receipt secrets or unfiltered errors in application code. This does **not** mean no IP processing: the network listener, hosting provider, reverse proxy, CDN, firewall and monitoring services may see or retain connection metadata. Their actual settings must be checked and disclosed. Treat metadata cautiously where it can relate to an identifiable person. [OAIC personal-information guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/what-is-personal-information).

Before deployment, document hosting entities and locations, subprocessors, access/error/security logs, backups, deletion propagation, security responsibilities and appropriate processor contracts or DPAs where required. Assess overseas disclosure obligations rather than assuming an Australian hostname establishes Australian-only processing. OAIC explains that overseas cloud arrangements can involve disclosure, while some controlled arrangements may be a use; the contract and facts matter. [OAIC overseas-handling guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/sending-personal-information-overseas).

### Deployment gates

Keep public collection disabled until the operator and notice are complete; TLS and endpoint ownership are verified; host/proxy logging and jurisdiction are assessed; retention and deletion—including backup handling—are documented; admin authentication is configured; and consent, retry, withdrawal, receipt-proof deletion and payload-rejection tests pass. Review the actual server and host configuration together. APP 11 guidance emphasises active technical and organisational protection and lifecycle management where it applies. [OAIC security guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information).

Update public privacy statements before enabling this feature in a release: an absolute promise of no publisher collection would no longer describe automatic mode. Continue to avoid claims of guaranteed anonymity, unique-user measurement or universal compliance. A local development test does not verify a future host's logs, lawful basis, cross-border arrangements or deployment security.

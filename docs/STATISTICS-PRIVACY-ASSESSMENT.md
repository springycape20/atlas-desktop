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

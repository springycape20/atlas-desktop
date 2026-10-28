# ATLAS legal and privacy research

Research date: 28 October 2026. This is a scoped research note for a security and release-readiness review, not a legal opinion, compliance certificate, or assurance against claims or fines. An Australian lawyer must confirm applicable laws and any terms before reliance.

## Assumptions and limits

The user confirms the publisher is based in Australia and describes ATLAS as permanently free, publicly downloadable from GitHub, with no developer-operated servers and no developer collection of user data. The software is published under MIT. A static project website may be added later. Foreign markets actually targeted, the publisher's state or territory and legal structure, intended age group, and intended regulated uses are not confirmed. Australia is the primary legal jurisdiction assessed; the European and US sections are conditional screening for possible foreign distribution or processing, not a finding that those regimes apply.

The local application still sends information to services selected by users. README.md describes OpenAI/Codex, Anthropic/Claude, optional ElevenLabs, GitHub update checks, and model/runtime downloads. A claim of no developer collection must be distinguished from a claim of no network transmission. This note does not establish whether any particular contract, consumer law, privacy law, or AI-system classification applies to the publisher.

No live provider accounts were used. No application code, published terms, or releases were changed for this research.

## Findings requiring action or an explicit scope decision

### 1. Do not treat MIT as protection from every legal claim

The repository's LICENSE contains the standard MIT warranty disclaimer and liability limitation. These are useful licensing terms, but are not a finding that every statutory right can be excluded. For an Australian commercial supply, consumer guarantees may apply automatically; warranties cannot remove them. Whether genuinely non-commercial free distribution is a supply in trade or commerce needs assessment rather than an assumption that every paid-product obligation applies. If monetisation or paid support is added, obtain a fresh review. [ACCC: warranties](https://www.accc.gov.au/business/selling-products-and-services/warranties), [ACCC: consumer rights and guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees).

Recommendation: retain MIT for the code. Have counsel decide whether separate user-facing terms are useful for this free distribution, preserving any non-excludable rights and accurately describing computer control, possible data loss, model error, user-authorised external transmissions, and third-party provider costs. A new EULA is not automatically mandatory merely because the application exists.

### 2. Correct or qualify claims that overstate verification and privacy

README.md:3 promises a single verified answer. Other repository descriptions distinguish reviewer acceptance from checks actually executed. A model review does not prove correctness, and a passing configured test does not verify every statement in an answer. The claim merits qualification to match the actual verification badge and checks. This is a factual marketing-risk finding, not a conclusion that a particular offence has occurred. Australian businesses must not make misleading product or performance representations, and the FTC likewise advises that security/privacy features work as advertised. [ACCC: false or misleading claims](https://www.accc.gov.au/business/advertising-and-promotions/false-or-misleading-claims), [FTC: Start with Security](https://www.ftc.gov/business-guidance/resources/start-security-guide-business).

Recommendation: describe Colab as building and reviewing work, with verification limited to named checks that ran. Explain that AI output can be wrong. Preserve the README's distinction between local storage and information sent to user-selected providers; do not simplify it to “everything stays on your PC.”

### 3. Australia: determine Privacy Act coverage before declaring an APP obligation or exemption

Most Australian small businesses with annual turnover of A$3 million or less are outside the Privacy Act, but important exceptions include health-service providers, businesses trading in personal information, and Commonwealth contractors. Public release, free pricing, and being a sole developer do not themselves answer the coverage question. On the user's stated model, no developer data collection substantially reduces the publisher's operational privacy exposure; it is not evidence that every future feature or support workflow is exempt. [OAIC: small business](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business).

If the publisher becomes an APP entity and handles personal information, assess notice, purpose and minimisation, security, access/correction, retention, cross-border disclosure, and complaints. An APP privacy policy must be accurate and accessible and should cover relevant disclosure and complaint practices. This is conditional, not a direction that a local-only hobby project must implement an enterprise privacy program. [OAIC: Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles), [OAIC: APP 1 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information).

Recommendation: keep an accurate, easily found privacy explanation even if statutory policy requirements do not apply. State publisher identity/contact route, local storage location, deletion/uninstall behaviour, provider transmissions, optional cloud speech, update/download endpoints, and whether support reports can contain private content. Reassess if a future website adds forms, analytics, cookies, mailing lists, payments, or crash uploads.

### 4. Australian privacy claims can exist outside APP coverage

Australia's statutory tort for serious invasions of privacy commenced on 10 June 2025. OAIC says it extends beyond APP entities to individuals and other entities. Its legal elements, defences and exemptions still have to be established; the mere presence of a microphone or a defect does not establish liability. The small-business Privacy Act exemption therefore is not a complete answer to the user's concern about lawsuits. [OAIC: statutory privacy tort](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy).

Recommendation: document informed permission and minimise foreseeable unintended recording, disclosure, and desktop actions. Seek legal advice on the actual operating circumstances if the app will be promoted for workplace monitoring, recording others, or handling sensitive data.

### 5. Microphone and screen capture need deliberate design and jurisdiction-specific review

main.js:306-307 enables wake-word listening and automatic follow-up listening by default; README.md discloses these defaults. Local processing reduces external disclosure but does not decide whether recording or monitoring others is lawful. NSW's Surveillance Devices Act regulates listening devices and private conversations, with particular exceptions; it is inaccurate to reduce the law to a universal all-party-consent slogan. Other jurisdictions differ. [NSW legislation: Surveillance Devices Act 2007, section 7](https://legislation.nsw.gov.au/view/whole/pdf/inforce/current/act-2007-064), [NSW Department of Communities and Justice: recording powers and the Act](https://dcj.nsw.gov.au/documents/legal-and-justice/laws-and-legislation/surveillance-devices-act-2007-and-statutory-powers-to-make-audio-and-video-recordings.pdf).

Recommendation: prefer explicit first-run opt-in before continuous microphone listening, show a persistent listening indicator, provide immediate pause/disable, and explain accidental capture of other people. Confirm whether temporary audio files are retained and deleted. Explain that screen captures may include bystanders' messages, secrets, or work information before sending them to a provider. These are risk-reduction recommendations, not a claim that one global consent design guarantees recording-law compliance.

### 6. Incident response obligations are conditional, but a response channel is useful now

For entities covered by Australia's NDB scheme, a breach likely to cause serious harm may require notification to affected individuals and the OAIC. A suspected breach assessment must be reasonable and expeditious, with reasonable steps to complete it within 30 calendar days; that is not a universal 30-day period to delay reporting a confirmed eligible breach. [OAIC: NDB scheme](https://www.oaic.gov.au/privacy/notifiable-data-breaches/about-the-notifiable-data-breaches-scheme), [OAIC: NDB assessment](https://www.oaic.gov.au/privacy/notifiable-data-breaches/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme).

Recommendation: add a private vulnerability-reporting route, a supported-version statement, a triage process, release rollback instructions, and a way to alert users to a critical update. No publisher server is needed for a documented security contact or GitHub private reporting configuration. Do not invite users to post unredacted logs or conversations publicly.

### 7. EU GDPR: receipt of user data and targeting must be assessed, not inferred from availability alone

GDPR can apply to an EU establishment's processing or to relevant non-EU processing connected to offering goods/services to people in the EU or monitoring them. Free services can qualify. This requires an actual processing and territorial-role analysis; an MIT download that does not result in publisher processing is not automatically a publisher-operated GDPR service merely because an EU user can download it. Conversely, never receiving a copy is not enough by itself to resolve who determines purposes and means of any organised processing. [European Commission: application of GDPR](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).

Recommendation: document data flows and which party determines them. Keep publisher processing, users' own local use, and independent provider processing distinct. Do not claim that users' acceptance of provider terms resolves every potential controller/processor or international-transfer question. Obtain an EU assessment before adding publisher-operated analytics, support uploads, hosted AI, or EU-targeted business services.

### 8. EU Cyber Resilience Act: non-commercial FOSS is a material scope exclusion

The CRA concerns connected software/hardware products made available on the EU market in a commercial activity, whether charged for or free. The Commission summary says products not supplied in a commercial activity are outside scope. ATLAS's stated permanently free, non-monetised MIT distribution is therefore a substantial basis for assessing it as excluded, rather than demanding CE marking solely because it has an installer. MIT alone does not settle commercial-activity status if the business model changes. [European Commission: CRA scope summary](https://digital-strategy.ec.europa.eu/en/policies/cra-summary).

For in-scope manufacturers, exploited-vulnerability and severe-incident reporting began on 11 September 2026, including early warning within 24 hours and a fuller notification within 72 hours. Open-source software stewards have a separate reporting commencement of 11 December 2027. The remaining main CRA provisions fully apply from 11 December 2027. These dates do not establish that this hobby publisher is either a manufacturer or steward. [European Commission: CRA reporting](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting), [European Commission: CRA implementation](https://digital-strategy.ec.europa.eu/en/factpages/cyber-resilience-act-implementation).

Recommendation: record the non-commercial distribution model. Reassess before selling binaries, attaching commercial services, or otherwise monetising the product. Security maintenance is still prudent even if CRA is excluded.

### 9. EU AI Act is distinct from CRA and cannot be dismissed solely because ATLAS is free

ATLAS integrates third-party models under its own product name. Whether it is a provider of an AI system and which exemptions apply needs a product-specific analysis; it should not automatically be treated as the provider of the underlying GPAI models. Current official guidance describes chatbot/agent transparency and machine-readable marking requirements, with exceptions including some source-code and standard-editing outputs. Article 50 generally applies from 2 August 2026; do not infer that every coding reply must be visibly watermarked or that naming the model necessarily settles every requirement. [European Commission: Article 50 guidance](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act), [European Commission: transparency obligations](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations).

The Council's current timeline records final approval of AI Omnibus changes on 29 June 2026: stand-alone high-risk rules were moved to 2 December 2027, and high-risk AI embedded in regulated products to 2 August 2028. Old articles giving the original dates are not a reliable current checklist. A general coding assistant is not established to be high-risk by this review; recruitment, credit, medical or other regulated intended uses require a separate classification. [Council of the EU: AI timeline](https://www.consilium.europa.eu/en/policies/artificial-intelligence-act/timeline-artificial-intelligence/).

Recommendation: clearly identify AI interaction, retain human control over consequential actions, and obtain an EU classification review if EU distribution is an actual target. Treat generated synthetic speech separately from source-code outputs.

### 10. US exposure requires actual scope facts

FTC guidance supports accurate privacy/security representations and maintaining app security; its guidance is not an independent certification checklist, and statutory jurisdiction still matters. California's CCPA generally applies to qualifying for-profit businesses with specified processing and California connections, including a revenue threshold of US$26.625 million effective 2025, buying/selling/sharing data of 100,000 residents/households, or obtaining at least half of revenue from selling/sharing personal information. This is not a rule that every free local application must add a California cookie banner. [FTC: app security](https://www.ftc.gov/business-guidance/resources/app-developers-start-security), [California Privacy Protection Agency: applicability FAQ](https://cppa.ca.gov/faq.html).

COPPA has particular rules for commercial online services directed at children under 13, or services with actual knowledge of relevant collection from them. The operator, audience and actual data flow matter. A general local coding tool is not established to be covered by this review; an “adults only” label is not a substitute for analysis if the real service is child-directed. The FTC notes its rule was amended in 2025. [FTC: COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).

Recommendation: choose an intended audience and avoid marketing this release for children or sensitive regulated decisions before specialist review. Investigate other state privacy, recording and consumer laws only after target markets and processing are known.

## Practical priority order

1. Document the publisher, countries actually targeted, permanent non-commercial model, intended audience, and intended use. Confirm data flows against code and packaged behaviour.
2. Qualify broad verification/privacy claims; explain AI fallibility, external provider requests, local retention and deletion, and computer-control scope.
3. Make continuous microphone use an informed choice; verify indicators, stop/revoke behaviour, and temporary-audio deletion.
4. Establish a private security-reporting route and maintenance/incident process. Resolve confirmed technical findings before another release.
5. Complete redistribution licences, model licences, brand permissions and provider integration-term checks separately; this file does not clear those contracts or assets.
6. Take this note and the technical audit to an Australian lawyer familiar with software and privacy. Ask for a written applicability decision covering the actual hobby or trade/commerce context, and obtain relevant foreign advice for any targeted EU-facing release. Revisit on monetisation, telemetry, server, audience or intended-use changes.

## Unresolved legal decisions

- Which Australian state or territory and legal structure apply to the publisher, and which foreign countries are actually targeted rather than incidentally able to download?
- Is there any monetisation, commercial sponsorship tied to the product, paid support, employer distribution or contractual customer undertaking?
- What ages and intended uses are supported? Will workplace, health, financial, legal, or educational uses be promoted?
- Could support requests, vulnerability reports or a future website introduce publisher handling of personal information?
- Does a product-specific EU review identify any applicable AI-system obligations despite CRA non-commercial exclusion?

This research cannot establish worldwide compliance, eliminate negligence or intellectual-property claims, or guarantee a court's treatment of a disclaimer. The Australian Government itself describes the laws relevant to AI harms as a context-dependent, non-exhaustive set. [National AI Centre: AI and Australian law](https://www.ai.gov.au/staying-safe-and-responsible/ai-and-australian-law).

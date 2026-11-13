# ATLAS proprietary-licensing feasibility

Prepared 14 November 2026 (Australia/Sydney). Reviewed checkout `2831c6de7521c905d28fa247a05f4b767b33f757`, application version 0.12.1. This is a scoped technical and primary-source review for a licensing decision, not a legal opinion or approval to change terms.

## Decision

**Future proprietary ATLAS releases appear possible, but the current product is not cleared for an immediate proprietary/commercial launch.** MIT does not require distributing future source code, and most current application dependencies have permissive licences. The unresolved work concerns ownership/provenance, native-runtime obligations, provider authentication contracts and the terms of the proposed product.

Changing a licence is different from making existing public code secret. Existing recipients can continue relying on the MIT permission already granted for their copies. A proprietary future release can restrict new original material where the publisher has the necessary rights; it does not stop lawful forks of the previously released MIT version. [MIT text](https://opensource.org/license/mit), [GitHub's MIT explanation](https://choosealicense.com/licenses/mit/), [GitHub's guide to changing licences](https://opensource.guide/legal/#what-if-i-want-to-change-the-license-of-my-project).

No licence, dependency, application code, release asset or repository visibility was changed for this investigation.

## Evidence and remaining decisions

| Area | Verified evidence | Consequence |
| --- | --- | --- |
| Current licence | Root `LICENSE`, `package.json` and the `v0.12.1` tag identify MIT. README expressly offers the source under MIT. | Preserve the accuracy of existing release records; a new licence needs a clear prospective version boundary. |
| Git authorship | Available local history has 278 commits attributed to springycape20, 10 to Dependabot and one to Codex. Dependabot changes concern package manifests/lock and release workflow. AI co-author trailers also occur. | No additional human author identity appeared in this local author summary. Git metadata does not prove sole copyright ownership or the absence of copied material. |
| Ownership records | The owner confirms ATLAS is a personal project with AI assistance. No root contributor agreement or assignment record was found. Older research leaves detailed artwork and copied-code/Graphify provenance unresolved. | No employer/client ownership issue is reported. Retain creation/licence records for artwork and incorporated third-party material; the personal-project confirmation is not an asset-by-asset provenance audit. |
| npm dependencies | Current dependency review found only permissive expressions in 135 production-lock entries. | A proprietary application layer is plausible if upstream notices and rights are retained. |
| Native installer | Electron/Chromium distributes separate component notices and a native FFmpeg binary. The review identifies an LGPL compliance boundary. | Establish exact native build/source/replacement obligations and appropriate EULA exceptions before release. |
| Provider access | ATLAS launches `codex app-server` and the user's Claude Code binary. | Copyright permission to distribute ATLAS is separate from permission to offer the chosen provider integration commercially. |
| Existing public copies | MIT and publicly distributed release history exist already. | Closing future source or taking the marketing site offline cannot recall existing copies or grants. |

The dependency evidence and native-runtime caveats are recorded in [the detailed dependency review](PROPRIETARY-DEPENDENCY-REVIEW-2026-11-14.md). Earlier Kokoro/eSpeak/sharp findings concern older releases; those components were removed for 0.8.3 and were not found in the local 0.12.1 package. Historical distribution duties still need separate treatment if relevant.

## Ownership and AI assistance

A permissively licensed contribution can often be incorporated into a more restricted overall product while retaining its required licence and copyright notices. Therefore, discovering an MIT contribution does not automatically require rewriting it or obtaining a new assignment. It also does not justify erasing its notice or claiming exclusive ownership over that contribution. A different or missing inbound licence, employer ownership, or a desire to remove existing grants requires separate analysis. [GitHub's licence-change guidance](https://opensource.guide/legal/#what-if-i-want-to-change-the-license-of-my-project).

On 14 November 2026, the owner confirmed: “Personal project with AI assistance.” This resolves the previously pending personal-versus-employer/client question on the owner's stated facts. It supports considering proprietary terms for future original ATLAS work, subject to the other findings in this review. It does not replace detailed provenance records for the Beacon artwork, any incorporated third-party code, dependencies or AI-assisted material. Do not treat either this confirmation or the Git author summary as a legal determination of copyright in every component.

AI-provider contractual output rights and the existence of enforceable copyright are different questions. IP Australia explains that human authorship and the degree of human input can affect protection, and recommends retaining creation, prompting and editing records. Preserve those records for the app and logo rather than promising that a proprietary label guarantees exclusivity. This review does not determine which particular generated lines or images attract copyright. [IP Australia: AI and IP rights](https://ipfirstresponse.ipaustralia.gov.au/options/considerations-when-using-artificial-intelligence-create-ip-0).

## Provider contracts are a commercial-launch prerequisite

### Codex / ChatGPT

`codex-connection.js` spawns the user's installed executable with `app-server`. Official OpenAI documentation allows continuation of existing local/open-source app-server authentication but excludes commercial/hosted services from that authentication permission. The documented Sign in with ChatGPT cookbook makes its local open-source/personal scope explicit and directs paid or remotely hosted applications to request access before offering it to users. [App-server authentication](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Sign in with ChatGPT usage policy](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt#usage-policy-and-terms).

Consequently, a paid/proprietary launch cannot be approved merely by changing `LICENSE` while leaving all authentication assumptions untouched. Confirm the specific commercial route with OpenAI, obtain required access, or design an appropriate separately authorised API-key integration. This review does not claim that the existing free local application is prohibited, or that changing copyright terms alone conclusively determines commercial status.

### Claude Code

`claude-connection.js` launches the user's CLI with streaming flags. Anthropic's product-hosting conditions distinguish an unmodified Claude Code binary using each end user's own authentication from a third-party product collecting subscription tokens or offering its own Claude.ai login. Preserve native authentication methods and direct user billing; confirm applicable commercial terms for the planned offering. Do not infer reseller rights or endorsement. [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).

The distinction matters for both providers: developing code with an assistant is not the same contractual question as packaging an assistant integration for customers.

## A practical route if the owner chooses proprietary distribution

1. Choose the model: free closed-source desktop, paid desktop, or an open-source base with separately licensed new features. Paid and hosted models need their own provider approval analysis.
2. Confirm ownership and asset provenance. Retain third-party MIT/Apache/BSD and other grants and notices; resolve exceptions rather than deleting them.
3. Define a future release boundary. Preserve old MIT releases and accurate notices. Review future private source storage separately from the existing public download/update repository.
4. Complete the exact Electron/Chromium/native compliance review and prepare terms with third-party-rights and applicable-law exceptions. Do not adopt a blanket restriction that contradicts mandatory upstream permissions.
5. Update the root licence, package metadata, installer/app notices, website copy, release documentation and contribution process together, after selecting and reviewing the terms. The current website advertises free/open-source/MIT and would need revised wording for a differently licensed release.
6. Retest the actual proposed installer and update path. Making the current GitHub repository private could affect public release downloads and the updater configured in `package.json`; do not change its visibility as a shortcut to hide the website.

An Australian software/IP lawyer can review the proposed licence and the ownership/native/provider questions before the first proprietary release. A draft EULA or legal filing was not prepared or accepted in this task.

## Website pause completed

The owner requested taking the website out of public view during this investigation. Sites access was changed from public to a custom allowlist containing only the owner, with zero external visitors or groups.

Fresh HTTP requests with no authentication cookies and no redirect following returned:

| Endpoint | Anonymous response |
| --- | --- |
| `https://atlasapp.net.co/` | 401 Unauthorized |
| `https://atlas-desktop-product.briskbloom513.chatgpt.site/` | 401 Unauthorized |
| `https://atlasapp.net.co/app.js` | 401 Unauthorized |

Neither the product page marker nor the application JavaScript marker was returned. No Site source was redeployed or public access restored. Domain registration and DNS were preserved for later reuse. Search-engine listings, previously cached copies and the existing GitHub source/releases are separate from current website access; this action does not claim to erase them. Keep the website non-public until the owner explicitly requests otherwise.

# Model usage efficiency

ATLAS cannot extend provider limits or guarantee a number of extra working hours. It can avoid sending unnecessary context and avoid model passes that add little value. Usage reports are provider-reported where available and estimates otherwise; they are not Claude subscription-quota measurements.

## Controls available in 0.10.0

- Use Assistant for a small, clearly scoped change. Use Colab when independent build/review passes are useful. Choose Economy or Balanced and a sensible pass limit; reserve Thorough for difficult tasks.
- In Context, include only the files, memories and history relevant to the task. Use the ranked-context preview to understand selections. Attach selected PDF page text and remove the original document when only those pages are needed.
- Run searches, Git inspection and test commands locally. Supply the failing check and relevant error excerpt rather than a complete successful log. ATLAS runs configured checks before Colab review, so failures can return directly to the builder.
- Write a compact task with acceptance criteria and the required output format. Keep durable project rules concise, and avoid attaching generated folders or repeating the same background in every turn.
- For unrelated work, start a new chat with the relevant project memory or a reviewed handover. Starting fresh without that handover can lose decisions, so use it at a meaningful milestone.

These practices align with the [official OpenAI guidance](https://learn.chatgpt.com/docs/pricing): keep prompts precise, remove unnecessary context and limit source material to relevant files. Provider-specific billing, credits and subscription limits still apply.

## Next improvements to consider

1. **Context cost preview:** show a breakdown of instructions, history, files, images and expected model passes before sending; distinguish measured and estimated values.
2. **General context deduplication:** identify unchanged files by hash and send relevant changes plus a compact state summary, with a full-context fallback when continuity is lost. Colab already has some continued-review diff reuse.
3. **Routing with escalation:** use the configured fast model for low-risk work, then escalate when checks fail or the task needs deeper reasoning. Keep overrides visible.
4. **Milestone handovers:** offer a reviewed summary after a completed milestone and before a long conversation becomes unwieldy. Summaries themselves consume tokens; avoid doing this after every small turn.
5. **Smaller tool results:** return focused source excerpts, failing test cases and bounded diagnostic output, while leaving full logs available locally for deliberate retrieval.
6. **Stable reusable prompts:** keep shared instructions and tool definitions stable and put changing task data later. Where the provider interface supports caching controls and reports cache usage, measure the result instead of assuming savings. [Official prompt-caching guidance](https://developers.openai.com/api/docs/guides/prompt-caching) describes prefix matching; API controls should not be assumed to exist in every CLI integration.

Priority: context cost visibility, deduplication and routing with escalation. Measure completion quality, retries and total reported usage together so a shorter first request does not simply cause more follow-up work.

ATLAS 0.6.6 fixes Colab tasks endlessly reviewing and reopening each other's work.

- A final approving review now ends the task immediately. A successful build/review takes two passes; proposal and compare workflows take four successful passes.
- Fixes address evidenced blockers in the original task. Optional improvements remain notes and do not trigger more passes.
- Repeated unresolved work, regression swapping, or known lack of workspace progress pauses for attention instead of looping. Unlimited passes remain available for tasks making progress, and optional pass caps still apply.
- Missing or malformed completion verdicts receive one read-only clarification. If clarification fails, the task pauses with its work preserved.
- Saved stages retain the next workflow step and fixed scope. Resuming cannot skip proposal or synthesis stages, and changed tracked files must be reviewed before acceptance.
- A review cannot approve tracked workspace changes made during that review or after a review whose verdict is being clarified. These checks depend on a complete tracked-workspace fingerprint.
- Needs-attention and pass-limit outcomes pause queues, show attention notifications, and never claim successful completion or run completion checks. Cancelled tasks keep their cancelled state.
- Preserves the Workbench, plugins, checkpoints, code editor, usage circles, compact effort control, and other features from v0.6.5.

Stop any existing looping task before updating. Install over your existing version to preserve settings and conversations, or use Settings → App updates → Check for updates, then Download and Restart and install. After updating, review saved work before explicitly resuming a paused task. Windows x64.

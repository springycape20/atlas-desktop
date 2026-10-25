ATLAS 0.6.12 makes Colab smarter about bugs, failing checks and disagreements.

- **Debug mode now reproduces, fixes and verifies.** One model reproduces the bug first, ideally as a failing test, without fixing it. The other then fixes the root cause, and the first confirms the reproduction now passes. If the bug can't be reproduced, Colab stops and says what was tried instead of guessing at a fix.
- **Failing checks go straight back to the builder.** Your project's checks run as soon as the builder finishes. A failure returns to the builder right away instead of using up a review pass, and the review reuses those results rather than running your tests twice.
- **Disagreements come to you.** If the builder thinks a requested change isn't needed, it must say why, and the reviewer must answer with evidence. If they still disagree, Colab pauses and shows both sides, with a button to choose who is right. Your choice is final for the rest of the task.
- The Windows Apps list now shows the correct version after updating from inside ATLAS. ATLAS checks its entry again shortly after starting and records each check in its log.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.

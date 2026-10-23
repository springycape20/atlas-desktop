ATLAS 0.6.2 improves long-running tasks, screenshot attachments, and multiline messages.

- Removed task runtime limits from Assistant, Colab, and project profiles. Older tasks can resume without their previous runtime budget blocking them.
- Provider requests now default to Unlimited. An optional individual request timeout can still be selected in Settings.
- Fixed Paste screenshot with Electron's current asynchronous clipboard API, retaining compatibility with older Electron versions.
- Assistant now supports Shift+Enter for a new line and Enter to send, matching Colab. The message box grows as you type.
- Includes the viewport and window sizing fixes from 0.6.1.

Install over your existing version to preserve settings and conversations, or use Settings → App updates → Check for updates, then Download and Restart and install. Windows x64.

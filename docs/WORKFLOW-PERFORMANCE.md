# Conversation, editor and browser improvements (0.11.0)

ATLAS 0.11.0 improves long conversations, connects editor drafts to language intelligence and adds a browser-step builder.

This page records the released 0.11.0 behaviour. The [0.11.1 project tools guide](PROJECT-TOOLS-NEXT.md) supersedes the history-storage, completion, workspace-edit and recording limits below in version 0.11.1.

## Long conversations

Assistant and Colab render up to 150 saved messages per page. Older messages and Newer messages move between pages; Latest returns to the newest page. Saved history is preserved in full. Search in a long conversation scans all saved message text and pages matching messages, including messages outside the current rendered page. Small conversations retain their existing find/highlight behavior. Sending a task returns to the latest page.

This bounds message DOM rendering and the retained message-node cache. History still loads into memory and search still scans the saved messages; this is pagination, not viewport virtualization or a disk database migration. Colab activity records have their own rendering and retention behavior.

## Language intelligence in the editor

Configure an already installed stdio language server from **Configure language server**. The existing start approval and project-file restrictions apply. **Definitions**, **References**, **Diagnostics** and **Hover info** query the cursor position. Unsaved text is sent to the local language server without saving the file. Results that arrive after the draft changes are discarded. Diagnostics and locations are clickable to select their line in the editor.

**Complete**, or Ctrl+Space, requests suggestions. Selecting one replaces the identifier prefix at the recorded cursor position. The initial adapter accepts plain-text suggestions only: snippets, text edits, extra edits and executable commands are omitted. Suggestions cannot apply after the draft has changed. Saving remains a separate action.

**Rename symbol** requires saved open tabs. Enter a basic identifier, inspect every proposed file's before/after text, then choose **Apply reviewed rename**. Up to 50 existing allowed files and 4 MiB of source are supported, with bounded, non-overlapping UTF-16 edits. This version accepts LSP `changes` text edits; `documentChanges`, create/delete/rename resource operations and complex versioned changes are rejected. Files changed after preview are protected by the existing editor version checks. **Undo last edit** restores the applied batch with the existing conflict protections. Partial filesystem failures retain an undo record.

Rename previews currently reject files with byte-order marks to avoid inconsistent server character offsets. These features require server support. A fixture server has been exercised; no production language server was installed or used during validation. The tool does not grant providers extra permissions.

## Browser step builder and conditional waits

Under **Live preview > Repeatable browser checks**, expand **Build a browser step**. Choose an action, CSS selector and any text or wait duration, then choose **Add step**. The JSON recipe remains editable and can be saved with the existing recipe controls. Adding or saving steps executes nothing; running still requires native approval.

`wait-visible` polls for a matching element with visible geometry/CSS. `wait-text` polls for contained text. They default to five seconds and accept `timeoutMs` from 100 to 10,000 ms in JSON. A timeout fails the step and skips later steps. The browser-run budget and unresponsive-preview protections remain in force. Visibility is a basic CSS/geometry test and does not prove that another element does not cover it.

The builder is an alternative to manually writing JSON; it does not record browser interactions automatically. Production pages may need stable selectors and explicit waits. No packages, publisher server or telemetry are added.

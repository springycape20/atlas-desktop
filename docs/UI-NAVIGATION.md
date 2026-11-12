# Readability and navigation (0.11.0)

This UI update keeps the existing feature set while reducing crowded toolbars.

- **Project editor:** Save stays visible. File, Edit, Code and View menus contain the remaining commands. Code includes definitions, references, diagnostics, completion and rename. The editor starts below the measured app header, leaving more space for the file.
- **Tasks, Library and Diagnostics:** a labelled navigation rail replaces wrapping rows of page buttons. Tasks has a category selector. Find a tool searches across the current hub's categories; select a result to open its category. Narrow windows use Category and Tool dropdowns. Ctrl+K still searches destinations across the whole app.
- **Live preview:** Server, Inspect, Browser checks, Visual review and Performance each have their own view. Selecting a power-tool shortcut opens the relevant view directly. Only the active view's controls are shown.
- **Action groups:** crowded action bars retain two visible actions and move the rest into More actions. The terminal keeps new-session and Stop controls beside its type selector; session management is in Session.
- **Reading:** tool headings, paragraphs, labels and action spacing use consistent sizes and line heights. Existing dark, light, high-contrast, text-size and density preferences remain available.

Menus support keyboard opening, arrow-key navigation and Escape, which returns focus to the menu button. All original commands keep their labels and handlers. Grouping an action never executes it or changes its approval requirements.

These UI changes are included in ATLAS 0.11.0.

New execution tools follow the same navigation: **Work → Task budgets**, **Project → Trial promotion** and **Review → Workflow benchmarks**. All three are also searchable through Ctrl+K. Advanced benchmark creation and individual promotion patches are collapsed until needed; see [Execution controls](EXECUTION-CONTROLS.md).

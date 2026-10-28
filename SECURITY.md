# Security

Report security issues privately using [GitHub's vulnerability report form](https://github.com/springycape20/atlas-desktop/security/advisories/new). Do not put credentials, private chats, screenshots, exploit details or raw diagnostic logs in public issues. Include the ATLAS version, Windows version, impact and a minimal reproduction using test data. If private reporting is unavailable, open an issue requesting a private contact without sensitive details.

The maintainer triages reports on a best-effort basis; there is no guaranteed response time. Use the latest release. Older versions may not receive separate fixes. This is a small, free open-source project and has no paid security-support commitment.

ATLAS can execute code and control the desktop with the user's permission. Treat repositories, model replies, imported content and MCP servers as untrusted. Remembered shell permission is not an operating-system sandbox. Revoke permissions or stop a task if an action is unexpected. Keep provider approval bypass disabled unless you understand its effects.

Updates are published only through this repository's GitHub releases. Report suspected release compromise privately; stop using the affected release until it is assessed. Tagged releases require a documented technical dependency review and a decision bound to the exact version and lockfile. Owner-authorized unsigned releases are permitted and disclosed; 0.8.3 is unsigned following SignPath denial. When signing is enabled, verified publisher configuration and valid signatures are required. A report, technical review, test pass or signature is not a guarantee of security or legal compliance.

See [privacy and local data](docs/PRIVACY.md) and [release security checklist](docs/RELEASE-SECURITY.md).

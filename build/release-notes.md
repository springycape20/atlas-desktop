ATLAS 0.6.9 fixes slow startup and hardens speech model downloads.

- Fixes a startup delay of 20–40 seconds before the window appeared. Moving existing data to its new location could fail on a Python runtime link, so ATLAS retried the whole move on every launch. The move now completes once and later launches open in about a second. The first launch after updating may still take a little longer while it finishes.
- Speech models are downloaded from a fixed source and verified by checksum before use. A model that does not match is discarded rather than installed.
- The desktop runtime installer installs exactly the dependency versions ATLAS was tested with.

Install over your existing version to preserve conversations and settings. Packaged installations can use **Settings > App updates > Check for updates**, then download and restart to install. Windows x64. Close older ATLAS instances before updating. Computer control uses the separate Windows-MCP integration, not another chat application's private runtime.

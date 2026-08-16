# @deepseek-ai/dsh-client-ui-settings-plugin-doctor

English | [中文](README.zh.md)

Read-only **Plugin Doctor** tab for Web Settings. This independent Client plugin contributes the `doctor` entry to `settings.plugins.tab`; its Node entry owns no Host behavior. The tab lazily calls `ctx.remote.pluginInventory.list()` through [`api-remotes`](../../api/remotes/README.md) when first mounted and whenever the user selects **Refresh**.

Plugin Doctor derives one point-in-time diagnosis from the Host-owned Loader inventory. It keeps enabled non-group entries in Loader order and maps the root Fiber phases to `running`, `pending`, `starting`, `failed`, `stopping`, or `not-mounted`. Summary cards report enabled, running, and non-running counts from those same rows. Every row shows a compact name, the exact module specifier, and the derived status; expansion reveals the Loader entry id and raw Cordis phase. Disabled entries remain available in the separate [Plugin list](../ui-settings-plugin-inventory/README.md).

Remote failures produce local generic copy and a retry action. The registration uses `ctx.slots.inject()`, so late declaration, redeclaration, locale changes, and plugin teardown add or remove the tab without importing the Plugins section owner.

## Model Experience

None, as the package only displays a Host-owned deployment snapshot in browser Settings and registers no model-facing input or Tool.

#### KV Cache effect

None; the package assembles no provider request.

## Known Limitations and Deferred Work

- **Explicit point-in-time refresh** — the tab does not subscribe to Loader lifecycle changes or retain history.
- **Root Fiber observation** — `not-mounted` states that an enabled Loader entry has no live root Fiber; the current inventory fields do not identify import failure, rollback, or another lifecycle cause.
- **Configured process inventory** — packages present on disk without a Loader entry have no configured runtime identity and stay outside the result.

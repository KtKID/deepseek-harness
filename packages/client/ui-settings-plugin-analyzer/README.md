# @deepseek-ai/dsh-client-ui-settings-plugin-analyzer

English | [中文](README.zh.md)

Read-only **Plugin Analyzer** tab for Web Settings. This independent Client plugin mounts the generated [`pluginAnalyzer`](../../host/plugin-analyzer/README.md) Remote contribution through the shared [`api-remotes`](../../api/remotes/README.md) service and contributes the `analyzer` entry to `settings.plugins.tab`; its Node entry owns no Host behavior. The tab lazily calls `ctx.remote.pluginAnalyzer.snapshot()` when first mounted and whenever the user selects **Refresh**. Unloading the Client plugin withdraws the Remote namespace, dictionary, and slot contribution together.

The Host-owned snapshot keeps enabled non-group Loader entries in Loader order and maps root Fiber phases to `running`, `pending`, `starting`, `failed`, `stopping`, or `not-mounted`. Summary cards report enabled entries, running entries, entries carrying diagnoses, and missing declared dependencies. When diagnoses exist, the tab opens on **Needs attention**; **All plugins** retains the complete enabled inventory. Local search filters the selected view by display name, full module name, or Loader entry id, and summary totals continue to describe the complete snapshot.

Diagnosed cards lead with one primary conclusion, its observed reason, direct and transitive impact counts, observation time, and a safe next action. `fiber-failed` has the highest presentation priority, followed by `isolation-mismatch`, `missing-dependency`, and `missing-root`; the collapsed **Technical evidence** section retains every exact diagnosis kind for entries carrying related findings. Healthy cards state that the current snapshot records no diagnosis.

Technical evidence displays the observation origin, Fiber phases, normalized effect labels, provided services, declared dependency status and provider identity, affected entry ids, lifecycle transition totals, and the retained transition timeline. Activity is labeled `registrations-only`, so registered listeners remain distinguishable from measured dispatch execution. Disabled entries remain available in the separate [Plugin list](../ui-settings-plugin-inventory/README.md).

Remote failures produce local generic copy and a retry action. The registration uses `ctx.slots.inject()`, so late declaration, redeclaration, locale changes, and plugin teardown add or remove the tab without importing the Plugins section owner.

## Model Experience

None, as the package displays a Host-owned deployment snapshot in browser Settings and registers no model-facing input or Tool.

#### KV Cache effect

None; the package assembles no provider request.

## Known Limitations and Deferred Work

- Refresh reads a point-in-time snapshot; lifecycle history persists in the Host collector between refreshes.
- The current UI renders the Host plane. Client Loader and UI-slot health remain a later implementation slice.
- Dispatch counts, per-listener execution, CPU, and memory have no zero-intrusion source in this package.
- Snapshot comparison, sorting controls, a dependency graph visualization, and redacted JSON export remain later presentation slices.

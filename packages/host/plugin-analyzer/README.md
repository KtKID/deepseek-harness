# @deepseek-ai/dsh-host-plugin-analyzer

English | [中文](README.zh.md)

Read-only Host behavior profiles for enabled Cordis Loader plugins. The gateway joins Loader identity from [`pluginInventory/list`](../plugin-inventory/README.md) with public registry, Fiber, effect, injection, and reflection diagnostics, then exposes the result through direct Remote method `pluginAnalyzer/snapshot`.

Each entry profile contains its root and child Fiber phases, recursive effect labels, listener event names, provided service names, declared dependencies, exact resolved providers, missing dependencies, and direct/transitive dependent entry ids. Runtime Fibers without a recognized non-group Loader owner remain in `runtimeOnlyFibers`. The gateway derives diagnoses for a missing root Fiber, failed Fiber, missing dependency, and a same-named implementation in another isolation location.

The collector subscribes to Cordis lifecycle events through its own Fiber and retains a process-local sequence suffix. `historyLimit` bounds record count and `historyWindowMs` bounds age; both fields are validated configuration. `observedSince` marks the collector's time origin, and existing Fibers use that origin until their next observed phase change.

The snapshot contains public names and structural relationships. It omits service values, plugin config, event payloads, Error objects, stacks, prompts, Tool arguments, credentials, and session content. Framework-owned diagnostic labels are canonicalized, arbitrary custom effect text becomes `custom effect`, and path-like tokens become `[redacted]`. Snapshot generation never invokes an inspected service. Unloading the gateway removes its listeners and retained history while every inspected registration stays unchanged.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `historyLimit` | `1000` | Maximum lifecycle records retained across Host Fibers |
| `historyWindowMs` | `3600000` | Maximum retained record age in milliseconds |

## Model Experience

None, as this package exposes developer diagnostics through a Host Remote and registers no model-facing input or Tool.

#### KV Cache effect

None; the collector assembles no provider request.

## Known Limitations and Deferred Work

- Activity reports registered listener names and the explicit source `registrations-only`; dispatch frequency and timing await a dedicated Dispatch Inspector provider.
- Lifecycle history begins when the collector mounts and clears with collector or process teardown.
- Public Cordis diagnostics currently expose a failed phase without a safe public error record, so diagnoses carry the failed Fiber identity only.
- Client Loader and UI-slot observations, snapshot comparison, and JSON export remain later slices of the Plugin Analyzer proposal.
- Each snapshot walks the current Loader entries, live Fibers, recursive effects, and reflected service implementations.

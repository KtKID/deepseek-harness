# Agent Note: Plugin Analyzer behavior profiles and installable composition

Status: implemented

English | [中文](2026-08-17-plugin-analyzer-behavior-observability.zh.md)

## Problem

The Web Plugin list reports Loader identity, enablement, and the root Fiber phase. A root phase alone cannot explain what an enabled plugin contributes, which declared services it resolves, which entries depend on it, or whether its lifecycle recently failed or reloaded. Developers need those facts attributed to configured Loader entries without invoking inspected services or changing inspected registrations.

The feature must also install and unload as one market package. Wiring its Host row, Client row, or generated Remote contribution into the shipped Web application would make the feature part of the default profile and couple an external release to the core application assembly.

## Decision

Plugin Analyzer ships as the opt-in `@deepseek-ai/dsh-plugin-analyzer` bundle. Its `dsh.bundle.patch` inserts `@deepseek-ai/dsh-host-plugin-analyzer` as `plugin-analyzer` and `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer` as `ui-settings-plugin-analyzer`. The shipped `dsh-web-app` bundle contains neither row. Installing or removing the published registry or tarball bundle owns the complete feature through the profile's ordered bundle list.

The Host package owns observation, redaction, bounded process-local lifecycle history, diagnosis derivation, and the direct `pluginAnalyzer/snapshot` Typert Remote. The Client package owns the generated Remote mount, `settings.plugins.tab` entry `analyzer`, localization, diagnosis presentation, and teardown. The shared `dsh-api-remotes` package supplies `ctx.remote.$mount()` and its application-owned contributions; Plugin Analyzer imports and mounts its own generated contribution so its namespace lifetime follows the installed Client plugin.

### Runtime attribution

The Host collector retains `pluginInventory/list` as the authority for non-group Loader entry identity, module name, enablement, and root phase. It attributes every live Fiber to the Loader entry returned by `ctx.loader.locate(fiber)`, groups the owned Fiber subtree under that `entryId`, and lists Fibers without a recognized Loader owner under `runtimeOnlyFibers`.

Profiles include recursive effect counts and normalized labels, listener event names, provided service names, declared dependencies, resolved provider Fibers, missing dependencies, isolation candidates, and direct or transitive dependent entry ids. Diagnoses cover a missing root Fiber, failed Fiber, missing dependency, and a same-named implementation in another isolation location. Activity explicitly reports `registrations-only`; listener registration remains distinct from dispatch execution.

### Lifecycle and data limits

The collector subscribes to public `internal/plugin` and `internal/status` events through its own Fiber. `historyLimit` and `historyWindowMs` bound the retained contiguous sequence suffix, while `observedSince` states the observation origin. Unloading the collector removes its listeners and history and leaves inspected Fibers, effects, services, and listeners unchanged.

Snapshots contain public structural names and relationships. They exclude plugin configuration, service values, event payloads, prompts, Tool arguments, credentials, and session content. A `fiber-failed` diagnosis includes the stored throw as inspectable text (`Error.name` and `Error.message`, or `String` for a non-Error throw) and omits the stack. Framework labels are canonicalized, arbitrary custom effect text becomes `custom effect`, path-like tokens become `[redacted]`, and snapshot generation never calls an inspected service.

### Client presentation

The Client plugin mounts the generated Host contribution before registering the tab. The tab reads a point-in-time snapshot on first mount and explicit refresh, preserves enabled Loader order, and shows summary, contribution, dependency, diagnosis, and lifecycle facts. Local search filters rows by display name, full module name, or Loader entry id while the summary continues to describe the complete snapshot. Remote failures produce local generic copy and retry. Cordis effect ownership removes the Remote namespace, locale dictionary, and slot contribution during unload or HMR replacement.

The current implementation renders Host observations. Client Loader attribution, slot renderer health, per-listener dispatch execution, CPU, memory, sorting, dependency-graph visualization, snapshot comparison, and redacted JSON export remain outside the shipped feature.

### Publication and verification

Registry and tarball releases contain prebuilt `lib/` artifacts for the public bundle and both implementation packages. The bundle lists each patch-row package as a direct dependency, so a normal registry installation can hoist their manifests into the profile root for Loader and Client discovery. A local `link:` bundle keeps its dependencies outside that root, so monorepo Web previews add the Host and Client checkouts as plain profile dependencies. Git source installation additionally requires a self-contained `prepare` build and explicit pnpm `allowBuilds` permission; this monorepo package targets the prebuilt registry path. Clean registry installation remains a release gate until all three packages are published.

Unit and invariant coverage pins Fiber attribution, dependency facts, diagnoses, redaction, history bounds, unchanged inspected registrations, UI states, generated Remote mount, and teardown. The Web browser scenario applies the Plugin Analyzer bundle patch explicitly over the shipped base and Web layers, proving the feature remains opt-in while exercising the real Loader, Remote, and Settings path.

## Alternatives considered

**Mount Plugin Analyzer from `dsh-web-app`.** This makes every Web profile activate the feature and keeps installed-package removal from owning the whole lifetime. A separate bundle layer gives installation, configuration override, and removal one profile-level owner.

**Mount the generated contribution from `dsh-api-remotes`.** The shared assembly would need a build-time dependency on every optional market plugin. Client-owned mounting preserves the stable Remote service while optional packages own their namespaces.

**Expand `pluginInventory/list` into the behavior API.** Inventory owns a stateless Loader projection. Retained history, dependency derivation, redaction, and diagnoses have separate state and lifecycle, so the Analyzer Host package consumes inventory identity.

**Collapse all facts into one health score.** Availability, dependency impact, contribution size, and stability drive different actions. The UI keeps the underlying facts and diagnoses explicit.

**Require inspected plugins to publish Analyzer callbacks.** Per-plugin integration would create inconsistent metrics and lifecycle obligations. Public Cordis diagnostics provide the shipped structural facts while leaving inspected plugins unchanged.

## Consequences

- Market installation has one public bundle name and two version-compatible implementation dependencies; publishing must make all three artifacts available.
- The default Web profile remains smaller and gains the Settings tab only after explicit bundle installation.
- Host history begins when the collector mounts and clears on collector or process teardown; initial active Fibers have no earlier transition history.
- Refresh cost grows with current Loader entries, live Fibers, effects, and reflected service implementations.
- Structural diagnostics support zero-intrusion attribution; dispatch frequency and resource consumption require dedicated instrumentation with separate data and overhead decisions.

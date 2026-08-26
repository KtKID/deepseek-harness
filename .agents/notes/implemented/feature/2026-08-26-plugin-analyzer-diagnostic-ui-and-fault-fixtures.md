# Agent Note: Plugin Analyzer diagnostic-first UI and fault fixtures

Status: implemented

English | [中文](2026-08-26-plugin-analyzer-diagnostic-ui-and-fault-fixtures.zh.md)

## Problem

Plugin Analyzer gave every enabled Loader entry equal visual weight and led with Fiber phases, effect counts, listener event names, and service relationships. Developers had to interpret those framework facts before identifying the plugins requiring attention, the observed cause, the affected dependents, and a safe repair action.

The Host collector already derived `missing-root`, `missing-dependency`, `isolation-mismatch`, and `fiber-failed`. Package tests pinned those Cordis states, and the assembled Web scenario covered a healthy profile. The human-facing path needed assembled evidence that defective Loader entries produce understandable diagnoses and that repairing a runtime cause clears its diagnosis.

The implemented [Plugin Analyzer behavior profiles](2026-08-17-plugin-analyzer-behavior-observability.md) remain authoritative for Host facts, redaction, zero-intrusion observation, bundle ownership, and `registrations-only` activity semantics. This decision owns Client presentation and assembled fault evidence.

## Decision

Plugin Analyzer uses a diagnosis-first Settings surface and deterministic Web-test Cordis plugins covering every shipped diagnosis kind. Conclusions and supporting evidence precede framework details, and the collapsed technical-evidence section retains the complete redacted snapshot.

### Diagnostic-first presentation

When any enabled entry carries a diagnosis, the tab opens on **Needs attention**. **All plugins** retains the complete enabled inventory in Loader order. Local search applies within the selected view, while summary totals continue to describe the complete snapshot.

Each diagnosed card presents one primary conclusion, its observed reason, direct and transitive impact counts, observation time, and a safe next action. Module name, Loader entry id, and current status provide identity and current runtime state. Healthy cards state that the current snapshot records no diagnosis.

Primary diagnosis order is `fiber-failed`, `isolation-mismatch`, `missing-dependency`, then `missing-root`. This order favors the failed lifecycle fact and the more specific isolation explanation. Technical evidence retains every exact diagnosis, including the related `missing-dependency` and `isolation-mismatch` findings on one entry.

The collapsed **Technical evidence** section contains Fiber lists and phases, effect labels, listener event names, provided services, provider references, dependency status, affected entry ids, lifecycle history, and the `registrations-only` activity label. Text and icons accompany semantic color for error, warning, healthy, and informational states.

### Fault fixtures

`apps/web/tests/plugin-analyzer-fixtures/` owns four test-only Loader plugins with stable entry names:

- `test-analyze-missing-dependency` injects `testAnalyzeMailer` while its visible isolation location initially has no provider.
- `test-analyze-isolation-mismatch` injects `testAnalyzeIsolatedService` while a same-named provider lives in another isolation location; the Host reports both the missing dependency and the isolation mismatch.
- `test-analyze-fiber-failed` creates a child Fiber with a deterministic startup failure whose private message stays outside the snapshot.
- `test-analyze-missing-root` retains an enabled Loader entry after the scenario disposes its root Fiber.

The fixture package sits under `apps/web/tests`, outside workspace publication and shipped profile manifests. Its patch composes only in the dedicated scenario. A bundle test scans the shipped analyzer patch, Web patch, and analyzer package files for fixture entry names and the fixture package name.

The missing-dependency repair step registers `testAnalyzeMailer` through a scenario-owned Loader builtin in the consumer's visible isolation location. Refresh then moves the consumer from pending with a diagnosis to active with an empty diagnosis list.

### Verification

Host package tests pin diagnosis derivation, provider attribution, redaction, lifecycle bounds, and unchanged inspected registrations. Client component tests pin default view selection, localized statements, primary-diagnosis order, complete technical evidence, search, stable summary totals, refresh, loading, failure, empty, healthy, and cleanup behavior.

`apps/web/tests/plugin-analyzer-diagnostics.e2e.ts` boots the shipped base and Web bundles, the opt-in Plugin Analyzer bundle, and the test-only fault overlay. The real Cordis Loader produces all four defective entries, the Host snapshot carries the exact diagnoses, the browser renders their Chinese conclusions, and the repair step clears the missing-dependency entry. Its golden captures the diagnostic summary and expanded technical evidence; computed-style assertions cover desktop and 640-pixel layouts.

The existing `settings-chrome.e2e.ts` scenario retains the healthy assembled path. Its golden normalizes the random Loader parent id while preserving the analyzer entry id and all user-visible facts.

### Ownership and scope

The Client package owns diagnosis grouping, localized wording, selected view, search, and disclosure state. The Host package owns runtime facts and diagnosis kinds. The Web test suite owns assembled fault fixtures and their repair providers.

Dispatch instrumentation, CPU and memory sampling, private error exposure, durable history, configuration mutation, and automatic remediation remain outside this feature. Disabled entry inventory remains in the separate Plugin list.

## Alternatives considered

**Parameter-first rows with tooltips.** Tooltips explain individual terms. Diagnosis-first grouping gives the page one operational focus and keeps every parameter in technical evidence.

**Client object fixtures alone.** Client fixtures efficiently pin rendering states. The assembled browser scenario additionally proves Loader ownership, Host collection, Remote transport, Client rendering, refresh, and diagnosis removal.

**Published fault plugins.** Test-owned Loader entries exercise real runtime behavior. Production bundles and Market discovery remain limited to user-facing packages.

**One health score.** Explicit service, Fiber, isolation, and impact facts connect each finding to a distinct repair action.

## Consequences

Developers land on the diagnosed subset, read an actionable explanation, and can open full redacted evidence in place. The complete inventory and stable totals remain one tab away. Related diagnoses stay available for expert investigation while a single primary explanation controls the initial reading order.

The fault overlay adds a deterministic assembled regression lane with zero model, network, credential, filesystem, clock-race, or platform-specific dependency. Its stable names and bundle absence assertion keep test composition separate from shipped composition.

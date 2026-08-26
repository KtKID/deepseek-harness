# Plugin Analyzer Search and v0.2

English | [中文](README.zh.md)

> Created: 2026-08-20 00:17:32 +0800
> Type: x-qdev
> Risk level: Q1
> Review route: primary-agent evidence closure

## Original request

Add search to Plugin Analyzer and upgrade its version to v0.2.

## Goals and scope

- Goal: provide a “Search plugins” input in the Plugin Analyzer settings tab that immediately filters the current snapshot by display name, full module name, or Loader entry ID.
- Goal: keep the Host, Client, and installable composition bundle versions aligned at `0.2.0`.
- Out of scope: Host collection, Remote data, diagnosis rules, list ordering, plugin runtime state, and Web profile composition remain unchanged.
- Allowed changes: the Plugin Analyzer Client component, styles, localization, tests, and package documentation; real Web settings e2e and snapshot coverage; the three published package manifests; the owning Agent Note; and this task documentation.
- Protected areas: the existing uncommitted Plugin Doctor bundle, generated directories, running Web service, and `vendor/`.

## Current behavior

- `PluginAnalyzerSettingsTab` reads `pluginAnalyzer/snapshot` once on initial mount or refresh, and `diagnose()` produces display rows in Host snapshot order.
- Display rows already contain `displayName`, `moduleName`, and `entryId`, so the Client can derive search results locally without extending the Remote or Host API.
- Expanded details use `entryId` as their identity. Filtering an expanded row out must also close its details to avoid retaining an invisible selection.
- The three related published packages currently use `0.1.0-rc.5`, while the composition bundle depends on the Host and Client through `workspace:^`.
- The worktree baseline includes existing user changes to the Plugin Doctor bundle and generated documentation. This task preserves those semantic groups.

## Invariants

- The existing component lifecycle owns the Host snapshot and Remote call count. Typing a search query does not issue another Remote request. Evidence: the component test keeps the mock call count unchanged.
- The summary continues to describe the complete snapshot, while search filters only the list. Evidence: the summary counts stay unchanged after filtering.
- An empty query preserves Host order. A non-empty query preserves the relative order of matching rows. Evidence: the component test checks the filtered results.
- The three published package versions stay aligned. Evidence: the manifest version assertion.

## Development checklist

| Status | Item | Definition of done | Initial failing test |
|---|---|---|---|
| ✅ | Search interaction | The input matches the screenshot semantics; matching is case-insensitive and trims surrounding whitespace; all three identifiers are searchable; a dedicated empty state appears when nothing matches; filtering out an expanded row closes its details | The initial component run could not find the `Search plugins` searchbox; the focused package run now passes 21 tests |
| ✅ | v0.2 published versions | The Host, Client, and bundle manifests all use `0.2.0`; the Client README and owning Agent Note describe the delivered search behavior | The initial manifest assertion printed `0.1.0-rc.5` three times; the final assertion prints `0.2.0` three times |

## Definition of done and evidence

| Definition of done | Evidence plan | Final evidence |
|---|---|---|
| Search interaction | Run the focused component test red, then green; run the GUI tests covering the Client change | Focused packages: 21 passed; Client and Host GUI scope: 3,777 passed, 1 skipped |
| v0.2 published versions | Run the manifest assertion and observe the old values; upgrade and rerun it; synchronize both documentation languages | Three manifests report `0.2.0`; translation pairing and `doc-sync` pass |
| Visible UI assembly | Run the keyless Web replay test | Snapshot refresh and replay each pass 8 tests |
| Change boundary | Inspect the task-path diff, run `git diff --check`, and verify that `vendor/` is unchanged | Task diff inspected; `git diff --check` passes; `git diff --name-only -- vendor/` is empty |

## Risk assessment

The change stays within one existing Client settings tab and three related manifests. Existing component tests and Web replay cover the user-visible path. Search derives rows from the current snapshot and adds no API, persistence, permission, concurrency, or cross-module state changes, so the task remains Q1.

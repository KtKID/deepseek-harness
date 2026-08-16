# Plugin Doctor MVP

English | [中文](README.zh.md)

## Original request

> 你开始实现这个插件，注意插件都是独立目录，不要污染整个框架

## Goal and scope

Add the independent `@deepseek-ai/dsh-client-ui-settings-plugin-doctor` browser plugin. It reuses `pluginInventory/list` for the current Loader snapshot, diagnoses enabled plugins only, and renders runtime status, summary, failure, and explicit refresh states in the existing Plugins Settings section.

Implementation, tests, styles, dictionaries, README, and invariant belong to `packages/client/ui-settings-plugin-doctor/`. Shared composition adds only the `tsconfig.client.json` project reference, the `packages/bundle/web-app/package.json` dependency, and the `packages/bundle/web-app/cordis.patch.yml` Loader row. Existing Cordis, Host inventory, API remotes, Plugin list, and Settings section logic remain unchanged.

## Current system

- Host `pluginInventory/list` already returns `entryId`, `moduleName`, `enabled`, and root Fiber `fiberPhase` from `ctx.loader.entries()`.
- `settings.plugins.tab` accepts independent browser-plugin pages and uses `ctx.slots.inject()` to follow declarer reload and plugin teardown.
- The existing `fiberPhase` values are `pending | loading | active | failed | unloading | null`, which supply the MVP status facts.

## Invariants

- Diagnosis contains only Loader entries whose `enabled` field is `true`.
- Status mapping is fixed: `active → running`, `pending → pending`, `loading → starting`, `failed → failed`, `unloading → stopping`, and `null → not-mounted`.
- `entryId` remains the row identity; the display name derives only from `moduleName`.
- Remote errors render generic product copy; transport details stay outside the UI.
- Plugin teardown removes its dictionary and `settings.plugins.tab` contribution.

## Implementation path

1. Use the pure `diagnose(snapshot)` function for filtering, status mapping, and summary counts.
2. Call the injected `list()` on first component mount and explicit refresh, then render summary cards and enabled-plugin rows.
3. Register the `doctor` tab from the browser entry and reuse `ctx.remote.pluginInventory.list()`.
4. Compose the independent package through the Web bundle declaration surfaces and provide package docs, an invariant companion, and a product snapshot.

## Tests

- Pure-function tests cover all six Fiber phases, disabled-entry omission, order/identity, and counts.
- Component tests cover loading, success, empty, generic failure, retry/refresh, and asynchronous completion after unmount.
- Browser-plugin tests cover slot registration/disposal, localization, lazy Remote access, and declarer reload.
- Web composition and keyless browser snapshot tests cover the real Loader → Remote → Plugin Doctor display flow.

## Risk

Q1. The implementation follows the existing inventory-tab pattern, adds one package and three declarative runtime composition entries, and introduces no protocol, Host service, Cordis hook, or durable format.

## Definition of Done

- [x] DoD 1: The independent package skeleton, bundle composition, and package invariant are complete; existing implementation files remain independent.
- [x] DoD 2: `diagnose(snapshot)` outputs enabled plugins only, with tests for all six mappings and enabled/running/non-running counts.
- [x] DoD 3: The Doctor tab supports lazy acquisition, processing, display, generic failure, explicit refresh, and teardown cleanup with component and slot lifecycle tests.
- [x] DoD 4: Bilingual README, Client directory index, implemented Agent Note, real Web composition, browser snapshot, and relevant quality gates are synchronized.

## Execution checklist

- [x] Record the pre-implementation `git status --short --untracked-files=all` and `git diff --name-only`.
- [x] Add focused tests first and record the expected red result.
- [x] Implement the independent plugin package.
- [x] Change only the three shared runtime composition declarations.
- [x] Run focused tests, GUI tests, Web replay, type checks, lint, documentation gates, and diff checks.
- [x] Write `dev-report.md` with evidence for each DoD and remaining risks.

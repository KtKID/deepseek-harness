# Plugin Doctor MVP Development Report

English | [中文](dev-report.zh.md)

## Result

The independent `@deepseek-ai/dsh-client-ui-settings-plugin-doctor` package now provides an enabled-only runtime diagnosis in Web Settings → Plugins → Plugin Doctor. It acquires the current Loader snapshot through the existing `pluginInventory/list` Remote, derives status and summary fields locally, and renders the result with refresh, retry, empty, and row-detail states.

## Ownership and data flow

Implementation, tests, styles, dictionaries, README, and the invariant companion live under `packages/client/ui-settings-plugin-doctor/`. Runtime composition uses the three required shared declarations: `tsconfig.client.json`, the Web bundle dependency, and the Web bundle Loader row. Generated catalogs, directory indexes, the lockfile, Web composition coverage, and the Agent Note record the new package under the repository's existing project rules.

```text
ctx.loader.entries()
  -> pluginInventory/list
  -> api-remotes
  -> diagnose(snapshot)
  -> settings.plugins.tab / doctor
```

`diagnose(snapshot)` keeps `enabled === true` entries in Loader order and maps `active`, `pending`, `loading`, `failed`, `unloading`, and `null` to `running`, `pending`, `starting`, `failed`, `stopping`, and `not-mounted`. The UI shows enabled, running, and non-running totals; each expanded row exposes the exact Loader `entryId` and raw Cordis phase.

## TDD evidence

The first focused run used `pnpm exec vitest run packages/client/ui-settings-plugin-doctor/tests` before source creation. Vitest reported four failed suites because the referenced source modules were absent, which established the expected red state. After implementation, the same command passed four files and ten tests.

Targeted coverage used `pnpm exec vitest run --coverage --coverage.include='packages/client/ui-settings-plugin-doctor/src/**/*.{ts,tsx}' packages/client/ui-settings-plugin-doctor/tests`. Statements, branches, functions, and lines each reached 100%.

## Definition of Done evidence

| DoD | Evidence |
|---|---|
| 1 | The new package owns both entrypoints, UI, diagnosis, localization, tests, styles, documentation, and its package invariant. The existing Cordis and Host implementations retain their baseline content. |
| 2 | Pure diagnosis tests cover disabled-entry omission, Loader order, identity, all six phase mappings, and enabled/running/non-running totals. |
| 3 | Component and browser-plugin tests cover initial loading, success, empty state, generic failure, retry, refresh, row details, completion after unmount, slot declaration reload, locale changes, and disposal. |
| 4 | The Web bundle loads the package in the real Settings scaffold; replay verifies Loader counts, the exact module name, expansion details, and the keyless product snapshot. Bilingual package, directory, bundle, Agent Note, and task documents are paired. |

## Verification

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/client/ui-settings-plugin-doctor/tests` | 4 files passed; 10 tests passed. |
| Targeted Vitest coverage command above | 100% statements, branches, functions, and lines. |
| `pnpm run test:gui` | 276 files passed; 3,767 tests passed; 1 test skipped. |
| `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 8 tests passed and the Plugin Doctor golden was recorded. |
| `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 8 tests passed against the recorded golden. |
| `pnpm exec tsc -b tsconfig.client.json --pretty false` | Passed. |
| `pnpm run build` | Passed, including the Web refresh step. |
| `pnpm run lint` | Passed. |
| `pnpm run doc-sync` | 28 of 28 documentation gates passed. |
| `git diff --check` | Passed. |

## Remaining limits

- Each result is a point-in-time snapshot; refresh obtains the next snapshot and no history is retained.
- `not-mounted` means the enabled Loader entry has no live root Fiber. The current Remote response cannot distinguish import failure, rollback, or another lifecycle cause.
- Packages present on disk without a Loader entry have no identity or lifecycle state in the running process and remain outside the result.

The original Cordis Dispatch Inspector proposal remains a separate, unchanged specification for future dispatch timing and hook-order diagnostics.

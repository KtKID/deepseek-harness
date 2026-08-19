# Plugin Analyzer market-release development report

English | [中文](dev-report.zh.md)

## Result

Plugin Analyzer now ships as the public bundle `@deepseek-ai/dsh-plugin-analyzer`. The bundle owns the installable patch layer and directly depends on the Host implementation `@deepseek-ai/dsh-host-plugin-analyzer` and Client implementation `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer`.

The repository composition keeps Plugin Analyzer opt-in. Installing the bundle adds one Host Loader row and one Client Loader row; removing it withdraws the Settings tab, Host listeners, generated Remote namespace, and profile bundle entry.

## Package ownership

| Package | Directory | Published role |
|---|---|---|
| `@deepseek-ai/dsh-plugin-analyzer` | `packages/bundle/plugin-analyzer/` | Public install target; owns `dsh.bundle.patch` and `cordis.patch.yml`. |
| `@deepseek-ai/dsh-host-plugin-analyzer` | `packages/host/plugin-analyzer/` | Host data collection, bounded history, Remote service, configuration, and lifecycle cleanup. |
| `@deepseek-ai/dsh-client-ui-settings-plugin-analyzer` | `packages/client/ui-settings-plugin-analyzer/` | Settings UI, generated Remote contribution, localization, and teardown. |

The publish order is Host, Client, then bundle. All three packages use version `0.1.0-rc.5`, and the packed bundle resolves its workspace dependencies to compatible registry ranges.

## Errors found and corrected

| Finding | Cause and consequence | Correction and current state |
|---|---|---|
| The original public surface was the Host leaf at `packages/host/plugin-analyze`. | A Host implementation package had no bundle manifest or profile patch, so the CLI and Market lacked a complete installable composition. | Added `packages/bundle/plugin-analyzer` with public metadata, exports, files, license, patch declaration, and direct dependencies for every patched package. |
| Active identifiers retained `plugin-analyze`, `pluginAnalyze`, and `PluginAnalyze`. | The product rename covered only part of the directory, npm package, service, component, snapshot, documentation, and task surfaces. | Renamed active identifiers to `plugin-analyzer`, `pluginAnalyzer`, and `PluginAnalyzer`; searches retain old identifiers only in the explicit rename checklist and historical evidence. |
| `dsh-web-app` and `dsh-api-remotes` assembled Plugin Analyzer by default. | The implementation entered every Web profile before users installed the public bundle. Uninstall could not remove the full feature. | Removed Analyzer rows and dependencies from the built-in assemblies. The opt-in bundle now owns both Loader rows and the Client package owns the generated Remote contribution. |
| The Client mounted and consumed the generated Remote namespace in one Fiber. | Cordis inject resolution could not observe the namespace contribution at the required child scope, and the real Web Settings path rendered a generic failure. | Split mounting and UI consumption into parent and child Fibers. Teardown disposes the UI child before withdrawing the Remote contribution; the real Web replay passes. |
| Generated module ownership matched packages by short directory name. | Both Host and bundle packages use the `plugin-analyzer` directory leaf, so the Host module graph linked to the public bundle. | The graph generator now resolves ownership from each package's npm name; a regression test covers equal leaf names across package groups. |
| Workspace gates lacked bundle-specific registrations. | The new `cordis.patch.yml` was absent from package-file extras, and patch-only direct dependencies appeared unused to Knip. | Registered the patch file in workspace constraints and scoped the two patch-only dependencies in Knip. Analyzer-focused constraints, Knip, package invariants, and built-package gates pass. |
| The task development report still described the earlier built-in Client MVP. | The document predated independent packaging and the final Analyzer name. | Replaced the task and report with the current bundle topology, release checklist, verification evidence, and external blockers. |

## Verification evidence

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/host/plugin-analyzer/tests packages/client/ui-settings-plugin-analyzer/tests packages/bundle/plugin-analyzer/tests scripts/gen-doc-graphs.spec.ts` | 8 files passed; 24 tests passed. |
| `pnpm run test:gui` | 278 files passed; 3,776 tests passed; 1 test skipped. |
| `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/settings-chrome.e2e.ts` | 1 file passed; 8 tests passed with the opt-in Analyzer layer. |
| `pnpm run build:lib:host`, `pnpm run build:lib:client`, and `pnpm run build:web` | Passed. |
| `pnpm run typecheck` | Passed. |
| `pnpm run lint` | Passed after removing source-plane compiler residue created by a failed diagnostic build. |
| Analyzer-focused package README, path, invariant, config, constraint, catalog, module-graph, NodeNext, runtime-closure, vendored-link, Publint, and Knip gates | Passed. |
| `pnpm run doc-sync` | 28 documentation gates passed; 0 failed and 0 skipped. |
| `node packages/bundle/plugin-doctor/lib/bin.js packages/bundle/plugin-analyzer` | All static checks passed; the expected built-tarball source-install warning and disabled optional supply-chain scanner warning remain. |

## Package evidence

`pnpm pack` produced three isolated archives. The Host archive contains 17 files, the Client archive contains 14 files, and the public bundle archive contains 10 files. Their file lists contain built `lib/` artifacts and exclude `src/`, JavaScript source maps, and declaration maps.

A source-checkout CLI smoke installed the bundle into an isolated profile, and `--dump-config` showed the bundle plus its two patch rows with validated Host defaults. CLI removal restored the profile to its base bundle set.

A real local Web preview passed after the Host and Client checkouts were added as plain profile dependencies alongside the linked bundle. pnpm keeps dependencies of a `link:` target outside the profile root; the Client module scanner resolves package manifests from that root. The rendered page reported 134 enabled plugins, 134 running plugins, zero concerns, zero missing dependencies, and zero browser-console errors.

An external packed-artifact install remains a release gate. The registry currently lacks the unpublished Host and Client Analyzer packages, and the restricted network run could not resolve registry metadata. This gate becomes executable after publishing the implementation packages.

## Remaining release blockers

- Confirm npm publish permission for the `@deepseek-ai` scope and reserve all three package names.
- Publish Host and Client `0.1.0-rc.5`, then publish the bundle at the same compatible version.
- Install only the bundle from the registry in a clean temporary profile, confirm that its transitive Host and Client packages resolve from the profile root, inspect `--dump-config`, boot the Web profile, run full Plugin Doctor, and verify removal.
- Complete the current Market form with package, license, repository, permissions, data-use, screenshot, support, and verification fields.
- Clear the repository-wide `hygiene` baseline separately: `rescope-vendor:check` currently reports 26 existing Cordis runner/UI/document residues, and full Knip reports the separate Plugin Doctor `dsh-poison-guard` binary registration. Analyzer-scoped gates pass.

Publish the Host and Client packages first, then publish and validate the public bundle from a clean registry install.

# Plugin Analyzer market release

English | [中文](README.zh.md)

## Goal

Publish Plugin Analyzer as an opt-in installable bundle accepted by the DeepSeek Harness plugin workflow. Installation through `dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer` must add one bundle layer, activate the Host collector and Client Settings contribution, and leave the shipped Web profile unchanged until installation.

The repository's [plugin packaging tutorial](../../../docs/user/develop/basic/publish.md), [CLI reference](../../../apps/cli/reference/README.md#plugin-management), [bundle package rules](../../../packages/bundle/README.md), and [package rules](../../../packages/AGENTS.md) define the acceptance criteria. External market form fields and publisher-account review remain release operations outside this source task.

## Package ownership

- `packages/bundle/plugin-analyzer/` owns the public install target, `dsh.bundle.patch`, patch rows, and transitive runtime dependencies.
- `packages/host/plugin-analyzer/` owns Host observation, validated history configuration, the `pluginAnalyzer/snapshot` Remote, and its invariant.
- `packages/client/ui-settings-plugin-analyzer/` owns the generated Remote mount, Plugin Analyzer tab, localization, presentation, and its invariant.
- `packages/bundle/web-app/` and `packages/api/remotes/` provide only the stable extension services consumed by installed plugins; they carry no Plugin Analyzer row or generated contribution.

## Implementation checklist

- [x] Rename every current product identifier from `plugin-analyze` / `pluginAnalyze` / `PluginAnalyze` to `plugin-analyzer` / `pluginAnalyzer` / `PluginAnalyzer`; retain Plugin Doctor identifiers for the separate static-check product and retain old names only in explicit historical reports.
- [x] Add `@deepseek-ai/dsh-plugin-analyzer` with public package metadata, `files`, `exports`, license, `dsh.bundle.patch`, and direct dependencies for every package named by its patch.
- [x] Insert unique `plugin-analyzer` and `ui-settings-plugin-analyzer` rows through the bundle patch with validated Host defaults.
- [x] Mount the generated Host Remote contribution from the installed Client plugin, with teardown that withdraws the `remote.pluginAnalyzer` namespace.
- [x] Remove Plugin Analyzer dependencies and rows from `dsh-web-app`, and remove its generated contribution from the shared `dsh-api-remotes` assembly.
- [x] Keep each implementation package in one compiler aggregate, update workspace paths/references, and regenerate package indexes, config catalogs, module graphs, event ownership tables, and Client slot catalogs from their owners.
- [x] Update bilingual package READMEs and implemented Agent Notes so names, ownership, configuration, security exclusions, lifecycle history, installation, and removal match the shipped composition.
- [x] Add unit, invariant, HMR teardown, bundle-manifest, patch-dependency, and real Web Loader composition coverage; the real composition must apply the opt-in bundle layer explicitly.
- [ ] Build all published entry points, create an isolated `pnpm pack`, inspect tarball contents, install the tarball into a temporary Web profile, verify `--dump-config`, boot the profile, and remove the package.
- [ ] Run focused tests, typecheck, lint, `hygiene`, `doc-sync`, `git diff --check`, and Plugin Doctor against the packed bundle; record only commands actually run.

## Release checklist

- [ ] Confirm permission to publish under the `@deepseek-ai` npm scope and reserve `@deepseek-ai/dsh-plugin-analyzer`; use the publisher's own scope when that permission is absent.
- [ ] Publish the Host, Client, and bundle packages at compatible versions with their `lib/` artifacts included; registry and tarball installs require no install-time build permission.
- [ ] Verify clean-machine installation with `dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer`, then confirm the bundle appears in `dsh.profile.bundles` and both patch rows appear in `dsh --profile web --dump-config`.
- [ ] Verify uninstall with `dsh plugin --profile web remove @deepseek-ai/dsh-plugin-analyzer`, then confirm the bundle layer, Settings tab, Host listeners, Remote namespace, and package dependency are absent.
- [ ] Submit the packed artifact, package name, version, repository, license, README, permissions/data-use statement, screenshots, verification evidence, and support contact required by the current market form.

## Definition of done

- [x] The public install target passes static manifest, patch, dependency, entry, and files checks.
- [ ] The packed bundle passes Plugin Doctor with the optional supply-chain scanner enabled.
- [ ] A clean profile gains Plugin Analyzer from the registry-installed public bundle alone and loses the complete feature after bundle removal.
- [x] Searches over active source and current documentation find no obsolete Plugin Analyze identifiers outside approved historical evidence.
- [ ] The packed artifact installs and boots from a temporary profile with no monorepo workspace resolution.
- [x] Every source, documentation, generated-artifact, test, and release gate above has recorded evidence or an explicit release blocker.

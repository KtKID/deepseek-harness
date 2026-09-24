# Agent Note: Plugin Doctor first-party bundle migration

Status: implemented

English | [中文](2026-08-19-plugin-doctor-bundle.zh.md)

## Problem

[`zoahdev/dsh-plugin-doctor`](https://github.com/zoahdev/dsh-plugin-doctor) was an out-of-tree installable bundle. Keeping its source at the repository root leaves it outside the `packages/<group>/<package>` workspace, package naming, build, invariant, documentation, and snapshot gates. Its model-facing `plugin_check` implementation could also launch build, pack, and profile-install commands directly from `execute()`, without the harness approval waterfall or the configured shell sandbox.

## Decision

Migrate the implementation to `packages/bundle/plugin-doctor` as `@deepseek-ai/dsh-plugin-doctor`. The package remains a bundle because `cordis.patch.yml` inserts the model-facing plugin and the manifest declares `dsh.bundle.patch`. It ships three closed entries: the plugin API, its invariant companion, and the standalone `dsh-plugin-doctor` CLI. [`LICENSE.zoahdev`](../../../../packages/bundle/plugin-doctor/LICENSE.zoahdev) preserves the upstream MIT notice.

The package owns two execution paths:

- The standalone CLI runs the optional `dsh-poison-guard` only with `--supply-chain`; ordinary static checks remain process-free. Build, pack, and temporary-profile checks require their explicit CLI modes. Direct child processes use `execa` without a shell, bounded timeout/output, cancellation where available, and the shared `scrubbedParentEnv()` base.
- The model tool keeps static checks process-free. `build=true` and `full=true` return `ask` from `tools/pre-execute`; an approved call routes every command through `ctx.shell` with the calling session's resolved `ctx.sandboxPolicy`, timeout, output cap, and abort signal.

Full mode creates one private temporary home and pack directory, accepts exactly one tarball produced there, installs it under a temporary `DSH_HOME`, verifies the patch ids in the composed config, and removes the home in `finally`. A missing `prepare` script is a `source-install` warning because published tarballs can already contain their artifacts.

## Model-visible behavior

The bundle registers one `plugin_check` schema with absolute `dir` plus optional `build` and `full`. Results retain one `[PASS|WARN|FAIL]` line per check and a final success/failure line. The ACP example adds a dedicated Plugin Doctor composition and keyless snapshot header class, pinning the assembled schema without changing the default example's tool list.

## Verification

- Package tests cover static diagnostics, profile checks, environment source files, tool-call pairing, approval delegation, static process-freedom, sandboxed build routing, full-mode temporary cleanup, cancellation, CLI source launch, and invariant registration.
- The model-facing adapter and invariant companion meet the per-file 100% coverage gate. Four migrated diagnostic engines retain focused regression coverage under a named temporary coverage exclusion while their upstream branch matrix is expanded.
- The package TypeScript project builds under the workspace references.
- The keyless ACP replay snapshot boots the real alternate composition and pins `plugin_check` in the request tool schema.
- Workspace constraints, package invariant, generated tool/config catalogs, translation pairing, focused docs gates, and built publication smoke checks cover monorepo integration.

## Alternatives considered

**Keep the cloned repository at the workspace root.** That location preserves out-of-tree development but bypasses first-party workspace ownership and the package gates the migration is intended to add.

**Place the runtime under `packages/host`.** Plugin Doctor registers a model tool and an installable patch layer; it owns no Host Remote or Web transport. The bundle group names its composition role directly.

**Let the model tool spawn commands directly.** Direct spawning cannot inherit the deployment's approval and sandbox policy. The shell consumer path preserves the existing execution controls and cancellation semantics.

## Consequences

- First-party ownership now lives under `packages/bundle/plugin-doctor`; `packages/host/plugin-analyzer` retains its separate runtime-observability role.
- Static findings remain review signals. Regex checks and an optional external scanner cannot prove absence of malicious behavior.
- Full mode proves packaging and composition identity in an isolated profile. Provider API behavior and end-user workflows remain separate verification surfaces.
- `doctor.ts`, `env.ts`, `env-explain.ts`, and `session-log.ts` carry explicit temporary coverage debt in `vitest.config.ts`; their focused suites stay active, and removal of the four exclusions is tracked next to the gate.

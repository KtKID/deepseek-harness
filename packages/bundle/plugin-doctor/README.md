# `@deepseek-ai/dsh-plugin-doctor`

English | [中文](README.zh.md)

Plugin Doctor is an installable profile bundle, standalone CLI, and model-facing tool for checking DeepSeek Harness plugin bundles and materialized profiles. The package was migrated from [`zoahdev/dsh-plugin-doctor`](https://github.com/zoahdev/dsh-plugin-doctor); [`LICENSE.zoahdev`](LICENSE.zoahdev) preserves the upstream MIT notice.

The bundle patch inserts one `plugin-doctor` row. That plugin registers `plugin_check`; the CLI exposes the same static bundle checks plus profile, environment, build, pack, and fresh-profile installation diagnostics.

## Checks

Static bundle checks cover the manifest, patch YAML and inserted ids, built entry, publication allowlist, pre-execute listener side effects, shell-launcher patterns, and an optional `dsh-poison-guard` supply-chain scan. Profile checks cover duplicate real-directory `@deepseek-ai/*` packages, manifest BOMs, oversized files, unresolved entry points, missing runtime dependencies or native modules, and broken durable tool-call/result pairs.

The manifest check accepts published-tarball packages without a `prepare` script. It reports a separate `source-install` warning because direct git installation needs prebuilt artifacts when no lifecycle build is available.

## CLI

```sh
dsh-plugin-doctor /absolute/plugin/path
dsh-plugin-doctor --build /absolute/plugin/path
dsh-plugin-doctor --full /absolute/plugin/path
dsh-plugin-doctor --supply-chain /absolute/plugin/path
dsh-plugin-doctor --profile "$DSH_HOME/profiles/web" --json
dsh-plugin-doctor --env
dsh-plugin-doctor env explain DEEPSEEK_API_KEY
```

`--build` runs the target package's build script. `--full` packs the target into an isolated temporary directory, installs that tarball into a temporary profile, verifies the inserted patch ids in the composed config, and removes the temporary profile. `--supply-chain` explicitly enables the optional `dsh-poison-guard` executable; ordinary static checks remain process-free. The standalone CLI scrubs ambient credential-shaped and `DSH_*` environment variables before child-process execution; explicitly owned variables such as the temporary `DSH_HOME` are merged afterwards.

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`plugin_check` schema](../../../docs/tool-catalog.md#deepseek-aidsh-plugin-doctor) with an absolute `dir`, optional `build`, and optional `full`. Static calls inspect files directly. Calls with `build=true` or `full=true` request approval through `tools/pre-execute`; approved commands run through `ctx.shell` with the calling session's resolved sandbox policy, bounded output, timeout, and cancellation.

#### Token effect

The tool schema has a fixed input cost while visible. Results contain one bounded line per check and remain in history until compaction.

#### KV Cache effect

The schema stays prefix-stable while the plugin configuration and tool visibility remain unchanged. Plugin activation, disposal, or scoped tool restrictions may invalidate reuse from the first changed tool-definition token; results append after the reusable prefix.

### Result

#### What the model sees

Each check renders as `[PASS|WARN|FAIL] <name>: <detail>`, followed by `ALL CHECKS PASSED` or `SOME CHECKS FAILED`. The structured result also carries `ok` and the complete check array.

#### Token effect

Result cost varies with check details and executed-command failures. Command output is truncated before it enters the result, and retained results remain in history until compaction.

#### KV Cache effect

Results append after the reusable request prefix and do not invalidate earlier cache entries.

## Known Limitations and Deferred Work

- **Static security checks are heuristic** — source patterns and `dsh-poison-guard` findings identify review targets; they do not prove that a plugin is safe.
- **The model tool omits the external supply-chain executable** — its static path stays process-free; the standalone CLI invokes the optional scanner only with `--supply-chain`.
- **Full mode mutates a temporary profile only** — it verifies composition and plugin-id presence without exercising provider APIs or user workflows.

# @deepseek-ai/dsh-plugin-analyzer

English | [中文](README.zh.md)

Installable Plugin Analyzer bundle for a Web profile. Its declared `cordis.patch.yml` layer mounts the Host behavior collector and the Client Settings tab from two implementation packages owned by this bundle.

Install and remove the bundle through the profile manager:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer
dsh plugin --profile web remove @deepseek-ai/dsh-plugin-analyzer
```

Installation appends this package to the profile's `dsh.profile.bundles` list. The bundle inserts the `plugin-analyzer` and `ui-settings-plugin-analyzer` rows; removal withdraws both rows, the `pluginAnalyzer` Remote namespace, Host lifecycle listeners, Settings slot contribution, and package dependency. The shipped Web bundle carries neither row, so Plugin Analyzer remains opt-in.

The Host row defaults to `historyLimit: 1000` and `historyWindowMs: 3600000`. A later profile patch may replace the row's complete configuration. See the [Host package](../../host/plugin-analyzer/README.md) for snapshot semantics, redaction, and configuration limits, and the [Client package](../../client/ui-settings-plugin-analyzer/README.md) for the Settings behavior.

Registry and tarball releases include prebuilt `lib/` artifacts for the bundle and both implementation packages. A Git source distribution additionally needs a self-contained `prepare` build and consumer approval under pnpm's `allowBuilds`; this monorepo package targets the prebuilt registry release path.

For a local monorepo preview, add the bundle, Host, and Client checkout directories as plain profile dependencies. pnpm does not hoist dependencies from a `link:` target into the profile root, and the Client module scanner resolves package manifests from that root. A registry installation uses the published bundle dependency graph and remains a required release verification.

## Model Experience

Indirectly, through the Host and Client packages mounted by this bundle; those packages register no model-facing input or Tool.

#### KV Cache effect

None; the composed packages assemble no provider request.

## Known Limitations and Deferred Work

- The bundle requires the Web profile's API gateway, Client runtime, Settings slots, locale service, and Host plugin inventory supplied by the compatible DeepSeek Harness installation.
- Publishing under `@deepseek-ai` requires access to that registry scope; third-party publishers use a scope they control and update the package names in the bundle dependency and patch metadata together.

---
kind: upgrade-guide
description: "dsh plugin package-operation diagnostics move from the profile directory into the Harness home logs directory."
---

# Plugin operation logs

English | [中文](guide.zh.md)

## Change

`dsh plugin` previously stored package-operation diagnostics in `<profile>/.plugin-manager/logs/`. It now stores them in `$DSH_HOME/logs/plugin-manager/<profile>/`, including when the profile directory links to shared source files. Programs that collect diagnostics by directory must update their paths. The running plugin manager retains its profile-local default and accepts an absolute `logRoot` configuration field.

## Migration

1. Update log collectors for `dsh plugin` to read `$DSH_HOME/logs/plugin-manager/<profile>/`, or use the `logPath` returned by each operation.
2. To collect Web and agent installation diagnostics in the same location, configure the profile's `plugin-manager` row with `logRoot: !!js dshHomePath('logs', 'plugin-manager', '<profile>')` and restart or reload the profile.
3. Run a package operation and confirm its diagnostic path. Keep the existing profile files and `.plugin-manager/run.json` at their current location; shared-profile installation coordination uses those files.

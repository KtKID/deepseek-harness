# Agent Note: Analyzer fault plugins as a local package on the user patch layer

Status: implemented

English | [中文](2026-08-27-analyzer-fault-plugins-user-patch.zh.md)

## Problem

Plugin Analyzer diagnoses four Cordis Loader states: a missing injected service, a failed child Fiber, a same-named provider in another isolation location, and an enabled row with no living root Fiber. The assembled Web scenario owned those states as test-only overlay plugins under `apps/web/tests/plugin-analyzer-fixtures/`, with Loader builtins and a post-boot `_dispose()`. That path is not how a developer inserts a plugin into a running web profile.

Production startup (`assertEntriesActivated`) rejects enabled rows that stay pending or have no living root Fiber. A bundle or a boot-time patch that inserts those states fails `dsh web`. The remaining official composition layer that can add a row after boot is the watched profile user patch.

## Decision

`examples/analyzer-fault-plugins` is a local npm package named `dsh-analyzer-fault-plugins`. It follows the [pack and install](../../../../docs/user/develop/basic/publish.md) package layout and exports five ESM plugin modules. It does not declare `dsh.bundle`, so `dsh plugin add` installs it as a plain profile dependency and inserts no Loader row.

Each diagnosis is a real plugin (or, for isolation, a consumer plus a grouped provider). Activation is appending the matching snippet from `patches/` to `$DSH_HOME/profiles/<name>/cordis.patch.yml` while Web is running; removal is deleting that snippet. Patch rows name the package, not a relative path.

- `unread-mail` injects `unreadMailStore` with no provider.
- `nested-crash` mounts a child plugin whose `apply` throws and swallows that rejection so it is not a process-level unhandled rejection.
- `isolated-inbox` injects `isolatedInbox` outside a `cordis:group` that isolates that service around `isolated-inbox-store`.
- `self-unload` calls the Loader entry `_dispose()` after `apply` returns. `ctx.fiber.dispose()` would mark the row disabled and hide it from Plugin Analyzer.

The [Web diagnostic fixtures](../feature/2026-08-26-plugin-analyzer-diagnostic-ui-and-fault-fixtures.md) remain the e2e overlay. This package does not replace them.

## Alternatives considered

**Declare `dsh.bundle` and install with `dsh plugin add`.** Bundle layers apply at boot. Three of the four states fail `assertEntriesActivated`, so Web would not start.

**A Plugin Analyzer debug switch that `Loader.create`s fixtures.** That mutates the observed tree from the observer and is not the user patch path.

**Reuse `apps/web/tests/plugin-analyzer-fixtures/`.** Those modules depend on test-only Loader builtins and a harness `_dispose()`, and they are not an installable package.

**`ctx.fiber.dispose()` for missing-root.** The Loader self-dispose hook disables the row, so Plugin Analyzer no longer lists it as enabled.

## Consequences

- Developers install the checkout once, then toggle diagnoses by editing the profile user patch on a running Web.
- `unread-mail`, `isolated-inbox`, and `self-unload` must not be present at process start.
- Example tests pin each module through the real Loader import path; they use absolute file paths because they are not a profile.
- The package stays out of shipped Plugin Analyzer and Web bundle patches.

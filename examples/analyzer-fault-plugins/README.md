# Analyzer fault plugins

English | [中文](README.zh.md)

Four local Cordis plugins that each produce one Plugin Analyzer diagnosis. The package follows the [pack and install](../../docs/user/develop/basic/publish.md) layout (`package.json`, ESM exports, patch rows that name the package) and is **not** a bundle: it has no `dsh.bundle`, so `dsh plugin add` installs it as a plain dependency and does not insert any Loader row.

Activation is the profile user layer. While Web is running, append one snippet from `patches/` to `$DSH_HOME/profiles/web/cordis.patch.yml` and save; the watched user layer remounts that row. Delete the snippet and save to unload it.

Do not add `unread-mail`, `isolated-inbox`, or `self-unload` before boot. Production startup rejects enabled rows that stay pending or have no living root Fiber. `nested-crash` can exist at boot because its root Fiber is active.

## Install

From the repository root, with Plugin Analyzer already in the web profile:

```sh
pnpm dsh plugin --profile web add ./examples/analyzer-fault-plugins
```

`dsh plugin` warns that the package declares no `dsh.bundle`. That warning is the intended outcome.

## Patch snippets

Append **one** of these blocks under the existing webserver override. Use package names, not relative paths: a patch file does not change the profile directory the Loader uses to resolve modules.

Missing dependency (`unread-mail` injects `unreadMailStore`, and nothing provides it):

```yaml
- insert:
    - id: unread-mail
      name: dsh-analyzer-fault-plugins/unread-mail
```

Failed child Fiber (`nested-crash` mounts a child plugin whose `apply` throws; the root stays active):

```yaml
- insert:
    - id: nested-crash
      name: dsh-analyzer-fault-plugins/nested-crash
```

Missing root Fiber (`self-unload` drops the Loader-owned root Fiber after `apply` returns and leaves the row enabled):

```yaml
- insert:
    - id: self-unload
      name: dsh-analyzer-fault-plugins/self-unload
```

Isolation mismatch (a `cordis:group` isolates `isolatedInbox` around the store; the consumer injects that service from outside the group):

```yaml
- insert:
    - id: isolated-inbox
      name: dsh-analyzer-fault-plugins/isolated-inbox
    - id: isolated-inbox-realm
      name: cordis:group
      group: true
      isolate:
        isolatedInbox: true
      config:
        - id: isolated-inbox-store
          name: dsh-analyzer-fault-plugins/isolated-inbox-store
```

Open Settings → Plugins → Plugin Analyzer and refresh. Isolated-inbox is one composition: inserting only the consumer yields a plain missing dependency.

## Limits

This package is a local checkout. It is not a published market bundle and is not part of the shipped Plugin Analyzer or Web layers.

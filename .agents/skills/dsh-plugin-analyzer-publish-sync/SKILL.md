---
name: dsh-plugin-analyzer-publish-sync
description: Use when synchronizing, refreshing, checking, or preparing the standalone plugin-analyze-publish Git repository from the DeepSeek Harness Plugin Analyzer sources, including requests to update publish artifacts after Host, Client, bundle, README, version, or patch changes.
---

# Sync Plugin Analyzer publication artifacts

Project the Plugin Analyzer's three source packages into one independently versioned publication repository. The DeepSeek Harness checkout remains the source authority; `plugin-analyze-publish/` contains generated package payloads ready for review and publication.

## Owned inputs and output

Read these source packages together because one public bundle installs the complete feature:

- `packages/host/plugin-analyzer/`
- `packages/client/ui-settings-plugin-analyzer/`
- `packages/bundle/plugin-analyzer/`

The default output is `<repo>/plugin-analyze-publish/`. Its root is the public `@deepseek-ai/dsh-plugin-analyzer` bundle, while `packages/host/` and `packages/client/` hold the two implementation packages. The output directory owns an independent `.git`; the parent checkout ignores the complete directory.

## Normal workflow

1. Inspect changes in the three source packages and preserve unrelated worktree changes.
2. Run the bundled script from the DeepSeek Harness root:

   ```sh
   python3 .agents/skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py
   ```

3. Read the script summary and inspect the publication repository independently:

   ```sh
   git -C plugin-analyze-publish status --short
   git -C plugin-analyze-publish diff --stat
   ```

4. Report the source commit, dirty-source flag, aligned package version, synchronized file count, target Git root, and checks actually run. Commit, push, tag, npm publication, and profile installation require explicit user authorization.

The script builds the Host and Client compiler faces, creates one `pnpm pack` archive per Analyzer package, extracts only regular publication files, places the bundle at the repository root, places Host and Client under `packages/`, copies the MIT license, repairs standalone README links, records the rewritten bilingual README hashes, normalizes manifest key order, validates the bundle patch and dependency names, records content hashes in `.release-source.json`, and updates only its managed paths. It initializes `plugin-analyze-publish/.git` with branch `main` on first use and preserves that Git directory on every later synchronization.

## Other invocations

Check whether the publication repository matches a fresh build without changing it:

```sh
python3 .agents/skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py --check
```

Select another independent publication repository explicitly:

```sh
python3 .agents/skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py --target /absolute/path/to/plugin-analyze-publish
```

Reuse existing build output only after another command has built both compiler faces successfully:

```sh
python3 .agents/skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py --skip-build
```

The script rejects the source repository root, any Analyzer source directory, unsafe tar members, unresolved `workspace:` dependency specifications, an unrelated non-empty target, and a target whose Git root resolves elsewhere. It never copies this skill, `sync-publish.py`, tests, source maps, or monorepo-only files into the publication repository.

## Publication handoff

Publish Host, Client, then the root bundle at one aligned version. Verify a clean registry install through the documented command:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-plugin-analyzer
```

Use the [package and install tutorial](../../../docs/user/develop/basic/publish.md) and the [Plugin Analyzer publication decision](../../notes/implemented/feature/2026-08-17-plugin-analyzer-behavior-observability.md) as the product and package sources of truth. This skill owns artifact synchronization only.

# Agent Note: Plugin Analyzer publish repository projection

Status: implemented

English | [中文](2026-08-30-plugin-analyzer-publish-repository-projection.zh.md)

## Problem

Plugin Analyzer is authored as one bundle plus separate Host and Client packages in the DeepSeek Harness workspace. Its public bundle depends on the other two packages, generated Typert files, Client bundles, rewritten workspace version ranges, and prebuilt declarations. Manually copying source directories into another Git repository can omit generated files, retain `workspace:` specifications, publish monorepo-only files, or let the editable copies diverge.

The publication repository needs independent Git history while remaining inside this checkout for local release work. Its synchronization command must preserve that `.git`, avoid parent-repository tracking, and keep source-only automation out of the published package payloads.

## Decision

The project-level [`dsh-plugin-analyzer-publish-sync`](../../../skills/dsh-plugin-analyzer-publish-sync/SKILL.md) workflow owns a one-way artifact projection from the three Analyzer source packages into `plugin-analyze-publish/`. The parent `.gitignore` excludes the complete destination, and the destination root carries its own `.git` on branch `main`. DeepSeek Harness remains the editable source authority; the destination contains generated publication files for independent review, versioning, and release.

The workflow calls one standalone [`sync-publish.py`](../../../skills/dsh-plugin-analyzer-publish-sync/scripts/sync-publish.py). The script builds both compiler faces, runs `pnpm pack` separately for the bundle, Host, and Client packages, expands each archive with traversal and member-type checks, and places the public bundle at the destination root with Host and Client under `packages/`. `pnpm pack` resolves workspace package ranges before the script normalizes manifest key order for reproducible bytes.

The script copies the MIT license, rewrites monorepo-relative README links to standalone or source-commit URLs, and records new `README.i18n.yaml` hashes for the rewritten bilingual pairs. It validates the three package names and aligned versions, the bundle patch declaration, direct implementation dependencies, required built entries, and the absence of unresolved `workspace:` specifications and `sync-publish.py`.

`.release-source.json` records the source commit, whether the Analyzer source paths are dirty, the package identities, and SHA-256 hashes for every managed file. A normal run replaces only declared managed paths and preserves `.git` plus release-owned files outside that list. `--check` recreates the projection in a temporary directory and reports missing, extra, or changed managed files. `--skip-build` is an explicit reuse path after both compiler faces have already completed successfully.

This process complements the [Plugin Analyzer behavior and publication decision](../feature/2026-08-17-plugin-analyzer-behavior-observability.md), which continues to own the opt-in bundle, Host/Client responsibilities, runtime behavior, and registry installation requirements.

## Verification

The Python unit suite covers regular tar extraction, parent traversal rejection, synchronization-script exclusion, rewritten translation-sidecar recording, drift diagnostics, and deterministic manifest normalization. A full Host build and full Client build produce the inputs used by a real synchronization; an immediate `--check --skip-build` reproduces all managed file hashes. Git inspection verifies that `plugin-analyze-publish/` is its own repository and the parent checkout ignores it.

## Alternatives considered

**Maintain editable source copies in the publication repository.** This creates two source authorities and leaves generated Typert, bundled Client JavaScript, declarations, dependency ranges, and source edits to separate synchronization rules. Projecting packed artifacts gives publication the same inputs npm receives.

**Use one Git subtree split.** Plugin Analyzer spans three non-contiguous package directories and build output ignored by the source repository. A single-prefix subtree cannot construct the installable package set or resolve workspace dependency specifications.

**Publish the synchronization script with the plugin.** Consumers install prebuilt runtime packages and have no need for a monorepo-aware exporter. Keeping the script in the project skill prevents it from entering npm tarballs or the standalone release repository.

## Consequences

The publication repository is a generated artifact repository, so feature edits return to the three owned source packages before synchronization. Release commits have exact source commits and deterministic drift checks. A normal synchronization pays the cost of both compiler-face builds; the explicit reuse mode shifts freshness responsibility to the completed build named by the caller. npm publication, Git commits, pushes, tags, profile installation, and clean-registry verification remain deliberate release operations outside synchronization.

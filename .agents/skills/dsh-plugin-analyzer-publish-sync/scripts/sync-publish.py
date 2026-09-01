#!/usr/bin/env python3
"""Build and synchronize the standalone Plugin Analyzer publication repository."""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
from typing import Final, Optional


REPO_ROOT: Final = Path(__file__).resolve().parents[4]
DEFAULT_TARGET: Final = REPO_ROOT / "plugin-analyze-publish"


class SyncError(RuntimeError):
    """A publication synchronization precondition or validation failed."""


@dataclass(frozen=True)
class PackageProjection:
    """One source package and its destination inside the publication repository."""

    key: str
    package_name: str
    source: Path
    destination: Path


PACKAGES: Final = (
    PackageProjection(
        "bundle",
        "@deepseek-ai/dsh-plugin-analyzer",
        REPO_ROOT / "packages/bundle/plugin-analyzer",
        Path("."),
    ),
    PackageProjection(
        "host",
        "@deepseek-ai/dsh-host-plugin-analyzer",
        REPO_ROOT / "packages/host/plugin-analyzer",
        Path("packages/host"),
    ),
    PackageProjection(
        "client",
        "@deepseek-ai/dsh-client-ui-settings-plugin-analyzer",
        REPO_ROOT / "packages/client/ui-settings-plugin-analyzer",
        Path("packages/client"),
    ),
)

MANAGED_PATHS: Final = (
    Path("package.json"),
    Path("cordis.patch.yml"),
    Path("lib"),
    Path("README.md"),
    Path("README.zh.md"),
    Path("README.i18n.yaml"),
    Path("LICENSE"),
    Path("packages"),
    Path("pnpm-workspace.yaml"),
    Path(".gitignore"),
    Path(".release-source.json"),
)


def run(argv: list[str], *, cwd: Path, capture: bool = False) -> str:
    """Run one fixed-argv command and return captured stdout when requested."""
    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            check=True,
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
        )
    except FileNotFoundError as error:
        raise SyncError(f"required executable is unavailable: {argv[0]}") from error
    except subprocess.CalledProcessError as error:
        output = "\n".join(part.strip() for part in (error.stdout, error.stderr) if part)
        detail = f"\n{output}" if output else ""
        raise SyncError(f"command failed ({' '.join(argv)}): exit {error.returncode}{detail}") from error
    return completed.stdout.strip() if capture and completed.stdout else ""


def build_packages() -> None:
    """Build the two compiler faces that produce all three package payloads."""
    run(["pnpm", "run", "build:lib:host"], cwd=REPO_ROOT)
    run(["pnpm", "run", "build:lib:client"], cwd=REPO_ROOT)


def pack_package(package: PackageProjection, destination: Path) -> Path:
    """Pack one package and return the only tarball produced in its isolated directory."""
    destination.mkdir(parents=True)
    run(["pnpm", "pack", "--pack-destination", str(destination)], cwd=package.source)
    tarballs = sorted(destination.glob("*.tgz"))
    if len(tarballs) != 1:
        raise SyncError(f"{package.package_name} produced {len(tarballs)} tarballs; expected exactly one")
    return tarballs[0]


def safe_package_relative(member_name: str) -> Optional[Path]:
    """Resolve one npm tar member beneath its required package/ prefix."""
    path = PurePosixPath(member_name)
    if path.is_absolute() or not path.parts or path.parts[0] != "package":
        raise SyncError(f"unsafe tar member outside package/: {member_name}")
    relative_parts = path.parts[1:]
    if not relative_parts:
        return None
    if any(part in {"", ".", ".."} for part in relative_parts):
        raise SyncError(f"unsafe tar member path: {member_name}")
    return Path(*relative_parts)


def extract_package_tarball(tarball: Path, destination: Path) -> None:
    """Extract regular npm package files without accepting links or special members."""
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tarball, "r:gz") as archive:
        for member in archive.getmembers():
            relative = safe_package_relative(member.name)
            if relative is None:
                continue
            output = destination / relative
            if member.isdir():
                output.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise SyncError(f"unsupported tar member type: {member.name}")
            source = archive.extractfile(member)
            if source is None:
                raise SyncError(f"cannot read tar member: {member.name}")
            output.parent.mkdir(parents=True, exist_ok=True)
            with source, output.open("wb") as target_file:
                shutil.copyfileobj(source, target_file)
            output.chmod(0o755 if member.mode & 0o111 else 0o644)


def source_commit() -> str:
    """Return the source checkout commit recorded by the publication projection."""
    return run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture=True)


def source_is_dirty() -> bool:
    """Report changes limited to the three package source directories."""
    output = run(
        ["git", "status", "--porcelain", "--", *(str(package.source.relative_to(REPO_ROOT)) for package in PACKAGES)],
        cwd=REPO_ROOT,
        capture=True,
    )
    return bool(output)


def rewrite_readmes(stage: Path, commit: str) -> None:
    """Replace monorepo-relative links with valid standalone or commit-pinned links."""
    source_base = f"https://github.com/deepseek-ai/deepseek-harness/blob/{commit}"
    replacements = {
        Path("README.md"): {
            "../../host/plugin-analyzer/README.md": "packages/host/README.md",
            "../../client/ui-settings-plugin-analyzer/README.md": "packages/client/README.md",
        },
        Path("README.zh.md"): {
            "../../host/plugin-analyzer/README.md": "packages/host/README.md",
            "../../client/ui-settings-plugin-analyzer/README.md": "packages/client/README.md",
        },
        Path("packages/host/README.md"): {
            "../plugin-inventory/README.md": f"{source_base}/packages/host/plugin-inventory/README.md",
        },
        Path("packages/host/README.zh.md"): {
            "../plugin-inventory/README.md": f"{source_base}/packages/host/plugin-inventory/README.md",
        },
        Path("packages/client/README.md"): {
            "../../host/plugin-analyzer/README.md": "../host/README.md",
            "../../api/remotes/README.md": f"{source_base}/packages/api/remotes/README.md",
            "../ui-settings-plugin-inventory/README.md": (
                f"{source_base}/packages/client/ui-settings-plugin-inventory/README.md"
            ),
        },
        Path("packages/client/README.zh.md"): {
            "../../host/plugin-analyzer/README.md": "../host/README.md",
            "../../api/remotes/README.md": f"{source_base}/packages/api/remotes/README.md",
            "../ui-settings-plugin-inventory/README.md": (
                f"{source_base}/packages/client/ui-settings-plugin-inventory/README.md"
            ),
        },
    }
    for relative, mapping in replacements.items():
        path = stage / relative
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for old, new in mapping.items():
            text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")


def git_blob_hash(content: bytes) -> str:
    """Return the Git blob object id for content without mutating an object database."""
    header = f"blob {len(content)}\0".encode("ascii")
    return hashlib.sha1(header + content).hexdigest()


def record_translation_sidecars(stage: Path) -> None:
    """Record rewritten standalone README pairs with their current Git blob hashes."""
    for source in sorted(stage.rglob("README.md")):
        translation = source.with_name("README.zh.md")
        if not translation.is_file():
            raise SyncError(f"publication README has no Chinese counterpart: {source.relative_to(stage)}")
        sidecar = source.with_name("README.i18n.yaml")
        sidecar.write_text(
            "# Generated consistency record for the standalone publication README pair.\n"
            f"{source.name}: {git_blob_hash(source.read_bytes())}\n"
            f"{translation.name}: {git_blob_hash(translation.read_bytes())}\n",
            encoding="utf-8",
        )


def load_manifest(path: Path) -> dict[str, object]:
    """Read one package manifest as a JSON object."""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SyncError(f"invalid package manifest: {path}") from error
    if not isinstance(value, dict):
        raise SyncError(f"package manifest root must be an object: {path}")
    return value


def normalize_manifests(stage: Path) -> None:
    """Write packed manifests with deterministic key order after pnpm expands workspace ranges."""
    for package in PACKAGES:
        path = stage / package.destination / "package.json"
        manifest = load_manifest(path)
        path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dependency_specs(manifest: dict[str, object]) -> list[str]:
    """Collect package-manager specifications from all dependency sections."""
    specs: list[str] = []
    for section in ("dependencies", "peerDependencies", "optionalDependencies", "devDependencies"):
        dependencies = manifest.get(section, {})
        if isinstance(dependencies, dict):
            specs.extend(value for value in dependencies.values() if isinstance(value, str))
    return specs


def validate_release(stage: Path) -> dict[str, str]:
    """Validate install identity, aligned versions, patch dependencies, and built entries."""
    if any(path.name == "sync-publish.py" for path in stage.rglob("*")):
        raise SyncError("sync-publish.py entered the publication payload")
    versions: dict[str, str] = {}
    manifests: dict[str, dict[str, object]] = {}
    for package in PACKAGES:
        manifest = load_manifest(stage / package.destination / "package.json")
        manifests[package.key] = manifest
        if manifest.get("name") != package.package_name:
            raise SyncError(f"unexpected {package.key} package name: {manifest.get('name')!r}")
        version = manifest.get("version")
        if not isinstance(version, str):
            raise SyncError(f"{package.package_name} has no string version")
        versions[package.key] = version
        unresolved = [spec for spec in dependency_specs(manifest) if spec.startswith("workspace:")]
        if unresolved:
            raise SyncError(f"{package.package_name} retains unresolved workspace dependency specifications")

    if len(set(versions.values())) != 1:
        raise SyncError(f"Analyzer package versions differ: {versions}")

    bundle = manifests["bundle"]
    dsh = bundle.get("dsh")
    if not isinstance(dsh, dict) or dsh.get("bundle") != {"patch": "./cordis.patch.yml"}:
        raise SyncError("bundle manifest must declare dsh.bundle.patch as ./cordis.patch.yml")
    dependencies = bundle.get("dependencies")
    if not isinstance(dependencies, dict):
        raise SyncError("bundle manifest has no dependencies object")
    required = {PACKAGES[1].package_name, PACKAGES[2].package_name}
    if not required.issubset(dependencies):
        raise SyncError("bundle dependencies do not contain both implementation packages")

    patch = (stage / "cordis.patch.yml").read_text(encoding="utf-8")
    if not all(name in patch for name in required):
        raise SyncError("cordis.patch.yml does not mount both implementation packages")
    required_files = (
        Path("lib/index.js"),
        Path("packages/host/lib/index.js"),
        Path("packages/host/lib/typert.remote-client.js"),
        Path("packages/client/lib/client.js"),
    )
    missing = [str(path) for path in required_files if not (stage / path).is_file()]
    if missing:
        raise SyncError(f"publication payload misses built files: {', '.join(missing)}")
    return versions


def file_hashes(root: Path) -> dict[str, str]:
    """Return deterministic SHA-256 hashes for every regular managed file."""
    hashes: dict[str, str] = {}
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
        if ".git" in path.relative_to(root).parts or path.name == ".release-source.json":
            continue
        hashes[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def write_release_metadata(stage: Path, commit: str, dirty: bool, versions: dict[str, str]) -> None:
    """Record reproducible source and artifact identity without a wall-clock timestamp."""
    metadata = {
        "schemaVersion": 1,
        "sourceRepository": "https://github.com/deepseek-ai/deepseek-harness.git",
        "sourceCommit": commit,
        "sourceDirty": dirty,
        "packages": {package.key: {"name": package.package_name, "version": versions[package.key]} for package in PACKAGES},
        "files": file_hashes(stage),
    }
    (stage / ".release-source.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def prepare_stage(root: Path) -> tuple[Path, dict[str, str], str, bool]:
    """Build one complete publication tree below a temporary root."""
    stage = root / "release"
    packs = root / "packs"
    stage.mkdir()
    commit = source_commit()
    dirty = source_is_dirty()
    for package in PACKAGES:
        tarball = pack_package(package, packs / package.key)
        extract_package_tarball(tarball, stage / package.destination)

    license_text = (REPO_ROOT / "LICENSE").read_bytes()
    for destination in (stage, stage / "packages/host", stage / "packages/client"):
        (destination / "LICENSE").write_bytes(license_text)
    (stage / "pnpm-workspace.yaml").write_text(
        "packages:\n  - packages/*\n\nlinkWorkspacePackages: true\n",
        encoding="utf-8",
    )
    (stage / ".gitignore").write_text("node_modules/\n*.tgz\n", encoding="utf-8")
    rewrite_readmes(stage, commit)
    record_translation_sidecars(stage)
    normalize_manifests(stage)
    versions = validate_release(stage)
    write_release_metadata(stage, commit, dirty, versions)
    return stage, versions, commit, dirty


def validate_target(target: Path) -> None:
    """Reject source or broad targets that could overwrite repository-owned files."""
    resolved = target.resolve()
    protected = (REPO_ROOT, *(package.source.resolve() for package in PACKAGES), Path(__file__).resolve().parents[1])
    for path in protected:
        overlaps = resolved == path or resolved in path.parents or path in resolved.parents
        if overlaps and resolved != DEFAULT_TARGET.resolve():
            raise SyncError(f"target overlaps protected source path: {target}")


def ensure_git_root(target: Path) -> None:
    """Initialize and verify the independent publication Git repository."""
    target.mkdir(parents=True, exist_ok=True)
    git_dir = target / ".git"
    if not git_dir.exists():
        existing = [path for path in target.iterdir() if path.name != ".git"]
        if existing:
            raise SyncError(f"target is non-empty and has no independent .git: {target}")
        run(["git", "init", "-b", "main", str(target)], cwd=target.parent)
    git_root = Path(run(["git", "rev-parse", "--show-toplevel"], cwd=target, capture=True)).resolve()
    if git_root != target.resolve():
        raise SyncError(f"target Git root resolves to {git_root}, expected {target.resolve()}")


def remove_path(path: Path) -> None:
    """Remove one exact managed file or directory before replacement."""
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def managed_snapshot(root: Path) -> dict[str, str]:
    """Hash only paths owned by this synchronization workflow."""
    hashes: dict[str, str] = {}
    for relative in MANAGED_PATHS:
        path = root / relative
        if path.is_file():
            hashes[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        elif path.is_dir():
            for child in sorted((item for item in path.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
                child_relative = child.relative_to(root).as_posix()
                hashes[child_relative] = hashlib.sha256(child.read_bytes()).hexdigest()
    return hashes


def snapshot_difference(expected: dict[str, str], actual: dict[str, str]) -> str:
    """Describe missing, extra, and changed managed files for drift diagnostics."""
    expected_paths = set(expected)
    actual_paths = set(actual)
    lines = [*(f"missing: {path}" for path in sorted(expected_paths - actual_paths))]
    lines.extend(f"extra: {path}" for path in sorted(actual_paths - expected_paths))
    lines.extend(
        f"changed: {path}"
        for path in sorted(expected_paths & actual_paths)
        if expected[path] != actual[path]
    )
    return "\n".join(lines)


def apply_stage(stage: Path, target: Path) -> None:
    """Replace only managed publication paths and retain independent repository metadata."""
    for relative in MANAGED_PATHS:
        source = stage / relative
        destination = target / relative
        if destination.exists() or destination.is_symlink():
            remove_path(destination)
        if source.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(destination))


def parse_args() -> argparse.Namespace:
    """Parse the synchronization command line."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET, help="independent publication Git repository")
    parser.add_argument("--check", action="store_true", help="compare a fresh projection without changing the target")
    parser.add_argument("--skip-build", action="store_true", help="reuse existing build output before packing")
    return parser.parse_args()


def main() -> int:
    """Build, validate, and synchronize or compare the publication repository."""
    args = parse_args()
    target = args.target.expanduser().resolve()
    validate_target(target)
    if not args.skip_build:
        build_packages()
    temp_parent = target.parent if target.parent.is_dir() else REPO_ROOT
    with tempfile.TemporaryDirectory(prefix="plugin-analyzer-publish-", dir=temp_parent) as temp:
        stage, versions, commit, dirty = prepare_stage(Path(temp))
        if args.check:
            if not target.is_dir():
                raise SyncError(f"publication target does not exist: {target}")
            expected = managed_snapshot(stage)
            actual = managed_snapshot(target)
            if expected != actual:
                difference = snapshot_difference(expected, actual)
                raise SyncError(f"publication target differs from the current projection: {target}\n{difference}")
            action = "checked"
        else:
            ensure_git_root(target)
            apply_stage(stage, target)
            action = "synchronized"

    file_count = len(json.loads((target / ".release-source.json").read_text(encoding="utf-8"))["files"])
    print(f"Plugin Analyzer publication {action}: {target}")
    print(f"source commit: {commit}")
    print(f"source dirty: {'yes' if dirty else 'no'}")
    print(f"package version: {versions['bundle']}")
    print(f"managed files: {file_count}")
    print(f"git root: {run(['git', 'rev-parse', '--show-toplevel'], cwd=target, capture=True)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as error:
        raise SystemExit(f"sync-publish: {error}") from error

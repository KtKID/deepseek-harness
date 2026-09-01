from __future__ import annotations

import importlib.util
from io import BytesIO
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/sync-publish.py"
SPEC = importlib.util.spec_from_file_location("sync_publish", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
sync_publish = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sync_publish
SPEC.loader.exec_module(sync_publish)


class SyncPublishTests(unittest.TestCase):
    def test_extracts_regular_package_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tarball = root / "package.tgz"
            data = b'{"name":"fixture"}\n'
            with tarfile.open(tarball, "w:gz") as archive:
                info = tarfile.TarInfo("package/package.json")
                info.size = len(data)
                archive.addfile(info, BytesIO(data))
            output = root / "output"
            sync_publish.extract_package_tarball(tarball, output)
            self.assertEqual((output / "package.json").read_bytes(), data)

    def test_rejects_parent_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            tarball = root / "package.tgz"
            data = b"escape"
            with tarfile.open(tarball, "w:gz") as archive:
                info = tarfile.TarInfo("package/../escape.txt")
                info.size = len(data)
                archive.addfile(info, BytesIO(data))
            with self.assertRaises(sync_publish.SyncError):
                sync_publish.extract_package_tarball(tarball, root / "output")

    def test_rejects_sync_script_in_release_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            (stage / "sync-publish.py").write_text("", encoding="utf-8")
            with self.assertRaises(sync_publish.SyncError):
                sync_publish.validate_release(stage)

    def test_records_rewritten_translation_sidecars(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            source = stage / "README.md"
            translation = stage / "README.zh.md"
            source.write_text("source\n", encoding="utf-8")
            translation.write_text("translation\n", encoding="utf-8")
            sync_publish.record_translation_sidecars(stage)
            self.assertEqual(
                (stage / "README.i18n.yaml").read_text(encoding="utf-8").splitlines()[1:],
                [
                    f"README.md: {sync_publish.git_blob_hash(source.read_bytes())}",
                    f"README.zh.md: {sync_publish.git_blob_hash(translation.read_bytes())}",
                ],
            )

    def test_describes_snapshot_drift(self) -> None:
        difference = sync_publish.snapshot_difference(
            {"missing.txt": "a", "changed.txt": "b"},
            {"extra.txt": "c", "changed.txt": "d"},
        )
        self.assertEqual(
            difference.splitlines(),
            ["missing: missing.txt", "extra: extra.txt", "changed: changed.txt"],
        )

    def test_normalizes_manifest_key_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            for package in sync_publish.PACKAGES:
                package_root = stage / package.destination
                package_root.mkdir(parents=True, exist_ok=True)
                (package_root / "package.json").write_text(
                    '{"version":"1.0.0","name":"fixture"}\n',
                    encoding="utf-8",
                )
            sync_publish.normalize_manifests(stage)
            self.assertTrue((stage / "package.json").read_text(encoding="utf-8").startswith('{\n  "name"'))


if __name__ == "__main__":
    unittest.main()

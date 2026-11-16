"""仅临时素材与模拟 GitHub；设置 WALLPAPER_COLLECTOR_TEST_DIR 运行原服务集成测试。"""

import hashlib
import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import bridge


PROJECT = os.environ.get("WALLPAPER_COLLECTOR_TEST_DIR")
COMMIT = "a" * 40
REPO = {"owner": "example", "repo": "wallpapers", "branch": "main"}


class MockGitHub:
    def __init__(self):
        self.files = {}
        self.reads = []
        self.fail = False

    def __call__(self, token):
        bridge.require(bool(token), "TOKEN_REQUIRED", "令牌缺失", 401)
        return self

    def read(self, repo, path, commit, limit=None):
        self.reads.append((repo, path, commit))
        if self.fail:
            raise bridge.BridgeError("REMOTE_FAILED", "模拟远端失败")
        return self.files[(path, commit)]


@unittest.skipUnless(PROJECT, "需设置 WALLPAPER_COLLECTOR_TEST_DIR 指向只读采集项目源码")
class BridgeIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = bridge.load_collector(PROJECT)

    def setUp(self):
        self.external_guard = patch.object(bridge, "ensure_external_collector_stopped")
        self.guard = self.external_guard.start()
        self.addCleanup(self.external_guard.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.project = Path(self.temp.name)
        self.module.BASE_DIR = self.project
        self.root = self.project / "wallpapers"
        self.remote = MockGitHub()
        self.service = bridge.CollectorBridge(self.project, self.module, self.remote)
        from wallpaper_app.storage import ManifestStore
        manifest = ManifestStore(self.root, "alpha", "source")
        self.paths = []
        for item_id in ("1", "2"):
            relative = f"alpha/source/desktop/1080P/{item_id}.jpg"
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(("original-image-" + item_id).encode())
            manifest.put({"sourceItemId": item_id, "platform": "alpha", "source": "source",
                          "localPath": relative, "filename": path.name, "series": "desktop",
                          "resolutionTier": "1080P", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            self.paths.append(path)
        manifest.save()
        self.batch = self.module.UPLOAD_BATCHES.create(self.root, "alpha", "source", "desktop")["batch"]
        self.server = None

    def test_import_reservation_freezes_membership_and_repository(self):
        response = self.service.reserve_import({"batchId": self.batch["id"], "repository": REPO})
        self.assertTrue(response["batch"]["studio"]["importedAt"])
        self.assertEqual(response["batch"]["studio"]["repository"], REPO)
        self.assertEqual(len(response["batch"]["items"]), 2)
        with self.assertRaises(bridge.BridgeError):
            self.service.reserve_import({"batchId": self.batch["id"], "repository": {**REPO, "repo": "other"}})
        self.assertTrue(all(path.exists() for path in self.paths))

    def tearDown(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        self.temp.cleanup()

    def payload(self, ids=("1", "2"), commit=COMMIT, metadata_path="metadata-pending/batch.json"):
        images, receipts = [], []
        for item in self.batch["items"]:
            item_id = item["sourceItemId"]
            if item_id not in ids:
                continue
            path = f"images/desktop/nature/{item_id}.webp"
            compressed = ("compressed-" + item_id).encode()
            self.remote.files[(path, commit)] = compressed
            images.append({"relativePath": path, "localSource": {
                "collectorId": self.service.collector_id, "batchId": self.batch["id"],
                "sourceItemId": item_id, "sha256": item["sha256"]}})
            receipts.append({"sourceItemId": item_id, "sourceSha256": item["sha256"],
                             "uploadedSha256": hashlib.sha256(compressed).hexdigest(), "uploadedPath": path})
        self.remote.files[(metadata_path, commit)] = json.dumps({"targetRepo": REPO, "images": images}).encode()
        return {"batchId": self.batch["id"], "collectorId": self.service.collector_id,
                "repository": REPO.copy(), "metadata": {"path": metadata_path, "commitSha": commit}, "items": receipts}

    def clean(self, confirmed=True):
        return self.service.clean({"batchId": self.batch["id"], "confirmed": confirmed}, "test-token")

    def assert_preserved(self):
        self.assertTrue(all(path.is_file() for path in self.paths))

    def reserve(self):
        return self.service.reserve_import({"batchId": self.batch["id"], "repository": REPO})

    def discard(self, ids, token="test-token"):
        return self.service.discard({"batchId": self.batch["id"],
                                     "collectorId": self.service.collector_id, "items": ids, "confirmed": True}, token)

    def test_manual_cleanup_without_receipts_or_token_requires_confirmation(self):
        with self.assertRaises(bridge.BridgeError):
            self.service.clean({"batchId": self.batch["id"]})
        self.assert_preserved()
        result = self.service.clean({"batchId": self.batch["id"], "confirmed": True})
        self.assertEqual(result["batch"]["status"], "completed")
        self.assertEqual(result["batch"]["studio"]["cleanupMode"], "manual")
        self.assertIsNone(result["batch"]["uploadedAt"])
        from wallpaper_app.storage import ManifestStore
        self.assertEqual(ManifestStore(self.root, "alpha", "source").records, {})
        self.assertEqual(self.remote.reads, [])
        self.assertFalse(any(path.exists() for path in self.paths))

    def test_imported_batch_upload_success_cleans_discarded_and_uploaded_files(self):
        self.assertTrue(self.reserve()["batch"]["studio"]["autoCleanup"])
        result = self.discard(["2"])
        self.assertEqual([item["sourceItemId"] for item in result["batch"]["items"]], ["1"])
        self.assertNotIn("discardedIds", result["batch"]["studio"])
        self.assertFalse(result["batch"]["studio"]["readyToClean"])
        self.assertTrue(self.paths[0].exists())
        self.assertFalse(self.paths[1].exists())
        result = self.service.receipt(self.payload(("1",)), "test-token")
        self.assertEqual(result["batch"]["status"], "completed")
        self.assertEqual(result["batch"]["studio"]["cleanupMode"], "after_upload")
        self.assertEqual(result["batch"]["studio"]["verifiedCount"], 1)
        from wallpaper_app.storage import ManifestStore
        manifest = ManifestStore(self.root, "alpha", "source")
        self.assertEqual(manifest.get("1")["uploadStatus"], "uploaded_cleaned")
        self.assertIsNone(manifest.get("2"))
        self.assertFalse(any(path.exists() for path in self.paths))
        self.assertEqual(self.discard(["2"])["batch"]["status"], "completed")

    def test_upload_then_discard_last_unwanted_item_triggers_cleanup(self):
        self.reserve()
        result = self.service.receipt(self.payload(("1",)), "test-token")
        self.assertEqual(result["batch"]["status"], "ready")
        self.assert_preserved()
        result = self.discard(["2"])
        self.assertEqual(result["batch"]["status"], "completed")

    def test_discard_without_token_waits_and_all_discard_never_auto_cleans(self):
        self.reserve()
        self.discard(["1", "2"])
        self.discard(["1"])
        self.assertFalse(any(path.exists() for path in self.paths))
        self.assertFalse(self.service.progress(self.service.load(self.batch["id"]))["studio"]["readyToClean"])
        self.assertEqual(self.clean()["batch"]["status"], "completed")

    def test_discard_only_after_import_and_removes_uploaded_local_items_without_deletion_records(self):
        with self.assertRaisesRegex(bridge.BridgeError, "先将批次"):
            self.discard(["2"])
        self.reserve()
        self.service.receipt(self.payload(("1",)), "test-token")
        result = self.discard(["1"], token="")
        self.assertEqual(result["batch"]["studio"]["receipts"], {})
        self.assertEqual(result["batch"]["count"], 1)
        self.assertFalse(self.paths[0].exists())
        self.assertTrue(self.paths[1].exists())
        self.assertNotIn("discardedIds", result["batch"]["studio"])
        self.assertEqual(self.discard(["1"], token="")["batch"]["count"], 1)

    def test_failed_upload_verification_does_not_clean_discarded_files(self):
        self.reserve()
        self.discard(["2"])
        self.remote.fail = True
        with self.assertRaises(bridge.BridgeError):
            self.service.receipt(self.payload(("1",)), "test-token")
        self.assertTrue(self.paths[0].exists())
        self.assertFalse(self.paths[1].exists())
        self.assertEqual(self.service.load(self.batch["id"])["count"], 1)

    def test_get_counts_existing_batch_files_without_writing_or_deleting(self):
        export = self.root / self.batch["items"][1]["exportPath"]
        export.unlink()
        before = self.service.load(self.batch["id"])
        result = self.service.list_batches({"batchId": [self.batch["id"]]})["batch"]
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["availableCount"], 1)
        self.assertEqual([item["sourceItemId"] for item in result["items"]], ["1"])
        self.assertTrue(self.paths[1].exists())
        self.assertEqual(self.service.load(self.batch["id"]), before)

    def test_import_prunes_externally_removed_hardlink_and_remaining_original(self):
        (self.root / self.batch["items"][1]["exportPath"]).unlink()
        result = self.reserve()["batch"]
        self.assertEqual(result["count"], 1)
        self.assertFalse(self.paths[1].exists())
        self.assertTrue(self.paths[0].exists())
        from wallpaper_app.storage import ManifestStore
        self.assertIsNone(ManifestStore(self.root, "alpha", "source").get("2"))
        self.assertNotIn("discardedIds", result["studio"])

    def test_external_missing_item_reconciles_before_successful_upload_cleanup(self):
        self.reserve()
        (self.root / self.batch["items"][1]["exportPath"]).unlink()
        result = self.service.receipt(self.payload(("1",)), "test-token")
        self.assertEqual(result["batch"]["status"], "completed")
        self.assertEqual(result["batch"]["count"], 1)
        self.assertFalse(any(path.exists() for path in self.paths))

    def test_selected_delete_preflights_all_images_and_removes_no_changed_files(self):
        self.paths[1].write_bytes(b"changed")
        with self.assertRaisesRegex(bridge.BridgeError, "内容已变化"):
            self.service.delete_items({"batchId": self.batch["id"], "collectorId": self.service.collector_id,
                                       "items": ["1", "2"], "confirmed": True})
        self.assert_preserved()
        self.assertEqual(self.service.load(self.batch["id"])["count"], 2)

    def test_delete_requires_confirmation_and_collector_identity(self):
        request = {"batchId": self.batch["id"], "collectorId": self.service.collector_id, "items": ["1"]}
        with self.assertRaises(bridge.BridgeError):
            self.service.delete_items(request)
        with self.assertRaises(bridge.BridgeError):
            self.service.delete_items({**request, "confirmed": True, "collectorId": "other"})
        self.assert_preserved()

    def test_delete_selected_is_idempotent_and_does_not_add_history_events(self):
        from wallpaper_app.catalog_db import CatalogDatabase
        from wallpaper_app.storage import ManifestStore
        database = CatalogDatabase(self.root)
        before = database.event_count()
        request = {"batchId": self.batch["id"], "collectorId": self.service.collector_id,
                   "items": ["2"], "confirmed": True}
        result = self.service.delete_items(request)
        self.assertEqual(result["batch"]["count"], 1)
        self.assertEqual(result["batch"]["availableCount"], 1)
        self.assertEqual(self.service.delete_items(request)["batch"]["count"], 1)
        self.assertEqual(database.event_count(), before)
        self.assertIsNone(ManifestStore(self.root, "alpha", "source").get("2"))
        self.assertNotIn("deletedIds", result["batch"]["studio"])

    def test_stale_receipt_ignores_removed_item_and_completes_retained_upload(self):
        self.reserve()
        payload = self.payload()
        self.service.delete_items({"batchId": self.batch["id"], "collectorId": self.service.collector_id,
                                   "items": ["2"], "confirmed": True})
        self.remote.reads.clear()
        result = self.service.receipt(payload, "test-token")
        self.assertEqual(result["batch"]["status"], "completed")
        self.assertEqual(set(result["batch"]["studio"]["receipts"]), {"1"})
        self.assertFalse(any(path.exists() for path in self.paths))
        self.assertNotIn("images/desktop/nature/2.webp", [read[1] for read in self.remote.reads])

    def test_receipt_for_fully_removed_items_is_noop_without_remote_access(self):
        self.reserve()
        payload = self.payload()
        self.service.delete_items({"batchId": self.batch["id"], "collectorId": self.service.collector_id,
                                   "items": ["1", "2"], "confirmed": True})
        self.remote.fail = True
        before = self.service.load(self.batch["id"])
        result = self.service.receipt(payload, "")
        self.assertEqual(result["batch"]["count"], 0)
        self.assertEqual(result["batch"]["studio"]["receipts"], {})
        self.assertEqual(self.service.load(self.batch["id"]), before)
        self.assertEqual(self.remote.reads, [])

    def test_different_compressed_hash_and_explicit_cleanup(self):
        payload = self.payload()
        self.assertNotEqual(payload["items"][0]["sourceSha256"], payload["items"][0]["uploadedSha256"])
        result = self.service.receipt(payload, "test-token")
        self.assertTrue(result["batch"]["studio"]["readyToClean"])
        self.assert_preserved()
        result = self.clean()
        self.assertEqual(result["batch"]["status"], "completed")
        self.assertFalse(any(path.exists() for path in self.paths))
        self.assertEqual(self.clean()["batch"]["status"], "completed")

    def test_partial_receipts_accumulate_across_metadata_commits_and_restart(self):
        first = self.payload(("1",))
        result = self.service.receipt(first, "secret-token-not-persisted")
        self.assertEqual(result["batch"]["studio"]["verifiedCount"], 1)
        self.assertFalse(result["batch"]["studio"]["readyToClean"])
        self.assert_preserved()
        self.service = bridge.CollectorBridge(self.project, self.module, self.remote)
        second = self.payload(("2",), "b" * 40, "metadata-pending/second.json")
        self.service.receipt(second, "secret-token-not-persisted")
        self.remote.reads.clear()
        self.service._clean(self.service.progress(self.service.load(self.batch["id"])), self.remote)
        self.assertEqual({entry[2] for entry in self.remote.reads}, {COMMIT, "b" * 40})
        self.assertNotIn(b"secret-token-not-persisted", (self.root / ".catalog/catalog.sqlite3").read_bytes())

    def test_missing_confirmation_never_deletes(self):
        self.service.receipt(self.payload(), "test-token")
        with self.assertRaises(bridge.BridgeError):
            self.clean(False)
        self.assert_preserved()

    def test_changed_second_local_file_blocks_entire_cleanup(self):
        self.service.receipt(self.payload(), "test-token")
        self.paths[1].write_bytes(b"changed")
        with self.assertRaisesRegex(bridge.BridgeError, "内容已变化"):
            self.clean()
        self.assert_preserved()

    def test_missing_local_file_does_not_block_explicit_whole_batch_cleanup(self):
        self.service.receipt(self.payload(), "test-token")
        self.paths[1].unlink()
        self.assertEqual(self.clean()["batch"]["status"], "completed")
        self.assertFalse(self.paths[0].exists())

    def test_remote_failure_blocks_receipt_and_recheck_cleanup(self):
        payload = self.payload()
        self.remote.fail = True
        with self.assertRaises(bridge.BridgeError):
            self.service.receipt(payload, "test-token")
        self.assertNotIn("studio", self.service.load(self.batch["id"]))
        self.remote.fail = False
        self.service.receipt(payload, "test-token")
        self.remote.fail = True
        with self.assertRaises(bridge.BridgeError):
            self.service._clean(self.service.progress(self.service.load(self.batch["id"])), self.remote)
        self.assert_preserved()

    def test_retry_is_idempotent_and_cross_repository_is_rejected(self):
        payload = self.payload()
        self.service.receipt(payload, "test-token")
        self.service.receipt(payload, "test-token")
        saved = self.service.load(self.batch["id"])
        self.assertEqual(len(saved["studio"]["receipts"]), 2)
        payload["repository"]["repo"] = "another-repo"
        with self.assertRaisesRegex(bridge.BridgeError, "其他仓库"):
            self.service.receipt(payload, "test-token")
        self.assert_preserved()

    def test_wrong_remote_source_and_hash_rejected(self):
        payload = self.payload()
        key = (payload["metadata"]["path"], COMMIT)
        metadata = json.loads(self.remote.files[key])
        metadata["images"][0]["localSource"]["batchId"] = "other-batch"
        self.remote.files[key] = json.dumps(metadata).encode()
        with self.assertRaisesRegex(bridge.BridgeError, "准确关联"):
            self.service.receipt(payload, "test-token")
        payload = self.payload()
        self.remote.files[(payload["items"][1]["uploadedPath"], COMMIT)] = b"unexpected"
        with self.assertRaisesRegex(bridge.BridgeError, "上传回执不一致"):
            self.service.receipt(payload, "test-token")
        self.assert_preserved()

    def test_auto_cleanup_follows_imported_batch(self):
        self.reserve()
        result = self.service.receipt(self.payload(), "test-token")
        self.assertEqual(result["batch"]["status"], "completed")

    def test_interrupted_cleanup_recovers_using_retained_receipts(self):
        self.service.receipt(self.payload(), "test-token")
        saved = self.service.load(self.batch["id"])
        saved["status"] = "uploaded_cleanup_pending"
        self.service.save(saved)
        self.paths[0].unlink()
        (self.root / saved["items"][0]["exportPath"]).unlink()
        self.service = bridge.CollectorBridge(self.project, self.module, self.remote)
        self.assertEqual(self.clean()["batch"]["status"], "completed")

    def test_direct_batch_lookup_bypasses_list_pagination(self):
        with patch.object(self.module.UPLOAD_BATCHES, "list", side_effect=AssertionError("不能依赖列表")):
            result = self.service.list_batches({"batchId": [self.batch["id"]]})
        self.assertEqual(result["batch"]["id"], self.batch["id"])

    def test_old_active_batches_precede_history_and_paginate_without_duplicates(self):
        self.batch["createdAt"] = "2020-01-01T00:00:00Z"
        self.batch["plannedDate"] = "2020-01-01"
        self.service.save(self.batch)
        for number in range(105):
            history = {**self.batch, "id": f"history-{number:03}", "status": "completed",
                       "createdAt": f"2026-11-13T00:{number // 60:02}:{number % 60:02}Z"}
            self.service.save(history)
        first = self.service.list_batches({})
        self.assertEqual(first["batches"][0]["id"], self.batch["id"])
        self.assertEqual(first["total"], 106)
        self.assertEqual(first["activeCount"], 1)
        self.assertEqual(first["historyCount"], 105)
        self.assertEqual(first["nextOffset"], 100)
        self.assertTrue(first["hasMore"])
        second = self.service.list_batches({"offset": ["100"], "limit": ["100"]})
        self.assertEqual(len(second["batches"]), 6)
        self.assertEqual(second["activeCount"], 1)
        self.assertFalse(second["hasMore"])
        self.assertEqual(len({batch["id"] for batch in first["batches"] + second["batches"]}), 106)
        self.assertEqual(first["historyBatches"][0]["id"], "history-104")
        self.assertEqual(second["historyBatches"][-1]["id"], "history-000")
        empty = self.service.list_batches({"platform": ["another-platform"]})
        self.assertEqual(empty["total"], 0)
        self.assertEqual(empty["activeCount"], 0)
        self.assertFalse(empty["hasMore"])

    def test_legacy_38_item_batch_accepts_chunked_receipts_and_full_cleanup(self):
        from wallpaper_app.storage import ManifestStore
        manifest = ManifestStore(self.root, "alpha", "source")
        for number in range(3, 39):
            item = dict(self.batch["items"][0])
            item_id = str(number)
            item["sourceItemId"] = item_id
            item["filename"] = f"{item_id}.jpg"
            item["localPath"] = f"alpha/source/desktop/1080P/{item_id}.jpg"
            item["exportPath"] = str(Path(self.batch["directory"]) / item["filename"])
            content = f"legacy-original-{item_id}".encode()
            item["sha256"] = hashlib.sha256(content).hexdigest()
            for key in ("localPath", "exportPath"):
                (self.root / item[key]).write_bytes(content)
            self.paths.append(self.root / item["localPath"])
            self.batch["items"].append(item)
            manifest.put({**item, "uploadStatus": "batched", "uploadBatchId": self.batch["id"]})
        self.batch["count"] = 38
        manifest.save()
        self.service.save(self.batch)
        first = self.payload(tuple(str(i) for i in range(1, 31)))
        second = self.payload(tuple(str(i) for i in range(31, 39)), "b" * 40, "metadata-pending/second.json")
        self.assertEqual(self.service.receipt(first, "token")["batch"]["studio"]["verifiedCount"], 30)
        self.assertEqual(self.service.receipt(second, "token")["batch"]["studio"]["verifiedCount"], 38)
        self.assertEqual(self.clean()["batch"]["status"], "completed")
        self.assertFalse(any(path.exists() for path in self.paths))

    def test_partial_cleanup_reports_error_and_remains_retryable(self):
        self.service.receipt(self.payload(), "test-token")
        original_unlink = self.module.UPLOAD_BATCHES._unlink_item_paths
        def fail_second(root, item):
            if item["sourceItemId"] == "2":
                raise OSError("模拟文件锁定")
            return original_unlink(root, item)
        with patch.object(self.module.UPLOAD_BATCHES, "_unlink_item_paths", side_effect=fail_second):
            with self.assertRaisesRegex(bridge.BridgeError, "清理未全部完成"):
                self.clean()
        saved = self.service.load(self.batch["id"])
        self.assertEqual(saved["status"], "cleanup_failed")
        self.assertEqual(saved["items"][0]["cleanupStatus"], "cleaned")
        self.assertFalse(self.paths[0].exists())
        self.assertTrue(self.paths[1].exists())
        self.assertEqual(self.clean()["batch"]["status"], "completed")

    def test_symlink_check_does_not_inspect_ancestors_outside_output_root(self):
        original = Path.is_symlink
        inspected = []
        def inspect(path):
            inspected.append(path)
            return original(path)
        with patch.object(Path, "is_symlink", inspect):
            self.service.local_path(self.batch["items"][0]["localPath"], self.batch["items"][0]["sha256"], True)
        self.assertTrue(inspected)
        self.assertTrue(all(self.service.root in path.parents for path in inspected))

    def test_external_collector_guard_blocks_before_any_cleanup(self):
        self.service.receipt(self.payload(), "test-token")
        self.guard.side_effect = bridge.BridgeError("EXTERNAL_COLLECTOR_ACTIVE", "独立采集服务仍在运行")
        with self.assertRaisesRegex(bridge.BridgeError, "独立采集服务"):
            self.clean()
        self.assert_preserved()

    def test_external_collector_is_checked_again_after_remote_verification(self):
        self.service.receipt(self.payload(), "test-token")
        self.guard.side_effect = [None, bridge.BridgeError("EXTERNAL_COLLECTOR_ACTIVE", "独立采集服务仍在运行")]
        with self.assertRaisesRegex(bridge.BridgeError, "独立采集服务"):
            self.clean()
        self.assert_preserved()

    def test_symlink_and_arbitrary_image_paths_rejected(self):
        with self.assertRaises(bridge.BridgeError):
            self.service.image_record({"path": [str(self.paths[0])]})
        self.paths[0].unlink()
        self.paths[0].symlink_to(self.paths[1])
        with self.assertRaises(bridge.BridgeError):
            self.service.image_record({"batchId": [self.batch["id"]], "itemId": ["1"]})

    def test_http_discard_and_manual_cleanup_do_not_need_github_token(self):
        secret = "x" * 48
        self.server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.make_handler(self.service, secret))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        def post(path, body):
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
            connection.request("POST", path, body=json.dumps(body),
                               headers={"X-Studio-Bridge": secret, "Content-Type": "application/json"})
            response = connection.getresponse()
            result = response.status, json.loads(response.read())
            connection.close()
            return result
        code, result = post("/batches/import", {"batchId": self.batch["id"], "repository": REPO})
        self.assertEqual(code, 200)
        self.assertTrue(result["batch"]["studio"]["autoCleanup"])
        code, result = post("/batches/discard", {"batchId": self.batch["id"],
                                               "collectorId": self.service.collector_id, "items": ["2"], "confirmed": True})
        self.assertEqual(code, 200)
        self.assertEqual(result["batch"]["count"], 1)
        self.assertFalse(self.paths[1].exists())
        self.assertEqual(post("/batches/policy", {"batchId": self.batch["id"]})[0], 404)
        code, result = post("/batches/items/delete", {"batchId": self.batch["id"],
                                                   "collectorId": self.service.collector_id, "items": ["2"], "confirmed": True})
        self.assertEqual(code, 200)
        self.assertEqual(result["batch"]["count"], 1)
        code, result = post("/batches/clean", {"batchId": self.batch["id"], "confirmed": True})
        self.assertEqual(code, 200)
        self.assertEqual(result["batch"]["status"], "completed")

    def test_http_authentication_route_allowlist_and_global_batches(self):
        secret = "x" * 48
        self.server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.make_handler(self.service, secret))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        def fetch(path, authorized=True):
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
            connection.request("GET", path, headers={"X-Studio-Bridge": secret} if authorized else {})
            response = connection.getresponse()
            status, body = response.status, response.read()
            connection.close()
            return status, body
        self.assertEqual(fetch("/health", False)[0], 403)
        status, body = fetch("/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["collectorId"], self.service.collector_id)
        self.assertEqual(fetch("/api/upload-batches/complete")[0], 404)
        self.assertEqual(fetch("/image?path=/etc/passwd")[0], 400)
        self.assertEqual(fetch("/files?outputRoot=other")[0], 400)
        status, body = fetch("/batches")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["batches"][0]["studio"]["verifiedCount"], 0)
        status, body = fetch(f"/batches?batchId={self.batch['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["batch"]["id"], self.batch["id"])
        self.assertEqual(fetch(f"/image?batchId={self.batch['id']}&itemId=1")[1], self.paths[0].read_bytes())


class RemoteReaderTests(unittest.TestCase):
    def test_project_lock_excludes_second_process_and_releases_after_exit(self):
        with tempfile.TemporaryDirectory() as project:
            code = (
                "import bridge, sys; "
                "lock = bridge.ProjectLock(sys.argv[1]); "
                "print('locked', flush=True); sys.stdin.read()"
            )
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
            command = [sys.executable, "-c", code, project]
            cwd = str(Path(bridge.__file__).parent)
            process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(process.stdout.readline().strip(), "locked")
                blocked = subprocess.run(command, input="", capture_output=True, text=True,
                                         cwd=cwd, env=env, timeout=5)
                self.assertNotEqual(blocked.returncode, 0)
                self.assertIn("另一个 Studio 工作台已连接", blocked.stderr)
                cli = subprocess.run(
                    [sys.executable, str(Path(bridge.__file__)), "--project", project, "--port", "0"],
                    capture_output=True, text=True, timeout=5,
                    env=dict(env, STUDIO_COLLECTOR_SECRET="s" * 48),
                )
                self.assertEqual(cli.returncode, 1)
                self.assertEqual(cli.stdout, "")
                self.assertEqual(json.loads(cli.stderr)["code"], "COLLECTOR_IN_USE")
            finally:
                process.terminate()
                process.communicate(timeout=5)
            restarted = subprocess.run(command, input="", capture_output=True, text=True,
                                       cwd=cwd, env=env, timeout=5)
            self.assertEqual(restarted.returncode, 0, restarted.stderr)
            self.assertEqual(restarted.stdout.strip(), "locked")

    def test_project_lock_is_private_and_different_projects_are_independent(self):
        with tempfile.TemporaryDirectory() as project:
            with bridge.ProjectLock(Path(project) / "one") as first:
                with bridge.ProjectLock(Path(project) / "two"):
                    self.assertEqual(os.fstat(first.fd).st_mode & 0o777, 0o600)

    def test_external_collector_refusal_allows_cleanup_but_running_or_unknown_blocks(self):
        with patch.object(bridge.http.client, "HTTPConnection") as connection:
            connection.return_value.request.side_effect = ConnectionRefusedError()
            bridge.ensure_external_collector_stopped()
            connection.return_value.request.side_effect = None
            for body in (b'{"ok":true,"running":true}', b'{"ok":true,"running":false}'):
                connection.return_value.getresponse.return_value.read.return_value = body
                with self.assertRaisesRegex(bridge.BridgeError, "先停止"):
                    bridge.ensure_external_collector_stopped()
            connection.return_value.request.side_effect = TimeoutError()
            with self.assertRaisesRegex(bridge.BridgeError, "无法确认"):
                bridge.ensure_external_collector_stopped()
            self.assertEqual(connection.call_args.args, ("127.0.0.1", 8765))

    def test_redirect_is_always_rejected(self):
        with self.assertRaises(bridge.BridgeError):
            bridge.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://evil.example")

    def test_only_fixed_github_origin_and_encoded_paths(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b"image"
        with patch.object(bridge.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = Response()
            reader = bridge.GitHubReader("request-only-token")
            self.assertEqual(reader.read(REPO, "images/with ?/#中文.png", COMMIT), b"image")
            request = opener.return_value.open.call_args.args[0]
            self.assertTrue(request.full_url.startswith("https://api.github.com/repos/example/wallpapers/contents/"))
            self.assertIn("%3F", request.full_url)
            self.assertIn("%23", request.full_url)
            self.assertEqual(request.headers["Authorization"], "Bearer request-only-token")

    def test_invalid_repository_paths_and_mutable_refs_rejected_before_network(self):
        reader = bridge.GitHubReader("test-token")
        for path in ("../secret", "/etc/passwd", "images//x", "a/./b", "a\\b", "a\nx"):
            with self.subTest(path=path), self.assertRaises(bridge.BridgeError):
                reader.read(REPO, path, COMMIT)
        with self.assertRaises(bridge.BridgeError):
            reader.read(REPO, "images/x.jpg", "main")


if __name__ == "__main__":
    unittest.main()

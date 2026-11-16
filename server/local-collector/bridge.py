"""Studio 专用本机桥接；原采集项目保持独立。"""

from datetime import datetime, timezone
import argparse
import fcntl
import hashlib
import hmac
import http.client
import importlib.util
import ipaddress
import json
import os
import re
import sys
import tempfile
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urlparse


class BridgeError(Exception):
    def __init__(self, code, message, status=409):
        super().__init__(message)
        self.code, self.status = code, status


def require(condition, code="INVALID_ARGUMENT", message="请求参数无效", status=400):
    if not condition:
        raise BridgeError(code, message, status)


def repo_path(value):
    require(isinstance(value, str) and 0 < len(value) < 1024)
    require(not value.startswith("/") and "\\" not in value)
    require(all(part not in ("", ".", "..") for part in value.split("/")))
    require(not any(ord(char) < 32 for char in value))
    return value


def repository(value):
    require(isinstance(value, dict))
    owner, repo, branch = (value.get(key) for key in ("owner", "repo", "branch"))
    require(isinstance(owner, str) and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,99}", owner)))
    require(isinstance(repo, str) and bool(re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", repo)))
    require(repo not in (".", ".."))
    require(isinstance(branch, str) and 0 < len(branch) < 256 and not any(ord(c) < 32 for c in branch))
    return {"owner": owner, "repo": repo, "branch": branch}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise BridgeError("REMOTE_REDIRECT", "远端重定向已拒绝")


class GitHubReader:
    """令牌仅驻留当前请求，始终使用固定 GitHub API 主机。"""

    def __init__(self, token):
        require(isinstance(token, str) and token.strip(), "TOKEN_REQUIRED", "请提供 GitHub 授权令牌", 401)
        require("\r" not in token and "\n" not in token)
        self.token = token

    def read(self, repo, path, commit, limit=64 * 1024 * 1024):
        repo_path(path)
        require(bool(re.fullmatch(r"[0-9a-fA-F]{40}", commit)))
        url = "https://api.github.com/repos/{}/{}/contents/{}?{}".format(
            quote(repo["owner"], safe=""), quote(repo["repo"], safe=""),
            quote(path, safe="/"), urlencode({"ref": commit}),
        )
        request = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "wallpaper-studio-local-collector",
        })
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
                require(response.status == 200, "REMOTE_FAILED", "远端文件核验失败", 502)
                data = response.read(limit + 1)
                require(len(data) <= limit, "REMOTE_TOO_LARGE", "远端文件超过核验大小限制", 502)
                return data
        except BridgeError:
            raise
        except Exception as error:
            raise BridgeError("REMOTE_FAILED", "远端文件核验失败，请检查授权与网络", 502) from error


def load_collector(project):
    project = Path(project).expanduser().resolve()
    require((project / "web_app.py").is_file(), "PROJECT_NOT_FOUND", "采集项目路径无效")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(project))
    spec = importlib.util.spec_from_file_location("studio_collector_web_app", project / "web_app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProjectLock:
    """锁位于系统临时目录；内核在进程退出时自动释放独占权。"""

    def __init__(self, project):
        digest = hashlib.sha256(str(Path(project).expanduser().resolve()).encode()).hexdigest()
        path = Path(tempfile.gettempdir()) / f"wallpaper-studio-collector-{os.getuid()}-{digest}.lock"
        self.fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            os.fchmod(self.fd, 0o600)
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.fd)
            raise BridgeError("COLLECTOR_IN_USE", "另一个 Studio 工作台已连接该采集项目，请关闭对应开发服务后重试") from None
        except BaseException:
            os.close(self.fd)
            raise

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class CollectorBridge:
    def __init__(self, project, collector=None, reader_factory=GitHubReader):
        self.project = Path(project).expanduser().resolve()
        self.module = collector or load_collector(self.project)
        self.root = self.module.resolve_output_root(None)
        self.collector_id = hashlib.sha256(str(self.project).encode()).hexdigest()
        self.reader_factory = reader_factory
        # 与原批次管理器共用可重入锁，也保护创建与清理的并发操作。
        self.lock = self.module.UPLOAD_BATCHES._lock

    def load(self, batch_id):
        require(isinstance(batch_id, str) and bool(batch_id))
        return self.module.UPLOAD_BATCHES._load_batch(self.root, batch_id)

    def save(self, batch):
        self.module.UPLOAD_BATCHES._save_batch(self.root, batch)

    @staticmethod
    def progress(batch):
        studio = batch.setdefault("studio", {})
        studio.setdefault("repository", None)
        studio.setdefault("receipts", {})
        studio.setdefault("autoCleanup", False)
        ids = {str(item["sourceItemId"]) for item in batch.get("items", [])}
        studio["verifiedCount"] = len(ids.intersection(studio["receipts"]))
        studio["readyToClean"] = bool(ids) and ids.issubset(studio["receipts"]) and batch.get("status") != "completed"
        return batch

    def available(self, item):
        for key in ("localPath", "exportPath"):
            relative = item.get(key)
            require(isinstance(relative, str) and relative, "UNSAFE_PATH", "本地文件路径无效", 409)
            path = (self.root / relative).resolve()
            require(self.module.is_within(self.root, path) and path != self.root,
                    "UNSAFE_PATH", "本地文件路径越界", 409)
            if not path.is_file():
                return False
        return True

    def present(self, batch):
        if batch.get("status") != "completed":
            batch["items"] = [item for item in batch.get("items", []) if self.available(item)]
            batch["count"] = len(batch["items"])
        batch["availableCount"] = sum(self.available(item) for item in batch.get("items", []))
        return self.progress(batch)

    def remove_items(self, batch, ids):
        require(not self.module.STATE.snapshot()["running"], "TASK_RUNNING", "采集运行中不能删除素材", 409)
        ensure_external_collector_stopped()
        selected = [item for item in batch["items"] if item["sourceItemId"] in ids]
        for item in selected:
            for key in ("localPath", "exportPath"):
                self.local_path(item.get(key), item["sha256"], required=False)
        ensure_external_collector_stopped()
        from wallpaper_app.storage import ManifestStore
        from wallpaper_app.thumbnails import remove_thumbnail
        manifest = ManifestStore(self.root, batch["platform"], batch["source"])
        failure = None
        for item in selected:
            try:
                self.module.UPLOAD_BATCHES._unlink_item_paths(self.root, item)
                remove_thumbnail(self.root, item["sha256"])
            except OSError:
                failure = BridgeError("DELETE_FAILED", "部分素材未能删除，未完成项已保留，请重试")
                break
            item_id = item["sourceItemId"]
            batch["items"] = [entry for entry in batch["items"] if entry["sourceItemId"] != item_id]
            batch["studio"]["receipts"].pop(item_id, None)
            manifest.records.pop(item_id, None)
        batch["count"] = len(batch["items"])
        self.progress(batch)
        manifest.save()
        self.save(batch)
        if failure:
            raise failure
        return batch

    def reconcile(self, batch):
        if batch.get("status") != "completed":
            missing = {item["sourceItemId"] for item in batch["items"] if not self.available(item)}
            if missing:
                self.remove_items(batch, missing)
        return batch

    def list_batches(self, query):
        if query.get("batchId"):
            return {"ok": True, "batch": self.present(self.load(query["batchId"][0]))}
        platform = (query.get("platform") or [None])[0]
        source = (query.get("source") or [None])[0]
        limit = self.module.parse_int((query.get("limit") or [100])[0], 100, 1, 200)
        offset = self.module.parse_int((query.get("offset") or [0])[0], 0, 0, 100000000)
        active = {"ready", "cleanup_failed", "uploaded_cleanup_pending"}
        # 原列表先按创建时间截断，会挤掉旧的待处理批次；在 SQL 分页前排序。
        from wallpaper_app.catalog_db import CatalogDatabase
        clauses, values = [], []
        for column, value in (("platform", platform), ("source", source)):
            if value:
                clauses.append(f"{column} = ?")
                values.append(value)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        is_active = "status IN ('ready', 'cleanup_failed', 'uploaded_cleanup_pending')"
        with CatalogDatabase(self.root)._connection() as connection:
            totals = connection.execute(
                f"SELECT COUNT(*) AS total, COALESCE(SUM({is_active}), 0) AS active_count "
                f"FROM upload_batches{where}", values,
            ).fetchone()
            rows = connection.execute(
                f"SELECT payload_json FROM upload_batches{where} "
                f"ORDER BY CASE WHEN {is_active} THEN 0 ELSE 1 END, "
                f"CASE WHEN {is_active} THEN COALESCE(NULLIF(planned_date, ''), substr(created_at, 1, 10)) END ASC, "
                f"CASE WHEN {is_active} THEN created_at END ASC, "
                f"CASE WHEN NOT ({is_active}) THEN created_at END DESC, id ASC LIMIT ? OFFSET ?",
                values + [limit, offset],
            ).fetchall()
        batches = [self.present(json.loads(row["payload_json"])) for row in rows]
        counts = self.module.UPLOAD_BATCHES.counts(self.root, platform, source)
        counts["legacyPending"] = 0
        return {"ok": True, "batches": batches,
                "activeBatches": [batch for batch in batches if batch["status"] in active],
                "historyBatches": [batch for batch in batches if batch["status"] not in active],
                "total": totals["total"], "activeCount": totals["active_count"],
                "historyCount": totals["total"] - totals["active_count"],
                "offset": offset, "nextOffset": offset + len(batches),
                "hasMore": offset + len(batches) < totals["total"],
                "counts": counts}

    def image_record(self, query):
        require(not set(query).difference({"batchId", "itemId", "platform", "source"}))
        item_id = (query.get("itemId") or [""])[0]
        require(bool(item_id))
        if query.get("batchId"):
            batch = self.load(query["batchId"][0])
            record = next((item for item in batch["items"] if str(item["sourceItemId"]) == item_id), None)
        else:
            platform, source = ((query.get(key) or [""])[0] for key in ("platform", "source"))
            require(bool(platform and source))
            record = next((item for item in self.module.iter_manifest_records(self.root, platform, source)
                           if str(item.get("sourceItemId")) == item_id), None)
        require(record is not None, "IMAGE_NOT_FOUND", "图片不存在", 404)
        self.local_path(record.get("localPath"), record.get("sha256"), required=True)
        return record

    def local_path(self, relative, digest, required=False):
        require(isinstance(relative, str) and relative, "UNSAFE_PATH", "本地文件路径无效", 409)
        path = (self.root / relative).resolve()
        require(self.module.is_within(self.root, path) and path != self.root,
                "UNSAFE_PATH", "本地文件路径越界", 409)
        # 原管理器会 resolve 后 unlink，拒绝符号链接以免清理其他素材。
        candidate = self.root / relative
        while candidate != self.root:
            require(self.root in candidate.parents and not candidate.is_symlink(),
                    "UNSAFE_PATH", "本地文件不允许使用符号链接", 409)
            candidate = candidate.parent
        if not path.is_file():
            require(not required and not path.exists(), "LOCAL_FILE_MISSING", "本地图片不存在", 409)
            return path
        require(hashlib.sha256(path.read_bytes()).hexdigest() == digest,
                "FILE_CHANGED", "本地图片内容已变化，已停止操作", 409)
        return path

    def verify(self, batch, repo, receipts, reader):
        source_items = {str(item["sourceItemId"]): item for item in batch["items"]}
        metadata_cache = {}
        for item_id, receipt in receipts.items():
            source = source_items.get(item_id)
            require(source is not None and receipt["sourceSha256"] == source["sha256"],
                    "SOURCE_MISMATCH", "回执与原始素材不一致", 409)
            metadata = receipt["metadata"]
            cache_key = (metadata["path"], metadata["commitSha"])
            if cache_key not in metadata_cache:
                try:
                    document = json.loads(reader.read(repo, *cache_key, limit=8 * 1024 * 1024))
                except (ValueError, UnicodeError) as error:
                    raise BridgeError("METADATA_INVALID", "远端元数据格式无效") from error
                require(isinstance(document, dict) and isinstance(document.get("images"), list),
                        "METADATA_INVALID", "远端元数据格式无效", 409)
                if document.get("targetRepo") is not None:
                    require(document["targetRepo"] == repo, "REPOSITORY_MISMATCH", "远端元数据仓库不匹配", 409)
                metadata_cache[cache_key] = document
            expected = {"collectorId": self.collector_id, "batchId": batch["id"],
                        "sourceItemId": item_id, "sha256": source["sha256"]}
            matches = [item for item in metadata_cache[cache_key]["images"]
                       if isinstance(item, dict) and item.get("relativePath") == receipt["uploadedPath"]
                       and item.get("localSource") == expected]
            require(len(matches) == 1, "METADATA_MISMATCH", "远端元数据未准确关联原始素材", 409)
            uploaded = reader.read(repo, receipt["uploadedPath"], metadata["commitSha"])
            require(hashlib.sha256(uploaded).hexdigest() == receipt["uploadedSha256"],
                    "REMOTE_HASH_MISMATCH", "远端图片内容与上传回执不一致", 409)

    def receipt(self, request, token):
        with self.lock:
            batch = self.progress(self.load(request.get("batchId")))
            require(request.get("collectorId") == self.collector_id, "COLLECTOR_MISMATCH", "采集器标识不匹配", 409)
            require(batch["status"] in ("ready", "cleanup_failed", "uploaded_cleanup_pending", "completed"),
                    "INVALID_BATCH_STATE", "当前批次不能接收回执", 409)
            self.reconcile(batch)
            repo = repository(request.get("repository"))
            studio = batch["studio"]
            require(studio["repository"] in (None, repo), "REPOSITORY_MISMATCH", "批次已关联其他仓库或分支", 409)
            metadata = request.get("metadata")
            require(isinstance(metadata, dict))
            metadata = {"path": repo_path(metadata.get("path")), "commitSha": metadata.get("commitSha")}
            require(isinstance(metadata["commitSha"], str) and bool(re.fullmatch(r"[0-9a-fA-F]{40}", metadata["commitSha"])))
            require(metadata["path"].endswith(".json"))
            items = request.get("items")
            require(isinstance(items, list) and 0 < len(items) <= 30)
            receipts = {}
            remaining_ids = {str(item["sourceItemId"]) for item in batch["items"]}
            seen = set()
            for item in items:
                require(isinstance(item, dict) and isinstance(item.get("sourceItemId"), str))
                item_id = item["sourceItemId"]
                require(item_id not in seen)
                seen.add(item_id)
                if item_id not in remaining_ids:
                    continue
                for key in ("sourceSha256", "uploadedSha256"):
                    require(isinstance(item.get(key), str) and bool(re.fullmatch(r"[0-9a-f]{64}", item[key])))
                receipts[item_id] = {"sourceItemId": item_id, "sourceSha256": item["sourceSha256"],
                                     "uploadedSha256": item["uploadedSha256"],
                                     "uploadedPath": repo_path(item.get("uploadedPath")), "metadata": metadata}
            if not receipts:
                return {"ok": True, "batch": self.present(batch)}
            reader = self.reader_factory(token)
            self.verify(batch, repo, receipts, reader)
            studio["repository"] = repo
            studio["receipts"].update(receipts)
            self.progress(batch)
            self.save(batch)
            if studio["autoCleanup"] and studio["readyToClean"]:
                return self._clean(batch, reader)
            return {"ok": True, "batch": batch}

    def delete_items(self, request, token="", imported_only=False):
        require(request.get("confirmed") is True, "CONFIRMATION_REQUIRED", "删除本地图片必须明确确认", 409)
        with self.lock:
            batch = self.progress(self.load(request.get("batchId")))
            require(request.get("collectorId") == self.collector_id,
                    "COLLECTOR_MISMATCH", "采集器标识不匹配", 409)
            require(batch["status"] in ("ready", "cleanup_failed", "uploaded_cleanup_pending", "completed"),
                    "INVALID_BATCH_STATE", "当前批次不能删除素材", 409)
            if imported_only:
                require(bool(batch["studio"].get("importedAt")), "IMPORT_REQUIRED", "请先将批次送到图片上传", 409)
            items = request.get("items")
            require(isinstance(items, list) and 0 < len(items) <= 200)
            require(all(isinstance(item, str) and item for item in items))
            if batch["status"] != "completed":
                self.remove_items(batch, set(items))
                self.reconcile(batch)
                studio = batch["studio"]
                if studio["autoCleanup"] and studio["readyToClean"] and token:
                    return self._clean(batch, self.reader_factory(token))
            return {"ok": True, "batch": self.present(batch)}

    def discard(self, request, token=""):
        return self.delete_items(request, token, imported_only=True)

    def reserve_import(self, request):
        with self.lock:
            batch = self.progress(self.load(request.get("batchId")))
            require(batch["status"] == "ready", "INVALID_BATCH_STATE", "当前批次不能导入", 409)
            repo = repository(request.get("repository"))
            require(batch["studio"]["repository"] in (None, repo), "REPOSITORY_MISMATCH", "批次已关联其他仓库或分支", 409)
            self.reconcile(batch)
            batch["studio"]["repository"] = repo
            batch["studio"]["importedAt"] = batch["studio"].get("importedAt") or datetime.now(timezone.utc).isoformat()
            batch["studio"]["autoCleanup"] = True
            self.save(batch)
            return {"ok": True, "batch": self.present(batch)}

    def clean(self, request, token=""):
        require(request.get("confirmed") is True, "CONFIRMATION_REQUIRED", "清理本地图片必须明确确认", 409)
        with self.lock:
            batch = self.progress(self.load(request.get("batchId")))
            if batch["status"] == "completed":
                return {"ok": True, "batch": batch}
            return self._clean(batch, manual=True)

    def _clean(self, batch, reader=None, manual=False):
        studio = batch["studio"]
        require(not self.module.STATE.snapshot()["running"], "TASK_RUNNING", "采集运行中不能清理", 409)
        require(batch["status"] in ("ready", "cleanup_failed", "uploaded_cleanup_pending"),
                "INVALID_BATCH_STATE", "当前批次不能清理", 409)
        ensure_external_collector_stopped()
        if not manual:
            require(studio["readyToClean"], "INCOMPLETE_RECEIPTS", "保留的图片尚未全部上传完成", 409)
            self.verify(batch, studio["repository"], studio["receipts"], reader)
        for item in batch["items"]:
            for key in ("localPath", "exportPath"):
                self.local_path(item.get(key), item["sha256"], required=False)
        ensure_external_collector_stopped()
        if batch["status"] == "uploaded_cleanup_pending":
            batch["status"] = "cleanup_failed"
            self.save(batch)
        batch["studio"]["cleanupMode"] = "manual" if manual else "after_upload"
        self.save(batch)
        result = self.module.UPLOAD_BATCHES.complete(self.root, batch["id"], confirmed=True)
        self.progress(result["batch"])
        from wallpaper_app.storage import ManifestStore
        manifest = ManifestStore(self.root, batch["platform"], batch["source"])
        for item in result["batch"]["items"]:
            if item.get("cleanupStatus") != "cleaned" or item["sourceItemId"] in studio["receipts"]:
                continue
            manifest.records.pop(item["sourceItemId"], None)
        manifest.save()
        if not studio["receipts"]:
            result["batch"]["uploadedAt"] = None
        self.save(result["batch"])
        require(result["batch"].get("status") == "completed", "CLEANUP_FAILED",
                "本地清理未全部完成，已保留批次进度，请重试", 409)
        return result


def ensure_external_collector_stopped():
    """原服务不共享进程锁；可达时拒绝清理，包括空闲状态。"""
    connection = http.client.HTTPConnection("127.0.0.1", 8765, timeout=1)
    try:
        connection.request("GET", "/api/status")
        response = connection.getresponse()
        response.read(64 * 1024)
    except ConnectionRefusedError:
        return
    except (OSError, http.client.HTTPException):
        raise BridgeError("EXTERNAL_COLLECTOR_UNKNOWN", "无法确认独立采集服务状态，请停止该服务后重试") from None
    finally:
        connection.close()
    raise BridgeError("EXTERNAL_COLLECTOR_ACTIVE", "独立采集服务仍在运行，请先停止该服务后清理")


def make_handler(bridge, secret):
    base = bridge.module.Handler

    class Handler(base):
        def authorized(self):
            return ipaddress.ip_address(self.client_address[0]).is_loopback and hmac.compare_digest(
                self.headers.get("X-Studio-Bridge", ""), secret)

        def _error(self, error):
            if isinstance(error, BridgeError):
                self._json({"ok": False, "code": error.code, "msg": str(error)}, error.status)
            else:
                # 原服务异常可能包含响应体、URL 或文件路径，桥接不向浏览器转发。
                code = getattr(error, "code", "INTERNAL_ERROR")
                self._json({"ok": False, "code": code, "msg": "采集服务操作失败，请检查参数或服务状态"},
                           getattr(error, "http_status", 409 if hasattr(error, "code") else 500))

        def _read_json(self):
            require(not self.headers.get("Transfer-Encoding"))
            try:
                length = int(self.headers.get("Content-Length", "0"))
                require(0 <= length <= 256 * 1024, "REQUEST_TOO_LARGE", "请求体过大", 413)
                data = json.loads(self.rfile.read(length) or b"{}")
                require(isinstance(data, dict))
            except (ValueError, UnicodeError) as error:
                raise BridgeError("INVALID_JSON", "请求参数不是有效 JSON", 400) from error
            require(data.get("outputRoot") in (None, "", "wallpapers"))
            data["outputRoot"] = "wallpapers"
            return data

        def do_GET(self):
            try:
                require(self.authorized(), "FORBIDDEN", "桥接授权失败", 403)
                parsed = urlparse(self.path)
                query = parse_qs(parsed.query)
                require((query.get("outputRoot") or ["wallpapers"])[0] in ("", "wallpapers"))
                if parsed.path == "/health":
                    self._json({"ok": True, "collectorId": bridge.collector_id, "outputRoot": str(bridge.root)})
                elif parsed.path == "/batches":
                    with bridge.lock:
                        self._json(bridge.list_batches(query))
                elif parsed.path in ("/image", "/thumbnail"):
                    with bridge.lock:
                        record = bridge.image_record(query)
                        safe_query = {"path": [record["localPath"]], "sha256": [record["sha256"]]}
                        (self._serve_image if parsed.path == "/image" else self._serve_thumbnail)(safe_query)
                elif parsed.path in ("/platforms", "/sources", "/status", "/files", "/runs"):
                    path = "/api/download-runs" if parsed.path == "/runs" else "/api" + parsed.path
                    self.path = path + ("?" + parsed.query if parsed.query else "")
                    base.do_GET(self)
                else:
                    raise BridgeError("NOT_FOUND", "接口不存在", 404)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                self._error(error)

        def do_POST(self):
            try:
                require(self.authorized(), "FORBIDDEN", "桥接授权失败", 403)
                path = urlparse(self.path).path
                if path in ("/start", "/stop", "/batches/create"):
                    self.path = "/api/upload-batches/create" if path == "/batches/create" else "/api" + path
                    with bridge.lock:
                        base.do_POST(self)
                    return
                require(path in ("/batches/receipt", "/batches/clean", "/batches/import", "/batches/discard", "/batches/items/delete"), "NOT_FOUND", "接口不存在", 404)
                request = self._read_json()
                if path == "/batches/import":
                    result = bridge.reserve_import(request)
                elif path == "/batches/receipt":
                    result = bridge.receipt(request, self.headers.get("X-GitHub-Token", ""))
                elif path == "/batches/discard":
                    result = bridge.discard(request, self.headers.get("X-GitHub-Token", ""))
                elif path == "/batches/items/delete":
                    result = bridge.delete_items(request, self.headers.get("X-GitHub-Token", ""))
                else:
                    result = bridge.clean(request, self.headers.get("X-GitHub-Token", ""))
                self._json(result)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                self._error(error)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Studio 本机采集桥接")
    parser.add_argument("--project", required=True)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    secret = os.environ.get("STUDIO_COLLECTOR_SECRET", "")
    require(len(secret) >= 32, "SECRET_REQUIRED", "桥接启动密钥缺失")
    with ProjectLock(args.project):
        bridge = CollectorBridge(args.project)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(bridge, secret))
        print(json.dumps({"port": server.server_port}), flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()


if __name__ == "__main__":
    try:
        main()
    except BridgeError as error:
        print(json.dumps({"ok": False, "code": error.code, "msg": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("采集桥接启动失败，请检查项目路径和 Python 依赖", file=sys.stderr)
        sys.exit(1)

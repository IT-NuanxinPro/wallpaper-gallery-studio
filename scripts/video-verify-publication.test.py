import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
import zipfile

spec = importlib.util.spec_from_file_location("video_verify", Path(__file__).with_name("video-verify-publication.py"))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class PublicationVerificationTests(unittest.TestCase):
    def setUp(self):
        self.routes = {}
        self.methods = []
        self.request_headers = []
        self.require_media_referer = False
        routes, methods, request_headers, state = self.routes, self.methods, self.request_headers, self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                methods.append(self.command)
                route = unquote(urlsplit(self.path).path)
                request_headers.append((route, dict(self.headers)))
                status, content_type, body = routes.get(route, (404, "application/json", b"{}"))
                if state.require_media_referer and route.startswith(("/wallpaper/video/", "/preview/video/", "/thumbnail/video/")) and self.headers.get("Referer") != state.origin + "/":
                    status, content_type, body = 403, "application/json", b'{"error":"referer-required"}'
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                if self.headers.get("Range") and status == 200:
                    # Range behavior is separately checked by the verifier.
                    pass
                self.end_headers()
                self.wfile.write(body)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.origin = "http://127.0.0.1:" + str(self.server.server_port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
    def add(self, path, value, status=200, content_type="application/json"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        self.routes[path] = status, content_type, body

    def fixture(self):
        source_bytes = b"original-container"
        download = b"remuxed-video-container"
        preview = b"complete-muted-preview"
        thumbnail = b"webp-poster"
        job_id, publication_id = "12345678-job", "publication-1"
        keys = {"download": "wallpaper/video/desktop/动漫/精灵-12345678.mp4", "preview": "preview/video/desktop/动漫/精灵-12345678.mp4", "thumbnail": "thumbnail/video/desktop/动漫/精灵-12345678.webp"}
        def asset(key, data, content_type):
            return {"key": key, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "contentType": content_type}
        result = {"download": asset("jobs/12345678-job/download.mp4", download, "video/mp4"), "preview": asset("jobs/12345678-job/preview.mp4", preview, "video/mp4"), "frames": [{"id": "frame-1", "thumbnailKey": "jobs/12345678-job/frame-1.webp", "thumbnailSize": len(thumbnail), "thumbnailSha256": hashlib.sha256(thumbnail).hexdigest()}], "metadata": {"width": 3840, "height": 2160, "duration": 11.5}}
        review = {"selectedFrameId": "frame-1", "usage": "desktop", "topic": "动漫", "filename": "精灵.mp4", "displayTitle": "精灵", "description": "完整审核描述", "keywords": ["精灵"]}
        job = {"id": job_id, "filename": "input.mp4", "size": len(source_bytes), "sha256": hashlib.sha256(source_bytes).hexdigest(), "finalKeys": keys, "result": result, "review": review}
        publication = {"id": publication_id, "status": "published", "jobs": [job], "metadataCommitSha": "a" * 40, "dataSha": "b" * 40, "deploymentRunId": "42", "deploymentId": "pages-real"}
        deployment = {"publicationId": publication_id, "minimumDataRef": "a" * 40, "dataSha": "b" * 40, "pagesDeploymentId": "pages-real"}
        sources = [{"filename": "input.mp4", "path": "/local/input.mp4", "size": len(source_bytes), "sha256": job["sha256"]}]
        item = {"id": "video-" + job_id, "jobId": job_id, "publicationId": publication_id, "publicationJobCount": 1, "path": "/" + keys["download"], "previewPath": "/" + keys["preview"], "thumbnailPath": "/" + keys["thumbnail"], "filename": keys["download"].rsplit("/", 1)[1], "displayTitle": review["displayTitle"], "description": review["description"], "keywords": review["keywords"], "category": "desktop", "subcategory": "动漫", "usage": "desktop", "topic": "动漫", "size": len(download), "sha256": result["download"]["sha256"], "sha": result["download"]["sha256"], "duration": 11.5, "resolution": {"width": 3840, "height": 2160, "label": "4K", "type": "success"}}
        for kind, data in [("download", download), ("preview", preview), ("thumbnail", thumbnail)]:
            self.add("/" + keys[kind], data, content_type="image/webp" if kind == "thumbnail" else "video/mp4")
        self.add("/data/video/index.json", {"total": 1, "categoryCount": 1, "blob": verify.encode_v1([{ "name": "desktop", "file": "desktop.json", "count": 1}])})
        for route in ["/data/video.json", "/data/video/desktop.json", "/data/video/latest.json"]:
            self.add(route, {"total": 1, "blob": verify.encode_v1([item])})
        token, bucket = verify.share_location(item["path"])
        record = {"assetKey": verify.asset_key(item["path"]), "_assetKey": verify.asset_key(item["path"]), "series": "video", "_series": "video", "sharePath": "/wallpaper/" + token, "filename": item["filename"], "displayTitle": review["displayTitle"], "description": review["description"], "url": self.origin + item["path"], "downloadUrl": self.origin + item["path"], "previewUrl": self.origin + item["previewPath"], "thumbnailUrl": self.origin + item["thumbnailPath"]}
        self.add(bucket, {"schema": 1, "items": {token: record}})
        self.add("/wallpaper/" + token, ('<html><script id="wallpaper-detail-data" type="application/json">' + json.dumps({"schema": 1, "record": record}) + '</script></html>').encode(), content_type="text/html")
        self.add("/api/download-file", {"code": "invalid_ticket"}, status=403)
        self.add("/api/download-permit", {"code": "method_not_allowed"}, status=405)
        self.add("/repos/owner/gallery/actions/runs/42", {"id": 42, "status": "completed", "conclusion": "success", "display_title": "video:publication-1:" + "a" * 40})
        self.add("/repos/owner/gallery/actions/runs/42/artifacts", {"artifacts": [{"id": 7, "name": "video-publication-result", "expired": False}]})
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as zipped:
            zipped.writestr("publication-result.json", json.dumps(deployment))
        self.add("/repos/owner/gallery/actions/artifacts/7/zip", archive.getvalue(), content_type="application/zip")
        self.add("/repos/owner/pictures/compare/" + "a" * 40 + "..." + "b" * 40, {"status": "ahead"})
        return publication, deployment, sources, item

    def run_fixture(self, publication, deployment, sources):
        return verify.verify_publications([publication], [deployment], sources, site_origin=self.origin, resource_origin=self.origin, gallery_repository="owner/gallery", data_repository="owner/pictures", github_api_base=self.origin)

    def test_success_compares_processed_digest_instead_of_source_remux_digest_and_only_gets(self):
        publication, deployment, sources, _ = self.fixture()
        report = self.run_fixture(publication, deployment, sources)
        self.assertTrue(report["ok"])
        self.assertEqual(report["verifiedSources"], sources)
        self.assertEqual(len(report["publications"][0]["jobs"][0]["objects"]), 3)
        self.assertTrue(all(method == "GET" for method in self.methods))

    def test_media_uses_site_referer_without_forwarding_it_or_credentials_to_github(self):
        publication, deployment, sources, _ = self.fixture()
        self.require_media_referer = True
        report = self.run_fixture(publication, deployment, sources)
        self.assertTrue(report["ok"])
        media = [(route, headers) for route, headers in self.request_headers if route.startswith(("/wallpaper/video/", "/preview/video/", "/thumbnail/video/"))]
        self.assertEqual(len(media), 3)
        for _, headers in media:
            self.assertEqual(headers.get("Referer"), self.origin + "/")
            self.assertNotIn("Authorization", headers)
            self.assertNotIn("X-Video-Service-Token", headers)
        for route, headers in self.request_headers:
            if route.startswith("/repos/"):
                self.assertNotIn("Referer", headers)

    def test_media_error_reports_only_safe_kind_not_private_url(self):
        publication, deployment, sources, _ = self.fixture()
        self.add("/" + publication["jobs"][0]["finalKeys"]["download"], b"private upstream error", status=403)
        with self.assertRaisesRegex(verify.VerificationError, "media/download") as captured:
            self.run_fixture(publication, deployment, sources)
        self.assertNotIn(self.origin, str(captured.exception))
        self.assertNotIn("private upstream", str(captured.exception))

    def test_corrupt_formal_video_blocks_success_even_when_size_matches(self):
        publication, deployment, sources, _ = self.fixture()
        key = "/" + publication["jobs"][0]["finalKeys"]["download"]
        status, content_type, body = self.routes[key]
        self.routes[key] = status, content_type, b"x" * len(body)
        with self.assertRaisesRegex(verify.VerificationError, "SHA256"):
            self.run_fixture(publication, deployment, sources)

    def test_stale_category_review_is_rejected_even_when_full_data_is_current(self):
        publication, deployment, sources, item = self.fixture()
        self.add("/data/video/desktop.json", {"total": 1, "blob": verify.encode_v1([{**item, "description": "stale"}])})
        with self.assertRaisesRegex(verify.VerificationError, "分类"):
            self.run_fixture(publication, deployment, sources)

    def test_source_manifest_requires_every_file_and_no_extra_job(self):
        publication, deployment, sources, _ = self.fixture()
        sources.append({**sources[0], "sha256": "c" * 64, "filename": "missing.mp4"})
        with self.assertRaisesRegex(verify.VerificationError, "源清单"):
            self.run_fixture(publication, deployment, sources)

    def test_same_review_and_paths_cannot_hide_wrong_technical_dimensions(self):
        publication, deployment, sources, _ = self.fixture()
        publication["jobs"][0]["result"]["metadata"]["width"] = 1920
        with self.assertRaisesRegex(verify.VerificationError, "尺寸"):
            self.run_fixture(publication, deployment, sources)

    def test_claimed_artifact_must_match_github_successful_run_and_real_artifact(self):
        publication, deployment, sources, _ = self.fixture()
        deployment["pagesDeploymentId"] = "invented-id"
        with self.assertRaisesRegex(verify.VerificationError, "部署"):
            self.run_fixture(publication, deployment, sources)


if __name__ == "__main__":
    unittest.main()

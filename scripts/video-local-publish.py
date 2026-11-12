"""仅供本机端到端验收：真实发布器与媒体传输，目录提交/Pages 结果使用隔离替身。"""
import base64
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

workspace = Path(__file__).resolve().parents[1]
workflow = workspace.parent / "wallpaper-gallery-workflow"
sys.path.insert(0, str(workflow / "scripts"))
from video import catalog, publish  # noqa: E402
from video.api import ServiceAPI

base_url = os.environ.get("VIDEO_API_URL", "http://127.0.0.1:8795")
if urlsplit(base_url).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Local acceptance refuses non-local VIDEO_API_URL")
output = workspace / "output/video-e2e-20261112/publication"
source = workspace.parent / "nuanXinProPic"
output.mkdir(parents=True, exist_ok=True)


class LocalCatalog:
    def __init__(self):
        self.files = {}
        for name in ("metadata/video.json", "data/video.json", "stats.json"):
            self.files[name] = json.loads((source / name).read_text())
        for path in (source / "data/video").glob("*.json"):
            self.files[path.relative_to(source).as_posix()] = json.loads(path.read_text())
        self.original = json.loads(json.dumps(self.files))
        self.head = "a" * 40
        self.commits = 0

    def snapshot(self):
        return self.head, json.loads(json.dumps(self.files))

    def commit(self, head, files, message):
        if head != self.head:
            raise publish.HeadConflict("Local catalog changed")
        self.files.update(files)
        self.head = hashlib.sha1(publish.json_bytes(self.files)).hexdigest()
        self.commits += 1
        for name, value in self.files.items():
            destination = output / "catalog" / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(publish.json_bytes(value))
        return self.head

    def contains_ref(self, minimum, actual):
        return minimum == self.head and actual == self.head


class LocalGallery:
    def __init__(self, data_repository):
        self.data_repository = data_repository
        self.current = None
        self.result = None

    def dispatch(self, workflow, ref, publication_id, minimum_data_ref):
        self.current = {"id": 900003, "display_title": f"video:{publication_id}:{minimum_data_ref}", "status": "completed", "conclusion": "success"}
        self.result = {"publicationId": publication_id, "minimumDataRef": minimum_data_ref, "dataSha": self.data_repository.head, "pagesDeploymentId": "local-simulated-pages-deployment"}
        (output / "publication-result.json").write_bytes(publish.json_bytes(self.result))

    def workflow_runs(self, workflow):
        return [self.current] if self.current else []

    def run(self, run_id):
        return self.current

    def deployment_result(self, run_id):
        return self.result


repository = LocalCatalog()
gallery = LocalGallery(repository)
api = ServiceAPI(base_url, os.environ.get("VIDEO_SERVICE_TOKEN", "local-video-service"))
processed = publish.run_publish(api, repository, gallery, "local-deploy.yml", "main", "900002", max_tasks=1, timeout_seconds=120)
if processed != 1:
    raise SystemExit("No queued publication; approve and publish in the local studio first")
old_metadata = repository.original["metadata/video.json"]["images"]
new_metadata = repository.files["metadata/video.json"]["images"]
for key, item in old_metadata.items():
    if new_metadata.get(key) != item:
        raise AssertionError("Historical video metadata changed: " + key)
old_items = {catalog.normalized_path(item["path"]): item for item in catalog.decode(repository.original["data/video.json"])}
new_items = {catalog.normalized_path(item["path"]): item for item in catalog.decode(repository.files["data/video.json"])}
for key, item in old_items.items():
    if any(new_items[key].get(field) != value for field, value in item.items()):
        raise AssertionError("Historical video field changed: " + key)
report = {
    "mode": "local-isolated-catalog-and-pages",
    "real": ["browser multipart upload", "production Worker logic", "SQLite task persistence", "FFmpeg media processing", "existing AI provider", "review and frozen publication", "streamed formal objects", "complete JSON generation and mirror uploads"],
    "simulated": ["R2 object storage", "GitHub remote commit", "Cloudflare Pages deploy artifact"],
    "catalogCommits": repository.commits,
    "historicalVideoCount": len(old_metadata),
    "publishedVideoCount": len(new_metadata),
    "allHistoricalFieldsPreserved": True,
    "dataSha": repository.head,
    "deploymentResult": gallery.result,
}
(output / "acceptance.json").write_bytes(publish.json_bytes(report))
print(json.dumps(report, ensure_ascii=False, indent=2))

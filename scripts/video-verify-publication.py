#!/usr/bin/env python3
"""真实视频发布只读验收：仅GET、流式SHA256，不下载保存大媒体、不删除原片。"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import quote, unquote, urlsplit
import zipfile

SOURCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
TARGET_CHARS = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm5678901234-_."
SHA = re.compile(r"^[a-f0-9]{40}$")


class VerificationError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def encode_v1(value):
    raw = base64.b64encode(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).decode()
    return "v1." + raw.translate(str.maketrans(SOURCE_CHARS, TARGET_CHARS))[::-1]


def decode_v1(envelope):
    value = envelope.get("blob") or envelope.get("payload")
    require(isinstance(value, str) and value.startswith("v1."), "网站视频JSON编码无效")
    try:
        result = json.loads(base64.b64decode(value[3:][::-1].translate(str.maketrans(TARGET_CHARS, SOURCE_CHARS)), validate=True))
    except (ValueError, TypeError):
        raise VerificationError("网站视频JSON解码失败") from None
    require(isinstance(result, list) and envelope.get("total") == len(result), "网站视频JSON总数不完整")
    return result


def asset_key(path):
    require(isinstance(path, str) and path.startswith("/wallpaper/video/"), "视频正式路径无效")
    segments = path[1:].split("/")
    decoded = [unquote(segment) for segment in segments]
    require(all(segment and segment not in (".", "..") and "/" not in segment and "\\" not in segment and all(ord(character) >= 32 for character in segment) for segment in decoded), "视频路径包含非法片段")
    return "video:path:/" + "/".join(quote(segment, safe="~!*'()") for segment in decoded)


def share_location(path):
    token = base64.urlsafe_b64encode(asset_key(path).encode()).decode().rstrip("=")
    value = 2166136261
    for character in token:
        value = ((value ^ ord(character)) * 16777619) & 0xffffffff
    return token, "/data/details/" + format(value & 63, "02x") + ".json"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, target):
        return None


class ReadOnlyHTTP:
    def __init__(self):
        self.opener = urllib.request.build_opener(NoRedirect())

    def response(self, url, headers=None):
        try:
            return self.opener.open(urllib.request.Request(url, headers={"User-Agent": "wallpaper-publication-readonly-verifier", "Cache-Control": "no-cache", **(headers or {})}, method="GET"), timeout=60)
        except urllib.error.HTTPError as response:
            return response
        except (urllib.error.URLError, OSError):
            raise VerificationError("只读HTTP连接失败；未输出请求地址或凭据") from None

    def small(self, url, headers=None, allowed=(200,), maximum=16 * 1024 * 1024):
        with self.response(url, headers) as response:
            require(response.status in allowed, f"只读HTTP状态不符合预期（{response.status}）")
            value = response.read(maximum + 1)
            require(len(value) <= maximum, "只读JSON/HTML响应超过验收上限")
            return value

    def json(self, url, headers=None, allowed=(200,)):
        try:
            return json.loads(self.small(url, headers, allowed))
        except ValueError:
            raise VerificationError("只读HTTP未返回有效JSON") from None

    def media(self, url, size, digest, content_type):
        require(isinstance(size, int) and size > 0 and re.fullmatch(r"[a-f0-9]{64}", digest or ""), "处理产物缺少可验收的大小或SHA256")
        actual, count = hashlib.sha256(), 0
        with self.response(url) as response:
            require(response.status == 200, f"正式对象GET失败（{response.status}）")
            require(response.headers.get("Content-Type", "").split(";")[0].lower() == content_type, "正式对象Content-Type不匹配")
            content_length = response.headers.get("Content-Length")
            require(content_length is None or content_length == str(size), "正式对象Content-Length不匹配")
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                count += len(chunk)
                require(count <= size, "正式对象实际字节数超过处理产物")
                actual.update(chunk)
        require(count == size, "正式对象实际字节数不匹配")
        require(actual.hexdigest() == digest, "正式对象SHA256与处理产物不匹配")
        return {"size": count, "sha256": actual.hexdigest(), "contentType": content_type}


class DetailHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capturing, self.fragments = False, []
    def handle_starttag(self, tag, attributes):
        if tag == "script" and dict(attributes).get("id") == "wallpaper-detail-data":
            self.capturing = True
    def handle_endtag(self, tag):
        if tag == "script":
            self.capturing = False
    def handle_data(self, value):
        if self.capturing:
            self.fragments.append(value)


def public_url(origin, path, revision=None):
    require(path.startswith("/") and not path.startswith("//"), "网站资源路径无效")
    encoded = "/".join(quote(unquote(segment), safe="~!*'()") for segment in path.split("/"))
    return origin + encoded + ("?v=" + quote(revision, safe="") if revision else "")


def verify_deployment(http, publication, expected, gallery_repository, data_repository, github_api_base, github_token):
    require(expected.get("publicationId") == publication["id"], "部署artifact与publication不匹配")
    minimum, actual, pages_id = expected.get("minimumDataRef"), expected.get("dataSha"), expected.get("pagesDeploymentId")
    require(SHA.fullmatch(minimum or "") and SHA.fullmatch(actual or "") and re.fullmatch(r"[\w-]{1,100}", pages_id or ""), "部署artifact缺少真实SHA或PagesID")
    require(minimum == publication.get("metadataCommitSha") and actual == publication.get("dataSha") and pages_id == publication.get("deploymentId"), "部署artifact与任务保存的实际部署结果不同")
    run_id = str(publication.get("deploymentRunId", ""))
    require(run_id.isdigit(), "publication缺少真实GitHub deploymentRunId")
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", **({"Authorization": "Bearer " + github_token} if github_token else {})}
    base = github_api_base + "/repos/" + gallery_repository
    run = http.json(base + "/actions/runs/" + run_id, headers)
    require(run.get("status") == "completed" and run.get("conclusion") == "success" and run.get("display_title") == f"video:{publication['id']}:{minimum}", "真实GitHub部署运行尚未成功或标识错配")
    artifacts = http.json(base + "/actions/runs/" + run_id + "/artifacts?name=video-publication-result&per_page=100", headers).get("artifacts", [])
    matching = [item for item in artifacts if item.get("name") == "video-publication-result" and not item.get("expired")]
    require(len(matching) == 1, "真实部署成功artifact缺失、过期或有歧义")
    url = base + "/actions/artifacts/" + str(matching[0]["id"]) + "/zip"
    with http.response(url, headers) as response:
        if response.status in (301, 302, 303, 307, 308):
            destination = response.headers.get("Location", "")
            require(urlsplit(destination).scheme == "https", "部署artifact下载重定向无效")
            archive_bytes = http.small(destination, maximum=1024 * 1024)
        else:
            require(response.status == 200, "部署artifact下载失败")
            archive_bytes = response.read(1024 * 1024 + 1)
            require(len(archive_bytes) <= 1024 * 1024, "部署artifact过大")
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir() and entry.filename.endswith(".json")]
            require(len(entries) == 1 and entries[0].file_size <= 1024 * 1024, "部署artifact结构不符合契约")
            artifact = json.loads(archive.read(entries[0]))
    except (ValueError, zipfile.BadZipFile):
        raise VerificationError("真实部署artifact解析失败") from None
    require(artifact == expected, "远端真实部署artifact与提供的验收结果不同")
    comparison = http.json(github_api_base + "/repos/" + data_repository + "/compare/" + minimum + "..." + actual, headers)
    require(comparison.get("status") in ("ahead", "identical"), "实际部署数据不包含最低发布commit")
    return {"runId": run_id, "pagesDeploymentId": pages_id, "minimumDataRef": minimum, "dataSha": actual, "artifactVerified": True}


def verify_website(http, origin, resource_origin, publication, revision):
    index = http.json(public_url(origin, "/data/video/index.json", revision))
    categories = decode_v1({**index, "total": index.get("categoryCount")})
    full = decode_v1(http.json(public_url(origin, "/data/video.json", revision)))
    require(index.get("total") == len(full), "网站视频分类索引与完整数据总数不一致")
    by_path = {asset_key(item["path"]): item for item in full}
    require(len(by_path) == len(full), "网站完整视频身份重复")
    category_items, files = [], set()
    for category in categories:
        filename = category.get("file", "")
        require(re.fullmatch(r"[^/\\]+\.json", filename) and not filename.startswith(".") and filename not in files, "网站视频分类引用无效")
        files.add(filename)
        items = decode_v1(http.json(public_url(origin, "/data/video/" + filename, revision)))
        require(category.get("count") == len(items), "网站视频分类计数不一致")
        require(all(by_path.get(asset_key(item["path"])) == item for item in items), "网站视频分类内容与完整数据不一致")
        category_items.extend(items)
    require(len(category_items) == len(full) and len({asset_key(item["path"]) for item in category_items}) == len(full), "网站视频分类缺失或重复资产")
    latest = decode_v1(http.json(public_url(origin, "/data/video/latest.json", revision)))
    require(len(latest) == min(40, len(full)) and all(by_path.get(asset_key(item["path"])) == item for item in latest), "网站视频latest缺失或内容过期")
    verified = {}
    for job in publication["jobs"]:
        keys, review, result = job["finalKeys"], job["review"], job["result"]
        item = by_path.get(asset_key("/" + keys["download"]))
        require(item and item.get("jobId") == job["id"] and item.get("publicationId") == publication["id"], "网站数据没有要求的jobId/publicationId")
        expected = {"previewPath": "/" + keys["preview"], "thumbnailPath": "/" + keys["thumbnail"], "filename": keys["download"].rsplit("/", 1)[1], "displayTitle": review["displayTitle"], "description": review["description"], "keywords": review["keywords"], "category": review["usage"], "subcategory": review["topic"], "usage": review["usage"], "topic": review["topic"], "sha256": result["download"]["sha256"], "sha": result["download"]["sha256"], "size": result["download"]["size"], "duration": result["metadata"]["duration"], "publicationJobCount": len(publication["jobs"])}
        for field, value in expected.items():
            actual = unquote(item.get(field, "")) if field.endswith("Path") else item.get(field)
            require(actual == value, "网站视频审核/资源字段不匹配：" + field)
        require(all(item.get("resolution", {}).get(field) == result["metadata"][field] for field in ("width", "height")), "网站视频技术尺寸与处理结果不同")
        token, bucket_path = share_location(item["path"])
        bucket = http.json(public_url(origin, bucket_path, revision))
        record = bucket.get("items", {}).get(token) if bucket.get("schema") == 1 else None
        require(record and record.get("assetKey") == asset_key(item["path"]) and record.get("sharePath") == "/wallpaper/" + token, "网站详情桶缺少正确稳定身份")
        for field, value in {"url": resource_origin + "/" + keys["download"], "downloadUrl": resource_origin + "/" + keys["download"], "previewUrl": resource_origin + "/" + keys["preview"], "thumbnailUrl": resource_origin + "/" + keys["thumbnail"]}.items():
            require(unquote(record.get(field, "")) == value, "网站详情预览或下载URL错误")
        require(record.get("displayTitle") == review["displayTitle"] and record.get("description") == review["description"], "网站详情审核文字过期")
        parser = DetailHTML()
        parser.feed(http.small(public_url(origin, "/wallpaper/" + token, revision)).decode())
        try:
            payload = json.loads("".join(parser.fragments))
        except ValueError:
            raise VerificationError("真实网站详情HTML缺少服务端详情数据") from None
        require(payload.get("schema") == 1 and payload.get("record") == record, "真实网站详情HTML与详情桶内容不一致")
        verified[job["id"]] = {"dataPresent": True, "detailBucketVerified": True, "detailHTMLVerified": True, "path": item["path"], "sharePath": record["sharePath"]}
    return verified, len(full)


def verify_publications(publications, deployment_results, sources, *, site_origin="https://wallpaper.061129.xyz", resource_origin="https://img.061129.xyz", gallery_repository="IT-NuanxinPro/wallpaper-gallery", data_repository="IT-NuanxinPro/nuanXinProPic", github_api_base="https://api.github.com", github_token=None):
    http = ReadOnlyHTTP()
    require(publications and isinstance(sources, list) and sources, "publication或源清单为空")
    by_result = {item["publicationId"]: item for item in deployment_results}
    require(len(by_result) == len(deployment_results) == len(publications), "部署结果与publication数量不匹配")
    source_keys = [(item["sha256"], item["size"], item["filename"]) for item in sources]
    jobs = [job for publication in publications for job in publication["jobs"]]
    job_keys = [(job["sha256"], job["size"], job["filename"]) for job in jobs]
    require(sorted(source_keys) == sorted(job_keys) and len(set(source_keys)) == len(source_keys), "源清单与发布任务不是完整一一对应")
    report = {"ok": True, "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "readOnly": True, "localDeletionPerformed": False, "verifiedSources": sources, "publications": []}
    for publication in publications:
        require(publication.get("status") == "published", "publication尚未标记真实发布成功")
        expected = by_result.get(publication["id"])
        require(expected is not None, "缺少publication对应的部署artifact")
        deployment = verify_deployment(http, publication, expected, gallery_repository, data_repository, github_api_base, github_token)
        website, total = verify_website(http, site_origin.rstrip("/"), resource_origin.rstrip("/"), publication, expected["dataSha"])
        verified_jobs = []
        for job in publication["jobs"]:
            keys, result = job["finalKeys"], job["result"]
            selected = next((frame for frame in result["frames"] if frame["id"] == job["review"]["selectedFrameId"]), None)
            require(selected is not None, "发布任务缺少已选封面")
            assets = [("download", result["download"]["size"], result["download"]["sha256"], "video/mp4"), ("preview", result["preview"]["size"], result["preview"]["sha256"], "video/mp4"), ("thumbnail", selected["thumbnailSize"], selected["thumbnailSha256"], "image/webp")]
            verified_objects = []
            for kind, size, digest, content_type in assets:
                verified_objects.append({"kind": kind, "key": keys[kind], **http.media(public_url(resource_origin.rstrip("/"), "/" + keys[kind]), size, digest, content_type)})
            verified_jobs.append({"jobId": job["id"], "sourceFilename": job["filename"], "sourceSha256": job["sha256"], "website": website[job["id"]], "objects": verified_objects})
        report["publications"].append({"publicationId": publication["id"], "deployment": deployment, "websiteVideoTotal": total, "jobs": verified_jobs})
    denied = http.json(site_origin.rstrip("/") + "/api/download-file", allowed=(403,))
    method = http.json(site_origin.rstrip("/") + "/api/download-permit", allowed=(405,))
    require(denied.get("code") == "invalid_ticket" and method.get("code") == "method_not_allowed", "网站下载保护拒绝无票/错误方法的行为不符合契约")
    report["downloadProtection"] = {"unsignedRequestDenied": True, "permitGetRejected": True, "authorizedBrowserDownloadVerified": False, "note": "只读GET验收不申请下载许可，不验证Turnstile或带票浏览器下载；正式原文件GET已按产物摘要完整验收"}
    return report


def read_json(path):
    return json.loads(Path(path).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publication", action="append", required=True, help="已published任务JSON，可重复")
    parser.add_argument("--deployment-result", action="append", required=True, help="真实Pages成功artifact JSON，可重复")
    parser.add_argument("--sources", required=True, help="原片源清单JSON")
    parser.add_argument("--output", required=True, help="只读验收报告JSON")
    parser.add_argument("--expected-count", type=int, default=5)
    parser.add_argument("--site-origin", default="https://wallpaper.061129.xyz")
    parser.add_argument("--resource-origin", default="https://img.061129.xyz")
    arguments = parser.parse_args()
    try:
        sources = read_json(arguments.sources)
        require(len(sources) == arguments.expected_count, "源清单数量与expected-count不一致")
        report = verify_publications([read_json(path) for path in arguments.publication], [read_json(path) for path in arguments.deployment_result], sources, site_origin=arguments.site_origin, resource_origin=arguments.resource_origin, github_token=os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("REPO_TOKEN"))
    except Exception as error:
        # 任意HTTP异常可能包含签名URL，报告和日志仅输出受控消息或异常类型。
        report = {"ok": False, "readOnly": True, "localDeletionPerformed": False, "error": str(error) if isinstance(error, VerificationError) else type(error).__name__}
    output = Path(arguments.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": report["ok"], "verifiedSourceCount": len(report.get("verifiedSources", [])), "localDeletionPerformed": False, **({"error": report["error"]} if not report["ok"] else {})}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

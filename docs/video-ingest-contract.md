# 视频上传实现契约

本文件记录 2026-11-12 已批准方案的实现边界和跨项目接口。不执行 Git 提交、推送或创建分支。前端 wallpaper-gallery 当前由用户修改，暂不改动。

## 分工

- 工作台界面：`src/features/video-ingest/**`、`src/views/VideoUploadView.vue`、工作台路由和导航。
- 控制服务：`worker/video/**`、`wrangler.video.toml`、D1 migration；由主代理实现。
- 工作流：workflow 仓库新增 `scripts/video/**`、视频工作流，含处理、发布、JSON 生成。
- 旧链兼容：图床仓库排除视频自动写入；workflow 原有静态脚本统计合并与失败传播。

## HTTP 契约

工作台使用 `VITE_VIDEO_API_URL`（无值则入口显示尚未配置），所有业务请求 `Authorization: Bearer <现有GitHub token>`。Worker 独立验证配置仓库写权限。JSON 错误 `{error:{code,message}}`。

- `POST /video/jobs` body `{filename,size,sha256,contentType,idempotencyKey}` -> job（下述结构）；上限 250000000 字节，分块 8388608 字节。
- `GET /video/jobs` -> `{jobs:[job]}`；`GET /video/jobs/:id` -> job。返回任务时给结果资源增加短期 `url`；不持久化签名URL。
- `GET /video/topics` -> `{topics:[string]}`，从目标仓库metadata/video.json读取现有视频主题；失败不阻断工作台人工填写。
- `GET /video/jobs/:id/upload` -> `{uploadId,partSize,parts:[{partNumber,etag,size}]}`。
- `POST /video/jobs/:id/upload/parts` body `{partNumbers:[1,2]}` -> `{parts:[{partNumber,url}]}`。
- `POST /video/jobs/:id/upload/complete` body `{parts:[{partNumber,etag}]}` -> job；服务端核验分块及对象大小。
- `POST /video/jobs/:id/ai/claim` body `{revision}` -> `{leaseToken,revision}`；`POST /video/jobs/:id/ai/release` body `{leaseToken}`。
- `PATCH /video/jobs/:id/review` body `{revision,review,leaseToken?}` -> job；人工编辑无需AI租约，AI写回必须携带租约且 `review.ai` 包含 `frameId`。
- `POST /video/jobs/:id/retry` -> job（发布失败通过 publication 重试，不重新处理）。
- `POST /video/publications` body `{jobs:[{id,revision}]}` -> publication；只允许 awaiting_review、审核字段完整且封面合法的任务，冻结审核版本。
- `GET /video/publications/:id` -> publication；`POST /video/publications/:id/retry` -> publication。

job: `{id,owner,status,revision,filename,size,sha256,contentType,createdAt,updatedAt,error?,result?,review?,publicationId?}`。
状态：`uploading, queued, processing, awaiting_ai, awaiting_review, publishing, published, failed, expired`。
result: `{download:{key,size,contentType,sha256},preview:{key,size,contentType,sha256},frames:[{id,key,thumbnailKey,timestamp,score,url?,thumbnailUrl?}],defaultFrameId,metadata:{width,height,duration,size,format:'mp4',codec,...}}`。
review: `{selectedFrameId,usage:'desktop'|'mobile'|'social-cover',topic,filename,displayTitle,description,keywords:[],ai?:{frameId,model,confidence,analyzedAt}}`。
publication: `{id,status,revision,jobs:[frozenJob],createdAt,updatedAt,metadataCommitSha?,deploymentId?,error?}`；状态 `queued,publishing,deploying,published,failed`。

## Actions 内部 API

使用 `X-Video-Service-Token: <VIDEO_SERVICE_TOKEN>`，凭据仅保存在 Actions/Worker secrets。

- `POST /internal/video/claim` body `{kind:'process'|'publish',runId}` -> `{task:null}` 或 `{task:job或publication,leaseToken}`；每种 kind 全局最多一个运行任务，原子领取。
- `POST /internal/video/jobs/:id/heartbeat` body `{leaseToken}`；publication 使用 `/internal/video/publications/:id/heartbeat`。
- `GET /internal/video/jobs/:id/source?leaseToken=...` -> `{url}`（短期源对象下载地址；不要把URL输出到日志）。
- 源响应可附带 `checkpoint:{result,objects:[{key,url,size}]}`，仅包含已上传且HEAD大小验证通过的私有处理产物；runner下载验证hash后复用。`POST /internal/video/jobs/:id/checkpoint` body `{leaseToken,result}` 在计算后、上传前持久化结果清单；禁止把原片放公共Actions cache。
- `POST /internal/video/jobs/:id/objects` body `{leaseToken,objects:[{key,contentType}]}` -> `{objects:[{key,url}]}`，只签名本任务 `jobs/<id>/...` 私有暂存对象 PUT。
- `POST /internal/video/jobs/:id/complete` body `{leaseToken,result}` -> job；Worker核验对象并生成默认review，status=awaiting_ai。
- `POST /internal/video/jobs/:id/fail` body `{leaseToken,stage,message}` -> job。
- `POST /internal/video/publications/:id/progress` body `{leaseToken,status:'publishing'|'deploying',metadataCommitSha?,deploymentRunId?}`；deploymentRunId是GitHub Actions运行ID。
- `POST /internal/video/publications/:id/complete` body `{leaseToken,metadataCommitSha,deploymentId,dataSha}` -> publication，全部任务 published。
- `deploymentId` 必须是实际Pages部署ID，`dataSha`为实际部署的完整数据快照。gallery成功后生成 `video-publication-result` artifact（publication-result.json）：`{publicationId,minimumDataRef,dataSha,pagesDeploymentId}`；publisher校验它包含最低版本并读取真实结果，不能用请求SHA冒充实际部署SHA。
- `POST /internal/video/publications/:id/fail` body `{leaseToken,stage,message}` -> publication，保留已完成阶段。
- `POST /internal/video/publications/:id/objects` body `{leaseToken,objects:[{sourceKey,key,contentType,size}]}` -> `{objects:[{sourceKey,sourceUrl,key,url}]}`；限定冻结任务正式路径，sourceURL暂存GET、url正式桶PUT；用于发布器流式复制并HEAD确认。`POST .../verify` body `{leaseToken,objects:[{key,size,contentType}]}` -> `{ok:true}`。
- `POST /internal/video/publications/:id/mirrors` body `{leaseToken,objects:[{key,contentType}]}` -> `{objects:[{key,url}]}`；仅允许 data/video.json、data/video/\*\*。

回调 HTTP 响应非2xx必须使任务失败。Actions processing执行单个任务后可继续领取，最长单视频30分钟；定时补扫持久队列。

## 媒体与发布契约

私有素材前缀 `jobs/<jobId>/`，最终路径 `wallpaper/video/<usage>/<topic>/<审核文件名去扩展名>-<jobId前8字符>.mp4`，预览同路径替换根目录为preview，缩略图根目录thumbnail且webp。文件名由服务端规范化、路径段禁止遍历；冻结后的路径不可改变。

下载MP4保原分辨率时长，兼容H264 yuv420p优先copy，其他CRF18；音轨必要时AAC；预览长边<=1920不放大、CRF24静音faststart；5帧候选10/30/50/70/90%，480px WebP缩略图。

视频JSON生成器只合并metadata/video.json与完整已发布视频数据，保留旧条目、未知字段、路径和稳定身份，不扫描本地文件。编码沿用图床v1 envelope。仅定点合并stats.video。正式对象全部验收后，乐观并发一次提交相关JSON；冲突重新读取合并。镜像显式PUT。再触发gallery deploy workflow（inputs: publication_id, minimum_data_ref），真实部署成功才published。新视频metadata/data写入publicationId与publicationJobCount，部署验证完整批次以及分类/full/latest全部记录字段一致；metadata持久化storage:r2、previewPath、thumbnailPath，旧记录逐字段保持。

## 执行记录

- 基线：studio/workflow/图床干净；gallery存在用户未提交修改，用户要求暂不动该项目。
- 用户测试素材 `/Users/nuanxinpro/Downloads/发光-宝可梦.mp4`，约13MB。
- 首先执行本地真实FFmpeg及接口集成测试；真实云端验证前明确区分已具备配置与需要创建的基础设施，保留原始测试素材。

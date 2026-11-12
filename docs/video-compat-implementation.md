# 视频发布旧链兼容实现记录

日期：2026-11-12。依据 `docs/video-ingest-contract.md` 的已批准边界执行。此次只修改图床 `scripts/`、图床 `sync-all.yml` 和 workflow 原有静态脚本；未修改 gallery、已发布 metadata/data、媒体文件，也未执行提交、推送、分支、部署或生产 API。

## 写入范围

- 图床 `scripts/process-metadata.js` 不再加载或保存 `metadata/video.json`；两份静态生成器均仅处理 desktop/mobile/avatar，不重新扫描或生成 `data/video.json` 与 `data/video/**`。保留原有视频字节内容。
- 图床 `scripts/generate-data.js` 移除 video 系列扫描，保留原有静态图片和 Bing 行为；`update-timestamps.sh` 仅扫描静态系列，保留已有视频时间戳。
- 图床 `scripts/upload-r2.sh` 普通与 `--full` 同步均排除各媒体根目录下的 `video/*`；上传失败返回非零，停止完成输出。
- 图床 `sync-all.yml` 的变更检测和媒体暂存仅覆盖静态系列与 Bing；metadata/data 暂存排除视频。JSON 镜像排除 `video.json`、`video/*`，不再单独 PUT 视频 latest。
- 旧 `process-metadata.js` 对 video 和其他未知 pending 系列明确报错；先校验整个文件，再处理内容。未知文件不会被静默删除，当前流程也不会把错误传播为成功。

## 统计、回滚与失败传播

- 两份 metadata 生成器只合并所负责系列的 count/categories 和 total；保留 `stats.total`、`stats.series` 中 video/Bing/未知系列及扩展字段，同时保留顶层未知字段、发布历史和自身系列的扩展字段。原 stats 无法解析时直接失败，避免覆盖。
- workflow `publish-release.sh` 的 jq/Node 两条分支均合并静态 total；Node 分支不再截断其他系列的历史记录。
- workflow `rollback.sh` 只移除目标 tag 的静态时间戳、静态空目录和 release.added 中的静态字段。视频/Bing/未知贡献和未知发布字段保留；存在其他系列贡献时保留共享 tag/Release。纯静态发布仍执行原来的 tag/Release 清理。
- rollback 的提交、推送、远程 tag 删除及 Release 删除失败均中止；不再用宽泛的成功提示掩盖失败。
- `create-tag.sh` 复用本地 tag 前确认提交与 tag 推送成功，避免上次推送失败后重试时误判成功。
- `sync-all.yml` 在执行 R2 和 Release 前完成图片、metadata/data、stats 与 tag 的所有推送。JSON 镜像先于 Release。Git 冲突直接失败，交由重新运行；未增加强推或自动丢弃远端修改。

## 回归验证

命令：

```sh
node --test "/Users/nuanxinpro/frontProject/gihtub/wallpaper/nuanXinProPic/scripts/tests/static-video-boundary.test.cjs"
```

测试全部使用 `mkdtemp` fixture。Git、gh、AWS 外部边界使用本地可执行替身，不执行实际提交/推送/R2 请求；旧 `/tmp` 交接路径重定向到 fixture。图片/元数据/脚本逻辑仍运行真实实现。

已观察失败再修复：首轮 11 项均因目标缺陷失败，随后补入的 3 项 sync-all 场景均失败；另观察到本地 tag 恢复误成功、混合 Release 被删除、Node 后备分支截断历史的独立失败，修复后通过。保留静态 AI pending 消费及图片 JSON 输出的正常路径验证。

最终覆盖 20 项：两仓强制生成保留视频与扩展统计；两仓拒绝 video/未知 pending；两仓正常静态 AI 元数据消费；独立扫描保留视频输出和时间戳；普通/全量 R2 排除视频；回滚推送成功/失败时保留混合发布；jq/Node 发布保留其他系列与历史；sync-all metadata 推送失败阻断 R2/Release、JSON 镜像排除视频、stats 推送失败阻断；本地 tag 恢复拒绝推送；R2 失败中止。

另通过 `bash -n`、`node --check`、YAML AST 解析、sync-all 的全部 17 个 run block 的 Bash 语法检查，以及两仓 `git diff --check`。这些是本地兼容性验证，不代表 Actions 或真实云端端到端发布已经验证。

## gallery 后续接入位置（本次只读）

- `.github/workflows/deploy.yml`：目前 `workflow_dispatch` 没有输入，图床 checkout 跟随默认分支，concurrency 为 pages 且会取消前序任务。后续增加契约要求的 `publication_id`、`minimum_data_ref`，检出并核验指定提交或包含它的更新提交，避免部署到更旧的数据。部署成功返回关联 publication 的确切 deployment ID，不能仅凭 dispatch 成功标记 published。
- 同文件 `Copy data from image repository` 已复制 video 的单文件和分类目录，可以沿用；需保证复制的数据来自已核验的 metadata 提交。
- `scripts/sync-data.js` 已支持 video 的 index/latest/分类及旧单文件下载；fallback 同样需要避免回退到早于最低提交的数据。
- `src/utils/config/constants.js` 的 video 配置读取随站构建的 `data/video/**`，媒体使用 R2 路径；建议部署产物输出 publication ID、数据提交 SHA 和 data hash 的只读清单，供发布器做真实部署验收。
- `scripts/sync-wallpaper-assets.js` 已将 video 纳入索引；`src/components/wallpaper/VideoWallpaperPlayer.vue`、`VideoWallpaperModal.vue`、`VideoPortraitDesktopModal.vue`、`src/router/index.js` 具有现有视频入口。后续前端提交完成后，围绕新增封面、previewPath、稳定身份和用途字段做端到端验证。

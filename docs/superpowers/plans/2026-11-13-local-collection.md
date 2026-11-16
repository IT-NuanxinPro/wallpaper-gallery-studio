# 本地素材采集与 Studio 衔接实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development for the isolated Python bridge task and task review; integrate and verify the local UI against this contract.

**Goal:** 本机开发模式提供素材采集、批次导入、远端上传核验与明确授权后的本地清理。生产构建不提供菜单、路由或本地代理。

**Architecture:** Vite 开发中间件按需启动 Python 桥接进程，复用独立 fetch-wallpaper 的采集器、SQLite 和批次清理。浏览器只访问同源 /\_\_local-collector；桥接器用进程密钥和本机检查限制访问。图片通过现有 Studio AI 上传流程，元数据提交后发送可恢复回执，Python 独立验证 GitHub 指定提交下的图片内容和元数据后清理。

**Tech Stack:** Vue / Pinia / Vite / Node.js / Python 标准库及现有 fetch-wallpaper 依赖。
**Spec:** 本文件以下约束及本次用户批准的本地独占菜单要求。

## Global Constraints

- 本次不提交、推送或部署；不改工作流和画廊，不执行真实采集、上传或删除用户图片。
- 当前工作树直接增量修改；不创建分支。已有 5174 服务由用户持有，不主动停止。
- 项目路径只通过被忽略的 .env.local 的 WALLPAPER_COLLECTOR_DIR 配置。
- 生产 import.meta.env.DEV 为 false；本地入口还要校验浏览器 loopback 主机名。代理仅接受 loopback socket 和匹配 Host/Origin，写请求要求自定义同源头。
- bridge 仅通过 server/local-collector/bridge.py 加载现有 Python 项目，不修改其原界面和数据结构；新关联存在既有批次 payload 的 studio 字段。
- “上传核验完成”只说明图片及 metadata-pending 在指定远端提交存在，不声称网站部署完成。
- 原图 SHA-256 与压缩后上传 SHA-256 分别记录。失败/未证实/文件变更不能清理。清理需要批次明确授权，默认关闭自动清理。
- 图片导入有界顺序读取、验证源哈希、保留批次身份；不将全部 Blob 持久缓存。
- GitHub token 只在当前请求使用，不写 SQLite、日志、浏览器回执队列或 URL。

## Task 1: Python 桥接与回执核验

Files: server/local-collector/bridge.py, server/local-collector/test_bridge.py。
CLI: python bridge.py --project DIR --port 0；环境 STUDIO_COLLECTOR_SECRET。启动 stdout 单行 JSON {port}。
所有接口要求 X-Studio-Bridge 等于秘密。/health 返回 {ok,collectorId,outputRoot}。
GET /platforms /sources /status /files /runs /batches；返回兼容原 API 的数据。
GET /image 与 /thumbnail 使用 batchId + itemId，或 platform + source + itemId，不允许任意文件路径。
POST /start /stop /batches/create 复用采集接口。
POST /batches/policy {batchId,autoCleanup,confirmed}。
POST /batches/receipt {batchId,collectorId,repository:{owner,repo,branch},metadata:{path,commitSha},items:[{sourceItemId,sourceSha256,uploadedSha256,uploadedPath}]}；X-GitHub-Token 只读校验 api.github.com，禁止重定向。
metadata images 对应项的 localSource = {collectorId,batchId,sourceItemId,sha256}，匹配原始来源；图片 raw SHA256 匹配 uploadedSha256。
POST /batches/clean {batchId,confirmed}，全批远端核验和本地预检通过后调用既有 complete。
batch.studio = {repository,receipts,autoCleanup,verifiedCount,readyToClean}；items 保留原样。

- [x] 先写临时目录单测：缺授权/部分回执/内容改变/远端失败不删，压缩后不同哈希可以准确映射，重试幂等，仓库错配阻止。
- [x] 实现受限桥接和异常固定消息，全部既有 Python 测试回归。

## Task 2: 本地开发入口

Files: server/local-collector/plugin.mjs, server/local-collector/plugin.test.mjs, vite.config.js, src/features/local-collection/availability.js。

- [x] 测试生产不加载代理、LAN/恶意 Origin 被拒、启动失败可重试和关闭清理子进程。
- [x] 按需启动桥接，不占用现有 8765；Vite 停止时只关闭自己的子进程。
- [x] 配置示例和本机 .env.local 添加服务目录，保持其余配置原样。

## Task 3: 原生采集页面与导入

Files: src/features/local-collection/api.js, importer.js, LocalCollectionView.vue, CollectionControls.vue, CollectionBatches.vue, collection.scss, src/router/index.js, src/components/MainLayout.vue。

- [x] 本地独占路由/导航；沿用固定外壳、局部滚动和统一下拉组件。
- [x] 采集参数、状态、批次/历史、图库、下载记录；断连有重连按钮，错误即时反馈。
- [x] 批次导入通过 /upload?localBatch=ID，进入后读取源文件并核验后走现有 AI；重复导入跳过，换仓库/离开时中止。

## Task 4: 上传回执与清理衔接

Files: src/features/local-collection/receipts.js, LocalCollectionStatus.vue, src/stores/upload.js, src/features/upload-workspace/application/create-upload-file-lifecycle-service.js, create-upload-session-service.js, src/views/UploadView.vue。

- [x] 保留 localSource；metadata 记录来源与提交 SHA。远端构建不引入本地模块。
- [x] 非敏感回执持久化并可在采集页重试；失败不将已上传图片标成失败。
- [x] 本地清理前明确确认。自动清理仅限勾选并确认的批次，全部回执核验后触发。

## Task 5: 验收

- [x] Python 临时素材闭环（使用模拟 GitHub，不接触真实图片清理）。
- [x] Vitest、Node 代理测试、lint、生产 build 与 secrets 检查。
- [x] 浏览器：本地菜单/采集批次/导入/断连/整页无滚动/清理授权；生产无菜单且不能直接访问本地路由。
- [x] 总结可运行方式、未实施的服务器部署范围和真实上传尚未执行的边界。

## 后续用户调整与验收记录

用户要求修复原采集器续批并将2026-11-13批次导入AI分析，停在审核页，禁止实际上传/清理。原项目三个源码文件备份到/tmp/studio-collector-source-backup-20261113，新增先补尾批再顺延算法，61项测试通过。Studio导入会锁定studio.importedAt，防止审核中批次被新增采集修改。旧实际批次不迁移。原本仅模拟的限制由此调整为允许指定30张图片实际AI分析，GitHub上传和清理仍不执行。

本地模式当前限npm run dev+loopback；生产构建扫描未包含local-collection或\_\_local-collector。回执核验从上传UI解耦异步运行，避免阻塞审阅。

## 2026-11-16 用户修订（覆盖上述清理规则）

从采集入口导入的批次默认自动清理；上传列表移除的图片记为舍弃，保留项的图片和元数据全部成功提交后自动删除整批本地文件。手动清理不再依赖远端核验，明确确认后可清理任意待处理批次；全舍弃批次只手动清理。新增discard端点并持久化操作队列，AI任务恢复保留localSource，默认批次30。真实用户素材不用于本轮清理测试。仓库关联表单完成自动识别、列表选择及保存验收，代码继续保留待提交状态。

用户再次修订：不记录舍弃/已删除条目，删除图片即删除本地文件并剔除batch.items及manifest记录；列表和详情按本地实际文件过滤数量。新增批次预览、单/多选删除；旧discard ledger方案废弃。

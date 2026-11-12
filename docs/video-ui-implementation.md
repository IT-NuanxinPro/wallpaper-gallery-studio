# 视频工作台实现记录

日期：2026-11-12。依据 `docs/video-ingest-contract.md` 实现，仅涉及 Studio 视频功能、路由导航与环境变量示例。本记录描述前端验证范围，不代表生产视频处理、R2 或站点部署已完成验收。

## 文件与职责

| 文件                                             | 职责                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/features/video-ingest/domain.js`            | 250 MB 源文件约束、扩展名和路径段校验、增量 SHA-256、审核草稿与发布前校验、状态和格式化 |
| `src/features/video-ingest/api.js`               | 独立视频 API 客户端；复用登录 token；统一结构化错误及 409 冲突                          |
| `src/features/video-ingest/uploader.js`          | 文件与分块并发、服务端分块恢复、源文件一致性校验、签名 PUT、ETag、重试、取消和进度      |
| `src/features/video-ingest/review-service.js`    | 所选云端帧转 Base64、现有 classifier 调用、AI 租约领取/释放和带版本写回                 |
| `src/features/video-ingest/workspace.js`         | 云端任务列表恢复和轮询、审核草稿、冲突处理、批量发布与发布重试、发布 ID 恢复            |
| `src/features/video-ingest/VideoReviewPanel.vue` | 视频预览、5 帧候选封面、AI 模型选择、人工审核表单与冲突动作                             |
| `src/views/VideoUploadView.vue`                  | 页面编排：拖放/选择、暂停/续传、列表筛选、任务详情、批量发布进度                        |
| `src/features/video-ingest/*.test.js`            | 业务及交互测试                                                                          |
| `src/router/index.js`                            | 需要登录的 `/video-upload` 路由                                                         |
| `src/components/MainLayout.vue`                  | 视频导航入口；900 px 以下导航分两行，防止入口溢出                                       |
| `.env.example`                                   | 可选 `VITE_VIDEO_API_URL` 示例，默认留空                                                |

业务服务不依赖页面组件；接口、上传和 AI 通过参数注入，便于测试真实的状态与副作用。沿用 MainLayout、GlassCard、Element Plus 及现有紫色玻璃视觉，不改变静态上传业务。

## 已实现行为

- 未配置 `VITE_VIDEO_API_URL` 时保留视频入口，页面显示“视频服务尚未配置”，不发送视频业务请求。
- 复用 `useAuthStore().token` 与现有仓库权限检查；Worker 仍独立鉴权。签名 PUT/GET 不携带 GitHub token。
- 接受 MP4、AVI、FLV、MOV、M4V、WebM、MKV。即使浏览器未提供 FLV MIME 仍可选择；伪装成 video MIME 的其他扩展名会被拒绝。最大大小 250000000 字节。
- 使用 `@noble/hashes` 对 8388608 字节切片顺序增量散列。每个切片后让出主线程，可暂停。没有整文件 `arrayBuffer()`，没有 IndexedDB 视频 Blob 缓存。
- 同时最多处理 2 个文件，所有文件合计最多并行 3 个 PUT 分块。该实现比“每个文件 3 分块”更保守，已用并发测试确认上限。
- 重选源文件时重新验证大小和 SHA-256，错误文件在获取上传清单前即被拒绝。使用服务端 partSize 与已完成 parts，核对 partNumber、size、ETag 后只上传缺块。
- 分块失败最多尝试 3 次，每次重新请求短期上传 URL。完成请求的 parts 按编号排序。ETag 不可读取会明确提示检查桶 CORS。
- 暂停、网络失败、离开页面都不会删除服务端分块；重新进入后从服务端列表恢复，重选源文件即可继续。请求幂等键在创建任务时独立生成，避免使用永久内容散列阻止过期任务重新上传。
- 每 5 秒串行刷新，页面隐藏时暂停轮询；手动刷新可重获短期资源地址。播放预览不因后台 URL 刷新而被周期性打断。
- 显示视频尺寸、时长、大小、codec 和全部候选帧，保存真实 frameId。帧加载失败可刷新资源地址。
- 已有视频主题通过 `GET /video/topics -> {topics:[]}` 读取，由控制服务从目标仓库 `metadata/video.json` 合并 topic/subcategory，不读取本地媒体树。初次进入和手动刷新时加载，5秒任务轮询不反复请求分类。前端去重并过滤空值；分类读取失败保留已加载候选，显示非阻断提示，人工输入始终可用。删除了图片静态 `CATEGORIES` 对视频主题候选的依赖。
- AI 模型来自现有 classifier 配置，凭证来自 `useCredentialsStore()`；没有增加密钥手填框。下载所选云端帧后，通过 `analyzeImage({imageBase64,...})` 分析。AI 分析领取租约，使用领取后 revision 和 leaseToken 写回，最终释放租约。分类建议优先按第三/第二分类精确匹配现有视频主题；未匹配时保留原主题，避免把静态图片分类猜测写成新视频分类。仅在无现有候选且原主题为空时采用 classifier 建议。
- 所选帧在发送AI前复用 `compressImage(blob, IMAGE_CONFIG)` 压到长边1024像素、JPEG质量0.9；完整私有候选图仍用于审核，不直接把4K图发送模型。新增依赖注入测试确认压缩配置与对象请求不携带业务token；此补充后视频23项测试、ESLint和构建通过，未重跑整套UI浏览器检查。
- 审核可以完全人工完成。编辑用途、主题、MP4 文件名、标题、描述和关键词；更换封面后人工保存会移除旧帧 AI 标记。
- 轮询版本变化不覆盖未保存草稿；409 后刷新远端，显示版本冲突，允许采纳远端或显式基于最新版本重新提交本地草稿。切换任务会保留各任务草稿，离开时提示未保存内容。
- 仅允许审核完整的 awaiting_review 任务批量发布，每批最多 30 个，冻结已保存 revision。有未保存草稿的所选任务会阻止发布。
- 发布显示排队、对象写入、部署、完成阶段，以及 metadataCommitSha/deploymentId。发布失败从 publication 重试，不重新处理源视频。
- 浏览器 localStorage 仅保留按登录用户隔离的 publication ID 清单（最多100个）；刷新后也从 job.publicationId 恢复。没有持久化签名 URL、源视频或额外凭据。

## 测试与构建证据

按先测试后实现执行：业务实现尚缺失时，上传/AI 测试观察到 8 项失败；工作台恢复测试观察到 3 项失败；后续关键词分隔符、FLV 接受/伪 MIME、未保存草稿、30 项上限、轮询不打断播放等回归用例均先观察失败再修复。

最终执行：

```text
npx vitest run src/features/video-ingest
Test Files  3 passed (3)
Tests       22 passed (22)

npx vitest run src
Test Files  13 passed (13)
Tests       62 passed (62)

npx eslint src/features/video-ingest src/views/VideoUploadView.vue src/router/index.js src/components/MainLayout.vue
exit 0，无错误或警告

npm run build
exit 0，1637 modules transformed，生产包生成成功
```

构建仍报告原有 `task-runner.js` 静态/动态导入混用提示，以及 Element Plus chunk 大于600 KB提示；本次未扩大范围调整依赖拆包。

主题接口补充也按测试优先执行：先观察 4 项失败（缺少 getTopics/loadTopics、静态主题候选不符、AI未匹配已有主题），实现后22项视频测试及62项全量测试通过。覆盖现有分类鉴权请求、候选去重与读取失败降级、人工输入、AI优先具体主题匹配及保留原分类。

Impeccable 机械扫描一次执行，结果 `[]`。按任务边界未创建额外设计文档或派生审查代理，界面采用当前线程实际浏览器自检。

## 本地浏览器检查

使用独立 Playwright 会话、模拟 GitHub 权限和本地视频 API，未调用生产视频 API、AI API 或真实对象存储。检查 1365 × 900 桌面及 390 × 844 窄屏：

- 实际渲染任务列表、处理等待状态、5 帧、模型列表、审核表单、发布批次。
- 选择第4帧，修改标题，保存审核；勾选任务并提交发布，批次从 queued 更新至 deploying；重新加载页面后仍恢复发布进度。
- 构建预览未设置视频 URL 时，确认配置提示、禁用刷新与返回图片上传入口。
- 最终窄屏测量：documentWidth=390，与 viewport=390 一致；导航宽度358、内容356；5个候选帧存在。
- 浏览器控制台检查：0 errors / 0 warnings。

截图保存在 `output/playwright/video-ui/`：`desktop.png`、`mobile.png`、`desktop-review.png`、`mobile-review.png`、`unconfigured.png`。这些是本地模拟任务界面证据，不是云端处理成功证据。

## 待真实环境验收

- 真实视频 Worker/D1/R2、桶 CORS 与 ETag 暴露、签名 URL、网络中断恢复，需要结合控制服务和真实素材联调。
- 真实 classifier 服务调用、跨标签页并发 AI 租约冲突、发布 workflow 与最终站点部署状态，需要在配置具备后验证。
- 此实现未执行 Git 提交、推送、创建分支或部署；未修改 gallery 前端、workflow 仓库和图床仓库。
